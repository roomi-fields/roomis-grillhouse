// grillhouse-3uv.65, grillhouse-3uv.75.1: the integration and the queue with the traces kept by
// test file. The trial project plays the frame's real launcher of the tests (`npm test`, which
// runs scripts/integration/suites-vitest.mjs) with the real Vitest, its dependencies linked to this
// repository's, and the frame's real command of the guards (`integration:gardes` as the frame's
// package.json writes it, the scripts of scripts/integration/ it runs played as they are, with the
// frame's list `grillhouse:gardes`); each guard script of that list is stood in by a script that
// writes its name and passes, unless the file REFUS-<its name> exists where it runs. Its `build`
// writes one line per build, the files of src/a, src/b and scripts it saw, so a build after the lot
// is told from a build before it. Each test file of the trial appends its path to
// <PRINCIPAL>.joues when Vitest loads it: the files a passage played are read there.
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chantier } from './integration-essai.js';
import { lierDependances } from './tests-en-cache-essai.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'integration-traces-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 180_000;
const RACINE = path.resolve(__dirname, '../..');
const LANCEUR = path.join(RACINE, 'scripts/integration/suites-vitest.mjs');

// The frame's chain of guards: `integration:gardes` and every npm script it runs, followed
// through `npm run` and the pre/post hooks, with `grillhouse:gardes`, the frame's one list of the
// guards; `build` and `test` left to the trial; and the files of the scripts they run with node.
function chaineDesGardes() {
  const paquet = JSON.parse(readFileSync(path.join(RACINE, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const { scripts } = paquet;
  const pris: Record<string, string> = {};
  const fichiers = new Set<string>();
  const visiter = (nom: string) => {
    if (nom in pris || nom === 'build' || nom === 'test' || !(nom in scripts)) {
      return;
    }
    pris[nom] = scripts[nom];
    for (const m of scripts[nom].matchAll(/npm run (?:--?\S+\s+)*([\w:.-]+)/g)) {
      visiter(m[1]);
    }
    for (const m of scripts[nom].matchAll(/\bnode\s+(\S+\.[cm]?js)\b/g)) {
      fichiers.add(m[1]);
    }
    visiter(`pre${nom}`);
    visiter(`post${nom}`);
  };
  visiter('integration:gardes');
  visiter('grillhouse:gardes');
  return { scripts: pris, fichiers: [...fichiers] };
}

const BUILD = `import fs from 'node:fs';
const vus = ['src/a', 'src/b', 'scripts']
  .filter(d => fs.existsSync(d))
  .flatMap(d => fs.readdirSync(d))
  .sort()
  .join(',');
fs.appendFileSync(process.env.PRINCIPAL + '.builds', vus + '\\n');
`;

// A test file of the trial at <rel>: it appends <rel> to <PRINCIPAL>.joues when loaded, imports
// <importe> as the namespace m, then holds <tests> (the source of its tests).
const essai = (rel: string, importe: string | null, tests: string) =>
  `import { appendFileSync } from 'node:fs';\nimport { test } from 'vitest';\n` +
  (importe ? `import * as m from '${importe}';\n` : 'const m = {};\n') +
  `appendFileSync(process.env.PRINCIPAL + '.joues', '${rel}\\n');\n${tests}`;

// src/a: « a ok », and « neuf », red once src/a/index.ts exports casse; src/a/vieux.spec.ts:
// « vieux », red on main from the start; src/b, src/c: one green test each; tests/unit/r.spec.ts:
// the root, one green test, importing the helper tests/unit/aide-essai.ts.
const TESTS = {
  'src/a/a.spec.ts': essai(
    'src/a/a.spec.ts',
    './index',
    "test('a ok', () => {});\ntest('neuf', () => {\n  if ((m as Record<string, unknown>).casse) throw new Error('neuf');\n});\n"
  ),
  'src/a/vieux.spec.ts': essai(
    'src/a/vieux.spec.ts',
    null,
    "test('vieux', () => {\n  throw new Error('vieux');\n});\n"
  ),
  'src/b/b.spec.ts': essai('src/b/b.spec.ts', './index', "test('b ok', () => {});\n"),
  'src/c/c.spec.ts': essai('src/c/c.spec.ts', './index', "test('c ok', () => {});\n"),
  'tests/unit/r.spec.ts': essai(
    'tests/unit/r.spec.ts',
    './aide-essai',
    "test('r ok', () => {});\n"
  ),
  'tests/unit/aide-essai.ts': 'export const aide = 1;\n',
};
const CONFIG = `export default {
  test: {
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/*.nuit.{test,spec}.*'],
  },
};
`;

// A lot of src/a that adds src/a/<nom>.ts and makes src/a/index.ts import it: the tests of src/a
// read it, so they play after the lot.
const lotA = (nom: string) => ({
  [`src/a/${nom}.ts`]: `export const ${nom} = 1;\n`,
  'src/a/index.ts': `import { ${nom} } from './${nom}';\nexport const a = ${nom};\n`,
});
// The same for src/b.
const lotB = (nom: string) => ({
  [`src/b/${nom}.ts`]: `export const ${nom} = 2;\n`,
  'src/b/index.ts': `import { ${nom} } from './${nom}';\nexport const b = ${nom};\n`,
});

// A guard of the trial: it writes <nom> and passes, unless REFUS-<nom> exists where it runs.
const garde = (nom: string) => `import fs from 'node:fs';
fs.appendFileSync(process.env.PRINCIPAL + '.gardes-jouees', '${nom}\\n');
if (fs.existsSync('REFUS-${nom}')) {
  console.log('${nom} : REFUSÉ');
  process.exit(1);
}
`;

// <grillhouse> is the project's `grillhouse` section of package.json.
function chantierTraces(grillhouse: Record<string, unknown> = {}) {
  const m = chantier(ESSAIS);
  lierDependances(m.repo);
  const { scripts, fichiers } = chaineDesGardes();
  const poses: Record<string, string> = {
    'package.json': JSON.stringify(
      {
        name: 'essai',
        private: true,
        type: 'module',
        grillhouse,
        scripts: {
          ...scripts,
          build: 'node build.mjs',
          test: `node ${LANCEUR}`,
        },
      },
      null,
      2
    ),
    'build.mjs': BUILD,
    'vitest.config.mjs': CONFIG,
    ...TESTS,
  };
  for (const f of fichiers) {
    poses[f] = f.startsWith('scripts/integration/')
      ? readFileSync(path.join(RACINE, f), 'utf8')
      : garde(path.basename(f, path.extname(f)));
  }
  m.poser(poses, 'projet');
  const lire = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  const builds = () => lire(`${m.repo}.builds`).split('\n').filter(Boolean);
  // The guards played so far, by name, one per run.
  const jouees = () => lire(`${m.repo}.gardes-jouees`).split('\n').filter(Boolean);
  // The test files Vitest loaded so far, one line per load.
  const joues = () => lire(`${m.repo}.joues`).split('\n').filter(Boolean);
  return { ...m, builds, jouees, joues };
}
type ChantierTraces = ReturnType<typeof chantierTraces>;
// The test files Vitest loaded since <avant> loads, each once, sorted.
const jouesDepuis = (m: ChantierTraces, avant: number) =>
  [...new Set(m.joues().slice(avant))].sort();

describe('critère 2 — at the integration, a base already measured is not replayed', () => {
  it(
    'critère 2: the next integration on the same HEAD reads the base of the touched files from their traces, and plays only what its lot changes',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', lotA('un'));
      m.livrer('demo-1');
      m.ticket('demo-2', lotA('deux'));
      const avant = m.joues().length;
      const r = m.integrer('demo-2');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.joues().slice(avant)).toEqual(['src/a/a.spec.ts']);
    },
    LONG
  );
});

describe('critère 7 — an integration builds the project once, after the lots', () => {
  it(
    'critère 7: once the lot is applied, the project is built once: the guards do not build it again',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', lotA('un'));
      const avant = m.builds().length;
      m.livrer('demo-1');
      const apresLot = m
        .builds()
        .slice(avant)
        .filter(l => l.split(',').includes('un.ts'));
      expect(apresLot).toHaveLength(1);
    },
    LONG
  );
  it(
    'critère 7: an integration whose base comes from the traces builds the project once in all, after its lot',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', lotA('un'));
      m.livrer('demo-1');
      m.ticket('demo-2', lotA('deux'));
      const avant = m.builds().length;
      m.livrer('demo-2');
      const faits = m.builds().slice(avant);
      expect(faits).toHaveLength(1);
      expect(faits[0].split(',')).toContain('deux.ts');
    },
    LONG
  );
  it(
    'critère 7: the queue replaying a branch on a main that moved builds it once after the replacement: the guards do not build it again',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', lotA('un'));
      m.ticket('demo-2', lotB('deux'));
      m.livrer('demo-1');
      m.livrer('demo-2');
      const avant = m.builds().length;
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()[0]).toBe('feat: lot (demo-2)');
      const replacee = m
        .builds()
        .slice(avant)
        .filter(l => l.split(',').includes('deux.ts'));
      expect(replacee).toHaveLength(1);
    },
    LONG
  );
});

describe('critère 8 — the verdict of the integration is unchanged, traces in play', () => {
  it(
    'critère 8 (garde): a failing test main already has stays admitted when the base comes from a trace',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', lotA('un'));
      m.livrer('demo-1');
      m.ticket('demo-2', lotA('deux'));
      const r = m.integrer('demo-2');
      expect(r.status, r.stdout + r.stderr).toBe(0);
    },
    LONG
  );
  it(
    'critère 8 (garde): a new failing test refuses the lot when the base comes from a trace',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', lotA('un'));
      m.livrer('demo-1');
      m.ticket('demo-2', { 'src/a/index.ts': 'export const a = 0;\nexport const casse = true;\n' });
      const r = m.integrer('demo-2');
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/Rouges nouveaux/);
      expect(r.stdout).toMatch(/neuf/);
      expect(r.stdout).not.toMatch(/✗ .*vieux/);
    },
    LONG
  );
});

// A lot of root files no declaration names: a script, a hook, a setting of the frame, a document.
const HORS_DECLARES = {
  'scripts/outil.mjs': 'export const o = 1;\n',
  '.claude/hooks/garde.sh': 'exit 0\n',
  '.claude/settings.json': '{}\n',
  'docs/note.md': 'une note\n',
};

describe('critère 17 — a root file replays only the suites that declare it read', () => {
  it(
    'critère 17: a lot of root files no declaration names replays no test, and is committed',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', HORS_DECLARES);
      const avant = m.joues().length;
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(jouesDepuis(m, avant)).toEqual([]);
      expect(r.stdout).not.toMatch(/toutes les suites/);
      expect(r.stdout).toMatch(/✓ commit/);
    },
    LONG
  );
  it(
    'critère 17: the queue replaying such a branch on a main that moved replays no test',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', lotA('un'));
      m.ticket('demo-2', HORS_DECLARES);
      m.livrer('demo-1');
      m.livrer('demo-2');
      const avant = m.joues().length;
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()[0]).toBe('feat: lot (demo-2)');
      expect(jouesDepuis(m, avant)).toEqual([]);
    },
    LONG
  );
});

describe('critère 18 — a lot that changes only tests plays those tests', () => {
  it(
    'critère 18: a lot that changes only a test file outside every component plays that file alone, on the base and after',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', {
        'tests/unit/r.spec.ts': `${TESTS['tests/unit/r.spec.ts']}// changé\n`,
      });
      const avant = m.joues().length;
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(jouesDepuis(m, avant)).toEqual(['tests/unit/r.spec.ts']);
    },
    LONG
  );
  it(
    "critère 18: a lot that adds only a test file to a component plays that file alone, not the component's other tests nor its consumers",
    () => {
      const m = chantierTraces();
      m.poser({ 'src/c/index.ts': "import { b } from '../b/index';\nexport const c = b;\n" });
      m.ticket('demo-1', {
        'src/b/b2.spec.ts': essai('src/b/b2.spec.ts', './index', "test('b2 ok', () => {});\n"),
      });
      const avant = m.joues().length;
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(jouesDepuis(m, avant)).toEqual(['src/b/b2.spec.ts']);
    },
    LONG
  );
});

// grillhouse-3uv.75.1 critère 14: the replay hands the base only the test files of the lot that exist there.
describe('3uv.75.1 critère 14 — the replay hands the base only the test files of the lot that exist there', () => {
  it(
    'critère 14: the base receives only the test files of the lot that exist there: a lot that changes a root test file and adds another plays the existing file alone on the base, both after the lot',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', {
        'tests/unit/r.spec.ts': `${TESTS['tests/unit/r.spec.ts']}// changé\n`,
        'tests/unit/neuf.spec.ts': essai(
          'tests/unit/neuf.spec.ts',
          null,
          "test('neuf ok', () => {});\n"
        ),
      });
      const avant = m.joues().length;
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const charges = m.joues().slice(avant);
      // r.spec.ts loads on the base and after the lot; neuf.spec.ts after the lot alone.
      expect(
        charges.filter(f => f === 'tests/unit/r.spec.ts'),
        charges.join(', ')
      ).toHaveLength(2);
      expect(
        charges.filter(f => f === 'tests/unit/neuf.spec.ts'),
        charges.join(', ')
      ).toHaveLength(1);
      expect(jouesDepuis(m, avant)).toEqual(['tests/unit/neuf.spec.ts', 'tests/unit/r.spec.ts']);
    },
    LONG
  );
  it(
    'critère 14: the base receives only the test files of the lot that exist there: a lot whose added test file is red is refused on that new failing test, not on a base that does not measure',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', {
        'tests/unit/r.spec.ts': `${TESTS['tests/unit/r.spec.ts']}// changé\n`,
        'tests/unit/neuf.spec.ts': essai(
          'tests/unit/neuf.spec.ts',
          null,
          "test('neuf rouge', () => {\n  throw new Error('neuf');\n});\n"
        ),
      });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).not.toBe(0);
      expect(r.stdout + r.stderr).toContain('neuf rouge');
      expect(r.stdout + r.stderr).not.toMatch(/La base ne se mesure pas/);
    },
    LONG
  );
});

describe('critère 22 — at the integration, a helper of the tests changed alone replays the root tests that import it', () => {
  it(
    'critère 22: a lot that changes only a helper outside every component plays the root test that imports it, and no test of a component',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', { 'tests/unit/aide-essai.ts': 'export const aide = 2;\n' });
      const avant = m.joues().length;
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(jouesDepuis(m, avant)).toEqual(['tests/unit/r.spec.ts']);
    },
    LONG
  );
});

// A project whose guards read no build: its list of guards ends on the build step.
const sansGardeQuiLit = (m: ReturnType<typeof chantierTraces>) => {
  const pkg = JSON.parse(readFileSync(path.join(m.repo, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const etapes = pkg.scripts['grillhouse:gardes'].split('&&').map(e => e.trim());
  const i = etapes.findIndex(e => /^npm run .*\bbuild$/.test(e));
  pkg.scripts['grillhouse:gardes'] = etapes.slice(0, i + 1).join(' && ');
  m.poser({ 'package.json': JSON.stringify(pkg, null, 2) }, 'gardes sans lecture');
};

describe('critère 19 — an integration builds once after the lots as soon as a suite or a guard reads the build; main builds only when one of its suites replays', () => {
  it(
    'critère 19: an integration that replays no suite, at a project whose guards read the build, builds the project once, after its lot, and main not at all',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', HORS_DECLARES);
      const avant = m.builds().length;
      m.livrer('demo-1');
      const faits = m.builds().slice(avant);
      expect(faits).toHaveLength(1);
      expect(faits[0].split(',')).toContain('outil.mjs');
    },
    LONG
  );
  it(
    'critère 19: an integration that replays no suite, at a project whose guards read the build, plays the guards that read it',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', HORS_DECLARES);
      const avant = m.jouees().length;
      m.livrer('demo-1');
      expect(m.jouees().slice(avant)).toEqual(
        expect.arrayContaining(['interfaces-contre-code', 'code-mort'])
      );
    },
    LONG
  );
  it(
    'critère 19 (garde): an integration that replays no suite, at a project whose guards read no build, builds nothing',
    () => {
      const m = chantierTraces();
      sansGardeQuiLit(m);
      m.ticket('demo-1', HORS_DECLARES);
      const avant = m.builds().length;
      m.livrer('demo-1');
      expect(m.builds().slice(avant)).toEqual([]);
    },
    LONG
  );
  it(
    'critère 19: an integration whose base replays builds main once, then the project once after its lot',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', lotA('un'));
      const avant = m.builds().length;
      m.livrer('demo-1');
      const faits = m.builds().slice(avant);
      expect(faits).toHaveLength(2);
      expect(faits[0].split(',')).not.toContain('un.ts');
      expect(faits[1].split(',')).toContain('un.ts');
    },
    LONG
  );
  it(
    'critère 19: the queue replaying a branch that replays no suite, at a project whose guards read the build, builds it once after the replacement',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', lotA('un'));
      m.ticket('demo-2', HORS_DECLARES);
      m.livrer('demo-1');
      m.livrer('demo-2');
      const avant = m.builds().length;
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()[0]).toBe('feat: lot (demo-2)');
      const faits = m.builds().slice(avant);
      expect(faits).toHaveLength(1);
      expect(faits[0].split(',')).toEqual(expect.arrayContaining(['un.ts', 'outil.mjs']));
    },
    LONG
  );
  it(
    'critère 19 (garde): the queue replaying a branch that replays no suite, at a project whose guards read no build, builds nothing',
    () => {
      const m = chantierTraces();
      sansGardeQuiLit(m);
      m.ticket('demo-1', lotA('un'));
      m.ticket('demo-2', HORS_DECLARES);
      m.livrer('demo-1');
      m.livrer('demo-2');
      const avant = m.builds().length;
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.builds().slice(avant)).toEqual([]);
    },
    LONG
  );
});

describe('critères 7 et 19 — a guard that reads the build is never left out', () => {
  // A lot the dead-code guard refuses: REFUS-code-mort at the root, with <fichiers>.
  const refuse = (fichiers: Record<string, string>) => ({ ...fichiers, 'REFUS-code-mort': '' });
  it(
    'critère 19: a lot that replays no suite and that the dead-code guard refuses is refused',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', refuse(HORS_DECLARES));
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/code-mort : REFUSÉ/);
      expect(m.sujets()[0]).not.toBe('feat: lot (demo-1)');
    },
    LONG
  );
  it(
    'critère 19: a lot of a component that the dead-code guard refuses is refused at each passage, its suites kept by their traces the second time',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', refuse(lotA('un')));
      const r1 = m.integrer('demo-1');
      expect(r1.status, r1.stdout + r1.stderr).toBe(1);
      const avant = m.joues().length;
      const r2 = m.integrer('demo-1');
      expect(jouesDepuis(m, avant), 'the second passage reads its suites from the traces').toEqual(
        []
      );
      expect(r2.status, r2.stdout + r2.stderr).toBe(1);
      expect(r2.stdout).toMatch(/code-mort : REFUSÉ/);
      expect(m.sujets()[0]).not.toBe('feat: lot (demo-1)');
    },
    LONG
  );
  it(
    'critère 19: the queue replaying a branch that replays no suite refuses it when the dead-code guard refuses',
    () => {
      const m = chantierTraces();
      m.ticket('demo-1', lotA('un'));
      m.ticket('demo-2', HORS_DECLARES);
      m.livrer('demo-1');
      m.livrer('demo-2');
      // The guard refuses on main from now on: the replacement of demo-2 must meet it.
      m.poser({ 'REFUS-code-mort': '' }, 'refus');
      const r = m.file();
      expect(m.sujets()[0], r.stdout + r.stderr).not.toBe('feat: lot (demo-2)');
      expect(r.stdout + r.stderr).toMatch(/code-mort : REFUSÉ/);
    },
    LONG
  );
});

describe('critère 21 — at the integration, a declared path replays every suite, the root suite included', () => {
  it(
    'critère 21 (garde): a lot that changes a path the project declares read replays every suite and the root suite after its lot',
    () => {
      const m = chantierTraces({ lusParLesSuites: ['config'] });
      m.ticket('demo-1', { 'config/reglage.json': '{"x":1}\n' });
      const avant = m.joues().length;
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const joues = jouesDepuis(m, avant);
      for (const f of [
        'src/a/a.spec.ts',
        'src/b/b.spec.ts',
        'src/c/c.spec.ts',
        'tests/unit/r.spec.ts',
      ]) {
        expect(joues, f).toContain(f);
      }
    },
    LONG
  );
});

// A text with its line breaks and indentation folded into single spaces, its comment markers gone.
const plat = (f: string) =>
  readFileSync(path.join(RACINE, f), 'utf8')
    .replace(/^\s*(\/\/|#)\s?/gm, '')
    .replace(/\s+/g, ' ');

describe('critère 17 — the rule « a file outside every component replays every suite » leaves the texts', () => {
  it.each([
    '.claude/skills/integrateur/SKILL.md',
    '.claude/skills/grill/SKILL.md',
    'scripts/integration/integrer.mjs',
    'scripts/integration/rejeu.mjs',
  ])('critère 17: %s no longer says a file outside every component replays every suite', f => {
    const t = plat(f);
    const regle = [
      /hors de tout composant[^.;]*rejoue toutes/,
      /toutes les suites pour un lot qui touche un fichier hors de tout composant/,
      /every suite for a lot touching a file outside every component/,
      /a file outside every component that is not a document: every suite/,
    ];
    expect(regle.flatMap(r => t.match(r) ?? [])).toEqual([]);
  });
});

describe('critère 20 — Grillhouse declares scripts/ and its test settings read by its suites; its documentation replays nothing', () => {
  const declares = () =>
    (
      JSON.parse(readFileSync(path.join(RACINE, 'package.json'), 'utf8')) as {
        grillhouse?: { lusParLesSuites?: string[] };
      }
    ).grillhouse?.lusParLesSuites ?? [];
  const nu = (p: string) => p.replace(/^\.\//, '').replace(/\/$/, '');
  // A path is covered when a declared path is it or one of its folders.
  const couvert = (f: string) =>
    declares()
      .map(nu)
      .some(d => f === d || f.startsWith(`${d}/`));
  it('critère 20: grillhouse.lusParLesSuites names scripts/ and vitest.config.ts, each present', () => {
    const d = declares().map(nu);
    expect(d).toEqual(expect.arrayContaining(['scripts', 'vitest.config.ts']));
    for (const p of d) {
      expect(existsSync(path.join(RACINE, p)), p).toBe(true);
    }
  });
  it.each(['.claude/grillhouse/fichiers.txt', '.beads/hooks/pre-push', 'tsdoc.json'])(
    'critère 20: the declaration covers %s, a file the tests of Grillhouse read',
    f => {
      expect(existsSync(path.join(RACINE, f)), f).toBe(true);
      expect(couvert(f), f).toBe(true);
    }
  );
  it('critère 20 (garde): no declared path is documentation (a *.md, docs/, the skills and agents of .claude/)', () => {
    for (const p of declares().map(nu)) {
      expect(p, p).not.toMatch(/\.md$|^docs(\/|$)|^\.claude(\/(skills|agents)(\/|$)|$)/);
    }
  });
});
