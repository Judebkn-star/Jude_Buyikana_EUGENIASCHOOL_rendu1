# Fiches par type de projet

Lis uniquement la fiche qui correspond au travail en cours. Chaque fiche liste des questions de doute, pas des règles : garde celles qui s'appliquent.

## Code, application

- Quels cas limites : entrée vide, très grande, mal formée, caractères spéciaux, accents, dates limites, fuseaux horaires ?
- Que se passe-t-il quand un appel externe échoue, expire ou renvoie autre chose que prévu ?
- Des erreurs sont-elles avalées en silence ? Des secrets sont-ils en clair ?
- Les dépendances sont-elles nécessaires, à jour, et installables ailleurs que sur cette machine ?
- Le code a-t-il été exécuté sur un cas normal et sur au moins un cas piège ?

## Automatisation

- Idempotence : que se passe-t-il si l'exécution tourne deux fois sur la même donnée ?
- Reprise : si ça plante au milieu, l'état est-il cohérent et récupérable ?
- Limites de débit, quotas, volumes : que se passe-t-il à 10 fois la charge ?
- Qu'est-ce qui est écrit, où, et comment l'annuler ?
- Qui est alerté en cas de panne, et comment le saura-t-on si rien ne se passe ?

## Données, chiffres

- Quel périmètre et quelle période exactement ? Sont-ils les mêmes partout dans le document ?
- Doublons, valeurs nulles, unités mélangées, double comptage ?
- Les totaux sont-ils cohérents entre eux ?
- Le chiffre clé est-il recalculé par une seconde voie indépendante ?
- La source est-elle consultée, ou le chiffre vient-il de mémoire ?

## Document, contenu

- Répond-il à la question posée, ou à une version plus facile ?
- Quelles affirmations ne sont pas sourcées ou sont invérifiables ?
- Un lecteur sans contexte comprend-il dès le premier paragraphe ?
- Est-il plus long que nécessaire ? Qu'est-ce qu'on peut couper sans perte ?

## Skill

- La description déclenche-t-elle sur des phrases réelles, et pas sur tout et n'importe quoi ?
- Y a-t-il des contradictions entre sections, ou des consignes sans raison ?
- Est-il trop long pour un déclenchement fréquent ? Certaines parties devraient-elles aller dans `references/` ?
- Suis-le toi-même sur 2 ou 3 demandes réalistes et note où il flanche.
- Le format est-il valide ? Lance la validation et le packaging, ils attrapent des erreurs réelles (par exemple un deux-points non protégé dans le YAML).
- Le `references/design-rationale.md` existe-t-il, et dit-il honnêtement ce qui est arbitraire ou non testé ?

## Stratégie, business

- Quelles hypothèses sur le marché ou sur les gens sont supposées vraies sans preuve ?
- Qui a intérêt à ce que ça échoue, et que ferait-il ?
- Qu'est-ce qui prouverait qu'on se trompe, et à quelle échéance le saura-t-on ?
- Quelle est l'option "ne rien faire" ou "faire plus petit", et pourquoi est-elle battue ?
