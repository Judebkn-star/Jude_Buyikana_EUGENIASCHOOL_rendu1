# Architecture

Le projet transforme des livres PDF en une bibliothèque interrogeable en langage naturel. Quatre workflows n8n se partagent le travail, et Supabase (Postgres + pgvector) stocke tout.

## Vue d'ensemble

```
                         ┌──────────────────────────── Supabase (Postgres + pgvector) ───────────────────────────┐
                         │  books            chunks (file d'attente)            documents (vecteurs)              │
                         │  1 ligne/livre    pending → processing → done       3072 dim + plein texte (fts)       │
                         └───────▲──────────────────▲───────────▲──────────────────────────▲──────────────────────┘
                                 │                  │           │                          │
 PDF ──► A. Ajouter un livre ────┘                  │           │                          │
        (formulaire)                                │           │                          │
                                  B. Fiches + vectorisation ────┘                          │
                                  (toutes les 2 min)                                       │
                                                                                           │
 Question ──► C. Chat bibliothèque ────────────────────────────────────────────────────────┘ ──► Réponse sourcée
```

Les workflows A et B ne s'appellent pas : la table `chunks` sert de file d'attente entre eux. Une panne ou un quota Gemini épuisé ne touche qu'un lot, repris au passage suivant.

## A. Ajouter un livre

| Étape | Nœud | Rôle |
|---|---|---|
| Ingestion | On form submission | PDF, titre, auteur, langue, nom des chapitres (facultatif) |
| Extraction | Extract from File | Texte page par page (pdf.js), pour garder le numéro de page |
| Nettoyage | Code `src/clean-generic.js` | Retire les en-têtes et pieds de page répétés, repérés par fréquence ; refuse un PDF sans texte (scan) |
| Structure | Gemini « Table des matières » | Un seul appel : Gemini lit le début du livre et les lignes qui ressemblent à des titres |
| Découpage | Code `src/chunk-generic.js` | Retrouve chaque titre dans le texte, découpe par chapitre puis en blocs d'environ 2 500 caractères |
| File d'attente | Postgres | Insère le livre et ses morceaux ; un livre déjà présent n'est pas réingéré |

La structure se détermine en trois niveaux, du plus fiable au plus rustique :
1. **toc** : les titres de Gemini, retrouvés dans le texte (même coupés sur plusieurs lignes), en écartant la table des matières elle-même ;
2. **heuristique** : les lignes « Chapitre 3 », « CHAPTER III » en haut de page, en suite numérotée ;
3. **taille** : des parties d'environ 30 000 caractères.

## B. Fiches + vectorisation

Deux flux partent du même déclencheur planifié :

- **Flux 1, les fiches** : un appel Gemini par chapitre (résumé, thèmes, personnes citées, questions). Budget de 300 fiches par jour, pour laisser du quota au chat.
- **Flux 2, la vectorisation** : les morceaux dont le chapitre a sa fiche reçoivent le début de cette fiche comme contexte, puis passent par Embeddings Google Gemini. 40 morceaux par passage, la limite du quota gratuit d'embeddings par minute.

Garde-fous :
- un morceau ne passe en `done` que si son vecteur existe vraiment en base ;
- un refus de quota ou une panne réseau ne coûte pas de tentative ; une erreur propre au morceau en coûte une, et il est abandonné au bout de 5 ;
- un morceau retraité remplace son ancien vecteur (index unique sur `chunk_id`).

## C. Chat bibliothèque

| Étape | Rôle |
|---|---|
| Historique | 12 derniers messages de la session (table `n8n_chat_histories`) |
| Reformulation | Gemini rend la question autonome ; une situation personnelle devient des notions que les livres traitent |
| Livres et chapitres cités | Code `src/answer-books.js` : livre nommé dans la question de l'utilisateur (titre ou auteur) → filtre ; « loi 15 », « chapitre III » → fiche et début du chapitre ajoutés d'office ; mots-clés pour le plein texte |
| Vecteur de la question | Appel direct à l'API d'embedding, identique à celui des documents |
| Recherche hybride | `search_hybrid` : top 40 vectoriel + top 40 plein texte, fusionnés par Reciprocal Rank Fusion. Le plein texte couvre le texte du livre (poids D) et les mots-clés de la fiche, le titre du chapitre et les personnes citées (poids A, 10 fois plus) ; recherche par préfixe (« éthiques » trouve « éthique ») |
| Candidats | Code `src/answer-candidates.js` : 4 passages au plus par chapitre, 15 au total |
| Reranking | Gemini note chaque candidat de 0 à 10 ; on garde le top 5 au-dessus de 5 |
| Génération | Réponse en français, sourcée ; si des passages sont retenus, le modèle n'a pas l'option de refuser |
| Vérification des citations | Code `src/answer-quotes.js` : un extrait entre guillemets absent du texte du livre perd ses guillemets |

Si Gemini refuse (quota, réseau), le chat l'explique au lieu d'afficher une erreur.

## Choix de conception

| Choix | Pourquoi | Alternative écartée |
|---|---|---|
| File d'attente en base entre A et B | Une panne ne touche qu'un lot ; reprise automatique | Un seul workflow de plusieurs heures |
| Une fiche Gemini par chapitre | Un livre prêt en 15 à 20 min sur le tier gratuit | Une fiche par morceau : 2 à 3 jours par livre |
| Recherche hybride RRF | Les noms propres et termes rares (« Talleyrand ») sont trouvés à coup sûr | Vectoriel seul |
| Recherche en SQL plutôt que le nœud Vector Store | Filtre par livre et fusion avec le plein texte | Nœud LangChain, sans filtre dynamique |
| Code des nœuds dans `src/`, workflows générés | Code testable hors n8n, une seule source | Code édité dans l'interface n8n |

## Mesures

Jeu de test de 18 questions sur les 48 lois (`tests/questions.json`) :

| Mesure | Livre | Hors sujet refusées | Couverture des synthèses | Citations |
|---|---|---|---|---|
| 01/10/2026, version un seul livre | 14/15 (application 3/4) | 3/3 | 7/14 | 97 authentiques, 17 corrigées |
| 02/10/2026, version bibliothèque | **15/15** | 3/3 | 5/14 | 77 authentiques, 28 corrigées |

La refonte corrige l'échec A3 (refus à tort) ; les synthèses citent un peu moins de lois différentes et la génération produit plus de fausses citations (toutes dé-guillemetées par le contrôle) : deux pistes d'amélioration.

Livres testés de bout en bout : *Les 48 lois du pouvoir* (1 128 pages, 48 lois) et *AI in Finance* (ouvrage collectif en anglais, 271 pages, 11 chapitres).

## Limites connues

- **Quota gratuit Gemini** : environ 500 appels de génération par jour et environ 20 embeddings par minute, partagés entre l'ingestion et le chat.
- **Pages à deux colonnes** : pdf.js mélange les colonnes ligne à ligne ; le texte reste présent mais en désordre.
- **PDF scannés** : refusés, il faut une couche texte (pas d'OCR).
- **Usage local** : tous les services écoutent sur 127.0.0.1, sans authentification.
