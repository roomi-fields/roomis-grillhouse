// grillhouse-44b.4.1: the trial material of the write lock that runs on the published version
// (scripts/aiguillage.mjs): the command of the copy is run for real, its scripts broken as a lot
// breaks them; the published version is a healthy package installed under the cache of a trial
// home. The lock judges the packages of the plan only in a git repository: the test that needs one
// makes it itself.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { expect } from 'vitest';
import { dossier, PAQUET } from './outil-essai.js';

export const VERSION = '9.9.9';
const BIN = 'bin/grillhouse.mjs';

// The package of the repository, its tests and node_modules left out, copied to <vers>.
function copierLePaquet(vers: string) {
  cpSync(PAQUET, vers, {
    recursive: true,
    filter: s => !/[\\/](tests|node_modules)$/.test(s),
  });
}

// A home whose cache holds the healthy published version VERSION.
export function maisonAvecLaVersionSaine() {
  const maison = dossier('maison');
  copierLePaquet(
    path.join(maison, '.cache/grillhouse/outil', VERSION, 'node_modules/@roomi-fields/grillhouse')
  );
  return maison;
}

// A healthy copy of the package, in a folder of its own.
export function copieSaine(nom = 'copie') {
  const vers = path.join(dossier(nom), 'node_modules/@roomi-fields/grillhouse');
  copierLePaquet(vers);
  return vers;
}

// A copy of the package whose script <rel> is rewritten by <casser>; the text must change.
export function copieCassee(rel: string, casser: (texte: string) => string) {
  const vers = copieSaine();
  const f = path.join(vers, rel);
  const avant = readFileSync(f, 'utf8');
  const apres = casser(avant);
  expect(apres, `${rel} doit changer`).not.toBe(avant);
  writeFileSync(f, apres);
  return vers;
}

// The project the lock judges: it names its published version, declares its language, and has a
// package a (the plan) and a package b; with <avecC>, a package c too.
export function depot({ outil = VERSION, avecC = false } = {}) {
  const repo = dossier('depot');
  const ecrire = (rel: string, contenu: unknown) => {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    writeFileSync(path.join(repo, rel), `${JSON.stringify(contenu, null, 2)}\n`);
  };
  ecrire('package.json', {
    name: 'racine',
    private: true,
    workspaces: ['packages/*'],
    grillhouse: { outil },
  });
  declarerLesLangages(repo);
  ecrire('packages/a/package.json', { name: 'a', version: '1.0.0' });
  ecrire('packages/b/package.json', { name: 'b', version: '1.0.0' });
  if (avecC) {
    ecrire('packages/c/package.json', { name: 'c', version: '1.0.0' });
  }
  return repo;
}

// The lock of <role>, started as the hook starts it: the command of <paquet>, the plan <plan>, the
// hook's JSON on its standard input, the working directory <repo>.
export function verrou(
  paquet: string,
  {
    repo,
    maison,
    role = 'testwriter',
    fichier,
    npm,
    plan = 'packages/a',
  }: {
    repo: string;
    maison: string;
    role?: string;
    fichier: string;
    npm?: string;
    plan?: string;
  }
) {
  return spawnSync(process.execPath, [path.join(paquet, BIN), 'verrou', role], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 60_000,
    input: JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: path.join(repo, fichier), content: 'x' },
      cwd: repo,
    }),
    env: {
      ...process.env,
      HOME: maison,
      // The trial repository lies under the system temp directory, which the lock always lets
      // through: the lock's own temp directory is another one.
      TMPDIR: path.join(maison, 'tmp'),
      GRILLHOUSE_ENVELOPPE: plan,
      PATH: [npm ? path.dirname(npm) : null, process.env.PATH].filter(Boolean).join(':'),
    },
  });
}

export const SYNTAXE = (t: string) => `${t}\nexport const = ;\n`;
const SANS_EXPORT = (t: string) =>
  t.replace('export function paquetsSansPackageJson', 'function paquetsSansPackageJson');

// The two breaks of a script that a lot makes.
export const CASSES: [string, string, (t: string) => string][] = [
  ['une erreur de syntaxe dans un module de langage', 'scripts/langages.mjs', SYNTAXE],
  ['un export retiré qu’un autre module importe', 'scripts/paquet-npm.mjs', SANS_EXPORT],
];
