> **Spécification initiale (v1, un seul livre)**, issue de l'interview de cadrage du 30/09/2026, complétée au fil du projet.
> La version actuelle (bibliothèque multi-livres, recherche hybride) est décrite dans [architecture.md](architecture.md).

# RAG « Les 48 lois du pouvoir »

## Contexte et objectif
Jude veut interroger un livre, *Les 48 lois du pouvoir* de Robert Greene, pour son usage personnel. Le RAG doit retrouver les bons passages, les citer et aider à appliquer les lois à des situations réelles.

## Solution retenue
On construit deux workflows n8n en TypeScript (`@n8n/workflow-sdk`) et on les déploie avec `n8ncli push` :
- **Ingestion :** ingestion, extraction, cleaning, chunking, augmentation, vectorisation.
- **Answering :** input, recherche, reranking, génération.

**Stack :** n8n local (Docker sur Colima), Gemini (clé API en tier gratuit), Supabase complet en local (Postgres + pgvector).

**Nœuds imposés :**
- On form submission (ingestion) ;
- When chat message received (answering) ;
- Google Gemini Chat Model (`gemini-flash-lite-latest`) pour tous les appels LLM (augmentation, reformulation, reranking, génération) ;
- Embeddings Google Gemini pour la vectorisation et la requête.

## Périmètre
**Inclus :**
- Ce livre seulement, en entier (préface, 48 lois, notes). Le code connaît sa structure : 48 lois × sections, plus un type `front_matter` et un type `back_matter` hors lois.
- Le chat intégré de n8n comme interface.
- Une mémoire de conversation.
- Un jeu de test pour valider.

**Exclu (pour l'instant) :**
- D'autres livres ou documents.
- Une interface web dédiée.
- Un accès multi-utilisateur.
- Les logs de coûts et de latence.

## Comportements attendus

### Ingestion en deux temps
- **Workflow A, Form Trigger :** extraction, cleaning et chunking. Il stocke les chunks dans la table `chunks` avec le statut `pending`, sans aucun appel à Gemini.
- **Workflow B, Schedule Trigger :** il prend les chunks `pending` par lots, fait l'augmentation et la vectorisation, puis passe chaque chunk en `done`. Il consomme le quota au fil de l'eau et reprend tout seul.

### Workflow Ingestion (un nœud ou un groupe visible par étape)
1. **Ingestion :** le nœud **On form submission** (Form Trigger) reçoit le PDF uploadé par Jude.
2. **Extraction :** le nœud Extract from File sort le texte page par page et garde le numéro de page.
3. **Cleaning :** un Code node retire les en-têtes et pieds de page répétés, les numéros de page, les césures de fin de ligne et les espaces multiples.
4. **Chunking :** le découpage suit la structure du livre, par loi puis par section. Dans l'édition française, les sections s'appellent Principe, Violation de la loi, Respect de la loi (ou Violation et respect de la loi), Les clefs du pouvoir, Image, Autorité, A contrario. Toutes les lois n'ont pas toutes les sections. Les sections longues se redécoupent par taille et gardent les métadonnées. Chaque chunk porte : `law_number`, `law_title`, `section`, `page_start`, `page_end`, `chunk_index`, `chunk_id` stable.
5. **Augmentation :**
   - *Par chunk :* Gemini génère un contexte qui situe le chunk dans la loi, des mots-clés, des questions probables et la liste des personnages historiques cités (`people`, en métadonnées filtrables).
   - *Par loi :* Gemini génère 48 fiches de synthèse (résumé, thèmes, personnages historiques cités), indexées comme documents à part (`type = law_summary`).
6. **Vectorisation :** le workflow encode « contexte + chunk » avec Gemini. La table Supabase `documents` stocke le vecteur, le chunk brut (qui sert aux citations) et les métadonnées.

**Contraintes de l'ingestion :**
- Traitement par lots, avec une pause entre les appels pour tenir dans les quotas du tier gratuit.
- Reprise idempotente : le workflow saute tout `chunk_id` déjà présent en base. Une relance ne crée aucun doublon et ne rejoue aucun appel déjà fait.
- Reprise planifiée : le workflow B tourne sur Schedule Trigger jusqu'à ce qu'il ne reste plus aucun chunk `pending`. Il gère ainsi l'épuisement du quota journalier.

### Workflow Answering
1. **Input :** le nœud **When chat message received** (Chat Trigger) reçoit la question. La mémoire de conversation est stockée dans Postgres/Supabase.
2. **Reformulation :** Gemini réécrit la question en requête autonome à partir de l'historique (« et la loi suivante ? » devient « que dit la loi 16 ? »).
3. **Recherche :** le workflow encode la requête et cherche le top 20 dans Supabase, fiches de loi comprises. Il plafonne le nombre de chunks par loi pour que les questions de synthèse couvrent plusieurs lois.
4. **Reranking :** Gemini note la pertinence des 20 candidats en un seul appel et garde les 5 meilleurs.
5. **Génération :** Gemini produit une réponse détaillée, ancrée uniquement dans les passages retenus, avec des citations (loi n° et section d'abord, puis la page du PDF, signalée comme telle car elle peut différer de la page imprimée). Si les passages ne répondent pas, le RAG dit qu'il ne sait pas.

**Types de questions à couvrir :**
- factuelles (« Que dit la loi 15 ? ») ;
- d'application à une situation perso ;
- de synthèse par thème ;
- sur les exemples historiques.

## Alternatives écartées
- **Chunking à taille fixe :** il coupe les lois et perd le numéro de loi, donc les citations deviennent imprécises.
- **Augmentation par loi seulement :** plus économe en quota, mais Jude préfère un contexte précis pour chaque chunk.
- **Postgres + pgvector seul :** plus léger, mais Jude veut Supabase complet.
- **Pipeline générique multi-livres :** hors objectif, on optimise pour ce livre.
- **Compléter avec les connaissances générales de Gemini :** écarté, le RAG répond seulement à partir du livre.

## Hypothèses et risques
- **Vérifié :** le PDF (conversion calibre, 1128 pages) contient du texte extractible sans OCR. Le texte est bruité : en-têtes « LO I n » éclatés, numéros de page mêlés au texte, titres de section parfois collés en fin de ligne.
- **Hypothèse :** le cleaning retrouve de façon fiable dans le texte les titres des 48 lois et des sections.
- **Mesuré :** avec des chunks de ~2500 caractères, le livre donne 808 lignes (732 sections, 48 fiches, 19 préface/sommaire, 9 bibliographie/index), soit environ 780 appels d'augmentation. Le quota gratuit peut étaler l'ingestion sur plusieurs jours.
- **Limite connue :** sur les pages à deux colonnes (encadrés de fables et de poèmes, lois 5, 28, 33, 44…), pdf.js mélange les colonnes ligne à ligne. Le texte est présent mais en désordre, et aucun nettoyage ne peut le remettre dans l'ordre.
- **Risque :** Supabase complet en local consomme beaucoup de RAM sur Colima. Le réseau entre les conteneurs n8n et Supabase doit être configuré (le point dont Jude est le moins sûr).
- **Mesuré :** le tier gratuit de `gemini-flash-lite-latest` renvoie des 429 à environ 15 requêtes/min. Le workflow B tourne à ~8 req/min.
- **Mesuré (30/09/2026) :** le quota journalier gratuit a été atteint après environ 530 appels (448 chunks augmentés + tests du chat). Tout a basculé en 429 à 18h13 UTC. Le chat et l'ingestion partagent ce quota : pendant l'ingestion, le chat peut être indisponible.
- **Tranché :** le nœud Embeddings Google Gemini utilise `gemini-embedding-001` (3072 dimensions), sans réglage possible. La colonne est en `vector(3072)`, sans index (scan exact, suffisant pour environ 700 lignes).
- **Risque :** `docker network connect` relie n8n au réseau Supabase. Si le réseau est recréé (`supabase stop` puis `start`), il faut relancer cette commande.
- **Données :** le tier gratuit de Gemini peut réutiliser les contenus envoyés. Jude l'accepte.

## Critères de succès
- Le jeu de test compte 10 à 15 questions couvrant les quatre types, chacune avec la loi ou le passage attendu.
- La bonne loi apparaît dans les 5 passages retenus pour au moins 14 questions sur 15.
- Les réponses citent une loi et une section qui existent.
- Sur 3 questions hors sujet, le RAG répond qu'il ne sait pas.
- Une relance de l'ingestion après une interruption ne crée aucun doublon.

## Contraintes
- Credentials n8n : Claude réutilise ceux qui existent déjà et Jude crée les autres dans l'interface. Claude ne manipule aucune clé en clair.
- n8ncli est déjà configuré (`~/.n8ncli-global.json`).
- n8n tourne déjà en local (conteneur `n8n`, port 5678, Colima).
- Le CLI Supabase n'est pas installé.
- Gemini en tier gratuit.
- Workflows en TypeScript, gérés par `n8ncli` (`validate`, `push`).
- Annoncer et attendre le feu vert de Jude avant chaque phase d'implémentation.

## Version bibliothèque (01/10/2026, commit a0e4e0d)
- N'importe quel PDF texte (FR/EN). Structure : table des matières par Gemini → titres « Chapitre N » → taille.
- Une fiche Gemini par chapitre (et non plus par chunk), puis vectorisation avec le contexte du chapitre.
- Chat multi-livres : livre nommé → filtre ; recherche hybride vectoriel + plein texte (RRF) ; pas de refus quand des passages sont retenus.
- Les 48 lois sont migrées comme livre 1, sans réingestion. Mesure de non-régression à refaire (référence ci-dessous).

## Mesure de référence (01/10/2026, avant la refonte universelle, commit 967a4d3)
- Livre : **14/15** (factuelles 4/4, application 3/4, synthèse 4/4, historiques 3/3). Hors sujet : **3/3**.
- Couverture des synthèses : 7 lois pertinentes sur 14. Citations : 97 authentiques, 17 dé-guillemetées.
- Échec A3 : la recherche a trouvé la loi 41 (4 passages sur 5), mais la génération a refusé à tort.
- La refonte universelle ne doit pas descendre sous ce score sur les 48 lois.

## Questions ouvertes
Aucune pour l'instant.

## Prochaines étapes
1. Vérifier que le PDF contient du texte extractible, et relever la structure des titres. ✅
2. Installer Supabase en local et connecter n8n (réseau, credentials). ✅
3. Écrire le SQL : pgvector, table `documents`, fonction de recherche, table de mémoire du chat. ✅
4. Lancer `n8ncli init` dans `rag-48-lois/`. ✅
5. Écrire et valider le workflow d'ingestion. Workflow A fait ✅ (808 chunks, 48 lois, idempotent). Workflow B fait ✅, lancé sur le livre entier.
6. Écrire et valider le workflow d'answering. ✅
7. Écrire le jeu de test et mesurer. Jeu de test et script faits ✅ (`tests/questions.json`, `tests/run-eval.mjs`). Mesure à faire après la fin de l'ingestion.
8. Lancer la hostile review.
