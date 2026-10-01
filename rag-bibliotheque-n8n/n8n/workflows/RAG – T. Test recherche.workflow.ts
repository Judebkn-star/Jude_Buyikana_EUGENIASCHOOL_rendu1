const embeddings_Google_Gemini = embedding({ type: '@n8n/n8n-nodes-langchain.embeddingsGoogleGemini', version: 1, config: { parameters: { modelName: 'models/gemini-embedding-001' }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account', '8bteJSzjH1yskWwc') }, position: [220, 180] } });

const lancer_le_test = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Lancer le test' }
});

const question = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Question', parameters: { assignments: { assignments: [{ id: 'q', name: 'query', value: 'Faut-il faire de l\u2019ombre à son supérieur ?', type: 'string' }] }, options: {} }, position: [300, 0] }
});

const recherche = node({
  type: '@n8n/n8n-nodes-langchain.vectorStoreSupabase',
  version: 1.3,
  config: { name: 'Recherche', parameters: { mode: 'load', tableName: { __rl: true, mode: 'id', value: 'documents' }, prompt: expr('{{ $json.query }}'), topK: 5, includeDocumentMetadata: true, options: { queryName: 'match_documents' } }, credentials: { supabaseApi: newCredential('Supabase RAG', '2vKqZq6HoRsEEvsN') }, position: [600, 80], subnodes: { embedding: embeddings_Google_Gemini } }
});

const wf = workflow('rag48TestSearch', 'RAG – T. Test recherche', { description: 'Manuel : une question → top 5 des documents (sans LLM).', executionOrder: 'v1' });

export default wf
  .add(lancer_le_test)
  .to(question)
  .to(recherche)