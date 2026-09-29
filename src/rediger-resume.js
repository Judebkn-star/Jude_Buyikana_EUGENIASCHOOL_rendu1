// Résumé Slack sobre + paramètres de diffusion. Le binaire du rapport suit l'item.
const cfg = $('Configuration').first().json;
const item = $input.first();
const d = item.json;

const montant = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: d.devise || 'EUR', maximumFractionDigits: 0,
}).format(d.total);
const date = `${d.dateReference.slice(8, 10)}/${d.dateReference.slice(5, 7)}/${d.dateReference.slice(0, 4)}`;
const opps = `${d.nombre} opportunité${d.nombre > 1 ? 's' : ''}`;

const texte = `Pipeline commercial du ${date} (trimestre fiscal en cours) : ${montant} sur ${opps}.\nRapport complet en pièce jointe.`;

return [{
  json: {
    texte,
    titre: `Pipeline commercial du ${date}`,
    fichierNom: item.binary.rapport.fileName,
    modeDiffusion: cfg.modeDiffusion,
    canalSlackId: cfg.canalSlackId,
    emailCanal: cfg.emailCanal,
    emailExpediteur: cfg.emailExpediteur,
  },
  binary: item.binary,
}];
