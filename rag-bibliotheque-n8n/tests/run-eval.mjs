// Mesure la qualité du RAG sur tests/questions.json en interrogeant le chat (workflow C).
// Réussite d'une question du livre : au moins une loi de `expected` dans les sources retenues, et pas de refus.
// Réussite d'une question hors sujet : la réponse commence par « Le livre ne répond pas à cette question. ».
// Objectif (Specs.md) : 14/15 questions du livre, 3/3 refus.
// Usage : node tests/run-eval.mjs [id,id,...]      (ex. node tests/run-eval.mjs S1,A4 pour rejouer des échecs)
import fs from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CHAT = 'http://localhost:5678/webhook/6f9792c4-9e03-4f4a-bc44-8664b907b3c8/chat';
const PAUSE_MS = 8000; // le quota gratuit est partagé avec l'ingestion
const REFUSAL = 'Le livre ne répond pas à cette question';

const only = process.argv[2]?.split(',');
const { questions } = JSON.parse(fs.readFileSync(path.join(root, 'tests/questions.json'), 'utf8'));
const todo = only ? questions.filter((q) => only.includes(q.id)) : questions;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lawsOf = (sources) => [...new Set(sources.filter((s) => s.startsWith("Les 48 lois du pouvoir")).map((s) => Number(s.match(/Loi (\d+)/)?.[1])).filter(Boolean))];

async function ask(q) {
  const res = await fetch(CHAT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'sendMessage', sessionId: `eval-${q.id}-${Date.now()}`, chatInput: q.question }),
    signal: AbortSignal.timeout(240000),
  });
  const body = await res.json();
  return Array.isArray(body) ? body[0] : body;
}

const results = [];
for (const q of todo) {
  let r;
  try {
    r = await ask(q);
  } catch (e) {
    r = { error: String(e) };
  }
  const output = r.output ?? '';
  const sources = r.sources ?? [];
  const laws = lawsOf(sources);
  const refused = output.trim().startsWith(REFUSAL);
  let pass;
  let why;
  if (r.error || r.message) {
    pass = false;
    why = `erreur : ${r.error ?? r.message}`;
  } else if (q.type === 'hors_sujet') {
    pass = refused;
    why = refused ? 'refus' : `pas de refus (lois ${laws.join(',') || '—'})`;
  } else {
    const hit = q.expected.filter((n) => laws.includes(n));
    pass = hit.length > 0 && !refused;
    why = refused ? 'refus à tort' : hit.length ? `trouvé ${hit.join(',')}` : `attendu ${q.expected.join('/')}, trouvé ${laws.join(',') || '—'}`;
  }
  const relevant = [...(q.expected ?? []), ...(q.also ?? [])];
  const coverage = relevant.length ? relevant.filter((n) => laws.includes(n)).length : null;
  results.push({ ...q, pass, why, laws, coverage, relevant: relevant.length, query: r.query, reranked: r.reranked, quotes: r.quotes, sources, output });
  console.log(`${pass ? '✅' : '❌'} ${q.id.padEnd(3)} ${q.type.padEnd(11)} ${why}${coverage !== null && q.type === 'synthese' ? ` · couverture ${coverage}/${relevant.length}` : ''}`);
  await sleep(PAUSE_MS);
}

const book = results.filter((r) => r.type !== 'hors_sujet');
const off = results.filter((r) => r.type === 'hors_sujet');
const quotes = results.reduce((a, r) => ({ kept: a.kept + (r.quotes?.kept ?? 0), unquoted: a.unquoted + (r.quotes?.unquoted ?? 0) }), { kept: 0, unquoted: 0 });
const summary = {
  date: new Date().toISOString(),
  livre: `${book.filter((r) => r.pass).length}/${book.length}`,
  hors_sujet: `${off.filter((r) => r.pass).length}/${off.length}`,
  par_type: Object.fromEntries(['factuelle', 'application', 'synthese', 'historique'].map((t) => [t, `${book.filter((r) => r.type === t && r.pass).length}/${book.filter((r) => r.type === t).length}`])),
  citations: quotes,
  reranking_echoue: results.filter((r) => r.reranked === false).map((r) => r.id),
};
console.log('\n' + JSON.stringify(summary, null, 1));

fs.mkdirSync(path.join(root, 'tests/results'), { recursive: true });
const file = path.join(root, `tests/results/eval-${summary.date.replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify({ summary, results }, null, 1));
console.log(`Détail (réponses complètes) : ${path.relative(root, file)}`);
