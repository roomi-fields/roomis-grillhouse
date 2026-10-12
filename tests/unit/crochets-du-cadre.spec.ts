import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { mettreAJour } from '../../scripts/grillhouse-maj.mjs';
import { claudeSubstitut } from '../claude-substitut.js';

// grillhouse-3uv.59.1: the frame's git hooks — commit-msg (« un ticket, un commit »,
// scripts/un-commit-par-ticket.mjs) and pre-push (the night branch guard, scripts/branche-de-nuit.mjs)
// — are placed by one mechanism, which the installation (scripts/setup.sh) and the update of the
// frame (scripts/grillhouse-maj.mjs) both call; the session start (scripts/session-start.sh) names
// each frame hook that is absent.
//
// A hook is judged where git reads it (`git rev-parse --git-path hooks`) and by what it does: the
// commit-msg hook refuses a second delivery of a ticket, the pre-push hook refuses a push to the
// night branch outside the night.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'crochets-du-cadre-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../..');
const SETUP = 'scripts/setup.sh';
const SESSION = path.join(DEPOT, 'scripts/session-start.sh');

// The Beads section of the pre-push hook, markers included, as Beads 1.2.2 writes it.
const SECTION_BEADS = (() => {
  const texte = readFileSync(path.join(DEPOT, '.beads/hooks/pre-push'), 'utf8');
  const m =
    /# --- BEGIN BEADS INTEGRATION v1\.2\.2 ---\n[\s\S]*?# --- END BEADS INTEGRATION v1\.2\.2 ---\n/.exec(
      texte
    );
  if (!m) {
    throw new Error('the Beads section of .beads/hooks/pre-push is missing');
  }
  return m[0];
})();
const PRE_PUSH_BEADS = `#!/usr/bin/env sh\n${SECTION_BEADS}`;

// The commit-msg hook the previous scripts/setup.sh wrote, byte for byte.
const COMMIT_MSG_ANCIEN = [
  '#!/usr/bin/env sh',
  '# One ticket, one commit (Grillhouse): a second commit for a ticket whose delivery stands is refused; a revert (Revert "…", Reapply "…") passes and withdraws the delivery it names.',
  'exec node "$(git rev-parse --show-toplevel)/scripts/un-commit-par-ticket.mjs" "$1"',
  '',
].join('\n');

const NPM_REEL = execFileSync('bash', ['-c', 'command -v npm'], { encoding: 'utf8' }).trim();

// The tools scripts/setup.sh and the hooks call, simulated: Beads (its init writes the Beads
// pre-push section into .beads/hooks when the hook is missing, as Beads does; its prefix is
// `demo`), CodeGraph, and npm, whose install does nothing.
function outils() {
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  const beads = path.join(bin, 'pre-push-beads');
  writeFileSync(beads, PRE_PUSH_BEADS);
  writeFileSync(
    path.join(bin, 'bd'),
    [
      '#!/bin/sh',
      'case "$1" in',
      '  config) echo demo;;',
      `  init) mkdir -p .beads/hooks; [ -f .beads/hooks/pre-push ] || { cp "${beads}" .beads/hooks/pre-push; chmod +x .beads/hooks/pre-push; };;`,
      '  hooks) cat > /dev/null;;',
      "  list) echo '[]';;",
      'esac',
      'exit 0',
      '',
    ].join('\n'),
    { mode: 0o755 }
  );
  writeFileSync(
    path.join(bin, 'codegraph'),
    '#!/bin/sh\n[ "$1" = init ] && mkdir -p "$2/.codegraph"\nexit 0\n',
    { mode: 0o755 }
  );
  writeFileSync(
    path.join(bin, 'npm'),
    `#!/bin/sh\ncase " $* " in *" install "*|*" i "*) exit 0;; esac\nexec "${NPM_REEL}" "$@"\n`,
    { mode: 0o755 }
  );
  return bin;
}
const BIN = outils();
// The claude command, stood in: no test launches the real one (grillhouse-3uv.71, critère 6). The
// marketplace the framework's settings declare, added from its GitHub repository, takes the name its
// catalogue gives, roomi-fields, as the real command does.
const CLAUDE = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')), {
  noms: { 'roomi-fields/claude-plugins': 'roomi-fields' },
});

// The environment of a human's command: the simulated tools first, a home of its own (no global
// git configuration), without the night's mark.
const MAISON = mkdtempSync(path.join(ESSAIS, 'maison-'));
const ENV: NodeJS.ProcessEnv = (() => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${BIN}:${CLAUDE.bin}:${process.env.PATH}`,
    HOME: MAISON,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
  };
  delete env.GRILLHOUSE_NUIT;
  delete env.CLAUDE_PROJECT_DIR;
  return env;
})();

const git = (repo: string, ...a: string[]) =>
  execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: ENV });
const gitBrut = (repo: string, ...a: string[]) =>
  spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: ENV });

// The folder git reads the hooks from.
const dossierLu = (repo: string) =>
  path.resolve(repo, git(repo, 'rev-parse', '--git-path', 'hooks').trim());
const crochetLu = (repo: string, nom: string) => path.join(dossierLu(repo), nom);
const lireSi = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');

// Every file of the folder git reads the hooks from, with its mode, and the local configuration.
function etat(repo: string) {
  const d = dossierLu(repo);
  const fichiers = existsSync(d)
    ? readdirSync(d)
        .sort()
        .map(f => `${f} ${statSync(path.join(d, f)).mode.toString(8)}\n${lireSi(path.join(d, f))}`)
    : [];
  return { fichiers, config: git(repo, 'config', '--local', '--list') };
}

// A project directory with the frame's scripts and a package.json; `depot`: a git repository
// already, `hooksPath`: its core.hooksPath set to .beads/hooks.
function projet({ depot = true, hooksPath = false } = {}) {
  const repo = mkdtempSync(path.join(ESSAIS, 'projet-'));
  cpSync(path.join(DEPOT, 'scripts'), path.join(repo, 'scripts'), { recursive: true });
  mkdirSync(path.join(repo, '.claude/skills/testeur'), { recursive: true });
  writeFileSync(
    path.join(repo, 'package.json'),
    `${JSON.stringify({ name: 'p', grillhouse: { poussee: { nuit: 'main' } } }, null, 2)}\n`
  );
  writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n.codegraph/\n');
  if (depot) {
    git(repo, 'init', '-q', '-b', 'main');
    if (hooksPath) {
      git(repo, 'config', 'core.hooksPath', '.beads/hooks');
    }
  }
  return repo;
}

// Writes `texte` as the hook `nom` in `dossier` of the project, executable.
function poser(repo: string, dossier: string, nom: string, texte: string) {
  mkdirSync(path.join(repo, dossier), { recursive: true });
  writeFileSync(path.join(repo, dossier, nom), texte);
  chmodSync(path.join(repo, dossier, nom), 0o755);
}

const installer = (repo: string) => {
  const r = spawnSync('bash', [path.join(repo, SETUP)], { encoding: 'utf8', env: ENV });
  expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
  return r;
};
const mettreAJourProjet = (repo: string) => mettreAJour(repo, DEPOT, 'essai');

// The commit-msg hook of the frame at work: a first delivery of demo-1 passes, a second is refused.
function verifierUnCommitParTicket(repo: string) {
  writeFileSync(path.join(repo, 'premier'), '1');
  git(repo, 'add', '-A');
  const premier = gitBrut(repo, 'commit', '-q', '-m', 'feat: first delivery (demo-1)');
  expect(premier.status, premier.stderr).toBe(0);
  const second = gitBrut(repo, 'commit', '-q', '--allow-empty', '-m', 'fix: lot 2 of demo-1');
  expect(second.status, `the second delivery of demo-1 passed\n${second.stderr}`).not.toBe(0);
  expect(second.stderr).toMatch(/une seule livraison/);
}

// The pre-push hook of the frame at work: with poussee.nuit = main, a push to main is refused
// outside the night, and main is unchanged on the remote.
function verifierGardeDeNuit(repo: string) {
  if (gitBrut(repo, 'rev-parse', '-q', '--verify', 'HEAD').status !== 0) {
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '--no-verify', '-m', 'base');
  }
  const distant = mkdtempSync(path.join(ESSAIS, 'distant-'));
  execFileSync('git', ['init', '-q', '--bare', distant], { env: ENV });
  if (gitBrut(repo, 'remote', 'get-url', 'origin').status !== 0) {
    git(repo, 'remote', 'add', 'origin', distant);
  }
  const r = gitBrut(repo, 'push', 'origin', 'HEAD:main');
  expect(r.status, `the push to the night branch passed\n${r.stderr}`).not.toBe(0);
  expect(
    r.stderr.split('\n').some(l => /seule la nuit/i.test(l) && /vert/i.test(l)),
    r.stderr
  ).toBe(true);
  expect(
    spawnSync('git', ['--git-dir', distant, 'rev-parse', '-q', '--verify', 'refs/heads/main'], {
      encoding: 'utf8',
    }).stdout.trim()
  ).toBe('');
}

// Both frame hooks present, executable, where git reads them, and at work.
function verifierLesDeux(repo: string) {
  for (const nom of ['commit-msg', 'pre-push']) {
    const f = crochetLu(repo, nom);
    expect(existsSync(f), `${nom} is missing in ${dossierLu(repo)}`).toBe(true);
    expect(readFileSync(f, 'utf8').startsWith('#!'), nom).toBe(true);
    expect(statSync(f).mode & 0o111, nom).toBe(0o111);
  }
  verifierUnCommitParTicket(repo);
  verifierGardeDeNuit(repo);
}

const occurrences = (texte: string, ligne: string) =>
  texte.split('\n').filter(l => l === ligne).length;

// The non-comment lines of a script that name `cible`.
const nomme = (texte: string, cible: string) =>
  texte
    .split('\n')
    .filter(l => !/^\s*(#|\/\/|\*)/.test(l))
    .some(l => l.includes(cible));

function fichiersDeScripts(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) {
      return fichiersDeScripts(p);
    }
    return /\.(sh|mjs|js|cjs)$/.test(e.name) ? [p] : [];
  });
}

describe('grillhouse-3uv.59.1 critère 1 — one mechanism places the frame’s git hooks', () => {
  it('critère 1: the old placing of scripts/setup.sh is gone — it writes no hook itself', () => {
    const texte = readFileSync(path.join(DEPOT, SETUP), 'utf8');
    for (const cible of ['un-commit-par-ticket', 'branche-de-nuit', 'commit-msg', 'pre-push']) {
      expect(nomme(texte, cible), `scripts/setup.sh still names ${cible}`).toBe(false);
    }
  });
  it('critère 1: the commands of both hooks are written in one file of scripts/, the same one', () => {
    const scripts = fichiersDeScripts(path.join(DEPOT, 'scripts')).filter(
      f => !/\/(un-commit-par-ticket|branche-de-nuit)\.mjs$/.test(f)
    );
    const porteurs = (cible: string) =>
      scripts
        .filter(f => nomme(readFileSync(f, 'utf8'), cible))
        .map(f => path.relative(DEPOT, f))
        .sort();
    const commitMsg = porteurs('scripts/un-commit-par-ticket.mjs');
    const prePush = porteurs('scripts/branche-de-nuit.mjs');
    expect(commitMsg.length, commitMsg.join(', ')).toBe(1);
    expect(prePush).toEqual(commitMsg);
  });
  it('critère 1: the installation and the update write the same hooks', () => {
    const installe = projet({ hooksPath: true });
    installer(installe);
    const misAJour = projet({ hooksPath: true });
    poser(misAJour, '.beads/hooks', 'pre-push', PRE_PUSH_BEADS);
    mettreAJourProjet(misAJour);
    for (const nom of ['commit-msg', 'pre-push']) {
      expect(lireSi(crochetLu(misAJour, nom)), nom).toBe(lireSi(crochetLu(installe, nom)));
    }
  });
});

describe('grillhouse-3uv.59.1 critère 2 — a new project has both hooks from its installation', () => {
  it('critère 2: a directory that is not yet a git repository, installed, refuses a second delivery and a push to the night branch', () => {
    const repo = projet({ depot: false });
    installer(repo);
    verifierLesDeux(repo);
  });
  it('critère 2: the installation keeps the Beads section of pre-push, once', () => {
    const repo = projet({ depot: false });
    installer(repo);
    const texte = lireSi(crochetLu(repo, 'pre-push'));
    expect(texte.split(SECTION_BEADS).length - 1).toBe(1);
  });
  it('critère 2: a project installed whose core.hooksPath is already set elsewhere gets both hooks there', () => {
    const repo = projet();
    git(repo, 'config', 'core.hooksPath', 'crochets');
    installer(repo);
    expect(dossierLu(repo)).toBe(path.join(repo, 'crochets'));
    verifierLesDeux(repo);
  });
  it('critère 2: a project updated without core.hooksPath (hooks in .git/hooks), then installed, has both hooks where git reads them', () => {
    const repo = projet();
    mettreAJourProjet(repo);
    installer(repo);
    verifierLesDeux(repo);
  });
});

describe('grillhouse-3uv.59.1 critère 3 — an updated project has both hooks, where git reads them', () => {
  const cas = [
    { titre: 'with core.hooksPath = .beads/hooks', hooksPath: true, dossier: '.beads/hooks' },
    { titre: 'without core.hooksPath', hooksPath: false, dossier: '.git/hooks' },
  ];
  for (const { titre, hooksPath, dossier } of cas) {
    it(`critère 3: ${titre}, no hook before: both are created in ${dossier}, configuration unchanged`, () => {
      const repo = projet({ hooksPath });
      const avant = git(repo, 'config', '--local', '--list');
      mettreAJourProjet(repo);
      expect(git(repo, 'config', '--local', '--list')).toBe(avant);
      expect(dossierLu(repo)).toBe(path.join(repo, dossier));
      verifierLesDeux(repo);
    });
    it(`critère 3: ${titre}, the project’s own commit-msg: its line stays once, and still runs`, () => {
      const repo = projet({ hooksPath });
      const trace = path.join(repo, '.git', 'trace-projet');
      const ligne = `echo "projet $1" >> "${trace}"`;
      poser(repo, dossier, 'commit-msg', `#!/bin/sh\n${ligne}\n`);
      mettreAJourProjet(repo);
      expect(occurrences(lireSi(crochetLu(repo, 'commit-msg')), ligne)).toBe(1);
      verifierUnCommitParTicket(repo);
      expect(lireSi(trace), 'the project’s commit-msg line did not run').toMatch(/^projet /);
    });
    it(`critère 3: ${titre}, the project’s own pre-push with Beads: its line and the Beads section stay once`, () => {
      const repo = projet({ hooksPath });
      const ligne = 'echo "pre-push du projet" >&2';
      poser(repo, dossier, 'pre-push', `${PRE_PUSH_BEADS}${ligne}\n`);
      mettreAJourProjet(repo);
      const texte = lireSi(crochetLu(repo, 'pre-push'));
      expect(occurrences(texte, ligne)).toBe(1);
      expect(texte.split(SECTION_BEADS).length - 1).toBe(1);
      verifierGardeDeNuit(repo);
    });
  }
  it('critère 3: the commit-msg the old scripts/setup.sh wrote: the guard stays once and works', () => {
    const repo = projet({ hooksPath: true });
    poser(repo, '.beads/hooks', 'commit-msg', COMMIT_MSG_ANCIEN);
    poser(repo, '.beads/hooks', 'pre-push', PRE_PUSH_BEADS);
    mettreAJourProjet(repo);
    const texte = lireSi(crochetLu(repo, 'commit-msg'));
    expect(texte.split('scripts/un-commit-par-ticket.mjs').length - 1, texte).toBe(1);
    verifierLesDeux(repo);
  });
  it('critère 3: the commit-msg the old scripts/setup.sh wrote, installed again: the guard stays once and works', () => {
    const repo = projet({ hooksPath: true });
    poser(repo, '.beads/hooks', 'commit-msg', COMMIT_MSG_ANCIEN);
    installer(repo);
    const texte = lireSi(crochetLu(repo, 'commit-msg'));
    expect(texte.split('scripts/un-commit-par-ticket.mjs').length - 1, texte).toBe(1);
    verifierLesDeux(repo);
  });
});

describe('grillhouse-3uv.59.1 critère 4 — replayed, the installation and the update change nothing', () => {
  it('critère 4: a second installation leaves the hooks and the configuration as they were', () => {
    const repo = projet({ depot: false });
    installer(repo);
    const premier = etat(repo);
    installer(repo);
    expect(etat(repo)).toEqual(premier);
  });
  for (const hooksPath of [true, false]) {
    it(`critère 4: two more updates leave the hooks and the configuration as they were (core.hooksPath ${hooksPath ? 'set' : 'unset'}, the project’s own lines in both)`, () => {
      const repo = projet({ hooksPath });
      const dossier = hooksPath ? '.beads/hooks' : '.git/hooks';
      poser(repo, dossier, 'commit-msg', '#!/bin/sh\necho "projet" > /dev/null\n');
      poser(repo, dossier, 'pre-push', `${PRE_PUSH_BEADS}echo "projet" > /dev/null\n`);
      mettreAJourProjet(repo);
      const premier = etat(repo);
      mettreAJourProjet(repo);
      mettreAJourProjet(repo);
      expect(etat(repo)).toEqual(premier);
    });
  }
  it('critère 4: an update after the installation, then an installation, change no hook', () => {
    const repo = projet({ depot: false });
    installer(repo);
    const premier = etat(repo);
    mettreAJourProjet(repo);
    expect(etat(repo)).toEqual(premier);
    installer(repo);
    expect(etat(repo)).toEqual(premier);
  });
});

// What the session start may say of each frame hook: its name, or the words that describe it.
const DESIGNE: Record<string, RegExp> = {
  'commit-msg': /commit-msg|un ticket, un commit/i,
  'pre-push': /pre-push|garde de (la )?nuit|branche de (la )?nuit/i,
};

// The session start in a project tree. `nomme(nom)`: its output names the hook by its git name;
// `parle(nom)`: its output speaks of the hook in any of its words.
function demarrer(repo: string) {
  const r = spawnSync('bash', [SESSION], {
    encoding: 'utf8',
    env: { ...ENV, CLAUDE_PROJECT_DIR: repo },
  });
  expect(r.status, r.stderr).toBe(0);
  return {
    sortie: r.stdout,
    nomme: (nom: string) => new RegExp(`(^|[^\\w-])${nom}([^\\w-]|$)`).test(r.stdout),
    parle: (nom: string) => DESIGNE[nom].test(r.stdout),
  };
}

describe('grillhouse-3uv.59.1 critère 5 — the session start names each absent frame hook', () => {
  it('critère 5: no hook at all: commit-msg and pre-push are both named', () => {
    const repo = projet();
    const s = demarrer(repo);
    expect(s.nomme('commit-msg'), s.sortie).toBe(true);
    expect(s.nomme('pre-push'), s.sortie).toBe(true);
  });
  for (const hooksPath of [true, false]) {
    const ou = hooksPath ? 'in .beads/hooks (core.hooksPath)' : 'in .git/hooks (no core.hooksPath)';
    it(`critère 5: both frame hooks ${ou}: neither is named`, () => {
      const repo = projet({ hooksPath });
      mettreAJourProjet(repo);
      const s = demarrer(repo);
      expect(s.parle('commit-msg'), s.sortie).toBe(false);
      expect(s.parle('pre-push'), s.sortie).toBe(false);
    });
    it(`critère 5: ${ou}, commit-msg removed: commit-msg alone is named`, () => {
      const repo = projet({ hooksPath });
      mettreAJourProjet(repo);
      rmSync(crochetLu(repo, 'commit-msg'), { force: true });
      const s = demarrer(repo);
      expect(s.nomme('commit-msg'), s.sortie).toBe(true);
      expect(s.parle('pre-push'), s.sortie).toBe(false);
    });
    it(`critère 5: ${ou}, pre-push removed: pre-push alone is named`, () => {
      const repo = projet({ hooksPath });
      mettreAJourProjet(repo);
      rmSync(crochetLu(repo, 'pre-push'), { force: true });
      const s = demarrer(repo);
      expect(s.nomme('pre-push'), s.sortie).toBe(true);
      expect(s.parle('commit-msg'), s.sortie).toBe(false);
    });
  }
  it('critère 5: a pre-push without the frame’s guard (Beads only) is named, the frame’s commit-msg is not', () => {
    const repo = projet({ hooksPath: true });
    mettreAJourProjet(repo);
    writeFileSync(crochetLu(repo, 'pre-push'), PRE_PUSH_BEADS);
    const s = demarrer(repo);
    expect(s.nomme('pre-push'), s.sortie).toBe(true);
    expect(s.parle('commit-msg'), s.sortie).toBe(false);
  });
  it('critère 5: a commit-msg of the project without the frame’s guard is named', () => {
    const repo = projet({ hooksPath: true });
    mettreAJourProjet(repo);
    writeFileSync(crochetLu(repo, 'commit-msg'), '#!/bin/sh\nexit 0\n');
    const s = demarrer(repo);
    expect(s.nomme('commit-msg'), s.sortie).toBe(true);
  });
  it('critère 5: frame hooks in .beads/hooks while git reads .git/hooks are absent, and named', () => {
    const repo = projet({ hooksPath: true });
    mettreAJourProjet(repo);
    git(repo, 'config', '--unset', 'core.hooksPath');
    const s = demarrer(repo);
    expect(s.nomme('commit-msg'), s.sortie).toBe(true);
    expect(s.nomme('pre-push'), s.sortie).toBe(true);
  });
  it('critère 5: after the installation, neither hook is named', () => {
    const repo = projet({ depot: false });
    installer(repo);
    const s = demarrer(repo);
    expect(s.parle('commit-msg'), s.sortie).toBe(false);
    expect(s.parle('pre-push'), s.sortie).toBe(false);
  });
});
