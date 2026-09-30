const re_u_du_digest = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.1,
  config: { name: 'Reçu du digest', parameters: { inputSource: 'passthrough' }, position: [0, 100] }
});

const mode_d_envoi_app_Slack = node({
  type: 'n8n-nodes-base.if',
  version: 2.2,
  config: { name: 'Mode d\'envoi : app Slack ?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: 'mode-slack', leftValue: expr('{{ $json.modeDiffusion }}'), rightValue: 'slack_app', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, options: {} }, position: [240, 100] }
});

const publier_dans_le_canal_Slack = node({
  type: 'n8n-nodes-base.slack',
  version: 2.3,
  config: { name: 'Publier dans le canal Slack', parameters: { resource: 'file', operation: 'upload', binaryPropertyName: 'rapport', options: { channelId: expr('{{ $json.canalSlackId }}'), fileName: expr('{{ $json.fichierNom }}'), initialComment: expr('{{ $json.texte }}'), title: expr('{{ $json.titre }}') } }, position: [480, 0], notes: 'App Slack : scopes chat:write et files:write. Inviter le bot dans le canal privé.', retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 }
});

const envoyer_au_canal_par_email = node({
  type: 'n8n-nodes-base.emailSend',
  version: 2.1,
  config: { name: 'Envoyer au canal par email', parameters: { fromEmail: expr('{{ $json.emailExpediteur }}'), toEmail: expr('{{ $json.emailCanal }}'), subject: expr('{{ $json.titre }}'), emailFormat: 'text', text: expr('{{ $json.texte }}'), options: { fileAttachments: 'rapport', appendAttribution: false } }, position: [480, 200], notes: 'Repli : adresse email du canal Slack. SMTP interne uniquement, jamais un service externe.', retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 }
});

const wf = workflow('digestdiffslack1', 'Digest pipeline · Diffusion Slack', { executionOrder: 'v1', timezone: 'Europe/Paris', callerPolicy: 'workflowsFromSameOwner', availableInMCP: true });

export default wf
  .add(re_u_du_digest)
  .to(mode_d_envoi_app_Slack.onTrue(publier_dans_le_canal_Slack).onFalse(envoyer_au_canal_par_email))