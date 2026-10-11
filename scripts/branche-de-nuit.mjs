#!/usr/bin/env node
// The night branch guard: refuses a push to origin that reaches the branch named by
// `grillhouse.poussee.nuit`, unless the night makes the push. Run by the pre-push hook of the
// frame with git's arguments (remote name, remote URL) and, on the standard input, the lines
// « <local ref> <local sha> <remote ref> <remote sha> » git writes.
//
// - Only the remote `origin` is watched, the one the night pushes to. A push of several refs one
//   of which reaches the branch, and the deletion of that remote branch, are refused whole.
// - The key is read as written in the package.json at the root of the working tree the push starts
//   from; without the key (or null) nothing is refused. An invalid value (see
//   scripts/poussee-cles.mjs) refuses the push, with a line that cites the key.
// - The night makes itself known by GRILLHOUSE_NUIT=1, which scripts/nuit.sh sets for its push
//   alone. It is a mark, not a secret: a human who sets it is trusted.
// - Exit 0 lets the push go on; exit 1 refuses it, the reason on the standard error.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lirePoussee } from './poussee-cles.mjs';

// The refusals for a push to `remote` of `refs` (the lines git writes) given the package.json
// object `pkg`; an empty list lets the push go on.
export function refus(remote, refs, pkg, env = process.env) {
  if (remote !== 'origin' || env.GRILLHOUSE_NUIT === '1' || !pkg) {
    return [];
  }
  const { nuit, fautes } = lirePoussee(pkg);
  if (fautes.length) {
    return fautes.map(
      f => `⛔ La clé ${f.cle} vaut ${f.valeur} : valeur invalide, la poussée est refusée.`
    );
  }
  if (nuit && refs.some(r => r.distante === `refs/heads/${nuit}`)) {
    return [`⛔ Seule la nuit pousse origin/${nuit} (grillhouse.poussee.nuit), après son vert.`];
  }
  return [];
}

// The pushed refs of git's standard input.
export function lireRefs(texte) {
  return texte
    .split('\n')
    .filter(l => l.trim())
    .map(l => {
      const [locale, sha, distante] = l.trim().split(/\s+/);
      return { locale, sha, distante };
    });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const fichier = path.join(racine, 'package.json');
  const pkg = existsSync(fichier) ? JSON.parse(readFileSync(fichier, 'utf8')) : null;
  const lignes = refus(process.argv[2], lireRefs(readFileSync(0, 'utf8')), pkg);
  for (const l of lignes) {
    process.stderr.write(`${l}\n`);
  }
  process.exit(lignes.length ? 1 : 0);
}
