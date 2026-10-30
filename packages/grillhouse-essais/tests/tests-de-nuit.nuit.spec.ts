import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  PRESSION,
  rangs,
  NUITS,
  essai,
  JOUR,
  noms,
  testsDeNuitEssai,
} from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CADRE, RACINE, enProcessus } from './cadre.js';

// The frame's repository, whose update the projects of trial receive, called in a process of its
// own.
const DEPOT = RACINE;
const mettreAJour = enProcessus<unknown>('scripts/grillhouse-maj.mjs', 'mettreAJour');

// grillhouse-3uv.34, critères 4 and 5: the night tests, a category beside the time budget benches
// (`*.budget.test.*`). A night test is a file `*.nuit.test.*` or `*.nuit.spec.*`: `npm test` (the
// integration's included) leaves it out, the night (scripts/nuit.sh) plays it after its full pass
// (`npm run verifier -- --force`).
//
// The chain, played at night: each case plays the real configuration of the repository (its
// package.json, its Vitest configuration, its turbo.json, its scripts, Turborepo itself through the
// linked dependencies) in a project of trial whose test files append their name to a trace.
// Turborepo runs its tasks in its strict environment, which does not pass TRACE: the test files
// read the path of the trace in the file `.trace` at the root of the project of trial, committed
// with it. What the configurations of the day and of the night choose is the day's
// (packages/grillhouse/tests/unit/tests-de-nuit.spec.ts); the night script is tested in
// tests-de-nuit.script-de-nuit.nuit.spec.ts.
// The projects of trial: the shared material (@roomi-fields/grillhouse-matiere/test-fixtures: testsDeNuitEssai).

// The trial directories of this run live in one root, removed at its end (critère 2).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tests-de-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { projet, nuitDe } = testsDeNuitEssai(ESSAIS, { depot: DEPOT, mettreAJour });

const sortie = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`.slice(-3000);

describe('critère 4 — npm test leaves the night tests out', () => {
  it('critère 4: npm test plays the day tests and no night test, at any depth and in any form', () => {
    const p = projet();
    const r = p.lancer('npm', ['test']);
    expect(r.status, sortie(r)).toBe(0);
    expect(p.joues()).toEqual(noms(JOUR));
  }, 120_000);
  it('critère 4: a red night test leaves npm test green', () => {
    const p = projet({ 'tests/e.nuit.test.ts': essai('e.nuit.test.ts', true) });
    const r = p.lancer('npm', ['test']);
    expect(r.status, sortie(r)).toBe(0);
    expect(p.joues()).not.toContain('e.nuit.test.ts');
  }, 120_000);
  it('critère 4: a file whose name only holds « nuit » stays a day test, played by npm test', () => {
    const p = projet({
      'tests/nuit.spec.ts': essai('nuit.spec.ts'),
      'tests/la-nuit.test.ts': essai('la-nuit.test.ts'),
    });
    const r = p.lancer('npm', ['test']);
    expect(r.status, sortie(r)).toBe(0);
    expect(p.joues()).toEqual(noms([...JOUR, 'nuit.spec.ts', 'la-nuit.test.ts']));
  }, 120_000);
});

describe('critère 4 — the night plays the night tests', () => {
  it('critère 4: the night plays every night test, and the day tests', () => {
    const p = projet();
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    for (const f of noms(NUITS)) {
      expect(p.joues(), n.journal).toContain(f);
    }
    for (const f of noms(JOUR)) {
      expect(p.joues(), n.journal).toContain(f);
    }
  }, 240_000);
  it('critère 4: a red night test turns the night red', () => {
    const p = projet({ 'tests/e.nuit.test.ts': essai('e.nuit.test.ts', true) });
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(p.joues()).toContain('e.nuit.test.ts');
  }, 240_000);
});

// grillhouse-3uv.75.1 critères 11 and 17: the night launches its full pass (`npm run verifier -- --force`),
// which plays neither the time budget benches nor the night tests (the day configuration of Vitest
// leaves them out); the night plays its benches itself, after the full pass, even without a night
// test, and a red bench turns the night red.
describe('3uv.75.1 critères 11 et 17 — the day leaves the time budget benches out, the night plays them itself', () => {
  const BANC = 'tests/temps.budget.test.ts';
  it('critères 11 et 17: npm test plays no bench; the night of a project without night test plays its bench itself, once, after its full pass, green', () => {
    const p = projet({ [BANC]: essai('temps.budget.test.ts') }, { nuits: false });
    const jour = p.lancer('npm', ['test']);
    expect(jour.status, sortie(jour)).toBe(0);
    expect(p.joues()).toEqual(noms(JOUR));
    const avant = p.lignes().length;
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    const l = p.lignes().slice(avant);
    expect(
      l.filter(x => x === 'temps.budget.test.ts'),
      `${l.join(', ')}\n${n.journal}`
    ).toHaveLength(1);
    const jourRangs = rangs(l, noms(JOUR));
    expect(jourRangs, `${l.join(', ')}\n${n.journal}`).not.toContain(-1);
    expect(Math.max(...jourRangs), l.join(', ')).toBeLessThan(l.indexOf('temps.budget.test.ts'));
  }, 240_000);
  it('critère 17: a red bench turns the night red, with or without night tests', () => {
    for (const nuits of [true, false]) {
      const p = projet({ [BANC]: essai('temps.budget.test.ts', true) }, { nuits });
      const n = nuitDe(p);
      expect(n.status, `nuits ${nuits}\n${n.journal}`).toBe(1);
      expect(n.dernierVert, `nuits ${nuits}`).toBe('');
      expect(p.lignes(), `nuits ${nuits}`).toContain('temps.budget.test.ts');
    }
  }, 480_000);
});

// A time witness is measured with the CPU at rest: a bench that fails under load is « à repasser »
// (75, scripts/langages/typescript/vitest-config/duree.reporter.mjs). The night waits for rest
// (scripts/mesure/pression.mjs attendre) and plays its benches once more; à repasser again,
// the night is à repasser: no last green, no ticket.
describe('the night plays again at rest a bench à repasser', () => {
  const BANC = 'tests/temps.budget.test.ts';
  // A bench that writes its name to the trace and fails its measure; its first run ends with the
  // pressure at rest; each later run (when <encore>) writes the pressure under load and fails
  // again, else passes.
  const banc = (encore: boolean) =>
    "import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';\n" +
    "import { test, expect } from 'vitest';\n" +
    "test('banc', () => {\n  const trace = readFileSync('.trace', 'utf8').trim();\n" +
    "  appendFileSync(trace, 'temps.budget.test.ts\\n');\n" +
    '  const p = process.env.GRILLHOUSE_PRESSION_CPU;\n' +
    `  if (!existsSync(trace + '.deja')) { writeFileSync(trace + '.deja', ''); writeFileSync(p, ${JSON.stringify(PRESSION(1))}); }\n` +
    (encore
      ? `  else writeFileSync(p, ${JSON.stringify(PRESSION(90))});\n  expect(50).toBeLessThan(10);\n`
      : '  else return;\n  expect(50).toBeLessThan(10);\n') +
    '});\n';
  it('a bench that fails under load, then passes at rest: the night is green, the bench played twice', () => {
    const p = projet({ [BANC]: banc(false) }, { nuits: false });
    writeFileSync(p.pression, PRESSION(90));
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    expect(p.lignes().filter(x => x === 'temps.budget.test.ts')).toHaveLength(2);
    expect(n.journal).toMatch(/à repasser/);
  }, 240_000);
  it('a bench à repasser twice: the night is à repasser (75), without last green nor ticket', () => {
    const p = projet({ [BANC]: banc(true) }, { nuits: false });
    writeFileSync(p.pression, PRESSION(90));
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(75);
    expect(n.dernierVert).toBe('');
    expect(existsSync(path.join(p.bin, 'appels'))).toBe(false);
    expect(p.lignes().filter(x => x === 'temps.budget.test.ts')).toHaveLength(2);
  }, 240_000);
  // grillhouse-w47.2 critère 1: the red of a step before stays when a later step is à repasser.
  it('w47.2 critère 1: a red full pass, then a bench à repasser twice: the night is red, on the ticket of its red task', () => {
    const p = projet(
      { [BANC]: banc(true), 'tests/f.spec.ts': essai('f.spec.ts', true) },
      { nuits: false }
    );
    writeFileSync(p.pression, PRESSION(90));
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(n.dernierVert).toBe('');
    expect(p.lignes().filter(x => x === 'temps.budget.test.ts')).toHaveLength(2);
    const appels = readFileSync(path.join(p.bin, 'appels'), 'utf8');
    expect(appels, n.journal).toMatch(/^create La nuit est rouge sur « [^»\n]*test:unit » /m);
  }, 240_000);
});

// The test files of the frame's package, with their sources, each path from the package.
function testsDuDepot(): { f: string; s: string }[] {
  const out: { f: string; s: string }[] = [];
  const parcourir = (rel: string) => {
    for (const e of readdirSync(path.join(CADRE, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') {
          parcourir(r);
        }
      } else if (/\.(spec|test)\.(c|m)?[jt]sx?$/.test(e.name)) {
        out.push({ f: r, s: readFileSync(path.join(CADRE, r), 'utf8') });
      }
    }
  };
  for (const racine of ['tests', 'src']) {
    if (existsSync(path.join(CADRE, racine))) {
      parcourir(racine);
    }
  }
  return out;
}

const tenant = (motif: RegExp) => testsDuDepot().filter(({ s }) => motif.test(s));

describe('critère 5 — the guard of the trial directories, played by npm test', () => {
  const gardes = () =>
    tenant(/critère 2 — no test names a fixed directory under the home/).map(x => x.f);
  it('critère 5: npm test plays the guard of critère 2', () => {
    const p = projet();
    for (const f of gardes()) {
      const cible = path.join(p.repo, f);
      mkdirSync(path.dirname(cible), { recursive: true });
      writeFileSync(cible, essai(path.basename(f)));
    }
    const r = p.lancer('npm', ['test']);
    expect(r.status, sortie(r)).toBe(0);
    for (const f of gardes()) {
      expect(p.joues()).toContain(path.basename(f));
    }
  }, 120_000);
});

// The update gives no pretest: Turborepo plays the guards (turbo.json), and a project's own pretest
// stays as it is.
describe('grillhouse-3uv.55 critère 8 — the project of trial stays without the controls of the frame', () => {
  // The pretest a project of trial holds once projet() has brought it to the frame.
  const pretestDe = (p: { repo: string }) =>
    (
      JSON.parse(readFileSync(path.join(p.repo, 'package.json'), 'utf8')) as {
        scripts?: Record<string, string>;
      }
    ).scripts?.pretest;
  it('critère 8: the package.json of the repository gets no pretest from the update', () => {
    expect(pretestDe(projet({}, { nuits: false, dependances: false }))).toBeUndefined();
  });
  it('critère 8: a project of its own without pretest gets none from the update', () => {
    const p = projet(
      {},
      {
        pkg: { name: 'propre', scripts: { test: 'vitest run' } },
        nuits: false,
        jourVitest: false,
        dependances: false,
      }
    );
    expect(pretestDe(p)).toBeUndefined();
  });
  it('critère 8: a project of trial with a pretest of its own keeps it as it was', () => {
    const p = projet(
      {},
      {
        pkg: { name: 'propre', scripts: { test: 'vitest run', pretest: 'node mien.mjs' } },
        nuits: false,
        jourVitest: false,
        dependances: false,
      }
    );
    expect(pretestDe(p)).toBe('node mien.mjs');
  });
});
