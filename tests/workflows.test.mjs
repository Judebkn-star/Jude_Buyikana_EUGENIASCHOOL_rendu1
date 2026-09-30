// Tests des workflows n8ncli (source unique) : code des nœuds Code et note Specs du canvas.
// Usage : npm test   (rapports d'exemple écrits dans tests/sortie/)
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const DOSSIER = new URL('../n8n/workflows/', import.meta.url);

// Extrait le jsCode de chaque nœud Code, indexé par nom de nœud.
function lireNoeudsCode() {
  const noeuds = {};
  for (const fichier of readdirSync(DOSSIER).filter((f) => f.endsWith('.workflow.ts'))) {
    const texte = readFileSync(new URL(fichier, DOSSIER), 'utf8');
    // Le nom, puis éventuellement notes / notesInFlow sur la même ligne, puis le code.
    const motif = /name: '((?:\\.|[^'\\])*)',[^\n]*?parameters: \{ jsCode: '/g;
    let m;
    while ((m = motif.exec(texte))) {
      let i = motif.lastIndex;
      let litteral = '';
      while (texte[i] !== "'") {
        if (texte[i] === '\\') { litteral += texte[i] + texte[i + 1]; i += 2; } else { litteral += texte[i]; i += 1; }
      }
      noeuds[Function(`return '${m[1]}'`)()] = Function(`return '${litteral}'`)();
    }
  }
  return noeuds;
}
const CODE = lireNoeudsCode();

// Texte de la note Specs posée sur le canvas du workflow principal.
function lireNoteSpecs() {
  const texte = readFileSync(new URL('Digest Pipeline - Principal.workflow.ts', DOSSIER), 'utf8');
  let i = texte.indexOf("sticky('") + "sticky('".length;
  let litteral = '';
  while (texte[i] !== "'") {
    if (texte[i] === '\\') { litteral += texte[i] + texte[i + 1]; i += 2; } else { litteral += texte[i]; i += 1; }
  }
  return Function(`return '${litteral}'`)();
}

const run = (noeud, nodes, input = []) => {
  if (!CODE[noeud]) throw new Error(`Nœud Code introuvable dans n8n/workflows : ${noeud}`);
  const $ = (nom) => ({ first: () => nodes[nom][0], all: () => nodes[nom] });
  const $input = { first: () => input[0], all: () => input };
  return new Function('$', '$input', CODE[noeud])($, $input);
};
const CFG = { seuilRetardJours: 180, seuilInactiviteJours: 180, devise: 'EUR', inclureLundiPentecote: true, modeDiffusion: 'slack_app', canalSlackId: 'C1' };
let ok = 0;
const test = (nom, fn) => { fn(); ok += 1; console.log(`ok  ${nom}`); };

// ── Jours fériés ──
const ferie = (date, extra = {}) => run('Vérifier jour férié', { Configuration: [{ json: { ...CFG, dateReferenceForcee: date, ...extra } }] })[0].json;
test('Pâques 2027 → lundi 29/03 férié', () => assert.equal(ferie('2027-03-29').motif, 'Jour férié : Lundi de Pâques'));
test('Ascension 2027 → 06/05', () => assert.equal(ferie('2027-05-06').motif, 'Jour férié : Ascension'));
test('Lundi de Pentecôte 2026 → 25/05', () => assert.equal(ferie('2026-05-25').estJourOuvre, false));
test('Pentecôte ouvrée si paramètre à false', () => assert.equal(ferie('2026-05-25', { inclureLundiPentecote: false }).estJourOuvre, true));
test('Ascension 2030 → 30/05', () => assert.equal(ferie('2030-05-30').motif, 'Jour férié : Ascension'));
test('14 juillet 2027 (mercredi)', () => assert.equal(ferie('2027-07-14').estJourOuvre, false));
test('Samedi → week-end', () => assert.equal(ferie('2026-10-03').motif, 'Week-end'));
test('Mardi 29/09/2026 ouvré', () => assert.equal(ferie('2026-09-29').estJourOuvre, true));
test('Date forcée invalide → erreur', () => assert.throws(() => ferie('29/09/2026')));
test('Sans date forcée → date de Paris', () => assert.match(ferie('').dateReference, /^\d{4}-\d{2}-\d{2}$/));

// ── Indicateurs ──
const REF = '2026-09-29';
const opp = (o) => ({ json: { Id: o.Id, Name: o.Name, Account: { Name: 'Client <X>' }, Owner: { Name: 'Alice' }, CreatedDate: '2026-07-01T08:00:00.000+0000', ...o } });
const indicateurs = (opps, cfg = CFG) => run('Calculer indicateurs', {
  Configuration: [{ json: cfg }],
  'Vérifier jour férié': [{ json: { dateReference: REF } }],
  'Lire opportunités Salesforce': opps,
  'Lire ordre des étapes': [{ json: { MasterLabel: 'Prospection', SortOrder: 1 } }, { json: { MasterLabel: 'Négociation', SortOrder: 5 } }],
})[0].json;

const JEU = [
  opp({ Id: '1', Name: 'Saine', StageName: 'Négociation', Amount: 10000, CloseDate: '2026-09-30', LastActivityDate: '2026-09-20', LastStageChangeDate: '2026-09-01T10:00:00.000+0000' }),
  opp({ Id: '2', Name: 'Clôture dépassée', StageName: 'Prospection', Amount: 5000, CloseDate: '2026-09-15', LastActivityDate: '2026-09-01', LastStageChangeDate: '2026-08-01T10:00:00.000+0000' }),
  opp({ Id: '3', Name: 'Étape figée', StageName: 'Prospection', Amount: null, CloseDate: '2026-09-30', LastActivityDate: '2025-01-10', LastStageChangeDate: '2025-01-01T10:00:00.000+0000', CreatedDate: '2024-12-01T10:00:00.000+0000' }),
  opp({ Id: '4', Name: 'Jamais d\'activité ancienne', StageName: 'Qualification', Amount: 2500, CloseDate: '2026-09-30', LastActivityDate: null, LastStageChangeDate: null, CreatedDate: '2026-01-01T10:00:00.000+0000' }),
  opp({ Id: '5', Name: 'Jamais d\'activité récente', StageName: 'Qualification', Amount: 1000, CloseDate: '2026-09-30', LastActivityDate: null, LastStageChangeDate: null }),
];

test('Total et nombre', () => { const d = indicateurs(JEU); assert.equal(d.total, 18500); assert.equal(d.nombre, 5); assert.equal(d.nombreSansMontant, 1); });
test('Étapes triées selon Salesforce, inconnues à la fin', () => assert.deepEqual(indicateurs(JEU).parEtape.map((e) => e.etape), ['Prospection', 'Négociation', 'Qualification']));
test('Retard : clôture dépassée et étape figée', () => {
  const r = indicateurs(JEU).alertesRetard;
  assert.deepEqual(r.map((o) => o.id).sort(), ['2', '3', '4']);
  assert.match(r.find((o) => o.id === '2').motifs[0], /Clôture dépassée \(14 j\)/);
});
test('Étape jamais changée → compte depuis la création', () => assert.equal(indicateurs(JEU).alertesRetard.find((o) => o.id === '4').joursDansEtape, 271));
test('Inactivité : ancienne activité + jamais d\'activité depuis > 180 j', () => {
  const r = indicateurs(JEU).alertesInactivite;
  assert.deepEqual(r.map((o) => o.id).sort(), ['3', '4']);
  assert.equal(r.find((o) => o.id === '4').jamaisActivite, true);
});
test('Seuils lus dans la configuration', () => assert.equal(indicateurs(JEU, { ...CFG, seuilRetardJours: 9999, seuilInactiviteJours: 9999 }).alertesInactivite.length, 0));
test('Pipeline vide (item vide de alwaysOutputData)', () => { const d = indicateurs([{ json: {} }]); assert.equal(d.nombre, 0); assert.equal(d.total, 0); });

// ── Rapport HTML et résumé ──
mkdirSync(new URL('./sortie/', import.meta.url), { recursive: true });
const rapport = (d, nom) => {
  const item = run('Générer rapport HTML', {}, [{ json: d }])[0];
  const html = Buffer.from(item.binary.rapport.data, 'base64').toString('utf8');
  writeFileSync(new URL(`./sortie/${nom}.html`, import.meta.url), html);
  return { item, html };
};
test('HTML complet : sections, échappement, aucune ressource externe', () => {
  const { html, item } = rapport(indicateurs(JEU), 'rapport-complet');
  assert.equal(item.binary.rapport.fileName, `rapport-pipeline-${REF}.html`);
  assert.match(html, /Pipeline par étape/);
  assert.match(html, /Client &lt;X&gt;/);
  assert.doesNotMatch(html, /Client <X>/);
  assert.doesNotMatch(html, /(src|href)=|<link|<script|url\(/i);
  assert.match(html, /aucune activité enregistrée/);
});
test('Alertes vides → « Aucune alerte » deux fois', () => {
  const { html } = rapport(indicateurs([JEU[0]]), 'alertes-vides');
  assert.equal(html.match(/Aucune alerte/g).length, 2);
});
test('Pipeline vide → message dédié + deux « Aucune alerte »', () => {
  const { html } = rapport(indicateurs([{ json: {} }]), 'pipeline-vide');
  assert.match(html, /Aucune opportunité ouverte/);
  assert.equal(html.match(/Aucune alerte/g).length, 2);
});
test('Résumé Slack en français', () => {
  const { item } = rapport(indicateurs(JEU), 'rapport-complet');
  const r = run('Rédiger résumé Slack', { Configuration: [{ json: CFG }] }, [item])[0];
  assert.match(r.json.texte, /^Pipeline commercial du 29\/09\/2026 \(trimestre fiscal en cours\) : 18\s500\s€ sur 5 opportunités\./);
  assert.ok(r.binary.rapport);
  const vide = run('Rédiger résumé Slack', { Configuration: [{ json: CFG }] }, [rapport(indicateurs([{ json: {} }]), 'pipeline-vide').item])[0];
  assert.match(vide.json.texte, /0\s€ sur 0 opportunité\./);
});

// ── Alerte d'échec ──
test('Alerte d\'échec sans données métier', () => {
  const r = run('Formater alerte sans données', {}, [{ json: { workflow: { name: 'Digest' }, execution: { lastNodeExecuted: 'Lire opportunités Salesforce', error: { message: 'INVALID_FIELD' }, url: 'http://localhost:5678/x' } } }])[0].json;
  assert.match(r.corps, /Nœud en échec : Lire opportunités Salesforce/);
  assert.match(r.corps, /INVALID_FIELD/);
});

// ── Specs ──
test('Note Specs du canvas identique à docs/specs.md', () => {
  const specs = readFileSync(new URL('../docs/specs.md', import.meta.url), 'utf8');
  assert.equal(lireNoteSpecs(), specs, 'La note Specs du workflow principal diverge de docs/specs.md : recopier l\'une dans l\'autre');
});

console.log(`\n${ok} tests passés`);
