// The preparation of a new project (scripts/preparation.mjs) sets `max_collision_prob` to 0.99 in
// Beads right after the `bd init` it plays, and a failure of that setting stops the preparation.
// Beads and CodeGraph are stand-ins on the PATH; Beads' stand-in logs each call in `$JOURNAL_BD`.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { preparer } from '../../scripts/preparation.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'preparation-seuil-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let chemin = '';
let journal = '';
const installer = (echecDuSet: boolean) => {
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  journal = path.join(bin, 'journal');
  writeFileSync(journal, '');
  const ecrire = (nom: string, corps: string) => {
    writeFileSync(path.join(bin, nom), `#!/bin/sh\n${corps}\n`);
    chmodSync(path.join(bin, nom), 0o755);
  };
  ecrire(
    'bd',
    `echo "$*" >> '${journal}'
if [ "$1" = init ]; then mkdir -p .beads; : > .beads/config.yaml; exit 0; fi
if [ "$1" = config ] && [ "$2" = set ]; then
  [ -d .beads ] || exit 1
  ${echecDuSet ? 'echo "set refused" >&2; exit 1' : 'exit 0'}
fi
exit 0`
  );
  ecrire('codegraph', 'exit 0');
  process.env.PATH = `${bin}${path.delimiter}${chemin}`;
};
beforeEach(() => {
  chemin = process.env.PATH ?? '';
});
afterEach(() => {
  process.env.PATH = chemin;
});

const appels = () =>
  readFileSync(journal, 'utf8')
    .split('\n')
    .filter(l => l !== '');

describe('the preparation of a new project sets the threshold of the codes of the tickets', () => {
  it('sets max_collision_prob to 0.99 right after bd init, while the store exists', () => {
    installer(false);
    const projet = mkdtempSync(path.join(ESSAIS, 'projet-'));
    preparer(projet, 'demo');
    const lignes = appels();
    const rangInit = lignes.findIndex(l => l.startsWith('init'));
    const rangSet = lignes.findIndex(l => l === 'config set max_collision_prob 0.99');
    expect(rangInit).toBeGreaterThanOrEqual(0);
    expect(rangSet).toBeGreaterThan(rangInit);
  });

  it('sets it once per preparation', () => {
    installer(false);
    const projet = mkdtempSync(path.join(ESSAIS, 'projet-'));
    preparer(projet, 'demo');
    expect(appels().filter(l => l === 'config set max_collision_prob 0.99')).toHaveLength(1);
  });

  it('fails when bd config set fails, as bd init does, without silencing it', () => {
    installer(true);
    const projet = mkdtempSync(path.join(ESSAIS, 'projet-'));
    expect(() => preparer(projet, 'demo')).toThrow();
  });
});
