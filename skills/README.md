# Skills Claude

Trois skills Claude Code encadrent un projet du début à la fin et servent à tous les projets. Le quatrième documente l'outil n8ncli.

| Moment | Skill | Ce qu'il fait |
|---|---|---|
| Début | [`interview`](interview/SKILL.md) | Claude te fait parler de ton idée, la conteste par paliers et rédige un `Specs.md` |
| Pendant | [`doubt`](doubt/SKILL.md) | Claude doute de son propre travail : critères de « fini », vérification exécutée, plaidoyer contre lui-même |
| Fin | [`hostile-review`](hostile-review/SKILL.md) | Claude relit le projet livré comme un ingénieur senior exigeant et classe les défauts par gravité |
| Outil | [`n8ncli`](n8ncli/SKILL.md) | Mode d'emploi de n8ncli pour un agent. Généré par `n8ncli import-skill --dir skills/n8ncli` |

## Installer

Crée un lien plutôt qu'une copie : le dépôt reste la seule version, et une amélioration poussée ici arrive tout de suite dans Claude Code.

    for s in interview doubt hostile-review; do ln -sfn "$PWD/skills/$s" ~/.claude/skills/$s; done

Claude Code les charge à la session suivante. Tu peux les appeler par leur nom (`/interview`, `/doubt`, `/hostile-review`) ou laisser Claude les déclencher selon leur description.

## État

- `interview` et `doubt` : version 3, non testés sur un vrai projet (voir leur `references/design-rationale.md`).
- `hostile-review` : en cours d'amélioration, premier cycle de tests fait le 30/09/2026.
