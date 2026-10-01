// Code node « Préparer la fiche » (Run Once for All Items) — workflow B, flux 1.
// Entrée : chapitres réservés (lignes chapter_summary : texte complet du chapitre + infos du livre).
// Sortie : un item par chapitre avec { ...ligne, prompt }. Une fiche = un seul appel Gemini par chapitre.

const MAX_CHARS = 150000; // un chapitre très long est tronqué : la fiche reste un résumé

return $input.all().map(({ json: r }) => {
  const text = r.content.length > MAX_CHARS ? `${r.content.slice(0, MAX_CHARS)}\n[…texte tronqué…]` : r.content;
  const book = `« ${r.book_title} »${r.book_author ? ` (${r.book_author})` : ''}`;
  const lang = r.language === 'en' ? 'Le livre est en anglais : écris la fiche en français, garde les noms propres tels quels.' : '';
  const prompt = [
    `Tu rédiges la fiche de synthèse d'un chapitre du livre ${book} pour un moteur de recherche.`,
    `${r.chapter_label} ${r.chapter_number} : ${r.chapter_title}.`,
    lang,
    'Texte complet du chapitre :',
    '"""',
    text,
    '"""',
    'Réponds uniquement avec un objet JSON valide, sans texte autour ni bloc de code.',
    'Format : {"summary": "150 à 250 mots : la thèse du chapitre, ses exemples principaux, ses nuances", "themes": ["5 à 8 thèmes courts"], "people": ["personnages historiques, auteurs et œuvres cités, forme canonique"], "questions": ["3 à 5 questions auxquelles ce chapitre répond"]}',
  ]
    .filter(Boolean)
    .join('\n');
  return { json: { ...r, prompt } };
});
