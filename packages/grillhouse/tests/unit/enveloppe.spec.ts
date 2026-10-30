// The envelope of an agent (scripts/enveloppe/enveloppe.mjs): its plan, the arguments of bwrap, on
// a disk described, and the environment it gives the session. What it shows of the home and the
// session is tested in enveloppe.maison, the shared test material in enveloppe.matiere-de-test;
// the real envelope on disk, its environment in the session, the session of the machine and the
// real home are the night's (packages/grillhouse-essais/tests/enveloppe.nuit.spec.ts).
import { describe, expect, it } from 'vitest';
import {
  environnementDeLaSeance,
  montagesDeLaSeance,
  plan,
} from '../../scripts/enveloppe/enveloppe.mjs';

// The environment of the session (grillhouse-3uv.8.1; METACADRE intention 5, des agents cadrés):
// as sudo's env_reset, only what the envelope declares, and what it sets itself.
describe('the environment of the session', () => {
  const lancement = {
    HOME: '/h',
    PATH: '/bin',
    USER: 'u',
    LANG: 'fr_FR.UTF-8',
    LC_ALL: 'C',
    TERM: 'xterm',
    ANTHROPIC_API_KEY: 'cle',
    CLAUDE_CODE_OAUTH_TOKEN: 'jeton',
    BEADS_ACTOR: 'testwriter',
    NODE_EXTRA_CA_CERTS: '/etc/ca.pem',
    GH_TOKEN: 'secret-gh',
    NPM_TOKEN: 'secret-npm',
    SSH_AUTH_SOCK: '/run/ssh',
    CLAUDE_CODE_SESSION_ID: 'session',
    GRILLHOUSE_ENVELOPPE: 'packages/x',
    TMPDIR: '/ailleurs',
    npm_config_ignore_scripts: 'false',
  };
  const env = environnementDeLaSeance(lancement, {
    cacheNpm: '/h/.npm',
    paquets: ['packages/a'],
    travail: '/tmp/claude-1/-wt/travail',
  }) as Record<string, string>;

  it('passes on no variable it does not declare, named by a list or not', () => {
    for (const nom of ['GH_TOKEN', 'NPM_TOKEN', 'SSH_AUTH_SOCK', 'CLAUDE_CODE_SESSION_ID']) {
      expect(env, nom).not.toHaveProperty(nom);
    }
  });
  it('keeps the base of the session, the locale, claude’s credentials and the author at the ticket', () => {
    expect(env).toMatchObject({
      HOME: '/h',
      PATH: '/bin',
      USER: 'u',
      LANG: 'fr_FR.UTF-8',
      LC_ALL: 'C',
      TERM: 'xterm',
      ANTHROPIC_API_KEY: 'cle',
      CLAUDE_CODE_OAUTH_TOKEN: 'jeton',
      BEADS_ACTOR: 'testwriter',
      NODE_EXTRA_CA_CERTS: '/etc/ca.pem',
    });
  });
  it('sets the npm cache it mounts, no lifecycle script, its working directory and its plan', () => {
    expect(env).toMatchObject({
      npm_config_cache: '/h/.npm',
      npm_config_ignore_scripts: 'true',
      TMPDIR: '/tmp/claude-1/-wt/travail',
      GRILLHOUSE_ENVELOPPE: 'packages/a',
    });
  });
  it('holds nothing else', () => {
    expect(Object.keys(env).sort()).toEqual(
      [
        'HOME',
        'PATH',
        'USER',
        'LANG',
        'LC_ALL',
        'TERM',
        'ANTHROPIC_API_KEY',
        'CLAUDE_CODE_OAUTH_TOKEN',
        'BEADS_ACTOR',
        'NODE_EXTRA_CA_CERTS',
        'npm_config_cache',
        'npm_config_ignore_scripts',
        'TMPDIR',
        'GRILLHOUSE_ENVELOPPE',
      ].sort()
    );
  });
});

// A disk that holds the paths <files>.
function fakeDisk(files: string[]) {
  const exists = new Set(files);
  return { existe: (p: string) => exists.has(p) };
}

const pairs = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
const PAQUETS = [
  { dossier: 'packages/a', pkg: { name: 'a' }, hors: false },
  { dossier: 'packages/b', pkg: { name: 'b' }, hors: false },
];

describe('plan', () => {
  const { args, refus } = plan(
    { trees: ['/main', '/wt'], copie: '/wt', paquets: ['packages/a'], paquetsDeLaCopie: PAQUETS },
    fakeDisk(['/wt/packages/a', '/wt/packages/b'])
  );

  it('mounts the machine read-only, with a /dev/shm of its own', () => {
    expect(refus).toBeUndefined();
    expect(args.slice(0, 3)).toEqual(['--ro-bind', '/', '/']);
    expect(args.join(' ')).not.toMatch(/--dev-bind \/ \//);
    expect(pairs(args, '--tmpfs')).toEqual(['/dev/shm']);
  });
  it('mounts its copy read-only, then the package of its plan in writing', () => {
    expect(pairs(args, '--ro-bind')).toEqual(['/', '/wt']);
    expect(pairs(args, '--bind')).toEqual(['/wt/packages/a']);
  });
  it('runs in the agent copy', () => {
    expect(pairs(args, '--chdir')).toEqual(['/wt']);
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
  const disk = fakeDisk([
    '/wt/packages/a',
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
    {
      trees: ['/main', '/wt'],
      copie: '/wt',
      paquets: ['packages/a'],
      paquetsDeLaCopie: PAQUETS,
      montages,
    },
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
  it('seals the home after the mounts', () => {
    expect(pairs(args, '--remount-ro')).toEqual(['/h']);
    expect(args.indexOf('--remount-ro')).toBeGreaterThan(args.lastIndexOf('--bind'));
  });
});

// The roles of the envelope do not receive the servers of the index (scripts/droits.mjs): the
// home declares neither codegraph nor rtfm, while the indexes of the repository are in sight
// (tests/unit/enveloppe.enceinte.spec.ts).
describe('the session mounts and the tools of the index', () => {
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
      paquets: ['scripts'],
      magasins: ['/main/.turbo/cache', '/main/.absent/cache'],
    },
    fakeDisk(['/wt/scripts', '/wt/.git', '/main/.turbo/cache'])
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
    { trees: ['/main', '/wt'], copie: '/wt', paquets: ['scripts'], paquetsDeLaCopie: PAQUETS },
    fakeDisk(['/wt/scripts', '/wt/.git'])
  );
  it('writes the package that holds it, the whole copy, its .git read-only', () => {
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
      { trees: ['/main', '/wt'], copie: '/main', paquets: ['packages/a'] },
      fakeDisk(['/main/packages/a'])
    );
    expect(refus).toMatch(/arbre principal/);
  });
  it('a missing component', () => {
    const { refus } = plan(
      { trees: ['/main', '/wt'], copie: '/wt', paquets: ['packages/z'] },
      fakeDisk([])
    );
    expect(refus).toMatch(/n'existe pas/);
  });
  // Witness: BPScript, whose first launch named the package (`000-forms`), not its path.
  it("a component named by its package's name, and gives the path", () => {
    const { refus } = plan(
      {
        trees: ['/main', '/wt'],
        copie: '/wt',
        paquets: ['001-kernel'],
        paquetsDeLaCopie: [
          { dossier: 'packages/000-forms', pkg: { name: '000-forms' }, hors: false },
          { dossier: 'packages/001-kernel', pkg: { name: '001-kernel' }, hors: false },
        ],
      },
      fakeDisk([])
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
        paquets: ['050-emitter'],
        paquetsDeLaCopie: [
          { dossier: 'packages/000-forms', pkg: { name: '@bp/forms' }, hors: false },
          { dossier: 'packages/050-emitter', pkg: { name: '@bp/emitter' }, hors: false },
        ],
      },
      fakeDisk([])
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
        paquets: ['packages/z'],
        paquetsDeLaCopie: [{ dossier: 'packages/a', pkg: { name: 'a' }, hors: false }],
      },
      fakeDisk([])
    );
    expect(refus).toBe("Le composant /wt/packages/z n'existe pas.");
  });
});
