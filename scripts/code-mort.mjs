#!/usr/bin/env node
// The dead-code guard: refuses a file, an export, a type or a dependency that nothing living
// uses, measured by knip (configured in the project's `knip.json`). Run by `pretest`.
//
// - Each finding is named with its file; exit code 1 when there is one.
// - A knip that measured nothing (it failed, or its output is not its report) refuses too: an
//   empty green is the worst green.
// - A finding that is not dead (a format's full table, a public name a consumer outside the
//   repository reads) leaves by its name in `knip.json`, with its reason, never by a wide pattern.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const GENRES = {
  files: 'fichier sans appelant',
  exports: 'export sans appelant',
  types: 'type exporté sans appelant',
  enumMembers: "membre d'énumération sans appelant",
  dependencies: 'dépendance sans usage',
  devDependencies: 'dépendance de développement sans usage',
  unlisted: 'dépendance non déclarée',
  unresolved: 'import introuvable',
  binaries: 'commande non déclarée',
  duplicates: 'export en double',
};

// The findings of knip's JSON report, one line each; null when the report is not knip's.
export function constats(texte) {
  let r;
  try {
    r = JSON.parse(texte);
  } catch {
    return null;
  }
  if (!Array.isArray(r?.issues)) return null;
  const out = [];
  for (const i of r.issues) {
    for (const [genre, nom] of Object.entries(GENRES)) {
      for (const x of i[genre] ?? []) {
        const n = Array.isArray(x) ? x.map(y => y.name).join(', ') : x.name;
        out.push(genre === 'files' ? `${i.file} : ${nom}` : `${i.file} : ${nom} — ${n}`);
      }
    }
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const r = spawnSync('npx', ['--no-install', 'knip', '--reporter', 'json', '--no-progress'], {
    encoding: 'utf8',
  });
  const c = constats(r.stdout ?? '');
  if (c === null) {
    process.stderr.write(
      `⛔ CODE MORT — knip n'a rien mesuré :\n${(r.stderr || r.stdout || '').slice(0, 1000)}\n`
    );
    process.exit(1);
  }
  if (c.length) {
    process.stderr.write(
      `⛔ CODE MORT — ${c.length} constat(s) : chacun se supprime, ou sort par son nom dans knip.json avec sa raison.\n`
    );
    for (const l of c) process.stderr.write(`  ${l}\n`);
    process.exit(1);
  }
}
