#!/usr/bin/env node
// The dead-code guard: refuses a file, an export, a type or a dependency that nothing living
// uses, measured by knip (configured in the project's `knip.json`). Run by `pretest`.
//
// - Each finding is named with its file; exit code 1 when there is one.
// - A knip that measured nothing (it failed, or its output is not its report) refuses too: an
//   empty green is the worst green.
// - A finding that is not dead (a format's full table, a public name a consumer outside the
//   repository reads) leaves by its name in `knip.json`, with its reason, never by a wide pattern.
// - The packages listed out of the frame (`docs/agents/hors-cadre.txt`, read by `horsCadre` of
//   `consommateurs.mjs`) are skipped: knip neither reads nor reports them, so a use they make
//   keeps nothing alive. knip then runs on the project's `knip.json` (knip's defaults without
//   one) plus these exclusions, written to a temporary file outside the repository; the
//   project's `knip.json` is never written.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { horsCadre } from './consommateurs.mjs';

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

const liste = v => (v === undefined ? [] : [v].flat());

// The knip settings of the repository at <racine> with its packages out of the frame skipped:
// its `knip.json` (empty without one) plus `ignoreWorkspaces` for each listed directory under
// `packages/` and `ignore` for each listed directory under `packages/` and `src/`; null when the
// list names nothing.
function reglages(racine) {
  const hors = [...horsCadre(racine)].sort();
  if (!hors.length) return null;
  const fichier = path.join(racine, 'knip.json');
  const r = existsSync(fichier) ? JSON.parse(readFileSync(fichier, 'utf8')) : {};
  const espaces = [];
  const motifs = [];
  for (const nom of hors) {
    for (const parent of ['packages', 'src']) {
      if (!existsSync(path.join(racine, parent, nom))) continue;
      if (parent === 'packages') espaces.push(`packages/${nom}`);
      motifs.push(`${parent}/${nom}/**`);
    }
  }
  return {
    ...r,
    ignore: [...liste(r.ignore), ...motifs],
    ignoreWorkspaces: [...liste(r.ignoreWorkspaces), ...espaces],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = ['--no-install', 'knip', '--reporter', 'json', '--no-progress'];
  const config = reglages(process.cwd());
  let tmp = null;
  if (config) {
    tmp = mkdtempSync(path.join(tmpdir(), 'code-mort-'));
    const f = path.join(tmp, 'knip.json');
    writeFileSync(f, JSON.stringify(config));
    args.push('--config', f);
  }
  const r = spawnSync('npx', args, { encoding: 'utf8' });
  if (tmp) rmSync(tmp, { recursive: true, force: true });
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
