// The update to 0.30.0 writes the key `issue-prefix` of `.beads/config.yaml`, which the guard of the
// titles of the tests reads (never `bd`, absent in a CI): the prefix read once from Beads, at the
// poste. A file that holds the key is left; without the file, or without a prefix from Beads, the
// update says what to write.
// Beads is a stand-in on the PATH, which answers `bd config get issue_prefix`.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prefixe } from '../../../../scripts/prefixe-des-tickets.mjs';

// The module is loaded here, so that its absence is a red of each test, not a file that loads not.
type Ligne = string | { aFaire: string };
type Migration = { migrer: (p: string) => Ligne[]; nom: string; version: string };
const MODULE = '../../../../scripts/langages/typescript/migrations/0.30.0-prefixe-des-tickets.mjs';
const charge = await (import(/* @vite-ignore */ MODULE) as Promise<Migration>).catch(
  (e: Error): Migration => ({
    migrer: () => {
      throw e;
    },
    nom: '',
    version: '',
  })
);

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-prefixe-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The file `bd init` writes: the key commented out.
const DE_BD_INIT = `# Issue prefix for this repository (used by bd init)
# Example: issue-prefix: "myproject" creates issues like "myproject-1", "myproject-2", etc.
# issue-prefix: ""
`;

// A stand-in for Beads that gives the prefix <valeur> (empty: none), first on the PATH.
let chemin = '';
function beads(valeur: string) {
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\n[ "$1 $2 $3" = "config get issue_prefix" ] && printf '%s\\n' '${valeur}'\nexit 0\n`
  );
  chmodSync(path.join(bin, 'bd'), 0o755);
  process.env.PATH = `${bin}${path.delimiter}${chemin}`;
}
beforeEach(() => {
  chemin = process.env.PATH ?? '';
});
afterEach(() => {
  process.env.PATH = chemin;
});

// A project whose `.beads/config.yaml` holds <texte> (absent when null), without `.beads/` at all
// when <beads> is false.
function projet(texte: string | null, beads = true) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  if (beads) {
    mkdirSync(path.join(p, '.beads'));
  }
  if (texte !== null) {
    writeFileSync(path.join(p, '.beads', 'config.yaml'), texte);
  }
  return p;
}
const lire = (p: string) => readFileSync(path.join(p, '.beads', 'config.yaml'), 'utf8');

describe('the update writes the prefix of the tickets that the guard of the titles reads', () => {
  it('is a migration of 0.30.0', () => {
    expect(charge.version).toBe('0.30.0');
  });

  it('the key commented out by bd init: the prefix of Beads is written, and the guard reads it', () => {
    beads('demo');
    const p = projet(DE_BD_INIT);
    expect(charge.migrer(p)).toEqual([expect.stringContaining('issue-prefix: "demo"')]);
    expect(lire(p)).toBe(`${DE_BD_INIT}issue-prefix: "demo"\n`);
    expect(prefixe(p)).toBe('demo');
  });

  it('a key written empty is replaced', () => {
    beads('demo');
    const p = projet('issue-prefix: ""\nsync-branch: main\n');
    charge.migrer(p);
    expect(lire(p)).toBe('issue-prefix: "demo"\nsync-branch: main\n');
  });

  it('a key that holds its prefix is left, and a second pass changes nothing', () => {
    beads('autre');
    const p = projet('issue-prefix: "demo"\n');
    expect(charge.migrer(p)).toEqual([]);
    expect(lire(p)).toBe('issue-prefix: "demo"\n');
  });

  it('a project without .beads/ holds no tickets of Beads: nothing to write', () => {
    beads('demo');
    expect(charge.migrer(projet(null, false))).toEqual([]);
  });

  it('with .beads/ but without its config.yaml, or without a prefix from Beads, it says the key to write', () => {
    beads('');
    const sans = charge.migrer(projet(null));
    expect(sans).toEqual([
      { aFaire: expect.stringContaining('.beads/config.yaml manque') as string },
    ]);
    const p = projet(DE_BD_INIT);
    expect(charge.migrer(p)).toEqual([
      { aFaire: expect.stringContaining('bd config get issue_prefix') as string },
    ]);
    expect(lire(p)).toBe(DE_BD_INIT);
  });
});
