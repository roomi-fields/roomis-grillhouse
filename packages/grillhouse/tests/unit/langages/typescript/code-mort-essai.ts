import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, expect } from 'vitest';
import { appelsDe, preparer } from './code-mort-depot.js';

// The trial harness of the dead-code guard: the real guard (knip) run in a repository built in
// a fresh directory under <racine>, its modules linked to this repository's node_modules.
const SCRIPT = path.resolve(__dirname, '../../../../scripts/langages/typescript/code-mort.mjs');

// The content of a trial repository, as a map from each relative path to its text: node_modules
// (the link to this repository's modules) and the journal of knip are left out.
export function empreinte(dir: string): Record<string, string> {
  const carte: Record<string, string> = {};
  const lire = (rel: string) => {
    for (const e of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const chemin = path.join(rel, e.name);
      if (e.name === 'node_modules') {
        continue;
      }
      if (e.isDirectory()) {
        lire(chemin);
      } else {
        carte[chemin] = readFileSync(path.join(dir, chemin), 'utf8');
      }
    }
  };
  lire('');
  return carte;
}

// A trial repository that several cases of one file read without writing it: the guard runs in it
// once, before the first case (`beforeAll`), and each case reads the result. At the end of the run
// (`afterAll`) the content of the repository is compared to the one it had at its creation: a case
// that wrote in it fails the file; a case that writes keeps a repository of its own.
export function codeMortPartage(racine: string, files: Record<string, string | null>) {
  let essai!: ReturnType<typeof codeMortEssai>;
  let creation!: Record<string, string>;
  beforeAll(() => {
    essai = codeMortEssai(racine, files);
    creation = empreinte(essai.dir);
  }, 120_000);
  afterAll(() => {
    expect(empreinte(essai.dir), 'a case wrote in the shared repository').toEqual(creation);
  });
  return () => essai;
}

// Each file is written at its path; a file given as null is left out of the repository. With
// `journal`, each run of knip is recorded in `appels`, in order.
export function codeMortEssai(
  racine: string,
  files: Record<string, string | null>,
  { journal = false }: { journal?: boolean } = {}
) {
  const { dir, fichierJournal } = preparer(racine, files, journal);
  const r = spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
  return {
    dir,
    status: r.status,
    sortie: (r.stdout ?? '') + (r.stderr ?? ''),
    appels: appelsDe(fichierJournal),
  };
}
