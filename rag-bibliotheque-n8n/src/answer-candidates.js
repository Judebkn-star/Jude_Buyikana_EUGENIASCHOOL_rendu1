// Code node « Candidats » (Run Once for All Items) — workflow C.
// Entrées : $input = « Chapitres cités » (fiche + début des chapitres nommés dans la question, ou un item vide) ;
//           $('Recherche') = top 20 vectoriel ({ content, metadata, similarity }).
// Les chapitres cités passent en premier. Au plus MAX_PER_CHAPTER passages par chapitre, pour qu'une question
// de synthèse couvre plusieurs chapitres (ou plusieurs livres) au lieu de 20 fragments du même.
// Sortie : un item { query, candidates, rerankList }.

const MAX_PER_CHAPTER = 4;
const MAX_CANDIDATES = 15;
const RERANK_CHARS = 1000;

const { query } = $('Livres et chapitres cités').first().json;
const rows = [...$input.all().map((i) => i.json), ...$('Recherche').all().map((i) => i.json)].filter((r) => r.metadata);
const perChapter = {};
const seen = new Set();
const candidates = [];

for (const r of rows) {
  const m = r.metadata;
  if (seen.has(m.chunk_id)) continue;
  seen.add(m.chunk_id);
  const key = `${m.book_id}/${m.chapter_number ?? m.section ?? 'autre'}`;
  perChapter[key] = (perChapter[key] ?? 0) + 1;
  if (perChapter[key] > MAX_PER_CHAPTER) continue;
  candidates.push({
    id: candidates.length + 1,
    chunk_id: m.chunk_id,
    kind: m.kind,
    book_id: m.book_id,
    book_title: m.book_title,
    chapter_label: m.chapter_label || 'Chapitre',
    chapter_number: m.chapter_number || null,
    chapter_title: m.chapter_title || null,
    section: m.section,
    page_start: m.page_start,
    page_end: m.page_end,
    text: m.raw_text || r.content || '',
    score: r.similarity ?? null,
  });
  if (candidates.length >= MAX_CANDIDATES) break;
}

const label = (c) =>
  `${c.book_title} · ${c.chapter_number ? `${c.chapter_label} ${c.chapter_number} (${c.chapter_title})` : c.section} · ${c.kind === 'chapter_summary' ? 'fiche de synthèse' : c.section}`;
const rerankList = candidates.map((c) => `[${c.id}] ${label(c)}\n${c.text.slice(0, RERANK_CHARS)}${c.text.length > RERANK_CHARS ? '…' : ''}`).join('\n\n');

return [{ json: { query, candidates, rerankList } }];
