#!/usr/bin/env bash
# UserPromptSubmit hook: a message that asks for a structure decision (split, merge, create or remove
# a package, a module, an interface, a boundary) reminds the session that such a decision goes through
# the grill. Read-only; silent on every other message, including one that merely mentions structure.
prompt="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).prompt||"")}catch{}})')"
noun='paquets?|packages?|modules?|interfaces?|fronti[eè]res?|boundar(y|ies)|couches?|layers?|monorepo|architecture'
decision="faut-il|doit-on|devrait-on|est-ce qu.?il faut|besoin (de|d.)|on (d[ée]coupe|s[ée]pare)|d[ée]couper|s[ée]parer|scinder|fusionner|regrouper|extraire|cr[ée]er (un|une|des)|supprimer (le|la|les|un|une)|should (we|i)|do we need|split|merge"
if printf '%s' "$prompt" | grep -qiE "($noun)" && printf '%s' "$prompt" | grep -qiE "($decision)"; then
  cat <<'MSG'
## Décision de structure
Ce message demande une décision de structure (découpage, paquets, modules, interfaces, frontières).
Elle se prend par le grill : charge la compétence `grill` (§2 « La règle de l'architecture », §3
relevé structurel, §4 grill), jamais par une réponse directe. Elle se tranche sur les objectifs, les
consommateurs, les représentations de données et les axes de changement, avec leurs pièces, et
s'arbitre par la charte (« Comment on arbitre ») — jamais sur la taille du code ni sur « pas besoin
pour l'instant ».
MSG
fi
exit 0
