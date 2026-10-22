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
  writeFileSync,
} from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap, hasBd, racineSousLaMaison } from '../machine.js';
import { CODE_REFUS } from '../../scripts/enveloppe/codes.mjs';
import { dossierDeTravail, montagesDeLaSeance, plan } from '../../scripts/enveloppe/enveloppe.mjs';
import { SCRIPT, enveloppeEssai } from './enveloppe-essai.js';

// The envelope of an agent (scripts/enveloppe/enveloppe.mjs): its plan, and the real envelope on
// disk, its environment, the session of the machine and the real home. What it shows of the home
// and the session is tested in enveloppe.maison, the launcher in enveloppe.lanceur, the shared
// test material in enveloppe.matiere-de-test.
// The trial harness: ./enveloppe-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS_TEMP = mkdtempSync(path.join(tmpdir(), 'enveloppe-'));
afterAll(() => rmSync(ESSAIS_TEMP, { recursive: true, force: true }));

// The real envelope, when this machine can build one. Its repositories live outside /tmp, which
// the envelope replaces with an empty directory, in a trial directory of this run alone.
const ESSAIS = racineSousLaMaison('grillhouse-essais-enveloppe-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { essai } = enveloppeEssai(ESSAIS);

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
  // Witness: BPScript, whose tests of 030-binder stopped on a cycle of Turborepo in the envelope:
  // without a neighbour's turbo.json, Turborepo gave its build the root's `^build`.
  it("mounts a sibling's package configuration of Turborepo, turbo.json or turbo.jsonc", () => {
    const ro = roBinds({}, [
      '/wt/packages/b/package.json',
      '/wt/packages/b/turbo.json',
      '/wt/packages/c/turbo.jsonc',
    ]);
    expect(ro).toContain('/wt/packages/b/turbo.json');
    expect(ro).toContain('/wt/packages/c/turbo.jsonc');
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

// The index is for the roles that see the whole repository (charter, « L'index d'abord »): in its
// envelope an agent reads its package and the interfaces of its neighbours, as Bazel shows an
// action only its declared inputs. The envelope declares neither codegraph nor rtfm.
describe('the session mounts and the index', () => {
  const montages = montagesDeLaSeance({
    cacheNpm: '/h/.npm',
    claude: '/h/.claude',
    projet: '/h/.claude/projects/-wt',
    etatJetable: '/t/claude.json',
    scratchpads: '/tmp/claude-1/-wt',
  });
  const chemins = (montages as { chemin: string }[]).map(m => m.chemin);

  it('declares no launcher, state or environment of codegraph or rtfm', () => {
    for (const rel of [
      '.local/bin/codegraph',
      '.codegraph',
      '.local/bin/rtfm',
      '.rtfm',
      '.local/share/pipx',
    ]) {
      expect(chemins, rel).not.toContain(`/h/${rel}`);
    }
    expect(chemins.filter(c => /codegraph|rtfm/.test(c))).toEqual([]);
  });
  it('still declares claude, node and its tools, bd and the git configuration', () => {
    for (const rel of ['.local/bin/claude', '.nvm', '.beads', '.config/bd', '.gitconfig']) {
      expect(chemins, rel).toContain(`/h/${rel}`);
    }
  });
});

describe('plan with the task cache', () => {
  const { args } = plan(
    {
      trees: ['/main', '/wt'],
      copie: '/wt',
      composant: 'scripts',
      magasins: ['/main/.turbo/cache', '/main/.absent/cache'],
    },
    fakeDisk({ '/wt': [{ name: 'scripts', dir: true }], '/wt/scripts': [] }, [
      '/wt/.git',
      '/main/.turbo/cache',
    ])
  );
  it('mounts each existing cache in writing, after the copy and its .git', () => {
    const texte = args.join(' ');
    expect(texte).toContain('--bind /main/.turbo/cache /main/.turbo/cache');
    expect(texte).not.toContain('/main/.absent/cache');
    expect(args.indexOf('/main/.turbo/cache')).toBeGreaterThan(args.indexOf('/wt/.git'));
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
  // Witness: BPScript, whose first launch named the package (`000-forms`), not its path.
  it("a component named by its package's name, and gives the path", () => {
    const { refus } = plan(
      {
        trees: ['/main', '/wt'],
        copie: '/wt',
        composant: '001-kernel',
        paquets: [
          { dossier: 'packages/000-forms', pkg: { name: '000-forms' }, hors: false },
          { dossier: 'packages/001-kernel', pkg: { name: '001-kernel' }, hors: false },
        ],
      },
      fakeDisk({ '/wt/packages': [] }, [])
    );
    expect(refus).toContain(
      "`001-kernel` n'est pas le chemin d'un composant ; écris `packages/001-kernel`"
    );
    expect(refus).not.toContain('packages/000-forms');
  });
  // Witness: BPScript, whose chiefs named the folder of the package (`050-emitter`), not its path.
  it("a component named by its package's folder, and gives the path", () => {
    const { refus } = plan(
      {
        trees: ['/main', '/wt'],
        copie: '/wt',
        composant: '050-emitter',
        paquets: [
          { dossier: 'packages/000-forms', pkg: { name: '@bp/forms' }, hors: false },
          { dossier: 'packages/050-emitter', pkg: { name: '@bp/emitter' }, hors: false },
        ],
      },
      fakeDisk({ '/wt/packages': [] }, [])
    );
    expect(refus).toContain(
      "`050-emitter` n'est pas le chemin d'un composant ; écris `packages/050-emitter`"
    );
    expect(refus).not.toContain('packages/000-forms');
  });
  it('a missing component that names no package, without a path to suggest', () => {
    const { refus } = plan(
      {
        trees: ['/main', '/wt'],
        copie: '/wt',
        composant: 'packages/z',
        paquets: [{ dossier: 'packages/a', pkg: { name: 'a' }, hors: false }],
      },
      fakeDisk({ '/wt/packages': [] }, [])
    );
    expect(refus).toBe("Le composant /wt/packages/z n'existe pas.");
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
  // grillhouse-2sq: the package of the shared test material comes back whole, so a link of it
  // that aims at a hidden component would cross the envelope, for every role.
  it.each(['testwriter', 'developpeur'])(
    'a link of the shared test material that crosses into a hidden component (%s)',
    role => {
      const disk = fakeDisk(
        { '/wt/packages': [], '/wt/packages/a': [], '/wt/packages/matiere': [] },
        ['/wt/packages/a', '/wt/packages/matiere'],
        {
          '/wt/packages/matiere': [
            { lien: '/wt/packages/matiere/fixtures/x', cible: '/main/packages/b/src' },
          ],
        }
      );
      const { refus } = plan(
        {
          trees: ['/main', '/wt'],
          copie: '/wt',
          composant: 'packages/a',
          role,
          matieres: ['packages/matiere'],
        },
        disk
      );
      expect(refus).toMatch(/traverserait l'enveloppe/);
      expect(refus).toContain('/wt/packages/matiere/fixtures/x');
    }
  );
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
  const dehors = mkdtempSync(path.join(ESSAIS_TEMP, 'dehors-'));

  const run = (shell: string, dir = copie) =>
    spawnSync('node', [SCRIPT, dir, 'packages/a', 'developpeur', '--', 'bash', '-c', shell], {
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
  // Turborepo's cache, in the main tree and shared by every copy, is written by the agent's own runs
  // of `npm test`; the envelope creates it when it is missing, so that bwrap mounts it.
  it('lets the agent write the cache of Turborepo of the main tree, created before the sandbox, the rest of the main tree read-only', () => {
    expect(run(`touch ${repo}/.turbo/cache/ecrit`).status).toBe(0);
    expect(existsSync(path.join(repo, '.turbo/cache/ecrit'))).toBe(true);
    expect(run(`touch ${repo}/.turbo/autre`).status).not.toBe(0);
    expect(run(`touch ${repo}/.git/ecrit`).status).not.toBe(0);
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

// The environment of the envelope (grillhouse-3uv.8.1; METACADRE intention 5, des agents cadrés):
// as for the home, the session gets only the environment the envelope declares, and the rest is
// emptied. It keeps the base of a login session (HOME, PATH, USER, LANG, TERM, as sudo's
// env_reset keeps them) and claude's own credentials (ANTHROPIC_API_KEY,
// CLAUDE_CODE_OAUTH_TOKEN); a variable that names a file comes with its file, or not at all. No
// token of the machine reaches the session, neither in its own environment nor in that of another
// process.
const CERTIFICATS = '/etc/ssl/certs/ca-certificates.crt';
describe.runIf(canWrap && existsSync(CERTIFICATS))(
  'the envelope passes on only the environment it declares',
  () => {
    const home = essai('home-env-');
    // The repository lives in the home, as on the machine.
    const repo = path.join(home, 'dev/projet');
    mkdirSync(path.join(repo, 'packages/a'), { recursive: true });
    writeFileSync(path.join(repo, 'packages/a/a.ts'), 'a');
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'init');
    const copie = path.join(repo, '.claude/worktrees/demo-1');
    git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie);
    mkdirSync(path.join(home, '.claude'), { recursive: true });
    // A certificate the envelope shows (the main tree comes back read-only), and one it hides
    // (an undeclared directory of the home), as a house certificate under ~/.local/share.
    const caVue = path.join(repo, 'certificats/maison.pem');
    const caCachee = path.join(home, '.local/share/ca-certificates/maison.pem');
    for (const ca of [caVue, caCachee]) {
      mkdirSync(path.dirname(ca), { recursive: true });
      writeFileSync(ca, readFileSync(CERTIFICATS));
    }
    // An npm cache kept elsewhere than ~/.npm: the envelope mounts it in writing.
    const cacheAilleurs = path.join(home, 'caches/npm');
    mkdirSync(cacheAilleurs, { recursive: true });

    // Tokens of the usual tools, and two variables whose names are drawn at random, so that no
    // list of the envelope can name them.
    const auHasard = () => randomUUID().replace(/-/g, '_');
    const JETONS: Record<string, string> = {
      GH_TOKEN: 'SECRET-gh-token',
      GITHUB_TOKEN: 'SECRET-github-token',
      NPM_TOKEN: 'SECRET-npm-token',
      NODE_AUTH_TOKEN: 'SECRET-node-auth-token',
      AWS_ACCESS_KEY_ID: 'SECRET-aws-key-id',
      AWS_SECRET_ACCESS_KEY: 'SECRET-aws-secret',
      OPENAI_API_KEY: 'SECRET-openai-key',
      GITLAB_TOKEN: 'SECRET-gitlab-token',
      [`V_${auHasard()}`]: 'SECRET-unnamed-variable',
      [`v_${auHasard()}`]: 'SECRET-unnamed-lowercase-variable',
    };
    // What claude needs to authenticate, and the base of the session.
    const CLAUDE: Record<string, string> = {
      ANTHROPIC_API_KEY: 'claude-api-key',
      CLAUDE_CODE_OAUTH_TOKEN: 'claude-oauth-token',
    };
    const BASE: Record<string, string> = {
      HOME: home,
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      USER: userInfo().username,
      LANG: 'C.UTF-8',
      TERM: 'xterm-256color',
    };
    const env = (extra: Record<string, string> = {}) => {
      const dehors: Record<string, string | undefined> = { ...process.env };
      delete dehors.NODE_EXTRA_CA_CERTS;
      return {
        ...dehors,
        ...BASE,
        ...JETONS,
        ...CLAUDE,
        npm_config_cache: path.join(home, '.npm'),
        ...extra,
      };
    };
    const run = (shell: string, extra: Record<string, string> = {}) =>
      spawnSync('node', [SCRIPT, copie, 'packages/a', 'developpeur', '--', 'bash', '-c', shell], {
        encoding: 'utf8',
        env: env(extra),
      });

    it('passes on no variable it does not declare, named by a list or not', () => {
      const r = run('env');
      expect(r.status).toBe(0);
      expect(r.stdout).not.toMatch(/SECRET/);
      for (const nom of Object.keys(JETONS)) {
        expect(run(`printenv ${nom}`).status, nom).not.toBe(0);
      }
    });
    it('lets no process of the session read a token in the environment of another process', () => {
      const r = run(`cat /proc/[0-9]*/environ 2>/dev/null | tr '\\0' '\\n'; true`);
      expect(r.stdout).not.toMatch(/SECRET/);
    });
    it("keeps claude's own credentials: ANTHROPIC_API_KEY and CLAUDE_CODE_OAUTH_TOKEN", () => {
      for (const [nom, valeur] of Object.entries(CLAUDE)) {
        const r = run(`printenv ${nom}`);
        expect(r.status, nom).toBe(0);
        expect(r.stdout, nom).toBe(`${valeur}\n`);
      }
    });
    it("keeps the author of the session's comments at the ticket: BEADS_ACTOR", () => {
      const r = run('printenv BEADS_ACTOR', { BEADS_ACTOR: 'developpeur packages/a' });
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('developpeur packages/a\n');
    });
    it('keeps the base of the session: HOME, PATH, USER, LANG, TERM', () => {
      for (const [nom, valeur] of Object.entries(BASE)) {
        const r = run(`printenv ${nom}`);
        expect(r.status, nom).toBe(0);
        expect(r.stdout, nom).toBe(`${valeur}\n`);
      }
    });
    it('brings a variable that names a file in sight with its file: NODE_EXTRA_CA_CERTS', () => {
      const r = run('printenv NODE_EXTRA_CA_CERTS && test -r "$NODE_EXTRA_CA_CERTS" && node -e 0', {
        NODE_EXTRA_CA_CERTS: caVue,
      });
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
      expect(r.stdout).toBe(`${caVue}\n`);
    });
    it('passes on no variable whose file it hides: node starts without a warning', () => {
      const r = run(
        'if [ -n "${NODE_EXTRA_CA_CERTS-}" ]; then test -r "$NODE_EXTRA_CA_CERTS"; fi && node -e 0',
        { NODE_EXTRA_CA_CERTS: caCachee }
      );
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
    });
    it('passes on no variable whose socket it hides: SSH_AUTH_SOCK', () => {
      const prise = path.join(home, '.ssh/agent.sock');
      mkdirSync(path.dirname(prise), { recursive: true });
      writeFileSync(prise, '');
      const r = run('if [ -n "${SSH_AUTH_SOCK-}" ]; then test -e "$SSH_AUTH_SOCK"; fi', {
        SSH_AUTH_SOCK: prise,
      });
      expect(r.status).toBe(0);
    });
    it('gives npm the cache it mounts in writing, wherever the session keeps it', () => {
      const r = run('c=$(npm config get cache) && echo "$c" && touch "$c/sonde"', {
        npm_config_cache: cacheAilleurs,
      });
      expect(r.status).toBe(0);
      expect(r.stdout.trim().split('\n').pop()).toBe(cacheAilleurs);
      expect(existsSync(path.join(cacheAilleurs, 'sonde'))).toBe(true);
    });
    it('gives the session its working directory as TMPDIR, created and written', () => {
      // The working directory lies in the copy's scratchpads, which the envelope mounts in writing,
      // where Claude Code keeps them: under the temporary directory of the launch
      // (grillhouse-3uv.93, the base of the pass).
      const ailleurs = path.join(home, 'ailleurs');
      const travail = dossierDeTravail(copie, { TMPDIR: ailleurs });
      expect(travail).toBe(
        path.join(
          ailleurs,
          `claude-${process.getuid?.()}`,
          copie.replace(/[^A-Za-z0-9]/g, '-'),
          'travail'
        )
      );
      const r = run('printenv TMPDIR && f=$(mktemp) && echo "$f"', { TMPDIR: ailleurs });
      expect(r.status, r.stderr).toBe(0);
      const [variable, fichier] = r.stdout.trim().split('\n');
      expect(variable).toBe(travail);
      expect(path.dirname(fichier ?? '')).toBe(travail);
      expect(existsSync(fichier ?? '')).toBe(true);
    });
    // Witness: BPScript, whose `npm install` in the envelope failed: its `prepare` (the git hook)
    // writes under `.git`, read-only there. The launcher installs outside the session.
    it('tells npm to run no lifecycle script: npm_config_ignore_scripts, whatever the launch says', () => {
      const r = run('printenv npm_config_ignore_scripts && npm config get ignore-scripts', {
        npm_config_ignore_scripts: 'false',
      });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toBe('true\ntrue\n');
    });
    it('installs a package whose prepare writes under .git, and still runs a script by its name', () => {
      const a = path.join(copie, 'packages/a');
      const gitDir = execFileSync('git', ['-C', copie, 'rev-parse', '--absolute-git-dir'], {
        encoding: 'utf8',
      }).trim();
      writeFileSync(
        path.join(a, 'package.json'),
        `${JSON.stringify({
          name: 'a',
          version: '0.0.0',
          scripts: {
            prepare: `touch ${path.join(gitDir, 'sonde')}`,
            prebonjour: 'echo avant',
            bonjour: 'echo bonjour',
          },
        })}\n`
      );
      const r = run(
        `cd ${a} && npm install --no-audit --no-fund --silent && npm run --silent bonjour`
      );
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toBe('bonjour\n');
      expect(existsSync(path.join(gitDir, 'sonde'))).toBe(false);
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
          'developpeur',
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
// work in the envelope, each for real — claude reads its identity, bd opens a tickets base — and
// no index of the repository is in sight. Its copy is the one this suite runs in, when that copy is not
// the main tree and its session directory under the real `~/.claude/projects` can be written (a
// role session); else, where `~/.claude/projects` can be written (outside an envelope), a test
// repository, whose tickets base and indexes are made here and whose session directory is removed
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
  let principal: string;
  let symbole: string;
  if (copieDeLaSuite) {
    copie = copieDeLaSuite;
    principal = execFileSync('git', ['-C', copie, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
    })
      .split('\n')[0]
      .replace(/^worktree /, '');
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
    mkdirSync(path.join(repo, '.rtfm'), { recursive: true });
    writeFileSync(path.join(repo, '.rtfm/index.db'), symbole);
    principal = repo;
    writeFileSync(path.join(repo, '.gitignore'), '.codegraph/\n.rtfm/\n');
    git('add', '.');
    git('commit', '-qm', 'init');
    copie = path.join(repo, '.claude/worktrees/demo-1');
    git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie);
    const projet = path.join(projetsReels, enTirets(copie));
    afterAll(() => rmSync(projet, { recursive: true, force: true }));
  }
  const composant = copieDeLaSuite ? 'scripts' : 'packages/a';
  const dedans = (cmd: string[]) =>
    spawnSync('node', [SCRIPT, copie, composant, 'developpeur', '--', ...cmd], {
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
  // Needs the real bd: it opens the tickets base of the repository (grillhouse-3uv.50.1).
  it.runIf(hasBd)('lets bd open the tickets base of the repository', () => {
    expect(ticket).not.toBeNull();
    const r = dedans(['bd', 'show', ticket as string, '--json']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(ticket);
  });
  it('shows no content of an index of the repository, nor the state of codegraph and rtfm', () => {
    for (const p of [principal, copie].flatMap(t => [
      path.join(t, '.codegraph'),
      path.join(t, '.rtfm'),
    ])) {
      const r = dedans(['bash', '-c', `find ${p} -mindepth 1 2>/dev/null; true`]);
      expect(r.stdout, p).toBe('');
    }
    for (const rel of ['.codegraph', '.rtfm', '.local/bin/codegraph', '.local/bin/rtfm']) {
      const p = path.join(maisonReelle, rel);
      const r = dedans(['bash', '-c', `test -e ${p} || test -L ${p}`]);
      expect(r.status, p).not.toBe(0);
    }
  });
  it('lets no codegraph of the session answer from the index of the repository', () => {
    for (const t of [principal, copie]) {
      const r = dedans([
        'bash',
        '-c',
        `codegraph query ${symbole} -p ${t} --json 2>/dev/null; true`,
      ]);
      expect(r.stdout, t).not.toContain(symbole);
    }
  });
  // Needs the real bd, which writes the ticket, and the trial repository, made for the probe alone
  // (grillhouse-3uv.50.1).
  it.runIf(hasBd && sondeEssai)(
    'lets bd write a ticket in the tickets base of the repository',
    () => {
      const r = dedans(['bd', 'create', "ticket écrit dans l'enveloppe", '--json']);
      expect(r.status, r.stderr).toBe(0);
      expect(dehors(['bd', 'list', '--json'], copie).stdout).toContain('écrit dans l');
    }
  );
});
