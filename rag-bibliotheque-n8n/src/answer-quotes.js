// Code node « Vérifier les citations » (Run Once for All Items)
// Entrée : réponse de « Génération » ({ text }).
// Chaque extrait entre « » doit figurer mot pour mot dans le texte du livre des passages retenus (les fiches de synthèse,
// écrites par Gemini, ne comptent pas). Sinon on retire les guillemets : l'idée reste, elle n'est plus présentée comme du Greene.
// Sortie : { text, quotes: { kept, unquoted } }.

const MIN_LEN = 12; // en dessous, « A contrario », « Loi 1 »… : ce ne sont pas des citations
const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/[  ]/g, ' ')
    .replace(/[-‐–—]\s+/g, '')
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim();

const book = norm(
  $('Sélection')
    .first()
    .json.passages.filter((p) => p.kind !== 'chapter_summary')
    .map((p) => p.text)
    .join(' ')
);

let kept = 0;
let unquoted = 0;
// Guillemets français « », anglais “ ” et droits " " : le modèle n'utilise pas toujours ceux qu'on lui demande.
const QUOTES = /«\s*([^«»]+?)\s*»|“([^“”]+?)”|"([^"\n]+?)"/g;
const text = String($input.first().json.text ?? '').replace(QUOTES, (all, fr, en, straight) => {
  const inner = (fr ?? en ?? straight).trim();
  if (inner.length < MIN_LEN) return all;
  if (book.includes(norm(inner))) {
    kept++;
    return all;
  }
  unquoted++;
  return inner;
});

return [{ json: { text, quotes: { kept, unquoted } } }];
