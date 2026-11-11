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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configGit } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CADRE, DE_BD_INIT, RACINE } from './cadre.js';

// grillhouse-b32, criterion 3 — the first package of a language in a project receives the tools of
// that language, as `nx add` installs a plugin before its first generator: a project of Rust, as
// SyntHub's (SH-13y.6, 0.27.0), whose first package of TypeScript, `packages/interface`, declared
// in its architecture then created by `grillhouse paquet`, leaves `npm run verifier -- --gardes`
// green. Witness: SyntHub's main red, its first package of TypeScript arrived without the tools of
// its language (the index of the interfaces and the boundaries' map « pas à jour », knip unreadable,
// « Turborepo sort en null »). Criterion 2, the command commits nothing.
//
// The trial plays the real cargo, rustc, clippy and sccache of the machine; npm stands in for its
// install alone (the trial's node_modules link this tree's), every other command of npm the real one.

const GRILLHOUSE = path.join(CADRE, 'bin/grillhouse.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'premier-paquet-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const PROJET = path.join(ESSAIS, 'synthub');
const VERSION = (
  JSON.parse(readFileSync(path.join(CADRE, 'package.json'), 'utf8')) as { version: string }
).version;
const GABARIT_CARGO = JSON.parse(
  readFileSync(path.join(RACINE, 'templates/cargo/package.json'), 'utf8')
) as { scripts: Record<string, string>; devDependencies: Record<string, string> };

const ecrire = (f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(PROJET, f)), { recursive: true });
  writeFileSync(path.join(PROJET, f), texte);
};
const lire = (f: string) => readFileSync(path.join(PROJET, f), 'utf8');

const TABLE = (lignes: string[]) =>
  `# Architecture\n\nLe projet d'essai.\n\n| Composant | Dépôt | Responsabilité | Langage |\n|---|---|---|---|\n| \`osd\` | OSD | lire un pilote | |\n${lignes.join('\n')}\n`;
const SERVICE = '| service | SyntHub | le service | cargo |';
const INTERFACE = '| interface | SyntHub | ce que le navigateur exécute | typescript |';

// The trial's node_modules: this tree's, the frame's package and its command this tree's own.
function lierLesDependances() {
  const nm = path.join(PROJET, 'node_modules');
  const source = path.join(RACINE, 'node_modules');
  mkdirSync(path.join(nm, '.bin'), { recursive: true });
  mkdirSync(path.join(nm, '@roomi-fields'));
  for (const e of readdirSync(source)) {
    if (!['.bin', '.vite', '.vitest', '@roomi-fields'].includes(e)) {
      symlinkSync(path.join(source, e), path.join(nm, e));
    }
  }
  for (const e of readdirSync(path.join(source, '.bin'))) {
    if (e !== 'grillhouse') {
      symlinkSync(path.join(source, '.bin', e), path.join(nm, '.bin', e));
    }
  }
  symlinkSync(CADRE, path.join(nm, '@roomi-fields/grillhouse'));
  symlinkSync(GRILLHOUSE, path.join(nm, '.bin/grillhouse'));
}

// npm, its install stood in (the dependencies are linked), every other command the real one.
function npmDeLEssai(): string {
  const bin = path.join(ESSAIS, 'outils');
  mkdirSync(bin);
  const vrai = path.join(path.dirname(process.execPath), 'npm');
  writeFileSync(
    path.join(bin, 'npm'),
    `#!/bin/sh\nif [ "$1" = install ]; then exit 0; fi\nexec ${JSON.stringify(vrai)} "$@"\n`,
    { mode: 0o755 }
  );
  // The trial's own launcher of rustc, which the module cargo keeps without sccache: the server of
  // sccache binds a socket under the temporary directory of the pass, past its 108 bytes under the
  // nested bases of this run (./sccache-en-enveloppe.nuit.spec.ts plays sccache itself).
  writeFileSync(path.join(bin, 'rustc-direct'), '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });
  ecrire(
    '.cargo/config.toml',
    `[build]\nrustc-wrapper = ${JSON.stringify(path.join(bin, 'rustc-direct'))}\n`
  );
  return bin;
}

const ENV = (bin: string): NodeJS.ProcessEnv => ({
  ...process.env,
  PATH: `${bin}:${process.env.PATH ?? ''}`,
  ...configGit([
    ['user.name', 'Essai'],
    ['user.email', 'essai@example.invalid'],
  ]),
});

const git = (...args: string[]) =>
  spawnSync('git', ['-C', PROJET, ...args], { encoding: 'utf8', env: ENV('') });

let creation: ReturnType<typeof spawnSync>;
let gardes: ReturnType<typeof spawnSync>;
beforeAll(() => {
  // A project of Rust, green before its first package of TypeScript.
  ecrire(
    'Cargo.toml',
    '[workspace]\nmembers = ["crates/service"]\nresolver = "2"\n\n[workspace.package]\nversion = "0.1.0"\nedition = "2021"\npublish = false\n'
  );
  ecrire(
    'crates/service/Cargo.toml',
    '[package]\nname = "service"\nversion.workspace = true\nedition.workspace = true\npublish.workspace = true\n\n[dependencies]\n'
  );
  ecrire('crates/service/src/lib.rs', '//! The service.\n');
  ecrire(
    'crates/service/docs/INTERFACE.md',
    '# service — interface\n\nLe service du projet d’essai.\n\n**Langage** : cargo\n'
  );
  ecrire(
    'Cargo.lock',
    '# This file is automatically @generated by Cargo.\n# It is not intended for manual editing.\nversion = 4\n\n[[package]]\nname = "service"\nversion = "0.1.0"\n'
  );
  ecrire(
    'package.json',
    `${JSON.stringify(
      {
        name: 'synthub',
        private: true,
        scripts: GABARIT_CARGO.scripts,
        devDependencies: {
          '@roomi-fields/grillhouse': `^${VERSION}`,
          'smol-toml': GABARIT_CARGO.devDependencies['smol-toml'],
        },
        grillhouse: { version: VERSION },
      },
      null,
      2
    )}\n`
  );
  // The key the preparation writes after `bd init` (scripts/prefixe-des-tickets.mjs): the guard of
  // the titles reads the prefix there.
  ecrire('.beads/config.yaml', `${DE_BD_INIT}issue-prefix: "synthub"\n`);
  ecrire('.gitignore', 'node_modules/\ntarget/\n.turbo/\n');
  ecrire('docs/ARCHITECTURE.md', TABLE([SERVICE]));
  lierLesDependances();
  const bin = npmDeLEssai();
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-qm', 'chore: the project of Rust');
  // The second time: the row of the package, with its language, and its framework.
  ecrire('docs/ARCHITECTURE.md', TABLE([SERVICE, INTERFACE]));
  ecrire(
    'packages/interface/docs/CADRE.md',
    '# interface — cadre\n\n## Rôle\n\n- R1. Ce que le navigateur exécute.\n'
  );
  // The third time.
  creation = spawnSync(process.execPath, [GRILLHOUSE, 'paquet', 'packages/interface'], {
    cwd: PROJET,
    encoding: 'utf8',
    env: ENV(bin),
    timeout: 300_000,
  });
  gardes = spawnSync('npm', ['run', 'verifier', '--', '--gardes'], {
    cwd: PROJET,
    encoding: 'utf8',
    env: ENV(bin),
    timeout: 600_000,
  });
}, 900_000);

const sortie = (r: ReturnType<typeof spawnSync>) => `${String(r.stdout)}\n${String(r.stderr)}`;

describe('grillhouse-b32, critère 3 — le premier paquet d’un langage reçoit ses outils', () => {
  it('grillhouse paquet creates the package of TypeScript of a project of Rust', () => {
    expect(creation.status, sortie(creation)).toBe(0);
    expect(existsSync(path.join(PROJET, 'packages/interface/package.json'))).toBe(true);
  });

  it('the project receives the tools of TypeScript, its turbo.json and its generated files', () => {
    const p = JSON.parse(lire('package.json')) as {
      devDependencies: Record<string, string>;
      workspaces: string[];
    };
    for (const outil of ['turbo', 'knip', 'dependency-cruiser']) {
      expect(p.devDependencies[outil], outil).toBeDefined();
    }
    expect(p.workspaces).toEqual(['packages/interface']);
    expect(existsSync(path.join(PROJET, 'turbo.json'))).toBe(true);
    expect(existsSync(path.join(PROJET, '.dependency-cruiser.cjs'))).toBe(true);
    expect(lire('docs/agents/index-des-interfaces.md')).toContain('packages/interface');
  });

  it('npm run verifier -- --gardes is green', () => {
    expect(gardes.status, sortie(gardes)).toBe(0);
  });

  it('criterion 2: the command commits nothing', () => {
    expect(git('rev-list', '--count', 'HEAD').stdout.trim()).toBe('1');
    expect(git('status', '--porcelain').stdout).toContain('packages/');
  });
});
