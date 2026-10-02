// Code node « Livres et chapitres cités » (Run Once for All Items) — workflow C.
// Entrée : $('Bibliothèque') (une ligne par livre), $('Reformulation') (requête), la question du chat.
// Sortie : { query, bookIds, books, cited } :
//   bookIds = livres nommés dans la question (titre ou auteur) → la recherche se limite à eux ; [] = toute la bibliothèque ;
//   cited   = chapitres nommés (« chapitre 3 », « loi 15 », « chapter III ») → leur fiche et leur début sont ajoutés d'office,
//             car une recherche vectorielle ne comprend pas un numéro.

const books = $('Bibliothèque').all().map((i) => i.json).filter((b) => b.id);
const question = $('When chat message received').first().json.chatInput || '';
const query = String($('Reformulation').first().json.text || question).trim();
const text = `${question} ${query}`;

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'the', 'of', 'a', 'an', 'and', 'et', 'l', 'd', 'sur', 'on']);
const nq = ` ${norm(text)} `;
// Le livre nommé se cherche dans la question de l'utilisateur seulement : la reformulation de Gemini ajoute parfois
// un titre de la bibliothèque de son propre chef, ce qui enfermerait à tort la recherche dans ce livre.
const nqUser = ` ${norm(question)} `;

const named = books.filter((b) => {
  const title = norm(b.title).replace(/^(le|la|les|l|the|a|an) /, '');
  if (title.length >= 4 && nqUser.includes(` ${title} `)) return true;
  const surname = norm(b.author).split(' ').pop();
  if (surname && surname.length >= 4 && nqUser.includes(` ${surname} `)) return true;
  const words = norm(b.title).split(' ').filter((w) => w.length >= 2 && !STOP.has(w));
  const hits = words.filter((w) => nqUser.includes(` ${w} `));
  return words.length >= 2 && hits.length >= 2 && hits.length / words.length >= 0.6;
});

const ROMAN = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
const toInt = (s) => {
  if (/^\d+$/.test(s)) return Number(s);
  let n = 0;
  const r = s.toLowerCase();
  for (let i = 0; i < r.length; i++) n += ROMAN[r[i]] < (ROMAN[r[i + 1]] || 0) ? -ROMAN[r[i]] : ROMAN[r[i]];
  return n;
};
const REF = /\b(chapitres?|chapters?|chap\.?|lois?|laws?|livres?|parties?|parts?|lettres?|letters?)\s*(?:n[°o]\s*)?(\d{1,3}|[ivxlcdm]{1,6})\b(?:\s*(?:,|et|and|&)\s*(\d{1,3}|[ivxlcdm]{1,6})\b)?/gi;
const cited = [];
for (const m of text.matchAll(REF)) {
  const word = norm(m[1]);
  const nums = [m[2], m[3]].filter(Boolean).map(toInt).filter((n) => n >= 1 && n <= 500);
  // « loi 15 » vise les livres dont les chapitres s'appellent « Loi » ; « chapitre 3 » vise les livres nommés, sinon tous.
  let targets = books.filter((b) => norm(b.chapter_label).startsWith(word.slice(0, 3)));
  if (!targets.length || /^(chap|part|livre|book)/.test(word)) targets = named.length ? named : books;
  for (const b of targets) for (const n of nums) if (!cited.some((c) => c.book_id === b.id && c.chapter_number === n)) cited.push({ book_id: b.id, chapter_number: n });
}

// Mots-clés pour la partie plein texte de la recherche hybride : mots significatifs de la question et de la requête,
// sans accents ni stopwords (FR/EN), sans les mots qui nomment les livres eux-mêmes. Un nom propre rare compte autant
// qu'un thème : la fusion RRF fera remonter les passages qui le contiennent vraiment.
const KW_STOP = new Set(('le la les un une des du de d l au aux et ou en dans sur sous par pour avec sans que qui quoi quel quelle quels quelles ' +
  'est sont etre avoir fait faire dit dire peut peux comment pourquoi quand combien selon entre leur leurs son ses sa mon ma mes ton ta tes ' +
  'nous vous ils elles elle lui cela cette ces cet tout tous toute toutes plus moins tres bien aussi alors donc mais comme ainsi ' +
  'livre livres chapitre chapitres loi lois auteur parle parlent raconte racontent explique conseille quelles quelqu un ' +
  'the a an and or of to in on for with without what which who whom how why when does do is are was were be book chapter about says').split(' '));
const bookWords = new Set(books.flatMap((b) => norm(`${b.title} ${b.author}`).split(' ')));
const keywords = [...new Set(norm(text).split(' '))]
  .filter((w) => w.length >= 4 && !KW_STOP.has(w) && !/^\d+$/.test(w) && !bookWords.has(w))
  .slice(0, 8);

return [{ json: { query, bookIds: named.map((b) => b.id), books: named.map((b) => b.title), cited, keywords } }];
