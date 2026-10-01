// À lancer après chaque `n8ncli push` : corrige ce que le push écrase côté n8n.
//  1. Workflow A : réépingle la sortie réelle de l'extraction (data/pin-ingestion-A.json).
//  2. Workflow C : remet le webhookId fixe du chat, pour que l'URL du chat ne change pas.
//  3. Republie A, B et C : un push ne modifie que le brouillon, la version publiée resterait l'ancienne.
// Usage : node scripts/post-push.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BASE = 'http://localhost:5678/api/v1';
const apiKey = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.n8ncli-global.json'), 'utf8')).environments.local.apiKey;
const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };
const SETTINGS = ['executionOrder', 'saveManualExecutions', 'callerPolicy', 'errorWorkflow', 'timezone', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress', 'executionTimeout'];

export const WF = { ingestion: 'YkebzK0aKqfvoJfw', augmentation: 'Qlh0nO72Mbq7tIRM', answering: 'UwfDLlHjK7X315aK' };
export const CHAT_WEBHOOK_ID = '6f9792c4-9e03-4f4a-bc44-8664b907b3c8';

async function update(id, change) {
  const wf = await (await fetch(`${BASE}/workflows/${id}`, { headers })).json();
  const body = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: Object.fromEntries(Object.entries(wf.settings || {}).filter(([k]) => SETTINGS.includes(k))),
    pinData: wf.pinData || {},
  };
  change(body);
  const res = await fetch(`${BASE}/workflows/${id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
  const out = await res.json();
  if (!res.ok) throw new Error(`${wf.name} : ${out.message || res.status}`);
  if (wf.active) execSync(`n8ncli unpublish ${id} && n8ncli publish ${id}`, { cwd: root, stdio: 'ignore' });
  return out;
}

// Données de test de A (sortie réelle d'une extraction) : facultatives, hors git car elles contiennent le texte d'un livre.
const PIN_FILE = path.join(root, 'data/pin-ingestion-A.json');
const pin = fs.existsSync(PIN_FILE) ? JSON.parse(fs.readFileSync(PIN_FILE, 'utf8')) : null;
const a = await update(WF.ingestion, (b) => {
  if (pin) b.pinData = Object.fromEntries(Object.entries(pin).map(([node, items]) => [node, items.map((json) => ({ json }))]));
});
console.log('A :', pin ? `nœuds épinglés : ${Object.keys(a.pinData || {}).join(', ')}` : 'pas de données de test (data/pin-ingestion-A.json absent), republié');

const c = await update(WF.answering, (b) => {
  for (const n of b.nodes) if (n.type.endsWith('chatTrigger')) n.webhookId = CHAT_WEBHOOK_ID;
});
const chatUrl = `http://localhost:5678/webhook/${c.nodes.find((n) => n.type.endsWith('chatTrigger')).webhookId}/chat`;
console.log('C : chat :', chatUrl);

const b = await update(WF.augmentation, () => {});
console.log('B : republié :', b.name);
