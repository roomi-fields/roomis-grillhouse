import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../scripts/migrations.mjs';

// grillhouse-61z, critère 9 (and 5): the CI of a project calls `npm run verifier` alone. The update
// replaces the project's `.github/workflows/ci.yml` by the template's when it is identical (spaces
// normalized) to a former version of the template; otherwise it leaves it and says what to remove
// from the test job (format:check, lint, typecheck, build). Replayed, it changes nothing.

// The module is loaded here, so that its absence is a red of each test, not a file that loads not.
type Migration = { migrer: (p: string) => unknown[]; nom: string; version: string };
const MODULE = '../../scripts/migrations/0.30.0-ci-appelle-la-verification.mjs';
const charge = await (import(/* @vite-ignore */ MODULE) as Promise<Migration>).catch(
  (e: Error): Migration => {
    const absent = () => {
      throw e;
    };
    return {
      migrer: absent,
      get nom(): string {
        return absent();
      },
      get version(): string {
        return absent();
      },
    };
  }
);
const { migrer } = charge;

const DEPOT = path.resolve(__dirname, '../../../..');
const CI = '.github/workflows/ci.yml';
const NEUF = readFileSync(path.join(DEPOT, 'templates/projet', CI), 'utf8');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-ci-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The template of 0.29.0, the version before this one, as it was.
const D_AVANT = `name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [22.x, 24.x]

    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v5
        with:
          node-version: \${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Check formatting
        run: npm run format:check

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npm run typecheck

      - name: Build
        run: npm run build --if-present

      - name: Guards and tests
        run: npm run verifier

  build:
    runs-on: ubuntu-latest
    needs: test

    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build --if-present

      - name: Check package
        run: npm pack --dry-run
`;
// The same with a step the project added.
const MODIFIE = D_AVANT.replace(
  '      - name: Install dependencies\n        run: npm ci\n\n      - name: Check formatting',
  '      - name: Install dependencies\n        run: npm ci\n\n      - name: Install uv\n        uses: astral-sh/setup-uv@v6\n\n      - name: Check formatting'
);

function projet(ci: string | null) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(p, 'package.json'), '{"name":"p","scripts":{}}\n');
  if (ci !== null) {
    mkdirSync(path.join(p, '.github/workflows'), { recursive: true });
    writeFileSync(path.join(p, CI), ci);
  }
  return p;
}
const lire = (p: string) => readFileSync(path.join(p, CI), 'utf8');
const aFaire = (lignes: unknown[]): string[] =>
  lignes.flatMap(l =>
    typeof l === 'object' && l !== null && 'aFaire' in l ? [String(l.aFaire)] : []
  );
const textes = (lignes: unknown[]) => lignes.filter((l): l is string => typeof l === 'string');

describe('migration 0.30.0 — the CI calls the verification alone', () => {
  it('critère 5: is the migration of 0.30.0, « ci appelle la vérification », in the list', () => {
    expect(charge.version).toBe('0.30.0');
    expect(charge.nom).toBe('ci appelle la vérification');
    expect(MIGRATIONS.some(m => m.version === charge.version && m.nom === charge.nom)).toBe(true);
  });

  it('critère 9: the template of the version before, intact, is replaced by the new template', () => {
    const p = projet(D_AVANT);
    const lignes = migrer(p);
    expect(lire(p)).toBe(NEUF);
    expect(textes(lignes).some(l => l.includes(CI))).toBe(true);
    expect(aFaire(lignes)).toEqual([]);
  });

  it('critère 9: spaces normalized — other indentation of blanks, trailing spaces and line ends — still replaced', () => {
    const p = projet(D_AVANT.replace(/\n/g, '  \r\n').replace('name: CI', 'name:   CI'));
    migrer(p);
    expect(lire(p)).toBe(NEUF);
  });

  it('critère 9: the same template with a step added (Install uv) stays, and the steps to remove are named', () => {
    const p = projet(MODIFIE);
    const lignes = migrer(p);
    expect(lire(p)).toBe(MODIFIE);
    const faire = aFaire(lignes);
    expect(faire).toHaveLength(1);
    expect(faire[0]).toContain(CI);
    for (const etape of ['format:check', 'lint', 'typecheck', 'build']) {
      expect(faire[0], etape).toContain(etape);
    }
    expect(textes(lignes)).toEqual([]);
  });

  it('critère 9: a CI that calls the verification alone is left, nothing said', () => {
    const p = projet(NEUF);
    expect(migrer(p)).toEqual([]);
    expect(lire(p)).toBe(NEUF);
  });

  it('critère 9: a project without CI is left, nothing said, nothing written', () => {
    const p = projet(null);
    expect(migrer(p)).toEqual([]);
  });

  it('critère 9: replayed, the replaced file changes nothing, and neither does the one left', () => {
    const p = projet(D_AVANT);
    migrer(p);
    expect(migrer(p)).toEqual([]);
    expect(lire(p)).toBe(NEUF);
    const q = projet(MODIFIE);
    migrer(q);
    const premiere = lire(q);
    migrer(q);
    expect(lire(q)).toBe(premiere);
    expect(premiere).toBe(MODIFIE);
  });
});
