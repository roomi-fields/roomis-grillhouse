import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap } from '../machine.js';
import { CODE_COPIE } from '../../scripts/enveloppe/codes.mjs';
import {
  git,
  LANCER,
  INTEGRER,
  LONG,
  ecrituresFautives,
  Paquet,
  POSE,
  sousModulesEssai,
} from './sous-modules-essai.js';

// grillhouse-3uv.58.1: the read-only mount of the shared submodules over each command of the
// project the frame plays in a linked copy (critères 15 to 20). The preparation of the copies:
// tests/unit/sous-modules.spec.ts.
// The worlds of trial and the frame's scripts they run: ./sous-modules-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'sous-modules-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { ENV_SCRIPTS, mondePartage, pathSansBwrap, pathBwrapRefuse } = sousModulesEssai(ESSAIS);

// The pre-commit hook of the test repository: a command of the project that the commit of the
// integration plays, in the copy; it tries to write into the shared submodule and into the copy.
const poserCrochet = (m: ReturnType<typeof mondePartage>) =>
  writeFileSync(
    path.join(m.repo, '.git/hooks/pre-commit'),
    '#!/bin/sh\nnode ecrire.mjs crochet\nexit 0\n',
    { mode: 0o755 }
  );

// lancer.sh on the copy of the world, with a home of its own (the session state is read and
// written there, never in the real one) and the PATH given.
const lancerChez = (m: ReturnType<typeof mondePartage>, chemin = process.env.PATH ?? '') => {
  const maison = mkdtempSync(path.join(ESSAIS, 'maison-'));
  mkdirSync(path.join(maison, '.claude/projects'), { recursive: true });
  writeFileSync(path.join(maison, '.claude/settings.json'), '{}');
  writeFileSync(path.join(maison, '.claude.json'), '{}');
  return spawnSync(
    'bash',
    [LANCER, 'demo-1', 'developpeur', 'packages/a', path.join(m.bin, 'consigne.txt')],
    {
      cwd: m.repo,
      encoding: 'utf8',
      env: { ...ENV_SCRIPTS, HOME: maison, PATH: `${m.bin}:${chemin}`, CLAUDE_BIN: 'true' },
    }
  );
};

describe('grillhouse-3uv.58.1 critère 15 — every command of the project the frame plays in a linked copy runs under the read-only mount', () => {
  it.runIf(canWrap)(
    'critère 15: the preparation of the agent copy (installation, build, before the envelope) fails to write into the shared submodule and writes into its copy',
    () => {
      const m = mondePartage({ ecritures: true });
      const r = lancerChez(m);
      expect(r.status, r.stderr + readFileSync(`${m.copies.agent}.log`, 'utf8')).toBe(0);
      expect(m.lit(m.copies.agent)).toBe(true);
      const vues = m.ecrituresDe(m.copies.agent);
      for (const e of ['installation', 'construction']) {
        expect(vues.filter(l => l.startsWith(`${e} `)).length, vues.join('\n')).toBeGreaterThan(0);
      }
      expect(ecrituresFautives(vues), vues.join('\n')).toEqual([]);
      expect(m.intrus()).toEqual([]);
    },
    LONG
  );
  for (const [cas, chemin] of Object.entries({
    'bwrap absent': pathSansBwrap,
    'bwrap refused': pathBwrapRefuse,
  })) {
    it(
      `critère 15: ${cas} — the agent copy is refused, CODE_COPIE, its log saying so, no installation or build runs`,
      () => {
        const m = mondePartage();
        const r = lancerChez(m, chemin());
        const journal = readFileSync(`${m.copies.agent}.log`, 'utf8');
        expect(r.status, r.stderr + journal).toBe(CODE_COPIE);
        expect(journal).toMatch(/bwrap|montage/i);
        expect(m.vus()).toEqual([]);
      },
      LONG
    );
  }
  it.runIf(canWrap)(
    'critère 15: the hook of the integration’s commit fails to write into the shared submodule and writes into its copy',
    () => {
      const m = mondePartage({ ecritures: true });
      poserCrochet(m);
      const r = m.integrer();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/✓ commit/);
      const vues = m.ecrituresDe(m.copies.integration);
      expect(
        vues.filter(l => l.startsWith('crochet ')),
        vues.join('\n')
      ).toHaveLength(1);
      expect(ecrituresFautives(vues), vues.join('\n')).toEqual([]);
      expect(m.intrus()).toEqual([]);
      expect(existsSync(path.join(m.principalNatif, 'crochet.txt'))).toBe(false);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 16 — the mount covers each shared submodule the preparation linked, whatever the declaration read afterwards', () => {
  it.runIf(canWrap)(
    'critère 16: an integration whose lot removes grillhouse.partage, its build writing into the shared submodule — the write fails or the lot is refused, the main repository’s submodule intact',
    () => {
      const m = mondePartage({ ecritures: true });
      // The lot: the package.json of HEAD without grillhouse.partage, the rest unchanged.
      const pkgPath = path.join(m.repo, 'package.json');
      const avant = readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(avant) as Paquet;
      delete pkg.grillhouse?.partage;
      writeFileSync(pkgPath, JSON.stringify(pkg));
      const retrait = path.join(m.bin, 'retrait.patch');
      writeFileSync(retrait, git(m.repo, 'diff', '--', 'package.json'));
      writeFileSync(pkgPath, avant);
      const tete = git(m.repo, 'rev-parse', 'HEAD');
      const r = spawnSync(
        'node',
        [INTEGRER, '--ticket', 'demo-1', '--code', retrait, '--message', path.join(m.bin, 'msg')],
        {
          cwd: m.repo,
          encoding: 'utf8',
          env: { ...ENV_SCRIPTS, PATH: `${m.bin}:${process.env.PATH}` },
        }
      );
      const vues = m.ecrituresDe(m.copies.integration);
      expect(m.intrus(), r.stdout + r.stderr + vues.join('\n')).toEqual([]);
      if (r.status === 0) {
        // Committed: every command, after the lot, failed to write into the shared submodule.
        expect(
          vues.filter(l => l.startsWith('construction ')).length,
          vues.join('\n')
        ).toBeGreaterThan(0);
        expect(ecrituresFautives(vues), vues.join('\n')).toEqual([]);
      } else {
        expect(r.status, r.stdout + r.stderr).toBe(1);
        expect(r.stdout).toMatch(/⛔/);
        expect(git(m.repo, 'rev-parse', 'HEAD')).toBe(tete);
      }
    },
    LONG
  );
});

// A command of the project that moves the shared submodule: `git reset --soft` of vendor/natif to
// its v2, and an empty commit in the submodule nested in it; it notes « deplacer-<step> <outcome of
// the reset> <outcome of the commit> » in the copy's ecritures.log, and always exits 0.
const PARTAGE_DEPLACEMENT = (cible: string) => `import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const etape = process.argv[2];
const essai = args => (spawnSync('git', args, { stdio: 'ignore' }).status === 0 ? 'ok' : 'refus');
const reset = essai(['-C', 'vendor/natif', 'reset', '-q', '--soft', ${JSON.stringify(cible)}]);
const commit = essai(['-C', 'vendor/natif/profond', 'commit', '-q', '--allow-empty', '-m', etape]);
fs.appendFileSync('ecritures.log', ['deplacer-' + etape, reset, commit].join(' ') + '\\n');
`;

describe('grillhouse-3uv.58.1 critère 17 — the mount covers the git repository of each shared submodule, nested ones included', () => {
  // The world of critère 8 with a nested submodule, whose build and tests also try to move the
  // shared submodule.
  const mondeDeplace = () => {
    const m = mondePartage({ ecritures: true, imbrique: true });
    writeFileSync(path.join(m.repo, 'deplacer.mjs'), PARTAGE_DEPLACEMENT(m.commits[1] ?? ''));
    const pkgPath = path.join(m.repo, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Paquet & {
      scripts: Record<string, string>;
    };
    pkg.scripts.build += ' && node deplacer.mjs construction';
    pkg.scripts.test += ' && node deplacer.mjs tests';
    writeFileSync(pkgPath, JSON.stringify(pkg));
    git(m.repo, 'add', '.');
    git(m.repo, 'commit', '-qm', 'déplacer');
    return { ...m, profond: path.join(m.principalNatif, 'profond') };
  };
  const deplacements = (vues: string[]) => vues.filter(l => l.startsWith('deplacer-'));
  it.runIf(canWrap)(
    'critère 17: in the integration, a build that moves the shared submodule’s HEAD (reset) or commits in its nested submodule fails, and their commits in the main repository stay',
    () => {
      const m = mondeDeplace();
      const natif = git(m.principalNatif, 'rev-parse', 'HEAD').trim();
      const profond = git(m.profond, 'rev-parse', 'HEAD').trim();
      expect(natif).toBe(m.commits[0]);
      const r = m.integrer();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const vues = deplacements(m.ecrituresDe(m.copies.integration));
      expect(vues.length, vues.join('\n')).toBeGreaterThan(0);
      expect(
        vues.filter(l => !/^\S+ refus refus$/.test(l)),
        vues.join('\n')
      ).toEqual([]);
      expect(git(m.principalNatif, 'rev-parse', 'HEAD').trim()).toBe(natif);
      expect(git(m.profond, 'rev-parse', 'HEAD').trim()).toBe(profond);
      // The main repository still sees its submodule at the commit it references.
      expect(git(m.repo, 'submodule', 'status', '--', 'vendor/natif')).toMatch(/^ /);
    },
    LONG
  );
  it.runIf(canWrap)(
    'critère 17: in the night, a build and tests that move the shared submodule’s HEAD (reset) or commit in its nested submodule fail, and their commits in the main repository stay',
    () => {
      const m = mondeDeplace();
      const natif = git(m.principalNatif, 'rev-parse', 'HEAD').trim();
      const profond = git(m.profond, 'rev-parse', 'HEAD').trim();
      const r = m.nuit();
      expect(r.status, m.journalNuit()).toBe(0);
      const vues = deplacements(m.ecrituresDe(m.copies.nuit));
      for (const e of ['construction', 'tests']) {
        expect(vues.filter(l => l.startsWith(`deplacer-${e} `)).length, vues.join('\n')).toBe(1);
      }
      expect(
        vues.filter(l => !/^\S+ refus refus$/.test(l)),
        vues.join('\n')
      ).toEqual([]);
      expect(git(m.principalNatif, 'rev-parse', 'HEAD').trim()).toBe(natif);
      expect(git(m.profond, 'rev-parse', 'HEAD').trim()).toBe(profond);
      // The main repository still sees its submodule at the commit it references.
      expect(git(m.repo, 'submodule', 'status', '--', 'vendor/natif')).toMatch(/^ /);
    },
    LONG
  );
});

// `monter` played on a copy, from the copy, with the list its pose printed (`--partages`, the one
// way the frame calls it): the command tries to write into the shared submodule (by the copy's
// link), into the main repository's .git, and into the copy, and prints
// « <outcome in the submodule> <outcome in .git> <outcome in the copy> ».
const ESSAI_MONTE = `const fs = require('node:fs');
const essai = f => { try { fs.writeFileSync(f, 'monte\\n'); return 'ok'; } catch (e) { return e.code ?? 'refus'; } };
console.log([essai('vendor/natif/monte.txt'), essai(process.argv[1]), essai('copie-monte.txt')].join(' '));`;
const essaiMonte = (m: ReturnType<typeof mondePartage>) => [
  'node',
  '-e',
  ESSAI_MONTE,
  path.join(m.repo, '.git/monte.txt'),
];
const monterDans = (m: ReturnType<typeof mondePartage>, copie: string, partages: string) =>
  spawnSync('bash', [POSE, 'monter', copie, '--partages', partages, ...essaiMonte(m)], {
    cwd: copie,
    encoding: 'utf8',
    env: ENV_SCRIPTS,
  });

describe('grillhouse-3uv.58.1 critère 18 — the mount finds a shared submodule by its link, not by a mark of the index', () => {
  // Commands of the project that rewrite the copy's index and drop the « ignored in the copy » mark.
  const reecritures = {
    'git read-tree HEAD': ['read-tree', 'HEAD'],
    'git update-index --no-skip-worktree': ['update-index', '--no-skip-worktree', 'vendor/natif'],
  };
  for (const [cas, args] of Object.entries(reecritures)) {
    it.runIf(canWrap)(
      `critère 18: after ${cas} in a linked copy, a command under the mount fails to write into the shared submodule, the main repository’s submodule intact`,
      () => {
        const m = mondePartage();
        const copie = m.copieFraiche('reecrite');
        const p = m.poser(copie);
        expect(p.status, p.stderr).toBe(0);
        expect(m.lit(copie)).toBe(true);
        git(copie, ...args);
        // The mark is gone, the link stays.
        expect(git(copie, 'ls-files', '-v', '--', 'vendor/natif')).not.toMatch(/^S /m);
        expect(m.lit(copie)).toBe(true);
        const commit = git(m.principalNatif, 'rev-parse', 'HEAD');
        const r = monterDans(m, copie, p.stdout);
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout.trim()).toMatch(/^(?!ok )\S+ \S+ ok$/);
        expect(existsSync(path.join(m.principalNatif, 'monte.txt'))).toBe(false);
        expect(existsSync(m.nonSuivi)).toBe(true);
        expect(git(m.principalNatif, 'rev-parse', 'HEAD')).toBe(commit);
      },
      LONG
    );
  }
  it.runIf(canWrap)(
    'critère 18: in the integration, a build that runs git read-tree HEAD leaves the following commands (tests, guards) unable to write into the shared submodule',
    () => {
      const m = mondePartage({ ecritures: true });
      const pkgPath = path.join(m.repo, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Paquet & {
        scripts: Record<string, string>;
      };
      pkg.scripts.build = `git read-tree HEAD && ${pkg.scripts.build}`;
      writeFileSync(pkgPath, JSON.stringify(pkg));
      git(m.repo, 'add', '.');
      git(m.repo, 'commit', '-qm', 'read-tree');
      const r = m.integrer();
      const vues = m.ecrituresDe(m.copies.integration);
      expect(m.intrus(), r.stdout + r.stderr + vues.join('\n')).toEqual([]);
      for (const e of ['tests', 'gardes']) {
        expect(vues.filter(l => l.startsWith(`${e} `)).length, vues.join('\n')).toBeGreaterThan(0);
      }
      expect(ecrituresFautives(vues), vues.join('\n')).toEqual([]);
      expect(existsSync(m.nonSuivi)).toBe(true);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 19 — a linked shared submodule not initialized in the main repository at the mount stops it', () => {
  // Undone between the preparation and the mount: deinit by git, or an empty folder in its place.
  const etats = {
    'git submodule deinit': (m: ReturnType<typeof mondePartage>) =>
      git(m.repo, 'submodule', 'deinit', '-q', '-f', '--', 'vendor/natif'),
    'an empty folder': (m: ReturnType<typeof mondePartage>) => {
      rmSync(m.principalNatif, { recursive: true, force: true });
      mkdirSync(m.principalNatif);
    },
  };
  for (const [cas, defaire] of Object.entries(etats)) {
    it.runIf(canWrap)(
      `critère 19: ${cas} after the preparation — the mount refuses, exit 1, its first line names the submodule, the command does not play, the main repository’s .git untouched`,
      () => {
        const m = mondePartage();
        const copie = m.copieFraiche('desinit');
        const p = m.poser(copie);
        expect(p.status, p.stderr).toBe(0);
        expect(m.lit(copie)).toBe(true);
        defaire(m);
        expect(existsSync(path.join(m.principalNatif, '.git'))).toBe(false);
        const r = monterDans(m, copie, p.stdout);
        expect(r.status, r.stdout + r.stderr).toBe(1);
        expect(r.stderr.split('\n')[0]).toContain('vendor/natif');
        expect(r.stdout).toBe('');
        expect(existsSync(path.join(copie, 'copie-monte.txt'))).toBe(false);
        expect(existsSync(path.join(m.repo, '.git/monte.txt'))).toBe(false);
      },
      LONG
    );
  }
});

describe('grillhouse-3uv.58.1 critère 20 — the mount takes its shared submodules from the list of the pose only', () => {
  // Without `--partages`, the mount would have to read the copy (its .gitmodules) to find them.
  const copies = {
    'a linked copy': (m: ReturnType<typeof mondePartage>) => {
      const copie = m.copieFraiche('sans-liste');
      const p = m.poser(copie);
      expect(p.status, p.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      return copie;
    },
    'a linked copy whose .gitmodules is emptied': (m: ReturnType<typeof mondePartage>) => {
      const copie = m.copieFraiche('sans-liste-vide');
      const p = m.poser(copie);
      expect(p.status, p.stderr).toBe(0);
      writeFileSync(path.join(copie, '.gitmodules'), '');
      return copie;
    },
    'a fresh copy, not prepared': (m: ReturnType<typeof mondePartage>) =>
      m.copieFraiche('sans-liste-fraiche'),
  };
  for (const [cas, preparer] of Object.entries(copies)) {
    it(
      `critère 20: a call of the mount without --partages on ${cas} — refused as a malformed call (usage, exit 2), the command does not play`,
      () => {
        const m = mondePartage();
        const copie = preparer(m);
        const r = spawnSync('bash', [POSE, 'monter', copie, ...essaiMonte(m)], {
          cwd: copie,
          encoding: 'utf8',
          env: ENV_SCRIPTS,
        });
        expect(r.status, r.stdout + r.stderr).toBe(2);
        expect(r.stderr.split('\n')[0]).toMatch(/^usage: /);
        expect(r.stdout).toBe('');
        expect(existsSync(path.join(copie, 'copie-monte.txt'))).toBe(false);
        expect(existsSync(path.join(m.principalNatif, 'monte.txt'))).toBe(false);
        expect(existsSync(path.join(m.repo, '.git/monte.txt'))).toBe(false);
      },
      LONG
    );
  }
});

// Ways a lot or a command of the project rewrites the .gitmodules of the copy after the preparation.
// The lot: a patch on .gitmodules, built in the main tree then undone there. The command: a shell
// line run before the build (`node -e …` empties it; `sed` moves the path, then commits it in the copy).
const VIDER_GITMODULES = `node -e "require('node:fs').writeFileSync('.gitmodules', '')"`;
const DEPLACER_GITMODULES = `sed -i 's#path = vendor/natif#path = vendor/ailleurs#' .gitmodules`;
const lotsGitmodules: Record<string, (texte: string) => string | null> = {
  'empties .gitmodules': () => '',
  'deletes .gitmodules': () => null,
  'changes the path of the shared submodule in .gitmodules': texte =>
    texte.replace('path = vendor/natif', 'path = vendor/ailleurs'),
};
const commandesGitmodules: Record<string, string> = {
  'empties .gitmodules': VIDER_GITMODULES,
  'changes the path of the shared submodule in .gitmodules': DEPLACER_GITMODULES,
  'changes the path in .gitmodules and commits it in the copy': `${DEPLACER_GITMODULES} && git -c user.name=t -c user.email=t@t commit -q --no-verify --allow-empty -m deplace -- .gitmodules`,
};
// The world of the mount, its build rewriting .gitmodules first by `commande`.
const mondeReecrit = (commande: string, script = 'build') => {
  const m = mondePartage({ ecritures: true });
  const pkgPath = path.join(m.repo, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Paquet & {
    scripts: Record<string, string>;
  };
  pkg.scripts[script] = `${commande} && ${pkg.scripts[script]}`;
  writeFileSync(pkgPath, JSON.stringify(pkg));
  git(m.repo, 'add', '.');
  git(m.repo, 'commit', '-qm', 'gitmodules réécrit');
  return m;
};

describe('grillhouse-3uv.58.1 critère 20 — the mount reads nothing the copy can rewrite during a lot to find the shared submodules', () => {
  for (const [cas, reecrire] of Object.entries(lotsGitmodules)) {
    it.runIf(canWrap)(
      `critère 20: an integration whose lot ${cas}, its build writing into the shared submodule — the write fails or the lot is refused, the main repository’s submodule intact`,
      () => {
        const m = mondePartage({ ecritures: true });
        const gm = path.join(m.repo, '.gitmodules');
        const avant = readFileSync(gm, 'utf8');
        const apres = reecrire(avant);
        if (apres === null) {
          rmSync(gm);
        } else {
          writeFileSync(gm, apres);
        }
        const patch = path.join(m.bin, 'gitmodules.patch');
        writeFileSync(patch, git(m.repo, 'diff', '--', '.gitmodules'));
        writeFileSync(gm, avant);
        expect(git(m.repo, 'status', '--porcelain', '--', '.gitmodules')).toBe('');
        const tete = git(m.repo, 'rev-parse', 'HEAD');
        const commit = git(m.principalNatif, 'rev-parse', 'HEAD');
        const r = spawnSync(
          'node',
          [INTEGRER, '--ticket', 'demo-1', '--code', patch, '--message', path.join(m.bin, 'msg')],
          {
            cwd: m.repo,
            encoding: 'utf8',
            env: { ...ENV_SCRIPTS, PATH: `${m.bin}:${process.env.PATH}` },
          }
        );
        const vues = m.ecrituresDe(m.copies.integration);
        const dit = r.stdout + r.stderr + vues.join('\n');
        expect(m.intrus(), dit).toEqual([]);
        expect(existsSync(m.nonSuivi)).toBe(true);
        expect(git(m.principalNatif, 'rev-parse', 'HEAD')).toBe(commit);
        if (r.status === 0) {
          // Committed: every command, after the lot, failed to write into the shared submodule.
          expect(vues.filter(l => l.startsWith('construction ')).length, dit).toBeGreaterThan(0);
          expect(ecrituresFautives(vues), dit).toEqual([]);
        } else {
          expect(r.status, dit).toBe(1);
          expect(r.stdout).toMatch(/⛔/);
          expect(git(m.repo, 'rev-parse', 'HEAD')).toBe(tete);
          expect(ecrituresFautives(vues), dit).toEqual([]);
        }
      },
      LONG
    );
  }
  for (const [cas, commande] of Object.entries(commandesGitmodules)) {
    it.runIf(canWrap)(
      `critère 20: in the integration, a build that ${cas} leaves the following commands (tests, guards) unable to write into the shared submodule, the main repository’s submodule intact`,
      () => {
        const m = mondeReecrit(commande);
        const commit = git(m.principalNatif, 'rev-parse', 'HEAD');
        const r = m.integrer();
        const vues = m.ecrituresDe(m.copies.integration);
        const dit = r.stdout + r.stderr + vues.join('\n');
        expect(m.intrus(), dit).toEqual([]);
        for (const e of ['tests', 'gardes']) {
          expect(vues.filter(l => l.startsWith(`${e} `)).length, dit).toBeGreaterThan(0);
        }
        expect(ecrituresFautives(vues), dit).toEqual([]);
        expect(existsSync(m.nonSuivi)).toBe(true);
        expect(git(m.principalNatif, 'rev-parse', 'HEAD')).toBe(commit);
      },
      LONG
    );
  }
  it.runIf(canWrap)(
    'critère 20: in the night, a build that empties .gitmodules leaves the tests and the night script unable to write into the shared submodule',
    () => {
      const m = mondeReecrit(VIDER_GITMODULES);
      m.nuit();
      const vues = m.ecrituresDe(m.copies.nuit);
      const dit = m.journalNuit() + vues.join('\n');
      expect(m.intrus(), dit).toEqual([]);
      for (const e of ['tests', 'nuit']) {
        expect(vues.filter(l => l.startsWith(`${e} `)).length, dit).toBeGreaterThan(0);
      }
      expect(ecrituresFautives(vues), dit).toEqual([]);
      expect(existsSync(m.nonSuivi)).toBe(true);
    },
    LONG
  );
  it.runIf(canWrap)(
    'critère 20: in the agent copy, an installation that empties .gitmodules leaves its build unable to write into the shared submodule',
    () => {
      const m = mondeReecrit(VIDER_GITMODULES, 'postinstall');
      const r = lancerChez(m);
      const vues = m.ecrituresDe(m.copies.agent);
      const journal = existsSync(`${m.copies.agent}.log`)
        ? readFileSync(`${m.copies.agent}.log`, 'utf8')
        : '';
      const dit = r.stderr + journal + vues.join('\n');
      expect(m.intrus(), dit).toEqual([]);
      expect(vues.filter(l => l.startsWith('construction ')).length, dit).toBeGreaterThan(0);
      expect(ecrituresFautives(vues), dit).toEqual([]);
      expect(existsSync(m.nonSuivi)).toBe(true);
    },
    LONG
  );
});
