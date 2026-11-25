// grillhouse-pkl.3 — the cases of the real cargo, played at night (a machine without cargo skips
// them): the suite of conformity on the module cargo against the real `cargo metadata`, and a
// run of the real nextest, its JUnit report read by the verdict, the files of its binaries from
// the real targets. The wrapper of rustc of the module against the real sccache.
//
// @equipee: sccache, que son test du lanceur de rustc exige, avec le vrai cargo.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { echecs } from '../../../../scripts/conformite.mjs';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/cargo/index.mjs';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';
import { avecSccache, demarrerLeServeur } from '../../../../scripts/langages/cargo/sccache.mjs';

const cargo = module as unknown as Langage;

type Exemples = Parameters<typeof echecs>[1];
const present = (outil: string[]) => spawnSync('cargo', outil, { stdio: 'ignore' }).status === 0;
const AVEC_CARGO = present(['--version']);
const AVEC_NEXTEST = AVEC_CARGO && present(['nextest', '--version']);

const AVEC_SCCACHE =
  AVEC_CARGO && spawnSync('sccache', ['--version'], { stdio: 'ignore' }).status === 0;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'cargo-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe('le lanceur de rustc du module cargo contre le vrai sccache', () => {
  it.skipIf(!AVEC_SCCACHE)(
    'compile et passe un test d’intégration qui lit env!("CARGO_BIN_EXE_<bin>")',
    () => {
      const crate = mkdtempSync(path.join(ESSAIS, 'binaire-'));
      const ecrire = (fichier: string, contenu: string) => {
        mkdirSync(path.dirname(path.join(crate, fichier)), { recursive: true });
        writeFileSync(path.join(crate, fichier), contenu);
      };
      ecrire(
        'Cargo.toml',
        '[package]\nname = "reference"\nversion = "0.0.0"\nedition = "2021"\n\n[[bin]]\nname = "osd-reference"\npath = "src/main.rs"\n'
      );
      ecrire('src/main.rs', 'fn main() {}\n');
      ecrire(
        'tests/it/main.rs',
        '#[test]\nfn lance() {\n    let b = env!("CARGO_BIN_EXE_osd-reference");\n    assert!(std::process::Command::new(b).status().unwrap().success());\n}\n'
      );
      // A target and a cache of sccache of the trial (the module puts it under XDG_CACHE_HOME): a
      // crate already cached would hide the variable the compilation lost.
      const base = {
        ...process.env,
        RUSTC_WRAPPER: '',
        XDG_CACHE_HOME: path.join(crate, 'cache'),
        CARGO_TARGET_DIR: path.join(crate, 'target'),
      };
      expect(demarrerLeServeur(crate, base)).toBeNull();
      const env = avecSccache(crate, base);
      try {
        const r = spawnSync('cargo', ['test'], { cwd: crate, env, encoding: 'utf8' });
        expect(r.status, r.stderr).toBe(0);
      } finally {
        spawnSync('sccache', ['--stop-server'], { env });
      }
    },
    600_000
  );
});

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
      // grillhouse-44b.5 : `tester` lance les tâches de Turborepo ; le corps de la tâche d'un
      // crate est `tests-du-paquet`.
      const c = cargo.commandes(depots.seul)['tests-du-paquet'];
      const r = spawnSync(process.execPath, [c.script, ...c.args, '.'], {
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
