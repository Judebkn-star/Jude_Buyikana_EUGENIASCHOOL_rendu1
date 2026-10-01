# RAG bibliothèque (n8n + Gemini + Supabase)

Pose des questions en langage naturel à tes livres PDF. Le chat retrouve les bons passages, répond en français et cite ses sources (livre, chapitre, page).

- **N'importe quel livre PDF** avec une couche texte, en français ou en anglais.
- **Plusieurs livres** interrogeables ensemble ; une question qui nomme un livre se limite à lui.
- **Recherche hybride** : sens (vecteurs) + mots exacts (plein texte), fusionnés.
- **Tout en local** : n8n et Supabase dans Docker ; seul Gemini est appelé à l'extérieur.

Le projet est né sur *Les 48 lois du pouvoir* (Robert Greene), puis a été généralisé. Le fonctionnement détaillé est dans [docs/architecture.md](docs/architecture.md).

## Arborescence

```
.
├── README.md                 ← tu es ici
├── docs/
│   ├── architecture.md       ← pipeline, choix de conception, mesures, limites
│   └── specs.md              ← spécification initiale (v1, un seul livre) et son évolution
├── n8n/
│   ├── workflows/            ← les 4 workflows, GÉNÉRÉS par scripts/build-workflows.mjs (ne pas éditer)
│   └── config/               ← configuration n8ncli + identifiants des credentials n8n
├── src/                      ← code JavaScript des nœuds Code (la source à modifier)
├── scripts/                  ← démarrage, génération, déploiement, outils du quotidien
├── supabase/
│   ├── config.toml
│   └── migrations/           ← schéma de la base, dans l'ordre
└── tests/                    ← tests hors n8n + jeu de questions pour mesurer la qualité
    └── fixtures/             ← 3 petits livres de test (FR, EN, sans structure) et leurs extractions
```

| Workflow n8n | Déclencheur | Rôle |
|---|---|---|
| **A. Ajouter un livre** | formulaire | PDF → texte nettoyé → chapitres (table des matières lue par Gemini) → morceaux en file d'attente |
| **B. Fiches + vectorisation** | toutes les 2 min | une fiche Gemini par chapitre, puis vecteurs de chaque morceau |
| **C. Chat bibliothèque** | chat n8n | historique → reformulation → recherche hybride → reranking → réponse sourcée |
| **T. Test recherche** | manuel | une question → top 5 des passages, sans LLM |

## Prérequis

- macOS avec [Colima](https://github.com/abiosoft/colima) (ou Docker Desktop), [Supabase CLI](https://supabase.com/docs/guides/cli), Node.js 20+
- n8n en conteneur Docker nommé `n8n`, et [`n8ncli`](https://www.npmjs.com/package/@workflows-accelerator/n8n-cli) configuré pour cette instance
- Une clé API Gemini (Google AI Studio ; le tier gratuit suffit)

## Installation

```bash
scripts/start-env.sh              # Colima + Supabase + réseau n8n, tous les ports sur 127.0.0.1 (vérifié)
supabase migration up --local     # crée books, chunks, documents, recherche hybride, mémoire du chat
```

Dans n8n, crée trois credentials puis reporte leurs identifiants dans `n8n/config/credentials.json` :

| Credential | Type | Valeurs |
|---|---|---|
| Gemini | Google Gemini (PaLM) API | ta clé API |
| Postgres RAG | Postgres | hôte `supabase_db_rag-48-lois`, port 5432, base/utilisateur/mot de passe `postgres`, SSL désactivé |
| Supabase RAG | Supabase API | hôte `http://supabase_kong_rag-48-lois:8000`, clé `service_role` du Supabase local |

Puis déploie les workflows :

```bash
node scripts/build-workflows.mjs  # génère n8n/workflows/*.ts depuis src/
n8ncli push --force               # envoie dans n8n
node scripts/post-push.mjs        # obligatoire après un push : URL fixe du chat, republication
```

> Ne lance pas `supabase start` à la main : Supabase recréerait son réseau ouvert sur le Wi-Fi.
> `scripts/start-env.sh` le crée lié à 127.0.0.1 et refuse de continuer si un port est exposé.

## Utilisation

| Je veux… | Comment |
|---|---|
| Ajouter un livre | Formulaire : http://localhost:5678/form/rag-48-lois-ingestion. La page de fin liste les chapitres trouvés : vérifie-les. Le livre est prêt 15 à 20 min plus tard. |
| Suivre l'ingestion | `select status, count(*) from chunks group by 1;` (Supabase Studio : http://localhost:54323) |
| Poser une question | `scripts/chat.sh` (chat sur la moitié gauche de l'écran) ou `scripts/ask.sh "ta question"` |
| Limiter à un livre | Nomme-le dans la question : « Selon *AI in Finance*, … » ou « Que dit Machiavel sur … » |
| Citer un chapitre | « Que dit la loi 15 ? », « Résume le chapitre III » : sa fiche et son début sont ajoutés d'office |
| Retirer un livre | `scripts/remove-book.sh` (liste), puis `scripts/remove-book.sh <slug>` |

## Développer

Le code des nœuds vit dans `src/` ; les fichiers `n8n/workflows/*.ts` sont générés. Ne modifie jamais le code dans l'interface n8n : le prochain push l'écraserait.

```bash
tests/run-all.sh                  # tests hors n8n, sans Gemini (structure, livres cités, sélection, citations)
node scripts/build-workflows.mjs
n8ncli validate n8n/workflows/*.ts
n8ncli push --force && node scripts/post-push.mjs
node tests/run-eval.mjs           # 18 questions via le vrai chat (~54 appels Gemini) ; référence : 14/15 et 3/3
```

| Script | Rôle |
|---|---|
| `scripts/start-env.sh` | démarre l'environnement sans exposer de port |
| `scripts/build-workflows.mjs` | génère les 4 workflows depuis `src/` (prompts et SQL inclus) |
| `scripts/post-push.mjs` | après un push : réépingle les données de test de A, fixe l'URL du chat, republie A, B, C |
| `scripts/ask.sh` / `scripts/chat.sh` | poser une question en ligne de commande / ouvrir le chat |
| `scripts/remove-book.sh` | retirer un livre (vecteurs, morceaux, fiche) |

## Limites

- Quota gratuit Gemini : ~500 appels de génération par jour, ~20 embeddings par minute, partagés entre ingestion et chat.
- Pages à deux colonnes mélangées par l'extraction PDF ; PDF scannés refusés (pas d'OCR).
- Usage local, sans authentification sur le chat et le formulaire.
