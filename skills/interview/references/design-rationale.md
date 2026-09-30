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
| Questions à cocher (`AskUserQuestion`, cases `[ ]` hors Claude Code) | Demandé par l'utilisateur le 30/09/2026 : répondre en cochant va plus vite et donne des réponses nettes, faciles à reporter dans le registre | Questions en texte libre (v3) | Si « Autre » est coché à la plupart des questions : les options enferment au lieu d'aider | Moyenne : non testé en usage réel |
| Options neutres au palier 1, « (Recommandé) » seulement à partir du palier 2 | Des options toutes prêtes ancrent l'utilisateur sur la vision de Claude. Au palier 1 on veut faire parler | Recommandation dès le début | Si l'utilisateur ne sait pas répondre sans suggestion au palier 1 | Moyenne |
| 1 ou 2 questions par appel, pas 4 | Garde la règle « une question à la fois » de la v3, même si l'outil en accepte 4 | Remplir les 4 questions permises | Si les échanges paraissent trop lents | Faible : seuil arbitraire |
| Zéro question ouverte avant le Specs.md | Demandé par l'utilisateur. Une question ouverte dans des specs devient une décision prise plus tard, seul et sans contexte | Section « Questions ouvertes » dans le Specs.md (v3) | Si l'utilisateur abandonne l'interview à cause de la clôture | Moyenne |
| Trois issues : décidé, hypothèse assumée (avec critère de révision), action à faire (responsable et échéance) | Certains points ne peuvent pas être tranchés le jour même. Les convertir en hypothèse ou en action les rend traçables au lieu de les laisser flotter | Forcer une décision sur tout, même sans information | Si les « actions » restent sans suite en pratique | Moyenne |
| Passe adverse en cases à cocher, trois tours maximum | Aligne la relecture finale sur la règle zéro question, avec une limite contre la boucle infinie | Liste de remarques en texte (v3) | Si le troisième tour trouve encore des défauts sérieux | Faible : limite arbitraire, reprise du skill doubt |

## Ce qui a changé de v3 à v4 (30/09/2026)

1. Les questions passent par des cases à cocher (`AskUserQuestion` en Claude Code, cases `[ ]` ailleurs), avec « Autre » toujours disponible.
2. Options neutres au palier 1 pour limiter l'ancrage, recommandation autorisée ensuite.
3. Nouvelle section « Zéro question ouverte » : chaque point sort en décidé, hypothèse assumée ou action à faire.
4. Le Specs.md perd sa section « Questions ouvertes » et gagne « Actions avant démarrage » ; les hypothèses portent un critère de révision.
5. La passe adverse se tranche aussi en cases à cocher, trois tours maximum.

## Faiblesses connues

- Jamais testé sur une vraie idée : le comportement réel du crescendo est inconnu.
- Description très large ("j'ai une idée de projet") : risque de sur-déclenchement.
- Le nombre de paliers, le seuil "5 ou 6 questions" pour le point d'étape et le format du Specs.md sont arbitraires.
- Une interview longue peut fatiguer l'utilisateur : le skill prévoit de proposer la rédaction, mais rien ne mesure la fatigue.
- Le mode "pression" peut sembler agressif à certains utilisateurs.
- Les cases à cocher peuvent pousser vers des réponses rapides et moins réfléchies qu'un texte libre.
- La clôture « zéro question » peut transformer des vraies incertitudes en hypothèses choisies à la hâte pour finir.
- Angles morts : Claude choisit lui-même quelles questions creuser et ce qui est "flou". Ses biais orientent l'interview.
