import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ELEMENTS_DU_GREFFON, FICHIERS_DU_CADRE, PROPRES_DU_PAQUET } from '../../scripts/cadre.mjs';

// grillhouse-3uv.84.4 critère 5: the published package installs and works alone: it declares what
// its scripts import out of Node, and carries its base configuration of Vitest. Critère 7: what the
// frame reads of a project's frame (the instructions of the agents, the meta-frame, the template,
// the base configuration of Vitest) resolves from the package installed, which carries the frame's
// plugin at its root and the template under cadre/ (scripts/cadre.mjs, the package's prepack;
// grillhouse-3uv.84.7). The installation of the packed
// package in a fresh project, where `grillhouse verifier` plays, is the night's
// (paquet-publie.nuit.test.ts).

const PAQUET = path.resolve(__dirname, '../..');
const DEPOT = path.resolve(PAQUET, '../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'paquet-publie-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Pkg = {
  files: string[];
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  exports: Record<string, unknown>;
};
const pkg = JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')) as Pkg;

// The source files of the package that npm publishes: bin/ and scripts/.
function sources(rel: string): string[] {
  return readdirSync(path.join(PAQUET, rel), { withFileTypes: true }).flatMap(e => {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) {
      return sources(r);
    }
    return /\.(mjs|js|cjs|sh)$/.test(e.name) ? [r] : [];
  });
}
// The packages a source file imports by a bare name (import, dynamic import, require), its scope
// kept: `@scope/name`, or `name`.
function importes(texte: string): string[] {
  const noms = [
    ...texte.matchAll(
      /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\brequis\s*\(\s*)['"]([^'"./$][^'"]*)['"]/g
    ),
  ].map(m => m[1] as string);
  return noms
    .filter(n => !n.startsWith('node:') && !builtinModules.includes(n.split('/')[0] as string))
    .map(n =>
      n.startsWith('@') ? n.split('/').slice(0, 2).join('/') : (n.split('/')[0] as string)
    );
}

describe('grillhouse-3uv.84.4 critère 5 — the package declares what its scripts import', () => {
  it('every package a script of bin/ or scripts/ imports is a dependency or a peer of the package', () => {
    const declares = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      '@roomi-fields/grillhouse',
    ]);
    const manquants = [...sources('bin'), ...sources('scripts')].flatMap(f =>
      importes(readFileSync(path.join(PAQUET, f), 'utf8'))
        .filter(n => !declares.has(n))
        .map(n => `${f}: ${n}`)
    );
    expect(manquants).toEqual([]);
  });

  it('declares jsonc-parser and yaml among its dependencies, Vitest and TypeScript as peers', () => {
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(
      expect.arrayContaining(['jsonc-parser', 'yaml'])
    );
    expect(Object.keys(pkg.peerDependencies ?? {}).sort()).toEqual(['typescript', 'vitest']);
  });

  it('carries its base configuration of Vitest, exported by its name; no package of its own stays', () => {
    expect(pkg.exports['./vitest-config']).toEqual({
      types: './scripts/vitest-config/base.d.ts',
      default: './scripts/vitest-config/base.mjs',
    });
    expect(existsSync(path.join(PAQUET, 'scripts/vitest-config/package.json'))).toBe(false);
    const racine = JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as {
      workspaces: string[];
    };
    expect(racine.workspaces).toEqual(['packages/*']);
  });

  it('the template of a project imports the base configuration by the package’s name', () => {
    expect(readFileSync(path.join(DEPOT, 'templates/projet/vitest.config.ts'), 'utf8')).toContain(
      "import base from '@roomi-fields/grillhouse/vitest-config';"
    );
  });

  it('no file of the repository names the former package @grillhouse/vitest-config, save its migration and the changelog', () => {
    const suivis = spawnSync('git', ['-C', DEPOT, 'ls-files', '-co', '--exclude-standard'], {
      encoding: 'utf8',
    })
      .stdout.split('\n')
      .filter(
        f =>
          f !== '' &&
          f !== 'CHANGELOG.md' &&
          !f.startsWith('.beads/') &&
          !f.includes('config-vitest') &&
          f !== 'packages/grillhouse/tests/unit/paquet-publie.spec.ts' &&
          f !== 'packages/grillhouse/tests/unit/turbo-des-paquets.spec.ts' &&
          existsSync(path.join(DEPOT, f))
      );
    const porteurs = suivis.filter(f =>
      /['"`]@grillhouse\/vitest-config/.test(readFileSync(path.join(DEPOT, f), 'utf8'))
    );
    expect(porteurs).toEqual([]);
  });
});

describe('grillhouse-3uv.84.4 critère 7 — what the frame reads resolves from the package installed', () => {
  // grillhouse-3uv.84.8: docs/, the package's architecture, which the common charter names.
  it('the package publishes bin/, scripts/, cadre/, docs/ and the plugin’s entries, which its prepack writes and its postpack removes', () => {
    expect(PROPRES_DU_PAQUET).toEqual(['bin', 'cadre', 'docs', 'scripts', 'tsdoc-base.json']);
    expect([...pkg.files].sort()).toEqual([...PROPRES_DU_PAQUET, ...ELEMENTS_DU_GREFFON].sort());
    expect(pkg.scripts.prepack).toBe('node scripts/cadre.mjs --empaqueter');
    expect(pkg.scripts.postpack).toBe('node scripts/cadre.mjs --nettoyer');
  });

  it('cadre/ carries the template of a project; the package’s root, the frame’s plugin, its meta-frame and the instructions of the agents with it', () => {
    expect(FICHIERS_DU_CADRE).toEqual(['templates']);
    expect(ELEMENTS_DU_GREFFON).toEqual(expect.arrayContaining(['METACADRE.md', 'skills']));
  });

  it('--empaqueter copies the plugin at the package’s root and the template under cadre/; --nettoyer removes them', () => {
    // A repository of the frame of trial: the package beside the frame's files.
    const depot = mkdtempSync(path.join(ESSAIS, 'depot-'));
    const paquet = path.join(depot, 'packages/grillhouse');
    mkdirSync(path.join(paquet, 'scripts'), { recursive: true });
    cpSync(path.join(PAQUET, 'scripts/cadre.mjs'), path.join(paquet, 'scripts/cadre.mjs'));
    cpSync(path.join(PAQUET, 'package.json'), path.join(paquet, 'package.json'));
    for (const f of [...FICHIERS_DU_CADRE, 'mods/grillhouse']) {
      cpSync(path.join(DEPOT, f), path.join(depot, f), { recursive: true });
    }
    const lancer = (option: string) =>
      spawnSync(process.execPath, [path.join(paquet, 'scripts/cadre.mjs'), option], {
        encoding: 'utf8',
      });
    expect(lancer('--empaqueter').status).toBe(0);
    for (const f of ['METACADRE.md', 'skills/pitmaster/references/consigne-agent.md']) {
      expect(readFileSync(path.join(paquet, f), 'utf8'), f).toBe(
        readFileSync(path.join(DEPOT, 'mods/grillhouse', f), 'utf8')
      );
    }
    for (const f of [
      'templates/projet/package.json',
      'templates/projet/_gitignore',
      'templates/turbo/sans-paquets.json',
    ]) {
      expect(readFileSync(path.join(paquet, 'cadre', f), 'utf8'), f).toBe(
        readFileSync(path.join(DEPOT, f), 'utf8')
      );
    }
    expect(lancer('--nettoyer').status).toBe(0);
    expect(readdirSync(paquet).sort()).toEqual(['package.json', 'scripts']);
  });

  it('installed under node_modules, the package reads the template in its cadre/ and the plugin at its root; in the repository, at their address', () => {
    const installe = path.join(ESSAIS, 'projet/node_modules/@roomi-fields/grillhouse');
    mkdirSync(path.join(installe, 'scripts'), { recursive: true });
    cpSync(path.join(PAQUET, 'scripts/cadre.mjs'), path.join(installe, 'scripts/cadre.mjs'));
    cpSync(path.join(PAQUET, 'package.json'), path.join(installe, 'package.json'));
    const lu = (script: string, nom: string) =>
      spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `const m = await import(${JSON.stringify(script)}); console.log(m.${nom});`,
        ],
        { encoding: 'utf8' }
      ).stdout.trim();
    expect(lu(path.join(installe, 'scripts/cadre.mjs'), 'CADRE')).toBe(
      path.join(installe, 'cadre')
    );
    expect(lu(path.join(installe, 'scripts/cadre.mjs'), 'GREFFON')).toBe(installe);
    expect(lu(path.join(PAQUET, 'scripts/cadre.mjs'), 'CADRE')).toBe(DEPOT);
    expect(lu(path.join(PAQUET, 'scripts/cadre.mjs'), 'GREFFON')).toBe(
      path.join(DEPOT, 'mods/grillhouse')
    );
  });

  it('the circuit reads the instructions of the agents and the meta-frame at the plugin’s root, never above its package', () => {
    const texte = readFileSync(path.join(PAQUET, 'scripts/circuit.mjs'), 'utf8');
    expect(texte).toContain("import { GREFFON } from './cadre.mjs';");
    expect(texte).toMatch(/const METACADRE = path\.join\(GREFFON, 'METACADRE\.md'\);/);
    expect(texte).toMatch(/const GABARIT = path\.join\(\s*GREFFON,/);
    expect(texte).not.toMatch(/path\.join\(ici, '\.\.', '\.\.', '\.\.'\)/);
  });

  it('init and the update read the template under CADRE', () => {
    for (const f of ['scripts/init.mjs', 'scripts/grillhouse-maj.mjs']) {
      expect(readFileSync(path.join(PAQUET, f), 'utf8'), f).toContain("from './cadre.mjs'");
    }
  });
});

// grillhouse-3uv.95.11.3: the package publishes its TSDoc base, which extends API Extractor's, a
// dependency it declares itself, as a rig of Rushstack carries the base configuration beside the
// dependency it names; a project's tsdoc.json extends it. TSDoc resolves an `extends` by its path
// under the package (the module `resolve`, which reads no `exports`): the file lies at the
// package's root, published, and its entry names it.
describe('grillhouse-3uv.95.11.3 — the TSDoc base of the package', () => {
  const lireJson = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as { extends?: string[] };
  it('the package publishes tsdoc-base.json at its root, its entry naming it, and it extends API Extractor’s', () => {
    expect(pkg.files).toContain('tsdoc-base.json');
    expect(pkg.exports['./tsdoc-base.json']).toBe('./tsdoc-base.json');
    expect(lireJson(path.join(PAQUET, 'tsdoc-base.json')).extends).toEqual([
      '@microsoft/api-extractor/extends/tsdoc-base.json',
    ]);
    expect(pkg.dependencies?.['@microsoft/api-extractor']).toBeTypeOf('string');
  });
  it('the tsdoc.json of the template and of the repository extend the package’s base', () => {
    for (const f of ['templates/projet/tsdoc.json', 'tsdoc.json']) {
      expect(lireJson(path.join(DEPOT, f)).extends, f).toEqual([
        '@roomi-fields/grillhouse/tsdoc-base.json',
      ]);
    }
  });
});

// grillhouse-3uv.95.1: the package publishes the functions a project's guards import, each by a
// named entry pointing at the module that carries it, with its declaration of types, as
// `eslint/use-at-your-own-risk` publishes its tools. The archive is packed without its prepack
// (the entries live under scripts/, which the prepack does not write) and unpacked where npm
// installs a package, in a project of trial that imports each entry by the package's name.
const ENTREES_DES_GARDES = [
  { entree: './dette', module: 'dette', fonction: 'trancher' },
  { entree: './consommateurs', module: 'consommateurs', fonction: 'matieres' },
  { entree: './paquets', module: 'paquets', fonction: 'horsCadre' },
] as const;

describe('grillhouse-3uv.95.1 — the named entries of the package for a project’s guards', () => {
  it('critère 1: each entry points at the module carrying its function, with a declaration of types that declares it', () => {
    for (const { entree, module, fonction } of ENTREES_DES_GARDES) {
      expect(pkg.exports[entree], entree).toEqual({
        types: `./scripts/${module}.d.ts`,
        default: `./scripts/${module}.mjs`,
      });
      const types = path.join(PAQUET, `scripts/${module}.d.ts`);
      expect(existsSync(types), types).toBe(true);
      expect(readFileSync(types, 'utf8')).toMatch(new RegExp(`export function ${fonction}\\b`));
    }
  });

  it('critère 2: a project of trial that installs the packed package imports each entry by its name, calls it, and its types check', () => {
    const archives = mkdtempSync(path.join(ESSAIS, 'archives-'));
    const pack = spawnSync(
      'npm',
      ['pack', '--ignore-scripts', '--silent', '--pack-destination', archives],
      { cwd: PAQUET, encoding: 'utf8' }
    );
    expect(pack.status, pack.stderr).toBe(0);
    const [archive] = readdirSync(archives).filter(f => f.endsWith('.tgz'));
    expect(archive, 'npm pack wrote an archive').toBeDefined();
    const projet = mkdtempSync(path.join(ESSAIS, 'projet-'));
    const installe = path.join(projet, 'node_modules/@roomi-fields/grillhouse');
    mkdirSync(installe, { recursive: true });
    const tar = spawnSync(
      'tar',
      ['-xzf', path.join(archives, archive as string), '-C', installe, '--strip-components=1'],
      { encoding: 'utf8' }
    );
    expect(tar.status, tar.stderr).toBe(0);
    const ecrire = (f: string, texte: string) => {
      mkdirSync(path.dirname(path.join(projet, f)), { recursive: true });
      writeFileSync(path.join(projet, f), texte);
    };
    ecrire('package.json', '{ "name": "essai", "private": true, "type": "module" }\n');
    ecrire('docs/agents/hors-cadre.txt', '# hors cadre\nancien gelé\n');
    ecrire(
      'packages/matiere/package.json',
      '{ "name": "@essai/matiere", "exports": { "./test-fixtures": "./f.mjs" } }\n'
    );
    const imports = [
      "import { trancher } from '@roomi-fields/grillhouse/dette';",
      "import { matieres } from '@roomi-fields/grillhouse/consommateurs';",
      "import { horsCadre } from '@roomi-fields/grillhouse/paquets';",
    ].join('\n');
    ecrire(
      'essai.mjs',
      `${imports}
const racine = process.cwd();
const { refus } = trancher(racine, 'essai', [{ fichier: 'a.mjs', regle: 'r', message: 'm' }], undefined, {});
console.log(JSON.stringify({
  refus: refus.map(c => c.message),
  matieres: matieres(racine).map(m => m.paquet),
  horsCadre: [...horsCadre(racine)],
}));
`
    );
    const r = spawnSync(process.execPath, ['essai.mjs'], { cwd: projet, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      refus: ['m'],
      matieres: ['@essai/matiere'],
      horsCadre: ['ancien'],
    });
    // The same calls in TypeScript, checked against the declarations the entries publish: an
    // entry without its types is an implicit any, which strict refuses.
    ecrire(
      'essai.mts',
      `${imports}
const racine = 'ici';
const n: number = matieres(racine).length;
const s: Set<string> = horsCadre(racine);
const { refus, lignes }: { refus: { message: string }[]; lignes: string[] } = trancher(racine, 'essai', [
  { fichier: 'a.mjs', regle: 'r', message: 'm', ligne: 3 },
]);
export { n, s, refus, lignes };
`
    );
    ecrire(
      'tsconfig.json',
      `${JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: 'nodenext',
          moduleResolution: 'nodenext',
          types: [],
        },
        files: ['essai.mts'],
      })}\n`
    );
    const tsc = spawnSync(
      process.execPath,
      [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '-p', '.'],
      { cwd: projet, encoding: 'utf8' }
    );
    expect(tsc.status, `${tsc.stdout}${tsc.stderr}`).toBe(0);
  }, 120_000);

  it('critère 3: the architecture of the package names each entry it publishes, and names no entry it does not', () => {
    const texte = readFileSync(path.join(PAQUET, 'docs/ARCHITECTURE.md'), 'utf8');
    const nommees = new Set(
      [...texte.matchAll(/`@roomi-fields\/grillhouse\/([a-z][a-z0-9/.-]*)`/g)].map(
        m => `./${m[1] as string}`
      )
    );
    const publiees = Object.keys(pkg.exports).filter(e => e !== './package.json');
    expect([...nommees].sort()).toEqual([...publiees].sort());
    for (const { entree } of ENTREES_DES_GARDES) {
      expect(publiees).toContain(entree);
    }
  });
});
