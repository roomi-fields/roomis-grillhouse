// grillhouse-3dr.3.4 critère 7 (grillhouse-3dr.3, § Plan, Q4): no script a test launches is lost
// in silence. Packages/grillhouse no longer declares its scripts' directory in its
// `grillhouse.lit` (the lever (a): a change of one script replayed its 127 test files); each test
// names the scripts it launches by their path (./lances.spec.ts). The guard of the paths of the
// tests (scripts/langages/typescript/chemins-des-tests.mjs), as Bazel's sandbox fails a test that
// reads an undeclared input, refuses a test that names a module of its package by a path the
// frame cannot read; the counter-proof checks, by a search of its own, that each script a test
// names, covers by a pattern or runs by a subcommand of grillhouse is among what it reads. The update inscribes a project's existing
// findings in its debt once (migration 0.25.0).
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FICHIER, juger, lire } from '../../../../scripts/dette.mjs';
import { gardesDuCadre } from '../../../../scripts/gardes-du-cadre.mjs';
import { migrationsDe } from '../../../../scripts/migrations.mjs';
import { commandeDe, sousCommandes } from '../../../../scripts/sous-commandes.mjs';
import {
  CHEMIN_NON_DECLARE,
  GARDE,
  verifier,
} from '../../../../scripts/langages/typescript/chemins-des-tests.mjs';
import {
  migrer,
  nom,
  version,
} from '../../../../scripts/langages/typescript/migrations/0.25.0-chemins-des-tests.mjs';
import {
  lusPar,
  testsDuPaquet,
} from '../../../../scripts/langages/typescript/vitest-config/lances.mjs';

const DEPOT = path.resolve(__dirname, '../../../../../..');
const PAQUET = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'chemins-des-tests-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A project of trial, a git repository of packages whose files are <fichiers>, uncommitted.
function projet(fichiers: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'projet-'));
  spawnSync('git', ['init', '-q', r]);
  const tous = {
    'package.json': '{"name":"essai","private":true,"workspaces":["packages/*"]}\n',
    'packages/a/package.json': '{"name":"a","type":"module"}\n',
    'packages/a/scripts/cache-d-essai.mjs': 'export {};\n',
    ...fichiers,
  };
  for (const [f, t] of Object.entries(tous)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  return r;
}
// A test that launches the script by a path built at run time.
const CACHE =
  "const NOM = 'cache-d-essai.mjs';\nconst S = `${__dirname}/../scripts/${NOM}`;\nit('k', () => S);\n";
// The same test, the path written whole.
const ENTIER =
  "const S = path.resolve(__dirname, '../scripts/cache-d-essai.mjs');\nit('k', () => S);\n";

describe('grillhouse-3dr.3.4 critère 7 — the guard refuses a script named by a path it cannot read', () => {
  it('a finding per module named so, keyed by the test file and the rule', () => {
    const r = projet({ 'packages/a/tests/k.spec.ts': CACHE });
    const constats = verifier(r) as { fichier: string; regle: string; message: string }[];
    expect(constats.map(c => [c.fichier, c.regle])).toEqual([
      ['packages/a/tests/k.spec.ts', CHEMIN_NON_DECLARE],
    ]);
    expect(constats[0]?.message).toMatch(/packages\/a\/scripts\/cache-d-essai\.mjs/);
  });

  it('the path written whole, or declared in the grillhouse.lit of the package, passes', () => {
    expect(verifier(projet({ 'packages/a/tests/k.spec.ts': ENTIER }))).toEqual([]);
    const declare = projet({
      'packages/a/package.json':
        '{"name":"a","type":"module","grillhouse":{"lit":["packages/a/scripts"]}}\n',
      'packages/a/tests/k.spec.ts': CACHE,
    });
    expect(verifier(declare)).toEqual([]);
  });

  it('the guard is in the one list of the frame’s guards, which every project plays', () => {
    const scripts = gardesDuCadre(DEPOT).map(([f]) => path.basename(f));
    expect(scripts).toContain('chemins-des-tests.mjs');
    expect(path.basename(commandeDe('chemins-des-tests', DEPOT)?.script ?? '')).toBe(
      'chemins-des-tests.mjs'
    );
  });
});

describe('grillhouse-3dr.3.4 — Grillhouse names the scripts its tests launch', () => {
  it('lever (a): its package no longer declares its scripts’ directory in its grillhouse.lit', () => {
    const pkg = JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')) as {
      grillhouse: { lit: string[] };
    };
    expect(pkg.grillhouse.lit).not.toContain('packages/grillhouse/scripts');
    expect(pkg.grillhouse.lit.some(l => l.startsWith('packages/grillhouse/scripts'))).toBe(false);
  });

  it('critère 7: the guard finds nothing in Grillhouse, and its debt inscribes nothing of it', () => {
    expect(verifier(DEPOT)).toEqual([]);
    expect((lire(DEPOT) as Record<string, unknown>)[GARDE]).toBeUndefined();
  });

  // The counter-proof, a search independent of the frame's reading: in each test's lines out of
  // the comments, (1) a string that is a path under the package's scripts, (2) a string that is a
  // pattern of files under them (`packages/grillhouse/scripts/**/*.mjs`), each file it covers,
  // (3) a subcommand of grillhouse the test runs, as a command line (`grillhouse maj`) or as an
  // argument of the command or of the plugin's hook it launches, its script by the table of the
  // subcommands. Each script found must be among what the test reads, so that its change plays it.
  it('counter-proof: each script a test names, covers or runs by a subcommand, it reads', () => {
    const scripts = path.join(PAQUET, 'scripts');
    const memo = new Map();
    const noms = Object.keys(sousCommandes(DEPOT));
    const tousLesScripts = (readdirSync(scripts, { recursive: true }) as string[])
      .map(f => path.join(scripts, f))
      .filter(f => statSync(f).isFile());
    const manques: string[] = [];
    for (const t of testsDuPaquet(PAQUET) as string[]) {
      const lignes = readFileSync(t, 'utf8')
        .split('\n')
        .filter(l => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
        .join('\n');
      const trouves = new Set<string>();
      for (const m of lignes.matchAll(/['"`][^'"`\s$]*?(scripts\/[\w./-]+\.[cm]?js)['"`]/g)) {
        trouves.add(path.join(scripts, (m[1] as string).slice('scripts/'.length)));
      }
      for (const m of lignes.matchAll(/['"`]([^'"`\s$]*scripts\/[^'"`\s$]*\*[^'"`\s$]*)['"`]/g)) {
        const motif = m[1] as string;
        for (const f of tousLesScripts) {
          if ([PAQUET, DEPOT].some(b => path.matchesGlob(path.relative(b, f), motif))) {
            trouves.add(f);
          }
        }
      }
      const lanceLaCommande = /crochet\.mjs|bin\/grillhouse/.test(lignes);
      for (const nom of noms) {
        const echappe = nom.replace(/[-]/g, '\\-');
        const enLigne = new RegExp(`grillhouse["']?\\s+${echappe}(?![\\w-])`).test(lignes);
        const enArgument = lanceLaCommande && new RegExp(`['"\`]${echappe}['"\`]`).test(lignes);
        const script = enLigne || enArgument ? commandeDe(nom, DEPOT)?.script : undefined;
        if (script && script.startsWith(scripts)) {
          trouves.add(script);
        }
      }
      if (trouves.size === 0) {
        continue;
      }
      const lus = lusPar(t, PAQUET, DEPOT, memo) as Set<string>;
      for (const f of trouves) {
        if (existsSync(f) && !lus.has(f)) {
          manques.push(`${path.relative(PAQUET, t)} → ${path.relative(PAQUET, f)}`);
        }
      }
    }
    expect(manques).toEqual([]);
  });
});

describe('migration 0.25.0 — the paths named undeclared inscribed in the project’s debt', () => {
  it('is the migration of 0.25.0, « chemins des tests », in the list', () => {
    expect(version).toBe('0.25.0');
    expect(nom).toBe('chemins des tests');
    expect(migrationsDe(DEPOT).some(m => m.version === version && m.nom === nom)).toBe(true);
  });

  it('inscribes the findings once, and the guard then refuses none of them', () => {
    const r = projet({ 'packages/a/tests/k.spec.ts': CACHE });
    const lignes = migrer(r);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatch(new RegExp(`^${FICHIER} : 1 chemin`));
    expect(lire(r)).toEqual({
      [GARDE]: { 'packages/a/tests/k.spec.ts': { [CHEMIN_NON_DECLARE]: { count: 1 } } },
    });
    expect(juger(lire(r), GARDE, verifier(r)).refus).toEqual([]);
    expect(migrer(r)).toEqual([]);
  });

  it('a project without a finding is left as it is', () => {
    const r = projet({ 'packages/a/tests/k.spec.ts': ENTIER });
    expect(migrer(r)).toEqual([]);
    expect(lire(r)).toEqual({});
  });
});
