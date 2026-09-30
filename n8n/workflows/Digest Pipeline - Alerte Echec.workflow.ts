const en_cas_d_chec_du_digest = trigger({
  type: 'n8n-nodes-base.errorTrigger',
  version: 1,
  config: { name: 'En cas d\'échec du digest', position: [100, 300] }
});

const configuration_alerte = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Configuration alerte', parameters: { assignments: { assignments: [{ id: 'emailResponsable', name: 'emailResponsable', type: 'string', value: 'responsable@entreprise.fr' }, { id: 'emailExpediteur', name: 'emailExpediteur', type: 'string', value: 'n8n@entreprise.fr' }] }, includeOtherFields: true, options: {} }, position: [240, 0] }
});

const formater_alerte_sans_donn_es = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Formater alerte sans données', parameters: { jsCode: '// Alerte d\'échec sans aucune donnée métier : ni montant, ni nom de client.\nconst e = $input.first().json;\nconst erreur = (e.execution && e.execution.error) || (e.trigger && e.trigger.error) || {};\nconst message = String(erreur.message || \'Erreur inconnue\').slice(0, 300);\nconst noeud = (e.execution && e.execution.lastNodeExecuted) || (erreur.node && erreur.node.name) || \'inconnu\';\nconst quand = new Intl.DateTimeFormat(\'fr-FR\', {\n  timeZone: \'Europe/Paris\', dateStyle: \'short\', timeStyle: \'short\',\n}).format(new Date());\n\nconst lignes = [\n  `Le digest pipeline Salesforce → Slack a échoué le ${quand} après plusieurs tentatives.`,\n  \'\',\n  `Workflow : ${(e.workflow && e.workflow.name) || \'inconnu\'}`,\n  `Nœud en échec : ${noeud}`,\n  `Erreur : ${message}`,\n];\nif (e.execution && e.execution.url) lignes.push(`Exécution : ${e.execution.url}`);\nlignes.push(\'\', \'Le canal d\\\'équipe n\\\'a rien reçu aujourd\\\'hui. Relancer le workflow à la main une fois le problème corrigé.\');\n\nreturn [{\n  json: {\n    sujet: \'[Échec] Digest pipeline Salesforce → Slack\',\n    corps: lignes.join(\'\\n\'),\n  },\n}];\n' }, position: [480, 0], notes: 'Email d\'échec sans montant ni nom de client : workflow, nœud, erreur, lien d\'exécution.', notesInFlow: true }
});

const pr_venir_le_responsable = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Prévenir le responsable', parameters: { fromEmail: expr('{{ $(\'Configuration alerte\').first().json.emailExpediteur }}'), toEmail: expr('{{ $(\'Configuration alerte\').first().json.emailResponsable }}'), subject: expr('{{ $json.sujet }}'), emailFormat: 'text', text: expr('{{ $json.corps }}'), options: { appendAttribution: false } }, position: [720, 0], webhookId: '50870f8e-83fd-4bb7-a47d-bbd614e0b1c3', retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 }
});

const wf = workflow('digestalerteerr1', 'Digest Pipeline - Alerte Echec', { executionOrder: 'v1', timezone: 'Europe/Paris', availableInMCP: true });

export default wf
  .add(en_cas_d_chec_du_digest)
  .to(configuration_alerte)
  .to(formater_alerte_sans_donn_es)
  .to(pr_venir_le_responsable)