import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declare } from '../../scripts/interfaces-contre-code.mjs';
import { lireSarif, RESULTATS } from '../../scripts/resultats.mjs';

// The findings of a SARIF, as scripts/resultats.mjs reads them.
type Sarif = {
  constats: { garde: string; fichier: string | null; regle: string | null; niveau: string }[];
};
import {
  refusNommant,
  passe,
  generee,
  FIN,
  DEBUT,
  TSCONFIG,
  DUREE,
  interfacesEssai,
} from './interfaces-contre-code-essai.js';

// The check of each interface text against its component's code
// (scripts/interfaces-contre-code.mjs, npm run api) and the index of the interfaces
// (scripts/index-interfaces.mjs). This file: declare and the check itself.
// The projects of trial and their checks: ./interfaces-contre-code-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'interfaces-contre-code-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { iface, projet, ecrit, apres } = interfacesEssai(ESSAIS);

describe('declare', () => {
  it('reads the fault codes of « ## Les fautes », not those of code blocks elsewhere', () => {
    const d = declare(
      '# a\n\n## Consommateurs\n\n```md\nAUTRE_CODE\n```\n\n## Les fautes\n\n```text\nPARSE_EXPECTED PARSE_LEFTOVER\n```\n'
    );
    expect([...d.fautes!]).toEqual(['PARSE_EXPECTED', 'PARSE_LEFTOVER']);
  });
  it('has no fault list without the section', () => {
    expect(declare('# a\n').fautes).toBeNull();
  });
});

describe('the check', () => {
  it('passes an interface whose generated part is what npm run api writes', () => {
    const r = apres({});
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
  it('refuses an API changed without its report', () => {
    const r = apres({}, { 'dist/a/index.d.ts': DUREE.replace('x: number)', 'x: string)') });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/l'API a changé sans son rapport/);
  });
  // grillhouse-3uv.95.8: the API report is a file the frame generates, which the circuit
  // regenerates by `npm run api` at the final pass: the refusal its regeneration lifts carries its
  // rule, never a file, so the debt never inscribes it and the circuit knows it from the others.
  it('names the rule of the refusals its regeneration lifts, `rapport-api` and `partie-generee`, without a file', () => {
    const p = ecrit({});
    writeFileSync(path.join(p.dir, 'dist/a/index.d.ts'), DUREE.replace('x: number)', 'x: string)'));
    const resultats = path.join(p.dir, 'resultats');
    const r = spawnSync(
      'node',
      [path.resolve(__dirname, '../../scripts/interfaces-contre-code.mjs')],
      {
        cwd: p.dir,
        encoding: 'utf8',
        env: { ...process.env, [RESULTATS as string]: resultats },
      }
    );
    expect(r.status).toBe(1);
    const regles = (lireSarif(resultats) as Sarif).constats.map(k => ({
      regle: k.regle,
      fichier: k.fichier,
    }));
    expect(regles).toContainEqual({ regle: 'rapport-api', fichier: null });
    expect(regles).toContainEqual({ regle: 'partie-generee', fichier: null });
  });
  it('refuses a listed fault the code does not raise, and a raised fault not listed', () => {
    const r = apres({
      'src/a/docs/INTERFACE.md': iface(
        undefined,
        '\n## Les fautes\n\n```text\nDUREE_NEGATIVE DUREE_ABSENTE\n```\n'
      ),
      'src/a/index.ts':
        "export function duree(x: number): number { if (x < 0) throw new Error('DUREE_NEGATIVE'); if (x > 9) throw new Error('DUREE_TROP_LONGUE'); return x; }\n",
      'src/a/index.spec.ts': "const t = 'DUREE_DE_TEST';\n",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/DUREE_ABSENTE est listée, mais le code ne la produit pas/);
    expect(r.stderr).toMatch(/le code produit DUREE_TROP_LONGUE/);
    expect(r.stderr).not.toMatch(/DUREE_DE_TEST/);
  });
  it('reports a component without interface, without refusing', () => {
    const r = apres({ 'src/b/index.ts': 'export const b = 1;\n' });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/src\/b n'a pas d'interface/);
  });
  it('refuses a component whose build is missing', () => {
    const q = projet({ 'package.json': '{"name":"p","types":"build/index.d.ts"}' });
    expect(q.run().stderr).toMatch(/construis d'abord/);
  });
  it("takes a package's main entry only, not its test material", () => {
    const p = ecrit({
      'packages/b/package.json': JSON.stringify({
        name: 'b',
        exports: {
          '.': { types: './dist/index.d.ts' },
          './test-fixtures': { types: './dist/fixtures.d.ts' },
        },
      }),
      'packages/b/tsconfig.json': TSCONFIG,
      'packages/b/dist/index.d.ts': '/** Un nombre. */\nexport declare const b: number;\n',
      'packages/b/dist/fixtures.d.ts': 'export declare const cas: number;\n',
      'packages/b/docs/INTERFACE.md': `# b\n\nB.\n\n${DEBUT}\n${FIN}\n`,
    });
    const r = p.run();
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(generee(p.lire('packages/b/docs/INTERFACE.md'))).not.toMatch(/\bcas\b/);
  });
  // A package that exports only subpaths (the shared test material) has no public API: API
  // Extractor reads one entry point, and this package has none.
  const MATIERE = {
    'packages/corpus/package.json': JSON.stringify({
      name: 'corpus',
      exports: { './test-fixtures': { types: './dist/fixtures.d.ts' } },
    }),
    'packages/corpus/tsconfig.json': TSCONFIG,
    'packages/corpus/src/fixtures.ts': 'export const cas = 1;\n',
    'packages/corpus/docs/INTERFACE.md': '# corpus\n\nLa matière de test partagée.\n',
  };
  it('passes a package without a « . » entry, unbuilt, and writes it no report nor part', () => {
    const p = ecrit(MATIERE);
    passe(p.run());
    expect(p.lire('packages/corpus/docs/INTERFACE.md')).toBe(
      MATIERE['packages/corpus/docs/INTERFACE.md']
    );
    expect(existsSync(path.join(p.dir, 'packages/corpus/docs/INTERFACE.api.md'))).toBe(false);
  });
  // Witness: BPScript. A package of tools only declares its commands in `bin`, and has neither
  // `exports`, `main` nor `types`: it has no public API.
  const OUTILS = {
    'packages/outils/package.json': JSON.stringify({
      name: 'outils',
      bin: { 'bp-outil': './bin/outil.mjs' },
    }),
    'packages/outils/bin/outil.mjs': '#!/usr/bin/env node\nconsole.log(1);\n',
    'packages/outils/docs/INTERFACE.md': '# outils\n\nLes outils du projet.\n',
  };
  it('passes a package of tools (bin only), and writes it no report nor part', () => {
    const p = ecrit(OUTILS);
    passe(p.run());
    expect(p.lire('packages/outils/docs/INTERFACE.md')).toBe(
      OUTILS['packages/outils/docs/INTERFACE.md']
    );
    expect(existsSync(path.join(p.dir, 'packages/outils/docs/INTERFACE.api.md'))).toBe(false);
  });
  it.each([
    ['main', { main: './dist/index.js' }],
    ['types', { types: './dist/index.d.ts' }],
    ['typings', { typings: './dist/index.d.ts' }],
  ])('refuses a package without exports but with %s, its build missing', (_champ, champs) => {
    const p = ecrit({
      ...OUTILS,
      'packages/outils/package.json': JSON.stringify({ name: 'outils', bin: {}, ...champs }),
    });
    refusNommant(p.run(), 'packages/outils', /construis d'abord/);
  });
  it('refuses a package with a « . » entry whose build is missing', () => {
    const p = ecrit({
      ...MATIERE,
      'packages/corpus/package.json': JSON.stringify({
        name: 'corpus',
        exports: {
          '.': { types: './dist/index.d.ts' },
          './test-fixtures': { types: './dist/fixtures.d.ts' },
        },
      }),
    });
    refusNommant(p.run(), 'packages/corpus', /construis d'abord/);
  });
});
