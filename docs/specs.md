# Specs | Digest pipeline Salesforce → Slack

## 1. Objectif

Diffuser chaque jour ouvré à l'équipe commerciale un rapport du pipeline en cours, avec des alertes sur les opportunités qui demandent une action.

## 2. Déclencheur

- Automatique, du lundi au vendredi à 9h00 (heure de Paris).
- Pas d'envoi les jours fériés français.
- Aucune action manuelle requise.

## 3. Livrable

**Dans Slack : un court résumé**
- Montant total du pipeline.
- Nombre total d'opportunités.

**En pièce jointe : le rapport HTML complet**, qui contient :
- le pipeline ouvert, détaillé par étape ;
- les alertes « en retard » ;
- les alertes « sans activité ».

## 4. Règles métier

**Périmètre**
- Toutes les opportunités ouvertes de l'entreprise, toutes étapes incluses.
- Limitées à celles dont la clôture est prévue sur le trimestre fiscal en cours, tel que défini dans Salesforce.
- Les alertes respectent la même limite.

**Alerte « en retard »**, si au moins l'un des deux critères est rempli :
- la date de clôture prévue est dépassée ;
- l'opportunité est dans la même étape depuis plus de 180 jours.

**Alerte « sans activité »**
- Aucune activité (appel, email, tâche, réunion) depuis plus de 180 jours.

## 5. Outils et accès

| Outil | Rôle | Statut des accès |
|---|---|---|
| Salesforce | Source des données | Acquis |
| Slack | Diffusion | À obtenir, interlocuteur non identifié |

- Aucune limite connue sur ces outils.

## 6. Destinataires

- Un nouveau canal Slack dédié, créé en canal privé.
- Membres : l'équipe commerciale et ses managers uniquement, sans invités externes.

## 7. Contraintes opérationnelles

**Volume**
- 1 exécution par jour ouvré, soit environ 20 par mois.

**Budget**
- 100 % gratuit par défaut.
- Un coût n'est acceptable que s'il est indispensable, et une alternative gratuite doit être présentée.

**Gestion des échecs**
- En cas d'échec de Salesforce ou de Slack : quelques nouvelles tentatives automatiques.
- Si l'échec persiste : alerte privée envoyée au responsable du processus uniquement.
- Les membres du canal ne reçoivent aucune alerte d'échec.

**Confidentialité**
- Les montants et noms de clients ne doivent jamais sortir de l'entreprise.
- La confidentialité prime sur la gratuité : un coût est préférable à un service externe non validé.

## 8. Planning et risques

- Mise en service souhaitée : aujourd'hui ou demain.
- **Risque principal** : l'accès d'envoi vers Slack n'est pas encore obtenu, et la personne à contacter n'est pas identifiée. L'échéance en dépend directement.
- **Point à surveiller** : avec des seuils à 180 jours et un périmètre limité au trimestre en cours, les sections d'alertes risquent de rester souvent vides. Si c'est le cas lors des premiers envois, revoir les seuils.

## 9. Actions préalables

1. Identifier l'administrateur Slack de l'entreprise et lui demander l'autorisation d'envoi automatique.
2. Créer le canal privé et y inviter l'équipe commerciale et ses managers.
