# Skills Claude

Trois skills Claude Code qui encadrent un projet du début à la fin. Ils servent à tous les projets, pas seulement au digest.

| Moment | Skill | Ce qu'il fait |
|---|---|---|
| Début | [`interview`](interview/SKILL.md) | Claude te fait parler de ton idée, la conteste par paliers et rédige un `Specs.md` |
| Pendant | [`doubt`](doubt/SKILL.md) | Claude doute de son propre travail : critères de « fini », vérification exécutée, plaidoyer contre lui-même |
| Fin | [`hostile-review`](hostile-review/SKILL.md) | Claude relit le projet livré comme un ingénieur senior exigeant et classe les défauts par gravité |

## Installer

    cp -R skills/interview skills/doubt skills/hostile-review ~/.claude/skills/

Claude Code les charge à la session suivante. Tu peux les appeler par leur nom (`/interview`, `/doubt`, `/hostile-review`) ou laisser Claude les déclencher selon leur description.

## État

- `interview` et `doubt` : version 3, non testés sur un vrai projet (voir leur `references/design-rationale.md`).
- `hostile-review` : en cours d'amélioration, premier cycle de tests fait le 30/09/2026.
