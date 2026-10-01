// Teste src/answer-books.js hors n8n : livres nommés (titre, auteur) et chapitres cités (« loi 15 », « chapitre III »).
import fs from 'fs';
import assert from 'assert/strict';
const code = fs.readFileSync(new URL('../src/answer-books.js', import.meta.url), 'utf8');
const books = [
  { id: 1, title: 'Les 48 lois du pouvoir', author: 'Robert Greene', chapter_label: 'Loi' },
  { id: 2, title: 'Le Prince', author: 'Nicolas Machiavel', chapter_label: 'Chapitre' },
  { id: 3, title: 'The Art of War', author: 'Sun Tzu', chapter_label: 'Chapter' },
];
const run = (question, query = question) => {
  const nodes = { 'When chat message received': { chatInput: question }, Reformulation: { text: query } };
  const $ = (n) => (n === 'Bibliothèque' ? { all: () => books.map((json) => ({ json })) } : { first: () => ({ json: nodes[n] }) });
  return new Function('$', code)($)[0].json;
};
let r = run('Que dit Machiavel sur la cruauté ?');
assert.deepEqual(r.bookIds, [2], 'auteur nommé');
r = run('Dans Le Prince, que dit le chapitre XVII ?');
assert.deepEqual(r.bookIds, [2], 'titre nommé');
assert.deepEqual(r.cited, [{ book_id: 2, chapter_number: 17 }], 'chapitre romain du livre nommé');
r = run('Que dit la loi 15 ?');
assert.deepEqual(r.bookIds, [], 'aucun livre nommé → toute la bibliothèque');
assert.deepEqual(r.cited, [{ book_id: 1, chapter_number: 15 }], '« loi » → le livre dont les chapitres sont des lois');
r = run('Compare les 48 lois et The Art of War sur la ruse');
assert.deepEqual(r.bookIds.sort(), [1, 3], 'deux livres nommés');
r = run('Comment gérer un conflit avec mon patron ?');
assert.deepEqual([r.bookIds, r.cited], [[], []], 'question générale');
r = run('Que dit le chapitre 3 ?');
assert.equal(r.cited.length, 3, '« chapitre 3 » sans livre nommé → chapitre 3 de chaque livre');
r = run('Que raconte le livre sur Talleyrand et Vaux-le-Vicomte ?');
assert.deepEqual(r.keywords, ['talleyrand', 'vaux', 'vicomte'], 'mots-clés : noms propres gardés, stopwords retirés');
r = run('Que dit Machiavel sur la cruauté ?');
assert.deepEqual(r.keywords, ['cruaute'], 'mots-clés : le nom de l’auteur nommé ne sert pas de mot-clé');
console.log('run-books : OK');
