// Teste src/answer-quotes.js hors n8n : seules les citations présentes dans le texte du livre gardent leurs guillemets.
import fs from 'fs';
import assert from 'assert/strict';
const code = fs.readFileSync(new URL('../src/answer-quotes.js', import.meta.url), 'utf8');
const passages = [
  { kind: 'section', text: 'Si vous êtes plus intelligent que lui, par exemple, prétendez le contraire : faites en sorte qu’il apparaisse plus intelligent que vous.' },
  { kind: 'chapter_summary', text: 'La loi enseigne qu’il ne faut jamais éclipser le maître.' },
];
const $ = () => ({ first: () => ({ json: { passages } }) });
const run = (text) => new Function('$', '$input', code)($, { first: () => ({ json: { text } }) })[0].json;

const out = run('A « jamais éclipser le maître » B « prétendez le contraire : faites en sorte qu\'il apparaisse plus intelligent que vous » C « A contrario » D “une phrase inventée par le modèle” E "une autre phrase inventée ici".');
assert.deepEqual(out.quotes, { kept: 1, unquoted: 3 });
assert.ok(out.text.includes('« prétendez le contraire'), 'vraie citation gardée (apostrophe droite tolérée)');
assert.ok(out.text.includes('A jamais éclipser le maître B'), 'citation tirée d’une fiche : guillemets retirés');
assert.ok(out.text.includes('« A contrario »'), 'extrait trop court : non touché');
assert.ok(!/[“”"]/.test(out.text), 'guillemets anglais et droits contrôlés aussi');
console.log('run-quotes : OK');
