// grillhouse-44b.5, critères 1, 6, 7, 8 et 9 — le module cargo joue ses tests par les tâches de
// Turborepo, la voie de TypeScript (scripts/langages/typescript/tests.mjs) : `tester`, avec ou sans
// chemin, lance `turbo run test:unit` sur les crates, les chemins nommés passant à la tâche par la
// variable `GRILLHOUSE_TESTS` (qui entre dans son hash) ; le script `test:unit` d'un crate appelle
// la commande `tests-du-paquet` du module, qui joue le corps de la tâche (la construction des
// cibles de test, nextest, les doctests) sans relancer Turborepo ; aucune sélection par le dernier
// vert. Joué contre le faux cargo (./faux-cargo.ts) et le faux Turborepo (../../faux-turbo.ts),
// dont les journaux listent les appels.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../../../scripts/jointure.js';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';
import module from '../../../../scripts/langages/cargo/index.mjs';
import { appelsDeTurbo, installerFauxTurbo } from '../../faux-turbo.js';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const cargo = module as unknown as Langage;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'cargo-par-turbo-'));
const JOURNAL = path.join(ESSAIS, 'journal-cargo');
const JOURNAL_TURBO = path.join(ESSAIS, 'journal-turbo');
let restaurer = () => {};
let turbo: string;
let espace: string;
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => restaurer());
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), JOURNAL);
  turbo = installerFauxTurbo(ESSAIS);
  espace = (exemples.preparer(ESSAIS) as { depots: { espace: string } }).depots.espace;
  // Chaque crate est un paquet du graphe (grillhouse-44b.4) : son package.json, son nom le dossier.
  writeFileSync(
    path.join(espace, 'package.json'),
    JSON.stringify({ name: 'essai', private: true, workspaces: ['crates/*'] })
  );
  for (const c of ['core', 'app', 'matiere', 'outil']) {
    writeFileSync(
      path.join(espace, `crates/${c}/package.json`),
      JSON.stringify({
        name: c,
        private: true,
        scripts: { 'test:unit': `grillhouse tests-du-paquet crates/${c}` },
      })
    );
  }
});

function lancer(nom: string, args: string[] = [], env: NodeJS.ProcessEnv = {}) {
  writeFileSync(JOURNAL, '');
  writeFileSync(JOURNAL_TURBO, '');
  const c = cargo.commandes(espace)[nom]!;
  const r = spawnSync(process.execPath, [c.script, ...c.args, ...args], {
    cwd: espace,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${turbo}${path.delimiter}${process.env.PATH ?? ''}`,
      HOME: path.join(ESSAIS, 'maison'),
      XDG_CACHE_HOME: '',
      GRILLHOUSE_RESULTATS: mkdtempSync(path.join(ESSAIS, 'resultats-')),
      FAUX_TURBO_JOURNAL: JOURNAL_TURBO,
      ...env,
    },
  });
  const cargoAppels = readFileSync(JOURNAL, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('metadata '))
    .map(l => l.replace(' --message-format=json-render-diagnostics', ''));
  return { code: r.status, stderr: r.stderr, cargoAppels, turbo: appelsDeTurbo(JOURNAL_TURBO) };
}

const filtres = (args: string[]) => args.filter(a => a.startsWith('--filter=')).sort();
const nommes = (tests: string | null) =>
  (JSON.parse(tests ?? '{"arguments":[]}') as { arguments: string[]; rejouer?: string }).arguments;

describe('grillhouse-44b.5, critères 1 et 6 — tester lance les tâches de Turborepo', () => {
  it('critère 6: sans chemin, un seul `turbo run test:unit` sur les crates, cargo jamais lancé', () => {
    const r = lancer('tester');
    expect(r.code, r.stderr).toBe(0);
    expect(r.cargoAppels).toEqual([]);
    expect(r.turbo).toHaveLength(1);
    expect(r.turbo[0]!.args.slice(0, 2)).toEqual(['run', 'test:unit']);
    expect(filtres(r.turbo[0]!.args)).toEqual(
      expect.arrayContaining(['--filter=app', '--filter=core'])
    );
  });

  it('critère 6: un chemin de test choisit le crate qui le tient, et passe, absolu, par la variable des tests', () => {
    const r = lancer('tester', ['crates/core/tests/t.rs']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.cargoAppels).toEqual([]);
    expect(filtres(r.turbo[0]!.args)).toEqual(['--filter=core']);
    expect(nommes(r.turbo[0]!.tests)).toEqual([path.join(espace, 'crates/core/tests/t.rs')]);
  });

  it('critère 6: un dossier de crate, puis deux chemins de deux crates : leurs filtres, triés', () => {
    expect(filtres(lancer('tester', ['crates/app']).turbo[0]!.args)).toEqual(['--filter=app']);
    const r = lancer('tester', ['crates/core/tests/t.rs', 'crates/app/tests/integ.rs']);
    expect(filtres(r.turbo[0]!.args)).toEqual(['--filter=app', '--filter=core']);
    expect(nommes(r.turbo[0]!.tests).sort()).toEqual([
      path.join(espace, 'crates/app/tests/integ.rs'),
      path.join(espace, 'crates/core/tests/t.rs'),
    ]);
  });

  it('critère 6: une option va à la tâche, avec les chemins', () => {
    const r = lancer('tester', ['crates/core/tests/t.rs', '--no-capture']);
    expect(nommes(r.turbo[0]!.tests)).toEqual([
      path.join(espace, 'crates/core/tests/t.rs'),
      '--no-capture',
    ]);
  });

  it('critère 6: un chemin hors de tout crate est refusé, nommé, Turborepo jamais lancé (2)', () => {
    const r = lancer('tester', ['README.md']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/README\.md/);
    expect(r.turbo).toEqual([]);
    expect(r.cargoAppels).toEqual([]);
  });

  it('critère 6: le code de Turborepo est celui de tester', () => {
    expect(lancer('tester', [], { FAUX_TURBO_CODE: '1' }).code).toBe(1);
  });

  it('critère 1: sans la marque du circuit, la sélection par le dernier vert n’existe plus : même appel avec ou sans', () => {
    const sans = lancer('tester');
    const avec = lancer('tester', [], { GRILLHOUSE_DEPUIS_LE_VERT: '1' });
    expect(avec.turbo[0]!.args).toEqual(sans.turbo[0]!.args);
    expect(avec.cargoAppels).toEqual([]);
  });
});

describe('grillhouse-44b.5, critère 8 — --force rejoue pour de vrai', () => {
  it('sans chemin, --force rejoue la tâche : `--force` à Turborepo, ou le moment du rejeu dans la variable', () => {
    const r = lancer('tester', ['--force']);
    expect(r.code, r.stderr).toBe(0);
    const t = r.turbo[0]!;
    const moment = (JSON.parse(t.tests ?? '{}') as { rejouer?: string }).rejouer;
    expect(t.args.includes('--force') || typeof moment === 'string').toBe(true);
  });

  it('avec un chemin, --force change la variable des tests : le hash de la tâche change, elle est rejouée', () => {
    const sans = lancer('tester', ['crates/core/tests/t.rs']).turbo[0]!;
    const force = lancer('tester', ['crates/core/tests/t.rs', '--force']).turbo[0]!;
    expect(force.tests).not.toBe(sans.tests);
    expect((JSON.parse(force.tests!) as { rejouer?: string }).rejouer).toEqual(expect.any(String));
    expect(nommes(force.tests)).toEqual([path.join(espace, 'crates/core/tests/t.rs')]);
  });

  it('sans --force, la variable ne porte aucun moment : un crate inchangé est relu du cache', () => {
    const t = lancer('tester', ['crates/core/tests/t.rs']).turbo[0]!;
    expect(JSON.parse(t.tests!)).not.toHaveProperty('rejouer');
    expect(lancer('tester', ['crates/core/tests/t.rs']).turbo[0]!.tests).toBe(t.tests);
    expect(lancer('tester').turbo[0]!.args).not.toContain('--force');
  });
});

describe('grillhouse-44b.5, critère 7 — le corps de la tâche est une commande du module', () => {
  it('`tests-du-paquet` est une commande décrite du module, distincte de tester', () => {
    const c = cargo.commandes(espace);
    expect(Object.keys(c)).toContain('tests-du-paquet');
    expect(c['tests-du-paquet']).not.toEqual(c.tester);
  });

  it('un crate : la construction des cibles, nextest, puis les doctests, sans relancer Turborepo', () => {
    const r = lancer('tests-du-paquet', ['crates/app']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.turbo).toEqual([]);
    expect(
      r.cargoAppels.map(l =>
        l.replace(/--tool-config-file grillhouse:\S+ --profile grillhouse /, '')
      )
    ).toEqual([
      'test --no-run -p ws-app',
      'nextest run --no-fail-fast -p ws-app',
      'test --doc -p ws-app',
    ]);
  });

  it('un autre crate : le sien seul', () => {
    const r = lancer('tests-du-paquet', ['crates/core']);
    expect(r.turbo).toEqual([]);
    expect(r.cargoAppels.join('\n')).toMatch(/-p ws-core/);
    expect(r.cargoAppels.join('\n')).not.toMatch(/-p ws-app/);
  });

  it('la source d’une cible de test : cette cible seule, sans les doctests', () => {
    const r = lancer('tests-du-paquet', ['crates/core/tests/t.rs']);
    expect(r.turbo).toEqual([]);
    expect(r.cargoAppels).toHaveLength(2);
    expect(r.cargoAppels[0]).toMatch(/^test --no-run -p ws-core --test t$/);
    expect(r.cargoAppels[1]).toMatch(/^nextest run .*-p ws-core --test t$/);
  });

  it('un test rouge rend la commande rouge (101 de cargo : non nul)', () => {
    const r = lancer('tests-du-paquet', ['crates/core'], {
      FAUX_CARGO_CODES: JSON.stringify({ 'nextest ws-core': 100 }),
    });
    expect(r.code).not.toBe(0);
    expect(r.turbo).toEqual([]);
  });

  it('un chemin hors de tout crate est refusé (2), cargo jamais lancé', () => {
    const r = lancer('tests-du-paquet', ['README.md']);
    expect(r.code).toBe(2);
    expect(r.cargoAppels).toEqual([]);
    expect(r.turbo).toEqual([]);
  });
});

describe('grillhouse-44b.5, critères 1 et 9 — verifier joue les tâches de Turborepo et ne pose aucun vert', () => {
  const vert = () => path.join(espace, '.git/grillhouse/dernier-vert/main.json');

  it('critère 1: verifier lance `turbo run … test:unit` sur les crates, cargo ne jouant que deny', () => {
    rmSync(vert(), { force: true });
    const r = lancer('verifier', ['--tout']);
    expect(r.code, r.stderr).toBe(0);
    const test = r.turbo.find(a => a.args.includes('test:unit'));
    expect(test, JSON.stringify(r.turbo)).toBeDefined();
    expect(test!.args[0]).toBe('run');
    expect(r.cargoAppels).toEqual(['deny check']);
  });

  it('critère 9: aucun vert posé par le module cargo, vert ou non', () => {
    rmSync(vert(), { force: true });
    expect(lancer('verifier', ['--tout']).code).toBe(0);
    expect(existsSync(vert())).toBe(false);
    mkdirSync(path.dirname(vert()), { recursive: true });
    expect(lancer('verifier', [], { FAUX_TURBO_CODE: '1' }).code).not.toBe(0);
    expect(existsSync(vert())).toBe(false);
  });

  it('critère 1: une tâche rouge de Turborepo rend verifier rouge', () => {
    expect(lancer('verifier', ['--tout'], { FAUX_TURBO_CODE: '1' }).code).toBe(1);
  });

  it('critère 9: sous GRAPHE_JOUE (le module du graphe a passé), verifier ne lance aucune tâche test:unit, cargo ne jouant que deny', () => {
    const r = lancer('verifier', ['--tout'], { GRILLHOUSE_GRAPHE_JOUE: '1' });
    expect(r.code, r.stderr).toBe(0);
    expect(r.turbo.some(a => a.args.includes('test:unit'))).toBe(false);
    expect(r.cargoAppels).toEqual(['deny check']);
  });
});
