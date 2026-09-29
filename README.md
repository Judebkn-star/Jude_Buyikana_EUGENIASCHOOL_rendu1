# Digest pipeline Salesforce → Slack

Chaque jour ouvré à 9h (Paris), n8n lit les opportunités ouvertes du trimestre fiscal dans Salesforce et publie dans un canal Slack privé un résumé, avec le rapport HTML complet en pièce jointe.

## Contenu

| Fichier | Rôle |
|---|---|
| `workflows/01-digest-pipeline-commercial.json` | Workflow principal : jours fériés, Salesforce, calculs, rapport |
| `workflows/02-diffusion-slack.json` | Sous-workflow d'envoi, seule partie à modifier si le mode d'accès Slack change |
| `workflows/03-alerte-echec-digest.json` | Workflow d'erreur : email privé au responsable |
| `src/*.js` | Code des nœuds Code (source unique) |
| `build.mjs` | Regénère les JSON depuis `src/` : `node build.mjs` |
| `tests/test.mjs` | Tests du code des nœuds : `node tests/test.mjs` (rapports d'exemple dans `tests/sortie/`) |

Les JSON ne contiennent aucun identifiant de credential.

## Mise en place

1. **Importer** les trois fichiers (menu Workflows › Import, ou `n8n import:workflow --input=<fichier>`). Les ID sont fixes : le principal appelle `digestdiffslack1` et déclare `digestalerteerr1` comme workflow d'erreur.
2. **Salesforce** : créer le credential « Salesforce OAuth2 » et le relier aux nœuds `Lire opportunités Salesforce` et `Lire ordre des étapes`.
3. **Slack** (mode `slack_app`) : l'admin Slack crée une app avec les scopes bot `chat:write` et `files:write`, puis l'installe. Créer un credential « Slack API » avec le jeton bot `xoxb-…`, le relier à `Publier dans le canal Slack`, et inviter le bot dans le canal privé (`/invite @nom-du-bot`).
4. **SMTP interne** : créer un credential SMTP sur le serveur de messagerie de l'entreprise et le relier à `Prévenir le responsable` (et à `Envoyer au canal par email` en mode repli).
5. **Renseigner les paramètres** (section suivante).
6. **Publier** le sous-workflow `Diffusion Slack` : n8n 2.x refuse d'appeler un sous-workflow non publié, même en lancement manuel. Publier ensuite le workflow principal. Le workflow d'alerte n'a pas besoin d'être publié.
7. **Fuseau horaire** : les workflows sont réglés sur Europe/Paris. Ajouter aussi `GENERIC_TIMEZONE=Europe/Paris` et `TZ=Europe/Paris` au conteneur (il tourne en UTC aujourd'hui), ce qui demande de le recréer.

## Paramètres

Nœud `Configuration` du workflow principal :

| Paramètre | Défaut | Rôle |
|---|---|---|
| `seuilRetardJours` | 180 | Jours dans la même étape avant alerte « en retard » |
| `seuilInactiviteJours` | 180 | Jours sans activité avant alerte « sans activité » |
| `devise` | EUR | Devise d'affichage |
| `inclureLundiPentecote` | true | `false` si l'entreprise travaille ce jour-là (journée de solidarité) |
| `modeDiffusion` | slack_app | `slack_app` (app Slack) ou `email_canal` (adresse email du canal) |
| `canalSlackId` | à renseigner | ID du canal privé (clic droit sur le canal › Copier le lien, fin de l'URL `C…`) |
| `emailCanal`, `emailExpediteur` | à renseigner | Mode `email_canal` uniquement |
| `dateReferenceForcee` | vide | Tests : force une date `AAAA-MM-JJ`. Laisser vide en production |

L'heure d'envoi se règle dans le déclencheur `Chaque jour ouvré à 9h` (cron `0 9 * * 1-5`). Le destinataire de l'alerte d'échec se règle dans le nœud `Configuration alerte` du workflow 03, car un workflow d'erreur ne peut pas lire la configuration du principal.

## Règles métier appliquées

- Périmètre : `IsClosed = false AND CloseDate = THIS_FISCAL_QUARTER`. La requête ne contient aucun seuil ; le nœud `Calculer indicateurs` les applique.
- En retard : clôture prévue avant aujourd'hui, ou `LastStageChangeDate` plus ancienne que le seuil. Si `LastStageChangeDate` est vide, l'étape n'a jamais changé et le calcul part de `CreatedDate`.
- Sans activité : `LastActivityDate` plus ancienne que le seuil. **Choix documenté** : une opportunité sans aucune activité compte comme « sans activité » quand sa création remonte à plus que le seuil. Le rapport l'affiche « aucune activité enregistrée ».
- Montant vide : compté 0 dans les totaux, signalé en bas du rapport.
- Jours fériés : 8 dates fixes, plus lundi de Pâques, Ascension et lundi de Pentecôte calculés depuis Pâques (algorithme de Meeus). Les week-ends sont exclus aussi pour les lancements manuels.
- Nouvelles tentatives : 3 essais espacés de 5 s sur Salesforce, Slack et l'email. Un échec persistant déclenche le workflow 03, qui écrit au responsable seul, sans montant ni nom de client.

## Vérifications faites sur l'org (29/09/2026)

- Connexion OAuth : OK (API v59.0). Le credential est relié aux deux nœuds Salesforce.
- `LastStageChangeDate` : le champ existe mais reste vide sur les opportunités du périmètre. Le calcul part alors de `CreatedDate`.
- Devises : org mono-devise, `Amount` s'additionne sans conversion.
- Trimestre fiscal : calendrier standard (T3 = 01/07 au 30/09/2026).
- Exécution réelle sans envoi : 3 opportunités, 2 étapes, 3 alertes « en retard », 1 alerte « sans activité ».
- Reste à surveiller : les emails Einstein Activity Capture ne mettent pas `LastActivityDate` à jour.

## Procédure de test

| Cas | Procédure | Attendu |
|---|---|---|
| Jour férié | `dateReferenceForcee = 2027-05-06`, lancement manuel | Arrêt sur `Fin : pas d'envoi aujourd'hui` |
| Pipeline vide | Épingler une sortie vide sur `Lire opportunités Salesforce` | Message « 0 € sur 0 opportunité », rapport avec « Aucune alerte » deux fois |
| Alertes vides | Seuils à 9999 | Sections affichées avec « Aucune alerte » |
| Échec Salesforce | Workflow publié, ajouter `Foo__c` à la requête, attendre le déclencheur (ou régler le cron 2 min plus tard) | 3 essais, email au responsable, rien dans le canal |
| Échec Slack | `canalSlackId = C000INVALIDE`, même méthode | Idem |

Les workflows d'erreur ne se déclenchent pas sur un lancement manuel ni en CLI : les deux tests d'échec passent par une exécution planifiée.

## Limites connues

- Si Slack répond en timeout après avoir publié, la nouvelle tentative publie le message en double.
- Le mode `email_canal` dépend du plan Slack de l'entreprise et n'accepte qu'un SMTP interne. Gmail ou tout service externe est exclu, car le rapport contient montants et noms de clients.
