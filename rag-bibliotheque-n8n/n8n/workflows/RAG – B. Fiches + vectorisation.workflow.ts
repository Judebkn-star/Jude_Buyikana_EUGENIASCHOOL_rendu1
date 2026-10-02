const gemini_fiche = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', version: 1, config: { name: "Gemini (fiche)", parameters: { modelName: 'models/gemini-flash-lite-latest', options: { temperature: 0.2, maxOutputTokens: 1536, safetySettings: { values: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' }, { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' }, { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }] } } }, credentials: { googlePalmApi: newCredential("Google Gemini(PaLM) Api account", "8bteJSzjH1yskWwc") }, position: [880, 220] } });

const schedule = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: { name: 'Toutes les 2 minutes', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 2 }] } }, position: [0, 200], notes: 'Flux 1 : fiches des chapitres. Flux 2 : vectorisation des morceaux prêts.', notesInFlow: true }
});

const config = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Config', parameters: { assignments: { assignments: [{ id: 'fiches', name: 'fiches', value: 4, type: 'number' }, { id: 'chunks', name: 'chunks', value: 40, type: 'number' }, { id: 'budget', name: 'budget', value: 300, type: 'number' }] }, options: {} }, position: [220, 200], notes: 'fiches = chapitres par passage ; chunks = morceaux vectorisés par passage ; budget = fiches max par jour (le reste du quota gratuit va au chat).', notesInFlow: true }
});

const reserver_fiches = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: "Réserver des chapitres", parameters: { operation: 'executeQuery', query: "with cfg as (select $1::jsonb as c),\npicked as (\n  select ch.chunk_id from public.chunks ch, cfg\n  where ch.kind = 'chapter_summary' and ch.augmentation is null and (ch.status = 'pending'\n         or (ch.status = 'error' and ch.attempts < 5 and ch.updated_at < now() - interval '10 minutes')\n         or (ch.status = 'processing' and ch.updated_at < now() - interval '15 minutes'))\n  order by ch.book_id, ch.chapter_number\n  limit (select greatest(0, least((c->>'fiches')::int, (c->>'budget')::int - (\n           select count(*) from public.chunks\n           where kind = 'chapter_summary' and updated_at >= (date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')\n             and (augmentation is not null or status = 'error'))))\n         from cfg)\n  for update skip locked\n), claimed as (\n  update public.chunks ch set status = 'processing', attempts = ch.attempts + 1, updated_at = now(), last_error = null\n  from picked where ch.chunk_id = picked.chunk_id\n  returning ch.*\n)\nselect c.chunk_id, c.chapter_number, c.chapter_title, c.content, b.title as book_title, b.author as book_author, b.chapter_label, b.language\nfrom claimed c join public.books b on b.id = c.book_id\norder by c.chunk_id;", options: { queryReplacement: expr("{{ JSON.stringify({ fiches: $json.fiches, budget: $json.budget }) }}") } }, credentials: { postgres: newCredential("Postgres RAG", "aG4DOChSnMwF6A9F") }, position: [440, 0] }
});

const prompt_fiche = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: "Préparer la fiche", parameters: { jsCode: "// Code node « Préparer la fiche » (Run Once for All Items) — workflow B, flux 1.\n// Entrée : chapitres réservés (lignes chapter_summary : texte complet du chapitre + infos du livre).\n// Sortie : un item par chapitre avec { ...ligne, prompt }. Une fiche = un seul appel Gemini par chapitre.\n\nconst MAX_CHARS = 150000; // un chapitre très long est tronqué : la fiche reste un résumé\n\nreturn $input.all().map(({ json: r }) => {\n  const text = r.content.length > MAX_CHARS ? `${r.content.slice(0, MAX_CHARS)}\\n[…texte tronqué…]` : r.content;\n  const book = `« ${r.book_title} »${r.book_author ? ` (${r.book_author})` : ''}`;\n  const lang = r.language === 'en' ? 'Le livre est en anglais : écris la fiche en français, garde les noms propres tels quels.' : '';\n  const prompt = [\n    `Tu rédiges la fiche de synthèse d'un chapitre du livre ${book} pour un moteur de recherche.`,\n    `${r.chapter_label} ${r.chapter_number} : ${r.chapter_title}.`,\n    lang,\n    'Texte complet du chapitre :',\n    '\"\"\"',\n    text,\n    '\"\"\"',\n    'Réponds uniquement avec un objet JSON valide, sans texte autour ni bloc de code.',\n    'Format : {\"summary\": \"150 à 250 mots : la thèse du chapitre, ses exemples principaux, ses nuances\", \"themes\": [\"5 à 8 thèmes courts\"], \"people\": [\"personnages historiques, auteurs et œuvres cités, forme canonique\"], \"questions\": [\"3 à 5 questions auxquelles ce chapitre répond\"]}',\n  ]\n    .filter(Boolean)\n    .join('\\n');\n  return { json: { ...r, prompt } };\n});\n" }, position: [660, 0], notes: "Source : src/fiche-prompt.js", notesInFlow: true }
});

const fiche = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { name: 'Fiche du chapitre', parameters: { promptType: 'define', text: expr('{{ $json.prompt }}'), batching: { batchSize: 1, delayBetweenBatches: 7000 } }, onError: 'continueRegularOutput', position: [880, 0], notes: '5. Augmentation : 1 appel Gemini par chapitre, 7 s entre deux appels.', notesInFlow: true, subnodes: { model: gemini_fiche } }
});

const parser_fiche = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: "Parser la fiche", parameters: { jsCode: "// Code node « Parser la fiche » (Run Once for All Items) — workflow B, flux 1.\n// Entrée : sortie de la chaîne Gemini ({ text } ou { error }). Sortie : { chunk_id, ok, augmentation | error }.\n\nconst prepared = $('Préparer la fiche').all();\nconst list = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);\n\nreturn $input.all().map((item, i) => {\n  const r = prepared[item.pairedItem?.item ?? i].json;\n  const fail = (error) => ({ json: { chunk_id: r.chunk_id, ok: false, error: String(error).slice(0, 500) } });\n  if (item.json.error) return fail(`Gemini : ${item.json.error?.message ?? JSON.stringify(item.json.error)}`);\n  const raw = String(item.json.text ?? '').replace(/^\\s*```(?:json)?\\s*/i, '').replace(/\\s*```\\s*$/, '');\n  let a;\n  try {\n    a = JSON.parse(raw);\n  } catch (e) {\n    return fail(`JSON invalide : ${raw.slice(0, 200)}`);\n  }\n  if (!a.summary || String(a.summary).length < 80) return fail('Fiche sans résumé exploitable');\n  return {\n    json: {\n      chunk_id: r.chunk_id,\n      ok: true,\n      augmentation: { summary: String(a.summary).trim(), themes: list(a.themes), people: list(a.people), questions: list(a.questions) },\n    },\n  };\n});\n" }, position: [1100, 0], notes: "Source : src/fiche-parse.js", notesInFlow: true }
});

const fiche_ok = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: { name: 'Fiche valide ?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 }, conditions: [{ id: 'ok', leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }, position: [1320, 0] }
});

const enregistrer_fiches = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: "Enregistrer les fiches", parameters: { operation: 'executeQuery', query: "with u as (\n  update public.chunks c set augmentation = x.augmentation, status = 'pending', last_error = null, updated_at = now()\n  from jsonb_to_recordset($1::jsonb) as x(chunk_id text, augmentation jsonb)\n  where c.chunk_id = x.chunk_id\n  returning c.chunk_id\n)\nselect (select count(*) from u)::int as fiches;", options: { queryReplacement: expr("{{ JSON.stringify($input.all().map(i => ({ chunk_id: i.json.chunk_id, augmentation: i.json.augmentation }))) }}") } }, credentials: { postgres: newCredential("Postgres RAG", "aG4DOChSnMwF6A9F") }, executeOnce: true, position: [1540, -80] }
});

const fiches_en_erreur = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: "Fiches en erreur", parameters: { operation: 'executeQuery', query: "with u as (\n  update public.chunks c\n  set status = 'error', last_error = x.error, updated_at = now(),\n      attempts = case when x.error ~* '(too many requests|quota|429|rate limit|fetch failed|ECONN|ETIMEDOUT|socket hang up|network|50[0-9]|internal error|unavailable|overloaded|at least 1 dimension)' then c.attempts - 1 else c.attempts end\n  from jsonb_to_recordset($1::jsonb) as x(chunk_id text, error text)\n  where c.chunk_id = x.chunk_id\n  returning c.chunk_id\n)\nselect (select count(*) from u)::int as errors;", options: { queryReplacement: expr("{{ JSON.stringify($input.all().map(i => ({ chunk_id: i.json.chunk_id, error: i.json.error }))) }}") } }, credentials: { postgres: newCredential("Postgres RAG", "aG4DOChSnMwF6A9F") }, executeOnce: true, position: [1540, 80] }
});

const reserver_morceaux = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: "Réserver des morceaux", parameters: { operation: 'executeQuery', query: "with cfg as (select $1::jsonb as c),\npicked as (\n  select ch.chunk_id from public.chunks ch, cfg\n  where (ch.status = 'pending'\n         or (ch.status = 'error' and ch.attempts < 5 and ch.updated_at < now() - interval '10 minutes')\n         or (ch.status = 'processing' and ch.updated_at < now() - interval '15 minutes'))\n    and ((ch.kind = 'chapter_summary' and ch.augmentation is not null)\n      or (ch.kind <> 'chapter_summary' and (ch.chapter_number is null or exists (\n            select 1 from public.chunks s\n            where s.book_id = ch.book_id and s.chapter_number = ch.chapter_number\n              and s.kind = 'chapter_summary' and s.augmentation is not null))))\n  order by ch.book_id, ch.chunk_id\n  limit (select (c->>'chunks')::int from cfg)\n  for update skip locked\n), claimed as (\n  update public.chunks ch set status = 'processing', attempts = ch.attempts + 1, updated_at = now(), last_error = null\n  from picked where ch.chunk_id = picked.chunk_id\n  returning ch.*\n), purge as (\n  delete from public.documents d using claimed where d.metadata->>'chunk_id' = claimed.chunk_id\n)\nselect c.chunk_id, c.kind, c.book_id, c.chapter_number, c.chapter_title, c.section, c.page_start, c.page_end, c.content,\n       b.title as book_title, b.author as book_author, b.chapter_label, b.language, s.augmentation as chapter_fiche\nfrom claimed c\njoin public.books b on b.id = c.book_id\nleft join public.chunks s on s.book_id = c.book_id and s.chapter_number = c.chapter_number and s.kind = 'chapter_summary'\norder by c.chunk_id;", options: { queryReplacement: expr("{{ JSON.stringify({ chunks: $json.chunks }) }}") } }, credentials: { postgres: newCredential("Postgres RAG", "aG4DOChSnMwF6A9F") }, position: [440, 400] }
});

const texte_a_vectoriser = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: "Texte à vectoriser", parameters: { jsCode: "// Code node « Texte à vectoriser » (Run Once for All Items) — workflow B, flux 2.\n// Entrée : lignes réservées (chunks + infos du livre + fiche de leur chapitre). Sortie : un item par ligne avec\n// embed_text (ce qui est vectorisé) et les champs de métadonnées. Aucun appel Gemini ici : le contexte vient de la fiche.\n\nconst CONTEXT_CHARS = 600; // début de la fiche, ajouté à chaque chunk du chapitre\n\nreturn $input.all().map(({ json: r }) => {\n  const fiche = r.chapter_fiche || {};\n  const where = r.chapter_number ? `${r.chapter_label} ${r.chapter_number} : ${r.chapter_title}` : r.section;\n  const head = `${r.book_title}${r.book_author ? ` (${r.book_author})` : ''}\\n${where}`;\n  let embed_text;\n  let raw_text;\n  if (r.kind === 'chapter_summary') {\n    raw_text = fiche.summary || '';\n    embed_text = `${head}\\nFiche du chapitre\\n${fiche.summary || ''}\\nThèmes : ${(fiche.themes || []).join(', ')}\\nQuestions : ${(fiche.questions || []).join(' ')}`;\n  } else {\n    raw_text = r.content;\n    const ctx = fiche.summary ? `\\nContexte du chapitre : ${fiche.summary.slice(0, CONTEXT_CHARS)}` : '';\n    embed_text = `${head}${r.kind === 'section' ? '' : `\\n${r.section}`}${ctx}\\n\\n${r.content}`;\n  }\n  return {\n    json: {\n      chunk_id: r.chunk_id,\n      kind: r.kind,\n      book_id: r.book_id,\n      book_title: r.book_title,\n      book_author: r.book_author || '',\n      chapter_label: r.chapter_label,\n      chapter_number: r.chapter_number,\n      chapter_title: r.chapter_title || '',\n      section: r.section,\n      page_start: r.page_start,\n      page_end: r.page_end,\n      raw_text,\n      context: (fiche.summary || '').slice(0, CONTEXT_CHARS),\n      keywords: fiche.themes || [],\n      questions: fiche.questions || [],\n      people: fiche.people || [],\n      embed_text,\n    },\n  };\n});\n" }, position: [660, 400], notes: "Source : src/embed-text.js", notesInFlow: true }
});

const embeddings_http = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Embeddings Gemini (HTTP)', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr("{{ JSON.stringify({ requests: $input.all().map(i => ({ model: 'models/gemini-embedding-001', content: { role: 'user', parts: [{ text: String(i.json.embed_text).replace(/\\n/g, ' ') }] } })) }) }}"), options: {} }, credentials: { googlePalmApi: newCredential("Google Gemini(PaLM) Api account", "8bteJSzjH1yskWwc") }, executeOnce: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 30000, onError: 'continueRegularOutput', position: [880, 400], notes: '6. Vectorisation : un appel batchEmbedContents pour tout le lot (3072 dim). Quota limité par minute : 40 morceaux / 2 min ; 3 essais espacés de 30 s.', notesInFlow: true }
});

const preparer_insertion = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: "Préparer l’insertion", parameters: { jsCode: "// Code node « Préparer l'insertion » (Run Once for All Items) — workflow B, flux 2.\n// Entrées : $('Texte à vectoriser') (un item par morceau) et la réponse de l'appel HTTP batchEmbedContents\n//           ({ embeddings: [{ values: [...] }, ...] } dans l'ordre des morceaux, ou { error } si Gemini a refusé).\n// Sortie : un item { rows, missing, error } ; rows = lignes de la table `documents`.\n// Un morceau sans vecteur n'est pas inséré : « Marquer done » le repasse en erreur, repris plus tard.\n\nconst items = $('Texte à vectoriser').all().map((i) => i.json);\nconst res = $input.first().json;\nconst vectors = Array.isArray(res.embeddings) ? res.embeddings.map((e) => e?.values || []) : [];\nconst LISTS = ['keywords', 'questions', 'people'];\nconst META = ['chunk_id', 'kind', 'book_id', 'book_title', 'book_author', 'chapter_label', 'chapter_number', 'chapter_title', 'section', 'page_start', 'page_end', 'raw_text', 'context'];\n\nconst rows = [];\nitems.forEach((it, i) => {\n  const v = vectors[i];\n  if (!v || v.length === 0) return;\n  const metadata = Object.fromEntries(META.map((k) => [k, it[k] ?? '']));\n  for (const k of LISTS) metadata[k] = (it[k] || []).join(' | ');\n  rows.push({ content: it.embed_text, metadata, embedding: JSON.stringify(v) });\n});\n\nconst error = res.error ? String(res.error.message ?? res.error).slice(0, 300) : null;\nreturn [{ json: { rows, missing: items.length - rows.length, error } }];\n" }, position: [1100, 400], notes: "Source : src/embed-rows.js", notesInFlow: true }
});

const inserer_vecteurs = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: "Insérer les vecteurs", parameters: { operation: 'executeQuery', query: "with r as (\n  select * from jsonb_to_recordset($1::jsonb) as x(content text, metadata jsonb, embedding text)\n), ins as (\n  insert into public.documents (content, metadata, embedding)\n  select r.content, r.metadata, r.embedding::extensions.vector from r\n  on conflict ((metadata ->> 'chunk_id')) do nothing\n  returning id\n)\nselect (select count(*) from ins)::int as inserted;", options: { queryReplacement: expr("{{ JSON.stringify($json.rows) }}") } }, credentials: { postgres: newCredential("Postgres RAG", "aG4DOChSnMwF6A9F") }, position: [1320, 400] }
});

const marquer_done = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: "Marquer done", parameters: { operation: 'executeQuery', query: "with ids as (\n  select jsonb_array_elements_text($1::jsonb) as chunk_id\n), ok as (\n  update public.chunks c set status = 'done', last_error = null, updated_at = now()\n  from ids where c.chunk_id = ids.chunk_id\n    and exists (select 1 from public.documents d where d.metadata->>'chunk_id' = c.chunk_id)\n  returning c.chunk_id\n), ko as (\n  update public.chunks c set status = 'error', attempts = greatest(c.attempts - 1, 0), updated_at = now(),\n    last_error = 'Vectorisation : aucun vecteur enregistré (quota d''embeddings par minute ?)'\n  from ids where c.chunk_id = ids.chunk_id\n    and not exists (select 1 from public.documents d where d.metadata->>'chunk_id' = c.chunk_id)\n  returning c.chunk_id\n)\nselect (select count(*) from ok)::int as done,\n       (select count(*) from ko)::int as without_vector,\n       ((select count(*) from public.chunks where status <> 'done') - (select count(*) from ok))::int as remaining,\n       (select count(*) from public.chunks where status = 'error' and attempts >= 5)::int as abandoned;", options: { queryReplacement: expr("{{ JSON.stringify($('Texte à vectoriser').all().map(i => i.json.chunk_id)) }}") } }, credentials: { postgres: newCredential("Postgres RAG", "aG4DOChSnMwF6A9F") }, executeOnce: true, position: [1540, 400] }
});

const wf = workflow('rag48IngestB', 'RAG – B. Fiches + vectorisation', { description: 'Planifié : une fiche Gemini par chapitre, puis vectorisation des morceaux avec le contexte de leur chapitre.', executionOrder: 'v1' });

// Deux flux depuis la même sortie de Config (un tableau dans .to() brancherait le 2e sur une sortie 1 inexistante).
export default wf
  .add(schedule)
  .to(config)
  .to(reserver_fiches)
  .to(prompt_fiche)
  .to(fiche)
  .to(parser_fiche)
  .to(fiche_ok.onTrue(enregistrer_fiches).onFalse(fiches_en_erreur))
  .add(config.to(reserver_morceaux).to(texte_a_vectoriser).to(embeddings_http).to(preparer_insertion).to(inserer_vecteurs).to(marquer_done))
