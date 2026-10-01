// Code node « Sélection » (Run Once for All Items) — workflow C.
// Entrée : sortie du reranking Gemini ({ text } JSON, ou { error }).
// Sortie : { query, question, passages, sources, context, rules, reranked } — les TOP_K meilleurs passages (score >= MIN_SCORE).
// Reranking illisible → ordre de la recherche. Les règles de génération dépendent du résultat :
//   - au moins un passage retenu : on n'offre PAS l'option de refus (un refus alors que la recherche a trouvé = défaut A3) ;
//   - aucun passage : le modèle doit dire que la bibliothèque ne répond pas.

const TOP_K = 5;
const MIN_SCORE = 5;

const { query, candidates } = $('Candidats').first().json;
const question = $('When chat message received').first().json.chatInput;
const out = $input.first().json;

let scores = null;
try {
  const raw = String(out.text ?? '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : parsed.scores;
  if (Array.isArray(list) && list.length) scores = Object.fromEntries(list.map((s) => [Number(s.id), Number(s.score)]));
} catch (e) {
  scores = null;
}

const passages = scores
  ? candidates.map((c) => ({ ...c, rerank: scores[c.id] ?? 0 })).filter((c) => c.rerank >= MIN_SCORE).sort((a, b) => b.rerank - a.rerank).slice(0, TOP_K)
  : candidates.slice(0, TOP_K).map((c) => ({ ...c, rerank: null }));

const pages = (c) => `p. ${c.page_start}${c.page_end !== c.page_start ? `-${c.page_end}` : ''} du PDF`;
const cite = (c) =>
  c.chapter_number
    ? `${c.book_title}, ${c.chapter_label} ${c.chapter_number}, ${c.kind === 'chapter_summary' ? 'fiche de synthèse' : c.section}, ${pages(c)}`
    : `${c.book_title}, ${c.section}, ${pages(c)}`;

// Une fiche de synthèse est un résumé écrit par Gemini à l'ingestion, pas le texte du livre : on le signale au modèle.
const context = passages.length
  ? passages
      .map((c, i) => `<passage n="${i + 1}" type="${c.kind === 'chapter_summary' ? 'résumé (pas le texte du livre)' : 'texte du livre'}" source="${cite(c)}">\n${c.text}\n</passage>`)
      .join('\n\n')
  : '(aucun passage pertinent)';

const rules = passages.length
  ? `Les passages ci-dessous ont été jugés pertinents pour la question : réponds en t'appuyant dessus, même si le livre n'emploie pas les mêmes mots que la question. Ne réponds pas que le livre ne traite pas la question.`
  : `Aucun passage de la bibliothèque ne traite cette question. Écris exactement : « Le livre ne répond pas à cette question. » puis, en une phrase, de quoi traitent les livres de la bibliothèque.`;

return [{ json: { query, question, reranked: !!scores, passages, sources: passages.map(cite), context, rules } }];
