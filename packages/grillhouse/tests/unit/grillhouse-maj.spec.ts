import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LIGNE_ETAT, mettreAJour, rapport, regenerer } from '../../scripts/grillhouse-maj.mjs';
import { CONFIGURATION as CONFIG_DES_FRONTIERES } from '../../scripts/frontieres.mjs';
import { GARDES_DU_CADRE } from '../../scripts/gardes-du-cadre.mjs';
import { cheminSysteme, claudeSubstitut, paquetInstalle } from '../claude-substitut.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'grillhouse-maj-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const json = (racine: string, f: string) => JSON.parse(lire(racine, f)) as Record<string, unknown>;
const crochet = (command: string, matcher?: string) => ({
  ...(matcher ? { matcher } : {}),
  hooks: [{ type: 'command', command }],
});

function source(fichiers: Record<string, string>) {
  const s = mkdtempSync(path.join(ESSAIS, 'cadre-'));
  for (const [f, t] of Object.entries(fichiers)) {
    ecrire(s, f, t);
  }
  return s;
}

// grillhouse-3uv.55: the update writes the frame's controls, `grillhouse:gardes`, the one list of
// them, into the project it installs. The frame is this repository: the package.json of its
// template of a project (templates/projet/) holds the frame's scripts and tools (grillhouse-3uv.84.4). Turborepo plays that list after the build, beside the tests (turbo.json, npm run verifier).
const DEPOT = path.resolve(__dirname, '../../../..');
const GARDES = 'npm run --silent grillhouse:gardes';
// The controls of the frame, in the order of the list grillhouse:gardes plays
// (scripts/gardes-du-cadre.mjs, critère 1); the build is not among them: Turborepo builds before
// them.
const APPEL_DES_GARDES = 'grillhouse gardes-du-cadre';
const etapesDesGardes = () =>
  GARDES_DU_CADRE.map(
    ([f, ...args]) => `grillhouse ${[path.basename(f, '.mjs'), ...args].join(' ')}`
  );
const CONTROLES: [string, RegExp][] = [
  ['turbo.json des paquets', /^grillhouse turbo-des-paquets$/],
  ['index des interfaces', /^grillhouse index-interfaces --verifier$/],
  ['consommateurs', /^grillhouse consommateurs$/],
  ['consommateurs arbitrés', /^grillhouse consommateurs-arbitres$/],
  ['frontières', /^grillhouse frontieres$/],
  ['interfaces contre code', /^grillhouse interfaces-contre-code$/],
  ['résumés courts', /^grillhouse resumes$/],
  ['code mort', /^grillhouse code-mort$/],
];

const GABARIT = 'templates/projet/package.json';
const VERSION = (
  JSON.parse(readFileSync(path.join(DEPOT, 'packages/grillhouse/package.json'), 'utf8')) as {
    version: string;
  }
).version;
const gabarit = () =>
  (
    JSON.parse(readFileSync(path.join(DEPOT, GABARIT), 'utf8')) as {
      scripts: Record<string, string>;
    }
  ).scripts;

// grillhouse-3uv.80 critère 2: `test:vitest` calls the Vitest of the project's root. A Vitest at the
// root of <projet>: the frame's own (2.1.9, this repository's node_modules) when <version> is
// absent, else a stand-in package of that version, whose command answers `--version` as Vitest
// does (« vitest/<version> <platform>-<arch> node-<version> »). The project has run `npm install`:
// its command is the frame's package's, which runs the generators.
function vitestALaRacine(projet: string, version?: string) {
  const nm = path.join(projet, 'node_modules');
  mkdirSync(path.join(nm, '.bin'), { recursive: true });
  symlinkSync(
    path.join(DEPOT, 'packages/grillhouse/bin/grillhouse.mjs'),
    path.join(nm, '.bin', 'grillhouse')
  );
  if (version === undefined) {
    symlinkSync(path.join(DEPOT, 'node_modules', 'vitest'), path.join(nm, 'vitest'), 'dir');
  } else {
    ecrire(
      nm,
      'vitest/package.json',
      `${JSON.stringify({ name: 'vitest', version, type: 'module', main: 'index.js', bin: { vitest: 'vitest.mjs' } }, null, 2)}\n`
    );
    ecrire(nm, 'vitest/index.js', 'export {};\n');
    ecrire(
      nm,
      'vitest/vitest.mjs',
      `#!/usr/bin/env node\nconsole.log(\`vitest/${version} \${process.platform}-\${process.arch} node-\${process.version}\`);\n`
    );
    chmodSync(path.join(nm, 'vitest/vitest.mjs'), 0o755);
  }
  symlinkSync('../vitest/vitest.mjs', path.join(nm, '.bin', 'vitest'));
}

// A project with `pkg` as its package.json (none when null), brought to the frame of this
// repository. Returns its directory and its scripts after the update.
function installe(pkg: Record<string, unknown> | null, o: { vitest?: boolean } = {}) {
  const projet = mkdtempSync(path.join(ESSAIS, 'installe-'));
  if (o.vitest) {
    vitestALaRacine(projet);
  }
  if (pkg) {
    ecrire(projet, 'package.json', `${JSON.stringify(pkg, null, 2)}\n`);
  }
  mettreAJour(projet, DEPOT);
  const scripts = () => (json(projet, 'package.json').scripts ?? {}) as Record<string, string>;
  return { projet, scripts };
}

describe('grillhouse-3uv.55 critère 1 — the update writes grillhouse:gardes', () => {
  it('critère 1: grillhouse:gardes plays the controls of the frame, in the order of the template, without a build step', () => {
    const g =
      installe({ name: 'p', scripts: { test: 'vitest run' } }).scripts()['grillhouse:gardes'] ?? '';
    expect(g).toBe(APPEL_DES_GARDES);
    const etapes = etapesDesGardes();
    expect(etapes).toHaveLength(CONTROLES.length);
    CONTROLES.forEach(([nom, motif], i) => expect(etapes[i], nom).toMatch(motif));
    expect(etapes.join(' ')).not.toMatch(/\bbuild\b/);
  });
  it('the update writes the commands of the known debt of the guards, the frame’s own', () => {
    const g = installe({
      name: 'p',
      scripts: { 'grillhouse:dette:inscrire': 'echo à moi' },
    }).scripts();
    for (const nom of ['grillhouse:dette:inscrire', 'grillhouse:dette:elaguer']) {
      expect(g[nom], nom).toBe(gabarit()[nom]);
      expect(g[nom], nom).toMatch(/GRILLHOUSE_DETTE=/);
    }
  });
  it("critère 1: a project's own grillhouse:gardes gives way to the frame's", () => {
    const g = installe({ name: 'p', scripts: { 'grillhouse:gardes': 'echo à moi' } }).scripts();
    expect(g['grillhouse:gardes']).toBe(gabarit()['grillhouse:gardes']);
    expect(g['grillhouse:gardes']).not.toBe('echo à moi');
  });
  it("critère 1: the project's other scripts stay, the frame's tableau and grillhouse:maj with them", () => {
    const s = installe({ name: 'p', scripts: { test: 'vitest run', lint: 'eslint .' } }).scripts();
    expect(s.lint).toBe('eslint .');
    expect(s.tableau).toBe('grillhouse tableau --texte');
    expect(s['grillhouse:maj']).toBe('grillhouse maj');
    expect(s['grillhouse:gardes']).toBeTypeOf('string');
  });
  it('critère 1: a project without package.json gets none from the update', () => {
    const { projet } = installe(null);
    expect(existsSync(path.join(projet, 'package.json'))).toBe(false);
  });
});

describe('grillhouse-3uv.55 critère 4 — the template holds grillhouse:gardes: one list', () => {
  it('critère 4: the template has no pretest: Turborepo plays the guards (turbo.json)', () => {
    expect(gabarit()).not.toHaveProperty('pretest');
  });
  it('critère 4: grillhouse:gardes of the template plays the controls in the order of critère 1', () => {
    expect(gabarit()['grillhouse:gardes']).toBe(APPEL_DES_GARDES);
    const etapes = etapesDesGardes();
    expect(etapes).toHaveLength(CONTROLES.length);
    CONTROLES.forEach(([nom, motif], i) => expect(etapes[i], nom).toMatch(motif));
  });
  it('critère 4: the update writes grillhouse:gardes exactly as the template holds it', () => {
    const g = gabarit()['grillhouse:gardes'];
    expect(g).toBeTypeOf('string');
    expect(installe({ name: 'p', scripts: {} }).scripts()['grillhouse:gardes']).toBe(g);
  });
});

describe('grillhouse-3uv.55 critère 5 — a replayed update changes nothing', () => {
  const cas: [string, Record<string, unknown>][] = [
    ['without pretest', { name: 'p', scripts: { test: 'vitest run' } }],
    ['without scripts', { name: 'p' }],
    ['with a pretest of its own', { name: 'p', scripts: { pretest: 'node mien.mjs' } }],
    ['with the frame’s former pretest', { name: 'p', scripts: { pretest: GARDES } }],
  ];
  for (const [nom, pkg] of cas) {
    it(`critère 5: a project ${nom} keeps its package.json byte for byte on a second update`, () => {
      const { projet } = installe(pkg);
      const premier = lire(projet, 'package.json');
      mettreAJour(projet, DEPOT);
      expect(lire(projet, 'package.json')).toBe(premier);
    });
  }
});

// A source of the frame of one file, whose template's package.json is `pkg` (none when null).
function sourceAvec(pkg: Record<string, unknown> | null) {
  return source({
    'mods/grillhouse/METACADRE.md': 'meta',
    ...(pkg ? { [GABARIT]: JSON.stringify(pkg, null, 2) } : {}),
  });
}
// A project with `pkg` as its package.json, brought to the frame at `src`; its scripts after.
function installeDepuis(src: string, pkg: Record<string, unknown>) {
  const projet = mkdtempSync(path.join(ESSAIS, 'installe-'));
  ecrire(projet, 'package.json', `${JSON.stringify(pkg, null, 2)}\n`);
  mettreAJour(projet, src);
  return {
    projet,
    scripts: (json(projet, 'package.json').scripts ?? {}) as Record<string, string>,
  };
}

describe('grillhouse-3uv.55 critère 6 — the update reads grillhouse:gardes in the source', () => {
  it('critère 6: a source whose grillhouse:gardes differs from the template has it written as it is', () => {
    const autre = 'node scripts/x.mjs && node scripts/y.mjs --strict';
    const src = sourceAvec({ name: 'cadre', scripts: { 'grillhouse:gardes': autre } });
    const { scripts } = installeDepuis(src, { name: 'p', scripts: { test: 'vitest run' } });
    expect(scripts['grillhouse:gardes']).toBe(autre);
    expect(scripts).not.toHaveProperty('pretest');
  });
  it("critère 6: another source, one control only, has it written as it is over the project's own", () => {
    const src = sourceAvec({ scripts: { 'grillhouse:gardes': 'node seul.mjs' } });
    const { scripts } = installeDepuis(src, {
      name: 'p',
      scripts: { 'grillhouse:gardes': 'echo à moi', pretest: 'node mien.mjs' },
    });
    expect(scripts['grillhouse:gardes']).toBe('node seul.mjs');
    expect(scripts.pretest).toBe('node mien.mjs');
  });
  it('critère 6: a source without package.json writes no grillhouse:gardes', () => {
    const { scripts } = installeDepuis(sourceAvec(null), {
      name: 'p',
      scripts: { test: 'vitest run' },
    });
    expect(scripts).not.toHaveProperty('grillhouse:gardes');
    expect(scripts.tableau).toBe('grillhouse tableau --texte');
  });
  it('critère 6: a source whose package.json holds no grillhouse:gardes writes none', () => {
    const src = sourceAvec({
      name: 'cadre',
      scripts: { test: 'vitest run', pretest: 'node a.mjs' },
    });
    const { scripts } = installeDepuis(src, { name: 'p', scripts: { test: 'vitest run' } });
    expect(scripts).not.toHaveProperty('grillhouse:gardes');
    expect(scripts).not.toHaveProperty('pretest');
  });
  it("critère 6: a source without grillhouse:gardes leaves the project's grillhouse:gardes as it is", () => {
    const { scripts } = installeDepuis(sourceAvec({ name: 'cadre' }), {
      name: 'p',
      scripts: { pretest: 'node mien.mjs', 'grillhouse:gardes': 'echo à moi' },
    });
    expect(scripts.pretest).toBe('node mien.mjs');
    expect(scripts['grillhouse:gardes']).toBe('echo à moi');
  });
  it('critère 6: a source without package.json adds tableau, grillhouse:maj and the prepare of the git hooks (grillhouse-3uv.84.5), nothing else', () => {
    const v = sourceAvec(null);
    const { scripts } = installeDepuis(v, { name: 'p', scripts: { test: 'vitest' } });
    expect(Object.keys(scripts).sort()).toEqual(['grillhouse:maj', 'prepare', 'tableau', 'test']);
  });
});

// The frame's former wiring of the guards (a pretest calling grillhouse:gardes, an
// integration:gardes script) goes: Turborepo plays the guards (turbo.json). A pretest of the
// project's own stays; its own guards, which the former integration played by
// `integration:gardes`, move to `gardes`, the root script `npm run verifier` plays (BPScript: its 13
// guards were played no more).
describe('the update removes the frame’s former wiring of the guards', () => {
  it('a pretest that is the frame’s call is removed', () => {
    expect(installe({ name: 'p', scripts: { pretest: GARDES } }).scripts()).not.toHaveProperty(
      'pretest'
    );
  });
  it('a pretest headed by the frame’s call loses that head, the rest kept', () => {
    const avant = `${GARDES} && node a.mjs && node b.mjs --strict`;
    const s = installe({ name: 'p', scripts: { pretest: avant } }).scripts();
    expect(s.pretest).toBe('node a.mjs && node b.mjs --strict');
  });
  it.each([
    ['a step of its own', 'node mien.mjs'],
    ['another form of the call', 'npm run -s grillhouse:gardes'],
    ['the call mid-chain', 'node a.mjs && npm run --silent grillhouse:gardes'],
  ])('a pretest of the project (%s) stays as it is', (_nom, pretest) => {
    expect(installe({ name: 'p', scripts: { pretest } }).scripts().pretest).toBe(pretest);
  });
  it('a project without pretest receives none', () => {
    expect(installe({ name: 'p', scripts: { test: 'vitest run' } }).scripts()).not.toHaveProperty(
      'pretest'
    );
    expect(installe({ name: 'p' }).scripts()).not.toHaveProperty('pretest');
  });
  it.each(['npm run --silent pretest', 'node scripts/integration/gardes.mjs', GARDES])(
    'an integration:gardes left at the frame’s former command (%s) is removed',
    ancien => {
      const s = installe({ name: 'p', scripts: { 'integration:gardes': ancien } }).scripts();
      expect(s).not.toHaveProperty('integration:gardes');
      expect(s).not.toHaveProperty('gardes');
    }
  );
  it.each([
    ['a script of its own', 'node scripts/mes-gardes.mjs', 'node scripts/mes-gardes.mjs'],
    [
      'the old wiring with a step of its own',
      'npm run --silent pretest && node scripts/mien.mjs',
      'node scripts/mien.mjs',
    ],
  ])(
    'an integration:gardes of the project’s own (%s) becomes its gardes',
    (_nom, propre, gardes) => {
      const s = installe({ name: 'p', scripts: { 'integration:gardes': propre } }).scripts();
      expect(s).not.toHaveProperty('integration:gardes');
      expect(s.gardes).toBe(gardes);
    }
  );
  it('an integration:gardes beside a gardes of the project stays, and the report names it', () => {
    const { projet, scripts } = installe({
      name: 'p',
      scripts: { 'integration:gardes': 'node a.mjs', gardes: 'node b.mjs' },
    });
    expect(scripts()).toMatchObject({ 'integration:gardes': 'node a.mjs', gardes: 'node b.mjs' });
    const b = mettreAJour(projet, DEPOT);
    expect(b.gardes).toEqual({ deplace: false });
  });
  it('the report says the move of integration:gardes to gardes, once', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'gardes-'));
    ecrire(projet, 'package.json', '{"name":"p","scripts":{"integration:gardes":"node a.mjs"}}\n');
    expect(mettreAJour(projet, DEPOT).gardes).toEqual({ deplace: true });
    expect(mettreAJour(projet, DEPOT).gardes).toBeNull();
  });
  it('an integration:gardes headed by the frame’s call loses that head, the rest becoming gardes', () => {
    const s = installe({
      name: 'p',
      scripts: { 'integration:gardes': `${GARDES} && bash scripts/mes-gardes.sh` },
    }).scripts();
    expect(s).not.toHaveProperty('integration:gardes');
    expect(s.gardes).toBe('bash scripts/mes-gardes.sh');
  });
  it('the removal holds on a second update, byte for byte', () => {
    const { projet } = installe({
      name: 'p',
      scripts: { pretest: `${GARDES} && node mien.mjs`, 'integration:gardes': GARDES },
    });
    const premier = lire(projet, 'package.json');
    mettreAJour(projet, DEPOT);
    expect(lire(projet, 'package.json')).toBe(premier);
  });
});

// The update brings Turborepo into the project: its devDependency, the packageManager it
// requires, a turbo.json of the project's own written once from the frame's template of its form,
// and `.turbo/` ignored by git.
const SANS_PAQUETS = 'templates/turbo/sans-paquets.json';
const PAQUETS = 'templates/turbo/paquets.json';
type Taches = Record<string, { dependsOn?: string[]; env?: string[]; outputs?: string[] }>;
const taches = (racine: string, f: string) => (json(racine, f) as { tasks: Taches }).tasks;
describe('the update installs Turborepo', () => {
  it('the template without packages: the build, then the guards and the tests beside each other', () => {
    expect(taches(DEPOT, SANS_PAQUETS)).toEqual({
      build: { outputs: ['dist/**'] },
      'grillhouse:gardes': { dependsOn: ['build'], outputs: [] },
      gardes: { dependsOn: ['build'], outputs: [] },
      'test:vitest': { dependsOn: ['build'], env: ['GRILLHOUSE_TESTS'], outputs: [] },
    });
  });
  it('the template with packages: each package builds after its dependencies and tests after its own build and theirs, the root plays the guards, whose dependsOn the generator writes', () => {
    expect(taches(DEPOT, PAQUETS)).toEqual({
      build: { dependsOn: ['^build'], outputs: ['dist/**'] },
      'test:vitest': { dependsOn: ['build', '^build'], env: ['GRILLHOUSE_TESTS'], outputs: [] },
      '//#grillhouse:gardes': { dependsOn: [], outputs: [] },
      '//#gardes': { dependsOn: [], outputs: [] },
    });
  });
  it('Grillhouse’s own turbo.json follows the template with packages: its tests do not wait for its guards', () => {
    expect(json(DEPOT, 'turbo.json')).toEqual(json(DEPOT, PAQUETS));
  });
  it('a project without workspaces and without turbo.json receives the template without packages', () => {
    const { projet } = installe({ name: 'p' });
    expect(lire(projet, 'turbo.json')).toBe(lire(DEPOT, SANS_PAQUETS));
  });
  it('a project that declares workspaces receives the template with packages', () => {
    const { projet } = installe({ name: 'p', private: true, workspaces: ['packages/*'] });
    expect(lire(projet, 'turbo.json')).toBe(lire(DEPOT, PAQUETS));
  });
  it('the update writes the turbo.json of each package, whose build waits for its runtime dependencies only (BPScript 322.12)', () => {
    const { projet } = installe({ name: 'p', private: true, workspaces: ['packages/*'] });
    // The project has run `npm install`: the frame's tools (jsonc-parser) are installed.
    symlinkSync(path.join(DEPOT, 'node_modules'), path.join(projet, 'node_modules'), 'dir');
    ecrire(projet, 'packages/x/package.json', '{"name":"x","scripts":{"build":"tsc"}}\n');
    ecrire(
      projet,
      'packages/y/package.json',
      '{"name":"y","scripts":{"build":"tsc"},"dependencies":{"x":"*"},"devDependencies":{"z":"*"}}\n'
    );
    ecrire(
      projet,
      'packages/z/package.json',
      '{"name":"z","scripts":{"build":"tsc"},"dependencies":{"y":"*"}}\n'
    );
    expect(regenerer(projet)).toEqual([]);
    const build = (f: string) =>
      (
        JSON.parse(lire(projet, f).replace(/^\/\/.*\n/, '')) as {
          tasks: { build: { dependsOn: string[] } };
        }
      ).tasks.build.dependsOn;
    expect(build('packages/x/turbo.json')).toEqual([]);
    expect(build('packages/y/turbo.json')).toEqual(['x#build']);
    expect(build('packages/z/turbo.json')).toEqual(['y#build']);
    // The root keeps the template, the tests waiting for everything they import; its guard tasks
    // wait for every build of the frame (BPScript: a stale dist/ gave a cached green).
    const racine = taches(projet, 'turbo.json');
    expect(racine).toEqual({
      ...taches(DEPOT, PAQUETS),
      '//#grillhouse:gardes': { dependsOn: ['x#build', 'y#build', 'z#build'], outputs: [] },
      '//#gardes': { dependsOn: ['x#build', 'y#build', 'z#build'], outputs: [] },
    });
  });
  it('before `npm install`, the project has no command: the generator’s failure names npm install', () => {
    const { projet } = installe({ name: 'p', private: true, workspaces: ['packages/*'] });
    const [ligne, ...autres] = regenerer(projet);
    expect(autres).toEqual([]);
    expect(ligne).toContain('npx grillhouse turbo-des-paquets --ecrire');
    expect(ligne).toContain('npm install');
  });
  it('a turbo.json present is never written again, whatever the form of the project', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'turbo-'));
    const propre = '{ "tasks": { "build": {} } }\n';
    ecrire(projet, 'package.json', '{"name":"p","workspaces":["packages/*"]}\n');
    ecrire(projet, 'turbo.json', propre);
    const b = mettreAJour(projet, DEPOT);
    expect(lire(projet, 'turbo.json')).toBe(propre);
    expect(b.turbo).toBeNull();
    mettreAJour(projet, DEPOT);
    expect(lire(projet, 'turbo.json')).toBe(propre);
  });
  it('a project without package.json receives no turbo.json', () => {
    expect(existsSync(path.join(installe(null).projet, 'turbo.json'))).toBe(false);
  });
  it('the report names the template written, once', () => {
    const src = source({
      'mods/grillhouse/METACADRE.md': 'meta',
      [SANS_PAQUETS]: lire(DEPOT, SANS_PAQUETS),
    });
    const projet = mkdtempSync(path.join(ESSAIS, 'turbo-'));
    ecrire(projet, 'package.json', '{"name":"p"}\n');
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`turbo.json écrit depuis le gabarit du cadre ${SANS_PAQUETS}`);
    expect(lancerMaj(projet, src).stdout).not.toContain('turbo.json écrit');
  });
  it('a project receives turbo at the version of the frame', () => {
    const { projet } = installe({ name: 'p' });
    const pkg = json(projet, 'package.json') as { devDependencies?: Record<string, string> };
    expect(pkg.devDependencies?.turbo).toBe(
      (json(DEPOT, 'package.json').devDependencies as Record<string, string>).turbo
    );
  });
  it('a project without packageManager receives the frame’s; one with its own keeps it', () => {
    const cadre = json(DEPOT, 'package.json').packageManager;
    expect(cadre).toBeTypeOf('string');
    expect(json(installe({ name: 'p' }).projet, 'package.json').packageManager).toBe(cadre);
    const propre = installe({ name: 'p', packageManager: 'npm@9.0.0' }).projet;
    expect(json(propre, 'package.json').packageManager).toBe('npm@9.0.0');
  });
  it('a project without .gitignore receives one that ignores .turbo/', () => {
    expect(lire(installe({ name: 'p' }).projet, '.gitignore')).toBe('.turbo/\n');
  });
  it('a .gitignore without .turbo receives the line once, its own lines kept, even without a final newline', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'ignore-'));
    ecrire(projet, 'package.json', '{"name":"p"}\n');
    ecrire(projet, '.gitignore', 'node_modules\ndist');
    mettreAJour(projet, DEPOT);
    expect(lire(projet, '.gitignore')).toBe('node_modules\ndist\n.turbo/\n');
    mettreAJour(projet, DEPOT);
    expect(lire(projet, '.gitignore')).toBe('node_modules\ndist\n.turbo/\n');
  });
  it.each(['.turbo', '/.turbo/'])('a .gitignore that already ignores it (%s) stays as it is', l => {
    const projet = mkdtempSync(path.join(ESSAIS, 'ignore-'));
    ecrire(projet, '.gitignore', `node_modules\n${l}\n`);
    mettreAJour(projet, DEPOT);
    expect(lire(projet, '.gitignore')).toBe(`node_modules\n${l}\n`);
  });
  it('a project that runs Vitest receives test, test:vitest, test:forcer and verifier of the frame, together', () => {
    const s = installe({ name: 'p', scripts: { test: 'vitest run' } }, { vitest: true }).scripts();
    for (const nom of ['test', 'test:vitest', 'test:forcer', 'verifier']) {
      expect(s[nom], nom).toBe(gabarit()[nom]);
    }
  });
  it('verifier of the template is the frame’s script, which reads the code of each task of Turborepo (scripts/verifier.mjs)', () => {
    expect(gabarit().verifier).toBe('grillhouse verifier');
  });
  it('test and test:forcer of the template play the files named from the root, each in its package', () => {
    expect(gabarit().test).toBe('grillhouse tests');
    expect(gabarit()['test:forcer']).toBe('grillhouse tests --force');
  });
  it('a project whose root resolves no Vitest receives none of the four', () => {
    const s = installe({ name: 'p', scripts: { test: 'vitest run' } }).scripts();
    expect(s.test).toBe('vitest run');
    expect(s).not.toHaveProperty('test:vitest');
    expect(s).not.toHaveProperty('test:forcer');
    expect(s).not.toHaveProperty('verifier');
  });
});

// grillhouse-3uv.60: the update writes in the project the script that writes the API reports and
// the development dependencies of the frame's controls, as the template declares them.
// grillhouse-3uv.84.4 critère 5: the tools a project runs as commands (API Extractor, whose TSDoc
// base its tsdoc.json extends; dependency-cruiser; knip; Turborepo); what the package's scripts
// import, the package declares itself.
const DEPENDANCES = ['@microsoft/api-extractor', 'dependency-cruiser', 'knip', 'turbo'];
type Pkg = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
const modele = () => JSON.parse(readFileSync(path.join(DEPOT, GABARIT), 'utf8')) as Pkg;
// The template's package.json, changed by `retouche`, as the package.json of a trial source.
function sourceRetouchee(retouche: (p: Pkg) => void) {
  const p = modele();
  retouche(p);
  return sourceAvec(p as Record<string, unknown>);
}
// The package.json of a project brought to the frame at `src` (this repository by default).
function apresMaj(pkg: Record<string, unknown>, src: string = DEPOT, o: { vitest?: boolean } = {}) {
  const projet = mkdtempSync(path.join(ESSAIS, 'deps-'));
  if (o.vitest) {
    vitestALaRacine(projet);
  }
  ecrire(projet, 'package.json', `${JSON.stringify(pkg, null, 2)}\n`);
  mettreAJour(projet, src);
  return { projet, pkg: json(projet, 'package.json') as Pkg };
}

describe('grillhouse-3uv.60 critère 1 — the update writes api and the dependencies of the controls', () => {
  it('critère 1: the template declares the api script and the three dependencies of the controls', () => {
    const m = modele();
    expect(m.scripts?.api).toBe('grillhouse interfaces-contre-code --ecrire');
    for (const d of DEPENDANCES) {
      expect(m.devDependencies?.[d], d).toBeTypeOf('string');
    }
  });
  it("critère 1: a project receives the template's api script, and the frame's test in place of its own (3uv.75.1 critère 12)", () => {
    // Its root resolves the Vitest the frame requires (grillhouse-3uv.80 critère 2).
    const { pkg } = apresMaj({ name: 'p', scripts: { test: 'vitest run' } }, DEPOT, {
      vitest: true,
    });
    expect(pkg.scripts?.api).toBe(modele().scripts?.api);
    expect(pkg.scripts?.test).toBe(modele().scripts?.test);
    expect(pkg.scripts?.['test:vitest']).toBe(modele().scripts?.['test:vitest']);
    expect(pkg.scripts?.['test:forcer']).toBe(modele().scripts?.['test:forcer']);
  });
  it('critère 1: a project without dependencies receives the three, at the versions of the template', () => {
    const { pkg } = apresMaj({ name: 'p' });
    const m = modele();
    expect(pkg.devDependencies).toEqual(
      Object.fromEntries(DEPENDANCES.map(d => [d, m.devDependencies?.[d]]))
    );
  });
  it("critère 1: none of the template's other dependencies is written", () => {
    const { pkg } = apresMaj({ name: 'p', scripts: {} });
    expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual(DEPENDANCES);
    expect(pkg).not.toHaveProperty('dependencies');
    expect(pkg).not.toHaveProperty('optionalDependencies');
  });
  it("critère 1: the project's own dependencies stay as they are, the three added beside them", () => {
    const { pkg } = apresMaj({
      name: 'p',
      dependencies: { zod: '^3.0.0' },
      devDependencies: { vitest: '^2.0.0' },
    });
    expect(pkg.dependencies).toEqual({ zod: '^3.0.0' });
    expect(pkg.devDependencies?.vitest).toBe('^2.0.0');
    for (const d of DEPENDANCES) {
      expect(pkg.devDependencies?.[d], d).toBe(modele().devDependencies?.[d]);
    }
  });
  it("critère 1: the versions are read in the source — another source's versions are written", () => {
    const versions: Record<string, string> = {
      '@microsoft/api-extractor': '7.1.0',
      'dependency-cruiser': '^16.0.0',
      knip: '5.0.1',
      turbo: '2.0.0',
    };
    const src = sourceRetouchee(p => {
      p.devDependencies = { ...p.devDependencies, ...versions };
    });
    const { pkg } = apresMaj({ name: 'p' }, src);
    expect(pkg.devDependencies).toEqual(versions);
  });
  it('critère 1: a version the project already declares in devDependencies is not overwritten', () => {
    const { pkg } = apresMaj({ name: 'p', devDependencies: { knip: '^5.0.0' } });
    expect(pkg.devDependencies?.knip).toBe('^5.0.0');
    expect(pkg.devDependencies?.['dependency-cruiser']).toBe(
      modele().devDependencies?.['dependency-cruiser']
    );
  });
  it('critère 1: a project without package.json gets none for the dependencies', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'deps-'));
    mettreAJour(projet, DEPOT);
    expect(existsSync(path.join(projet, 'package.json'))).toBe(false);
  });
});

describe('grillhouse-3uv.60 critère 4 — api is written as the frame’s other scripts', () => {
  it("critère 4: the source's api replaces the project's own", () => {
    const { pkg } = apresMaj({ name: 'p', scripts: { api: 'echo à moi' } });
    expect(pkg.scripts?.api).toBe(modele().scripts?.api);
  });
  it("critère 4: another source's api is written as it is", () => {
    const src = sourceRetouchee(p => {
      p.scripts = { ...p.scripts, api: 'node scripts/autre.mjs --rapports' };
    });
    const { pkg } = apresMaj({ name: 'p', scripts: { api: 'echo à moi' } }, src);
    expect(pkg.scripts?.api).toBe('node scripts/autre.mjs --rapports');
  });
  it('critère 4: a source without api writes none', () => {
    const src = sourceRetouchee(p => {
      delete p.scripts?.api;
    });
    const { pkg } = apresMaj({ name: 'p', scripts: { test: 'vitest' } }, src);
    expect(pkg.scripts).not.toHaveProperty('api');
  });
  it("critère 4: a source without api leaves the project's own api as it is", () => {
    const src = sourceRetouchee(p => {
      delete p.scripts?.api;
    });
    const { pkg } = apresMaj({ name: 'p', scripts: { api: 'echo à moi' } }, src);
    expect(pkg.scripts?.api).toBe('echo à moi');
  });
  it('critère 4: a source without package.json writes neither api nor a dependency', () => {
    const { pkg } = apresMaj({ name: 'p', scripts: { test: 'vitest' } }, sourceAvec(null));
    expect(pkg.scripts).not.toHaveProperty('api');
    expect(pkg).not.toHaveProperty('devDependencies');
  });
  it('critère 4: a dependency the source does not declare is not written', () => {
    const src = sourceRetouchee(p => {
      delete p.devDependencies?.knip;
    });
    const { pkg } = apresMaj({ name: 'p' }, src);
    expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual([
      '@microsoft/api-extractor',
      'dependency-cruiser',
      'turbo',
    ]);
  });
  it('critère 4: a source that declares none of the three writes no devDependencies', () => {
    const src = sourceRetouchee(p => {
      for (const d of DEPENDANCES) {
        delete p.devDependencies?.[d];
      }
    });
    const { pkg } = apresMaj({ name: 'p' }, src);
    expect(pkg).not.toHaveProperty('devDependencies');
  });
});

describe('grillhouse-3uv.60 critère 5 — a declared dependency keeps its declaration; devDependencies sorted', () => {
  const champs = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;
  for (const champ of champs) {
    it(`critère 5: a dependency declared in ${champ} keeps its declaration, without a duplicate`, () => {
      const { pkg } = apresMaj({ name: 'p', [champ]: { 'dependency-cruiser': '^15.0.0' } });
      expect(pkg[champ]?.['dependency-cruiser']).toBe('^15.0.0');
      const ailleurs = champs.filter(c => c !== champ);
      for (const c of ailleurs) {
        expect(pkg[c]?.['dependency-cruiser'], c).toBeUndefined();
      }
      expect(pkg.devDependencies?.knip).toBe(modele().devDependencies?.knip);
    });
  }
  it('critère 5: a dependency declared in peerDependencies only receives its development dependency', () => {
    const { pkg } = apresMaj({ name: 'p', peerDependencies: { knip: '>=5' } });
    expect(pkg.peerDependencies).toEqual({ knip: '>=5' });
    expect(pkg.devDependencies?.knip).toBe(modele().devDependencies?.knip);
  });
  it('critère 5: a dependency in peerDependencies and dependencies keeps its declaration only', () => {
    const { pkg } = apresMaj({
      name: 'p',
      peerDependencies: { knip: '>=5' },
      dependencies: { knip: '^5.2.0' },
    });
    expect(pkg.dependencies).toEqual({ knip: '^5.2.0' });
    expect(pkg.devDependencies?.knip).toBeUndefined();
  });
  it('critère 5: devDependencies are written sorted by name, the project’s own among them', () => {
    const { pkg } = apresMaj({
      name: 'p',
      devDependencies: { vitest: '^2.0.0', eslint: '^8.0.0', '@types/node': '^20.0.0' },
    });
    expect(Object.keys(pkg.devDependencies ?? {})).toEqual([
      '@microsoft/api-extractor',
      '@types/node',
      'dependency-cruiser',
      'eslint',
      'knip',
      'turbo',
      'vitest',
    ]);
  });
  it('critère 5: a project already holding the three, unsorted, gets them sorted, versions kept', () => {
    const { pkg } = apresMaj({
      name: 'p',
      devDependencies: {
        knip: '1.0.0',
        'dependency-cruiser': '2.0.0',
        '@microsoft/api-extractor': '3.0.0',
      },
    });
    const m = modele();
    expect(Object.entries(pkg.devDependencies ?? {})).toEqual([
      ['@microsoft/api-extractor', '3.0.0'],
      ['dependency-cruiser', '2.0.0'],
      ['knip', '1.0.0'],
      ['turbo', m.devDependencies?.turbo],
    ]);
  });
});

describe('grillhouse-3uv.60 critère 3 — a replayed update changes nothing', () => {
  const cas: [string, Record<string, unknown>][] = [
    ['without dependencies', { name: 'p', scripts: { test: 'vitest run' } }],
    [
      'holding part of the dependencies at other versions',
      { name: 'p', devDependencies: { knip: '^5.0.0', vitest: '^2.0.0' } },
    ],
    [
      'holding all three at other versions, unsorted',
      {
        name: 'p',
        devDependencies: {
          knip: '1.0.0',
          'dependency-cruiser': '2.0.0',
          '@microsoft/api-extractor': '3.0.0',
        },
      },
    ],
    [
      'declaring them in dependencies, optionalDependencies and peerDependencies',
      {
        name: 'p',
        dependencies: { 'dependency-cruiser': '^15.0.0' },
        optionalDependencies: { '@microsoft/api-extractor': '7.0.0' },
        peerDependencies: { knip: '>=5' },
      },
    ],
    ['with an api script of its own', { name: 'p', scripts: { api: 'echo à moi' } }],
    [
      'with all of these at once',
      {
        name: 'p',
        scripts: { api: 'echo à moi', pretest: 'node mien.mjs' },
        dependencies: { zod: '^3.0.0' },
        devDependencies: { vitest: '^2.0.0', knip: '^5.0.0' },
      },
    ],
  ];
  for (const [nom, pkg] of cas) {
    it(`critère 3: a project ${nom} keeps its package.json byte for byte on a second update`, () => {
      const { projet } = apresMaj(pkg);
      const premier = lire(projet, 'package.json');
      mettreAJour(projet, DEPOT);
      expect(lire(projet, 'package.json')).toBe(premier);
      const p = JSON.parse(premier) as Pkg;
      expect(p.scripts?.api, 'the first update wrote api').toBe(modele().scripts?.api);
    });
  }
  it('critère 3: a replayed update from another source changes nothing either', () => {
    const src = sourceRetouchee(p => {
      p.devDependencies = { ...p.devDependencies, knip: '5.0.1' };
    });
    const { projet } = apresMaj({ name: 'p', devDependencies: { eslint: '^8.0.0' } }, src);
    const premier = lire(projet, 'package.json');
    mettreAJour(projet, src);
    expect(lire(projet, 'package.json')).toBe(premier);
    expect((JSON.parse(premier) as Pkg).devDependencies?.knip).toBe('5.0.1');
  });
});

describe('grillhouse-3uv.60 critère 7 — a dependency a previous version wrote stays when the source drops it', () => {
  it('critère 7: knip, written by a previous update, stays when the new source no longer declares it', () => {
    const { projet } = apresMaj({ name: 'p' });
    const avant = (json(projet, 'package.json') as Pkg).devDependencies?.knip;
    expect(avant, 'the first update wrote knip').toBe(modele().devDependencies?.knip);
    const src = sourceRetouchee(p => {
      delete p.devDependencies?.knip;
    });
    mettreAJour(projet, src);
    const pkg = json(projet, 'package.json') as Pkg;
    expect(pkg.devDependencies?.knip).toBe(avant);
    expect(pkg.devDependencies?.['dependency-cruiser']).toBe(
      modele().devDependencies?.['dependency-cruiser']
    );
  });
  it('critère 7: all three stay when the new source declares none of them', () => {
    const { projet } = apresMaj({ name: 'p', devDependencies: { vitest: '^2.0.0' } });
    const premier = (json(projet, 'package.json') as Pkg).devDependencies;
    expect(Object.keys(premier ?? {}).sort(), 'the first update wrote the three').toEqual(
      [...DEPENDANCES, 'vitest'].sort()
    );
    const src = sourceRetouchee(p => {
      for (const d of DEPENDANCES) {
        delete p.devDependencies?.[d];
      }
    });
    mettreAJour(projet, src);
    expect((json(projet, 'package.json') as Pkg).devDependencies).toEqual(premier);
  });
  it('critère 7: they stay when the new source has no package.json', () => {
    const { projet } = apresMaj({ name: 'p' });
    const premier = (json(projet, 'package.json') as Pkg).devDependencies;
    expect(Object.keys(premier ?? {}).sort(), 'the first update wrote the three').toEqual(
      DEPENDANCES
    );
    mettreAJour(projet, sourceAvec(null));
    expect((json(projet, 'package.json') as Pkg).devDependencies).toEqual(premier);
  });
  it('critère 7: a dependency written from another source stays, at its version, when the next drops it', () => {
    const premiere = sourceRetouchee(p => {
      p.devDependencies = { ...p.devDependencies, knip: '5.0.1' };
    });
    const { projet } = apresMaj({ name: 'p' }, premiere);
    expect((json(projet, 'package.json') as Pkg).devDependencies?.knip).toBe('5.0.1');
    const suivante = sourceRetouchee(p => {
      delete p.devDependencies?.knip;
    });
    mettreAJour(projet, suivante);
    expect((json(projet, 'package.json') as Pkg).devDependencies?.knip).toBe('5.0.1');
  });
});

describe('grillhouse-3uv.60 critère 8 — only the source’s devDependencies are written', () => {
  const champs = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const;
  for (const champ of champs) {
    it(`critère 8: a control dependency the source declares in ${champ} only is not written`, () => {
      const src = sourceRetouchee(p => {
        const v = p.devDependencies?.knip ?? '^6.0.0';
        delete p.devDependencies?.knip;
        p[champ] = { ...(p[champ] ?? {}), knip: v };
      });
      const { pkg } = apresMaj({ name: 'p' }, src);
      expect(pkg.devDependencies?.knip).toBeUndefined();
      for (const c of champs) {
        expect(pkg[c]?.knip, c).toBeUndefined();
      }
      expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual([
        '@microsoft/api-extractor',
        'dependency-cruiser',
        'turbo',
      ]);
    });
  }
  it('critère 8: a source declaring none of the three in devDependencies, all elsewhere, writes no devDependencies', () => {
    const src = sourceRetouchee(p => {
      for (const d of DEPENDANCES) {
        delete p.devDependencies?.[d];
      }
      p.dependencies = { ...(p.dependencies ?? {}), '@microsoft/api-extractor': '7.0.0' };
      p.optionalDependencies = { 'dependency-cruiser': '16.0.0' };
      p.peerDependencies = { knip: '>=5' };
    });
    const { pkg } = apresMaj({ name: 'p' }, src);
    expect(pkg).not.toHaveProperty('devDependencies');
    expect(pkg).not.toHaveProperty('dependencies');
    expect(pkg).not.toHaveProperty('optionalDependencies');
    expect(pkg).not.toHaveProperty('peerDependencies');
  });
  it('critère 8: a dependency the source declares in dependencies and devDependencies is written at its devDependencies version', () => {
    const src = sourceRetouchee(p => {
      p.devDependencies = { ...p.devDependencies, knip: '5.0.1' };
      p.dependencies = { ...(p.dependencies ?? {}), knip: '9.9.9' };
    });
    const { pkg } = apresMaj({ name: 'p' }, src);
    expect(pkg.devDependencies?.knip).toBe('5.0.1');
    expect(pkg).not.toHaveProperty('dependencies');
  });
});

// The update of the trial project from the frame's files at <src>, and its report, as the
// command writes it (`rapport`).
const SCRIPT_MAJ = path.join(DEPOT, 'packages/grillhouse/scripts/grillhouse-maj.mjs');
const lancerMaj = (projet: string, src: string) => ({
  status: 0,
  stdout: rapport(mettreAJour(projet, src)),
  stderr: '',
});

// grillhouse-3uv.84.4 critère 2: the report names the version of the package installed, which the
// project records.
describe('the update names the version of the frame it installs', () => {
  it('the report names the package’s version, and the project records it', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'version-'));
    ecrire(projet, 'package.json', '{ "name": "p" }\n');
    const claude = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')));
    const r = lancerMajAvec(projet, [], claude.bin);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.startsWith(`Cadre ${VERSION}.\n`), r.stdout).toBe(true);
    expect(json(projet, 'package.json').grillhouse).toEqual({ version: VERSION });
  });
});
// A trial project with `pkg` as its package.json, and a one-file source with the template's
// package.json (its file list names no control's file, so the report names a dependency only
// as a dependency).
function projetEtSource(
  pkg: Record<string, unknown> | null,
  retouche: (p: Pkg) => void = () => {},
  o: { vitest?: boolean } = {}
) {
  const projet = mkdtempSync(path.join(ESSAIS, 'bilan-'));
  if (o.vitest) {
    vitestALaRacine(projet);
  }
  if (pkg) {
    ecrire(
      projet,
      'package.json',
      `${JSON.stringify(pkg, null, 2)}
`
    );
  }
  return { projet, src: sourceRetouchee(retouche) };
}
const NPM_INSTALL = /npm install/;

describe('grillhouse-3uv.60 critère 9 — the report names each added dependency and npm install', () => {
  it('critère 9: a project without dependencies hears the three named, and npm install', () => {
    const { projet, src } = projetEtSource({ name: 'p' });
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    for (const d of DEPENDANCES) {
      expect(r.stdout, d).toContain(d);
    }
    expect(r.stdout).toMatch(NPM_INSTALL);
  });
  it('critère 9: only the dependencies added are named — one the project declares is not', () => {
    const { projet, src } = projetEtSource({
      name: 'p',
      dependencies: { knip: '^5.0.0' },
      devDependencies: { 'dependency-cruiser': '^15.0.0' },
    });
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('@microsoft/api-extractor');
    expect(r.stdout).not.toContain('knip');
    expect(r.stdout).not.toContain('dependency-cruiser');
    expect(r.stdout).toMatch(NPM_INSTALL);
  });
  it('critère 9: a dependency declared in peerDependencies only is added, so named', () => {
    const { projet, src } = projetEtSource({
      name: 'p',
      peerDependencies: { knip: '>=5' },
      devDependencies: { '@microsoft/api-extractor': '7.0.0', 'dependency-cruiser': '16.0.0' },
    });
    const r = lancerMaj(projet, src);
    expect(r.stdout).toContain('knip');
    expect(r.stdout).not.toContain('dependency-cruiser');
    expect(r.stdout).toMatch(NPM_INSTALL);
  });
  it('critère 9: an update adding none says nothing of dependencies nor npm install', () => {
    const { projet, src } = projetEtSource({
      name: 'p',
      devDependencies: {
        knip: '1.0.0',
        'dependency-cruiser': '2.0.0',
        '@microsoft/api-extractor': '3.0.0',
        '@microsoft/api-extractor-model': '4.0.0',
        '@microsoft/tsdoc-config': '0.1.0',
        'jsonc-parser': '3.0.0',
        turbo: '2.0.0',
        yaml: '2.0.0',
      },
    });
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    for (const d of DEPENDANCES) {
      expect(r.stdout, d).not.toContain(d);
    }
    expect(r.stdout).not.toMatch(NPM_INSTALL);
  });
  it('critère 9: a replayed update says nothing of dependencies nor npm install', () => {
    const { projet, src } = projetEtSource({ name: 'p' });
    const premier = lancerMaj(projet, src);
    expect(premier.stdout, 'the first update named npm install').toMatch(NPM_INSTALL);
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    for (const d of DEPENDANCES) {
      expect(r.stdout, d).not.toContain(d);
    }
    expect(r.stdout).not.toMatch(NPM_INSTALL);
  });
  it('critère 9: a source declaring none of the three adds none, so says nothing of them', () => {
    const { projet, src } = projetEtSource({ name: 'p' }, p => {
      for (const d of DEPENDANCES) {
        delete p.devDependencies?.[d];
      }
    });
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(NPM_INSTALL);
  });
  it('critère 9: a dependency the source declares outside devDependencies is not named', () => {
    const { projet, src } = projetEtSource({ name: 'p' }, p => {
      delete p.devDependencies?.knip;
      p.dependencies = { ...(p.dependencies ?? {}), knip: '^6.0.0' };
    });
    const r = lancerMaj(projet, src);
    expect(r.stdout).not.toContain('knip');
    expect(r.stdout).toContain('dependency-cruiser');
    expect(r.stdout).toMatch(NPM_INSTALL);
  });
  it('critère 9: a project without package.json hears nothing of npm install', () => {
    const { projet, src } = projetEtSource(null);
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(NPM_INSTALL);
  });
});

// grillhouse-3uv.64 critère 25, grillhouse-3uv.84.4 critère 5: each tool the controls import is
// declared by the package itself, so a project receives none of them from the update.
describe('grillhouse-3uv.84.4 critère 5 — the package declares the tools its scripts import', () => {
  const IMPORTES = [
    '@microsoft/api-extractor-model',
    '@microsoft/tsdoc-config',
    'jsonc-parser',
    'semver',
    'yaml',
  ];
  it.each(IMPORTES)('%s is a dependency of the package, and the update writes it nowhere', nom => {
    const paquet = JSON.parse(lire(DEPOT, 'packages/grillhouse/package.json')) as Pkg;
    expect(paquet.dependencies?.[nom], nom).toBeTypeOf('string');
    const { pkg } = apresMaj({ name: 'p', devDependencies: { vitest: '^2.0.0' } });
    expect(pkg.devDependencies?.[nom]).toBeUndefined();
  });
});

// grillhouse-3uv.75.1 critère 12 (Q6): one command launches the tests, `npm test`, Turborepo's
// task; the update of the frame poses the frame's test in a project that has its own (BPScript),
// and says so in its report. grillhouse-3uv.80 critère 2: the project's root resolves the Vitest
// the frame requires (2.1.9 here, the frame's own), else it keeps its test.
const TEST_DU_CADRE = 'grillhouse tests';
describe('grillhouse-3uv.75.1 critère 12 — the update poses the frame’s test in a project that has its own, and says so', () => {
  it('critère 12: the test script of the template plays Turborepo’s task (scripts/tests.mjs)', () => {
    expect(gabarit().test).toBe(TEST_DU_CADRE);
  });
  it('critère 12: a project whose test is its own receives the frame’s test', () => {
    const s = installe(
      { name: 'p', scripts: { test: 'vitest run --project mien' } },
      { vitest: true }
    ).scripts();
    expect(s.test).toBe(gabarit().test);
  });
  it('critère 12: the report of the update says that the frame’s test replaces the project’s', () => {
    const { projet, src } = projetEtSource(
      { name: 'p', scripts: { test: 'vitest run --project mien' } },
      () => {},
      { vitest: true }
    );
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(TEST_DU_CADRE);
    expect(r.stdout).toMatch(/\btest\b/);
  });
  // Arbitrage of the supervisor (constat 2 of the review): a project is known to Vitest when vitest
  // is in the dependencies or devDependencies of its root package.json or of one of its
  // workspaces; it then receives the frame's test, whatever the text of its own.
  it('critère 12: a project that declares vitest in a workspace alone (BPScript) receives the frame’s test, whatever the text of its own, and the report says so', () => {
    const propre = 'bash scripts/suites-des-paquets.sh';
    const { projet, src } = projetEtSource(
      { name: 'p', private: true, workspaces: ['packages/*'], scripts: { test: propre } },
      () => {},
      { vitest: true }
    );
    ecrire(
      projet,
      'packages/moteur/package.json',
      `${JSON.stringify({ name: 'moteur', devDependencies: { vitest: '^2.0.0' } }, null, 2)}\n`
    );
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    expect((json(projet, 'package.json').scripts as Record<string, string>).test).toBe(
      TEST_DU_CADRE
    );
    expect(r.stdout).toContain(TEST_DU_CADRE);
    // Its tests live in its packages, as Turborepo keeps them: the root gets no test:vitest.
    expect(json(projet, 'package.json').scripts).not.toHaveProperty('test:vitest');
  });
  it('a project of workspaces loses the frame’s root test:vitest and keeps one of its own', () => {
    const cadre = (json(DEPOT, 'package.json').scripts as Record<string, string>)['test:vitest'];
    for (const [racine, attendu] of [
      [cadre, undefined],
      ['vitest run --project racine', 'vitest run --project racine'],
    ] as const) {
      const { projet, src } = projetEtSource(
        {
          name: 'p',
          private: true,
          workspaces: ['packages/*'],
          scripts: { test: TEST_DU_CADRE, 'test:vitest': racine },
        },
        () => {},
        { vitest: true }
      );
      ecrire(
        projet,
        'packages/moteur/package.json',
        `${JSON.stringify({ name: 'moteur', devDependencies: { vitest: '^2.0.0' } }, null, 2)}\n`
      );
      const r = lancerMaj(projet, src);
      expect(r.status, r.stderr).toBe(0);
      expect((json(projet, 'package.json').scripts as Record<string, string>)['test:vitest']).toBe(
        attendu
      );
    }
  });
  it('critère 12: a project whose test is already the frame’s keeps it, and the report says nothing of it', () => {
    const { projet, src } = projetEtSource(
      { name: 'p', scripts: { test: TEST_DU_CADRE } },
      () => {},
      { vitest: true }
    );
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    expect((json(projet, 'package.json').scripts as Record<string, string>).test).toBe(
      TEST_DU_CADRE
    );
    expect(r.stdout).not.toContain(TEST_DU_CADRE);
    expect(r.stdout).not.toContain('Vitest :');
  });
});

// grillhouse-3uv.76: the update as a project runs it, `claude` stood in (tests/claude-substitut.ts),
// git and node from the system: no test reaches the real claude nor the network.
// The update runs from the package the project installed, whose directory is the marketplace of the
// frame's plugin (grillhouse-3uv.84.7).
function lancerMajAvec(projet: string, args: string[], bin: string) {
  paquetInstalle(projet);
  return spawnSync(process.execPath, [SCRIPT_MAJ, ...args], {
    cwd: projet,
    encoding: 'utf8',
    env: { PATH: cheminSysteme(bin), HOME: mkdtempSync(path.join(ESSAIS, 'maison-')) },
    timeout: 120_000,
  });
}

// Every file under <racine> with its content: what an update may have changed.
function contenu(racine: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parcourir = (rel: string) => {
    for (const e of readdirSync(path.join(racine, rel), { withFileTypes: true })) {
      const f = path.join(rel, e.name);
      if (e.isDirectory()) {
        parcourir(f);
      } else {
        out[f] = readFileSync(path.join(racine, f), 'utf8');
      }
    }
  };
  parcourir('.');
  return out;
}

// Witness: BPScript (322.10), whose settings hold enabledPlugins before statusLine; the install of
// the plugins (`claude plugin install … --scope project`) rewrote them in Claude Code's own order.
describe('grillhouse-3uv.76 critère 1 — the update keeps the order of the settings’ keys after the plugins’ install', () => {
  it('critère 1: after the install of the plugins, the settings keep the project’s key order, and a replayed update leaves them byte for byte', () => {
    const PLUGIN = 'p@m';
    const REGLAGES = '.claude/settings.json';
    const projet = mkdtempSync(path.join(ESSAIS, 'greffons-ordre-'));
    // The project's own order, not Claude Code's: enabledPlugins first, statusLine after.
    const ordre = [
      'enabledPlugins',
      'hooks',
      'extraKnownMarketplaces',
      'permissions',
      'statusLine',
      'model',
    ];
    ecrire(
      projet,
      REGLAGES,
      `${JSON.stringify(
        {
          enabledPlugins: { [PLUGIN]: true },
          hooks: { SessionStart: [crochet('debut')] },
          extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'x/m' } } },
          permissions: { allow: ['Bash(ls)'] },
          statusLine: { type: 'command', command: 'ligne' },
          model: 'opus',
        },
        null,
        2
      )}\n`
    );
    const installs = (c: ReturnType<typeof claudeSubstitut>) =>
      c.appels().filter(a => a.argv[0] === 'plugin' && a.argv[1] === 'install');

    // The install of the plugin rewrites the settings in Claude Code's order: the project's stays.
    const premier = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')), { marches: ['m'] });
    const r1 = lancerMajAvec(projet, [], premier.bin);
    expect(r1.status, r1.stderr).toBe(0);
    // The project's plugin and the frame's, which the update declares (grillhouse-3uv.84.7).
    expect(installs(premier).length, 'the plugins are installed').toBe(2);
    const apres = lire(projet, REGLAGES);
    expect(Object.keys(JSON.parse(apres) as object)).toEqual(ordre);

    // Replayed (the content does not change), the plugin installed again: the file stays as it is.
    const second = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')), { marches: ['m'] });
    const r2 = lancerMajAvec(projet, [], second.bin);
    expect(r2.status, r2.stderr).toBe(0);
    expect(installs(second).length, 'the plugins are installed').toBe(2);
    expect(lire(projet, REGLAGES)).toBe(apres);
  });
});

// Witness: BPScript (322.10), brought to fc9fe55, whose .dependency-cruiser.cjs, written by the
// previous scripts/frontieres.mjs, was refused as stale by the boundaries check. The generators the
// update can run on the sources alone (arbitrage of the ticket): scripts/frontieres.mjs --ecrire
// and scripts/index-interfaces.mjs, whose outputs grillhouse:gardes refuses when stale.
describe('grillhouse-3uv.76 critère 2 — the update regenerates what a frame generator it replaces produces', () => {
  it('critère 2: after the update, .dependency-cruiser.cjs and docs/agents/index-des-interfaces.md are what the package’s generators write, and their checks accept them', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'generateur-'));
    ecrire(projet, 'package.json', `${JSON.stringify({ name: 'p' }, null, 2)}\n`);
    ecrire(projet, 'packages/moteur/package.json', `${JSON.stringify({ name: 'moteur' })}\n`);
    ecrire(projet, 'packages/moteur/src/index.ts', 'export const x = 1;\n');
    ecrire(
      projet,
      'packages/moteur/docs/INTERFACE.md',
      '# moteur\n\nLe moteur rend le son.\n\n## Consommateurs\n\n- aucun\n'
    );
    // What previous generators wrote.
    const generes = {
      [CONFIG_DES_FRONTIERES]: {
        generateur: path.join(DEPOT, 'packages/grillhouse/scripts/frontieres.mjs'),
        ecrire: ['--ecrire'],
        verifier: [] as string[],
        perime: '// Généré par une version précédente.\nmodule.exports = { forbidden: [] };\n',
      },
      'docs/agents/index-des-interfaces.md': {
        generateur: path.join(DEPOT, 'packages/grillhouse/scripts/index-interfaces.mjs'),
        ecrire: [] as string[],
        verifier: ['--verifier'],
        perime: '# Index des interfaces\n\nGénéré par une version précédente.\n',
      },
    };
    for (const [fichier, g] of Object.entries(generes)) {
      ecrire(projet, fichier, g.perime);
    }
    const claude = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')), {
      plugins: [],
      marches: [],
      echecsInstall: [],
    });
    // The project's tools are its installed devDependencies (the update declares dependency-cruiser
    // there) and its package, whose command runs the generators: the frame's node_modules stands
    // for them. The checks run with node and npx alone on the PATH and an empty global prefix (npx
    // --no-install also takes the global packages), so no tool installed on the machine stands in
    // for the project's.
    symlinkSync(path.join(DEPOT, 'node_modules'), path.join(projet, 'node_modules'), 'dir');
    lancerMajAvec(projet, [], claude.bin);
    const noeudSeul = mkdtempSync(path.join(ESSAIS, 'noeud-'));
    symlinkSync(process.execPath, path.join(noeudSeul, 'node'));
    symlinkSync(path.join(path.dirname(process.execPath), 'npx'), path.join(noeudSeul, 'npx'));
    const noeud = (args: string[]) =>
      spawnSync(process.execPath, args, {
        cwd: projet,
        encoding: 'utf8',
        env: {
          PATH: cheminSysteme(noeudSeul),
          HOME: mkdtempSync(path.join(ESSAIS, 'maison-')),
          npm_config_prefix: mkdtempSync(path.join(ESSAIS, 'global-')),
        },
      });
    for (const [fichier, g] of Object.entries(generes)) {
      const ecrite = lire(projet, fichier);
      expect(ecrite, fichier).not.toBe(g.perime);
      // The guard of grillhouse:gardes accepts what the update left.
      const v = noeud([g.generateur, ...g.verifier]);
      expect(v.status, `${fichier}: ${v.stdout}${v.stderr}`).toBe(0);
      // The package's generator, run in the project, writes the same text.
      const e = noeud([g.generateur, ...g.ecrire]);
      expect(e.status, e.stderr).toBe(0);
      expect(ecrite, fichier).toBe(lire(projet, fichier));
    }
  });
});

describe('grillhouse-3uv.76 critère 3 — the update refuses an unknown option, --help included', () => {
  it('critère 3: --help, --source and another unknown option are refused, the usage shown, nothing updated', () => {
    for (const option of ['--help', '--forcer', '--source']) {
      const projet = mkdtempSync(path.join(ESSAIS, 'option-'));
      ecrire(projet, 'package.json', `${JSON.stringify({ name: 'p' }, null, 2)}\n`);
      ecrire(projet, '.claude/settings.json', `${JSON.stringify({ model: 'opus' }, null, 2)}\n`);
      paquetInstalle(projet);
      const avant = contenu(projet);
      const claude = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')));
      const r = lancerMajAvec(projet, [option], claude.bin);
      expect(r.status, `${option}: ${r.stdout}${r.stderr}`).not.toBe(0);
      expect(r.stderr, option).toContain('Usage : npx grillhouse maj');
      expect(contenu(projet), option).toEqual(avant);
      expect(claude.appels(), option).toEqual([]);
    }
  });
});

// grillhouse-3uv.80 critère 2. Witness: BPScript, whose root resolves the hoisted Vitest 1.6.1 while
// each package declares ^2: `test:vitest` calls the Vitest of the root (`npx --no-install
// vitest`). The version the frame requires is the one its package.json declares, read in the source.
const VITEST_EXIGE = '^2.0.0';
describe('grillhouse-3uv.80 critère 2 — the update poses the frame’s test only where the root resolves the Vitest the frame requires', () => {
  const testDe = (projet: string) =>
    (json(projet, 'package.json').scripts as Record<string, string>).test;
  it('critère 2: the frame requires Vitest ^2.0.0 in its package.json', () => {
    expect(modele().devDependencies?.vitest).toBe(VITEST_EXIGE);
  });
  it('critère 2: a project of workspaces whose root resolves Vitest 1.6.1, each package declaring ^2 (BPScript), keeps its test, and the update names 1.6.1 and ^2.0.0', () => {
    const propre = 'bash scripts/suites-des-paquets.sh';
    const { projet, src } = projetEtSource({
      name: 'p',
      private: true,
      workspaces: ['packages/*'],
      scripts: { test: propre },
    });
    vitestALaRacine(projet, '1.6.1');
    ecrire(
      projet,
      'packages/moteur/package.json',
      `${JSON.stringify({ name: 'moteur', devDependencies: { vitest: '^2.0.0' } }, null, 2)}\n`
    );
    const r = lancerMaj(projet, src);
    expect(testDe(projet)).toBe(propre);
    expect(`${r.stdout}${r.stderr}`).toContain('1.6.1');
    expect(`${r.stdout}${r.stderr}`).toContain(VITEST_EXIGE);
    expect(r.stdout).not.toContain(`remplacé par le test du cadre`);
  });
  it('critère 2: a root resolving Vitest 3.2.4, above the range, keeps the project’s test, the update naming 3.2.4 and ^2.0.0', () => {
    const { projet, src } = projetEtSource({ name: 'p', scripts: { test: 'vitest run' } });
    vitestALaRacine(projet, '3.2.4');
    const r = lancerMaj(projet, src);
    expect(testDe(projet)).toBe('vitest run');
    expect(`${r.stdout}${r.stderr}`).toContain('3.2.4');
    expect(`${r.stdout}${r.stderr}`).toContain(VITEST_EXIGE);
  });
  it('critère 2: a root resolving no Vitest keeps the project’s test, the update naming ^2.0.0', () => {
    const { projet, src } = projetEtSource({ name: 'p', scripts: { test: 'vitest run' } });
    const r = lancerMaj(projet, src);
    expect(testDe(projet)).toBe('vitest run');
    expect(`${r.stdout}${r.stderr}`).toContain(VITEST_EXIGE);
  });
  it('critère 2: the version required is read in the source — a source requiring ^3.0.0 leaves the test of a root at 2.1.9, the update naming both', () => {
    const { projet, src } = projetEtSource(
      { name: 'p', scripts: { test: 'vitest run' } },
      p => {
        p.devDependencies = { ...p.devDependencies, vitest: '^3.0.0' };
      },
      { vitest: true }
    );
    const r = lancerMaj(projet, src);
    expect(testDe(projet)).toBe('vitest run');
    expect(`${r.stdout}${r.stderr}`).toContain('2.1.9');
    expect(`${r.stdout}${r.stderr}`).toContain('^3.0.0');
  });
  it('critère 2: a root resolving Vitest 2.0.0, the low edge of the range, receives the frame’s test', () => {
    const { projet, src } = projetEtSource({ name: 'p', scripts: { test: 'vitest run' } });
    vitestALaRacine(projet, '2.0.0');
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    expect(testDe(projet)).toBe(TEST_DU_CADRE);
  });
});

// grillhouse-3uv.80 critère 6. Witness: BPScript, copy 322.11, whose test is already the frame's
// while its root resolves the hoisted Vitest 1.6.1.
describe('grillhouse-3uv.80 critère 6 — a project whose test is already the frame’s keeps it where the root does not resolve the Vitest the frame requires, and the update says so', () => {
  it('critère 6: a project of workspaces whose test is the frame’s and whose root resolves Vitest 1.6.1 (BPScript 322.11) keeps that test, and the update names 1.6.1 and ^2.0.0', () => {
    const { projet, src } = projetEtSource({
      name: 'p',
      private: true,
      workspaces: ['packages/*'],
      scripts: { test: TEST_DU_CADRE },
    });
    vitestALaRacine(projet, '1.6.1');
    ecrire(
      projet,
      'packages/moteur/package.json',
      `${JSON.stringify({ name: 'moteur', devDependencies: { vitest: '^2.0.0' } }, null, 2)}\n`
    );
    const r = lancerMaj(projet, src);
    expect((json(projet, 'package.json').scripts as Record<string, string>).test).toBe(
      TEST_DU_CADRE
    );
    expect(`${r.stdout}${r.stderr}`).toContain('1.6.1');
    expect(`${r.stdout}${r.stderr}`).toContain(VITEST_EXIGE);
  });
});

// The frame's base configuration of Vitest is the package's, `@roomi-fields/grillhouse/vitest-config`
// (grillhouse-3uv.84.4 critère 5), that each package of a project reaches by its name, as the
// examples of Turborepo reach @repo/eslint-config: each tested package declares the frame's package.
// Witness: BPScript, whose guard of access refuses a relative path out of a package.
const NOM_PAQUET = '@roomi-fields/grillhouse';
const pkgJson = (o: Record<string, unknown>) => `${JSON.stringify(o, null, 2)}\n`;
// A project of packages: `teste` holds a test:vitest, `sans` none; the root declares the frame's
// package at <plage> (none when absent).
function projetAPaquets(workspaces: unknown, plage?: string) {
  const projet = mkdtempSync(path.join(ESSAIS, 'config-vitest-'));
  ecrire(
    projet,
    'package.json',
    pkgJson({
      name: 'p',
      private: true,
      workspaces,
      ...(plage ? { devDependencies: { [NOM_PAQUET]: plage } } : {}),
    })
  );
  ecrire(
    projet,
    'packages/teste/package.json',
    pkgJson({ name: 'teste', scripts: { 'test:vitest': 'vitest run' } })
  );
  ecrire(
    projet,
    'packages/sans/package.json',
    pkgJson({ name: 'sans', scripts: { build: 'tsc' } })
  );
  return projet;
}
const devDeps = (projet: string, f: string) =>
  (json(projet, f).devDependencies ?? {}) as Record<string, string>;

describe('the update declares the frame’s package in each tested package of a project of packages', () => {
  it('each tested package declares it at the root’s range; the workspaces stay as they are', () => {
    const projet = projetAPaquets(['packages/*'], '^0.23.0');
    const b = mettreAJour(projet, DEPOT);
    expect(json(projet, 'package.json').workspaces).toEqual(['packages/*']);
    expect(devDeps(projet, 'packages/teste/package.json')).toEqual({ [NOM_PAQUET]: '^0.23.0' });
    expect(json(projet, 'packages/sans/package.json')).not.toHaveProperty('devDependencies');
    expect(b.configVitest).toEqual({ nom: NOM_PAQUET, paquets: ['packages/teste'] });
  });
  it('without a declaration at the root, the range is the package’s version', () => {
    const projet = projetAPaquets({ packages: ['packages/*'] });
    mettreAJour(projet, DEPOT);
    expect(devDeps(projet, 'packages/teste/package.json')).toEqual({ [NOM_PAQUET]: `^${VERSION}` });
  });
  for (const [cas, workspaces] of [
    ['a package out of the frame (hors-cadre.txt), still a workspace,', ['packages/*']],
    ['a package the workspaces take out (a negation)', ['packages/*', '!packages/kanopi']],
  ] as const) {
    it(`${cas} is not touched`, () => {
      const projet = projetAPaquets(workspaces);
      ecrire(projet, 'docs/agents/hors-cadre.txt', 'kanopi projet voisin\n');
      const kanopi = pkgJson({ name: 'kanopi', scripts: { 'test:vitest': 'vitest run' } });
      ecrire(projet, 'packages/kanopi/package.json', kanopi);
      mettreAJour(projet, DEPOT);
      expect(lire(projet, 'packages/kanopi/package.json')).toBe(kanopi);
      expect(devDeps(projet, 'packages/teste/package.json')).toHaveProperty(NOM_PAQUET);
    });
  }
  it('a declaration the package already holds stays; its devDependencies are written sorted', () => {
    const projet = projetAPaquets(['packages/*']);
    const propre = pkgJson({
      name: 'propre',
      scripts: { 'test:vitest': 'vitest run' },
      devDependencies: { [NOM_PAQUET]: '^0.0.0' },
    });
    ecrire(projet, 'packages/propre/package.json', propre);
    ecrire(
      projet,
      'packages/teste/package.json',
      pkgJson({
        name: 'teste',
        scripts: { 'test:vitest': 'vitest run' },
        devDependencies: { zod: '*', vitest: '^2.0.0' },
      })
    );
    mettreAJour(projet, DEPOT);
    expect(lire(projet, 'packages/propre/package.json')).toBe(propre);
    expect(Object.keys(devDeps(projet, 'packages/teste/package.json'))).toEqual([
      NOM_PAQUET,
      'vitest',
      'zod',
    ]);
  });
  it('a replayed update changes no package.json', () => {
    const projet = projetAPaquets(['packages/*']);
    mettreAJour(projet, DEPOT);
    const fichiers = ['package.json', 'packages/teste/package.json', 'packages/sans/package.json'];
    const avant = fichiers.map(f => lire(projet, f));
    const b = mettreAJour(projet, DEPOT);
    expect(fichiers.map(f => lire(projet, f))).toEqual(avant);
    expect(b.configVitest).toBeNull();
  });
  it('a project of packages none of which is tested receives none', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'config-vitest-'));
    ecrire(projet, 'package.json', pkgJson({ name: 'p', workspaces: ['packages/*'] }));
    ecrire(projet, 'packages/sans/package.json', pkgJson({ name: 'sans' }));
    expect(mettreAJour(projet, DEPOT).configVitest).toBeNull();
  });
  it('a project without workspaces receives none', () => {
    const { projet } = installe({ name: 'p', scripts: { 'test:vitest': 'vitest run' } });
    expect(json(projet, 'package.json')).not.toHaveProperty('workspaces');
    expect(devDeps(projet, 'package.json')).not.toHaveProperty(NOM_PAQUET);
  });
  it('the report names the packages that declare it, the import to write and npm install', () => {
    const projet = projetAPaquets(['packages/*']);
    const bin = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')), {
      marches: ['claude-plugins-official', 'roomi-fields'],
    }).bin;
    const r = lancerMajAvec(projet, [], bin);
    expect(r.stdout).toContain('packages/teste');
    expect(r.stdout).toContain(`import base from '${NOM_PAQUET}/vitest-config'`);
    expect(r.stdout).toMatch(/npm install/);
  });
});

// The update reads the packages of a project as the frame's checks read them (`paquets` of
// scripts/paquets.mjs): a package the workspaces take out is none, and a package out of
// the frame, which Turborepo never tests, is not the frame's.
describe('the update knows a project to run Vitest by the packages of the frame its workspaces select', () => {
  for (const [cas, workspaces] of [
    ['a package the workspaces take out', ['packages/*', '!packages/kanopi']],
    ['a package out of the frame (hors-cadre.txt)', ['packages/*']],
  ] as const) {
    it(`vitest declared only in ${cas} leaves the project’s test as it is`, () => {
      const propre = 'bash scripts/suites.sh';
      const projet = mkdtempSync(path.join(ESSAIS, 'vitest-nie-'));
      vitestALaRacine(projet);
      ecrire(
        projet,
        'package.json',
        pkgJson({ name: 'p', private: true, workspaces, scripts: { test: propre } })
      );
      ecrire(projet, 'docs/agents/hors-cadre.txt', 'kanopi projet voisin\n');
      ecrire(
        projet,
        'packages/kanopi/package.json',
        pkgJson({ name: 'kanopi', devDependencies: { vitest: '^2.0.0' } })
      );
      mettreAJour(projet, DEPOT);
      expect((json(projet, 'package.json').scripts as Record<string, string>).test).toBe(propre);
    });
  }
});

// grillhouse-3uv.84.4 critère 2: the command plays, before what the frame writes, each migration of
// the package newer than the version the project recorded, and the project records the package's.
describe('grillhouse-3uv.84.4 critère 2 — grillhouse maj plays the migrations, then records the version', () => {
  const ancienCrochet = crochet('bash "$CLAUDE_PROJECT_DIR/scripts/session-start.sh"');
  function projetAncien(version?: string) {
    const projet = mkdtempSync(path.join(ESSAIS, 'migrations-'));
    ecrire(
      projet,
      'package.json',
      `${JSON.stringify({ name: 'p', ...(version ? { grillhouse: { version } } : {}) }, null, 2)}\n`
    );
    ecrire(
      projet,
      '.claude/settings.json',
      `${JSON.stringify({ model: 'opus', hooks: { SessionStart: [ancienCrochet] } }, null, 2)}\n`
    );
    return projet;
  }
  const bin = () => claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-'))).bin;

  it('a project that recorded no version plays every migration, the report naming each that changed something', () => {
    const projet = projetAncien();
    const r = lancerMajAvec(projet, [], bin());
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^Migration 0\.23\.0 \(crochets de séance\) :$/m);
    expect(json(projet, '.claude/settings.json')).not.toHaveProperty('hooks');
    expect(json(projet, 'package.json').grillhouse).toEqual({ version: VERSION });
  });
  it('a project that recorded a version at or past a migration does not play it', () => {
    const projet = projetAncien('99.0.0');
    const r = lancerMajAvec(projet, [], bin());
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toContain('Migration');
    expect(json(projet, '.claude/settings.json')).toHaveProperty('hooks');
  });
  it('a second pass reports no migration and changes no byte of the settings', () => {
    const projet = projetAncien();
    lancerMajAvec(projet, [], bin());
    const reglages = lire(projet, '.claude/settings.json');
    const r = lancerMajAvec(projet, [], bin());
    expect(r.stdout).not.toContain('Migration');
    expect(lire(projet, '.claude/settings.json')).toBe(reglages);
  });
});

// grillhouse-3uv.84.4 critère 4: the creation and the preparation are `grillhouse init`'s; the
// former scripts, their subcommands, their npm scripts and the relay of the update to a source
// checkout are gone.
describe('grillhouse-3uv.84.4 critère 4 — new-project.sh, setup.sh and the relay of the update are gone', () => {
  it('the package holds neither new-project.sh nor setup.sh, and its command names neither', async () => {
    for (const f of ['new-project.sh', 'setup.sh']) {
      expect(existsSync(path.join(DEPOT, 'packages/grillhouse/scripts', f)), f).toBe(false);
    }
    const { SOUS_COMMANDES } = (await import('../../bin/grillhouse.mjs')) as {
      SOUS_COMMANDES: Record<string, string>;
    };
    expect(SOUS_COMMANDES).not.toHaveProperty('new-project');
    expect(SOUS_COMMANDES).not.toHaveProperty('setup');
    expect(SOUS_COMMANDES.init).toBe('init.mjs');
  });
  it('no npm script of the repository nor of the template calls them', () => {
    for (const f of ['package.json', GABARIT]) {
      const scripts = (JSON.parse(lire(DEPOT, f)) as { scripts: Record<string, string> }).scripts;
      expect(scripts, f).not.toHaveProperty('new');
      expect(scripts, f).not.toHaveProperty('setup');
      expect(Object.values(scripts).join('\n'), f).not.toMatch(/grillhouse (setup|new-project)\b/);
    }
  });
  it('the update hands over to no source: it names no source checkout, no clone, no --source', () => {
    const texte = lire(DEPOT, 'packages/grillhouse/scripts/grillhouse-maj.mjs');
    for (const mot of ['GRILLHOUSE_SOURCE', "'clone'", 'roomis-grillhouse.git', "'--source'"]) {
      expect(texte, mot).not.toContain(mot);
    }
  });
});

// grillhouse-3uv.84.4 critère 6: the status line is a setting of the project, which the update
// keeps up to date (decision A of the owner, 2026-10-22, on the model of Husky).
describe('grillhouse-3uv.84.4 critère 6 — the update keeps the project’s status line', () => {
  const REGLAGES = '.claude/settings.json';
  function avecReglages(reglages: Record<string, unknown>) {
    const projet = mkdtempSync(path.join(ESSAIS, 'ligne-etat-'));
    ecrire(projet, 'package.json', '{"name":"p"}\n');
    ecrire(projet, REGLAGES, `${JSON.stringify(reglages, null, 2)}\n`);
    return projet;
  }
  const ligne = (projet: string) => json(projet, REGLAGES).statusLine;

  it('settings without a status line receive the frame’s, their keys kept in their order', () => {
    const projet = avecReglages({ model: 'opus', enabledPlugins: {} });
    expect(mettreAJour(projet, DEPOT).ligneEtat).toBe(true);
    expect(ligne(projet)).toEqual({ type: 'command', command: LIGNE_ETAT });
    // The plugin of the package is declared after it (grillhouse-3uv.84.7 critère 2).
    expect(Object.keys(json(projet, REGLAGES))).toEqual([
      'model',
      'enabledPlugins',
      'statusLine',
      'extraKnownMarketplaces',
    ]);
  });
  it('the frame’s former status line (its script by its path) becomes the command’s', () => {
    const projet = avecReglages({
      statusLine: {
        type: 'command',
        command: 'node "$CLAUDE_PROJECT_DIR/scripts/ligne-etat/ligne-etat.mjs"',
      },
    });
    mettreAJour(projet, DEPOT);
    expect(ligne(projet)).toEqual({ type: 'command', command: LIGNE_ETAT });
  });
  it('a status line of the project’s own stays', () => {
    const propre = { type: 'command', command: 'bash ~/ma-ligne.sh' };
    const projet = avecReglages({ statusLine: propre });
    expect(mettreAJour(projet, DEPOT).ligneEtat).toBe(false);
    expect(ligne(projet)).toEqual(propre);
  });
  it('a replayed update changes no byte of the settings', () => {
    const projet = avecReglages({ model: 'opus' });
    mettreAJour(projet, DEPOT);
    const premier = lire(projet, REGLAGES);
    expect(mettreAJour(projet, DEPOT).ligneEtat).toBe(false);
    expect(lire(projet, REGLAGES)).toBe(premier);
  });
  it('a project without settings receives none', () => {
    const { projet } = installe({ name: 'p' });
    expect(existsSync(path.join(projet, REGLAGES))).toBe(false);
  });
  it('the report says the status line written, once', () => {
    const projet = avecReglages({});
    expect(lancerMaj(projet, DEPOT).stdout).toContain("Ligne d'état");
    expect(lancerMaj(projet, DEPOT).stdout).not.toContain("Ligne d'état");
  });
});
