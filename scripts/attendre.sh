#!/usr/bin/env bash
# Attend, par tranches de 580 s au plus, le verdict d'un agent qu'un chef de chantier a lancé.
#   attendre.sh commentaires <ticket>     affiche le nombre de commentaires du ticket
#   attendre.sh commentaire <ticket> <n>  le ticket a plus de <n> commentaires, ou est fermé
# Sortie : 0 l'évènement est arrivé ; 124 la tranche est écoulée, on relance la même commande.
# Le circuit d'un ticket (scripts/circuit.mjs) part en arrière-plan :
# sa fin réveille le chef.
set -u
tranche=580

compter() { bd comments "$1" | grep -cE '^\[.* at '; }
ferme() { bd show "$1" | head -1 | grep -q 'CLOSED'; }

case "${1:-}" in
  commentaires)
    compter "$2"
    ;;
  commentaire)
    fin=$((SECONDS + tranche))
    while [ "$SECONDS" -lt "$fin" ]; do
      [ "$(compter "$2")" -gt "$3" ] && exit 0
      ferme "$2" && exit 0
      sleep 20
    done
    exit 124
    ;;
  *)
    sed -n '2,7p' "$0" >&2
    exit 2
    ;;
esac
