#!/bin/bash
# Retire un livre de la bibliothèque : ses vecteurs, ses morceaux et sa fiche dans `books`.
# Usage : scripts/remove-book.sh <slug>      (liste des slugs : scripts/remove-book.sh)
set -euo pipefail
DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
if [ $# -eq 0 ]; then psql "$DB" -At -F' | ' -c "select id, slug, title, chapters_found from public.books order by id;"; exit 0; fi
psql "$DB" -v ON_ERROR_STOP=1 -v slug="$1" <<'SQL'
begin;
select id as book_id, title from public.books where slug = :'slug' \gset
\if :{?book_id}
delete from public.documents where metadata->>'book_id' = :'book_id';
delete from public.books where id = :book_id;   -- supprime aussi ses chunks (on delete cascade)
commit;
\echo Livre retiré : :title
\else
rollback;
\echo Aucun livre avec ce slug.
\endif
SQL
