// grillhouse-3uv.58: a working copy is removed by one script of the frame,
// `scripts/retirer-copie.sh [--jetable] <copie>`, called by the chef de chantier (agent copy), the
// integration and the night. git refuses `worktree remove` on a copy that carries a submodule; the
// script removes such a copy too, touches nothing but the named copy, and keeps today's refusal of
// a copy that carries local work or is locked; `--jetable` (the integration's and the night's own
// copy) lifts the refusal for local work, never for a lock. A path that is not a listed copy, or a
// copy whose state does not read, is refused; a refusal exits 1, a malformed call 2.
import { execFileSync, spawnSync } from 'node:child_process';
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
import { afterAll, describe, expect, it } from 'vitest';
import { configGit } from '../config-git.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'retirer-copie-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RETIRER = path.resolve(__dirname, '../../scripts/retirer-copie.sh');
const LONG = 30_000;

// The test repositories live on disk: the commands that build them allow the file transport to
// submodule commands, beside the git settings of the suite. The script under test runs with the
// settings of the suite, without that allowance.
const IDENTITE = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};
const ENV_GIT = {
  ...process.env,
  ...IDENTITE,
  ...configGit([['protocol.file.allow', 'always']]),
};
const ENV_SCRIPT: NodeJS.ProcessEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !/^GIT_(CONFIG|ALLOW_PROTOCOL)/.test(k))
  ),
  ...configGit([], cle => !cle.startsWith('protocol.')),
  ...IDENTITE,
};
const git = (dir: string, ...a: string[]) =>
  execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: ENV_GIT });

// A repository with a tracked file `a.txt`, node_modules ignored, and, unless `sousModule` is
// false, the submodule vendor/natif (two commits, v1 then v2; the repository references v1). With
// `imbrique`, vendor/natif carries a submodule of its own, profond.
function monde({ sousModule = true, imbrique = false } = {}) {
  const repo = mkdtempSync(path.join(ESSAIS, 'repo-'));
  writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  writeFileSync(path.join(repo, '.gitignore'), '.claude/worktrees/\nnode_modules\n');
  git(repo, 'init', '-q');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'base');
  const commits: string[] = [];
  if (sousModule) {
    const natif = mkdtempSync(path.join(ESSAIS, 'natif-'));
    git(natif, 'init', '-q');
    if (imbrique) {
      const profond = mkdtempSync(path.join(ESSAIS, 'profond-'));
      git(profond, 'init', '-q');
      writeFileSync(path.join(profond, 'profond.txt'), 'p1\n');
      git(profond, 'add', '.');
      git(profond, 'commit', '-qm', 'p1');
      git(natif, 'submodule', 'add', '-q', profond, 'profond');
    }
    for (const v of ['v1', 'v2']) {
      writeFileSync(path.join(natif, 'natif.txt'), `${v}\n`);
      git(natif, 'add', '.');
      git(natif, 'commit', '-qm', v);
      commits.push(git(natif, 'rev-parse', 'HEAD').trim());
    }
    git(repo, 'submodule', 'add', '-q', natif, 'vendor/natif');
    git(repo, 'submodule', 'update', '--init', '--recursive', '-q');
    git(path.join(repo, 'vendor/natif'), 'checkout', '-q', commits[0] ?? '');
    git(repo, 'add', 'vendor/natif');
    git(repo, 'commit', '-qm', 'natif v1');
  }
  // A copy of the repository, as the frame creates one: detached on HEAD, or on a branch;
  // its submodules set at the commit HEAD references.
  const copie = (nom: string, branche?: string) => {
    const dir = path.join(repo, '.claude/worktrees', nom);
    if (branche) {
      git(repo, 'worktree', 'add', '-q', '-b', branche, dir, 'HEAD');
    } else {
      git(repo, 'worktree', 'add', '-q', '--detach', dir, 'HEAD');
    }
    if (sousModule) {
      git(dir, 'submodule', 'update', '--init', '--recursive', '-q');
    }
    return dir;
  };
  // The script with its arguments, from the directory `cwd` (the main repository by default).
  const lancer = (args: string[], cwd = repo) =>
    spawnSync('bash', [RETIRER, ...args], { cwd, encoding: 'utf8', env: ENV_SCRIPT });
  const retirer = (dir: string) => lancer([dir]);
  const jeter = (dir: string) => lancer(['--jetable', dir]);
  // The copies git lists, by their absolute path.
  const listees = () =>
    git(repo, 'worktree', 'list', '--porcelain')
      .split('\n')
      .filter(l => l.startsWith('worktree '))
      .map(l => l.slice('worktree '.length));
  const verrouillee = (dir: string) => {
    const bloc = git(repo, 'worktree', 'list', '--porcelain')
      .split('\n\n')
      .find(b => b.startsWith(`worktree ${dir}\n`));
    return /^locked/m.test(bloc ?? '');
  };
  // The main repository as the supervisor sees it: its state, its head, its submodule.
  const principal = () => ({
    status: git(repo, 'status', '--porcelain', '--ignore-submodules=none'),
    tete: git(repo, 'rev-parse', 'HEAD'),
    natif: sousModule ? git(path.join(repo, 'vendor/natif'), 'rev-parse', 'HEAD') : '',
    modules: existsSync(path.join(repo, '.git/modules/vendor/natif')),
  });
  return { repo, commits, copie, lancer, retirer, jeter, listees, verrouillee, principal };
}

const lire = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : 'absent');

// Every file under a directory, outside git's own directories, with its content.
const empreinte = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter(f => !f.split(path.sep).includes('.git'))
        .sort()
        .map(f => {
          const p = path.join(dir, f);
          try {
            return `${f}=${readFileSync(p, 'utf8')}`;
          } catch {
            return `${f}/`;
          }
        })
    : 'absent';

// The removal succeeded: the script exits 0, the directory is gone, and git no longer names it.
function retiree(m: ReturnType<typeof monde>, dir: string, jetable = false) {
  const r = jetable ? m.jeter(dir) : m.retirer(dir);
  expect(r.status, r.stdout + r.stderr).toBe(0);
  expect(existsSync(dir)).toBe(false);
  expect(m.listees()).not.toContain(dir);
}

describe('critère 1 — a copy that carries a submodule is removed by the frame’s script', () => {
  it(
    'critère 1: a copy whose submodule is set is removed: its directory is gone and git worktree list no longer names it',
    () => {
      const m = monde();
      const dir = m.copie('demo-1');
      expect(lire(path.join(dir, 'vendor/natif/natif.txt'))).toBe('v1\n');
      retiree(m, dir);
    },
    LONG
  );
  it(
    'critère 1: a copy whose submodule carries a nested submodule is removed',
    () => {
      const m = monde({ imbrique: true });
      const dir = m.copie('demo-2');
      expect(lire(path.join(dir, 'vendor/natif/profond/profond.txt'))).toBe('p1\n');
      retiree(m, dir);
    },
    LONG
  );
  it(
    'critère 1: a copy whose submodules were deinitialised (submodule deinit --all -f) is removed',
    () => {
      const m = monde();
      const dir = m.copie('demo-3');
      git(dir, 'submodule', 'deinit', '-q', '--all', '-f');
      retiree(m, dir);
    },
    LONG
  );
  it(
    'critère 1: a copy on a branch (the agent copy) that carries a submodule is removed',
    () => {
      const m = monde();
      const dir = m.copie('demo-4', 'agent/demo-4');
      retiree(m, dir);
    },
    LONG
  );
});

describe('critère 2 — the removal touches only the named copy', () => {
  it(
    'critère 2: the main repository keeps its tree, its local work, its submodule and the submodule’s git directory',
    () => {
      const m = monde();
      const dir = m.copie('demo-5');
      // The supervisor's own work in the main tree: a modified file, an untracked file, a
      // modified submodule file.
      writeFileSync(path.join(m.repo, 'a.txt'), 'a du superviseur\n');
      writeFileSync(path.join(m.repo, 'libre.txt'), 'libre\n');
      writeFileSync(path.join(m.repo, 'vendor/natif/natif.txt'), 'natif du superviseur\n');
      const avant = {
        status: git(m.repo, 'status', '--porcelain', '--ignore-submodules=none'),
        tete: git(m.repo, 'rev-parse', 'HEAD'),
        natif: git(path.join(m.repo, 'vendor/natif'), 'rev-parse', 'HEAD'),
        statusNatif: git(path.join(m.repo, 'vendor/natif'), 'status', '--porcelain'),
      };
      retiree(m, dir);
      expect({
        status: git(m.repo, 'status', '--porcelain', '--ignore-submodules=none'),
        tete: git(m.repo, 'rev-parse', 'HEAD'),
        natif: git(path.join(m.repo, 'vendor/natif'), 'rev-parse', 'HEAD'),
        statusNatif: git(path.join(m.repo, 'vendor/natif'), 'status', '--porcelain'),
      }).toEqual(avant);
      expect(existsSync(path.join(m.repo, '.git/modules/vendor/natif'))).toBe(true);
      expect(lire(path.join(m.repo, 'a.txt'))).toBe('a du superviseur\n');
      expect(lire(path.join(m.repo, 'libre.txt'))).toBe('libre\n');
      expect(lire(path.join(m.repo, 'vendor/natif/natif.txt'))).toBe('natif du superviseur\n');
      expect(m.listees()).toContain(m.repo);
    },
    LONG
  );
  it(
    'critère 2: another copy with a submodule stays in place, listed, with its own work',
    () => {
      const m = monde();
      const autre = m.copie('demo-6');
      const dir = m.copie('demo-7');
      writeFileSync(path.join(autre, 'vendor/natif/natif.txt'), 'travail de demo-6\n');
      writeFileSync(path.join(autre, 'note.txt'), 'note\n');
      retiree(m, dir);
      expect(m.listees()).toContain(autre);
      expect(lire(path.join(autre, 'vendor/natif/natif.txt'))).toBe('travail de demo-6\n');
      expect(lire(path.join(autre, 'note.txt'))).toBe('note\n');
      expect(git(autre, 'status', '--porcelain', '--ignore-submodules=none')).toMatch(
        /vendor\/natif/
      );
    },
    LONG
  );
  it(
    'critère 2: the branch of a removed agent copy and its commits stay in the repository',
    () => {
      const m = monde();
      const dir = m.copie('demo-8', 'agent/demo-8');
      writeFileSync(path.join(dir, 'livre.txt'), 'livré\n');
      git(dir, 'add', 'livre.txt');
      git(dir, 'commit', '-qm', 'livraison');
      const commit = git(dir, 'rev-parse', 'HEAD').trim();
      retiree(m, dir);
      expect(git(m.repo, 'rev-parse', 'agent/demo-8').trim()).toBe(commit);
    },
    LONG
  );
});

describe('critère 3 — a copy without submodule is removed as today', () => {
  it(
    'critère 3: a clean copy of a repository without submodule is removed',
    () => {
      const m = monde({ sousModule: false });
      const dir = m.copie('demo-9');
      retiree(m, dir);
    },
    LONG
  );
  it(
    'critère 3: a copy on a branch of a repository without submodule is removed, its branch kept',
    () => {
      const m = monde({ sousModule: false });
      const dir = m.copie('demo-10', 'agent/demo-10');
      retiree(m, dir);
      expect(git(m.repo, 'branch', '--list', 'agent/demo-10')).toMatch(/agent\/demo-10/);
    },
    LONG
  );
});

// What holds a copy back, made in the copy, and what names it in the refusal.
type Retenue = {
  nom: string;
  sousModule: boolean;
  poser: (dir: string, m: ReturnType<typeof monde>) => void;
  // The name the refusal cites for what holds the copy.
  cite: RegExp;
  // The work is still there, as it was left.
  intacte: (dir: string, m: ReturnType<typeof monde>) => void;
};
const RETENUES: Retenue[] = [false, true].flatMap(sousModule => {
  const avec = sousModule ? 'with a submodule' : 'without submodule';
  return [
    {
      nom: `a tracked file modified, ${avec}`,
      sousModule,
      poser: dir => writeFileSync(path.join(dir, 'a.txt'), 'a modifié\n'),
      cite: /a\.txt/,
      intacte: dir => expect(lire(path.join(dir, 'a.txt'))).toBe('a modifié\n'),
    },
    {
      nom: `a tracked file modified and staged, ${avec}`,
      sousModule,
      poser: dir => {
        writeFileSync(path.join(dir, 'a.txt'), 'a indexé\n');
        git(dir, 'add', 'a.txt');
      },
      cite: /a\.txt/,
      intacte: dir => {
        expect(lire(path.join(dir, 'a.txt'))).toBe('a indexé\n');
        expect(git(dir, 'diff', '--cached', '--name-only')).toMatch(/a\.txt/);
      },
    },
    {
      nom: `an untracked file outside the ignored ones, ${avec}`,
      sousModule,
      poser: dir => writeFileSync(path.join(dir, 'libre.txt'), 'libre\n'),
      cite: /libre\.txt/,
      intacte: dir => expect(lire(path.join(dir, 'libre.txt'))).toBe('libre\n'),
    },
    {
      nom: `a locked copy (git worktree lock), ${avec}`,
      sousModule,
      poser: (dir, m) => git(m.repo, 'worktree', 'lock', '--reason', 'en cours', dir),
      cite: /verrouill|lock/i,
      intacte: (dir, m) => expect(m.verrouillee(dir)).toBe(true),
    },
  ];
});
RETENUES.push(
  {
    nom: 'a tracked file of the submodule modified',
    sousModule: true,
    poser: dir => writeFileSync(path.join(dir, 'vendor/natif/natif.txt'), 'travail\n'),
    cite: /vendor\/natif/,
    intacte: dir => expect(lire(path.join(dir, 'vendor/natif/natif.txt'))).toBe('travail\n'),
  },
  {
    nom: 'an untracked file in the submodule',
    sousModule: true,
    poser: dir => writeFileSync(path.join(dir, 'vendor/natif/neuf.txt'), 'neuf\n'),
    cite: /vendor\/natif/,
    intacte: dir => expect(lire(path.join(dir, 'vendor/natif/neuf.txt'))).toBe('neuf\n'),
  },
  {
    nom: 'the submodule at another commit than the one HEAD references',
    sousModule: true,
    poser: (dir, m) => git(path.join(dir, 'vendor/natif'), 'checkout', '-q', m.commits[1] ?? ''),
    cite: /vendor\/natif/,
    intacte: (dir, m) => {
      expect(git(path.join(dir, 'vendor/natif'), 'rev-parse', 'HEAD').trim()).toBe(m.commits[1]);
      expect(lire(path.join(dir, 'vendor/natif/natif.txt'))).toBe('v2\n');
    },
  }
);

describe('critère 5 — a copy that carries local work or is locked is not removed', () => {
  let n = 100;
  for (const r of RETENUES) {
    it(
      `critère 5 et 8: ${r.nom} — the script stops in error (exit 1), names the copy and what holds it, the copy stays intact`,
      () => {
        const m = monde({ sousModule: r.sousModule });
        n += 1;
        const nom = `demo-${n}`;
        const dir = m.copie(nom);
        r.poser(dir, m);
        const res = m.retirer(dir);
        expect(res.status, res.stdout + res.stderr).toBe(1);
        expect(res.stderr).toContain(nom);
        expect(res.stderr).toMatch(r.cite);
        expect(existsSync(dir)).toBe(true);
        expect(m.listees()).toContain(dir);
        r.intacte(dir, m);
        if (r.sousModule) {
          expect(existsSync(path.join(dir, 'vendor/natif/.git'))).toBe(true);
        }
      },
      LONG
    );
  }
  it(
    'critère 5: ignored files (node_modules) do not hold a copy with a submodule',
    () => {
      const m = monde();
      const dir = m.copie('demo-200');
      mkdirSync(path.join(dir, 'node_modules/paquet'), { recursive: true });
      writeFileSync(path.join(dir, 'node_modules/paquet/index.js'), 'module.exports = 1;\n');
      retiree(m, dir);
    },
    LONG
  );
  it(
    'critère 5: ignored files (node_modules) do not hold a copy without submodule',
    () => {
      const m = monde({ sousModule: false });
      const dir = m.copie('demo-201');
      mkdirSync(path.join(dir, 'node_modules/paquet'), { recursive: true });
      writeFileSync(path.join(dir, 'node_modules/paquet/index.js'), 'module.exports = 1;\n');
      retiree(m, dir);
    },
    LONG
  );
});

// A path that git worktree list does not name as a copy, built in a world; `garde` is what must
// stay as it was.
type Etranger = {
  nom: string;
  chemin: (m: ReturnType<typeof monde>, copie: string) => string;
};
const ETRANGERS: Etranger[] = [
  { nom: 'the main repository', chemin: m => m.repo },
  {
    nom: 'an absent path where a copy would live',
    chemin: m => path.join(m.repo, '.claude/worktrees/absente'),
  },
  {
    nom: 'a plain directory inside the repository, where a copy would live',
    chemin: m => {
      const d = path.join(m.repo, '.claude/worktrees/faux');
      mkdirSync(d, { recursive: true });
      writeFileSync(path.join(d, 'garde.txt'), 'garde\n');
      return d;
    },
  },
  {
    nom: 'a plain directory outside any repository',
    chemin: () => {
      const d = mkdtempSync(path.join(ESSAIS, 'dehors-'));
      writeFileSync(path.join(d, 'garde.txt'), 'garde\n');
      return d;
    },
  },
  {
    nom: 'the submodule directory inside a copy',
    chemin: (_m, copie) => path.join(copie, 'vendor/natif'),
  },
];

describe('critère 7 — a path that git worktree list does not name as a copy is not removed', () => {
  let n = 300;
  for (const e of ETRANGERS) {
    for (const option of [[], ['--jetable']]) {
      it(
        `critère 7${option.length ? ' et 11' : ''}: ${e.nom}${option.length ? ', even with --jetable' : ''} — the script stops in error (exit 1), says it, and touches nothing`,
        () => {
          const m = monde();
          n += 1;
          const copie = m.copie(`demo-${n}`);
          // The supervisor's own work in the main tree and in the copy.
          writeFileSync(path.join(m.repo, 'a.txt'), 'a du superviseur\n');
          writeFileSync(path.join(m.repo, 'vendor/natif/natif.txt'), 'natif du superviseur\n');
          const chemin = e.chemin(m, copie);
          const avant = {
            principal: m.principal(),
            listees: m.listees(),
            chemin: empreinte(chemin),
            copie: empreinte(copie),
          };
          const r = m.lancer([...option, chemin]);
          expect(r.status, r.stdout + r.stderr).toBe(1);
          expect(r.stderr.trim()).not.toBe('');
          expect({
            principal: m.principal(),
            listees: m.listees(),
            chemin: empreinte(chemin),
            copie: empreinte(copie),
          }).toEqual(avant);
          expect(lire(path.join(m.repo, 'a.txt'))).toBe('a du superviseur\n');
          expect(lire(path.join(m.repo, 'vendor/natif/natif.txt'))).toBe('natif du superviseur\n');
        },
        LONG
      );
    }
  }
});

describe('critère 8 — exit codes, usage, and a relative path read from the current directory', () => {
  const malformes: [string, (copie: string, autre: string) => string[]][] = [
    ['no argument', () => []],
    ['two paths', (copie, autre) => [copie, autre]],
    ['an unknown option', copie => ['--force', copie]],
    ['--jetable without a path', () => ['--jetable']],
  ];
  let n = 400;
  for (const [nom, args] of malformes) {
    it(
      `critère 8: a malformed call (${nom}) exits 2 with the usage on stderr, and removes nothing`,
      () => {
        const m = monde();
        n += 1;
        const copie = m.copie(`demo-${n}`);
        const autre = m.copie(`demo-${n}-autre`);
        const r = m.lancer(args(copie, autre));
        expect(r.status, r.stdout + r.stderr).toBe(2);
        expect(r.stderr).toMatch(/usage/i);
        expect(m.listees()).toEqual(expect.arrayContaining([copie, autre]));
        expect(existsSync(path.join(copie, 'vendor/natif/natif.txt'))).toBe(true);
        expect(existsSync(path.join(autre, 'vendor/natif/natif.txt'))).toBe(true);
      },
      LONG
    );
  }
  it(
    'critère 8: a path relative to the main repository, called from it, removes the copy',
    () => {
      const m = monde();
      const dir = m.copie('demo-450');
      const r = m.lancer(['.claude/worktrees/demo-450'], m.repo);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(existsSync(dir)).toBe(false);
      expect(m.listees()).not.toContain(dir);
    },
    LONG
  );
  it(
    'critère 8: a path relative to another copy of the repository, called from it, removes the copy',
    () => {
      const m = monde();
      const autre = m.copie('demo-451');
      const dir = m.copie('demo-452');
      const r = m.lancer(['../demo-452'], autre);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(existsSync(dir)).toBe(false);
      expect(m.listees()).not.toContain(dir);
      expect(m.listees()).toContain(autre);
    },
    LONG
  );
  it(
    'critère 7 et 8: a relative path read from the current directory names no copy (a copy shares only its last name) — refused, exit 1, the copy intact',
    () => {
      const m = monde();
      const dir = m.copie('demo-453');
      // From .claude, demo-453 reads as .claude/demo-453, which does not exist.
      const r = m.lancer(['demo-453'], path.join(m.repo, '.claude'));
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(existsSync(path.join(dir, 'vendor/natif/natif.txt'))).toBe(true);
      expect(m.listees()).toContain(dir);
    },
    LONG
  );
});

// A copy whose state does not read: an index git cannot read, in the copy or in its submodule.
const ILLISIBLES: {
  nom: string;
  sousModule: boolean;
  index: (m: ReturnType<typeof monde>, nom: string) => string;
}[] = [
  {
    nom: 'the copy’s index is unreadable, without submodule',
    sousModule: false,
    index: (m, nom) => path.join(m.repo, '.git/worktrees', nom, 'index'),
  },
  {
    nom: 'the copy’s index is unreadable, with a submodule',
    sousModule: true,
    index: (m, nom) => path.join(m.repo, '.git/worktrees', nom, 'index'),
  },
  {
    nom: 'the index of the copy’s submodule is unreadable',
    sousModule: true,
    index: (m, nom) => path.join(m.repo, '.git/worktrees', nom, 'modules/vendor/natif/index'),
  },
];

describe('critère 10 — a copy whose state does not read is not removed', () => {
  let n = 500;
  for (const c of ILLISIBLES) {
    it(
      `critère 10: ${c.nom} — the script stops in error (exit 1), says it, the copy stays in place`,
      () => {
        const m = monde({ sousModule: c.sousModule });
        n += 1;
        const nom = `demo-${n}`;
        const dir = m.copie(nom);
        const index = c.index(m, nom);
        expect(existsSync(index)).toBe(true);
        writeFileSync(index, 'illisible\n');
        expect(
          spawnSync('git', ['-C', dir, 'status', '--porcelain', '--ignore-submodules=none']).status
        ).not.toBe(0);
        const avant = empreinte(dir);
        const r = m.retirer(dir);
        expect(r.status, r.stdout + r.stderr).toBe(1);
        expect(r.stderr).toContain(nom);
        expect(existsSync(dir)).toBe(true);
        expect(m.listees()).toContain(dir);
        expect(empreinte(dir)).toEqual(avant);
      },
      LONG
    );
  }
});

describe('critère 11 — with --jetable, a copy is removed even with local work, never when locked', () => {
  let n = 600;
  for (const r of RETENUES.filter(x => !/locked/.test(x.nom))) {
    it(
      `critère 11: --jetable removes a copy with ${r.nom}; the main repository stays as it was`,
      () => {
        const m = monde({ sousModule: r.sousModule });
        n += 1;
        const dir = m.copie(`demo-${n}`);
        r.poser(dir, m);
        const avant = m.principal();
        retiree(m, dir, true);
        expect(m.principal()).toEqual(avant);
      },
      LONG
    );
  }
  it(
    'critère 11: --jetable removes a clean copy with a submodule, on a branch, and keeps its branch',
    () => {
      const m = monde();
      const dir = m.copie('demo-650', 'agent/demo-650');
      retiree(m, dir, true);
      expect(git(m.repo, 'branch', '--list', 'agent/demo-650')).toMatch(/agent\/demo-650/);
    },
    LONG
  );
  it(
    'critère 11 et 2: --jetable removes only the named copy; another copy keeps its work',
    () => {
      const m = monde();
      const autre = m.copie('demo-651');
      const dir = m.copie('demo-652');
      writeFileSync(path.join(autre, 'note.txt'), 'note\n');
      writeFileSync(path.join(dir, 'note.txt'), 'jetable\n');
      retiree(m, dir, true);
      expect(m.listees()).toContain(autre);
      expect(lire(path.join(autre, 'note.txt'))).toBe('note\n');
    },
    LONG
  );
  for (const sousModule of [false, true]) {
    for (const sale of [false, true]) {
      const desc = `${sousModule ? 'with' : 'without'} submodule${sale ? ', carrying an untracked file' : ''}`;
      it(
        `critère 11 et 8: --jetable refuses a locked copy ${desc} — exit 1, names the copy and the lock, the copy stays locked and intact`,
        () => {
          const m = monde({ sousModule });
          n += 1;
          const nom = `demo-${n}`;
          const dir = m.copie(nom);
          if (sale) {
            writeFileSync(path.join(dir, 'libre.txt'), 'libre\n');
          }
          git(m.repo, 'worktree', 'lock', '--reason', 'en cours', dir);
          const avant = empreinte(dir);
          const r = m.jeter(dir);
          expect(r.status, r.stdout + r.stderr).toBe(1);
          expect(r.stderr).toContain(nom);
          expect(r.stderr).toMatch(/verrouill|lock/i);
          expect(m.listees()).toContain(dir);
          expect(m.verrouillee(dir)).toBe(true);
          expect(empreinte(dir)).toEqual(avant);
        },
        LONG
      );
    }
  }
});

// grillhouse-3uv.63.1: a locked copy is refused whatever its place in `git worktree list`. The
// order of that list is the machine's own (git reads its administrative directory), so a test
// never counts on a place: it builds several copies and locks each in turn, which puts a locked
// copy at every place the list can give it. The refusal is the script's own lock message, not
// git's refusal of `worktree remove`.
describe('grillhouse-3uv.63.1 — a locked copy is refused whatever its place in the list of copies', () => {
  const NOMS = ['place-a', 'place-b', 'place-c'];
  // The copy, named by `arg`, is refused for its lock, by the plain call and by --jetable, and
  // stays listed, locked and intact.
  const refuseeVerrouillee = (
    m: ReturnType<typeof monde>,
    dir: string,
    arg: string,
    cwd = m.repo
  ) => {
    for (const option of [[], ['--jetable']]) {
      const avant = empreinte(dir);
      const r = m.lancer([...option, arg], cwd);
      const vu = `${option.join(' ')} ${arg} (list: ${m.listees().join(', ')})\n${r.stderr}`;
      expect(r.status, vu).toBe(1);
      expect(r.stderr, vu).toContain(`la copie ${arg} est verrouillée`);
      expect(m.listees()).toContain(dir);
      expect(m.verrouillee(dir)).toBe(true);
      expect(empreinte(dir)).toEqual(avant);
    }
  };
  const MOTIFS: [string, (autre: string) => string[]][] = [
    ['with a reason', () => ['--reason', 'en cours']],
    ['without a reason', () => []],
    // A reason over two lines whose second line reads like the head of another copy's block.
    [
      'with a reason over two lines naming another copy',
      autre => ['--reason', `en cours\nworktree ${autre}`],
    ],
  ];
  for (const [motif, raison] of MOTIFS) {
    it(
      `critère 1 et 3: three copies, each locked in turn ${motif} — each is refused with « la copie … est verrouillée », stays locked and intact`,
      () => {
        const m = monde({ sousModule: false });
        const dirs = NOMS.map(nom => m.copie(nom));
        dirs.forEach((dir, i) => {
          const autre = dirs[(i + 1) % dirs.length] ?? '';
          git(m.repo, 'worktree', 'lock', ...raison(autre), dir);
          refuseeVerrouillee(m, dir, dir);
          git(m.repo, 'worktree', 'unlock', dir);
        });
      },
      LONG
    );
  }
  it(
    'critère 1 et 3: a copy that carries a submodule, among three, each locked in turn — each is refused with the lock message',
    () => {
      const m = monde();
      const dirs = NOMS.map(nom => m.copie(nom));
      for (const dir of dirs) {
        git(m.repo, 'worktree', 'lock', '--reason', 'en cours', dir);
        refuseeVerrouillee(m, dir, dir);
        git(m.repo, 'worktree', 'unlock', dir);
      }
    },
    LONG
  );
  it(
    'critère 1 et 3: each locked copy named by a path relative to the main repository, and by a symbolic link, is refused with the lock message',
    () => {
      const m = monde({ sousModule: false });
      const dirs = NOMS.map(nom => m.copie(nom));
      const liens = mkdtempSync(path.join(ESSAIS, 'liens-'));
      for (const [i, dir] of dirs.entries()) {
        const nom = NOMS[i] ?? '';
        const lien = path.join(liens, nom);
        symlinkSync(dir, lien);
        git(m.repo, 'worktree', 'lock', '--reason', 'en cours', dir);
        refuseeVerrouillee(m, dir, `.claude/worktrees/${nom}`);
        refuseeVerrouillee(m, dir, lien);
        git(m.repo, 'worktree', 'unlock', dir);
      }
    },
    LONG
  );
  // Garde: green on the present code, it keeps a fix of the lock reading from holding free copies.
  for (const [i, libre] of NOMS.entries()) {
    it(
      `critère 3 (garde): a free copy (${libre}) among locked ones is removed as today; the locked ones stay, locked`,
      () => {
        const m = monde({ sousModule: false });
        const dirs = NOMS.map(nom => m.copie(nom));
        const verrouillees = dirs.filter((_d, j) => j !== i);
        for (const dir of verrouillees) {
          git(m.repo, 'worktree', 'lock', '--reason', 'en cours', dir);
        }
        retiree(m, dirs[i] ?? '');
        for (const dir of verrouillees) {
          expect(m.listees()).toContain(dir);
          expect(m.verrouillee(dir)).toBe(true);
        }
      },
      LONG
    );
  }
});
