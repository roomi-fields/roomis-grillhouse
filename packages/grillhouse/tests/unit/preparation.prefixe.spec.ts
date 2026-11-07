// The preparation of a new project (scripts/preparation.mjs) writes the prefix of its tickets in the
// key `issue-prefix` of `.beads/config.yaml`, which `bd init` leaves commented out (bd 1.2.2) and
// the guard of the titles of the tests reads: a new project passes the guard from its first commit.
// Beads and CodeGraph are stand-ins on the PATH; Beads' stand-in writes the file `bd init` writes.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { preparer } from '../../scripts/preparation.mjs';
import { prefixe } from '../../scripts/prefixe-des-tickets.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'preparation-prefixe-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The file `bd init` writes: the key commented out.
const DE_BD_INIT = `# Issue prefix for this repository (used by bd init)
# Example: issue-prefix: "myproject" creates issues like "myproject-1", "myproject-2", etc.
# issue-prefix: ""
`;

let chemin = '';
beforeEach(() => {
  chemin = process.env.PATH ?? '';
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  const ecrire = (nom: string, corps: string) => {
    writeFileSync(path.join(bin, nom), `#!/bin/sh\n${corps}\nexit 0\n`);
    chmodSync(path.join(bin, nom), 0o755);
  };
  ecrire(
    'bd',
    `[ "$1" = init ] && mkdir -p .beads && [ ! -f .beads/config.yaml ] && printf '%s' '${DE_BD_INIT}' > .beads/config.yaml`
  );
  ecrire('codegraph', ':');
  process.env.PATH = `${bin}${path.delimiter}${chemin}`;
});
afterEach(() => {
  process.env.PATH = chemin;
});

describe('the preparation of a new project writes the prefix of its tickets', () => {
  it('the key issue-prefix is written uncommented, with the prefix given, and the guard reads it', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'projet-'));
    expect(preparer(projet, 'demo')).toEqual([]);
    expect(readFileSync(path.join(projet, '.beads', 'config.yaml'), 'utf8')).toBe(
      `${DE_BD_INIT}issue-prefix: "demo"\n`
    );
    expect(prefixe(projet)).toBe('demo');
  });

  it('a second preparation changes nothing', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'projet-'));
    preparer(projet, 'demo');
    const avant = readFileSync(path.join(projet, '.beads', 'config.yaml'), 'utf8');
    preparer(projet, 'demo');
    expect(readFileSync(path.join(projet, '.beads', 'config.yaml'), 'utf8')).toBe(avant);
  });
});
