# Digest pipeline Salesforce → Slack

Chaque jour ouvré à 9h (Paris), n8n lit les opportunités ouvertes du trimestre fiscal dans Salesforce et publie dans un canal Slack privé un résumé, avec le rapport HTML complet en pièce jointe.

## Arborescence

```
.
├── README.md             ← tu es ici
├── CLAUDE.md             ← consignes pour Claude Code sur ce projet
├── .env.example          ← variables attendues dans .env (secrets, jamais commité)
├── docs/
│   ├── specs.md          ← règles métier, source de vérité fonctionnelle
│   └── architecture.md   ← schéma des workflows et choix de conception
├── n8n/
│   ├── workflows/        ← les 3 workflows, source unique (synchronisés par n8ncli)
│   └── config/           ← configuration n8ncli
├── tests/
│   └── workflows.test.mjs  ← code des nœuds + cohérence de la note Specs
├── skills/               ← skills Claude : interview, doubt, hostile-review, n8ncli
└── package.json          ← commandes npm (limitées aux 3 workflows du digest)
```

| Workflow | Rôle |
|---|---|
| `Digest Pipeline - Principal` | Principal : jours fériés, Salesforce, calculs, rapport HTML |
| `Digest Pipeline - Diffusion Slack` | Envoi dans Slack. Seule partie à changer si le mode d'accès Slack change |
| `Digest Pipeline - Alerte Echec` | Email privé au responsable quand le principal échoue |

Le fonctionnement détaillé est dans [docs/architecture.md](docs/architecture.md).

## Développer

Les fichiers `n8n/workflows/*.workflow.ts` sont la **seule source** des workflows. Le code des nœuds Code vit dedans.

| Je veux… | Commande |
|---|---|
| Récupérer une modification faite dans l'interface n8n | `npm run pull` |
| Envoyer une modification des `.ts` vers n8n | `npm run push` |
| Voir ce qui diffère entre local et n8n | `npm run status` |
| Tester le code des nœuds et la note Specs | `npm test` |
| Vérifier les workflows contre les schémas n8n | `npm run validate` |
| Vérifier le style (noms, notes) | `n8ncli lint`, jamais avec `--fix` |

Les commandes npm ne visent que les 3 workflows du digest (liste dans `package.json`, clé `config.workflows`). N'utilise pas `n8ncli pull` sans cible : il tirerait tous les workflows du projet n8n.

Après chaque modification : `npm test`, puis commit. Les tests écrivent des rapports d'exemple dans `tests/sortie/` (ignoré par git).

### Pièges connus de n8ncli (1.2.40)

- **Ne jamais lancer `n8ncli lint --fix`.** n8ncli croit qu'un nœud IF n'a qu'une sortie et fusionnerait les branches vrai/faux : les deux modes d'envoi partiraient ensemble. `lint` sans `--fix` affiche cet avertissement à tort, ignore-le.
- **Après `validate --upgrade-nodes`**, `status` peut annoncer « à jour » alors que rien n'est parti. Vérifie avec `n8ncli diff <id>` et, si besoin, retouche le fichier avant `npm run push`.
- **Conflit au push dû à un `webhookId`** : n8n ajoute seul cet identifiant aux nœuds Slack et Email. Si `n8ncli diff <id> --semantic` ne montre que ça, recopie l'identifiant dans le `.ts` puis `n8ncli push <id> --force`.
- **Dossiers vides `Projects/`, `Sandbox/`…** recréés dans `n8n/workflows/` : supprime-les avant un push, sinon n8ncli tente de les créer dans n8n.

Prérequis : [n8ncli](https://github.com/Workflows-Accelerator/n8n-cli) configuré avec l'environnement `local` (`n8ncli envs test local`). Sous Node 25, l'installer avec `--ignore-scripts` : sa dépendance `isolated-vm` ne compile pas.

Secrets : copier `.env.example` en `.env` et le remplir. n8n ne lit pas ce fichier, il sert d'aide-mémoire pour créer les credentials.

## Mise en place

1. **Credentials** à créer dans n8n puis relier aux nœuds :
   - Salesforce OAuth2 → `Lire opportunités Salesforce`, `Lire ordre des étapes` (fait)
   - Slack API, jeton bot `xoxb-…` avec scopes `chat:write` et `files:write` → `Publier dans le canal Slack`
   - SMTP interne → `Prévenir le responsable` et `Envoyer au canal par email`
2. **Paramètres** à renseigner (section suivante).
3. **Publier** d'abord `Diffusion Slack` (n8n 2.x refuse d'appeler un sous-workflow non publié), puis le principal.
4. **Fuseau horaire** du conteneur : ajouter `GENERIC_TIMEZONE=Europe/Paris` et `TZ=Europe/Paris`. Les workflows sont déjà réglés sur Europe/Paris.

## Paramètres

Nœud `Configuration` du workflow principal :

| Paramètre | Défaut | Rôle |
|---|---|---|
| `seuilRetardJours` | 180 | Jours dans la même étape avant alerte « en retard » |
| `seuilInactiviteJours` | 180 | Jours sans activité avant alerte « sans activité » |
| `devise` | EUR | Devise d'affichage |
| `inclureLundiPentecote` | true | `false` si l'entreprise travaille ce jour-là |
| `modeDiffusion` | slack_app | `slack_app` ou `email_canal` |
| `canalSlackId` | à renseigner | ID du canal privé, commence par `C` |
| `emailCanal`, `emailExpediteur` | à renseigner | Mode `email_canal` uniquement |
| `dateReferenceForcee` | vide | Tests : force une date `AAAA-MM-JJ`. Vide en production |

L'heure d'envoi se règle dans le déclencheur (cron `0 9 * * 1-5`). Le destinataire de l'alerte se règle dans `Configuration alerte` du workflow d'alerte, car un workflow d'erreur ne lit pas la configuration du principal.

## Tester dans n8n

| Cas | Procédure | Attendu |
|---|---|---|
| Jour férié | `dateReferenceForcee = 2027-05-06`, lancement manuel | Arrêt sur `Fin : pas d'envoi aujourd'hui` |
| Pipeline vide | Épingler une sortie vide sur `Lire opportunités Salesforce` | « 0 € sur 0 opportunité », « Aucune alerte » deux fois |
| Alertes vides | Seuils à 9999 | Sections affichées avec « Aucune alerte » |
| Échec Salesforce | Workflow publié, champ `Foo__c` dans la requête, exécution planifiée | 3 essais, email au responsable, rien dans le canal |
| Échec Slack | `canalSlackId = C000INVALIDE`, même méthode | Idem |

Les workflows d'erreur ne se déclenchent ni sur un lancement manuel ni en CLI.

## État au 30/09/2026

- **Fait** : connexion Salesforce (org mono-devise, trimestre fiscal standard), nœuds à leur dernière version (`validate` sans erreur), exécution réelle sans envoi le 30/09 identique au 29/09, 23 tests verts.
- **Reste** : credentials Slack et SMTP, `canalSlackId`, email du responsable, publication.
- **Limites connues** : message Slack en double si Slack répond en timeout après avoir publié. `LastStageChangeDate` vide sur l'org : le calcul part de `CreatedDate`.
