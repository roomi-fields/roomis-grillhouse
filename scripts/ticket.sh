#!/usr/bin/env bash
# Crée un ticket sous sa mère, titré « <numéro> — <sujet> — <composants> », et affiche son id.
#   ticket.sh <mère> <sujet> <composants> <corps> [étiquette]
# Les composants tiennent en un argument, séparés par des virgules, le fournisseur d'abord :
# « 020-loader, 050-emitter ».
# Un corps @<fichier> se lit dans ce fichier. L'étiquette vaut a-valider par défaut ;
# decouverte crée le ticket fermé (« découverte consignée »).
# Le numéro est l'id sans le préfixe entier du projet (bd config get issue_prefix).
set -eu
if [ $# -lt 4 ]; then
  sed -n '2,9p' "$0" >&2
  exit 2
fi
mere=$1 sujet=$2 composants=$3 corps=$4 etiquette=${5:-a-valider}

case "$corps" in
  @*) source_corps=(--body-file "${corps#@}") ;;
  *) source_corps=(-d "$corps") ;;
esac
n=$(bd create "$sujet" --parent "$mere" --no-inherit-labels -t task -l "$etiquette" "${source_corps[@]}" --silent)
bd update "$n" --title "${n#"$(bd config get issue_prefix)"-} — $sujet — $composants" >/dev/null
[ "$etiquette" = decouverte ] && bd close "$n" -r "découverte consignée" >/dev/null
echo "$n"
