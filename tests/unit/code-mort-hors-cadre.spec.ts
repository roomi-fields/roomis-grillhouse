import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Ticket grillhouse-3uv.32: the dead-code guard skips the packages listed out of the frame in
// docs/agents/hors-cadre.txt, read through the common function of consommateurs.mjs (3uv.27).
// Each test runs the real guard (knip) in a repository built for it.
const HORS_CADRE = 'docs/agents/hors-cadre.txt';
const SCRIPT = path.resolve(__dirname, '../../scripts/code-mort.mjs');
const MODULES = path.resolve(__dirname, '../../node_modules');
const KNIP = {
  $schema: 'https://unpkg.com/knip@6/schema.json',
  entry: ['src/index.ts'],
  project: ['src/**/*.ts', 'packages/**/*.ts'],
};

// A file given as null is left out of the repository (knip.json, for the default settings).
function codeMort(files: Record<string, string | null>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'code-mort-hors-cadre-'));
  const tous: Record<string, string | null> = {
    'package.json': JSON.stringify({ name: 'r', private: true, workspaces: ['packages/*'] }),
    'knip.json': JSON.stringify(KNIP, null, 2) + '\n',
    'src/index.ts': 'export const i = 1;\n',
    ...files,
  };
  for (const [rel, text] of Object.entries(tous)) {
    if (text === null) {
      continue;
    }
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  symlinkSync(MODULES, path.join(dir, 'node_modules'));
  const r = spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
  return { dir, status: r.status, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

const paquet = (name: string, deps: Record<string, string> = {}) =>
  JSON.stringify({ name, main: 'src/index.ts', dependencies: deps });

// a lives in the frame; v1 is a frozen version full of dead code: a file nothing imports, an
// export nothing uses, a dependency nothing uses, an import that resolves to nothing.
const A_PROPRE = {
  'packages/a/package.json': paquet('@demo/a'),
  'packages/a/src/index.ts': 'export const duree = 1;\n',
};
const V1_MORT = {
  'packages/v1/package.json': paquet('@demo/v1', { zod: '*' }),
  'packages/v1/src/index.ts':
    "import './absent';\nimport { rel } from './rel';\nexport const vieux = rel;\n",
  'packages/v1/src/rel.ts': 'export const rel = 1;\nexport const inutile = 2;\n',
  'packages/v1/src/orphelin.ts': 'export const orphelin = 1;\n',
};
// The same faults in a module of src.
const GELE_MORT = {
  'src/gele/orphelin.ts': "import './absent';\nexport const g = 1;\n",
};

const T = 60_000;

describe('critère 1 — a package listed out of the frame yields no finding of the dead-code guard', () => {
  it(
    'critère 1 — witness: unlisted, v1 yields its findings (file, export, dependency, unresolved import)',
    () => {
      const r = codeMort({ ...A_PROPRE, ...V1_MORT });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('packages/v1/src/orphelin.ts : fichier sans appelant');
      expect(r.sortie).toContain('export sans appelant — inutile');
      expect(r.sortie).toContain('dépendance sans usage — zod');
      expect(r.sortie).toContain('import introuvable');
    },
    T
  );
  it(
    'critère 1 — listed, v1 yields no finding of any kind: file, export, dependency, import',
    () => {
      const r = codeMort({ ...A_PROPRE, ...V1_MORT, [HORS_CADRE]: 'v1 version gelée\n' });
      expect(r.status, r.sortie).toBe(0);
      expect(r.sortie).not.toContain('v1');
    },
    T
  );
  it(
    'critère 1 — a listed module of src yields no finding',
    () => {
      const sans = codeMort({ ...A_PROPRE, ...GELE_MORT });
      expect(sans.status, sans.sortie).toBe(1);
      expect(sans.sortie).toContain('src/gele/orphelin.ts');
      const r = codeMort({ ...A_PROPRE, ...GELE_MORT, [HORS_CADRE]: 'gele module gelé\n' });
      expect(r.status, r.sortie).toBe(0);
      expect(r.sortie).not.toContain('gele');
    },
    T
  );
  it(
    'critère 1 — several lines skip several packages',
    () => {
      const r = codeMort({
        ...A_PROPRE,
        ...V1_MORT,
        ...GELE_MORT,
        [HORS_CADRE]: '# gelés\nv1 version gelée\n\ngele module gelé\n',
      });
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    'critère 1 — the packages in the frame are still checked',
    () => {
      const r = codeMort({
        ...A_PROPRE,
        'packages/a/src/mort.ts': 'export const mort = 1;\n',
        ...V1_MORT,
        [HORS_CADRE]: 'v1 version gelée\n',
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('packages/a/src/mort.ts : fichier sans appelant');
      expect(r.sortie).not.toContain('packages/v1');
    },
    T
  );
  it(
    'critère 1 — a listed name is the whole directory name: v1 does not skip v10',
    () => {
      const r = codeMort({
        ...A_PROPRE,
        ...V1_MORT,
        'packages/v10/package.json': paquet('@demo/v10'),
        'packages/v10/src/index.ts': 'export const dix = 1;\n',
        'packages/v10/src/orphelin.ts': 'export const o = 1;\n',
        [HORS_CADRE]: 'v1 version gelée\n',
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('packages/v10/src/orphelin.ts : fichier sans appelant');
      expect(r.sortie).not.toContain('packages/v1/');
    },
    T
  );
});

describe('critère 2 — an import from the frame into a package out of the frame stays alive', () => {
  // a reaches v1 by its package name and by a relative path; a's code is alive through them.
  const A_VERS_V1 = {
    'packages/a/package.json': paquet('@demo/a', { '@demo/v1': '*' }),
    'packages/a/src/index.ts':
      "import { vieux } from '@demo/v1';\nimport { calcul } from './calcul';\nexport const duree = vieux + calcul;\n",
    'packages/a/src/calcul.ts':
      "import { rel } from '../../v1/src/rel';\nexport const calcul = rel;\n",
  };
  it(
    'critère 2 — listed, the import of v1 by its package name and by path yields no finding in a',
    () => {
      const r = codeMort({ ...A_VERS_V1, ...V1_MORT, [HORS_CADRE]: 'v1 version gelée\n' });
      expect(r.status, r.sortie).toBe(0);
      expect(r.sortie).not.toContain('import introuvable');
      expect(r.sortie).not.toContain('packages/a');
    },
    T
  );
  it(
    'critère 2 — listed, an import of a module of src out of the frame is not « import introuvable »',
    () => {
      const r = codeMort({
        'src/index.ts': "import { g } from './gele/index';\nexport const i = g;\n",
        'src/gele/index.ts': "import { h } from './h';\nexport const g = h;\n",
        'src/gele/h.ts': 'export const h = 1;\n',
        [HORS_CADRE]: 'gele module gelé\n',
      });
      expect(r.status, r.sortie).toBe(0);
      expect(r.sortie).not.toContain('import introuvable');
    },
    T
  );
});

describe('critère 3 — the list is read by the common function of consommateurs.mjs', () => {
  const source = readFileSync(SCRIPT, 'utf8');
  const code = source
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n');
  it('critère 3 — code-mort.mjs imports from consommateurs.mjs', () => {
    expect(code).toMatch(/from\s+['"]\.\/consommateurs\.mjs['"]/);
  });
  it('critère 3 — code-mort.mjs names neither the list file nor its path in its code', () => {
    expect(code).not.toMatch(/hors-cadre\.txt|['"`]hors-cadre/);
  });
  it(
    'critère 3 — the guard reads the list as the common function does: blank and # lines name nothing',
    () => {
      const r = codeMort({ ...A_PROPRE, ...V1_MORT, [HORS_CADRE]: '\n# v1 version gelée\n   \n' });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('packages/v1/src/orphelin.ts');
    },
    T
  );
});

describe('critère 4 — without the list the guard is unchanged; knip.json is not rewritten', () => {
  it(
    'critère 4 — without hors-cadre.txt, every package is checked',
    () => {
      const r = codeMort({ ...A_PROPRE, ...V1_MORT, ...GELE_MORT });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('packages/v1/src/orphelin.ts : fichier sans appelant');
      expect(r.sortie).toContain('src/gele/orphelin.ts : fichier sans appelant');
    },
    T
  );
  it(
    'critère 4 — an empty hors-cadre.txt skips nothing',
    () => {
      const r = codeMort({ ...A_PROPRE, ...V1_MORT, [HORS_CADRE]: '' });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('packages/v1/src/orphelin.ts : fichier sans appelant');
    },
    T
  );
  it(
    'critère 4 — with the list, the project knip.json is left byte for byte',
    () => {
      const r = codeMort({ ...A_PROPRE, ...V1_MORT, [HORS_CADRE]: 'v1 version gelée\n' });
      const knip = path.join(r.dir, 'knip.json');
      expect(readFileSync(knip, 'utf8')).toBe(JSON.stringify(KNIP, null, 2) + '\n');
    },
    T
  );
  it(
    "critère 4 — with the list, the project's own knip.json settings still hold",
    () => {
      const propre = { ...KNIP, ignore: ['packages/a/src/garde.ts'], ignoreDependencies: ['zod'] };
      const r = codeMort({
        'knip.json': JSON.stringify(propre, null, 2) + '\n',
        'packages/a/package.json': paquet('@demo/a', { zod: '*' }),
        'packages/a/src/index.ts': 'export const duree = 1;\n',
        'packages/a/src/garde.ts': 'export const garde = 1;\n',
        ...V1_MORT,
        [HORS_CADRE]: 'v1 version gelée\n',
      });
      expect(r.status, r.sortie).toBe(0);
      expect(readFileSync(path.join(r.dir, 'knip.json'), 'utf8')).toBe(
        JSON.stringify(propre, null, 2) + '\n'
      );
    },
    T
  );
});

describe('critère 5 — the header of code-mort.mjs says the packages out of the frame are skipped', () => {
  it('critère 5 — the leading comment names the list and says its packages are skipped', () => {
    const lignes = readFileSync(SCRIPT, 'utf8').split('\n');
    const debut = lignes.findIndex(l => l.startsWith('import '));
    const entete = lignes
      .slice(0, debut)
      .filter(l => l.startsWith('//'))
      .join(' ');
    expect(entete).toMatch(/hors-cadre\.txt|hors cadre|out of the frame/i);
    expect(entete).toMatch(/skip|saut|not (read|checked|measured)|leaves? out|ignor/i);
  });
});

describe('critère 6 — a use coming from a package out of the frame does not count', () => {
  // a's entry uses `base` of its module outil.ts; `partage` and the type `Forme` of the same
  // module are used by v1 alone, by a relative path (a's package name reaches only its public
  // entries, which knip never reports).
  const A_OUTIL = {
    'packages/a/package.json': paquet('@demo/a'),
    'packages/a/src/index.ts': "import { base } from './outil';\nexport const duree = base;\n",
    'packages/a/src/outil.ts':
      'export const base = 1;\nexport const partage = 2;\nexport type Forme = { n: number };\n',
  };
  const V1_CHEMIN = {
    'packages/v1/package.json': paquet('@demo/v1'),
    'packages/v1/src/index.ts':
      "import { partage } from '../../a/src/outil';\nimport type { Forme } from '../../a/src/outil';\nexport const vieux: Forme = { n: partage };\n",
  };
  it(
    'critère 6 — witness: unlisted, v1 keeps the export of a alive',
    () => {
      const r = codeMort({ ...A_OUTIL, ...V1_CHEMIN });
      expect(r.sortie).not.toContain('partage');
      expect(r.sortie).not.toContain('Forme');
    },
    T
  );
  it(
    'critère 6 — listed, an export and a type of a used by v1 alone are « sans appelant »',
    () => {
      const r = codeMort({ ...A_OUTIL, ...V1_CHEMIN, [HORS_CADRE]: 'v1 version gelée\n' });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('packages/a/src/outil.ts : export sans appelant — partage');
      expect(r.sortie).toContain('packages/a/src/outil.ts : type exporté sans appelant — Forme');
      expect(r.sortie).not.toContain('— base');
      expect(r.sortie).not.toContain('packages/v1');
    },
    T
  );
  it(
    'critère 6 — listed, a module of src used by a module out of the frame alone is « fichier sans appelant »',
    () => {
      const r = codeMort({
        'src/index.ts': 'export const i = 1;\n',
        'src/outils/index.ts': 'export const o = 1;\n',
        'src/gele/index.ts': "import { o } from '../outils/index';\nexport const g = o;\n",
        [HORS_CADRE]: 'gele module gelé\n',
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('src/outils/index.ts : fichier sans appelant');
      expect(r.sortie).not.toContain('gele');
    },
    T
  );
});

describe('critère 7 — with a list and no knip.json, the guard runs on knip defaults, the list applied', () => {
  it(
    'critère 7 — witness: no knip.json, no list, knip defaults report v1',
    () => {
      const r = codeMort({ 'knip.json': null, ...A_PROPRE, ...V1_MORT });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('packages/v1/src/orphelin.ts : fichier sans appelant');
    },
    T
  );
  it(
    'critère 7 — no knip.json, listed: v1 yields no finding and the frame is still checked',
    () => {
      const r = codeMort({
        'knip.json': null,
        ...A_PROPRE,
        'packages/a/src/mort.ts': 'export const mort = 1;\n',
        ...V1_MORT,
        ...GELE_MORT,
        [HORS_CADRE]: 'v1 version gelée\ngele module gelé\n',
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('packages/a/src/mort.ts : fichier sans appelant');
      expect(r.sortie).not.toContain('v1');
      expect(r.sortie).not.toContain('gele');
    },
    T
  );
  it(
    'critère 7 — no knip.json, listed, clean frame: green, and no knip.json is left in the project',
    () => {
      const r = codeMort({
        'knip.json': null,
        ...A_PROPRE,
        ...V1_MORT,
        [HORS_CADRE]: 'v1 version gelée\n',
      });
      expect(r.status, r.sortie).toBe(0);
      expect(existsSync(path.join(r.dir, 'knip.json'))).toBe(false);
    },
    T
  );
});
