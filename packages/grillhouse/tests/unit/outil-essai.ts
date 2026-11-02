// The trial helpers of the published version that leads the repository (grillhouse-9tu): trial
// folders, projects with their key, a version installed by hand, stand-ins for npm.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

export const PAQUET = path.resolve(__dirname, '../..');
const DEPOT = path.resolve(PAQUET, '../..');
export const COMMANDE = path.join(DEPOT, 'node_modules/.bin/grillhouse');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'outil-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let n = 0;
export const dossier = (nom: string) => {
  const d = path.join(ESSAIS, `${nom}-${++n}`);
  mkdirSync(d, { recursive: true });
  return d;
};

// A project whose package.json holds <grillhouse> as its key `grillhouse`.
export function projet(grillhouse?: unknown): string {
  const d = dossier('projet');
  writeFileSync(
    path.join(d, 'package.json'),
    JSON.stringify({ name: 'essai', private: true, ...(grillhouse ? { grillhouse } : {}) })
  );
  return d;
}

// The command of the version installed under <cache>/<version>: a stand-in that writes its
// arguments and its directory, and exits 7.
export function installe(cache: string, version: string): string {
  const bin = path.join(cache, version, 'node_modules/@roomi-fields/grillhouse/bin/grillhouse.mjs');
  mkdirSync(path.dirname(bin), { recursive: true });
  writeFileSync(
    bin,
    "process.stdout.write(`publiee ${process.argv.slice(2).join(' ')} @ ${process.cwd()}\\n`); process.exitCode = 7;\n"
  );
  return bin;
}

// A stand-in for npm, in a directory of its own: it writes its arguments in <journal>, one line a
// call, and installs under its `--prefix`, as npm, each name it is given:
// - @roomi-fields/grillhouse@<v>: the version's command (`installe`) and a package.json that
//   declares <peers> as its peer dependencies; with <copie>, the package of the repository itself
//   (its tests left out), its dependencies linked from the repository's node_modules;
// - any other <nom>@<plage>: the repository's node_modules/<nom>, linked, with <copie>;
// - <concurrent>: a folder another installation completes meanwhile, its command written.
export function fauxNpm(
  journal: string,
  {
    peers = {},
    copie = false,
    concurrent = '',
  }: { peers?: Record<string, string>; copie?: boolean; concurrent?: string } = {}
): string {
  const d = dossier('npm');
  const f = path.join(d, 'npm');
  const config = JSON.stringify({ journal, peers, copie, concurrent, PAQUET, DEPOT });
  writeFileSync(
    f,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const c = ${config};
const a = process.argv.slice(2);
fs.appendFileSync(c.journal, a.join(' ') + '\\n');
const prefixe = a[a.indexOf('--prefix') + 1];
const nm = path.join(prefixe, 'node_modules');
const lier = nom => {
  const source = path.join(c.DEPOT, 'node_modules', nom);
  const cible = path.join(nm, nom);
  if (!fs.existsSync(source) || fs.existsSync(cible)) return;
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  fs.symlinkSync(source, cible);
};
const BIN = "process.stdout.write('publiee ' + process.argv.slice(2).join(' ') + '\\\\n'); process.exitCode = 7;\\n";
for (const spec of a.filter(x => /^@?[^@-][^@]*@/.test(x))) {
  const nom = spec.slice(0, spec.lastIndexOf('@'));
  if (nom === '@roomi-fields/grillhouse') {
    const p = path.join(nm, nom);
    if (c.copie) {
      fs.cpSync(c.PAQUET, p, { recursive: true, filter: s => !/[\\/](tests|node_modules)$/.test(s) });
      const pkg = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8'));
      for (const dep of Object.keys(pkg.dependencies || {})) lier(dep);
    } else {
      fs.mkdirSync(path.join(p, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(p, 'bin', 'grillhouse.mjs'), BIN);
      fs.writeFileSync(path.join(p, 'package.json'), JSON.stringify({ name: nom, peerDependencies: c.peers }));
    }
    if (c.concurrent) {
      const autre = path.join(c.concurrent, 'node_modules', nom, 'bin');
      fs.mkdirSync(autre, { recursive: true });
      fs.writeFileSync(path.join(autre, 'grillhouse.mjs'), 'autre');
    }
  } else if (c.copie) {
    lier(nom);
  }
}
`
  );
  chmodSync(f, 0o755);
  return f;
}

// An npm whose every install fails, writing <raison> on its error stream and its call in <journal>.
export function npmEnPanne(journal: string, raison = 'ENOTFOUND registry.npmjs.org'): string {
  const d = dossier('npm');
  const f = path.join(d, 'npm');
  writeFileSync(f, `#!/bin/sh\necho "$*" >> '${journal}'\necho '${raison}' >&2\nexit 1\n`);
  chmodSync(f, 0o755);
  return f;
}

// The pid of a process that has ended.
export const pidMort = () => spawnSync(process.execPath, ['-e', '0']).pid;
