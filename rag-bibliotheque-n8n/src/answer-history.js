// Code node « Historique » (Run Once for All Items)
// Entrée : lignes de n8n_chat_histories ({ message: { type, data: { content } } }), du plus ancien au plus récent.
// Aucune ligne (nouvelle conversation) : un item vide grâce à alwaysOutputData. Lu par nom de nœud :
// l'entrée directe de ce nœud est la liste des livres (« Bibliothèque »).
// Sortie : un item { question, history } — history = derniers échanges en texte, '' pour une nouvelle conversation.

const MAX_TURNS = 6;
const AI_CHARS = 600;
const question = $('When chat message received').first().json.chatInput;

const lines = [];
const push = (who, text) => text && lines.push(`${who} : ${who === 'Assistant' ? String(text).slice(0, AI_CHARS) : text}`);
for (const { json: j } of $('Charger l’historique').all()) {
  const msgs = j.message ? [j.message] : Array.isArray(j.messages) ? j.messages : [j];
  for (const m of msgs) {
    if (m.human || m.ai) {
      push('Utilisateur', m.human);
      push('Assistant', m.ai);
    } else {
      const type = m.type ?? m.id?.at?.(-1) ?? m.role;
      const text = m.content ?? m.text ?? m.data?.content ?? m.kwargs?.content;
      if (/human|user/i.test(type)) push('Utilisateur', text);
      else if (/ai|assistant/i.test(type)) push('Assistant', text);
    }
  }
}
return [{ json: { question, history: lines.slice(-MAX_TURNS * 2).join('\n') } }];
