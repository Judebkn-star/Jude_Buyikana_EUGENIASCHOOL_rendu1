// Totaux, ventilation par étape et alertes. Les seuils viennent du nœud Configuration.
const cfg = $('Configuration').first().json;
const { dateReference } = $('Vérifier jour férié').first().json;
const seuilRetard = Number(cfg.seuilRetardJours);
const seuilInactivite = Number(cfg.seuilInactiviteJours);
if (!Number.isFinite(seuilRetard) || !Number.isFinite(seuilInactivite)) {
  throw new Error('Seuils invalides dans le nœud Configuration');
}

// alwaysOutputData renvoie un item vide quand la requête ne trouve rien : on filtre sur Id.
const opportunites = $('Lire opportunités Salesforce').all()
  .map((item) => item.json)
  .filter((o) => o && o.Id);

const ordreEtapes = {};
for (const item of $('Lire ordre des étapes').all()) {
  if (item.json && item.json.MasterLabel) ordreEtapes[item.json.MasterLabel] = Number(item.json.SortOrder);
}

const JOUR_MS = 86400000;
const refMs = Date.parse(`${dateReference}T00:00:00Z`);
// Les dates Salesforce arrivent en "AAAA-MM-JJ" ou en datetime ISO : on garde la partie date.
const joursDepuis = (valeur) => {
  if (!valeur) return null;
  const ms = Date.parse(`${String(valeur).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(ms) ? null : Math.floor((refMs - ms) / JOUR_MS);
};

const lignes = opportunites.map((o) => {
  // LastStageChangeDate vide : l'étape n'a jamais changé, on repart de la création.
  const depuisEtape = joursDepuis(o.LastStageChangeDate) ?? joursDepuis(o.CreatedDate);
  const depuisActivite = joursDepuis(o.LastActivityDate);
  return {
    id: o.Id,
    nom: o.Name || '(sans nom)',
    compte: (o.Account && o.Account.Name) || '',
    proprietaire: (o.Owner && o.Owner.Name) || '',
    etape: o.StageName || '(sans étape)',
    montant: Number(o.Amount) || 0,
    montantRenseigne: o.Amount !== null && o.Amount !== undefined,
    dateCloture: o.CloseDate || null,
    derniereActivite: o.LastActivityDate || null,
    joursDansEtape: depuisEtape,
    joursSansActivite: depuisActivite ?? joursDepuis(o.CreatedDate),
    jamaisActivite: depuisActivite === null,
  };
});

const parEtapeMap = new Map();
for (const l of lignes) {
  if (!parEtapeMap.has(l.etape)) parEtapeMap.set(l.etape, { etape: l.etape, nombre: 0, montant: 0, opportunites: [] });
  const e = parEtapeMap.get(l.etape);
  e.nombre += 1;
  e.montant += l.montant;
  e.opportunites.push(l);
}
const rang = (etape) => (etape in ordreEtapes ? ordreEtapes[etape] : Number.MAX_SAFE_INTEGER);
const parEtape = [...parEtapeMap.values()].sort((a, b) => rang(a.etape) - rang(b.etape) || a.etape.localeCompare(b.etape, 'fr'));
for (const e of parEtape) e.opportunites.sort((a, b) => b.montant - a.montant);

const alertesRetard = [];
for (const l of lignes) {
  const motifs = [];
  if (l.dateCloture && l.dateCloture < dateReference) motifs.push(`Clôture dépassée (${joursDepuis(l.dateCloture)} j)`);
  if (l.joursDansEtape !== null && l.joursDansEtape > seuilRetard) motifs.push(`Même étape depuis ${l.joursDansEtape} j`);
  if (motifs.length) alertesRetard.push({ ...l, motifs });
}
alertesRetard.sort((a, b) => (a.dateCloture || '').localeCompare(b.dateCloture || ''));

// Aucune activité : on compte depuis la création (règle documentée dans le README).
const alertesInactivite = lignes
  .filter((l) => l.joursSansActivite !== null && l.joursSansActivite > seuilInactivite)
  .sort((a, b) => b.joursSansActivite - a.joursSansActivite);

return [{
  json: {
    dateReference,
    devise: cfg.devise,
    seuilRetard,
    seuilInactivite,
    total: lignes.reduce((s, l) => s + l.montant, 0),
    nombre: lignes.length,
    nombreSansMontant: lignes.filter((l) => !l.montantRenseigne).length,
    parEtape,
    alertesRetard,
    alertesInactivite,
  },
}];
