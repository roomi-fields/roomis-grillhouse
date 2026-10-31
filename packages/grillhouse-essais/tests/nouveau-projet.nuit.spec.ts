import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cheminSysteme,
  claudeSubstitut,
  configGit,
} from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CADRE } from './cadre.js';

// grillhouse-3uv.84.4 critère 1: `grillhouse init <dossier> [préfixe]` creates a project from the
// template of a project (templates/projet/), as create-turbo creates one from its example: each file
// of the template at its own path (`_gitignore` and `_npmignore` named `.gitignore` and
// `.npmignore`, the names npm would not publish), the dependency on the frame's package, then the
// preparation (git, Beads, CodeGraph, the frame's plugins, `npm install`) and what the frame writes
// in a project (its turbo.json, the generated files). Critère 6: the status line is a setting of
// the project, which init writes in its `.claude/settings.json`. The tools the preparation calls
// (Beads, CodeGraph, npm, whose install links this repository's node_modules) are stood in, and so
// is claude (packages/grillhouse-matiere/src/claude-substitut.ts).

const PAQUET = CADRE;
const DEPOT = path.resolve(PAQUET, '../..');
const GRILLHOUSE = path.join(PAQUET, 'bin/grillhouse.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'nouveau-projet-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const PROJET = path.join(ESSAIS, 'projet');
const GABARIT = path.join(DEPOT, 'templates/projet');
const VERSION = (
  JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')) as { version: string }
).version;
const LIGNE_ETAT = '"$CLAUDE_PROJECT_DIR/node_modules/.bin/grillhouse" ligne-etat';
// The files of the template whose name the project receives changed.
const RENOMMES: Record<string, string> = { _gitignore: '.gitignore', _npmignore: '.npmignore' };
// The files of the template init completes: the package.json (the frame's dependency, its
// version) and the settings (the status line).
const COMPLETES = ['package.json', '.claude/settings.json'];

// The tests of the example application, and the empty directory of the integration tests.
const TESTS_DE_L_EXEMPLE = [
  'tests/integration/.gitkeep',
  'tests/unit/config.spec.ts',
  'tests/unit/errors.spec.ts',
  'tests/unit/types.spec.ts',
];

// The files under <dossier> of <racine>, as paths relative to <racine>, sorted; `.git` and the
// dependencies left out.
function fichiers(racine: string, dossier: string): string[] {
  const out: string[] = [];
  const parcourir = (rel: string) => {
    for (const e of readdirSync(path.join(racine, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) {
        parcourir(r);
      } else if (!e.isSymbolicLink()) {
        out.push(r);
      }
    }
  };
  parcourir(dossier);
  return out.sort();
}

// The tools the preparation calls, stood in: Beads, CodeGraph, npm, whose install links this
// repository's node_modules (what `npm install` would give the project).
function outilsDeLaPreparation() {
  const bin = path.join(ESSAIS, 'outils');
  mkdirSync(bin);
  const outil = (nom: string, corps: string) =>
    writeFileSync(path.join(bin, nom), `#!/bin/sh\n${corps}\n`, { mode: 0o755 });
  outil('bd', 'case "$1" in\n  config) echo essai;;\n  init) mkdir -p .beads;;\nesac\nexit 0');
  outil('codegraph', '[ "$1" = init ] && mkdir -p "$2/.codegraph"\nexit 0');
  outil(
    'npm',
    `case "$1" in\n  install) [ -e node_modules ] || { mkdir node_modules; for e in "${path.join(DEPOT, 'node_modules')}"/* "${path.join(DEPOT, 'node_modules')}"/.bin; do ln -s "$e" node_modules/; done; };;\nesac\nexit 0`
  );
  return bin;
}

// The name Claude Code gives each marketplace the template declares, added from its source.
function nomsDesMarches(): Record<string, string> {
  const reglages = JSON.parse(
    readFileSync(path.join(GABARIT, '.claude/settings.json'), 'utf8')
  ) as { extraKnownMarketplaces?: Record<string, { source: { repo?: string; url?: string } }> };
  return Object.fromEntries(
    Object.entries(reglages.extraKnownMarketplaces ?? {}).map(([nom, m]) => [
      m.source.repo ?? m.source.url ?? nom,
      nom,
    ])
  );
}

const ENV = (bin: string, claude: string) => ({
  HOME: process.env.HOME ?? ESSAIS,
  PATH: cheminSysteme(bin, claude),
  ...configGit([
    ['user.name', 'Essai'],
    ['user.email', 'essai@example.invalid'],
  ]),
});

let creation: ReturnType<typeof spawnSync>;
let claude: ReturnType<typeof claudeSubstitut>;
let outils: string;
beforeAll(() => {
  claude = claudeSubstitut(path.join(ESSAIS, 'claude'), { noms: nomsDesMarches() });
  outils = outilsDeLaPreparation();
  creation = spawnSync(process.execPath, [GRILLHOUSE, 'init', PROJET, 'essai'], {
    cwd: ESSAIS,
    encoding: 'utf8',
    env: ENV(outils, claude.bin),
    timeout: 120_000,
  });
}, 150_000);

const json = (f: string) =>
  JSON.parse(readFileSync(path.join(PROJET, f), 'utf8')) as Record<string, unknown>;

describe('grillhouse-3uv.84.4 critère 1 — grillhouse init creates a project from templates/projet/', () => {
  it('creates the project', () => {
    expect(creation.status, `${String(creation.stdout)}\n${String(creation.stderr)}`).toBe(0);
  });

  it('receives each file of the template at its own path, as the template holds it', () => {
    for (const f of fichiers(GABARIT, '.')) {
      const recu = RENOMMES[f] ?? f;
      expect(existsSync(path.join(PROJET, recu)), recu).toBe(true);
      if (COMPLETES.includes(f) || f === '_gitignore') {
        continue;
      }
      expect(readFileSync(path.join(PROJET, recu), 'utf8'), f).toBe(
        readFileSync(path.join(GABARIT, f), 'utf8')
      );
    }
    for (const f of Object.keys(RENOMMES)) {
      expect(existsSync(path.join(PROJET, f)), f).toBe(false);
    }
  });

  it('keeps the lines of the template’s .gitignore, which ignores node_modules and Turborepo’s folder', () => {
    const recu = readFileSync(path.join(PROJET, '.gitignore'), 'utf8').split('\n');
    for (const l of readFileSync(path.join(GABARIT, '_gitignore'), 'utf8').split('\n')) {
      expect(recu).toContain(l);
    }
    expect(recu).toEqual(expect.arrayContaining(['node_modules/', '.turbo/']));
  });

  it('holds, under tests/, the example’s tests alone, and none of the frame’s', () => {
    expect(fichiers(PROJET, 'tests')).toEqual(TESTS_DE_L_EXEMPLE);
    expect(existsSync(path.join(PROJET, 'packages'))).toBe(false);
    expect(existsSync(path.join(PROJET, 'templates'))).toBe(false);
  });

  it('depends on the frame’s package at its version, the rest of its package.json the template’s', () => {
    const recu = json('package.json');
    const modele = JSON.parse(readFileSync(path.join(GABARIT, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    const dev = recu.devDependencies as Record<string, string>;
    expect(dev['@roomi-fields/grillhouse']).toBe(`^${VERSION}`);
    const { ['@roomi-fields/grillhouse']: _paquet, ...autres } = dev;
    expect(autres).toEqual(modele.devDependencies);
    // grillhouse-ca7: the project declares its language in its architecture, not its package.json.
    expect(recu.grillhouse).toEqual({ version: VERSION });
    const sans = (p: Record<string, unknown>) => {
      const { devDependencies: _d, grillhouse: _g, ...reste } = p;
      return reste;
    };
    expect(sans(recu)).toEqual(sans(modele));
  });

  it('receives the turbo.json of a repository without packages', () => {
    expect(readFileSync(path.join(PROJET, 'turbo.json'), 'utf8')).toBe(
      readFileSync(path.join(DEPOT, 'templates/turbo/sans-paquets.json'), 'utf8')
    );
  });

  it('is prepared: a git repository of one commit, its Beads store and its CodeGraph index', () => {
    expect(existsSync(path.join(PROJET, '.beads'))).toBe(true);
    expect(existsSync(path.join(PROJET, '.codegraph'))).toBe(true);
    const log = spawnSync('git', ['-C', PROJET, 'log', '--format=%s'], { encoding: 'utf8' });
    expect(log.stdout.trim().split('\n')).toHaveLength(1);
    const etat = spawnSync('git', ['-C', PROJET, 'status', '--porcelain'], { encoding: 'utf8' });
    expect(etat.stdout).toBe('');
  });

  it('installs the plugins its settings declare, for the project', () => {
    const installes = claude
      .appels()
      .filter(a => a.argv[0] === 'plugin' && a.argv[1] === 'install')
      .map(a => a.argv[2]);
    const declares = Object.entries(
      (json('.claude/settings.json').enabledPlugins ?? {}) as Record<string, boolean>
    )
      .filter(([, v]) => v)
      .map(([id]) => id);
    expect(installes.sort()).toEqual(declares.sort());
  });

  it('holds the generated files the frame’s checks read: the boundaries and the interfaces index', () => {
    expect(readFileSync(path.join(PROJET, '.dependency-cruiser.cjs'), 'utf8')).toMatch(
      /grillhouse frontieres --ecrire/
    );
    expect(readFileSync(path.join(PROJET, 'docs/agents/index-des-interfaces.md'), 'utf8')).toMatch(
      /grillhouse index-interfaces/
    );
  });

  it('refuses a directory that is not empty, and writes nothing in it', () => {
    const plein = path.join(ESSAIS, 'plein');
    mkdirSync(plein);
    writeFileSync(path.join(plein, 'a.txt'), 'a');
    const r = spawnSync(process.execPath, [GRILLHOUSE, 'init', plein], {
      cwd: ESSAIS,
      encoding: 'utf8',
      env: ENV(outils, claude.bin),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/n'est pas vide/);
    expect(readdirSync(plein)).toEqual(['a.txt']);
  });

  it('plays the example’s tests with its npm test, green', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, TURBO_TELEMETRY_DISABLED: '1' };
    delete env.GRILLHOUSE_TESTS;
    const r = spawnSync('npm', ['test'], {
      cwd: PROJET,
      encoding: 'utf8',
      env,
      timeout: 240_000,
    });
    const sortie = stripVTControlCharacters(`${r.stdout}\n${r.stderr}`);
    expect(r.status, sortie).toBe(0);
    expect(sortie).toMatch(/Test Files\s+3 passed \(3\)/);
  }, 300_000);
});

describe('grillhouse-3uv.84.4 critère 6 — init writes the status line in the project’s settings', () => {
  it('the status line runs the project’s command, ligne-etat; the settings hold no hook of the frame', () => {
    const reglages = json('.claude/settings.json');
    expect(reglages.statusLine).toEqual({ type: 'command', command: LIGNE_ETAT });
    expect(reglages).not.toHaveProperty('hooks');
  });

  it('the rest of the settings is the template’s, which declares grillhouse@roomi-fields, the status line added; no marketplace of the project’s own', () => {
    const modele = JSON.parse(
      readFileSync(path.join(GABARIT, '.claude/settings.json'), 'utf8')
    ) as Record<string, Record<string, unknown>>;
    const { statusLine: _s, ...reste } = json('.claude/settings.json');
    expect(reste).toEqual(modele);
    expect(reste.enabledPlugins?.['grillhouse@roomi-fields']).toBe(true);
    expect(existsSync(path.join(PROJET, '.claude-plugin'))).toBe(false);
  });
});

// grillhouse-3uv.84.8: the common charter arrives by the import of the project's CLAUDE.md, and the
// hook of the session's start writes a short state, under the cap Claude Code puts on a hook's
// output (10,000 characters, docs « Hooks »).
describe('grillhouse-3uv.84.8 — the new project imports the common charter, and its session’s start holds under the cap', () => {
  it('critère 1 — its CLAUDE.md imports the charter from the package installed', () => {
    expect(readFileSync(path.join(PROJET, 'CLAUDE.md'), 'utf8')).toMatch(
      /^Les règles du cadre : @node_modules\/@roomi-fields\/grillhouse\/charte\.md$/m
    );
  });

  it('critère 2 — the hook of its session’s start writes no charter, under the cap of a hook', () => {
    const r = spawnSync(
      process.execPath,
      [path.join(DEPOT, 'mods/grillhouse/hooks/crochet.mjs'), 'session-start'],
      {
        cwd: PROJET,
        encoding: 'utf8',
        input: '{"hook_event_name":"SessionStart","source":"startup"}',
        env: { ...ENV(outils, claude.bin), CLAUDE_PROJECT_DIR: PROJET, BEADS_ACTOR: 'essai' },
        timeout: 60_000,
      }
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Pas encore renseignés/);
    expect(r.stdout).not.toContain("# La charte commune de Roomi's Grillhouse");
    expect(r.stdout.length).toBeLessThan(10_000);
  });
});
