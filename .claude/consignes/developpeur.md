# Consigne du développeur

## Un import que le paquet ne déclare pas

Le refus de la règle `pas-d-import-non-declare` (frontières) dit : le fichier importateur, le paquet
importé, et deux suites.

- L'usage est valide pour l'architecture : déclare-le dans le `package.json` du paquet importateur
  (pour un composant du dépôt, aussi dans la section « Consommateurs » de l'INTERFACE.md du
  fournisseur).
- Sinon : ouvre une question d'architecture au superviseur (ta fiche `BESOIN`), sans déclarer l'usage.

Le refus ne se contourne pas : ni dette neuve, ni import retiré pour la forme.
