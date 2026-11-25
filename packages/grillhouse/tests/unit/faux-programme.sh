#!/bin/sh
# The program every stand-in of the tests is a link to (./faux-programme.ts): it runs the text put
# beside the name it was launched by, with the interpreter the first line of that text names.
texte="${0%/*}/.textes/${0##*/}"
IFS= read -r ligne < "$texte"
# Unquoted: the line may name a program and its argument (`/usr/bin/env node`).
exec ${ligne#??} "$texte" "$@"
