#!/usr/bin/env bash
# UserPromptSubmit hook: a message that touches the project's structure (architecture, packages,
# modules, interfaces, boundaries) reminds the session that such a decision goes through the grill.
# Read-only; silent on every other message.
prompt="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).prompt||"")}catch{}})')"
if printf '%s' "$prompt" | grep -qiE 'architectur|paquet|package|monorepo|module|interface|fronti[eè]re|boundar|d[ée]coup|structur|couche|layer|composant|component|s[ée]parer|split'; then
  cat <<'MSG'
## Question de structure
Ce message touche la structure du projet. Une décision de structure (découpage, paquets, modules,
interfaces, frontières, architecture) se prend par le grill : charge la compétence `grill`
(§2 « La règle de l'architecture », §3 relevé structurel, §4 grill), jamais par une réponse
directe. Elle se tranche sur les objectifs, les consommateurs, les représentations de données et
les axes de changement, avec leurs pièces, et s'arbitre par ce que fait la référence mature du
domaine, ce qui existe déjà, ce qu'exige le domaine (charte, « Comment on arbitre ») — jamais sur
la taille du code ni sur « pas besoin pour l'instant ».
MSG
fi
exit 0
