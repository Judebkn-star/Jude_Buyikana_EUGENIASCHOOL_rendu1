// Alerte d'échec sans aucune donnée métier : ni montant, ni nom de client.
const e = $input.first().json;
const erreur = (e.execution && e.execution.error) || (e.trigger && e.trigger.error) || {};
const message = String(erreur.message || 'Erreur inconnue').slice(0, 300);
const noeud = (e.execution && e.execution.lastNodeExecuted) || (erreur.node && erreur.node.name) || 'inconnu';
const quand = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short',
}).format(new Date());

const lignes = [
  `Le digest pipeline Salesforce → Slack a échoué le ${quand} après plusieurs tentatives.`,
  '',
  `Workflow : ${(e.workflow && e.workflow.name) || 'inconnu'}`,
  `Nœud en échec : ${noeud}`,
  `Erreur : ${message}`,
];
if (e.execution && e.execution.url) lignes.push(`Exécution : ${e.execution.url}`);
lignes.push('', 'Le canal d\'équipe n\'a rien reçu aujourd\'hui. Relancer le workflow à la main une fois le problème corrigé.');

return [{
  json: {
    sujet: '[Échec] Digest pipeline Salesforce → Slack',
    corps: lignes.join('\n'),
  },
}];
