// Code node « Échantillon pour la table des matières » (Run Once for All Items).
// Entrée : sortie de « Nettoyage ». Sortie : { sample, headings } pour le prompt Gemini qui reconstitue les chapitres.
//  - sample   : le début du livre (souvent la table des matières), plafonné ;
//  - headings : les lignes du livre entier qui ressemblent à des titres (courtes, en capitales ou numérotées),
//               pour que Gemini trouve les chapitres même sans table des matières.

const SAMPLE_CHARS = 20000;
const MAX_HEADINGS = 400;
const { lines } = $input.first().json;

let sample = '';
for (const { t } of lines) {
  if (sample.length + t.length > SAMPLE_CHARS) break;
  sample += t + '\n';
}

const looksLikeHeading = (t) =>
  t.length <= 90 &&
  !/[.,;:]$/.test(t) &&
  (/^(chapitre|chapter|chap\.?|livre|book|partie|part|loi|law|section|lettre|letter)\b/i.test(t) ||
    /^([0-9]{1,3}|[IVXLCDM]{1,7})[.)\-–—:]?(\s|$)/.test(t) ||
    (t === t.toUpperCase() && /\p{Lu}{3}/u.test(t)));

const headings = [];
lines.forEach(({ p, t }, i) => {
  if (looksLikeHeading(t) && headings.length < MAX_HEADINGS) headings.push(`[l.${i} p.${p}] ${t}`);
});

return [{ json: { sample, headings: headings.join('\n'), lineCount: lines.length } }];
