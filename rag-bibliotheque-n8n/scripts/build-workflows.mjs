// Génère n8n/workflows/*.workflow.ts en injectant le code de src/*.js dans les Code nodes.
// src/ est la source de vérité (tests : tests/run-all.sh) ; ne pas éditer le jsCode dans n8n.
// Version « bibliothèque » : n'importe quel livre PDF (FR/EN), plusieurs livres interrogeables ensemble.
// Les noms de fichiers suivent les noms des workflows : n8ncli les renomme ainsi au push et y rattache les identifiants.
// Changer le nom d'un workflow → renommer aussi le fichier ici, sinon le push suivant créerait un doublon.
// Usage : node scripts/build-workflows.mjs
import fs from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const q = (s) => JSON.stringify(s);

const CREDS = JSON.parse(fs.readFileSync(path.join(root, 'n8n/config/credentials.json'), 'utf8'));
const cred = (k) => `newCredential(${q(CREDS[k].name)}${CREDS[k].id ? `, ${q(CREDS[k].id)}` : ''})`;

const SAFETY = `safetySettings: { values: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' }, { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' }, { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }] }`;
const gemini = (name, x, y, maxTokens) =>
  `languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', version: 1, config: { name: ${q(name)}, parameters: { modelName: 'models/gemini-flash-lite-latest', options: { temperature: 0.2, maxOutputTokens: ${maxTokens}, ${SAFETY} } }, credentials: { googlePalmApi: ${cred('gemini')} }, position: [${x}, ${y}] } })`;
const code = (varName, name, file, x, y, extra = '') =>
  `const ${varName} = node({\n  type: 'n8n-nodes-base.code',\n  version: 2,\n  config: { name: ${q(name)}, parameters: { jsCode: ${q(src(file))} }, ${extra}position: [${x}, ${y}], notes: ${q(`Source : src/${file}`)}, notesInFlow: true }\n});`;
const pg = (varName, name, sql, replacement, x, y, extra = '') =>
  `const ${varName} = node({\n  type: 'n8n-nodes-base.postgres',\n  version: 2.7,\n  config: { name: ${q(name)}, parameters: { operation: 'executeQuery', query: ${q(sql)}, options: { queryReplacement: expr(${q(replacement)}) } }, credentials: { postgres: ${cred('postgres')} }, ${extra}position: [${x}, ${y}] }\n});`;

// Un refus de quota (429) ou une panne réseau / serveur ne dit rien du chunk : on rend la tentative.
const ERROR_SQL = `with u as (
  update public.chunks c
  set status = 'error', last_error = x.error, updated_at = now(),
      attempts = case when x.error ~* '(too many requests|quota|429|rate limit|fetch failed|ECONN|ETIMEDOUT|socket hang up|network|50[0-9]|internal error|unavailable|overloaded|at least 1 dimension)' then c.attempts - 1 else c.attempts end
  from jsonb_to_recordset($1::jsonb) as x(chunk_id text, error text)
  where c.chunk_id = x.chunk_id
  returning c.chunk_id
)
select (select count(*) from u)::int as errors;`;

// =====================================================================================================
// Workflow A : ingestion d'un livre (formulaire)
// =====================================================================================================
const TOC_PROMPT = `Tu reconstitues la liste des chapitres d'un livre à partir de son texte extrait d'un PDF.
Livre : « {{ $('On form submission').first().json.titre }} »{{ $('On form submission').first().json.auteur ? ' de ' + $('On form submission').first().json.auteur : '' }}.

Début du livre (souvent la table des matières) :
"""
{{ $json.sample }}
"""

Lignes du livre entier qui ressemblent à des titres ([l.numéro de ligne p.page] texte) :
"""
{{ $json.headings }}
"""

Donne les chapitres principaux dans l'ordre (pas les sous-parties, ni la préface, l'index ou la table des matières).
Pour chaque chapitre, recopie son titre exactement comme il apparaît en tête du chapitre dans le texte (même casse, même ponctuation, sans numéro de page).
Si le livre n'a pas de chapitres identifiables, renvoie une liste vide.
Réponds uniquement avec un objet JSON valide, sans texte autour : {"chapters": [{"number": 1, "title": "..."}]}`;

const INSERT_SQL = `with input_book as (
  select * from jsonb_to_record($1::jsonb) as x(slug text, title text, author text, language text, chapter_label text, structure text, chapters_found int)
), b as (
  -- un livre déjà présent (même titre) n'est pas réingéré : rien n'est inséré
  insert into public.books (slug, title, author, language, chapter_label, structure, chapters_found)
  select slug, title, author, language, chapter_label, structure, chapters_found from input_book
  on conflict (slug) do nothing
  returning id
), input as (
  select * from jsonb_to_recordset($2::jsonb) as r(chunk_id text, kind text, chapter_number int, chapter_title text, section text, chunk_index int, page_start int, page_end int, content text)
), ins as (
  insert into public.chunks (book_id, chunk_id, kind, chapter_number, chapter_title, section, chunk_index, page_start, page_end, content)
  select b.id, i.chunk_id, i.kind, i.chapter_number, i.chapter_title, i.section, i.chunk_index, i.page_start, i.page_end, i.content
  from input i cross join b
  on conflict (chunk_id) do nothing
  returning chunk_id
)
select (select count(*) from b)::int as book_created,
       (select count(*) from input)::int as received,
       (select count(*) from ins)::int as inserted,
       (select id from b) as book_id;`;

const FIN_HTML = `{{ $json.book_created ? '' : '<p><b>Ce livre (même titre, auteur et édition) est déjà dans la bibliothèque</b> : rien n’a été ajouté. Pour une autre édition, remplis le champ « Édition / traduction ». Pour le réingérer, supprime-le d’abord (README, « Retirer un livre »).</p>' }}
<p><b>{{ $('Découpage').first().json.book.title }}</b>{{ $('Découpage').first().json.book.author ? ' — ' + $('Découpage').first().json.book.author : '' }}</p>
<p>{{ $json.inserted }} morceaux en file d’attente sur {{ $json.received }}. Structure : <b>{{ { toc: 'table des matières', heuristique: 'titres « Chapitre N » repérés', taille: 'aucun chapitre trouvé, découpage par taille' }[$('Découpage').first().json.stats.method] }}</b>, {{ $('Découpage').first().json.stats.chaptersFound }} chapitre(s).</p>
<p>Vérifie que les chapitres sont les bons :</p>
<ol style="text-align:left;max-height:320px;overflow:auto">{{ $('Découpage').first().json.stats.chapters.map(c => '<li>' + c.replace(/^\\d+\\. /, '').replace(/</g, '&lt;') + '</li>').join('') }}</ol>
<p>Le workflow B va rédiger une fiche par chapitre puis vectoriser le livre (environ une heure). Ensuite, pose tes questions dans le chat.</p>`;

const ingestionA = `const gemini_toc = ${gemini('Gemini (table des matières)', 880, 220, 4096)};

const on_form_submission = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: { name: 'On form submission', parameters: { formTitle: 'Ajouter un livre à la bibliothèque', formDescription: 'Dépose un livre en PDF (avec du texte, pas un scan). Le workflow détecte ses chapitres et le découpe ; le workflow B le rendra interrogeable dans le chat.', formFields: { values: [{ fieldLabel: 'Livre (PDF)', fieldName: 'livre', fieldType: 'file', multipleFiles: false, acceptFileTypes: '.pdf', requiredField: true }, { fieldLabel: 'Titre', fieldName: 'titre', fieldType: 'text', requiredField: true }, { fieldLabel: 'Auteur', fieldName: 'auteur', fieldType: 'text' }, { fieldLabel: 'Langue du livre', fieldName: 'langue', fieldType: 'dropdown', fieldOptions: { values: [{ option: 'Français' }, { option: 'English' }] }, requiredField: true }, { fieldLabel: 'Édition / traduction (facultatif)', fieldName: 'edition', fieldType: 'text', placeholder: 'trad. Périès, 1855 ; 2e édition…' }, { fieldLabel: 'Nom des chapitres (facultatif)', fieldName: 'libelle', fieldType: 'text', placeholder: 'Chapitre, Loi, Lettre, Livre…' }] }, responseMode: 'lastNode', options: { path: 'rag-48-lois-ingestion', buttonLabel: 'Ajouter' } }, position: [0, 0], notes: '1. Ingestion : le PDF et ses informations.', notesInFlow: true }
});

const extraction = node({
  type: 'n8n-nodes-base.extractFromFile',
  version: 1.1,
  config: { name: 'Extraction', parameters: { operation: 'pdf', binaryPropertyName: 'livre', options: { joinPages: false } }, position: [220, 0], notes: '2. Extraction : texte page par page (pdf.js).', notesInFlow: true }
});

${code('nettoyage', 'Nettoyage', 'clean-generic.js', 440, 0, "onError: 'continueErrorOutput', ")}

${code('echantillon', 'Échantillon', 'toc-sample.js', 660, 0)}

const table_des_matieres = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { name: 'Table des matières', parameters: { promptType: 'define', text: expr(${q(TOC_PROMPT)}) }, onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, position: [880, 0], notes: '3. Structure : 1 appel Gemini par livre. En cas d’échec, le découpage se rabat sur les titres « Chapitre N » ou sur la taille.', notesInFlow: true, subnodes: { model: gemini_toc } }
});

${code('decoupage', 'Découpage', 'chunk-generic.js', 1100, 0, "onError: 'continueErrorOutput', ")}

${pg('file_d_attente', 'File d’attente (chunks)', INSERT_SQL, "{{ [ JSON.stringify($json.book), JSON.stringify($json.rows) ] }}", 1320, 0)}

const envoi_reel = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: { name: 'Envoi réel ?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 }, conditions: [{ id: 'prod', leftValue: expr("{{ $('On form submission').first().json.formMode }}"), rightValue: 'production', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, options: {} }, position: [1540, 0], notes: 'Test dans l’éditeur (formMode = test) : on s’arrête ici. La page de fin ne sert qu’au vrai formulaire.', notesInFlow: true }
});

const fin = node({
  type: 'n8n-nodes-base.form',
  version: 2.5,
  config: { name: 'Fin', parameters: { operation: 'completion', respondWith: 'showText', responseText: expr(${q(FIN_HTML)}) }, position: [1760, -80] }
});

const pdf_refuse = node({
  type: 'n8n-nodes-base.form',
  version: 2.5,
  config: { name: 'PDF refusé', parameters: { operation: 'completion', respondWith: 'text', completionTitle: 'PDF refusé', completionMessage: expr('{{ $json.error?.message ?? $json.error ?? "Le traitement du PDF a échoué." }}') }, position: [1100, 220], notes: 'PDF sans texte (scan) ou découpage impossible : rien n’est inséré.', notesInFlow: true }
});
nettoyage.onError(pdf_refuse);
decoupage.onError(pdf_refuse);

const wf = workflow('rag48IngestA', 'RAG – A. Ajouter un livre (formulaire)', { binaryMode: 'separate', description: 'Formulaire (PDF, titre, auteur, langue) → extraction → nettoyage → table des matières (Gemini) → découpage → chunks.', executionOrder: 'v1' });

export default wf
  .add(on_form_submission)
  .to(extraction)
  .to(nettoyage)
  .to(echantillon)
  .to(table_des_matieres)
  .to(decoupage)
  .to(file_d_attente)
  .to(envoi_reel.onTrue(fin))
`;

// =====================================================================================================
// Workflow B : fiches par chapitre + vectorisation (planifié)
// =====================================================================================================
const RETRY = `(ch.status = 'pending'
         or (ch.status = 'error' and ch.attempts < 5 and ch.updated_at < now() - interval '10 minutes')
         or (ch.status = 'processing' and ch.updated_at < now() - interval '15 minutes'))`;

// Flux 1 : un appel Gemini par chapitre. Budget journalier compté en fiches tentées depuis minuit (Pacifique),
// pour laisser le reste du quota gratuit au chat.
const CLAIM_FICHES_SQL = `with cfg as (select $1::jsonb as c),
picked as (
  select ch.chunk_id from public.chunks ch, cfg
  where ch.kind = 'chapter_summary' and ch.augmentation is null and ${RETRY}
  order by ch.book_id, ch.chapter_number
  limit (select greatest(0, least((c->>'fiches')::int, (c->>'budget')::int - (
           select count(*) from public.chunks
           where kind = 'chapter_summary' and updated_at >= (date_trunc('day', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')
             and (augmentation is not null or status = 'error'))))
         from cfg)
  for update skip locked
), claimed as (
  update public.chunks ch set status = 'processing', attempts = ch.attempts + 1, updated_at = now(), last_error = null
  from picked where ch.chunk_id = picked.chunk_id
  returning ch.*
)
select c.chunk_id, c.chapter_number, c.chapter_title, c.content, b.title as book_title, b.author as book_author, b.chapter_label, b.language
from claimed c join public.books b on b.id = c.book_id
order by c.chunk_id;`;

// La fiche est enregistrée ; la ligne repasse en pending pour être vectorisée par le flux 2.
const SAVE_FICHES_SQL = `with u as (
  update public.chunks c set augmentation = x.augmentation, status = 'pending', last_error = null, updated_at = now()
  from jsonb_to_recordset($1::jsonb) as x(chunk_id text, augmentation jsonb)
  where c.chunk_id = x.chunk_id
  returning c.chunk_id
)
select (select count(*) from u)::int as fiches;`;

// Flux 2 : vectorisation (embeddings seulement, pas d'appel Gemini de génération).
// Une ligne est prête quand la fiche de son chapitre existe (ou qu'elle n'a pas de chapitre : avant-propos, annexes).
// Les anciens documents d'une ligne retraitée sont purgés : jamais de doublon.
const CLAIM_VEC_SQL = `with cfg as (select $1::jsonb as c),
picked as (
  select ch.chunk_id from public.chunks ch, cfg
  where ${RETRY}
    and ((ch.kind = 'chapter_summary' and ch.augmentation is not null)
      or (ch.kind <> 'chapter_summary' and (ch.chapter_number is null or exists (
            select 1 from public.chunks s
            where s.book_id = ch.book_id and s.chapter_number = ch.chapter_number
              and s.kind = 'chapter_summary' and s.augmentation is not null))))
  order by ch.book_id, ch.chunk_id
  limit (select (c->>'chunks')::int from cfg)
  for update skip locked
), claimed as (
  update public.chunks ch set status = 'processing', attempts = ch.attempts + 1, updated_at = now(), last_error = null
  from picked where ch.chunk_id = picked.chunk_id
  returning ch.*
), purge as (
  delete from public.documents d using claimed where d.metadata->>'chunk_id' = claimed.chunk_id
)
select c.chunk_id, c.kind, c.book_id, c.chapter_number, c.chapter_title, c.section, c.page_start, c.page_end, c.content,
       b.title as book_title, b.author as book_author, b.chapter_label, b.language, s.augmentation as chapter_fiche
from claimed c
join public.books b on b.id = c.book_id
left join public.chunks s on s.book_id = c.book_id and s.chapter_number = c.chapter_number and s.kind = 'chapter_summary'
order by c.chunk_id;`;

// « done » seulement si le vecteur existe vraiment : un échec d'embedding (quota) peut laisser passer les morceaux
// sur la sortie normale du nœud de vectorisation. Ceux sans vecteur repassent en erreur, sans perdre de tentative.
const DONE_SQL = `with ids as (
  select jsonb_array_elements_text($1::jsonb) as chunk_id
), ok as (
  update public.chunks c set status = 'done', last_error = null, updated_at = now()
  from ids where c.chunk_id = ids.chunk_id
    and exists (select 1 from public.documents d where d.metadata->>'chunk_id' = c.chunk_id)
  returning c.chunk_id
), ko as (
  update public.chunks c set status = 'error', attempts = greatest(c.attempts - 1, 0), updated_at = now(),
    last_error = 'Vectorisation : aucun vecteur enregistré (quota d''embeddings par minute ?)'
  from ids where c.chunk_id = ids.chunk_id
    and not exists (select 1 from public.documents d where d.metadata->>'chunk_id' = c.chunk_id)
  returning c.chunk_id
)
select (select count(*) from ok)::int as done,
       (select count(*) from ko)::int as without_vector,
       ((select count(*) from public.chunks where status <> 'done') - (select count(*) from ok))::int as remaining,
       (select count(*) from public.chunks where status = 'error' and attempts >= 5)::int as abandoned;`;

// Insertion directe des vecteurs (remplace le Vector Store LangChain) : un morceau déjà présent n'est pas dupliqué.
const INSERT_VECTORS_SQL = `with r as (
  select * from jsonb_to_recordset($1::jsonb) as x(content text, metadata jsonb, embedding text)
), ins as (
  insert into public.documents (content, metadata, embedding)
  select r.content, r.metadata, r.embedding::extensions.vector from r
  on conflict ((metadata ->> 'chunk_id')) do nothing
  returning id
)
select (select count(*) from ins)::int as inserted;`;

// Même requête que les embeddings LangChain déjà en base (pas de taskType, sauts de ligne remplacés) : les anciens
// et les nouveaux vecteurs restent comparables. Un seul appel pour tout le lot (40 morceaux).
const EMBED_BODY = "{{ JSON.stringify({ requests: $input.all().map(i => ({ model: 'models/gemini-embedding-001', content: { role: 'user', parts: [{ text: String(i.json.embed_text).replace(/\\n/g, ' ') }] } })) }) }}";

const ingestionB = `const gemini_fiche = ${gemini('Gemini (fiche)', 880, 220, 1536)};

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

${pg('reserver_fiches', 'Réserver des chapitres', CLAIM_FICHES_SQL, '{{ JSON.stringify({ fiches: $json.fiches, budget: $json.budget }) }}', 440, 0)}

${code('prompt_fiche', 'Préparer la fiche', 'fiche-prompt.js', 660, 0)}

const fiche = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { name: 'Fiche du chapitre', parameters: { promptType: 'define', text: expr('{{ $json.prompt }}'), batching: { batchSize: 1, delayBetweenBatches: 7000 } }, onError: 'continueRegularOutput', position: [880, 0], notes: '5. Augmentation : 1 appel Gemini par chapitre, 7 s entre deux appels.', notesInFlow: true, subnodes: { model: gemini_fiche } }
});

${code('parser_fiche', 'Parser la fiche', 'fiche-parse.js', 1100, 0)}

const fiche_ok = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: { name: 'Fiche valide ?', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 }, conditions: [{ id: 'ok', leftValue: expr('{{ $json.ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }, position: [1320, 0] }
});

${pg('enregistrer_fiches', 'Enregistrer les fiches', SAVE_FICHES_SQL, '{{ JSON.stringify($input.all().map(i => ({ chunk_id: i.json.chunk_id, augmentation: i.json.augmentation }))) }}', 1540, -80, 'executeOnce: true, ')}

${pg('fiches_en_erreur', 'Fiches en erreur', ERROR_SQL, '{{ JSON.stringify($input.all().map(i => ({ chunk_id: i.json.chunk_id, error: i.json.error }))) }}', 1540, 80, 'executeOnce: true, ')}

${pg('reserver_morceaux', 'Réserver des morceaux', CLAIM_VEC_SQL, '{{ JSON.stringify({ chunks: $json.chunks }) }}', 440, 400)}

${code('texte_a_vectoriser', 'Texte à vectoriser', 'embed-text.js', 660, 400)}

const embeddings_http = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Embeddings Gemini (HTTP)', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr(${q(EMBED_BODY)}), options: {} }, credentials: { googlePalmApi: ${cred('gemini')} }, executeOnce: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 30000, onError: 'continueRegularOutput', position: [880, 400], notes: '6. Vectorisation : un appel batchEmbedContents pour tout le lot (3072 dim). Quota limité par minute : 40 morceaux / 2 min ; 3 essais espacés de 30 s.', notesInFlow: true }
});

${code('preparer_insertion', 'Préparer l’insertion', 'embed-rows.js', 1100, 400)}

${pg('inserer_vecteurs', 'Insérer les vecteurs', INSERT_VECTORS_SQL, '{{ JSON.stringify($json.rows) }}', 1320, 400)}

${pg('marquer_done', 'Marquer done', DONE_SQL, "{{ JSON.stringify($('Texte à vectoriser').all().map(i => i.json.chunk_id)) }}", 1540, 400, 'executeOnce: true, ')}

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
`;

// =====================================================================================================
// Workflow T : test de la recherche vectorielle (manuel, sans LLM)
// =====================================================================================================
const testSearch = `const gemini_Embeddings = embeddings({ type: '@n8n/n8n-nodes-langchain.embeddingsGoogleGemini', version: 1, config: { name: 'Embeddings Google Gemini', parameters: { modelName: 'models/gemini-embedding-001' }, credentials: { googlePalmApi: ${cred('gemini')} }, position: [440, 220] } });

const start = trigger({ type: 'n8n-nodes-base.manualTrigger', version: 1, config: { name: 'Lancer le test', position: [0, 0] } });

const questions = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Question', parameters: { assignments: { assignments: [{ id: 'q', name: 'query', value: ${q(process.env.QUERY || 'Faut-il faire de l’ombre à son supérieur ?')}, type: 'string' }] }, options: {} }, position: [220, 0] }
});

const recherche = node({
  type: '@n8n/n8n-nodes-langchain.vectorStoreSupabase',
  version: 1.3,
  config: { name: 'Recherche', parameters: { mode: 'load', tableName: { __rl: true, mode: 'id', value: 'documents' }, prompt: expr('{{ $json.query }}'), topK: 5, includeDocumentMetadata: true, options: { queryName: 'match_documents' } }, credentials: { supabaseApi: ${cred('supabase')} }, position: [440, 0], subnodes: { embedding: gemini_Embeddings } }
});

const wf = workflow('rag48TestSearch', 'RAG – T. Test recherche', { description: 'Manuel : une question → top 5 des documents (sans LLM).', executionOrder: 'v1' });

export default wf.add(start).to(questions).to(recherche)
`;

// =====================================================================================================
// Workflow C : chat sur la bibliothèque
// =====================================================================================================
const LIBRARY = "{{ $('Bibliothèque').all().filter(b => b.json.id).map(b => '« ' + b.json.title + ' »' + (b.json.author ? ' de ' + b.json.author : '')).join(', ') }}";

const REFORMULATION = `Tu transformes la dernière question d'un utilisateur en requête de recherche autonome dans une bibliothèque de livres : ${LIBRARY}.
Utilise l'historique pour résoudre les références implicites (« et la suivante ? », « donne un exemple », « celui-là »).
N'ajoute un numéro de chapitre que s'il figure dans la question ou dans l'historique : n'en devine jamais un.
Garde le titre du livre seulement s'il est nommé dans la question ou l'historique. Garde le sens de la question.
Si la question décrit une situation personnelle (travail, patron, collègue, couple, rivalité…), traduis-la en notions que ces livres traitent
(ex. : « mon boss me micromanage » → « relation avec un supérieur qui contrôle tout, garder sa faveur, gagner en autonomie, se rendre indispensable »).
Sinon, recopie la question en la rendant seulement plus précise. Réponds uniquement par la requête, sur une ligne, sans guillemets.

Historique :
{{ $json.history || '(nouvelle conversation)' }}

Dernière question : {{ $json.question }}`;

const RERANK = `Question : {{ $json.query }}

Voici des passages candidats tirés d'une bibliothèque de livres. Note chacun de 0 à 10 selon son utilité pour répondre à la question :
10 = répond directement, 5 = utile en partie, 0 = hors sujet.
Si la question décrit une situation personnelle, un passage est utile quand l'idée ou l'exemple qu'il présente s'applique à cette situation, même si les mots diffèrent.

{{ $json.rerankList }}

Réponds uniquement avec un objet JSON valide, sans texte autour : {"scores": [{"id": 1, "score": 7}, ...]} avec une entrée par passage.`;

const GENERATION = `Tu es un assistant qui répond aux questions sur une bibliothèque de livres (${LIBRARY}), en t'appuyant uniquement sur les passages fournis.

{{ $json.rules }}

Règles :
1. Utilise uniquement les passages ci-dessous. N'ajoute aucune connaissance extérieure aux livres.
2. Réponds en français, en paragraphes détaillés, même si un livre est en anglais.
3. Cite de courts extraits entre « » quand ils appuient ton propos : un extrait entre « » est recopié mot pour mot, dans la langue du livre, sans changer un temps ni un accord ; sinon, reformule sans guillemets.
   Ne cite jamais entre « » un passage de type « résumé » : c'est une synthèse, pas le texte du livre.
4. Après chaque affirmation tirée d'un passage, indique sa source entre parenthèses, telle qu'elle figure dans l'attribut source.
5. Si la question décrit une situation personnelle, conseille la personne : nomme les chapitres ou les idées qui s'appliquent, explique ce que le livre recommande
   et ce qu'elle peut faire concrètement, en appuyant chaque conseil sur un passage. Signale les nuances et les risques que le livre mentionne.
   Tu peux transposer un exemple historique à sa situation, en disant clairement que c'est une transposition.
6. Pour une question de synthèse, couvre tous les chapitres (et tous les livres) présents dans les passages.

Question : {{ $json.question }}
(Requête de recherche utilisée : {{ $json.query }})

Passages :
{{ $json.context }}`;

const HISTORY_LOAD_SQL = `select message from (
  select id, message from public.n8n_chat_histories where session_id = $1 order by id desc limit 12
) last order by id;`;
const HISTORY_SAVE_SQL = `insert into public.n8n_chat_histories (session_id, message)
select $1, m from jsonb_array_elements($2::jsonb) as m
returning id;`;
const BOOKS_SQL = `select id, title, author, language, chapter_label from public.books order by id;`;
// Recherche hybride : vectoriel + plein texte sur les mots-clés, fusionnés par RRF (migration 20261001200000).
const SEARCH_SQL = `select id, content, metadata, similarity, rrf, vector_rank, keyword_rank
from public.search_hybrid($1, $2::jsonb, 20, $3::jsonb);`;
// Chapitres nommés dans la question : leur fiche et leur premier morceau (le plus tôt dans le livre).
const CITED_SQL = `with pairs as (
  select (x->>'book_id')::int as b, (x->>'chapter_number')::int as n from jsonb_array_elements($1::jsonb) x
), wanted as (
  select c.chunk_id from public.chunks c join pairs p on p.b = c.book_id and p.n = c.chapter_number
  where c.kind = 'chapter_summary'
  union
  select chunk_id from (
    select distinct on (c.book_id, c.chapter_number) c.chunk_id
    from public.chunks c join pairs p on p.b = c.book_id and p.n = c.chapter_number
    where c.kind = 'section'
    order by c.book_id, c.chapter_number, c.page_start, c.chunk_index, c.chunk_id
  ) premiers
)
select d.content, d.metadata from public.documents d
where d.metadata->>'chunk_id' in (select chunk_id from wanted)
order by (d.metadata->>'book_id')::int, (d.metadata->>'chapter_number')::int, d.metadata->>'kind';`;
const GEMINI_KO = `Je ne peux pas répondre pour le moment : Gemini a refusé la requête ({{ String($json.error?.message ?? $json.error ?? 'erreur inconnue').slice(0, 120) }}).

Si c'est un quota (« too many requests »), réessaie dans une minute. Si le quota gratuit du jour est épuisé, il se renouvelle à 9h (heure de Paris).`;

const answering = `const gemini_reformulation = ${gemini('Gemini (reformulation)', 880, 220, 256)};
const gemini_rerank = ${gemini('Gemini (reranking)', 1980, 220, 512)};
const gemini_generation = ${gemini('Gemini (génération)', 2420, 220, 2048)};

const chat = trigger({
  type: '@n8n/n8n-nodes-langchain.chatTrigger',
  version: 1.5,
  config: { name: 'When chat message received', parameters: { public: true, mode: 'hostedChat', initialMessages: 'Pose-moi une question sur les livres de ta bibliothèque : un chapitre, une idée, une situation à laquelle l’appliquer, un thème ou un personnage. Nomme un livre pour limiter la recherche à celui-là.', options: { responseMode: 'lastNode', title: 'Ma bibliothèque', subtitle: 'Réponses tirées des livres, avec sources' } }, webhookId: '6f9792c4-9e03-4f4a-bc44-8664b907b3c8', position: [0, 0], notes: '1. Input. webhookId fixe : l’URL du chat ne change pas.', notesInFlow: true }
});

${pg('charger', 'Charger l’historique', HISTORY_LOAD_SQL, '{{ [ $json.sessionId ] }}', 220, 0, 'alwaysOutputData: true, ')}

${pg('bibliotheque', 'Bibliothèque', BOOKS_SQL, '{{ [] }}', 440, 0, 'executeOnce: true, ')}

${code('historique', 'Historique', 'answer-history.js', 660, 0)}

const reformulation = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { name: 'Reformulation', parameters: { promptType: 'define', text: expr(${q(REFORMULATION)}) }, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueErrorOutput', position: [880, 0], notes: '2. Question autonome grâce à l’historique.', notesInFlow: true, subnodes: { model: gemini_reformulation } }
});

${code('livres_cites', 'Livres et chapitres cités', 'answer-books.js', 1100, 0)}

const embedding_question = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Vecteur de la question', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{{ JSON.stringify({ content: { role: "user", parts: [{ text: $json.query.replace(/\\\\n/g, " ") }] } }) }}'), options: {} }, credentials: { googlePalmApi: ${cred('gemini')} }, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, onError: 'continueErrorOutput', position: [1320, 0], notes: '3. Recherche : même requête que les embeddings LangChain des documents (pas de taskType, sauts de ligne remplacés), puis fusion avec le plein texte.', notesInFlow: true }
});

${pg('recherche', 'Recherche', SEARCH_SQL, "{{ [ JSON.stringify($json.embedding.values), JSON.stringify($('Livres et chapitres cités').first().json.keywords), JSON.stringify($('Livres et chapitres cités').first().json.bookIds) ] }}", 1540, 0, 'alwaysOutputData: true, ')}

${pg('chapitres_cites', 'Chapitres cités', CITED_SQL, "{{ [ JSON.stringify($('Livres et chapitres cités').first().json.cited) ] }}", 1650, -160, 'executeOnce: true, alwaysOutputData: true, ')}

${code('candidats', 'Candidats', 'answer-candidates.js', 1760, 0)}

const reranking = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { name: 'Reranking', parameters: { promptType: 'define', text: expr(${q(RERANK)}) }, onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, position: [1980, 0], notes: '4. Reranking : Gemini note chaque candidat. En cas d’échec, on garde l’ordre de la recherche.', notesInFlow: true, subnodes: { model: gemini_rerank } }
});

${code('selection', 'Sélection', 'answer-select.js', 2200, 0)}

const generation = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { name: 'Génération', parameters: { promptType: 'define', text: expr(${q(GENERATION)}) }, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueErrorOutput', position: [2420, 0], notes: '5. Génération : réponse ancrée dans les passages, avec sources.', notesInFlow: true, subnodes: { model: gemini_generation } }
});

${code('verifier', 'Vérifier les citations', 'answer-quotes.js', 2640, 0)}

${pg('sauver', 'Sauver l’historique', HISTORY_SAVE_SQL, "{{ [ $('When chat message received').first().json.sessionId, JSON.stringify([{ type: 'human', data: { content: $('When chat message received').first().json.chatInput } }, { type: 'ai', data: { content: $json.text } }]) ] }}", 2860, 0, 'executeOnce: true, ')}

const reponse = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Réponse', parameters: { assignments: { assignments: [{ id: 'output', name: 'output', value: expr("{{ $('Vérifier les citations').first().json.text }}"), type: 'string' }, { id: 'quotes', name: 'quotes', value: expr("{{ $('Vérifier les citations').first().json.quotes }}"), type: 'object' }, { id: 'sources', name: 'sources', value: expr("{{ $('Sélection').first().json.sources }}"), type: 'array' }, { id: 'query', name: 'query', value: expr("{{ $('Sélection').first().json.query }}"), type: 'string' }, { id: 'books', name: 'books', value: expr("{{ $('Livres et chapitres cités').first().json.books }}"), type: 'array' }, { id: 'keywords', name: 'keywords', value: expr("{{ $('Livres et chapitres cités').first().json.keywords }}"), type: 'array' }, { id: 'reranked', name: 'reranked', value: expr("{{ $('Sélection').first().json.reranked }}"), type: 'boolean' }] }, options: {} }, executeOnce: true, position: [3080, 0], notes: 'output = texte affiché dans le chat. sources, query, books, reranked = traces pour le jeu de test.', notesInFlow: true }
});

const gemini_indisponible = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Gemini indisponible', parameters: { assignments: { assignments: [{ id: 'output', name: 'output', value: expr(${q(GEMINI_KO)}), type: 'string' }, { id: 'error', name: 'error', value: true, type: 'boolean' }] }, options: {} }, executeOnce: true, position: [1540, 260], notes: 'Réponse affichée quand la reformulation, le vecteur de la question ou la génération échouent.', notesInFlow: true }
});

reformulation.onError(gemini_indisponible);
embedding_question.onError(gemini_indisponible);
generation.onError(gemini_indisponible);

const wf = workflow('rag48Answer', 'RAG – C. Chat bibliothèque', { description: 'Chat → mémoire → reformulation → livres cités → recherche (filtrable par livre) → reranking → génération citée.', executionOrder: 'v1' });

export default wf
  .add(chat)
  .to(charger)
  .to(bibliotheque)
  .to(historique)
  .to(reformulation)
  .to(livres_cites)
  .to(embedding_question)
  .to(recherche)
  .to(chapitres_cites)
  .to(candidats)
  .to(reranking)
  .to(selection)
  .to(generation)
  .to(verifier)
  .to(sauver)
  .to(reponse)
`;

fs.mkdirSync(path.join(root, 'n8n/workflows'), { recursive: true });
fs.writeFileSync(path.join(root, 'n8n/workflows/RAG – A. Ajouter un livre (formulaire).workflow.ts'), ingestionA);
fs.writeFileSync(path.join(root, 'n8n/workflows/RAG – B. Fiches + vectorisation.workflow.ts'), ingestionB);
fs.writeFileSync(path.join(root, 'n8n/workflows/RAG – T. Test recherche.workflow.ts'), testSearch);
fs.writeFileSync(path.join(root, 'n8n/workflows/RAG – C. Chat bibliothèque.workflow.ts'), answering);
console.log('Workflows A, B, C et T générés.');
