import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { codeMortEssai } from './code-mort-essai.js';

// The dead-code guard judges a project's own code, not the frame's: the scripts the frame
// installs (the `.mjs`, `.cjs` and `.js` files of `.claude/grillhouse/fichiers.txt`, its
// directories unrolled) are entries of knip, each in the place that holds it (the root, or the
// workspace of its directory), and the project's `knip.json` names none of them. Witness:
// BPScript, a repository of packages where `scripts/vitest-config` is a workspace, whose guard
// refused two exports of `scripts/vitest-config/pression.mjs`, a command the night runs
// (`node scripts/vitest-config/pression.mjs attendre`). Each test runs the real guard (knip) in a
// repository built for it, which holds the frame's real `scripts/vitest-config/`.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'code-mort-cadre-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const T = 60_000;
const json = (o: object) => JSON.stringify(o, null, 2) + '\n';
const PAQUET = path.resolve(__dirname, '../../scripts/vitest-config');
const VITEST_CONFIG = Object.fromEntries(
  readdirSync(PAQUET).map(f => [
    `scripts/vitest-config/${f}`,
    readFileSync(path.join(PAQUET, f), 'utf8'),
  ])
);
const CADRE = {
  ...VITEST_CONFIG,
  'scripts/nuit.sh': '#!/usr/bin/env bash\nnode scripts/vitest-config/pression.mjs attendre\n',
  '.claude/grillhouse/fichiers.txt':
    '# The frame files.\nscripts/vitest-config/\nscripts/nuit.sh\n- scripts/ancien.mjs\n',
};
// A package of the project, clean, and the same with an export nothing uses.
const A = {
  'packages/a/package.json': json({ name: '@r/a', main: 'src/index.ts' }),
  'packages/a/src/index.ts': "import { aide } from './aide';\nexport const a = aide;\n",
  'packages/a/src/aide.ts': 'export const aide = 1;\n',
};
const A_MORT = {
  ...A,
  'packages/a/src/aide.ts': 'export const aide = 1;\nexport const mort = 2;\n',
};
const RACINE = json({
  name: 'r',
  private: true,
  workspaces: ['packages/*', 'scripts/vitest-config'],
  devDependencies: { vitest: '*' },
});

const essai = (files: Record<string, string | null>) =>
  codeMortEssai(ESSAIS, { 'package.json': RACINE, ...CADRE, ...files });

describe("the frame's scripts are entries of the dead-code guard", () => {
  it(
    "witness: without the frame's list, pression.mjs of the workspace scripts/vitest-config is refused",
    () => {
      const r = essai({ ...A, '.claude/grillhouse/fichiers.txt': null });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('scripts/vitest-config/pression.mjs');
    },
    T
  );

  it(
    'a repository of packages without knip.json: no finding in the frame, a dead export of the project refused',
    () => {
      const propre = essai(A);
      expect(propre.sortie).not.toContain('scripts/vitest-config');
      expect(propre.status, propre.sortie).toBe(0);
      const mort = essai(A_MORT);
      expect(mort.status, mort.sortie).toBe(1);
      expect(mort.sortie).toContain('packages/a/src/aide.ts : export sans appelant — mort');
      expect(mort.sortie).not.toContain('scripts/vitest-config');
    },
    T
  );

  it(
    "knip's default entries stay: the root's src/index.ts still lives, its dead export refused",
    () => {
      const r = essai({
        ...A,
        'src/index.ts': "import { b } from './b';\nexport const i = b;\n",
        'src/b.ts': 'export const b = 1;\nexport const mortRacine = 2;\n',
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('src/b.ts : export sans appelant — mortRacine');
      expect(r.sortie).not.toContain('src/index.ts : fichier sans appelant');
      expect(r.sortie).not.toContain('scripts/vitest-config');
    },
    T
  );

  it(
    "a knip.json with workspace keys: its settings kept, no finding in the frame, the project's dead export refused",
    () => {
      const knip = json({
        workspaces: {
          '.': { entry: ['src/main.ts'] },
          'packages/*': { entry: ['src/index.ts'], project: ['src/**/*.ts'] },
        },
      });
      const r = essai({
        ...A_MORT,
        'knip.json': knip,
        'src/main.ts': "import { c } from './c';\nexport const m = c;\n",
        'src/c.ts': 'export const c = 1;\n',
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('packages/a/src/aide.ts : export sans appelant — mort');
      expect(r.sortie).not.toContain('src/main.ts');
      expect(r.sortie).not.toContain('src/c.ts');
      expect(r.sortie).not.toContain('scripts/vitest-config');
    },
    T
  );

  it(
    'a repository without packages: the frame scripts are entries of the root, its own code still judged',
    () => {
      const r = codeMortEssai(ESSAIS, {
        ...CADRE,
        'package.json': json({ name: 'r', private: true, devDependencies: { vitest: '*' } }),
        'knip.json': json({
          entry: ['src/index.ts'],
          project: ['src/**/*.ts', 'scripts/**/*.mjs'],
        }),
        'scripts/vitest-config/package.json': null,
        'src/index.ts': "import { b } from './b';\nexport const i = b;\n",
        'src/b.ts': 'export const b = 1;\nexport const mortRacine = 2;\n',
        'scripts/outil.mjs': 'export const outil = 1;\n',
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('src/b.ts : export sans appelant — mortRacine');
      expect(r.sortie).toContain('scripts/outil.mjs : fichier sans appelant');
      expect(r.sortie).not.toContain('scripts/vitest-config');
    },
    T
  );
});
