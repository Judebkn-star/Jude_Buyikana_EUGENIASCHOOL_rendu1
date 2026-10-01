// Teste src/answer-select.js hors n8n : reranking valide / illisible / en erreur / tout hors sujet, et règles anti-refus.
import fs from 'fs';
import assert from 'assert/strict';
const code = fs.readFileSync(new URL('../src/answer-select.js', import.meta.url), 'utf8');
const candidates = [1, 2, 3, 4, 5, 6].map((id) => ({ id, chunk_id: `livre/ch-00${id}/000`, kind: id === 6 ? 'chapter_summary' : 'section', book_id: 1, book_title: 'Le Livre', chapter_label: 'Chapitre', chapter_number: id, chapter_title: 'T', section: 'T', page_start: 10, page_end: 11, text: `texte ${id}` }));
const nodes = { Candidats: { query: 'q', candidates }, 'When chat message received': { chatInput: 'question ?' } };
const $ = (name) => ({ first: () => ({ json: nodes[name] }) });
const run = (json) => new Function('$', '$input', code)($, { first: () => ({ json }) })[0].json;
const ids = (r) => r.passages.map((p) => p.id);

let r = run({ text: '```json\n{"scores":[{"id":3,"score":9},{"id":6,"score":7},{"id":1,"score":2}]}\n```' });
assert.deepEqual(ids(r), [3, 6], 'tri par score, seuil 5');
assert.ok(r.context.includes('type="résumé (pas le texte du livre)"'), 'fiche marquée comme résumé');
assert.equal(r.sources[0], 'Le Livre, Chapitre 3, T, p. 10-11 du PDF', 'source avec le titre du livre');
assert.ok(!/Le livre ne répond pas/.test(r.rules), 'A3 : passages retenus → pas d’option de refus');
r = run({ text: 'Voici mon classement : 3, 6, 1' });
assert.deepEqual(ids(r), [1, 2, 3, 4, 5], 'JSON invalide → ordre de la recherche');
r = run({ error: { message: 'Too many requests' } });
assert.deepEqual(ids(r), [1, 2, 3, 4, 5], 'erreur Gemini → ordre de la recherche');
r = run({ text: '{"scores":[{"id":1,"score":1},{"id":2,"score":0}]}' });
assert.deepEqual(ids(r), [], 'tout hors sujet → aucun passage');
assert.match(r.rules, /Le livre ne répond pas à cette question/, 'aucun passage → refus demandé');
console.log('run-select : OK');
