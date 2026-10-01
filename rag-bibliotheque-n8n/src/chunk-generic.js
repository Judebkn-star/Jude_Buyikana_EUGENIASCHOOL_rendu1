// Code node « Découpage » (Run Once for All Items) — générique, pour n'importe quel livre.
// Entrées : $('Nettoyage') → lignes nettoyées ; $input → réponse de Gemini « Table des matières »
//           ({ text: '{"chapters":[{"number":1,"title":"…"}]}' }, ou { error } si l'appel a échoué) ;
//           $('On form submission') → titre, auteur, langue, libellé des chapitres.
// Sortie : un item { book, stats, rows } ; rows = lignes de la table `chunks` (sans book_id, posé par le SQL).
//
// Structure, du plus fiable au plus rustique :
//   1. toc         : les titres donnés par Gemini, retrouvés dans le texte (en évitant la table des matières elle-même) ;
//   2. heuristique : les lignes « Chapitre 3 », « CHAPTER III », « Livre II »… ;
//   3. taille      : des parties d'environ PART_CHARS caractères.
// Puis chaque chapitre est découpé en blocs de phrases (~TARGET caractères, recouvrement ~OVERLAP),
// plus une ligne chapter_summary (texte complet du chapitre) que le workflow B résumera.

const TARGET = 2500;
const MAX = 3200;
const OVERLAP = 250;
const PART_CHARS = 30000;
const MIN_GAP = 12; // lignes minimum entre deux débuts de chapitre (une table des matières est plus dense)

const form = $('On form submission').first().json;
const title = String(form.titre || '').trim();
if (!title) throw new Error('Le titre du livre est obligatoire.');
const language = /^en/i.test(form.langue || '') ? 'en' : 'fr';
const chapterLabel = String(form.libelle || '').trim() || (language === 'en' ? 'Chapter' : 'Chapitre');
const slug = title
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 60);

const { lines } = $('Nettoyage').first().json;

// ---------- 1. Titres proposés par Gemini ----------
let toc = [];
try {
  const raw = String($input.first().json.text ?? '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const parsed = JSON.parse(raw);
  toc = (Array.isArray(parsed) ? parsed : parsed.chapters || [])
    .map((c, i) => ({ number: Number(c.number) || i + 1, title: String(c.title || '').trim() }))
    .filter((c) => c.title);
} catch (e) {
  toc = [];
}

const norm = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, ' ')
    .replace(/\.{2,}.*$/, '') // « De la ruse ........ 5 » (ligne de table des matières)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const PREFIX = /^(chapitre|chapter|chap|livre|book|partie|part|loi|law|section|lettre|letter)\s+([0-9]+|[ivxlcdm]+)\s*/;
const bare = (s) => norm(s).replace(PREFIX, '').replace(/^([0-9]+|[ivxlcdm]+)\s+/, '').trim();

// Nombre de lignes occupées par le titre à partir de la ligne i (0 = pas de titre ici).
// Un titre long peut être coupé sur plusieurs lignes (« NE VOUS FIEZ PAS » / « À VOS AMIS… »),
// et précédé d'une ligne « CHAPITRE I » que l'on compte aussi.
const MAX_TITLE_LINES = 4;
function spanFrom(i, want, wantBare) {
  let acc = '';
  for (let k = 0; k < MAX_TITLE_LINES && i + k < lines.length; k++) {
    acc = acc ? `${acc} ${lines[i + k].t}` : lines[i + k].t;
    const n = norm(acc);
    if (n === want || (wantBare.length >= 4 && bare(acc) === wantBare)) return k + 1;
    if (n.length > want.length + 10) break;
  }
  return 0;
}
function titleSpan(i, chapterTitle) {
  const want = norm(chapterTitle);
  if (!want) return 0;
  const wantBare = bare(chapterTitle);
  const direct = spanFrom(i, want, wantBare);
  if (direct) return direct;
  if (PREFIX.test(norm(lines[i].t)) && norm(lines[i].t).replace(PREFIX, '') === '' && i + 1 < lines.length) {
    const after = spanFrom(i + 1, wantBare || want, wantBare);
    if (after) return after + 1;
  }
  return 0;
}
const matchesAt = (i, chapterTitle) => titleSpan(i, chapterTitle) > 0;

function locate(chapters) {
  if (!chapters.length) return [];
  const firstHits = [];
  for (let i = 0; i < lines.length; i++) if (matchesAt(i, chapters[0].title)) firstHits.push(i);
  let best = [];
  let bestGap = -1;
  for (const start of firstHits) {
    const found = [{ ...chapters[0], line: start }];
    let pos = start + 1;
    for (const ch of chapters.slice(1)) {
      let hit = -1;
      for (let i = pos; i < lines.length; i++) if (matchesAt(i, ch.title)) { hit = i; break; }
      if (hit >= 0) { found.push({ ...ch, line: hit }); pos = hit + 1; }
    }
    const gaps = found.slice(1).map((f, k) => f.line - found[k].line);
    const minGap = gaps.length ? Math.min(...gaps) : Infinity;
    if (found.length > best.length || (found.length === best.length && minGap > bestGap)) {
      best = found;
      bestGap = minGap;
    }
  }
  // Débuts trop rapprochés = on est dans la table des matières : on les écarte.
  return best.filter((f, k) => k === best.length - 1 || best[k + 1].line - f.line >= MIN_GAP);
}

let method = 'toc';
let starts = locate(toc);
if (starts.length < Math.max(2, Math.ceil(toc.length * 0.6))) {
  // ---------- 2. Heuristique : lignes « Chapitre N » ----------
  method = 'heuristique';
  // Seulement en haut de page et sur une ligne courte : « Chapter 3 examines… » au fil du texte n'est pas un titre.
  const cands = [];
  lines.forEach(({ p, t }, i) => {
    let posInPage = 0;
    for (let k = i - 1; k >= 0 && lines[k].p === p; k--) posInPage++;
    const m = norm(t).match(PREFIX);
    const rest = norm(t).replace(PREFIX, '');
    if (m && posInPage <= 2 && t.length <= 90 && rest.split(' ').filter(Boolean).length <= 10 && !/[.;]$/.test(t)) {
      const rest = t.replace(/^\S+\s+\S+\s*[.:\-–—]?\s*/, '').trim();
      const next = lines[i + 1]?.t ?? '';
      cands.push({ line: i, num: m[2], title: rest || (next.length <= 90 ? next : `${chapterLabel} ${m[2]}`) });
    }
  });
  // Ne garder que la suite des numéros 1, 2, 3… : une page de table des matières qui commence par « Chapter 6 »
  // juste avant le vrai « Chapter 1 » est écartée.
  const ROMAN = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const toInt = (s) => (/^\d+$/.test(s) ? Number(s) : [...s.toLowerCase()].reduce((n, ch, k, a) => n + (ROMAN[ch] < (ROMAN[a[k + 1]] || 0) ? -ROMAN[ch] : ROMAN[ch]), 0));
  const spaced = cands.filter((c, k) => k === cands.length - 1 || cands[k + 1].line - c.line >= MIN_GAP);
  const firstOne = spaced.findIndex((c) => toInt(c.num) === 1);
  let seq = [];
  if (firstOne >= 0) {
    for (const c of spaced.slice(firstOne)) if (toInt(c.num) === seq.length + 1) seq.push(c);
  }
  starts = (seq.length >= 2 ? seq : spaced).map((c, k) => ({ ...c, number: k + 1 }));
  if (starts.length < 2) {
    // ---------- 3. Parties de taille fixe ----------
    method = 'taille';
    starts = [];
    let acc = PART_CHARS;
    lines.forEach(({ t }, i) => {
      if (acc >= PART_CHARS) { starts.push({ line: i, number: starts.length + 1, title: language === 'en' ? `Part ${starts.length + 1}` : `Partie ${starts.length + 1}` }); acc = 0; }
      acc += t.length + 1;
    });
  }
}

// Titre affiché : une seule ligne, sans le préfixe « CHAPITRE II » que Gemini recopie parfois avec le titre.
// (La correspondance dans le texte, elle, utilise le titre tel quel.)
// Si Gemini n'a donné qu'un « Chapter 2 » nu (ce qu'il recopie parfois depuis la tête du chapitre), le vrai titre est
// cherché dans la table des matières du livre (« Chapter 2 Integrating AI with … 27 », éventuellement sur plusieurs
// lignes jusqu'au numéro de page), puis dans la ligne qui suit le titre dans le texte.
const PREFIX_RAW = /^(chapitre|chapter|chap\.?|livre|book|partie|part|loi|law|section|lettre|letter)\s+([0-9]+|[IVXLCDM]+)\b\s*[.:\-–—]?\s*/i;
const tocZone = lines.slice(0, Math.max(200, Math.ceil(lines.length * 0.15)));
function titleFromToc(n) {
  const re = new RegExp(`^(chapitre|chapter|chap\\.?|livre|book|partie|part|loi|law|lettre|letter)\\s+${n}\\b\\s*[.:\\-–—]?\\s*(.*)$`, 'i');
  for (let i = 0; i < tocZone.length; i++) {
    const m = tocZone[i].t.match(re);
    if (!m || !m[2]) continue;
    let acc = m[2];
    for (let k = i + 1; k < tocZone.length && k <= i + 3 && !/\s\d{1,4}$/.test(acc); k++) acc += ' ' + tocZone[k].t;
    const title = acc.replace(/\s*\.{2,}.*$/, '').replace(/\s+\d{1,4}$/, '').trim();
    if (title.length >= 3) return title;
  }
  return '';
}
const display = (t, n, line) => {
  if (method === 'heuristique') {
    const fromToc = titleFromToc(n); // le repli ne voit que la 1re ligne du titre : la table des matières est plus complète
    if (fromToc) return fromToc;
  }
  const one = String(t).replace(/\s+/g, ' ').trim();
  const stripped = one.replace(PREFIX_RAW, '').trim();
  if (stripped) return stripped;
  const fromToc = titleFromToc(n);
  if (fromToc) return fromToc;
  const next = line !== undefined ? lines[line + 1]?.t : '';
  return (next && next.length <= 120 ? next : '') || one || `${chapterLabel} ${n}`;
};
starts = starts.map((s, k) => ({ ...s, number: method === 'toc' ? s.number || k + 1 : s.number }));

// Fin du dernier chapitre : index, bibliographie, notes… s'ils viennent assez loin après son début.
const BACK = /^(index|bibliographie|bibliography|notes|table des mati[eè]res|contents|annexes?|appendix|remerciements|acknowledg\w*|du m[eê]me auteur)\b/i;
let backStart = lines.length;
const last = starts[starts.length - 1];
for (let i = last.line + 50; i < lines.length; i++) if (BACK.test(lines[i].t) && lines[i].t.length <= 40) { backStart = i; break; }

// ---------- Segments ----------
const segments = [];
if (starts[0].line > 0) segments.push({ kind: 'front_matter', key: 'front', label: language === 'en' ? 'Front matter' : 'Avant-propos et sommaire', from: 0, to: starts[0].line });
starts.forEach((s, k) => {
  const to = k + 1 < starts.length ? starts[k + 1].line : backStart;
  segments.push({ kind: 'section', key: `ch-${String(s.number).padStart(3, '0')}`, number: s.number, title: s.title, shown: display(s.title, s.number, s.line), from: s.line, to });
});
if (backStart < lines.length) segments.push({ kind: 'back_matter', key: 'back', label: language === 'en' ? 'Back matter' : 'Annexes', from: backStart, to: lines.length });

// ---------- Phrases et blocs (même logique que la version 48 lois) ----------
function sentencesOf(pieces) {
  const sentences = [];
  let buf = '';
  let bufPage = null;
  for (const { p, t } of pieces) {
    const joiner = buf === '' || buf.endsWith('-') ? '' : ' ';
    const text = buf + joiner + t;
    if (bufPage === null) bufPage = p;
    const re = /([.!?…][»”")]?)\s+(?=[A-ZÀ-ÖØ-Þ«“"(–—-])/g;
    let lastIdx = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      sentences.push({ p: bufPage, t: text.slice(lastIdx, m.index + m[1].length).trim() });
      lastIdx = re.lastIndex;
      bufPage = p;
    }
    buf = text.slice(lastIdx);
  }
  if (buf.trim()) sentences.push({ p: bufPage, t: buf.trim() });
  return sentences.flatMap((s) => {
    if (s.t.length <= MAX) return [s];
    const parts = [];
    let rest = s.t;
    while (rest.length > MAX) {
      const cut = rest.lastIndexOf(' ', TARGET) > 0 ? rest.lastIndexOf(' ', TARGET) : TARGET;
      parts.push({ p: s.p, t: rest.slice(0, cut).trim() });
      rest = rest.slice(cut).trim();
    }
    if (rest) parts.push({ p: s.p, t: rest });
    return parts;
  });
}
function pack(sentences) {
  const chunks = [];
  let group = [];
  let len = 0;
  const emit = () => {
    if (!group.length) return;
    chunks.push({ text: group.map((s) => s.t).join(' '), pStart: group[0].p, pEnd: group[group.length - 1].p });
    const keep = [];
    let k = 0;
    for (let i = group.length - 1; i >= 0 && k + group[i].t.length <= OVERLAP; i--) { keep.unshift(group[i]); k += group[i].t.length + 1; }
    group = keep;
    len = k;
  };
  for (const s of sentences) {
    if (len + s.t.length > MAX || (len >= TARGET && group.length)) emit();
    group.push(s);
    len += s.t.length + 1;
  }
  const onlyOverlap = chunks.length && chunks[chunks.length - 1].text.endsWith(group.map((s) => s.t).join(' '));
  if (group.length && !onlyOverlap) emit();
  return chunks;
}

const rows = [];
for (const seg of segments) {
  // Le titre du chapitre (une ou deux lignes) n'est pas répété dans son texte.
  let from = seg.from;
  if (seg.kind === 'section' && method !== 'taille') from += Math.max(1, titleSpan(seg.from, seg.title));
  const pieces = lines.slice(from, seg.to);
  if (!pieces.length) continue;
  const sentences = sentencesOf(pieces);
  const packed = pack(sentences);
  packed.forEach((c, idx) =>
    rows.push({
      chunk_id: `${slug}/${seg.key}/${String(idx).padStart(3, '0')}`,
      kind: seg.kind,
      chapter_number: seg.number ?? null,
      chapter_title: seg.shown ?? null,
      section: seg.kind === 'section' ? seg.shown : seg.label,
      chunk_index: idx,
      page_start: c.pStart,
      page_end: c.pEnd,
      content: c.text,
    })
  );
  if (seg.kind === 'section') {
    rows.push({
      chunk_id: `${slug}/${seg.key}/summary`,
      kind: 'chapter_summary',
      chapter_number: seg.number,
      chapter_title: seg.shown,
      section: language === 'en' ? 'Chapter summary' : 'Fiche du chapitre',
      chunk_index: 0,
      page_start: pieces[0].p,
      page_end: pieces[pieces.length - 1].p,
      content: `# ${chapterLabel} ${seg.number} : ${seg.shown}\n\n${sentences.map((s) => s.t).join(' ')}`,
    });
  }
}
if (!rows.length) throw new Error('Aucun texte exploitable après le découpage.');
const duplicateIds = rows.length - new Set(rows.map((r) => r.chunk_id)).size;
if (duplicateIds) throw new Error(`chunk_id en double : ${duplicateIds}`);

const chapters = starts.map((s) => `${s.number}. ${display(s.title, s.number, s.line)}`);
const stats = {
  method,
  chaptersFound: starts.length,
  tocProposed: toc.length,
  chapters: chapters.slice(0, 80),
  rows: rows.length,
  byKind: rows.reduce((a, r) => ((a[r.kind] = (a[r.kind] || 0) + 1), a), {}),
  maxChunkLength: Math.max(...rows.filter((r) => r.kind !== 'chapter_summary').map((r) => r.content.length)),
};
const book = { slug, title, author: String(form.auteur || '').trim() || null, language, chapter_label: chapterLabel, structure: method, chapters_found: starts.length };

return [{ json: { book, stats, rows } }];
