import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { builtinModules } from 'node:module';
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
    expect(PROPRES_DU_PAQUET).toEqual(['bin', 'cadre', 'docs', 'scripts']);
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
