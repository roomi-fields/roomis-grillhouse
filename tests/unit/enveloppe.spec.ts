import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CODE_COPIE, CODE_REFUS, CODE_USAGE } from '../../scripts/enveloppe/codes.mjs';
import { montagesDeLaSeance, plan } from '../../scripts/enveloppe/enveloppe.mjs';

const SCRIPT = path.resolve(__dirname, '../../scripts/enveloppe/enveloppe.mjs');
const CODES = path.resolve(__dirname, '../../scripts/enveloppe/codes.mjs');
const LAUNCHER = path.resolve(__dirname, '../../scripts/enveloppe/lancer.sh');

// A disk described as { path: entries } for directories, a set of existing paths, the outgoing
// links of a directory and the `files` field of a directory's package.json.
function fakeDisk(
  dirs: Record<string, { name: string; dir: boolean }[]>,
  files: string[],
  links = {},
  manifests: Record<string, string[]> = {}
) {
  const exists = new Set([...Object.keys(dirs), ...files]);
  return {
    lister: (d: string) => dirs[d] ?? [],
    existe: (p: string) => exists.has(p),
    liens: (d: string) => (links as Record<string, { lien: string; cible: string }[]>)[d] ?? [],
    publies: (d: string) => manifests[d] ?? [],
  };
}

const pairs = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));

describe('plan', () => {
  const disk = fakeDisk(
    {
      '/wt/packages': [
        { name: 'a', dir: true },
        { name: 'b', dir: true },
      ],
      '/wt/packages/a': [],
      '/main/packages': [],
    },
    ['/wt/packages/b/package.json', '/wt/packages/b/docs/INTERFACE.md', '/wt/packages/b/dist']
  );
  const { args, refus } = plan(
    { trees: ['/main', '/wt'], copie: '/wt', composant: 'packages/a' },
    disk
  );

  it('mounts the machine read-only, with a /dev/shm of its own', () => {
    expect(args.slice(0, 3)).toEqual(['--ro-bind', '/', '/']);
    expect(args.join(' ')).not.toMatch(/--dev-bind \/ \//);
    expect(pairs(args, '--tmpfs')[0]).toBe('/dev/shm');
  });
  it('empties the components directory of every worktree', () => {
    expect(refus).toBeUndefined();
    expect(pairs(args, '--tmpfs')).toEqual(['/dev/shm', '/main/packages', '/wt/packages']);
  });
  it('mounts its copy, then its own component, in writing', () => {
    expect(pairs(args, '--bind')).toEqual(['/wt', '/wt/packages/a']);
  });
  it('mounts only the published parts of a sibling, read-only', () => {
    expect(pairs(args, '--ro-bind')).toEqual([
      '/',
      '/wt/packages/b/package.json',
      '/wt/packages/b/docs/INTERFACE.md',
      '/wt/packages/b/dist',
    ]);
  });
  it('seals the emptied directories after the mounts', () => {
    expect(pairs(args, '--remount-ro')).toEqual(['/main/packages', '/wt/packages']);
    expect(args.indexOf('--remount-ro')).toBeGreaterThan(args.indexOf('--bind'));
  });
  it('runs in the agent copy', () => {
    expect(pairs(args, '--chdir')).toEqual(['/wt']);
  });
});

describe('plan and the files field of a sibling', () => {
  const siblings = {
    '/wt/packages': [
      { name: 'a', dir: true },
      { name: 'b', dir: true },
      { name: 'c', dir: true },
    ],
    '/wt/packages/a': [],
  };
  const roBinds = (manifests: Record<string, string[]>, files: string[]) =>
    pairs(
      plan(
        { trees: ['/main', '/wt'], copie: '/wt', composant: 'packages/a' },
        fakeDisk(siblings, files, {}, manifests)
      ).args,
      '--ro-bind'
    );

  it('mounts read-only the paths that the files field names', () => {
    const ro = roBinds({ '/wt/packages/b': ['lib'] }, [
      '/wt/packages/b/package.json',
      '/wt/packages/b/lib',
      '/wt/packages/c/package.json',
    ]);
    expect(ro).toContain('/wt/packages/b/lib');
    expect(ro).not.toContain('/wt/packages/c/lib');
  });
  it('gives a sibling without files its published parts only', () => {
    const ro = roBinds({}, [
      '/wt/packages/b/package.json',
      '/wt/packages/b/dist',
      '/wt/packages/b/lib',
      '/wt/packages/b/src',
    ]);
    expect(ro).toEqual(['/', '/wt/packages/b/package.json', '/wt/packages/b/dist']);
  });
  it('mounts no path of files that the disk lacks', () => {
    const ro = roBinds({ '/wt/packages/b': ['lib', 'bin'] }, ['/wt/packages/b/lib']);
    expect(ro).toContain('/wt/packages/b/lib');
    expect(ro).not.toContain('/wt/packages/b/bin');
  });
  it('mounts no path of files that leaves the sibling', () => {
    const ro = roBinds({ '/wt/packages/b': ['../c/src'] }, ['/wt/packages/c/src']);
    expect(ro).not.toContain('/wt/packages/c/src');
  });
  it('mounts a path once when files repeats a published part', () => {
    const ro = roBinds({ '/wt/packages/b': ['dist'] }, ['/wt/packages/b/dist']);
    expect(ro.filter(p => p === '/wt/packages/b/dist')).toHaveLength(1);
  });
});

describe('plan in a one-package project', () => {
  it('gives back the parent files read-only', () => {
    const disk = fakeDisk(
      {
        '/wt/src': [
          { name: 'index.ts', dir: false },
          { name: 'parser', dir: true },
        ],
        '/wt/src/parser': [],
      },
      []
    );
    const { args } = plan({ trees: ['/main', '/wt'], copie: '/wt', composant: 'src/parser' }, disk);
    expect(pairs(args, '--ro-bind')).toEqual(['/', '/wt/src/index.ts']);
  });
});

describe('plan and the session mounts', () => {
  const montages = montagesDeLaSeance({
    cacheNpm: '/h/.npm',
    claude: '/h/.claude',
    projet: '/h/.claude/projects/-wt',
    etatJetable: '/t/claude.json',
    scratchpads: '/tmp/claude-1/-wt',
  });
  const disk = fakeDisk({ '/wt/packages': [], '/wt/packages/a': [] }, [
    '/h/.npm',
    '/h/.claude',
    '/t/claude.json',
    '/h/.claude/settings.json',
    '/h/.claude/projects',
    '/h/.claude/projects/-wt',
    '/tmp/claude-1/-wt',
    '/wt/.git',
    '/main/.beads',
  ]);
  const { args } = plan(
    { trees: ['/main', '/wt'], copie: '/wt', composant: 'packages/a', montages },
    disk
  );
  const triples = (flag: string) =>
    args.flatMap((a, i) => (a === flag ? [`${args[i + 1]}>${args[i + 2]}`] : []));

  it('gives the session an empty /tmp, then its scratchpads, npm cache and state in writing', () => {
    expect(pairs(args, '--tmpfs')).toContain('/tmp');
    expect(triples('--bind')).toEqual([
      '/tmp/claude-1/-wt>/tmp/claude-1/-wt',
      '/h/.npm>/h/.npm',
      '/h/.claude>/h/.claude',
      '/t/claude.json>/h/.claude.json',
      '/h/.claude/projects/-wt>/h/.claude/projects/-wt',
      '/wt>/wt',
      '/main/.beads>/main/.beads',
      '/wt/packages/a>/wt/packages/a',
    ]);
  });
  it('keeps the configuration and the other projects read-only, its own project writable', () => {
    const ro = triples('--ro-bind');
    expect(ro).toContain('/h/.claude/settings.json>/h/.claude/settings.json');
    expect(ro).toContain('/h/.claude/projects>/h/.claude/projects');
    expect(args.lastIndexOf('/h/.claude/projects/-wt')).toBeGreaterThan(
      args.indexOf('/h/.claude/projects')
    );
  });
  it('mounts nothing that does not exist', () => {
    expect(args).not.toContain('/h/.claude/plugins');
  });
  it('mounts the copy after /tmp, and its .git read-only', () => {
    expect(args.indexOf('/wt')).toBeGreaterThan(args.indexOf('/tmp'));
    expect(triples('--ro-bind')).toContain('/wt/.git>/wt/.git');
  });
});

describe('plan for a folder of the root', () => {
  const { args, refus } = plan(
    { trees: ['/main', '/wt'], copie: '/wt', composant: 'scripts' },
    fakeDisk({ '/wt': [{ name: 'scripts', dir: true }], '/wt/scripts': [] }, ['/wt/.git'])
  );
  it('hides nothing, and keeps the copy written and its .git read-only', () => {
    expect(refus).toBeUndefined();
    expect(pairs(args, '--tmpfs')).toEqual(['/dev/shm']);
    expect(args.join(' ')).toContain('--bind /wt /wt');
    expect(args.join(' ')).toContain('--ro-bind /wt/.git /wt/.git');
    expect(args).not.toContain('--remount-ro');
  });
});

describe('plan refuses', () => {
  it('the main tree', () => {
    const { refus } = plan(
      { trees: ['/main', '/wt'], copie: '/main', composant: 'packages/a' },
      fakeDisk({ '/main/packages/a': [] }, ['/main/packages/a'])
    );
    expect(refus).toMatch(/arbre principal/);
  });
  it('a missing component', () => {
    const { refus } = plan(
      { trees: ['/main', '/wt'], copie: '/wt', composant: 'packages/z' },
      fakeDisk({ '/wt/packages': [] }, [])
    );
    expect(refus).toMatch(/n'existe pas/);
  });
  it('a link that crosses into a hidden component', () => {
    const disk = fakeDisk({ '/wt/packages': [], '/wt/packages/a': [] }, [], {
      '/wt/packages/a': [{ lien: '/wt/packages/a/x', cible: '/main/packages/b/src' }],
    });
    const { refus } = plan(
      { trees: ['/main', '/wt'], copie: '/wt', composant: 'packages/a' },
      disk
    );
    expect(refus).toMatch(/traverserait l'enveloppe/);
  });
  it('lets a link to an unhidden place through', () => {
    const disk = fakeDisk({ '/wt/packages': [], '/wt/packages/a': [] }, [], {
      '/wt/packages/a': [{ lien: '/wt/packages/a/x', cible: '/usr/lib/node' }],
    });
    const { refus } = plan(
      { trees: ['/main', '/wt'], copie: '/wt', composant: 'packages/a' },
      disk
    );
    expect(refus).toBeUndefined();
  });
});

// The real envelope, when this machine can build one. Its repositories live outside /tmp, which
// the envelope replaces with an empty directory.
const ESSAIS = path.join(homedir(), '.cache', 'grillhouse-essais-enveloppe');
mkdirSync(ESSAIS, { recursive: true });
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const essai = (nom: string) => mkdtempSync(path.join(ESSAIS, nom));

const canWrap = spawnSync('bwrap', ['--dev-bind', '/', '/', 'true']).status === 0;

describe.runIf(canWrap)('the envelope on disk', () => {
  const repo = essai('enveloppe-');
  for (const d of ['packages/a/src', 'packages/b/src', 'packages/b/docs', 'packages/b/dist']) {
    mkdirSync(path.join(repo, d), { recursive: true });
  }
  writeFileSync(path.join(repo, 'packages/a/src/a.ts'), 'a');
  mkdirSync(path.join(repo, '.beads'));
  writeFileSync(path.join(repo, '.beads/config.yaml'), '');
  writeFileSync(path.join(repo, 'packages/b/src/b.ts'), 'secret');
  writeFileSync(path.join(repo, 'packages/b/docs/INTERFACE.md'), 'interface');
  writeFileSync(path.join(repo, 'packages/b/dist/index.d.ts'), 'declare');
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'init');
  const copie = path.join(repo, '.claude/worktrees/demo-1');
  git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie);
  // A home of its own: the session state is read and written there, never in the real one.
  const home = essai('home-');
  mkdirSync(path.join(home, '.claude/projects/-autre'), { recursive: true });
  writeFileSync(path.join(home, '.claude/settings.json'), '{}');
  writeFileSync(path.join(home, '.claude.json'), '{"vrai":1}');
  const dehors = mkdtempSync(path.join(tmpdir(), 'dehors-'));

  const run = (shell: string, dir = copie) =>
    spawnSync('node', [SCRIPT, dir, 'packages/a', '--', 'bash', '-c', shell], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
    });

  it('hides the code of the other components', () => {
    expect(run('cat packages/b/src/b.ts').status).not.toBe(0);
  });
  it('shows their interface and declarations', () => {
    expect(run('cat packages/b/docs/INTERFACE.md packages/b/dist/index.d.ts').stdout).toBe(
      'interfacedeclare'
    );
  });
  it('keeps their published parts read-only', () => {
    expect(run('touch packages/b/docs/x').status).not.toBe(0);
  });
  it('lets the agent write its own component', () => {
    expect(run('touch packages/a/src/new.ts').status).toBe(0);
  });
  it('lets the agent write the tickets base of the main tree', () => {
    expect(run(`touch ${repo}/.beads/ecrit`).status).toBe(0);
    expect(existsSync(path.join(repo, '.beads/ecrit'))).toBe(true);
  });
  it('refuses every write outside the copy: the main tree, its .git, another directory', () => {
    for (const f of [`${repo}/x`, `${repo}/.git/x`, `${home}/x`]) {
      expect(run(`touch ${f}`).status).not.toBe(0);
      expect(existsSync(f)).toBe(false);
    }
  });
  it('shows an empty /tmp, without the files of other sessions', () => {
    writeFileSync(path.join(dehors, 'secret'), 's');
    expect(run(`cat ${dehors}/secret`).status).not.toBe(0);
    expect(run('touch /tmp/x').status).toBe(0);
  });
  it('lets git read the copy and make a patch, but not write its index', () => {
    const r = run('git status --short && git diff --no-index /dev/null packages/a/src/a.ts; true');
    expect(r.stdout).toMatch(/\+a/);
    expect(run('git add packages/a/src/a.ts').status).not.toBe(0);
  });
  it('writes the session state, but not the configuration nor the other projects', () => {
    const projet = path.join(home, '.claude/projects', copie.replace(/[^A-Za-z0-9]/g, '-'));
    expect(run(`touch ${projet}/x`).status).toBe(0);
    expect(run(`touch ${home}/.claude/settings.json`).status).not.toBe(0);
    expect(run(`touch ${home}/.claude/projects/-autre/x`).status).not.toBe(0);
  });
  it('gives a throwaway copy of the global state, that the session writes', () => {
    const r = run(`cat ~/.claude.json && echo '{}' > ~/.claude.json && cat ~/.claude.json`);
    expect(r.stdout).toBe('{"vrai":1}{}\n');
    expect(readFileSync(path.join(home, '.claude.json'), 'utf8')).toBe('{"vrai":1}');
  });
  it('refuses the main tree', () => {
    const r = run('true', repo);
    expect(r.status).toBe(CODE_REFUS);
    expect(r.stderr).toMatch(/arbre principal/);
  });
  it('refuses to launch through a crossing link', () => {
    symlinkSync(path.join(copie, 'packages/b/src'), path.join(copie, 'packages/a/vers-b'));
    const r = run('true');
    expect(r.status).toBe(CODE_REFUS);
    expect(r.stderr).toMatch(/traverserait l'enveloppe/);
  });
});

// METACADRE intention 5, « des agents cadrés », and the arbitration of grillhouse-3uv.8: like
// Flatpak and the development containers, the envelope shows of the home and of the session
// directory ($XDG_RUNTIME_DIR, /run/user/<uid>) what it declares, and nothing else. It declares
// what the session needs: `~/.claude` and `~/.claude.json`, claude's binary and versions
// (`~/.local/bin/claude`, `~/.local/share/claude`), node and its tools (`~/.nvm`), `~/.gitconfig`,
// the npm cache, and the repository (main tree, its `.git`, `.beads`) with today's rights. No
// socket of the session comes back.
describe.runIf(canWrap)(
  'the envelope shows of the home and the session only what it declares',
  () => {
    const home = essai('home-');
    // The repository lives in the home, as on the machine.
    const repo = path.join(home, 'dev/projet');
    mkdirSync(path.join(repo, 'packages/a/src'), { recursive: true });
    mkdirSync(path.join(repo, 'packages/b/src'), { recursive: true });
    writeFileSync(path.join(repo, 'packages/a/src/a.ts'), 'a');
    writeFileSync(path.join(repo, 'packages/b/src/b.ts'), 'code-of-b');
    writeFileSync(path.join(repo, 'LISEZMOI'), 'racine');
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('init', '-q');
    // A real tickets base, made by bd in this home: it writes there its own state (`~/.dolt`,
    // `~/.beads`, `~/.config/bd`), which the session's bd reads to open the base.
    const bdDehors = (...a: string[]) =>
      execFileSync('bd', a, { cwd: repo, env: { ...process.env, HOME: home }, stdio: 'pipe' });
    bdDehors('init', '-q', '--non-interactive', '-p', 'essai');
    git('add', '.');
    git('commit', '-qm', 'init');
    const copie = path.join(repo, '.claude/worktrees/demo-1');
    git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie);

    // Stores of secrets: those of the usual tools, those of rarer ones, and two whose names are
    // drawn at random, so that no list of the envelope can name them.
    const inconnu = `.${randomUUID()}`;
    const SECRETS: Record<string, string> = {
      '.ssh/id_ed25519': 'SECRET-ssh-key',
      '.config/gh/hosts.yml': 'SECRET-gh-token',
      '.npmrc': 'SECRET-npm-token',
      '.aws/credentials': 'SECRET-aws-key',
      '.gnupg/private-keys-v1.d/k.key': 'SECRET-gpg-key',
      '.netrc': 'SECRET-netrc',
      '.git-credentials': 'SECRET-git-credentials',
      '.config/git/credentials': 'SECRET-git-xdg-credentials',
      '.docker/config.json': 'SECRET-docker-auth',
      '.kube/config': 'SECRET-kube-token',
      '.ollama/id_ed25519': 'SECRET-ollama-key',
      '.config/restic/password': 'SECRET-restic-password',
      '.local/share/keyrings/login.keyring': 'SECRET-keyring',
      '.bash_history': 'SECRET-history',
      '.claude.json.bak': 'SECRET-claude-backup',
      // Beside the targets of the declared configurations a dotfiles manager links (below).
      'dotfiles/autre': 'SECRET-dotfiles-neighbour',
      'dotfiles/git/autre': 'SECRET-dotfiles-deep-neighbour',
      'stow/autre': 'SECRET-stow-neighbour',
      [`${inconnu}/token`]: 'SECRET-unnamed-store',
      [`.config/${randomUUID()}/auth.json`]: 'SECRET-unnamed-config',
    };
    // What the session reads to start and work: it comes back.
    const DECLARES: Record<string, string> = {
      '.claude/.credentials.json': 'claude-oauth',
      '.claude/settings.json': '{}',
      '.claude.json': '{"etat":1}',
      '.nvm/versions/node/v1/bin/marque': 'nvm',
      '.npm/_cacache/marque': 'cache',
    };
    for (const [rel, contenu] of Object.entries({ ...SECRETS, ...DECLARES })) {
      mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
      writeFileSync(path.join(home, rel), contenu);
    }
    // The launchers of the home are links, as on the machine: claude's to its binary; those of
    // codegraph and rtfm to a script of their package, which finds the package's other files
    // beside its own real path.
    const ecrire = (rel: string, contenu: string, mode = 0o644) => {
      mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
      writeFileSync(path.join(home, rel), contenu, { mode });
    };
    const lier = (rel: string, cible: string) => {
      mkdirSync(path.dirname(path.join(home, rel)), { recursive: true });
      symlinkSync(cible, path.join(home, rel));
    };
    const LANCEUR = '#!/bin/sh\ncat "$(dirname "$(readlink -f "$0")")/voisin"\n';
    ecrire('.local/share/claude/versions/1.0.0', '#!/bin/sh\necho claude-demarre\n', 0o755);
    lier('.local/bin/claude', path.join(home, '.local/share/claude/versions/1.0.0'));
    ecrire('.nvm/versions/node/v1/lib/node_modules/codegraph/shim.sh', LANCEUR, 0o755);
    ecrire('.nvm/versions/node/v1/lib/node_modules/codegraph/voisin', 'codegraph-voisin\n');
    lier('.nvm/versions/node/v1/bin/codegraph', '../lib/node_modules/codegraph/shim.sh');
    lier('.local/bin/codegraph', path.join(home, '.nvm/versions/node/v1/bin/codegraph'));
    ecrire('.local/share/pipx/venvs/rtfm/bin/rtfm', LANCEUR, 0o755);
    ecrire('.local/share/pipx/venvs/rtfm/bin/voisin', 'rtfm-voisin\n');
    lier('.local/bin/rtfm', path.join(home, '.local/share/pipx/venvs/rtfm/bin/rtfm'));
    // The git configurations are links a dotfiles manager keeps into directories of the home the
    // envelope does not declare: an absolute link, a relative one, and a link to a link.
    ecrire('dotfiles/gitconfig', '[user]\n\tname = t\n');
    lier('.gitconfig', path.join(home, 'dotfiles/gitconfig'));
    ecrire('dotfiles/git/ignore', '*.sonde\n');
    lier('.config/git/ignore', '../../dotfiles/git/ignore');
    ecrire('stow/attributes', '*.sonde diff\n');
    lier('dotfiles/lien-attributes', path.join(home, 'stow/attributes'));
    lier('.config/git/attributes', path.join(home, 'dotfiles/lien-attributes'));
    // The paths of the home the envelope declares, as prefixes; every file seen in the home falls
    // under one of them.
    const PREFIXES = [
      '.claude/',
      '.claude.json',
      '.gitconfig',
      '.local/bin/claude',
      '.local/share/claude/',
      '.nvm/',
      '.npm/',
      '.local/bin/codegraph',
      '.local/bin/rtfm',
      '.local/share/pipx/',
      '.dolt/',
      '.beads/',
      '.config/bd/',
      '.config/git/ignore',
      '.config/git/attributes',
      'dotfiles/gitconfig',
      'dotfiles/git/ignore',
      'dotfiles/lien-attributes',
      'stow/attributes',
      'dev/projet/',
    ];

    // A session directory holding the sockets of the session (ssh agent, bus, gpg-agent) and a
    // file. A socket path is bound relative to its directory: the absolute one may pass the limit
    // of 108 signs.
    const session = essai('session-');
    const prise = (rel: string) => {
      const dir = path.join(session, path.dirname(rel));
      mkdirSync(dir, { recursive: true });
      execFileSync(
        'python3',
        [
          '-c',
          'import socket,sys; socket.socket(socket.AF_UNIX).bind(sys.argv[1])',
          path.basename(rel),
        ],
        { cwd: dir }
      );
      return path.join(session, rel);
    };
    const agentSsh = prise('keyring/ssh');
    const bus = prise('bus');
    prise('gnupg/S.gpg-agent');
    writeFileSync(path.join(session, 'SECRET-session-file'), 'SECRET-session');

    const env = (maison: string) => ({
      ...process.env,
      HOME: maison,
      XDG_RUNTIME_DIR: session,
      SSH_AUTH_SOCK: agentSsh,
      DBUS_SESSION_BUS_ADDRESS: `unix:path=${bus}`,
      npm_config_cache: path.join(maison, '.npm'),
    });
    const run = (shell: string, maison = home) =>
      spawnSync('node', [SCRIPT, copie, 'packages/a', '--', 'bash', '-c', shell], {
        encoding: 'utf8',
        env: env(maison),
      });

    it('shows no store of the home it does not declare, named by a list or not', () => {
      for (const [rel, secret] of Object.entries(SECRETS)) {
        const r = run(`cat ~/${rel}; test -e ~/${rel}`);
        expect(r.stdout, rel).not.toContain(secret);
        expect(r.status, rel).not.toBe(0);
      }
      expect(run(`test -e ~/${inconnu}`).status).not.toBe(0);
    });
    it('lets no search of the home reach a secret', () => {
      const r = run('grep -rs SECRET ~ 2>/dev/null; true');
      expect(r.stdout).not.toMatch(/SECRET/);
    });
    it('holds in the home only the files of its declared paths', () => {
      const r = run('cd ~ && find . -type f -o -type l');
      const vus = r.stdout
        .split('\n')
        .filter(Boolean)
        .map(l => l.replace(/^\.\//, ''));
      expect(vus.length).toBeGreaterThan(0);
      const horsDeclares = vus.filter(f => !PREFIXES.some(p => f === p || f.startsWith(p)));
      expect(horsDeclares).toEqual([]);
    });
    it('keeps what claude needs to start: credentials, settings, global state, binary, versions', () => {
      expect(run('cat ~/.claude/.credentials.json').stdout).toBe('claude-oauth');
      expect(run('cat ~/.claude/settings.json').stdout).toBe('{}');
      expect(run('cat ~/.claude.json').stdout).toBe('{"etat":1}');
      expect(run('~/.local/bin/claude').stdout).toBe('claude-demarre\n');
    });
    it('keeps a declared launcher that is a link a link: its package finds its other files', () => {
      expect(run('~/.local/bin/codegraph').stdout).toBe('codegraph-voisin\n');
      expect(run('~/.local/bin/rtfm').stdout).toBe('rtfm-voisin\n');
      expect(run('PATH=~/.local/bin:$PATH codegraph').stdout).toBe('codegraph-voisin\n');
    });
    it('lets bd read and write the tickets base of the main tree with its own state', () => {
      const cree = run('bd create "sonde de l\'enveloppe" --json');
      expect(cree.status, cree.stderr).toBe(0);
      const { id } = JSON.parse(cree.stdout) as { id: string };
      const lu = run(`bd show ${id} --json`);
      expect(lu.status, lu.stderr).toBe(0);
      expect(lu.stdout).toContain("sonde de l'enveloppe");
    });
    it('keeps node and its tools, and the git configuration', () => {
      expect(run('cat ~/.nvm/versions/node/v1/bin/marque').stdout).toBe('nvm');
      expect(run('git config --global user.name').stdout.trim()).toBe('t');
    });
    // The rule of the links (enveloppe.mjs, `avecLiens`), as Flatpak exposes a link: a declared
    // path that is a link brings back its target, link by link, with the link's rights, and
    // nothing beside it.
    it('brings back the target of a declared configuration linked into an undeclared directory', () => {
      expect(run('git config --global user.name').stdout.trim()).toBe('t');
      expect(run('cat ~/.gitconfig').stdout).toBe('[user]\n\tname = t\n');
      expect(run('cat ~/.config/git/ignore').stdout).toBe('*.sonde\n');
      expect(run('cat ~/.config/git/attributes').stdout).toBe('*.sonde diff\n');
      expect(run('git check-ignore -q x.sonde').status).toBe(0);
    });
    it('shows nothing beside the target of a declared link, and keeps the link read-only', () => {
      for (const rel of ['dotfiles/autre', 'dotfiles/git/autre', 'stow/autre']) {
        expect(run(`test -e ~/${rel}`).status, rel).not.toBe(0);
      }
      expect(run('ls -A ~/dotfiles').stdout.split('\n').filter(Boolean).sort()).toEqual([
        'git',
        'gitconfig',
        'lien-attributes',
      ]);
      expect(run('echo x >> ~/.gitconfig').status).not.toBe(0);
      expect(run('echo x >> ~/.config/git/attributes').status).not.toBe(0);
      expect(readFileSync(path.join(home, 'dotfiles/gitconfig'), 'utf8')).toBe(
        '[user]\n\tname = t\n'
      );
      expect(readFileSync(path.join(home, 'stow/attributes'), 'utf8')).toBe('*.sonde diff\n');
    });
    it('lets the session write the npm cache', () => {
      expect(run('touch ~/.npm/ecrit').status).toBe(0);
      expect(existsSync(path.join(home, '.npm/ecrit'))).toBe(true);
    });
    it('keeps the repository of the home: the copy written, the main tree and its .git read', () => {
      expect(run('git status --short').status).toBe(0);
      expect(run(`cat ${repo}/LISEZMOI`).stdout).toBe('racine');
      expect(run('touch packages/a/src/nouveau.ts').status).toBe(0);
      expect(run(`touch ${repo}/x`).status).not.toBe(0);
      expect(run(`touch ${repo}/.git/x`).status).not.toBe(0);
      expect(run('cat packages/b/src/b.ts').stdout).not.toContain('code-of-b');
    });
    it('lets the session write the tickets base of the main tree in the home', () => {
      expect(run(`touch ${repo}/.beads/ecrit`).status).toBe(0);
      expect(existsSync(path.join(repo, '.beads/ecrit'))).toBe(true);
    });
    it('writes nothing to the home outside its declared paths', () => {
      run(
        'mkdir -p ~/.ssh; echo x > ~/.ssh/authorized_keys; echo x > ~/.npmrc; touch ~/neuf; true'
      );
      expect(existsSync(path.join(home, '.ssh/authorized_keys'))).toBe(false);
      expect(readFileSync(path.join(home, '.npmrc'), 'utf8')).toBe('SECRET-npm-token');
      expect(existsSync(path.join(home, 'neuf'))).toBe(false);
    });
    it('still launches in a home that holds none of the declared paths but ~/.claude', () => {
      const nu = essai('home-nu-');
      mkdirSync(path.join(nu, '.claude'));
      const r = run('echo ok', nu);
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('ok\n');
    });
    it('shows the session directory empty: no ssh agent, no bus, no gpg-agent', () => {
      expect(run('ls -A "$XDG_RUNTIME_DIR" 2>/dev/null; true').stdout).toBe('');
      expect(run('test -S "$SSH_AUTH_SOCK"').status).not.toBe(0);
      expect(run(`test -S ${bus}`).status).not.toBe(0);
      expect(run(`cat ${session}/SECRET-session-file`).stdout).not.toContain('SECRET');
    });
  }
);

// The session directory of this machine, when it has one: the envelope shows it empty.
const sessionReelle = `/run/user/${process.getuid?.()}`;
describe.runIf(canWrap && existsSync(sessionReelle))(
  'the envelope and the session of the machine',
  () => {
    const repo = essai('session-reelle-');
    mkdirSync(path.join(repo, 'packages/a'), { recursive: true });
    writeFileSync(path.join(repo, 'packages/a/a.ts'), 'a');
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'init');
    const copie = path.join(repo, '.claude/worktrees/demo-1');
    git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie);
    const home = essai('home-');
    mkdirSync(path.join(home, '.claude'));

    it('shows /run/user/<uid> empty, whatever the session holds there', () => {
      const r = spawnSync(
        'node',
        [
          SCRIPT,
          copie,
          'packages/a',
          '--',
          'bash',
          '-c',
          `ls -A ${sessionReelle} 2>/dev/null; true`,
        ],
        { encoding: 'utf8', env: { ...process.env, HOME: home, XDG_RUNTIME_DIR: sessionReelle } }
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
    });
  }
);

// The probe of the ticket, on the real home of this machine: claude and the tools of the session
// work in the envelope, each for real — claude reads its identity, bd opens a tickets base,
// codegraph answers from an index. Its copy is the one this suite runs in, when that copy is not
// the main tree and its session directory under the real `~/.claude/projects` can be written (a
// role session); else, where `~/.claude/projects` can be written (outside an envelope), a test
// repository, whose tickets base and index are made here and whose session directory is removed
// after. On the copy of this suite, bd only reads the base: the probe writes no ticket there.
const maisonReelle = userInfo().homedir;
const projetsReels = path.join(maisonReelle, '.claude/projects');
const ecrivable = (p: string) => {
  try {
    accessSync(p, constants.W_OK);
    return true;
  } catch {
    return false;
  }
};
const enTirets = (p: string) => p.replace(/[^A-Za-z0-9]/g, '-');
const DEPOT = path.resolve(__dirname, '../..');
const copieDeLaSuite = (() => {
  const r = spawnSync('git', ['-C', DEPOT, 'worktree', 'list', '--porcelain'], {
    encoding: 'utf8',
  });
  const principal = r.stdout?.split('\n')[0]?.replace(/^worktree /, '');
  return r.status === 0 &&
    principal &&
    path.resolve(principal) !== DEPOT &&
    ecrivable(path.join(projetsReels, enTirets(DEPOT)))
    ? DEPOT
    : null;
})();
const sondeEssai = !copieDeLaSuite && ecrivable(projetsReels);
describe.runIf(canWrap && (copieDeLaSuite || sondeEssai))('the envelope on the real home', () => {
  const reel = { ...process.env, HOME: maisonReelle };
  const dehors = (cmd: string[], cwd: string) =>
    spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: 'utf8', env: reel, timeout: 60000 });
  let copie: string;
  let symbole: string;
  if (copieDeLaSuite) {
    copie = copieDeLaSuite;
    symbole = 'montagesDeLaSeance';
  } else {
    const repo = essai('maison-reelle-');
    mkdirSync(path.join(repo, 'packages/a'), { recursive: true });
    symbole = 'sondeDeLEnveloppe';
    writeFileSync(path.join(repo, 'packages/a/a.ts'), `export function ${symbole}() {}\n`);
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('init', '-q');
    dehors(['bd', 'init', '-q', '--non-interactive', '-p', 'essai'], repo);
    dehors(['bd', 'create', 'ticket de la sonde', '--json'], repo);
    dehors(['codegraph', 'init', repo], repo);
    git('add', '.');
    git('commit', '-qm', 'init');
    copie = path.join(repo, '.claude/worktrees/demo-1');
    git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie);
    const projet = path.join(projetsReels, enTirets(copie));
    afterAll(() => rmSync(projet, { recursive: true, force: true }));
  }
  const composant = copieDeLaSuite ? 'scripts' : 'packages/a';
  const dedans = (cmd: string[]) =>
    spawnSync('node', [SCRIPT, copie, composant, '--', ...cmd], {
      encoding: 'utf8',
      env: reel,
      timeout: 60000,
    });
  // A ticket of the base, as bd reads it outside the envelope.
  const ticket = (() => {
    const r = dehors(['bd', 'list', '--json', '--limit', '1'], copie);
    if (r.status !== 0) {
      return null;
    }
    const liste = JSON.parse(r.stdout) as { id: string }[];
    return liste[0]?.id ?? null;
  })();
  // Each tool, its command and what its answer holds; a tool is probed when it answers so outside.
  // bd and codegraph have their own probes, below.
  const SONDES: { outil: string; cmd: string[]; attendu: string }[] = [
    { outil: 'claude', cmd: ['claude', 'auth', 'status'], attendu: '"loggedIn": true' },
    { outil: 'git', cmd: ['git', 'status', '--short'], attendu: '' },
    { outil: 'npm', cmd: ['npm', 'config', 'get', 'cache'], attendu: '' },
  ];
  const sondes = SONDES.filter(s => {
    const r = dehors(s.cmd, copie);
    return r.status === 0 && r.stdout.includes(s.attendu);
  });

  it('starts claude with its identity, and the tools of the session for real', () => {
    expect(sondes.map(s => s.outil)).toContain('claude');
    for (const { outil, cmd, attendu } of sondes) {
      const r = dedans(cmd);
      expect(r.status, `${outil}: ${r.stderr}`).toBe(0);
      expect(r.stdout, outil).toContain(attendu);
    }
  });
  it('lets bd open the tickets base of the repository', () => {
    expect(ticket).not.toBeNull();
    const r = dedans(['bd', 'show', ticket as string, '--json']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(ticket);
  });
  it('lets codegraph answer from the index of the repository', () => {
    const r = dedans(['codegraph', 'query', symbole, '-p', copie, '--json']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(symbole);
  });
  it.runIf(sondeEssai)('lets bd write a ticket in the tickets base of the repository', () => {
    const r = dedans(['bd', 'create', "ticket écrit dans l'enveloppe", '--json']);
    expect(r.status, r.stderr).toBe(0);
    expect(dehors(['bd', 'list', '--json'], copie).stdout).toContain('écrit dans l');
  });
});

describe.runIf(canWrap)('the launcher', () => {
  const repo = essai('lancer-');
  for (const d of ['packages/a/src', 'packages/b/src', '.claude/agents', 'scripts/enveloppe']) {
    mkdirSync(path.join(repo, d), { recursive: true });
  }
  writeFileSync(path.join(repo, 'packages/a/src/a.ts'), 'a');
  writeFileSync(path.join(repo, 'packages/b/src/b.ts'), 'secret');
  writeFileSync(path.join(repo, '.claude/agents/developpeur.md'), '---\nname: developpeur\n---\n');
  execFileSync('cp', [SCRIPT, CODES, path.join(repo, 'scripts/enveloppe/')]);
  execFileSync('git', ['init', '-q', repo]);
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', [
    '-C',
    repo,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-qm',
    'init',
  ]);
  // A stand-in for claude: records its arguments and what it can see of the neighbour.
  const fake = path.join(repo, 'faux-claude.sh');
  writeFileSync(
    fake,
    '#!/bin/bash\nprintf "%s|" "$@" > packages/a/args\ncat packages/b/src/b.ts > packages/a/vu 2>&1 || echo cache >> packages/a/vu\n',
    { mode: 0o755 }
  );
  const consigne = path.join(repo, 'consigne.txt');
  writeFileSync(consigne, 'TON TICKET : demo-1 — un sujet.');
  const launch = (file: string) =>
    spawnSync('bash', [LAUNCHER, 'demo-1', 'developpeur', 'packages/a', file], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_BIN: fake, HOME: home },
    });
  const home = essai('home-');
  const copie = path.join(repo, '.claude/worktrees/demo-1');

  it('runs the role session in the envelope of its copy', () => {
    expect(launch(consigne).status).toBe(0);
    const args = execFileSync('cat', [path.join(copie, 'packages/a/args')], { encoding: 'utf8' });
    expect(args).toBe(
      '-p|TON TICKET : demo-1 — un sujet.|--agent|developpeur|--permission-mode|bypassPermissions|'
    );
    const vu = execFileSync('cat', [path.join(copie, 'packages/a/vu')], { encoding: 'utf8' });
    expect(vu).not.toMatch(/secret/);
  });
  it('matches the ticket whole', () => {
    const longer = path.join(repo, 'plus-long.txt');
    writeFileSync(longer, 'TON TICKET : demo-10 — un autre.');
    expect(launch(longer).status).toBe(CODE_USAGE);
  });
  it('places the copy next to the others when launched from a copy', () => {
    const r = spawnSync('bash', [LAUNCHER, 'demo-1', 'developpeur', 'packages/a', consigne], {
      cwd: copie,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_BIN: fake, HOME: home },
    });
    expect(r.status).toBe(0);
    expect(existsSync(path.join(copie, '.claude/worktrees'))).toBe(false);
  });
  it('stops when the copy cannot move forward, and logs why', () => {
    execFileSync('git', [
      '-C',
      copie,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'agent',
    ]);
    execFileSync('git', [
      '-C',
      repo,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'main',
    ]);
    const r = launch(consigne);
    expect(r.status).toBe(CODE_COPIE);
    expect(readFileSync(copie + '.log', 'utf8')).toMatch(/fast-forward|Not possible|impossible/i);
  });
  it('refuses an instruction without its ticket', () => {
    const other = path.join(repo, 'autre.txt');
    writeFileSync(other, 'TON TICKET : demo-2 — autre.');
    const r = launch(other);
    expect(r.status).toBe(CODE_USAGE);
    expect(r.stderr).toMatch(/ne porte pas/);
  });
});

describe('the exit codes', () => {
  it('are printed as NAME=value for the launcher', () => {
    const out = execFileSync('node', [CODES], { encoding: 'utf8' });
    expect(out).toBe(
      `CODE_USAGE=${CODE_USAGE}\nCODE_REFUS=${CODE_REFUS}\nCODE_COPIE=${CODE_COPIE}\n`
    );
  });
  it('make the launcher exit CODE_USAGE on a malformed call', () => {
    expect(spawnSync('bash', [LAUNCHER, 'demo-1'], { encoding: 'utf8' }).status).toBe(CODE_USAGE);
  });
});

// The launcher before its envelope: a stand-in for npm, first in the PATH, records its calls and
// writes the installation mark that npm writes. The installation does not depend on bwrap.
describe('the launcher and the dependencies of the copy', () => {
  const repo = essai('installer-');
  for (const d of ['packages/a/src', '.claude/agents', 'scripts/enveloppe', 'bin']) {
    mkdirSync(path.join(repo, d), { recursive: true });
  }
  writeFileSync(path.join(repo, 'packages/a/src/a.ts'), 'a');
  writeFileSync(path.join(repo, '.claude/agents/developpeur.md'), '---\nname: developpeur\n---\n');
  writeFileSync(path.join(repo, 'package.json'), '{"name":"t","private":true}\n');
  writeFileSync(path.join(repo, 'package-lock.json'), '{"lockfileVersion":3}\n');
  writeFileSync(path.join(repo, '.gitignore'), 'node_modules\nbin\nappels\nconsigne.txt\n');
  execFileSync('cp', [SCRIPT, CODES, path.join(repo, 'scripts/enveloppe/')]);
  const appels = path.join(repo, 'appels');
  writeFileSync(
    path.join(repo, 'bin/npm'),
    [
      '#!/bin/bash',
      `echo "$*" >> ${appels}`,
      '[ "$1" = config ] && { echo "$HOME/.npm"; exit 0; }',
      '[ "$3" = install ] && mkdir -p "$2/node_modules" && touch "$2/node_modules/.package-lock.json"',
      'exit 0',
      '',
    ].join('\n'),
    { mode: 0o755 }
  );
  const consigne = path.join(repo, 'consigne.txt');
  writeFileSync(consigne, 'TON TICKET : demo-1 — un sujet.');
  execFileSync('git', ['init', '-q', repo]);
  execFileSync('git', ['-C', repo, 'add', '.']);
  execFileSync('git', [
    '-C',
    repo,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-qm',
    'init',
  ]);
  const home = essai('home-');
  const copie = path.join(repo, '.claude/worktrees/demo-1');
  const lock = path.join(copie, 'package-lock.json');
  const mark = path.join(copie, 'node_modules/.package-lock.json');
  const installs = () => {
    writeFileSync(appels, '');
    spawnSync('bash', [LAUNCHER, 'demo-1', 'developpeur', 'packages/a', consigne], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_BIN: 'true',
        HOME: home,
        PATH: `${path.join(repo, 'bin')}:${process.env.PATH}`,
      },
    });
    return readFileSync(appels, 'utf8')
      .split('\n')
      .filter(l => / install /.test(l)).length;
  };
  const age = (file: string, seconds: number) => {
    const t = new Date(Date.now() - seconds * 1000);
    utimesSync(file, t, t);
  };

  it('installs a copy without node_modules', () => {
    expect(installs()).toBe(1);
    expect(existsSync(mark)).toBe(true);
  });
  it('reinstalls when package-lock.json is newer than the installation', () => {
    age(mark, 3600);
    age(lock, 0);
    expect(installs()).toBe(1);
  });
  it('does not reinstall an up-to-date copy', () => {
    age(lock, 3600);
    age(mark, 0);
    expect(installs()).toBe(0);
  });
});
