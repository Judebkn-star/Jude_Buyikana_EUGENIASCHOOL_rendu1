// Code node « Nettoyage » (Run Once for All Items) — générique, pour n'importe quel livre.
// Entrée : sortie d'Extract from File avec joinPages = false → $json.text = tableau de pages.
// Sortie : un item { pageCount, lines: [{ p, t }], removed } — p = page du PDF (1-based).
// Retire ce qui se répète en haut ou en bas des pages (titre courant, nom d'auteur, numéro de page),
// repéré par fréquence : on ne connaît pas le livre, donc on ne cherche aucun motif précis.

const EDGE = 2; // lignes examinées en haut et en bas de chaque page
const pages = $input.first().json.text;
if (!Array.isArray(pages) || pages.length === 0) {
  throw new Error('Extract from File doit sortir un tableau de pages (option joinPages désactivée).');
}

const byPage = pages.map((txt) =>
  String(txt || '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
);
const totalChars = byPage.flat().join(' ').length;
if (totalChars < 2000) {
  throw new Error(`Ce PDF ne contient presque pas de texte (${totalChars} caractères) : c'est probablement un scan. Il faut un PDF avec une couche texte.`);
}

// Forme normalisée d'une ligne de bord : les chiffres deviennent # (« Chapitre 3 — 41 » et « Chapitre 3 — 42 » se ressemblent).
const shape = (l) => l.toLowerCase().replace(/\d+/g, '#').replace(/[ivxlcdm]+$/i, '#').replace(/\s+/g, ' ').trim();
const isPageNumber = (l) => /^(page\s*)?[-–— ]*(\d{1,4}|[ivxlcdm]{1,7})[-–— ]*$/i.test(l);

const counts = {};
for (const lines of byPage) {
  const edges = new Set([...lines.slice(0, EDGE), ...lines.slice(-EDGE)].map(shape));
  for (const s of edges) counts[s] = (counts[s] ?? 0) + 1;
}
// Deux sortes d'en-têtes courants :
//  - avec numéro de page (« AI-Driven Automation # », « # B. Mallik et al. ») : souvent propres à un chapitre,
//    donc rares à l'échelle du livre → 3 occurrences suffisent ;
//  - sans chiffre (titre du livre, copyright en pied de page) : au moins 3 % des pages.
// Un titre de chapitre en haut de page (« CHAPITRE # ») se répète aussi : ce n'est pas un en-tête courant.
const HEADING = /^(chapitre|chapter|chap\.?|livre|book|partie|part|loi|law|section|lettre|letter) #/;
const minPlain = Math.max(3, Math.ceil(byPage.length * 0.03));
const isRunning = ([s, n]) => s.length > 0 && s.length <= 90 && !HEADING.test(s) && (s.includes('#') ? n >= 3 : n >= minPlain);
const running = new Set(Object.entries(counts).filter(isRunning).map(([s]) => s));

const out = [];
const removed = {};
byPage.forEach((lines, i) => {
  lines.forEach((t, j) => {
    const atEdge = j < EDGE || j >= lines.length - EDGE;
    if (atEdge && (running.has(shape(t)) || isPageNumber(t))) {
      removed[shape(t)] = (removed[shape(t)] ?? 0) + 1;
      return;
    }
    out.push({ p: i + 1, t });
  });
});

return [{ json: { pageCount: pages.length, lineCount: out.length, removed, lines: out } }];
