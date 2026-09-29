// Décide si la date de référence (heure de Paris) est un jour ouvré.
// Fériés mobiles calculés à partir de Pâques : aucune année codée en dur.
const cfg = $('Configuration').first().json;

const dateParis = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const dateForcee = String(cfg.dateReferenceForcee || '').trim();
if (dateForcee && !/^\d{4}-\d{2}-\d{2}$/.test(dateForcee)) {
  throw new Error(`dateReferenceForcee invalide : "${dateForcee}" (format attendu AAAA-MM-JJ)`);
}
const dateReference = dateForcee || dateParis;
const [annee, mois, jour] = dateReference.split('-').map(Number);

// Dimanche de Pâques, algorithme de Meeus/Jones/Butcher (calendrier grégorien).
function paques(y) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const moisP = Math.floor((h + l - 7 * m + 114) / 31);
  const jourP = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, moisP - 1, jourP);
}

const JOUR_MS = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const p = paques(annee);

const feries = {
  [`${annee}-01-01`]: 'Jour de l\'an',
  [iso(p + 1 * JOUR_MS)]: 'Lundi de Pâques',
  [`${annee}-05-01`]: 'Fête du Travail',
  [`${annee}-05-08`]: 'Victoire 1945',
  [iso(p + 39 * JOUR_MS)]: 'Ascension',
  [`${annee}-07-14`]: 'Fête nationale',
  [`${annee}-08-15`]: 'Assomption',
  [`${annee}-11-01`]: 'Toussaint',
  [`${annee}-11-11`]: 'Armistice 1918',
  [`${annee}-12-25`]: 'Noël',
};
if (cfg.inclureLundiPentecote) {
  feries[iso(p + 50 * JOUR_MS)] = 'Lundi de Pentecôte';
}

const jourSemaine = new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay(); // 0 = dimanche
let motif = '';
if (jourSemaine === 0 || jourSemaine === 6) motif = 'Week-end';
else if (feries[dateReference]) motif = `Jour férié : ${feries[dateReference]}`;

return [{
  json: {
    dateReference,
    dateForcee: Boolean(dateForcee),
    estJourOuvre: motif === '',
    motif,
  },
}];
