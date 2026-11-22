// What a test declares it reads (`// @lit <motif>` at its head, vitest-config/lances.mjs) enters
// the inputs of the test task of its package in the generated turbo.json, beside the paths of
// `grillhouse.lit`: one declaration, read by the choice of the tests and by Turborepo's cache. A
// file a test declares, out of `grillhouse.lit`, then moves the hash of the task, and the cache
// no longer gives back a green of before.
//
// Small tests: the generator by its interface, on the files of a trial repository; Turborepo's own
// hashes are read by night (packages/grillhouse-essais/tests/turbo-des-paquets-donnees.nuit.spec.ts).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'jsonc-parser';
import { afterAll, describe, expect, it } from 'vitest';
import { ecrire, verifier } from '../../../../scripts/langages/typescript/turbo-des-paquets.mjs';

const DEPOT = path.resolve(__dirname, '../../../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'turbo-lectures-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrireFichier = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

// A repository of one TypeScript package `a`, whose test declares <motifs>; <grillhouse> is the
// key of its package.json.
function depot(motifs: string[], grillhouse?: object): string {
  const r = mkdtempSync(path.join(ESSAIS, 'd-'));
  ecrireFichier(
    r,
    'package.json',
    json({ name: 'essai', private: true, workspaces: ['packages/*'], packageManager: 'npm@10.9.8' })
  );
  ecrireFichier(r, 'turbo.json', lire(DEPOT, 'templates/turbo/paquets.json'));
  ecrireFichier(
    r,
    'packages/a/package.json',
    json({
      name: '@p/a',
      private: true,
      scripts: { build: 'tsc', 'test:unit': 'vitest run' },
      ...(grillhouse ? { grillhouse } : {}),
    })
  );
  ecrireFichier(r, 'packages/a/src/index.ts', 'export const a = 1;\n');
  ecrireFichier(
    r,
    'packages/a/tests/liste.spec.ts',
    `// The list of the repository, judged whole.\n${motifs.map(m => `// @lit ${m}\n`).join('')}import { it } from 'vitest';\nit('x', () => {});\n`
  );
  ecrireFichier(r, 'donnees/cas/un.json', '{"n":1}\n');
  ecrireFichier(r, 'README.md', '# essai\n');
  return r;
}

type Taches = { tasks: Record<string, { inputs?: string[]; dependsOn?: string[] }> };
const entrees = (r: string) =>
  (parse(lire(r, 'packages/a/turbo.json')) as Taches).tasks['test:unit']?.inputs ?? [];

describe('the patterns a test declares enter the inputs of the test task of its package', () => {
  it('a package without grillhouse.lit whose test declares patterns receives the task, each pattern from the root', () => {
    const r = depot(['donnees/cas/** README.md']);
    ecrire(r);
    expect(entrees(r)).toContain('$TURBO_ROOT$/donnees/cas/**');
    expect(entrees(r)).toContain('$TURBO_ROOT$/README.md');
  });

  it("a pattern the package's grillhouse.lit already covers is not written twice", () => {
    const r = depot(['donnees/cas/** README.md'], { lit: ['donnees'] });
    ecrire(r);
    expect(entrees(r)).toContain('$TURBO_ROOT$/donnees/**');
    expect(entrees(r)).not.toContain('$TURBO_ROOT$/donnees/cas/**');
    expect(entrees(r)).toContain('$TURBO_ROOT$/README.md');
  });

  it('a package whose tests declare nothing keeps its turbo.json without a test task', () => {
    const r = depot([]);
    ecrire(r);
    expect(entrees(r)).toEqual([]);
  });

  it('the verification refuses a turbo.json written before the declaration, and its command writes it', () => {
    const r = depot([]);
    ecrire(r);
    expect(verifier(r)).toEqual([]);
    ecrireFichier(
      r,
      'packages/a/tests/liste.spec.ts',
      "// @lit donnees/cas/**\nimport { it } from 'vitest';\nit('x', () => {});\n"
    );
    expect(verifier(r).join('\n')).toMatch(/packages\/a\/turbo\.json/);
    ecrire(r);
    expect(verifier(r)).toEqual([]);
  });
});
