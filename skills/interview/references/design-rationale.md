# Raisons de conception du skill interview

À lire quand l'utilisateur demande de critiquer ce skill ou d'expliquer pourquoi il est fait ainsi. Les niveaux de confiance sont honnêtes : le skill n'a pas été testé sur une vraie idée.

## Décisions

| Choix | Pourquoi | Écarté | Me ferait changer d'avis | Confiance |
|---|---|---|---|---|
| Sparring partner plutôt que scribe | L'utilisateur veut être poussé et challengé, pas seulement transcrit | Questionnaire neutre | Si l'utilisateur veut surtout structurer sans être contesté | Moyenne |
| Une question à la fois (deux maximum) | Une rafale de questions donne des réponses bâclées | Liste de questions d'un coup | Si les échanges paraissent trop lents à l'usage | Moyenne |
| Attendre la réponse avant de proposer ses idées | Suggérer trop tôt ancre l'utilisateur sur ma vision | Proposer des idées dès le début | Si l'utilisateur reste bloqué sans suggestion | Moyenne |
| Crescendo en trois paliers | Demandé par l'utilisateur : commencer doux, monter la pression une fois la matière posée | Intensité choisie au départ | Si le palier 3 est vécu comme trop agressif, ou si personne ne l'atteint | Moyenne |
| Registre vivant (décidé, hypothèses, questions ouvertes) | Le Specs.md en sort presque tout seul, et ça évite de perdre des points | Rédaction à la fin depuis la mémoire de la conversation | Si le registre alourdit les réponses | Moyenne |
| Tour de table de personas au palier 3 | Fait sortir des objections que le questionnaire rate | Avocat du diable unique | Si les personas restent génériques à l'usage | Faible : idée validée par l'utilisateur, jamais testée |
| Vérification web des affirmations | Donne des faits pour le "pourquoi pas X" | Se fier à la mémoire de Claude | Si la recherche web n'est pas disponible : repli sur "hypothèse à vérifier" (déjà prévu) | Moyenne |
| Passe adverse sur le Specs.md | Un document rédigé sans critique laisse passer des trous | Livraison directe | Aucun cas prévu | Moyenne |
| Le Specs.md ne contient que ce qui a été dit ou décidé | Éviter que Claude comble les trous et les présente comme des décisions | Compléter avec des suggestions | Aucun cas prévu | Élevée |
| Sorties dérivées (one-pager, prompt de build) sur demande seulement | Utiles mais pas toujours voulues | Les produire systématiquement | Si l'utilisateur les demande à chaque fois | Faible |
| Mode reprise d'un Specs.md existant | Améliorer sans tout refaire | Refaire l'interview complète | Si les Specs.md fournis sont trop hétérogènes | Faible |
| Français | L'utilisateur écrit en français | Bilingue | Usage par des non-francophones | Élevée |

## Faiblesses connues

- Jamais testé sur une vraie idée : le comportement réel du crescendo est inconnu.
- Description très large ("j'ai une idée de projet") : risque de sur-déclenchement.
- Le nombre de paliers, le seuil "5 ou 6 questions" pour le point d'étape et le format du Specs.md sont arbitraires.
- Une interview longue peut fatiguer l'utilisateur : le skill prévoit de proposer la rédaction, mais rien ne mesure la fatigue.
- Le mode "pression" peut sembler agressif à certains utilisateurs.
- Angles morts : Claude choisit lui-même quelles questions creuser et ce qui est "flou". Ses biais orientent l'interview.
