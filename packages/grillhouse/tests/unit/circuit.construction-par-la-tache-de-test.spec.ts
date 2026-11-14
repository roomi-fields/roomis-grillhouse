// grillhouse-lv9 — une cible de test Rust qui ne compile pas est un rouge de compilation, quel que
// soit l'étage cargo qui le remonte. Le cas de grillhouse-egm (tâche #build de cargo test --no-run)
// était déjà rangé « construction de <crate> ». Ici, l'échec de compilation remonte par la tâche de
// test <crate>#test:unit (nextest), SANS rapport JUnit, avec les erreurs du compilateur au journal :
// la preuve et les contrôles doivent le compter comme « construction de <crate> », pas « ne se
// charge pas / non joué » (témoin : osc-bridge OB-4gy, E0599 `bind` dans tests/osc_transport_e2e.rs).
// Un vrai test qui échoue à l'exécution (JUnit présent) ou un binaire qui compile mais ne se charge
// pas (aucune erreur de compilation au journal) reste rangé comme avant.
// Tests moyens : un dépôt d'essai, le faux cargo (./langages/cargo/faux-cargo.ts) pour cargo metadata.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import { composantsDe } from '../../scripts/ticket-du-circuit.mjs';
import moduleCargo from '../../scripts/langages/cargo/index.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

type Tache = {
  tache: string;
  paquet: string;
  dossier: string;
  script: string;
  tests: boolean;
  code: number | null;
  journal: string | null;
};
type Ctx = { copie: string; paquets: string[]; journal: string };
const constructionsEchouees = activites.constructionsEchouees as (
  ctx: Ctx,
  liste: { dossier: string; pkg: { name: string }; hors: boolean }[],
  dossier: string
) => { nom: string; erreur: string }[];
const rougesDe = activites.rougesDe as (
  ctx: Ctx,
  liste: { dossier: string; pkg: { name: string }; hors: boolean }[],
  c: { args: string[]; env?: Record<string, string>; code: number; dossier: string }
) => { rouges: { texte: string }[]; avertissements: string[] };
const echecDeCompilation = (
  moduleCargo as unknown as { echecDeCompilation?: (t: string) => boolean }
).echecDeCompilation;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'construction-tache-de-test-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
let restaurer: () => void = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
});
afterAll(() => restaurer());

// A trial copy with a single crate at its root (osc-bridge), its workspace its own, a tests/ folder.
function copie(): Ctx {
  const copie = mkdtempSync(path.join(ESSAIS, 'copie-'));
  declarerLesLangages(copie, { '.': 'cargo' });
  writeFileSync(
    path.join(copie, 'Cargo.toml'),
    '[package]\nname = "osc-bridge"\nversion = "0.1.0"\nedition = "2021"\n'
  );
  mkdirSync(path.join(copie, 'src'), { recursive: true });
  writeFileSync(path.join(copie, 'src', 'lib.rs'), 'pub fn un() -> i32 { 1 }\n');
  mkdirSync(path.join(copie, 'tests'), { recursive: true });
  writeFileSync(path.join(copie, 'tests', 'osc_transport_e2e.rs'), '#[test]\nfn e2e() {}\n');
  return { copie, paquets: ['.'], journal: path.join(copie, 'ticket.log') };
}

// The errors rustc prints, and cargo's summary of a crate that did not compile.
const ERREURS_DE_COMPILATION =
  '   Compiling osc-bridge v0.1.0\n' +
  'error[E0599]: no function or associated item named `bind` found for struct `Runtime`\n' +
  '  --> tests/osc_transport_e2e.rs:47:30\n' +
  'error: could not compile `osc-bridge` (test "osc_transport_e2e") due to 1 previous error\n';
// A test that compiled and ran, then failed at run time (a panic): no compiler error.
const PANIQUE_A_L_EXECUTION =
  'running 1 test\ntest e2e ... FAILED\n\nfailures:\n---- e2e ----\n' +
  "thread 'e2e' panicked at tests/osc_transport_e2e.rs:50:9:\nassertion failed\n";

// Writes a results directory under <copie> with the summary of Turborepo <taches>, each task's log
// holding <journaux>[tache]; a cargo JSON for the tasks a module writes (`cargo` scripts); and a
// JUnit report when <junit>.
function resultats(
  ctx: Ctx,
  taches: Tache[],
  journaux: Record<string, string> = {},
  junit = false
): string {
  const dossier = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  const duResume = taches.filter(t => !['build', 'nextest', 'doctest'].includes(t.script));
  const ecrites = taches.filter(t => ['build', 'nextest', 'doctest'].includes(t.script));
  for (const t of taches) {
    if (t.journal && journaux[t.tache] !== undefined) {
      writeFileSync(path.join(ctx.copie, t.journal), journaux[t.tache]);
    }
  }
  mkdirSync(path.join(dossier, 'turbo'), { recursive: true });
  writeFileSync(
    path.join(dossier, 'turbo', 'run.json'),
    JSON.stringify({
      tasks: duResume.map(t => ({
        taskId: t.tache,
        package: t.paquet,
        directory: t.dossier,
        task: t.script,
        execution: { exitCode: t.code },
        cache: { status: 'MISS' },
        logFile: t.journal,
      })),
    })
  );
  if (ecrites.length) {
    mkdirSync(path.join(dossier, 'cargo'), { recursive: true });
    writeFileSync(
      path.join(dossier, 'cargo', 'run.json'),
      JSON.stringify({ taches: ecrites, cibles: {} })
    );
  }
  if (junit) {
    mkdirSync(path.join(dossier, 'nextest'), { recursive: true });
    writeFileSync(
      path.join(dossier, 'nextest', 'osc-bridge.xml'),
      '<?xml version="1.0"?><testsuites><testsuite name="osc-bridge::osc_transport_e2e">' +
        '<testcase name="e2e"><failure message="panicked">panic</failure></testcase>' +
        '</testsuite></testsuites>'
    );
  }
  return dossier;
}

const testUnit = (code: number): Tache => ({
  tache: 'osc-bridge#test:unit',
  paquet: 'osc-bridge',
  dossier: '.',
  script: 'test:unit',
  tests: true,
  code,
  journal: 'osc-bridge-test-unit.log',
});
const buildCargo = (code: number): Tache => ({
  tache: 'osc-bridge#build',
  paquet: 'osc-bridge',
  dossier: '.',
  script: 'build',
  tests: false,
  code,
  journal: 'osc-bridge-build.log',
});

describe('une cible de test qui ne compile pas, remontée par la tâche de test', () => {
  it('echecDeCompilation reconnaît les erreurs du compilateur, pas une panique à l’exécution', () => {
    expect(echecDeCompilation).toBeTypeOf('function');
    expect(echecDeCompilation!(ERREURS_DE_COMPILATION)).toBe(true);
    expect(echecDeCompilation!('error[E0425]: cannot find value `x`\n')).toBe(true);
    expect(echecDeCompilation!(PANIQUE_A_L_EXECUTION)).toBe(false);
    expect(echecDeCompilation!('running 1 test\ntest e2e ... ok\n')).toBe(false);
  });

  it('une tâche #test:unit qui échoue par compilation (journal rustc, sans JUnit) est une construction', () => {
    const ctx = copie();
    const liste = composantsDe(ctx.copie).filter(p => !p.hors);
    const dossier = resultats(ctx, [testUnit(1)], {
      'osc-bridge#test:unit': ERREURS_DE_COMPILATION,
    });
    const r = constructionsEchouees(ctx, liste, dossier);
    expect(r).toHaveLength(1);
    expect(r[0]!.nom).toBe('osc-bridge');
  });

  it('une tâche #test:unit qui échoue à l’exécution (JUnit présent, pas d’erreur de compilation) n’est pas une construction', () => {
    const ctx = copie();
    const liste = composantsDe(ctx.copie).filter(p => !p.hors);
    const dossier = resultats(
      ctx,
      [testUnit(1)],
      { 'osc-bridge#test:unit': PANIQUE_A_L_EXECUTION },
      true
    );
    expect(constructionsEchouees(ctx, liste, dossier)).toEqual([]);
  });

  it('une tâche de test qui échoue sans erreur de compilation au journal (binaire qui ne se charge pas) n’est pas une construction', () => {
    const ctx = copie();
    const liste = composantsDe(ctx.copie).filter(p => !p.hors);
    const dossier = resultats(ctx, [testUnit(1)], {
      'osc-bridge#test:unit': 'error while loading shared libraries: libfoo.so\n',
    });
    expect(constructionsEchouees(ctx, liste, dossier)).toEqual([]);
  });

  it('une tâche #build rouge reste une construction (cas egm inchangé)', () => {
    const ctx = copie();
    const liste = composantsDe(ctx.copie).filter(p => !p.hors);
    const dossier = resultats(ctx, [buildCargo(101)], {
      'osc-bridge#build': ERREURS_DE_COMPILATION,
    });
    const r = constructionsEchouees(ctx, liste, dossier);
    expect(r).toHaveLength(1);
    expect(r[0]!.nom).toBe('osc-bridge');
  });

  it('un #build rouge ET un #test:unit de compilation pour le même crate ne comptent qu’une construction', () => {
    const ctx = copie();
    const liste = composantsDe(ctx.copie).filter(p => !p.hors);
    const dossier = resultats(ctx, [buildCargo(101), testUnit(101)], {
      'osc-bridge#build': ERREURS_DE_COMPILATION,
      'osc-bridge#test:unit': ERREURS_DE_COMPILATION,
    });
    expect(constructionsEchouees(ctx, liste, dossier)).toHaveLength(1);
  });

  it('aux contrôles, rougesDe rend « construction de <crate> », jamais « tâche … rouge »', () => {
    const ctx = copie();
    const liste = composantsDe(ctx.copie).filter(p => !p.hors);
    const dossier = resultats(ctx, [testUnit(1)], {
      'osc-bridge#test:unit': ERREURS_DE_COMPILATION,
    });
    const { rouges } = rougesDe(ctx, liste, { args: ['test'], code: 1, dossier });
    expect(rouges).toHaveLength(1);
    expect(rouges[0]!.texte).toMatch(/^construction de osc-bridge/);
    expect(rouges.some(x => /tâche .*rouge/.test(x.texte))).toBe(false);
  });

  it('un vrai test qui échoue reste un rouge du test, pas une construction', () => {
    const ctx = copie();
    const liste = composantsDe(ctx.copie).filter(p => !p.hors);
    const dossier = resultats(
      ctx,
      [testUnit(1)],
      { 'osc-bridge#test:unit': PANIQUE_A_L_EXECUTION },
      true
    );
    const { rouges } = rougesDe(ctx, liste, { args: ['test'], code: 1, dossier });
    expect(rouges.some(x => /^construction de/.test(x.texte))).toBe(false);
    expect(rouges.length).toBeGreaterThan(0);
  });
});
