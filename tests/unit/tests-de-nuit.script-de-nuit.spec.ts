import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEPOT, rangs, NUITS, essai, JOUR, noms, testsDeNuitEssai } from './tests-de-nuit-essai.js';

// The night tests (grillhouse-3uv.34, tests/unit/tests-de-nuit.spec.ts): scripts/nuit.sh plays
// them itself, then the night script of the project; a red one turns the night red; the key
// grillhouse.nuit, a project installed by the update, a project without any night test.
// The projects of trial: ./tests-de-nuit-essai.ts.

// The trial directories of this run live in one root, removed at its end (critère 2).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tests-de-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { projet, nuitDe } = testsDeNuitEssai(ESSAIS);

// A script that appends `nom` to TRACE, for the package.json of a project of trial.
const noter = (nom: string, code = 0) =>
  `node -e "require('fs').appendFileSync(process.env.TRACE, '${nom}\\n'); process.exit(${code})"`;

// The package.json of the repository as projet() writes it, with `grillhouse` and scripts added.
function pkgDuDepot(grillhouse?: unknown, scripts: Record<string, string> = {}) {
  const pkg = JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
    grillhouse?: unknown;
  };
  for (const s of ['build', 'prepare']) {
    delete pkg.scripts[s];
  }
  delete pkg.grillhouse;
  Object.assign(pkg.scripts, scripts);
  if (grillhouse !== undefined) {
    pkg.grillhouse = grillhouse;
  }
  return pkg;
}

describe('critère 7 — scripts/nuit.sh plays the night tests itself', () => {
  it('critère 7: without the key grillhouse.nuit, the night plays every night test after the day tests', () => {
    const p = projet();
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    const l = p.lignes();
    const jour = rangs(l, noms(JOUR));
    const nuit = rangs(l, noms(NUITS));
    expect([...jour, ...nuit], `${l.join(', ')}\n${n.journal}`).not.toContain(-1);
    expect(Math.max(...jour), l.join(', ')).toBeLessThan(Math.min(...nuit));
  }, 240_000);
  it('critère 7: each night test is played once, by the night', () => {
    const p = projet();
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    for (const f of noms(NUITS)) {
      expect(
        p.lignes().filter(x => x === f),
        f
      ).toHaveLength(1);
    }
  }, 240_000);
  it('critère 7: a red full pass (npm run verifier -- --force) turns the night red before any night test', () => {
    const p = projet({ 'tests/f.spec.ts': essai('f.spec.ts', true) });
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(n.dernierVert).toBe('');
    for (const f of noms(NUITS)) {
      expect(p.lignes()).not.toContain(f);
    }
  }, 240_000);
  it('critère 7: a red night test turns the night red, with no last green, without the key', () => {
    const p = projet({ 'tests/profond/e.nuit.spec.ts': essai('e.nuit.spec.ts', true) });
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(n.dernierVert).toBe('');
    expect(p.lignes()).toContain('e.nuit.spec.ts');
  }, 240_000);
});

describe('critère 7 and 8 — the night tests, then the night script of the project', () => {
  it('critères 7 and 8: with the key, the night plays the day tests, the night tests, then the project script', () => {
    const p = projet(
      {},
      { pkg: pkgDuDepot({ nuit: 'nuit-projet' }, { 'nuit-projet': noter('projet') }) }
    );
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    expect(n.dernierVert).toBe(n.tete);
    const l = p.lignes();
    const jour = rangs(l, noms(JOUR));
    const nuit = rangs(l, noms(NUITS));
    const projetRang = l.indexOf('projet');
    expect([...jour, ...nuit, projetRang], `${l.join(', ')}\n${n.journal}`).not.toContain(-1);
    expect(Math.max(...jour), l.join(', ')).toBeLessThan(Math.min(...nuit));
    expect(Math.max(...nuit), l.join(', ')).toBeLessThan(projetRang);
  }, 240_000);
  it('critère 8: a project script that plays no test leaves the night tests played', () => {
    const p = projet(
      { 'tests/e.nuit.test.ts': essai('e.nuit.test.ts', true) },
      { pkg: pkgDuDepot({ nuit: 'nuit-projet' }, { 'nuit-projet': noter('projet') }) }
    );
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(p.lignes()).toContain('e.nuit.test.ts');
  }, 240_000);
});

describe('critère 11 — a red night test turns the night red without playing the project script', () => {
  const pkg = () => pkgDuDepot({ nuit: 'nuit-projet' }, { 'nuit-projet': noter('projet') });
  it('critère 11: a red night test, the project script declared: red, no last green, script not played', () => {
    const p = projet({ 'tests/e.nuit.test.ts': essai('e.nuit.test.ts', true) }, { pkg: pkg() });
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(n.dernierVert).toBe('');
    expect(p.lignes(), n.journal).toContain('e.nuit.test.ts');
    expect(p.lignes(), n.journal).not.toContain('projet');
  }, 240_000);
  it('critère 11: a red night spec deeper down, among green night tests: red, script not played', () => {
    const p = projet(
      { 'tests/profond/plus/e.nuit.spec.ts': essai('e.nuit.spec.ts', true) },
      { pkg: pkg() }
    );
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(p.lignes(), n.journal).toContain('e.nuit.spec.ts');
    expect(p.lignes(), n.journal).not.toContain('projet');
  }, 240_000);
});

describe("critère 8 — the key grillhouse.nuit stays the project's", () => {
  it('critère 8: the package.json of Grillhouse carries no key grillhouse.nuit', () => {
    const pkg = JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as {
      grillhouse?: Record<string, unknown>;
    };
    expect(pkg.grillhouse?.nuit).toBeUndefined();
  });
});

describe('critère 9 — the night tests reach a project installed by the update of the frame', () => {
  // A project of its own: its package.json, its day configuration of Vitest that leaves the night
  // tests out, no file of Grillhouse but those the update of the frame installs.
  const propre = {
    name: 'projet-installe',
    type: 'module',
    scripts: { test: 'vitest run' },
  };
  const configJour =
    "import { defineConfig } from 'vitest/config';\n" +
    'export default defineConfig({ test: { include: ' +
    "['tests/**/*.{test,spec}.{ts,mjs}'], exclude: ['**/node_modules/**', '**/*.nuit.*'] } });\n";
  it('critère 9: the night of an installed project plays its night tests after its day tests', () => {
    const p = projet({ 'vitest.config.ts': configJour }, { pkg: propre, jourVitest: false });
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    const l = p.lignes();
    const jour = rangs(l, noms(JOUR));
    const nuit = rangs(l, noms(NUITS));
    expect([...jour, ...nuit], `${l.join(', ')}\n${n.journal}`).not.toContain(-1);
    expect(Math.max(...jour), l.join(', ')).toBeLessThan(Math.min(...nuit));
  }, 240_000);
  it('critère 9: a red night test turns the night of an installed project red', () => {
    const p = projet(
      { 'vitest.config.ts': configJour, 'tests/e.nuit.test.ts': essai('e.nuit.test.ts', true) },
      { pkg: propre, jourVitest: false }
    );
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(1);
    expect(p.lignes()).toContain('e.nuit.test.ts');
  }, 240_000);
});

describe('critère 10 — a project without any night test keeps a green night', () => {
  it('critère 10: a Vitest project without night test: green, its day tests played', () => {
    const p = projet({}, { nuits: false });
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    expect(n.dernierVert).toBe(n.tete);
    expect(p.joues()).toEqual(noms(JOUR));
  }, 240_000);
  // A project without Vitest keeps its own scripts (the update writes the frame's to a Vitest
  // project only): it writes its full pass, `verifier`, itself.
  it('critère 10: a project without Vitest nor night test, its own verifier: green', () => {
    const p = projet(
      { 't.mjs': "import fs from 'node:fs';\nfs.appendFileSync(process.env.TRACE, 'jour\\n');\n" },
      {
        pkg: { name: 'sans-vitest', scripts: { test: 'node t.mjs', verifier: 'node t.mjs' } },
        nuits: false,
        jourVitest: false,
        dependances: false,
      }
    );
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    expect(n.dernierVert).toBe(n.tete);
    expect(p.lignes()).toEqual(['jour']);
  }, 240_000);
  it('critère 10: a project without night test, whose script of night is declared: green', () => {
    const p = projet(
      {},
      {
        nuits: false,
        pkg: pkgDuDepot({ nuit: 'nuit-projet' }, { 'nuit-projet': noter('projet') }),
      }
    );
    const n = nuitDe(p);
    expect(n.status, n.journal).toBe(0);
    expect(p.lignes()).toContain('projet');
  }, 240_000);
});
