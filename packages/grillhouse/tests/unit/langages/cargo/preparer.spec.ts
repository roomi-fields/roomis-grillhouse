// grillhouse-pkl.5, criterion 3 — the integration and the queue play the preparation the module
// of the language describes (`preparer` of `commandes`) before the verification, as a CI fetches
// the dependencies of a job before its tests (`cargo fetch --locked`, then the tests offline): in
// a workspace of cargo, against the fake cargo (./faux-cargo.ts), `cargo fetch --locked` comes
// before the first run of nextest. A language that describes no preparation goes straight to the
// verification.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { commandesDeVerification } from '../../../../scripts/integration/rejeu.mjs';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const BIN = path.resolve(__dirname, '../../../../bin/grillhouse.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'preparer-cargo-'));
const JOURNAL = path.join(ESSAIS, 'journal');
let restaurer = () => {};
let seul: string;
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), JOURNAL);
  seul = (exemples.preparer(ESSAIS) as { depots: { seul: string } }).depots.seul;
  writeFileSync(
    path.join(seul, 'package.json'),
    JSON.stringify({
      name: 'seul',
      grillhouse: { langages: ['cargo'] },
      scripts: { verifier: `node ${JSON.stringify(BIN)} verifier --tout` },
    })
  );
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => restaurer());

describe('grillhouse-pkl.5, critère 3 — l’intégration prépare avant de vérifier', () => {
  it('a workspace of cargo: cargo fetch --locked, then the verification and its nextest', () => {
    const etapes = commandesDeVerification(seul);
    expect(etapes.map(([c, a]) => [path.basename(c), ...a.slice(-1)])).toEqual([
      [path.basename(process.execPath), 'preparer'],
      ['npm', 'verifier'],
    ]);
    writeFileSync(JOURNAL, '');
    const verrou = path.join(mkdtempSync(path.join(ESSAIS, 'verrou-')), 'mesure.lock');
    for (const [commande, args] of etapes) {
      const r = spawnSync(commande, args, {
        cwd: seul,
        encoding: 'utf8',
        env: { ...process.env, GRILLHOUSE_VERROU_MACHINE: verrou },
      });
      expect(r.status, `${commande} ${args.join(' ')}\n${r.stdout}${r.stderr}`).toBe(0);
    }
    const appels = readFileSync(JOURNAL, 'utf8')
      .split('\n')
      .filter(l => l && !l.startsWith('metadata '));
    const fetch = appels.indexOf('fetch --locked');
    const nextest = appels.findIndex(l => l.startsWith('nextest run'));
    expect(fetch, appels.join('\n')).toBe(0);
    expect(nextest, appels.join('\n')).toBeGreaterThan(fetch);
  }, 60_000);

  it('a project of TypeScript describes no preparation: the verification alone', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'typescript-'));
    writeFileSync(
      path.join(projet, 'package.json'),
      JSON.stringify({ name: 'p', grillhouse: { langages: ['typescript'] } })
    );
    expect(commandesDeVerification(projet)).toEqual([['npm', ['run', 'verifier']]]);
  });
});
