# CLAUDE.md — Digest pipeline Salesforce → Slack

## Contexte

Workflow n8n qui envoie chaque jour ouvré à 9h00 un résumé du pipeline commercial dans un canal Slack privé, avec le rapport HTML complet en pièce jointe.

**La source de vérité est `docs/specs.md`.** Toute règle métier (périmètre, seuils, destinataires, gestion des échecs) vient de ce fichier. En cas de doute ou de contradiction, s'arrêter et demander plutôt que supposer.

## Environnement

- n8n auto-hébergé sous Docker.
- Credential Salesforce OAuth2 déjà configuré dans n8n.
- Workflows synchronisés avec n8ncli : `n8n/workflows/*.workflow.ts` est la seule source. Passer par `npm run pull`, `npm run push` et `npm run status`, jamais par un `n8ncli pull` sans cible (il tirerait tous les workflows du projet n8n).
- Accès Slack non encore obtenu : le mode d'envoi (app Slack, email vers le canal, autre) reste à confirmer. Construire la partie diffusion de façon isolée pour pouvoir la changer sans toucher au reste.
- Fuseau horaire : Europe/Paris, sur le workflow comme sur le conteneur.

## Règles non négociables

1. **Confidentialité** : montants et noms de clients ne quittent jamais l'entreprise. Aucun service tiers (génération d'images, PDF, IA, raccourcisseur de liens, hébergement de fichiers) ne doit recevoir ces données. Seuls Salesforce, n8n (hébergé en interne) et Slack les manipulent.
2. **Gratuité** : aucune dépendance payante sans validation explicite. Toute option payante proposée doit être accompagnée d'une alternative gratuite.
3. **Confidentialité avant gratuité** : si une option gratuite passe par un service externe non validé, elle est exclue.
4. **Pas d'IA dans le traitement des données** sauf demande explicite.

## Traduction des règles métier (à vérifier sur l'org)

- Opportunités ouvertes : `IsClosed = false`.
- Trimestre fiscal : `CloseDate = THIS_FISCAL_QUARTER`.
- En retard, critère 1 : `CloseDate < TODAY`.
- En retard, critère 2 : même étape depuis plus de 180 jours. Candidat : `LastStageChangeDate`. Vérifier que le champ existe et est rempli ; sinon, passer par l'historique des opportunités.
- Sans activité : `LastActivityDate` antérieure à 180 jours. Décider explicitement du cas `LastActivityDate` vide (jamais d'activité) et le documenter.
- Seuils (180 jours) : paramétrables dans un seul nœud de configuration, jamais en dur dans les requêtes.

## Livrable attendu

- Message Slack : montant total du pipeline + nombre total d'opportunités, en français, texte sobre.
- Pièce jointe : rapport HTML autonome (styles inline, aucune ressource externe chargée), lisible hors connexion. Sections : pipeline par étape, alertes en retard, alertes sans activité.
- Sections d'alertes vides : afficher explicitement « Aucune alerte », ne pas masquer la section.

## Robustesse

- Jours fériés français exclus (Pâques, Ascension et Pentecôte calculés, pas codés en dur par année).
- Nouvelles tentatives automatiques sur les appels Salesforce et Slack.
- Échec persistant : workflow d'erreur séparé, alerte privée au responsable uniquement. Rien dans le canal d'équipe.

## Conventions

- Noms de nœuds en français, explicites.
- Toute valeur modifiable (seuils, destinataires, heure) regroupée dans un nœud de configuration unique.
- Aucun secret dans le dépôt. Les `.workflow.ts` ne contiennent que des ID de credentials ; les secrets restent dans n8n et dans `.env` (ignoré, modèle dans `.env.example`).
- La note Specs du canvas et `docs/specs.md` restent identiques : `npm test` échoue sinon.
- Documenter dans un README court : mise en place, paramètres à renseigner, procédure de test.

## Définition de « terminé »

- `npm run push` passe sans erreur et `npm test` est vert.
- Un lancement manuel produit le message Slack et un HTML conforme à `docs/specs.md`.
- Les cas testés et documentés : jour férié, pipeline vide, sections d'alertes vides, échec Salesforce, échec Slack.
- Aucune donnée n'est envoyée à un service autre que Salesforce, n8n et Slack.

## Style de communication

- Répondre en français, de façon concise et directe.
- Signaler clairement ce qui a été testé et ce qui ne l'a pas été.
