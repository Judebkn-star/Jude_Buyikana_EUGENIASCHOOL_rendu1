// Code node « Parser la fiche » (Run Once for All Items) — workflow B, flux 1.
// Entrée : sortie de la chaîne Gemini ({ text } ou { error }). Sortie : { chunk_id, ok, augmentation | error }.

const prepared = $('Préparer la fiche').all();
const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

return $input.all().map((item, i) => {
  const r = prepared[item.pairedItem?.item ?? i].json;
  const fail = (error) => ({ json: { chunk_id: r.chunk_id, ok: false, error: String(error).slice(0, 500) } });
  if (item.json.error) return fail(`Gemini : ${item.json.error?.message ?? JSON.stringify(item.json.error)}`);
  const raw = String(item.json.text ?? '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  let a;
  try {
    a = JSON.parse(raw);
  } catch (e) {
    return fail(`JSON invalide : ${raw.slice(0, 200)}`);
  }
  if (!a.summary || String(a.summary).length < 80) return fail('Fiche sans résumé exploitable');
  return {
    json: {
      chunk_id: r.chunk_id,
      ok: true,
      augmentation: { summary: String(a.summary).trim(), themes: list(a.themes), people: list(a.people), questions: list(a.questions) },
    },
  };
});
