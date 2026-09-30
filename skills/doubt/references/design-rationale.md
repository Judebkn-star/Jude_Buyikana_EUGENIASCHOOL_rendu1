# Raisons de conception du skill doubt

À lire quand l'utilisateur demande de critiquer ce skill ou d'expliquer pourquoi il est fait ainsi. Les niveaux de confiance sont honnêtes : peu de choix ont été testés en usage réel.

## Décisions

| Choix | Pourquoi | Écarté | Me ferait changer d'avis | Confiance |
|---|---|---|---|---|
| Centré sur l'auto-critique de Claude, pas sur un reviewer externe | L'utilisateur veut que Claude soit son propre premier critique. En chat il n'y a pas de sous-agent à contexte neuf. | Un modèle "reviewer indépendant" (existe déjà chez d'autres, dépend des sous-agents) | Usage surtout dans Claude Code : ajouter un mode sous-agent | Moyenne |
| Définir "fini" avant de produire | Sans critères d'avance, on juge après coup et on se convainc | Critères fixés à la fin | Projets exploratoires où les critères changent : autoriser leur révision explicite | Moyenne |
| Journal des décisions tenu au fil de l'eau | Une justification écrite après coup est une rationalisation. Le journal permet aussi de répondre à une critique future. | Reconstruire les raisons à la demande | Si le journal alourdit trop les petits projets : le limiter aux choix non triviaux (déjà le cas) | Moyenne |
| Porte de satisfaction avec preuve exécutée | Un "je suis satisfait" subjectif se rationalise. Exiger une exécution ancre le verdict dans un fait. | Une note de confiance sur 10 | Cas sans outil de vérification : confiance plafonnée à "moyenne" (déjà prévu) | Moyenne |
| Plaider contre soi-même (étape 6) | Force à formuler l'objection la plus dure au lieu d'une liste de risques tièdes | Simple liste de risques | Si l'étape produit surtout du remplissage : la rendre optionnelle au niveau léger | Moyenne |
| Trois tours maximum | Garde-fou contre la boucle infinie | Pas de limite ; limite à deux | Si des tests montrent que le 3e tour trouve encore des bloquants | Faible : nombre arbitraire |
| Trois niveaux (léger, standard, fort) | Proportionner l'effort au risque pour ne pas tout ralentir | Un seul niveau ; cinq niveaux | Si les niveaux sont mal choisis en pratique | Faible : le nombre est arbitraire, le principe est solide |
| Fiches par type dans `references/` | Chargées seulement si utiles, le fichier principal reste court | Tout dans SKILL.md (v2) | Si la fiche est oubliée systématiquement : réintégrer les questions essentielles | Élevée (principe de chargement progressif) |
| Doute par étape de projet | La nature du doute change entre cadrage, conception, construction et livraison | Questions génériques | Si l'utilisateur travaille surtout en mode "petites tâches" sans étapes | Moyenne |
| Pré-mortem au démarrage | Technique connue pour faire remonter les risques tôt | Aucune | Si les réponses restent génériques dans l'usage réel | Moyenne |
| Barrière avant action irréversible | Coût d'une erreur asymétrique : mieux vaut demander | Confiance au résultat de la passe | Aucun cas prévu : le coût d'une question est faible | Élevée |
| Rapport proportionné, avec "Mon avis" | L'utilisateur veut voir le verdict de Claude sur son propre travail. Une ligne au niveau léger pour ne pas surcharger. | Rapport unique de 6 lignes (v2) | Si "Mon avis" devient un rituel sans contenu | Moyenne |
| Refus de plier sous simple pression | Éviter la complaisance qui rend un avis critique inutile | Céder dès que l'utilisateur insiste | Aucun : le skill demande aussi de reconnaître un bon argument | Moyenne |
| Rédigé en français | L'utilisateur écrit en français | Bilingue | Usage par des non-francophones | Élevée |

## Ce qui a changé de v2 à v3 (défauts trouvés en me critiquant)

1. La v2 ne gardait aucune trace des raisons des choix : ajout du journal et de ce fichier.
2. La porte de satisfaction était truquable : ajout d'une vérification exécutée obligatoire quand possible, de l'argument contre et des niveaux de confiance.
3. La description déclenchait "à chaque projet", contredisant la règle "pas pour le trivial" : description resserrée avec un cas de non-déclenchement.
4. Les fiches par type alourdissaient chaque déclenchement : déplacées dans `references/checklists.md`.
5. Le rapport à 6 lignes était trop lourd pour un petit travail : une ligne au niveau léger.
6. Rien ne disait quoi faire si l'utilisateur conteste une objection : règle "changer d'avis sur argument, pas sur pression".
7. Pas de déclencheurs en anglais : ajout de quelques expressions.

## Faiblesses connues

- Non testé sur un vrai projet. Seules la validité du format et la cohérence interne ont été contrôlées.
- Le déclenchement n'a pas été mesuré : l'optimisation de description demande la CLI `claude`, indisponible en chat.
- La satisfaction reste en partie subjective, malgré la preuve exécutée exigée.
- Angles morts partagés : Claude qui se critique ne voit pas ce qu'il ne sait pas voir. Seuls les outils et le second avis y remédient.
- Risque de ralentir des tâches rapides malgré les niveaux, si le niveau est surestimé.
- Description large : risque de sur-déclenchement à surveiller à l'usage.
