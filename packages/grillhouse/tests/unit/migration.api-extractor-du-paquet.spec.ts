import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { restesAuProjet } from '../../scripts/migrations.mjs';
import {
  migrer,
  nom,
  restes,
  version,
} from '../../scripts/migrations/0.24.2-api-extractor-du-paquet.mjs';
import { cheminSysteme, claudeSubstitut } from '../claude-substitut.js';

// grillhouse-3uv.95.11.3: the update of 0.23.0 to 0.24.1 added `@microsoft/api-extractor` to the
// devDependencies of a project's root, as a tool the project runs; the package imports it as a
// library (scripts/langages/typescript/interfaces-contre-code.mjs) and declares it itself, and no command of the
// project runs it. BPScript, brought to 0.24.1 (0c5064a99), heard `grillhouse code-mort` refuse it
// (« dépendance de développement sans usage »). A project that still declares it receives the line
// of the other dependencies only the package imports (0.23.2-copies-du-cadre.mjs), with
// `npm uninstall`; the dependency is never removed. Its `tsdoc.json`, which extended the TSDoc base
// of API Extractor (resolved only when npm hoisted it: BPScript's lock puts it under the package,
// and `interfaces-contre-code` failed « Unable to resolve "extends" reference »), extends first the
// package's base, `@roomi-fields/grillhouse/tsdoc-base.json`, as a rig of Rushstack carries the
// base configuration beside the dependency it names.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-api-extractor-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const MAJ = path.resolve(__dirname, '../../scripts/grillhouse-maj.mjs');
const DEP = '@microsoft/api-extractor';
const LIGNE = `package.json : la dépendance ${DEP} n'est plus importée que par le paquet, qui la déclare lui-même ; \`npm uninstall ${DEP}\` la retire si le projet n'en a pas l'usage`;

const projet = (pkg: Record<string, unknown>, fichiers: Record<string, string> = {}) => {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  for (const [f, t] of Object.entries({
    // grillhouse-3dr.2.3: a project of TypeScript declares its language.
    'package.json': `${JSON.stringify(
      { ...pkg, grillhouse: { langages: ['typescript'], ...((pkg.grillhouse as object) ?? {}) } },
      null,
      2
    )}\n`,
    ...fichiers,
  })) {
    mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    writeFileSync(path.join(p, f), t);
  }
  return p;
};
const lire = (p: string, f = 'package.json') => readFileSync(path.join(p, f), 'utf8');
const ANCIENNE = '@microsoft/api-extractor/extends/tsdoc-base.json';
const BASE = '@roomi-fields/grillhouse/tsdoc-base.json';
// The tsdoc.json of the template of 0.22.x to 0.24.1, as BPScript holds it.
const TSDOC = (base: string) =>
  `{\n  "$schema": "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",\n  "extends": ["${base}"],\n  "tagDefinitions": [{ "tagName": "@faute", "syntaxKind": "block", "allowMultiple": true }],\n  "supportForTags": { "@faute": true }\n}\n`;
const LIGNE_TSDOC = `tsdoc.json : hérite de ${BASE}, la base TSDoc du paquet, au lieu de ${ANCIENNE}`;

describe('migration 0.24.2 — API Extractor is the package’s dependency, not the project’s', () => {
  it('is the migration of 0.24.2, « API Extractor du paquet »', () => {
    expect(version).toBe('0.24.2');
    expect(nom).toBe('API Extractor du paquet');
  });

  it('critère 2 — a project that declares it hears the line of the other dependencies only the package imports', () => {
    for (const champ of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const p = projet({ name: 'p', [champ]: { [DEP]: '7.59.2', zod: '^3.22.0' } });
      expect(restes(p), champ).toEqual([LIGNE]);
    }
  });

  it('critère 2 — the dependency is named, never removed: package.json is not written', () => {
    const p = projet({ name: 'p', devDependencies: { [DEP]: '7.59.2' } });
    const avant = lire(p);
    expect(migrer(p)).toEqual([]);
    restes(p);
    expect(lire(p)).toBe(avant);
  });

  it('a tsdoc.json that extends the base of API Extractor extends the package’s, the rest of the file kept; replayed, nothing', () => {
    const p = projet(
      { name: 'p', devDependencies: { [DEP]: '7.59.2' } },
      { 'tsdoc.json': TSDOC(ANCIENNE) }
    );
    expect(migrer(p)).toEqual([LIGNE_TSDOC]);
    expect(lire(p, 'tsdoc.json')).toBe(TSDOC(BASE));
    expect(migrer(p)).toEqual([]);
    expect(lire(p, 'tsdoc.json')).toBe(TSDOC(BASE));
    expect(restes(p)).toEqual([LIGNE]);
  });

  it('a tsdoc.json that extends another base, or none, is not written', () => {
    const autre = TSDOC('./ma-base.json');
    const p = projet({ name: 'p' }, { 'tsdoc.json': autre });
    expect(migrer(p)).toEqual([]);
    expect(lire(p, 'tsdoc.json')).toBe(autre);
    expect(migrer(projet({ name: 'p' }))).toEqual([]);
  });

  it('critère 2 — a project that does not declare it, or whose own code imports it, hears nothing', () => {
    expect(restes(projet({ name: 'p', devDependencies: { knip: '6.0.0' } }))).toEqual([]);
    const importe = projet(
      { name: 'p', devDependencies: { [DEP]: '7.59.2' } },
      { 'outils/api.mjs': `import { Extractor } from '${DEP}';\n` }
    );
    expect(restes(importe)).toEqual([]);
  });

  it('critère 2 — a project at 0.24.1 hears it after the update; one at 0.24.2 does not', () => {
    const p = projet({ name: 'p', devDependencies: { [DEP]: '7.59.2' } });
    expect(restesAuProjet(p, '0.24.1').find(r => r.version === '0.24.2')?.lignes).toEqual([LIGNE]);
    expect(restesAuProjet(p, '0.24.2')).toEqual([]);
  });

  it('critère 3 — grillhouse maj on a project at 0.24.1 that declares it names it, and keeps it', () => {
    const p = projet(
      { name: 'p', grillhouse: { version: '0.24.1' }, devDependencies: { [DEP]: '7.59.2' } },
      { 'tsdoc.json': TSDOC(ANCIENNE) }
    );
    const claude = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')));
    const r = spawnSync(process.execPath, [MAJ], {
      cwd: p,
      encoding: 'utf8',
      env: { PATH: cheminSysteme(claude.bin), HOME: mkdtempSync(path.join(ESSAIS, 'maison-')) },
      timeout: 120_000,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`Migration 0.24.2 (API Extractor du paquet) :\n- ${LIGNE_TSDOC}\n`);
    expect(lire(p, 'tsdoc.json')).toBe(TSDOC(BASE));
    expect(r.stdout).toContain(
      `Migration 0.24.2 (API Extractor du paquet), reste au projet :\n- ${LIGNE}\n`
    );
    const pkg = JSON.parse(lire(p)) as { devDependencies: Record<string, string> };
    expect(pkg.devDependencies[DEP]).toBe('7.59.2');
  });
});
