// Code node « Préparer l'insertion » (Run Once for All Items) — workflow B, flux 2.
// Entrées : $('Texte à vectoriser') (un item par morceau) et la réponse de l'appel HTTP batchEmbedContents
//           ({ embeddings: [{ values: [...] }, ...] } dans l'ordre des morceaux, ou { error } si Gemini a refusé).
// Sortie : un item { rows, missing, error } ; rows = lignes de la table `documents`.
// Un morceau sans vecteur n'est pas inséré : « Marquer done » le repasse en erreur, repris plus tard.

const items = $('Texte à vectoriser').all().map((i) => i.json);
const res = $input.first().json;
const vectors = Array.isArray(res.embeddings) ? res.embeddings.map((e) => e?.values || []) : [];
const LISTS = ['keywords', 'questions', 'people'];
const META = ['chunk_id', 'kind', 'book_id', 'book_title', 'book_author', 'chapter_label', 'chapter_number', 'chapter_title', 'section', 'page_start', 'page_end', 'raw_text', 'context'];

const rows = [];
items.forEach((it, i) => {
  const v = vectors[i];
  if (!v || v.length === 0) return;
  const metadata = Object.fromEntries(META.map((k) => [k, it[k] ?? '']));
  for (const k of LISTS) metadata[k] = (it[k] || []).join(' | ');
  rows.push({ content: it.embed_text, metadata, embedding: JSON.stringify(v) });
});

const error = res.error ? String(res.error.message ?? res.error).slice(0, 300) : null;
return [{ json: { rows, missing: items.length - rows.length, error } }];
