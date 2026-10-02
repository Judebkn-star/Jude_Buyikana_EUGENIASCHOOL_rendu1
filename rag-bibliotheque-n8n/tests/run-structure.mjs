// Teste la chaîne générique Nettoyage → Échantillon → Découpage hors n8n, sans Gemini (sa réponse est simulée).
// Livres : 3 PDF de test (tests/fixtures/*.pages.json, sortie réelle du pdf.js de n8n) et les 48 lois (data/pages.json).
// Code de sortie 1 si une assertion échoue.
import fs from 'fs';
import assert from 'assert/strict';

const src = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const fixture = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));

function pipeline(pages, form, tocAnswer) {
  const nodes = { 'On form submission': form };
  const $ = (name) => ({ first: () => ({ json: nodes[name] }) });
  const run = (file, json) => new Function('$', '$input', src(file))($, { first: () => ({ json }), all: () => [{ json }] })[0].json;
  nodes['Nettoyage'] = run('clean-generic.js', { text: pages });
  const sample = run('toc-sample.js', nodes['Nettoyage']);
  return { ...run('chunk-generic.js', tocAnswer), clean: nodes['Nettoyage'], sample };
}
const toc = (titles) => ({ text: JSON.stringify({ chapters: titles.map((title, i) => ({ number: i + 1, title })) }) });
const check = (name, r, { method, chapters, firstTitle }) => {
  console.log(`${name.padEnd(34)} méthode=${r.stats.method} chapitres=${r.stats.chaptersFound} lignes=${r.stats.rows} ${JSON.stringify(r.stats.byKind)} max=${r.stats.maxChunkLength}`);
  assert.equal(r.stats.method, method, `${name} : méthode`);
  assert.equal(r.stats.chaptersFound, chapters, `${name} : nombre de chapitres`);
  if (firstTitle) assert.match(r.stats.chapters[0], firstTitle, `${name} : titre du 1er chapitre`);
  assert.ok(r.stats.maxChunkLength <= 3200, `${name} : taille max`);
  assert.equal(r.rows.filter((x) => !x.content.trim()).length, 0, `${name} : aucun chunk vide`);
};

// --- Traité (français, « CHAPITRE I » + titre sur la ligne suivante, table des matières en tête) ---
const fr = fixture('fr-chapitres.pages.json');
const frForm = { titre: 'Traité des stratagèmes', auteur: 'Anonyme', langue: 'fr' };
const frTitles = ['De la ruse', 'De la patience', "De l'alliance", 'Du silence', 'De la réputation'];
let r = pipeline(fr, frForm, toc(frTitles));
check('FR, table des matières (titres seuls)', r, { method: 'toc', chapters: 5, firstTitle: /De la ruse/ });
assert.equal(r.book.slug, 'traite-des-stratagemes-anonyme', 'identifiant = titre + auteur');
assert.ok(r.rows.some((x) => x.chunk_id === 'traite-des-stratagemes-anonyme/ch-001/000'), 'ids slugifiés');
const r2 = pipeline(fr, { ...frForm, edition: 'trad. Dupont, 1902' }, toc(frTitles));
assert.notEqual(r2.book.slug, r.book.slug, 'une autre édition est un autre livre');
assert.equal(r2.book.title, 'Traité des stratagèmes (trad. Dupont, 1902)', 'l’édition s’affiche dans le titre');
assert.ok(!r.rows.some((x) => x.kind === 'section' && /TABLE DES MATI/i.test(x.content)), 'la table des matières reste hors des chapitres');
assert.ok(!r.rows.some((x) => /TRAITÉ DES STRATAGÈMES/.test(x.content) && x.kind === 'section'), 'titre courant retiré');
assert.ok(r.rows.some((x) => x.kind === 'back_matter'), 'index détecté en annexe');
r = pipeline(fr, frForm, toc(frTitles.map((t, i) => `Chapitre ${['I', 'II', 'III', 'IV', 'V'][i]}. ${t}`)));
check('FR, table des matières (titres longs)', r, { method: 'toc', chapters: 5, firstTitle: /^1\. De la ruse$/ });
r = pipeline(fr, frForm, toc(frTitles.map((t, i) => `CHAPITRE ${['I', 'II', 'III', 'IV', 'V'][i]}\n${t.toUpperCase()}`)));
check('FR, titres façon Gemini (saut de ligne)', r, { method: 'toc', chapters: 5 });
assert.equal(r.rows.find((x) => x.chunk_id.endsWith('ch-002/000')).chapter_title, 'DE LA PATIENCE', 'titre affiché sans préfixe ni saut de ligne');
r = pipeline(fr, frForm, { error: { message: 'quota' } });
check('FR, Gemini indisponible', r, { method: 'heuristique', chapters: 5, firstTitle: /DE LA RUSE/ });

// --- Anglais (« CHAPTER 1 » + titre sur la ligne suivante) ---
const en = fixture('en-chapters.pages.json');
const enForm = { titre: 'The Book of Tactics', auteur: '', langue: 'en' };
r = pipeline(en, enForm, toc(['On Strategy', 'On Deception', 'On Timing', 'On Allies']));
check('EN, table des matières', r, { method: 'toc', chapters: 4, firstTitle: /On Strategy/ });
assert.equal(r.book.chapter_label, 'Chapter');
r = pipeline(en, enForm, { text: 'désolé, pas de JSON' });
check('EN, réponse Gemini illisible', r, { method: 'heuristique', chapters: 4 });

// --- Sans aucune structure ---
r = pipeline(fixture('sans-structure.pages.json'), { titre: 'Essai sur la prudence', langue: 'fr' }, toc([]));
check('Sans structure', r, { method: 'taille', chapters: 1 });

// --- Les 48 lois, avec les 48 titres réels comme réponse de Gemini ---
const pagesPath = new URL('../data/pages.json', import.meta.url);
if (fs.existsSync(pagesPath)) {
  const titles = JSON.parse(fs.readFileSync(new URL('./fixtures/48-lois-titres.json', import.meta.url), 'utf8'));
  r = pipeline(JSON.parse(fs.readFileSync(pagesPath, 'utf8')), { titre: 'Les 48 lois du pouvoir', auteur: 'Robert Greene', langue: 'fr', libelle: 'Loi' }, toc(titles));
  check('48 lois (titres réels)', r, { method: 'toc', chapters: 48, firstTitle: /NE SURPASSEZ JAMAIS LE MA/ });
  assert.equal(r.book.chapter_label, 'Loi');
} else console.log('48 lois : data/pages.json absent, test ignoré');

// --- AI in Finance (ouvrage collectif EN, en-têtes courants par chapitre) : fixture hors git, test ignoré si absente ---
const aiPath = new URL('../data/ai-finance.pages.json', import.meta.url);
if (fs.existsSync(aiPath)) {
  const ai = JSON.parse(fs.readFileSync(aiPath, 'utf8'));
  const aiForm = { titre: 'AI in Finance', auteur: 'Krishan Arora & Himanshu Sharma', langue: 'English' };
  const aiTitles = ['AI-Driven Automation: Revolutionizing Financial Operations and Efficiency', 'Integrating AI with Traditional Financial Systems', 'Securing the Cloud: Mitigating Data Security and Privacy Challenges in Cloud Computing', 'Transforming Investment Management Strategies: The Impact of Intelligent Systems on Modern Financial Planning Utilizing Robo-Advisors', 'AI or Bye: Tackling Ethical Dilemmas in Financial Automation', 'Artificial Intelligence in Portfolio Management: Transforming Financial Decision-Making and Optimizing Risk Management', 'Transforming Indian Banking: The Impact of Intelligent Systems and Process Automation on Financial Innovation', 'AI, Finance, and the Future of Healthcare and Medical Tourism in Delhi', 'Role of Artificial Intelligence in Cybersecurity: Innovations and Challenges', 'Role of Industry 5.0 in Enabling Technologies for Manufacturing Systems: A Sustainability and Intelligence Perspective', 'AI-Based Real-Time Problem-Solving Using Smart Technologies'];
  r = pipeline(ai, aiForm, toc(aiTitles));
  check('AI in Finance, table des matières', r, { method: 'toc', chapters: 11, firstTitle: /AI-Driven Automation/ });
  const text = r.rows.filter((x) => x.kind === 'section').map((x) => x.content).join(' ');
  assert.equal((text.match(/B\. Mallik et al\./g) || []).length, 0, 'en-tête courant « B. Mallik et al. » retiré');
  assert.equal((text.match(/AI-Driven Automation \d+ /g) || []).length, 0, 'en-tête courant « AI-Driven Automation N » retiré');
  assert.equal(r.rows.find((x) => x.chunk_id.endsWith('ch-001/000')).page_start, 12, 'chapitre 1 page 12');
  // Gemini ne renvoie parfois que « Chapter N » (la tête du chapitre) : le titre doit venir de la table des matières.
  r = pipeline(ai, aiForm, toc(aiTitles.map((t, i) => (i === 0 ? t : `Chapter ${i + 1}`))));
  check('AI in Finance, titres nus « Chapter N »', r, { method: 'toc', chapters: 11 });
  assert.equal(r.rows.find((x) => x.chunk_id.endsWith('ch-002/000')).chapter_title, 'Integrating AI with Traditional Financial Systems', 'titre retrouvé dans la table des matières');
  assert.equal(r.rows.find((x) => x.chunk_id.endsWith('ch-004/000')).chapter_title, aiTitles[3], 'titre sur 3 lignes recollé');
  r = pipeline(ai, aiForm, { error: 'quota' });
  check('AI in Finance, sans Gemini', r, { method: 'heuristique', chapters: 11 });
  assert.equal(r.rows.find((x) => x.chunk_id.endsWith('ch-001/000')).chapter_title, aiTitles[0], 'repli : titre complet pris dans la table des matières');
} else console.log('AI in Finance : data/ai-finance.pages.json absent, test ignoré');

// --- Garde-fou : PDF sans texte ---
assert.throws(() => pipeline(['', ' ', 'x'], frForm, toc([])), /scan/, 'PDF scanné refusé');
console.log('run-structure : OK');
