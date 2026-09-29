// Assemble les workflows n8n à partir du code des nœuds (src/). Usage : node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`./src/${f}`, import.meta.url), 'utf8');
const out = (f, wf) => writeFileSync(new URL(`./workflows/${f}`, import.meta.url), `${JSON.stringify(wf, null, 2)}\n`);

const ID_DIGEST = 'digestpipeline01';
const ID_DIFFUSION = 'digestdiffslack1';
const ID_ALERTE = 'digestalerteerr1';

const RETRY = { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 };
const code = (name, file, position, extra = {}) => ({
  parameters: { jsCode: src(file) }, name, type: 'n8n-nodes-base.code', typeVersion: 2, position, ...extra,
});
const affectation = (name, type, value) => ({ id: name, name, type, value });
const lien = (...cibles) => ({ main: cibles.map((c) => (c ? [{ node: c, type: 'main', index: 0 }] : [])) });

const SOQL_OPPORTUNITES = `SELECT Id, Name, Account.Name, Owner.Name, StageName, Amount,
       CloseDate, CreatedDate, LastActivityDate, LastStageChangeDate
FROM Opportunity
WHERE IsClosed = false AND CloseDate = THIS_FISCAL_QUARTER`;

// ───────────── WF1 : Digest pipeline commercial ─────────────
const digest = {
  id: ID_DIGEST,
  name: 'Digest pipeline commercial (Salesforce → Slack)',
  active: false,
  nodes: [
    {
      parameters: { content: src('specs.md'), width: 760, height: 1700, color: 7 },
      name: 'Specs', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-900, -700],
    },
    {
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 9 * * 1-5' }] } },
      name: 'Chaque jour ouvré à 9h', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0],
    },
    { parameters: {}, name: 'Lancement manuel (tests)', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 200] },
    {
      parameters: {
        assignments: {
          assignments: [
            affectation('seuilRetardJours', 'number', 180),
            affectation('seuilInactiviteJours', 'number', 180),
            affectation('devise', 'string', 'EUR'),
            affectation('inclureLundiPentecote', 'boolean', true),
            affectation('modeDiffusion', 'string', 'slack_app'),
            affectation('canalSlackId', 'string', 'C0XXXXXXXXX'),
            affectation('emailCanal', 'string', ''),
            affectation('emailExpediteur', 'string', 'n8n@entreprise.fr'),
            affectation('dateReferenceForcee', 'string', ''),
          ],
        },
        options: {},
      },
      name: 'Configuration', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [240, 100],
      notes: "Seul endroit à modifier. L'heure d'envoi se règle dans le déclencheur. dateReferenceForcee (AAAA-MM-JJ) sert uniquement aux tests.",
    },
    code('Vérifier jour férié', 'verifier-jour-ferie.js', [480, 100]),
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{
            id: 'jour-ouvre', leftValue: '={{ $json.estJourOuvre }}', rightValue: '',
            operator: { type: 'boolean', operation: 'true', singleValue: true },
          }],
          combinator: 'and',
        },
        options: {},
      },
      name: 'Jour ouvré ?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [720, 100],
    },
    { parameters: {}, name: 'Fin : pas d\'envoi aujourd\'hui', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [960, 260] },
    {
      parameters: { resource: 'search', operation: 'query', query: SOQL_OPPORTUNITES },
      name: 'Lire opportunités Salesforce', type: 'n8n-nodes-base.salesforce', typeVersion: 1, position: [960, 0],
      alwaysOutputData: true, ...RETRY,
      notes: 'Aucun seuil ici : le périmètre seulement. alwaysOutputData garde le flux vivant quand le pipeline est vide.',
    },
    {
      parameters: { resource: 'search', operation: 'query', query: 'SELECT MasterLabel, SortOrder FROM OpportunityStage WHERE IsActive = true' },
      name: 'Lire ordre des étapes', type: 'n8n-nodes-base.salesforce', typeVersion: 1, position: [1200, 0],
      executeOnce: true, alwaysOutputData: true, ...RETRY,
    },
    code('Calculer indicateurs', 'calculer-indicateurs.js', [1440, 0], { executeOnce: true }),
    code('Générer rapport HTML', 'generer-rapport-html.js', [1680, 0]),
    code('Rédiger résumé Slack', 'rediger-resume.js', [1920, 0]),
    {
      parameters: {
        source: 'database',
        workflowId: { __rl: true, mode: 'id', value: ID_DIFFUSION },
        options: { waitForSubWorkflow: true },
      },
      name: 'Diffuser (sous-workflow)', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: [2160, 0],
    },
  ],
  connections: {
    'Chaque jour ouvré à 9h': lien('Configuration'),
    'Lancement manuel (tests)': lien('Configuration'),
    Configuration: lien('Vérifier jour férié'),
    'Vérifier jour férié': lien('Jour ouvré ?'),
    'Jour ouvré ?': lien('Lire opportunités Salesforce', 'Fin : pas d\'envoi aujourd\'hui'),
    'Lire opportunités Salesforce': lien('Lire ordre des étapes'),
    'Lire ordre des étapes': lien('Calculer indicateurs'),
    'Calculer indicateurs': lien('Générer rapport HTML'),
    'Générer rapport HTML': lien('Rédiger résumé Slack'),
    'Rédiger résumé Slack': lien('Diffuser (sous-workflow)'),
  },
  settings: { executionOrder: 'v1', timezone: 'Europe/Paris', errorWorkflow: ID_ALERTE, saveManualExecutions: true },
  pinData: {},
};

// ───────────── WF2 : Diffusion Slack (partie isolée) ─────────────
const diffusion = {
  id: ID_DIFFUSION,
  name: 'Digest pipeline · Diffusion Slack',
  active: false,
  nodes: [
    {
      parameters: { inputSource: 'passthrough' },
      name: 'Reçu du digest', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1, position: [0, 100],
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
          conditions: [{
            id: 'mode-slack', leftValue: '={{ $json.modeDiffusion }}', rightValue: 'slack_app',
            operator: { type: 'string', operation: 'equals' },
          }],
          combinator: 'and',
        },
        options: {},
      },
      name: 'Mode d\'envoi : app Slack ?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [240, 100],
    },
    {
      parameters: {
        resource: 'file',
        operation: 'upload',
        binaryPropertyName: 'rapport',
        options: {
          channelId: '={{ $json.canalSlackId }}',
          fileName: '={{ $json.fichierNom }}',
          initialComment: '={{ $json.texte }}',
          title: '={{ $json.titre }}',
        },
      },
      name: 'Publier dans le canal Slack', type: 'n8n-nodes-base.slack', typeVersion: 2.3, position: [480, 0], ...RETRY,
      notes: 'App Slack : scopes chat:write et files:write. Inviter le bot dans le canal privé.',
    },
    {
      parameters: {
        fromEmail: '={{ $json.emailExpediteur }}',
        toEmail: '={{ $json.emailCanal }}',
        subject: '={{ $json.titre }}',
        emailFormat: 'text',
        text: '={{ $json.texte }}',
        options: { fileAttachments: 'rapport', appendAttribution: false },
      },
      name: 'Envoyer au canal par email', type: 'n8n-nodes-base.emailSend', typeVersion: 2.1, position: [480, 200], ...RETRY,
      notes: 'Repli : adresse email du canal Slack. SMTP interne uniquement, jamais un service externe.',
    },
  ],
  connections: {
    'Reçu du digest': lien('Mode d\'envoi : app Slack ?'),
    'Mode d\'envoi : app Slack ?': lien('Publier dans le canal Slack', 'Envoyer au canal par email'),
  },
  // Pas de workflow d'erreur ici : l'échec remonte au digest, qui alerte une seule fois.
  settings: { executionOrder: 'v1', timezone: 'Europe/Paris', callerPolicy: 'workflowsFromSameOwner' },
  pinData: {},
};

// ───────────── WF3 : Alerte échec digest ─────────────
const alerte = {
  id: ID_ALERTE,
  name: 'Digest pipeline · Alerte échec (responsable)',
  active: false,
  nodes: [
    { parameters: {}, name: 'En cas d\'échec du digest', type: 'n8n-nodes-base.errorTrigger', typeVersion: 1, position: [0, 0] },
    {
      parameters: {
        assignments: {
          assignments: [
            affectation('emailResponsable', 'string', 'responsable@entreprise.fr'),
            affectation('emailExpediteur', 'string', 'n8n@entreprise.fr'),
          ],
        },
        includeOtherFields: true,
        options: {},
      },
      name: 'Configuration alerte', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [240, 0],
    },
    code('Formater alerte sans données', 'formater-alerte.js', [480, 0]),
    {
      parameters: {
        fromEmail: "={{ $('Configuration alerte').first().json.emailExpediteur }}",
        toEmail: "={{ $('Configuration alerte').first().json.emailResponsable }}",
        subject: '={{ $json.sujet }}',
        emailFormat: 'text',
        text: '={{ $json.corps }}',
        options: { appendAttribution: false },
      },
      name: 'Prévenir le responsable', type: 'n8n-nodes-base.emailSend', typeVersion: 2.1, position: [720, 0], ...RETRY,
    },
  ],
  connections: {
    'En cas d\'échec du digest': lien('Configuration alerte'),
    'Configuration alerte': lien('Formater alerte sans données'),
    'Formater alerte sans données': lien('Prévenir le responsable'),
  },
  settings: { executionOrder: 'v1', timezone: 'Europe/Paris' },
  pinData: {},
};

out('01-digest-pipeline-commercial.json', digest);
out('02-diffusion-slack.json', diffusion);
out('03-alerte-echec-digest.json', alerte);
console.log('3 workflows générés dans workflows/');
