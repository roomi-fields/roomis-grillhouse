// grillhouse-pkl.3 — the cases of the real cargo, played at night (a machine without cargo skips
// them): the suite of conformity on the module cargo against the real `cargo metadata`, and a
// run of the real nextest, its JUnit report read by the verdict, the files of its binaries from
// the real targets.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { echecs } from '../../../../scripts/conformite.mjs';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/cargo/index.mjs';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';

const cargo = module as unknown as Langage;

type Exemples = Parameters<typeof echecs>[1];
const present = (outil: string[]) => spawnSync('cargo', outil, { stdio: 'ignore' }).status === 0;
const AVEC_CARGO = present(['--version']);
const AVEC_NEXTEST = AVEC_CARGO && present(['nextest', '--version']);

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'cargo-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe('grillhouse-pkl.3 — le module cargo contre le vrai cargo', () => {
  it.skipIf(!AVEC_CARGO)(
    'the suite of conformity finds no fault',
    () => {
      const e = exemples as unknown as Exemples;
      expect(echecs(cargo, e, { dans: ESSAIS })).toEqual([]);
    },
    120_000
  );

  it.skipIf(!AVEC_NEXTEST)(
    'a run of nextest: its JUnit report read, each test in its file',
    () => {
      const { depots } = exemples.preparer(mkdtempSync(path.join(ESSAIS, 'run-'))) as {
        depots: { seul: string };
      };
      const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
      const c = cargo.commandes(depots.seul).tester;
      const r = spawnSync(process.execPath, [c.script, ...c.args], {
        cwd: depots.seul,
        encoding: 'utf8',
        env: { ...process.env, GRILLHOUSE_RESULTATS: resultats },
      });
      expect(r.status, r.stderr).toBe(0);
      const v = cargo.verdict(resultats);
      expect(v.taches.map(t => [t.tache, t.code])).toEqual([
        ['seul#build', 0],
        ['seul#nextest', 0],
        ['seul#doctest', 0],
      ]);
      expect(
        v.rapports.flatMap(x =>
          x.tests.map(t => `${path.relative(depots.seul, x.fichier)} › ${t.nom} ${t.etat}`)
        )
      ).toEqual(['tests/bout.rs › passe passed']);
    },
    600_000
  );
});
