import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CROCHETS } from '../../scripts/crochets.mjs';
import { mettreAJour } from '../../scripts/grillhouse-maj.mjs';
import { claudeSubstitut } from '../claude-substitut.js';

// The frame's git hooks, on Husky's model (grillhouse-3uv.84.5, after grillhouse-3uv.59.1):
// commit-msg (« un ticket fermé garde sa livraison », scripts/un-commit-par-ticket.mjs) and pre-push
// (the night branch guard, scripts/branche-de-nuit.mjs).
// - `grillhouse hooks` places both in the folder git reads, beside Beads' sections, and rewrites a
//   line of the frame of a former version; the update of the frame (scripts/grillhouse-maj.mjs)
//   places the same.
// - Each frame hook calls `grillhouse hook <nom>`; without the package installed, it does nothing.
// - A project's `prepare` runs `grillhouse hooks`: the template has it, the update writes it.
// - The session start (scripts/session-start.sh) names each frame hook that is absent.
//
// A hook is judged where git reads it (`git rev-parse --git-path hooks`) and by what it does: the
// commit-msg hook refuses a second delivery of a ticket, the pre-push hook refuses a push to the
// night branch outside the night.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'crochets-du-cadre-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../../../..');
const PAQUET = path.join(DEPOT, 'packages/grillhouse');
const SESSION = path.join(PAQUET, 'scripts/session-start.sh');

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

// The frame's hooks of former versions, byte for byte: the commit-msg the old scripts/setup.sh
// wrote, and the commit-msg and pre-push of grillhouse-3uv.59.1, with the scripts at the root
// (`scripts/`) and then in the package (`packages/grillhouse/scripts/`).
const COMMIT_MSG_SETUP = [
  '#!/usr/bin/env sh',
  '# One ticket, one commit (Grillhouse): a second commit for a ticket whose delivery stands is refused; a revert (Revert "…", Reapply "…") passes and withdraws the delivery it names.',
  'exec node "$(git rev-parse --show-toplevel)/scripts/un-commit-par-ticket.mjs" "$1"',
  '',
].join('\n');
const LIGNES_59_1 = (scripts: string) => ({
  'commit-msg': [
    '# A closed ticket keeps its one delivery (Grillhouse): a second commit for a closed ticket whose delivery stands is refused, a commit for an open (reopened) ticket is a correction and passes; a revert (Revert "…", Reapply "…") passes and withdraws the delivery it names.',
    `node "$(git rev-parse --show-toplevel)/${scripts}/un-commit-par-ticket.mjs" "$1" || exit 1`,
  ],
  'pre-push': [
    '# Night branch guard (Grillhouse): only the night pushes the branch of grillhouse.poussee.nuit, after its green.',
    `_gh_entree=$(mktemp) && cat > "$_gh_entree" && node "$(git rev-parse --show-toplevel)/${scripts}/branche-de-nuit.mjs" "$@" < "$_gh_entree" || { rm -f "$_gh_entree"; exit 1; }`,
    'exec < "$_gh_entree"',
    'rm -f "$_gh_entree"',
  ],
});

const NPM_REEL = execFileSync('bash', ['-c', 'command -v npm'], { encoding: 'utf8' }).trim();

// The tools the hooks and the session start call, simulated: Beads (its prefix is `demo`; its hook
// section reads its standard input), CodeGraph, and npm, whose install does nothing.
function outils() {
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  writeFileSync(
    path.join(bin, 'bd'),
    [
      '#!/bin/sh',
      'case "$1" in',
      '  config) echo demo;;',
      '  hooks) cat > /dev/null;;',
      "  list) echo '[]';;",
      'esac',
      'exit 0',
      '',
    ].join('\n'),
    { mode: 0o755 }
  );
  writeFileSync(path.join(bin, 'codegraph'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(
    path.join(bin, 'npm'),
    `#!/bin/sh\ncase " $* " in *" install "*|*" i "*) exit 0;; esac\nexec "${NPM_REEL}" "$@"\n`,
    { mode: 0o755 }
  );
  return bin;
}
const BIN = outils();
// The claude command, stood in: no test launches the real one (grillhouse-3uv.71, critère 6).
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

// A git repository of a project with the frame's package installed (node_modules/.bin/grillhouse,
// as npm links it) and a package.json whose `prepare` runs `grillhouse hooks`; `paquet: false`:
// without the package; `hooksPath`: its core.hooksPath set to .beads/hooks.
function projet({ paquet = true, hooksPath = false } = {}) {
  const repo = mkdtempSync(path.join(ESSAIS, 'projet-'));
  if (paquet) {
    installerPaquet(repo);
  }
  writeFileSync(
    path.join(repo, 'package.json'),
    `${JSON.stringify(
      {
        name: 'p',
        scripts: { prepare: 'grillhouse hooks' },
        grillhouse: { poussee: { nuit: 'main' } },
      },
      null,
      2
    )}\n`
  );
  writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n');
  git(repo, 'init', '-q', '-b', 'main');
  if (hooksPath) {
    git(repo, 'config', 'core.hooksPath', '.beads/hooks');
  }
  return repo;
}

// The frame's package in the project's node_modules, linked as npm links an installed package.
function installerPaquet(repo: string) {
  mkdirSync(path.join(repo, 'node_modules/@roomi-fields'), { recursive: true });
  mkdirSync(path.join(repo, 'node_modules/.bin'), { recursive: true });
  symlinkSync(PAQUET, path.join(repo, 'node_modules/@roomi-fields/grillhouse'));
  symlinkSync(
    '../@roomi-fields/grillhouse/bin/grillhouse.mjs',
    path.join(repo, 'node_modules/.bin/grillhouse')
  );
}

// Writes `texte` as the hook `nom` in `dossier` of the project, executable.
function poser(repo: string, dossier: string, nom: string, texte: string) {
  mkdirSync(path.join(repo, dossier), { recursive: true });
  writeFileSync(path.join(repo, dossier, nom), texte);
  chmodSync(path.join(repo, dossier, nom), 0o755);
}

// `grillhouse hooks`, the project's command, in the project.
const hooks = (repo: string) => {
  const r = spawnSync(path.join(repo, 'node_modules/.bin/grillhouse'), ['hooks'], {
    cwd: repo,
    encoding: 'utf8',
    env: ENV,
  });
  expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
  return r;
};
const mettreAJourProjet = (repo: string) => mettreAJour(repo, DEPOT);

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

// A bare remote, added as origin of the project after a first commit when it has none.
function distant(repo: string) {
  if (gitBrut(repo, 'rev-parse', '-q', '--verify', 'HEAD').status !== 0) {
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '--no-verify', '-m', 'base');
  }
  const d = mkdtempSync(path.join(ESSAIS, 'distant-'));
  execFileSync('git', ['init', '-q', '--bare', d], { env: ENV });
  git(repo, 'remote', 'add', 'origin', d);
  return d;
}
const brancheDistante = (d: string) =>
  spawnSync('git', ['--git-dir', d, 'rev-parse', '-q', '--verify', 'refs/heads/main'], {
    encoding: 'utf8',
  }).stdout.trim();

// The pre-push hook of the frame at work: with poussee.nuit = main, a push to main is refused
// outside the night, and main is unchanged on the remote.
function verifierGardeDeNuit(repo: string) {
  const d = distant(repo);
  const r = gitBrut(repo, 'push', 'origin', 'HEAD:main');
  expect(r.status, `the push to the night branch passed\n${r.stderr}`).not.toBe(0);
  expect(
    r.stderr.split('\n').some(l => /seule la nuit/i.test(l) && /vert/i.test(l)),
    r.stderr
  ).toBe(true);
  expect(brancheDistante(d)).toBe('');
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
// The frame's lines of the hook `nom`, as `grillhouse hooks` writes them.
const BLOC = (nom: keyof typeof CROCHETS) => `${CROCHETS[nom].lignes.join('\n')}\n`;
const blocs = (texte: string, nom: keyof typeof CROCHETS) => texte.split(BLOC(nom)).length - 1;

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

describe('grillhouse-3uv.84.5 critère 1 — grillhouse hooks places the frame’s hooks beside Beads’ sections', () => {
  const cas = [
    { titre: 'with core.hooksPath = .beads/hooks', hooksPath: true, dossier: '.beads/hooks' },
    { titre: 'without core.hooksPath', hooksPath: false, dossier: '.git/hooks' },
  ];
  for (const { titre, hooksPath, dossier } of cas) {
    it(`critère 1: ${titre}, no hook before: both are created in ${dossier}, configuration unchanged`, () => {
      const repo = projet({ hooksPath });
      const avant = git(repo, 'config', '--local', '--list');
      hooks(repo);
      expect(git(repo, 'config', '--local', '--list')).toBe(avant);
      expect(dossierLu(repo)).toBe(path.join(repo, dossier));
      verifierLesDeux(repo);
    });
    it(`critère 1: ${titre}, the project’s own commit-msg: its line stays once, and still runs`, () => {
      const repo = projet({ hooksPath });
      const trace = path.join(repo, '.git', 'trace-projet');
      const ligne = `echo "projet $1" >> "${trace}"`;
      poser(repo, dossier, 'commit-msg', `#!/bin/sh\n${ligne}\n`);
      hooks(repo);
      expect(occurrences(lireSi(crochetLu(repo, 'commit-msg')), ligne)).toBe(1);
      verifierUnCommitParTicket(repo);
      expect(lireSi(trace), 'the project’s commit-msg line did not run').toMatch(/^projet /);
    });
    it(`critère 1: ${titre}, the project’s own pre-push with Beads: its line and the Beads section stay once`, () => {
      const repo = projet({ hooksPath });
      const ligne = 'echo "pre-push du projet" >&2';
      poser(repo, dossier, 'pre-push', `${PRE_PUSH_BEADS}${ligne}\n`);
      hooks(repo);
      const texte = lireSi(crochetLu(repo, 'pre-push'));
      expect(occurrences(texte, ligne)).toBe(1);
      expect(texte.split(SECTION_BEADS).length - 1).toBe(1);
      verifierGardeDeNuit(repo);
    });
  }
  it('critère 1: a core.hooksPath set elsewhere receives both hooks there', () => {
    const repo = projet();
    git(repo, 'config', 'core.hooksPath', 'crochets');
    hooks(repo);
    expect(dossierLu(repo)).toBe(path.join(repo, 'crochets'));
    verifierLesDeux(repo);
  });
  it('critère 1: the commit-msg the old scripts/setup.sh wrote (exec node …/scripts/un-commit-par-ticket.mjs) is rewritten: no script path stays, the guard is there once and works', () => {
    const repo = projet({ hooksPath: true });
    poser(repo, '.beads/hooks', 'commit-msg', COMMIT_MSG_SETUP);
    hooks(repo);
    const texte = lireSi(crochetLu(repo, 'commit-msg'));
    expect(texte, texte).not.toMatch(/un-commit-par-ticket\.mjs|One ticket, one commit/);
    expect(blocs(texte, 'commit-msg'), texte).toBe(1);
    verifierLesDeux(repo);
  });
  it('critère 1: BPScript’s commit-msg (its own comment, then exec node …/scripts/un-commit-par-ticket.mjs) keeps its comment and receives the guard in place of the exec', () => {
    const repo = projet({ hooksPath: true });
    const commentaire = '# UN TICKET, UN COMMIT — refuse un commit dont le sujet nomme un ticket';
    poser(
      repo,
      '.beads/hooks',
      'commit-msg',
      [
        '#!/usr/bin/env sh',
        commentaire,
        '# (`scripts/un-commit-par-ticket.mjs`, avec le fichier du message).',
        'exec node "$(git rev-parse --show-toplevel)/scripts/un-commit-par-ticket.mjs" "$1"',
        '',
      ].join('\n')
    );
    hooks(repo);
    expect(lireSi(crochetLu(repo, 'commit-msg'))).toBe(
      `#!/usr/bin/env sh\n${commentaire}\n${BLOC('commit-msg')}`
    );
    verifierLesDeux(repo);
  });
  for (const scripts of ['scripts', 'packages/grillhouse/scripts']) {
    it(`critère 1: the hooks of grillhouse-3uv.59.1 (${scripts}/), beside the project’s lines and Beads’ section, are rewritten in their place`, () => {
      const repo = projet({ hooksPath: true });
      const anciennes = LIGNES_59_1(scripts);
      const avant = 'echo "avant" > /dev/null';
      const apres = 'echo "apres" > /dev/null';
      poser(
        repo,
        '.beads/hooks',
        'commit-msg',
        `#!/bin/sh\n${avant}\n${anciennes['commit-msg'].join('\n')}\n${apres}\n`
      );
      poser(
        repo,
        '.beads/hooks',
        'pre-push',
        `#!/usr/bin/env sh\n${anciennes['pre-push'].join('\n')}\n${SECTION_BEADS}`
      );
      hooks(repo);
      const commitMsg = lireSi(crochetLu(repo, 'commit-msg'));
      expect(commitMsg).toBe(`#!/bin/sh\n${avant}\n${BLOC('commit-msg')}${apres}\n`);
      const prePush = lireSi(crochetLu(repo, 'pre-push'));
      expect(prePush).toBe(`#!/usr/bin/env sh\n${BLOC('pre-push')}${SECTION_BEADS}`);
      verifierLesDeux(repo);
    });
  }
  it('critère 1: replayed, grillhouse hooks changes nothing', () => {
    const repo = projet({ hooksPath: true });
    poser(repo, '.beads/hooks', 'commit-msg', '#!/bin/sh\necho "projet" > /dev/null\n');
    poser(repo, '.beads/hooks', 'pre-push', `${PRE_PUSH_BEADS}echo "projet" > /dev/null\n`);
    hooks(repo);
    const premier = etat(repo);
    hooks(repo);
    hooks(repo);
    expect(etat(repo)).toEqual(premier);
  });
  for (const hooksPath of [true, false]) {
    it(`critère 1: the update writes the hooks grillhouse hooks writes, and neither changes them again (core.hooksPath ${hooksPath ? 'set' : 'unset'})`, () => {
      const parCommande = projet({ hooksPath });
      hooks(parCommande);
      const parMaj = projet({ hooksPath });
      mettreAJourProjet(parMaj);
      for (const nom of ['commit-msg', 'pre-push']) {
        expect(lireSi(crochetLu(parMaj, nom)), nom).toBe(lireSi(crochetLu(parCommande, nom)));
      }
      const premier = etat(parMaj);
      mettreAJourProjet(parMaj);
      hooks(parMaj);
      expect(etat(parMaj)).toEqual(premier);
    });
  }
  it('critère 1: the guards’ scripts are named in one file of scripts/, which places the hooks', () => {
    const scripts = fichiersDeScripts(path.join(PAQUET, 'scripts')).filter(
      f => !/\/(un-commit-par-ticket|branche-de-nuit)\.mjs$/.test(f)
    );
    const porteurs = (cible: string) =>
      scripts
        .filter(f => nomme(readFileSync(f, 'utf8'), cible))
        .map(f => path.relative(PAQUET, f))
        .sort();
    expect(porteurs('un-commit-par-ticket.mjs')).toEqual(['scripts/crochets.mjs']);
    expect(porteurs('branche-de-nuit.mjs')).toEqual(['scripts/crochets.mjs']);
  });
  it('critère 1: the preparation of grillhouse init (scripts/preparation.mjs) places no hook: its npm install runs prepare', () => {
    const texte = readFileSync(path.join(PAQUET, 'scripts/preparation.mjs'), 'utf8');
    for (const cible of ['crochets', 'grillhouse hooks', 'commit-msg', 'pre-push']) {
      expect(nomme(texte, cible), `scripts/preparation.mjs still names ${cible}`).toBe(false);
    }
  });
});

describe('grillhouse-3uv.84.5 critère 2 — each frame hook calls grillhouse hook <nom>, and does nothing without the package', () => {
  it('critère 2: the frame’s lines call grillhouse hook <nom>, and name no script of the frame', () => {
    for (const nom of ['commit-msg', 'pre-push'] as const) {
      const bloc = BLOC(nom);
      expect(bloc, nom).toMatch(new RegExp(`node_modules/\\.bin/grillhouse\\b[^\\n]*`));
      expect(bloc, nom).toContain(`hook ${nom} "$@"`);
      expect(bloc, nom).not.toMatch(/\.mjs|scripts\//);
    }
  });
  it('critère 2: grillhouse hook with an unknown name refuses, exit code 2', () => {
    const repo = projet();
    const r = spawnSync(path.join(repo, 'node_modules/.bin/grillhouse'), ['hook', 'zut'], {
      cwd: repo,
      encoding: 'utf8',
      env: ENV,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('zut');
  });
  it('critère 2: without the package installed, a second delivery and a push to the night branch pass, without a word of the frame', () => {
    const repo = projet({ hooksPath: true });
    poser(repo, '.beads/hooks', 'pre-push', PRE_PUSH_BEADS);
    hooks(repo);
    rmSync(path.join(repo, 'node_modules'), { recursive: true, force: true });
    writeFileSync(path.join(repo, 'premier'), '1');
    git(repo, 'add', '-A');
    for (const message of ['feat: first delivery (demo-1)', 'fix: lot 2 of demo-1']) {
      const r = gitBrut(repo, 'commit', '-q', '--allow-empty', '-m', message);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stderr).toBe('');
    }
    const d = distant(repo);
    const r = gitBrut(repo, 'push', '-q', 'origin', 'HEAD:main');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toBe('');
    expect(brancheDistante(d)).not.toBe('');
  });
});

type Paquet = { scripts?: Record<string, string> };
const lirePaquet = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Paquet;

describe('grillhouse-3uv.84.5 critère 3 — a project’s prepare runs grillhouse hooks', () => {
  it('critère 3: the template’s prepare runs grillhouse hooks first', () => {
    const prepare = lirePaquet(path.join(DEPOT, 'templates/projet/package.json')).scripts?.prepare;
    expect(prepare?.split(' && ')[0]).toBe('grillhouse hooks');
  });
  it('critère 3: npm install’s prepare places both hooks where git reads them', () => {
    const repo = projet({ hooksPath: true });
    const r = spawnSync('npm', ['run', '--silent', 'prepare'], {
      cwd: repo,
      encoding: 'utf8',
      env: ENV,
    });
    expect(r.status, r.stderr).toBe(0);
    verifierLesDeux(repo);
  });
  const prepares: [string, string | undefined, string][] = [
    ['without prepare', undefined, 'grillhouse hooks'],
    ['with a prepare of its own', 'npm run build', 'grillhouse hooks && npm run build'],
    ['with grillhouse hooks already', 'grillhouse hooks && tsc', 'grillhouse hooks && tsc'],
  ];
  for (const [titre, avant, attendu] of prepares) {
    it(`critère 3: the update writes the prepare of a project ${titre}, and replayed changes it no more`, () => {
      const repo = projet();
      const f = path.join(repo, 'package.json');
      const p = lirePaquet(f);
      p.scripts = avant === undefined ? {} : { prepare: avant };
      writeFileSync(f, `${JSON.stringify(p, null, 2)}\n`);
      mettreAJourProjet(repo);
      expect(lirePaquet(f).scripts?.prepare).toBe(attendu);
      mettreAJourProjet(repo);
      expect(lirePaquet(f).scripts?.prepare).toBe(attendu);
    });
  }
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
      hooks(repo);
      const s = demarrer(repo);
      expect(s.parle('commit-msg'), s.sortie).toBe(false);
      expect(s.parle('pre-push'), s.sortie).toBe(false);
    });
    it(`critère 5: ${ou}, commit-msg removed: commit-msg alone is named`, () => {
      const repo = projet({ hooksPath });
      hooks(repo);
      rmSync(crochetLu(repo, 'commit-msg'), { force: true });
      const s = demarrer(repo);
      expect(s.nomme('commit-msg'), s.sortie).toBe(true);
      expect(s.parle('pre-push'), s.sortie).toBe(false);
    });
    it(`critère 5: ${ou}, pre-push removed: pre-push alone is named`, () => {
      const repo = projet({ hooksPath });
      hooks(repo);
      rmSync(crochetLu(repo, 'pre-push'), { force: true });
      const s = demarrer(repo);
      expect(s.nomme('pre-push'), s.sortie).toBe(true);
      expect(s.parle('commit-msg'), s.sortie).toBe(false);
    });
  }
  it('critère 5: a pre-push without the frame’s guard (Beads only) is named, the frame’s commit-msg is not', () => {
    const repo = projet({ hooksPath: true });
    hooks(repo);
    writeFileSync(crochetLu(repo, 'pre-push'), PRE_PUSH_BEADS);
    const s = demarrer(repo);
    expect(s.nomme('pre-push'), s.sortie).toBe(true);
    expect(s.parle('commit-msg'), s.sortie).toBe(false);
  });
  it('critère 5: a commit-msg of the project without the frame’s guard is named', () => {
    const repo = projet({ hooksPath: true });
    hooks(repo);
    writeFileSync(crochetLu(repo, 'commit-msg'), '#!/bin/sh\nexit 0\n');
    const s = demarrer(repo);
    expect(s.nomme('commit-msg'), s.sortie).toBe(true);
  });
  it('critère 5: a commit-msg of a former version of the frame is named', () => {
    const repo = projet({ hooksPath: true });
    hooks(repo);
    writeFileSync(crochetLu(repo, 'commit-msg'), COMMIT_MSG_SETUP);
    const s = demarrer(repo);
    expect(s.nomme('commit-msg'), s.sortie).toBe(true);
    expect(s.parle('pre-push'), s.sortie).toBe(false);
  });
  it('critère 5: frame hooks in .beads/hooks while git reads .git/hooks are absent, and named', () => {
    const repo = projet({ hooksPath: true });
    hooks(repo);
    git(repo, 'config', '--unset', 'core.hooksPath');
    const s = demarrer(repo);
    expect(s.nomme('commit-msg'), s.sortie).toBe(true);
    expect(s.nomme('pre-push'), s.sortie).toBe(true);
  });
});
