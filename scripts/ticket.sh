#!/usr/bin/env bash
# Crée un ticket sous sa mère, titré « <numéro> — <sujet> — <composant> », et affiche son id.
#   ticket.sh <mère> <sujet> <composant> <corps> [étiquette]
# Un corps @<fichier> se lit dans ce fichier. L'étiquette vaut a-valider par défaut ;
# decouverte crée le ticket fermé (« découverte consignée »).
# Le numéro est l'id sans le préfixe entier du projet (bd config get issue_prefix).
set -eu
if [ $# -lt 4 ]; then
  sed -n '2,7p' "$0" >&2
  exit 2
fi
mere=$1 sujet=$2 composant=$3 corps=$4 etiquette=${5:-a-valider}

case "$corps" in
  @*) source_corps=(--body-file "${corps#@}") ;;
  *) source_corps=(-d "$corps") ;;
esac
n=$(bd create "$sujet" --parent "$mere" --no-inherit-labels -t task -l "$etiquette" "${source_corps[@]}" --silent)
bd update "$n" --title "${n#"$(bd config get issue_prefix)"-} — $sujet — $composant" >/dev/null
[ "$etiquette" = decouverte ] && bd close "$n" -r "découverte consignée" >/dev/null
echo "$n"
