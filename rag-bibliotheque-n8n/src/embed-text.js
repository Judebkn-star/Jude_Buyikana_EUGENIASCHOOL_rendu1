// Code node « Texte à vectoriser » (Run Once for All Items) — workflow B, flux 2.
// Entrée : lignes réservées (chunks + infos du livre + fiche de leur chapitre). Sortie : un item par ligne avec
// embed_text (ce qui est vectorisé) et les champs de métadonnées. Aucun appel Gemini ici : le contexte vient de la fiche.

const CONTEXT_CHARS = 600; // début de la fiche, ajouté à chaque chunk du chapitre

return $input.all().map(({ json: r }) => {
  const fiche = r.chapter_fiche || {};
  const where = r.chapter_number ? `${r.chapter_label} ${r.chapter_number} : ${r.chapter_title}` : r.section;
  const head = `${r.book_title}${r.book_author ? ` (${r.book_author})` : ''}\n${where}`;
  let embed_text;
  let raw_text;
  if (r.kind === 'chapter_summary') {
    raw_text = fiche.summary || '';
    embed_text = `${head}\nFiche du chapitre\n${fiche.summary || ''}\nThèmes : ${(fiche.themes || []).join(', ')}\nQuestions : ${(fiche.questions || []).join(' ')}`;
  } else {
    raw_text = r.content;
    const ctx = fiche.summary ? `\nContexte du chapitre : ${fiche.summary.slice(0, CONTEXT_CHARS)}` : '';
    embed_text = `${head}${r.kind === 'section' ? '' : `\n${r.section}`}${ctx}\n\n${r.content}`;
  }
  return {
    json: {
      chunk_id: r.chunk_id,
      kind: r.kind,
      book_id: r.book_id,
      book_title: r.book_title,
      book_author: r.book_author || '',
      chapter_label: r.chapter_label,
      chapter_number: r.chapter_number,
      chapter_title: r.chapter_title || '',
      section: r.section,
      page_start: r.page_start,
      page_end: r.page_end,
      raw_text,
      context: (fiche.summary || '').slice(0, CONTEXT_CHARS),
      keywords: fiche.themes || [],
      questions: fiche.questions || [],
      people: fiche.people || [],
      embed_text,
    },
  };
});
