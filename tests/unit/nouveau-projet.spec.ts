import { spawnSync } from 'node:child_process';
import {
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
import { stripVTControlCharacters } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cheminSysteme, claudeSubstitut } from '../claude-substitut.js';
import { configGit } from '../config-git.js';

// `npm run new -- <path> [prefix]` (scripts/new-project.sh) creates a project from the template.
// The project receives the example application (src/) and its tests, and none of the frame's own
// tests nor their material: these stay in Grillhouse (.claude/grillhouse/fichiers.txt). Its
// `npm test` plays the example's tests and passes. Each model under templates/ (templates/turbo/
// aside) replaces Grillhouse's file of the same path, and no templates/ stays. The tools the preparation calls (Beads,
// CodeGraph, npm) are stood in, and so is claude (tests/claude-substitut.ts); the project's
// node_modules is a link to the template's, what its `npm install` gives.

const DEPOT = path.resolve(__dirname, '../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'nouveau-projet-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const PROJET = path.join(ESSAIS, 'projet');

// The tests of the example application, and the empty directory of the integration tests.
const TESTS_DE_L_EXEMPLE = [
  'tests/integration/.gitkeep',
  'tests/unit/config.spec.ts',
  'tests/unit/errors.spec.ts',
  'tests/unit/types.spec.ts',
];

// The files under <dossier> of <racine>, as paths relative to <racine>, sorted.
function fichiers(racine: string, dossier: string): string[] {
  const out: string[] = [];
  const parcourir = (rel: string) => {
    for (const e of readdirSync(path.join(racine, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) {
        parcourir(r);
      } else {
        out.push(r);
      }
    }
  };
  parcourir(dossier);
  return out.sort();
}

// The tools scripts/setup.sh calls, stood in: Beads, CodeGraph, npm. None installs anything.
function outilsDeLaPreparation() {
  const bin = path.join(ESSAIS, 'outils');
  mkdirSync(bin);
  const outil = (nom: string, corps: string) =>
    writeFileSync(path.join(bin, nom), `#!/bin/sh\n${corps}\n`, { mode: 0o755 });
  outil('bd', 'case "$1" in\n  config) echo essai;;\n  init) mkdir -p .beads;;\nesac\nexit 0');
  outil('codegraph', '[ "$1" = init ] && mkdir -p "$2/.codegraph"\nexit 0');
  outil('npm', 'exit 0');
  return bin;
}

// The name Claude Code gives each marketplace the frame declares, added from its source.
function nomsDesMarches(): Record<string, string> {
  const reglages = JSON.parse(readFileSync(path.join(DEPOT, '.claude/settings.json'), 'utf8')) as {
    extraKnownMarketplaces?: Record<string, { source: { repo?: string; url?: string } }>;
  };
  return Object.fromEntries(
    Object.entries(reglages.extraKnownMarketplaces ?? {}).map(([nom, m]) => [
      m.source.repo ?? m.source.url ?? nom,
      nom,
    ])
  );
}

let creation: ReturnType<typeof spawnSync>;
beforeAll(() => {
  const claude = claudeSubstitut(path.join(ESSAIS, 'claude'), { noms: nomsDesMarches() });
  creation = spawnSync('bash', [path.join(DEPOT, 'scripts/new-project.sh'), PROJET, 'essai'], {
    cwd: DEPOT,
    encoding: 'utf8',
    env: {
      HOME: process.env.HOME ?? ESSAIS,
      PATH: cheminSysteme(outilsDeLaPreparation(), claude.bin),
      ...configGit([
        ['user.name', 'Essai'],
        ['user.email', 'essai@example.invalid'],
      ]),
    },
    timeout: 120_000,
  });
}, 150_000);

describe('npm run new — the project receives the example, never the frame’s own tests', () => {
  it('creates the project', () => {
    expect(creation.status, `${String(creation.stdout)}\n${String(creation.stderr)}`).toBe(0);
  });

  it('holds, under tests/, the example’s tests alone', () => {
    expect(fichiers(PROJET, 'tests')).toEqual(TESTS_DE_L_EXEMPLE);
  });

  it('keeps the example application and its tests as the template has them', () => {
    expect(fichiers(PROJET, 'src')).toEqual(fichiers(DEPOT, 'src'));
    for (const f of [...fichiers(DEPOT, 'src'), ...TESTS_DE_L_EXEMPLE]) {
      expect(readFileSync(path.join(PROJET, f), 'utf8'), f).toBe(
        readFileSync(path.join(DEPOT, f), 'utf8')
      );
    }
  });

  it('receives each model of templates/ at its own path, never Grillhouse’s file', () => {
    const modeles = fichiers(path.join(DEPOT, 'templates'), '.').filter(
      f => !f.startsWith('turbo/')
    );
    expect(modeles).toEqual(
      expect.arrayContaining([
        'CHANGELOG.md',
        'CONTRIBUTING.md',
        'CREDITS.md',
        'README.md',
        'pitmaster/SUIVI.md',
      ])
    );
    for (const f of modeles) {
      const recu = readFileSync(path.join(PROJET, f), 'utf8');
      expect(recu, f).toBe(readFileSync(path.join(DEPOT, 'templates', f), 'utf8'));
      expect(recu, f).not.toBe(readFileSync(path.join(DEPOT, f), 'utf8'));
    }
  });

  it('keeps no templates/ directory', () => {
    expect(existsSync(path.join(PROJET, 'templates'))).toBe(false);
  });

  it('plays the example’s tests with its npm test, green', () => {
    symlinkSync(path.join(DEPOT, 'node_modules'), path.join(PROJET, 'node_modules'), 'dir');
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
