import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { restesAuProjet } from '../../../../scripts/migrations.mjs';
import {
  migrer,
  nom,
  restes,
  version,
} from '../../../../scripts/langages/typescript/migrations/0.24.7-matiere-dans-les-tests.mjs';

// grillhouse-mo7 critère 4: from 0.24.7 the guard of the consumers reads the uses of the shared
// test material in the tests of its consumers (BPScript 990-corpus: 176 names « déclarés non
// utilisés », inscribed as debt at 0.24.6). A name a test imports that the interface does not
// declare is now refused; as the updates of 0.24.4 and 0.24.6 name their findings, the update
// names each such use beyond the debt, and the command that inscribes them.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-matiere-dans-les-tests-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const projet = (fichiers: Record<string, string>) => {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  for (const [f, t] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    writeFileSync(path.join(p, f), t);
  }
  return p;
};
const INTERFACE = (consommateurs: string) =>
  `# b\n\nB porte le corpus.\n\n## Consommateurs\n\n${consommateurs}\n`;
const BASE = {
  // grillhouse-3dr.2.3: a project of TypeScript declares its language.
  'package.json': '{"name":"p","grillhouse":{"langages":["typescript"],"version":"0.24.6"}}',
  'packages/b/package.json': JSON.stringify({
    name: '@demo/b',
    exports: { './test-fixtures': './test/corpus.ts' },
  }),
  'packages/b/test/corpus.ts': 'export const corpus = 1;\nexport const cas = 2;\n',
  'packages/a/package.json': '{"name":"@demo/a"}',
  'packages/a/test/a.spec.ts': "import { corpus, cas } from '@demo/b/test-fixtures';",
};
const PERIME = { ...BASE, 'packages/b/docs/INTERFACE.md': INTERFACE('- `a` : corpus') };
const LIGNES = [
  'a utilise « cas » de b, que packages/b/docs/INTERFACE.md ne déclare pas.',
  'la garde des consommateurs lit désormais les usages de la matière de test dans les tests de ses consommateurs, et refuse ces usages non déclarés (1 en tout) : `npm run grillhouse:dette:inscrire` les inscrit dans grillhouse-dette.json, la dette connue du projet, ou chaque nom entre dans sa ligne (- `consommateur` : nom, nom)',
];

describe('migration 0.24.7 — the uses of the shared test material read in the tests', () => {
  it('is the migration of 0.24.7, « matière de test lue dans les tests »', () => {
    expect(version).toBe('0.24.7');
    expect(nom).toBe('matière de test lue dans les tests');
  });

  it('critère 4 — names each use the guard now refuses, and the command that inscribes the debt', () => {
    expect(restes(projet(PERIME))).toEqual(LIGNES);
  });

  it('critère 4 — the update of a project at 0.24.6 reports them', () => {
    expect(restesAuProjet(projet(PERIME), '0.24.6')).toContainEqual({
      version: '0.24.7',
      nom: 'matière de test lue dans les tests',
      lignes: LIGNES,
    });
  });

  it('critère 4 — writes nothing, and says nothing once the debt holds them or the use is declared', () => {
    const p = projet(PERIME);
    const avant = readdirSync(p);
    expect(migrer(p)).toEqual([]);
    expect(readdirSync(p)).toEqual(avant);
    const dette = {
      consommateurs: {
        'packages/b/docs/INTERFACE.md': { 'usage-non-declare': { count: 1 } },
      },
    };
    expect(restes(projet({ ...PERIME, 'grillhouse-dette.json': JSON.stringify(dette) }))).toEqual(
      []
    );
    const propre = projet({
      ...BASE,
      'packages/b/docs/INTERFACE.md': INTERFACE('- `a` : corpus, cas'),
    });
    expect(restes(propre)).toEqual([]);
  });
});
