import { codeMortEssai } from './code-mort-essai.js';

// The trial matter of the tests of grillhouse-3uv.62 on the dead-code guard
// (tests/unit/code-mort-tests-bancs*.spec.ts), beside ./code-mort-essai.ts.

export const T = 60_000;
export const HORS_CADRE = 'docs/agents/hors-cadre.txt';

// BPScript's form: knip reads src/ alone.
export const KNIP_SRC = { entry: ['src/index.ts'], project: ['src/**/*.ts'] };
export const json = (o: object) => JSON.stringify(o, null, 2) + '\n';
export const racine = (devDependencies: Record<string, string>, autres: object = {}) =>
  json({
    name: 'r',
    private: true,
    devDependencies: { vitest: '*', ...devDependencies },
    ...autres,
  });

// A test file of vitest, importing what it is given.
export const testVitest = (...imports: string[]) =>
  [
    "import { expect, it } from 'vitest';",
    ...imports,
    "it('x', () => expect(1).toBe(1));",
    '',
  ].join('\n');

export const DEP_DEV = 'dépendance de développement sans usage';

// The repositories of trial of one test file, under <ESSAIS>.
export function codeMortTestsBancsEssai(ESSAIS: string) {
  const essai = (files: Record<string, string | null>) =>
    codeMortEssai(ESSAIS, {
      'knip.json': json(KNIP_SRC),
      'src/index.ts': 'export const i = 1;\n',
      ...files,
    });
  return { essai };
}
