// A test of the day validates the code by importing it: starting the frame's command (its binary,
// or a script of its `bin/` or `scripts/`) is for the end-to-end tests, under a directory `e2e/` or
// in the package of the frame's trials. The guard of the sizes
// (scripts/langages/typescript/tailles-des-tests.mjs) reads it from the text of a test and of its
// test material (`lanceLeCadre`), and refuses it out of that zone (`binaire-de-jour`), the cases
// that exist inscribed in the known debt.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { juger } from '../../../../scripts/dette.mjs';
import {
  BINAIRE_DE_JOUR,
  cadreDe,
  classer,
  GARDE,
  lesMatieres,
  verifier,
} from '../../../../scripts/langages/typescript/tailles-des-tests.mjs';
import { lireLeDisque } from '../../../../scripts/langages/typescript/vitest-config/lances.mjs';

const DEPOT = path.resolve(__dirname, '../../../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'binaire-de-jour-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A repository held in memory, each path absolute under /r.
const R = '/r';
const memoire = (fichiers: Record<string, string>) => (f: string) =>
  fichiers[path.relative(R, f)] ?? null;
const lance = (fichiers: Record<string, string>, test: string) =>
  classer(path.join(R, test), memoire(fichiers)).lance as boolean;

// The texts that start a process lie in files of their own, so that this file's reading sees none.
const forme = (f: string) =>
  readFileSync(path.join(__dirname, '../../../formes/tailles', f), 'utf8');

// A trial repository on the disk, the frame installed under its node_modules, with one script.
function depot(fichiers: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  spawnSync('git', ['init', '-q', r]);
  const tout = {
    '.gitignore': 'node_modules/\n',
    'package.json': JSON.stringify({ name: 'p', private: true, workspaces: ['packages/*'] }),
    'node_modules/@roomi-fields/grillhouse/package.json': JSON.stringify({
      name: '@roomi-fields/grillhouse',
    }),
    'node_modules/@roomi-fields/grillhouse/scripts/garde.mjs': '',
    ...fichiers,
  };
  for (const [f, t] of Object.entries(tout)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  return r;
}
const constats = (r: string) =>
  (verifier(r) as { fichier: string; regle: string; message: string }[]).filter(
    c => c.regle === BINAIRE_DE_JOUR
  );

describe('a test that starts the frame’s command is read from its text', () => {
  it('starts it through a constant naming bin/grillhouse.mjs', () => {
    expect(lance({ 'tests/a.test.ts': forme('binaire-constante.txt') }, 'tests/a.test.ts')).toBe(
      true
    );
  });

  it('starts it through npx with the command’s name', () => {
    expect(lance({ 'tests/a.test.ts': forme('binaire-npx.txt') }, 'tests/a.test.ts')).toBe(true);
  });

  it('starts it through its link, carried from constant to constant', () => {
    expect(lance({ 'tests/a.test.ts': forme('binaire-lien.txt') }, 'tests/a.test.ts')).toBe(true);
  });

  it('starts it through the test material it imports', () => {
    const fichiers = {
      'tests/a.test.ts': "import { lancer } from './aide.js';\nit('a', () => lancer('maj'));\n",
      'tests/aide.ts': forme('binaire-matiere.txt'),
    };
    expect(lance(fichiers, 'tests/a.test.ts')).toBe(true);
  });

  it('does not start it when only git takes its path, or a node -e imports it', () => {
    expect(lance({ 'tests/a.test.ts': forme('binaire-absent.txt') }, 'tests/a.test.ts')).toBe(
      false
    );
  });

  it('does not start it when the test starts no process, whatever it names', () => {
    const texte = "const BIN = 'bin/grillhouse.mjs';\nit('a', () => expect(BIN).toBeTruthy());\n";
    expect(lance({ 'tests/a.test.ts': texte }, 'tests/a.test.ts')).toBe(false);
  });

  it('starts it through a script of the frame’s package, resolved on the disk', () => {
    const r = depot({ 'tests/s.test.ts': forme('binaire-script.txt') });
    const f = path.join(r, 'tests/s.test.ts');
    expect(classer(f, lireLeDisque, r, [], cadreDe(r)).lance).toBe(true);
    expect(classer(f, lireLeDisque, r, [], null).lance).toBe(false);
  });

  it('in Grillhouse, the test of the frame’s command starts it', () => {
    const f = path.join(DEPOT, 'packages/grillhouse/tests/unit/commande-grillhouse.spec.ts');
    const c = classer(f, lireLeDisque, DEPOT, lesMatieres(DEPOT), cadreDe(DEPOT));
    expect(c.lance).toBe(true);
  });
});

describe('a test of the day that starts the frame’s command is refused out of the end-to-end zone', () => {
  it('is a finding of the day, its message saying to import or to move under e2e/', () => {
    const r = depot({ 'tests/s.test.ts': forme('binaire-script.txt') });
    const c = constats(r);
    expect(c.map(x => x.fichier)).toEqual(['tests/s.test.ts']);
    expect(c[0]?.message).toMatch(/l'important/);
    expect(c[0]?.message).toMatch(/e2e\//);
  });

  it('is no finding under a directory e2e/, at night, or in the package of the frame’s trials', () => {
    const r = depot({
      'tests/e2e/s.test.ts': forme('binaire-script.txt'),
      'tests/s.nuit.test.ts': forme('binaire-npx.txt'),
      'packages/essais/package.json': JSON.stringify({ name: '@roomi-fields/grillhouse-essais' }),
      'packages/essais/tests/s.spec.ts': forme('binaire-npx.txt'),
    });
    expect(constats(r)).toEqual([]);
  });

  it('passes inscribed in the debt, and a new one is refused', () => {
    const r = depot({ 'tests/s.test.ts': forme('binaire-script.txt') });
    const dette = { [GARDE]: { 'tests/s.test.ts': { [BINAIRE_DE_JOUR]: { count: 1 } } } };
    expect(juger(dette, GARDE, verifier(r)).refus).toEqual([]);
    writeFileSync(path.join(r, 'tests/neuf.test.ts'), forme('binaire-npx.txt'));
    const { refus } = juger(dette, GARDE, verifier(r)) as { refus: { fichier: string }[] };
    expect(refus.map(x => x.fichier)).toEqual(['tests/neuf.test.ts']);
  });
});
