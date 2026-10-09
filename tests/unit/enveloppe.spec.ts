import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { plan } from '../../scripts/enveloppe/enveloppe.mjs';

const SCRIPT = path.resolve(__dirname, '../../scripts/enveloppe/enveloppe.mjs');
const LAUNCHER = path.resolve(__dirname, '../../scripts/enveloppe/lancer.sh');

// A disk described as { path: entries } for directories and a set of existing paths.
function fakeDisk(
  dirs: Record<string, { name: string; dir: boolean }[]>,
  files: string[],
  links = {}
) {
  const exists = new Set([...Object.keys(dirs), ...files]);
  return {
    lister: (d: string) => dirs[d] ?? [],
    existe: (p: string) => exists.has(p),
    liens: (d: string) => (links as Record<string, { lien: string; cible: string }[]>)[d] ?? [],
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

  it('empties the components directory of every worktree', () => {
    expect(refus).toBeUndefined();
    expect(pairs(args, '--tmpfs')).toEqual(['/main/packages', '/wt/packages']);
  });
  it('mounts its own component in writing', () => {
    expect(pairs(args, '--bind')).toEqual(['/wt/packages/a']);
  });
  it('mounts only the published parts of a sibling, read-only', () => {
    expect(pairs(args, '--ro-bind')).toEqual([
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
    const { args } = plan({ trees: ['/wt'], copie: '/wt', composant: 'src/parser' }, disk);
    expect(pairs(args, '--ro-bind')).toEqual(['/wt/src/index.ts']);
  });
});

describe('plan refuses', () => {
  it('a missing component', () => {
    const { refus } = plan(
      { trees: ['/wt'], copie: '/wt', composant: 'packages/z' },
      fakeDisk({ '/wt/packages': [] }, [])
    );
    expect(refus).toMatch(/n'existe pas/);
  });
  it('a component without a parent directory', () => {
    const { refus } = plan(
      { trees: ['/wt'], copie: '/wt', composant: 'a' },
      fakeDisk({ '/wt/a': [] }, [])
    );
    expect(refus).toMatch(/dossier parent/);
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

// The real envelope, when this machine can build one.
const canWrap = spawnSync('bwrap', ['--dev-bind', '/', '/', 'true']).status === 0;

describe.runIf(canWrap)('the envelope on disk', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'enveloppe-'));
  for (const d of ['packages/a/src', 'packages/b/src', 'packages/b/docs', 'packages/b/dist']) {
    mkdirSync(path.join(repo, d), { recursive: true });
  }
  writeFileSync(path.join(repo, 'packages/a/src/a.ts'), 'a');
  writeFileSync(path.join(repo, 'packages/b/src/b.ts'), 'secret');
  writeFileSync(path.join(repo, 'packages/b/docs/INTERFACE.md'), 'interface');
  writeFileSync(path.join(repo, 'packages/b/dist/index.d.ts'), 'declare');
  execFileSync('git', ['init', '-q', repo]);

  const run = (shell: string) =>
    spawnSync('node', [SCRIPT, repo, 'packages/a', '--', 'bash', '-c', shell], {
      encoding: 'utf8',
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
  it('refuses to launch through a crossing link', () => {
    symlinkSync(path.join(repo, 'packages/b/src'), path.join(repo, 'packages/a/vers-b'));
    const r = run('true');
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/traverserait l'enveloppe/);
  });
});

describe.runIf(canWrap)('the launcher', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'lancer-'));
  for (const d of ['packages/a/src', 'packages/b/src', '.claude/agents', 'scripts/enveloppe']) {
    mkdirSync(path.join(repo, d), { recursive: true });
  }
  writeFileSync(path.join(repo, 'packages/a/src/a.ts'), 'a');
  writeFileSync(path.join(repo, 'packages/b/src/b.ts'), 'secret');
  writeFileSync(path.join(repo, '.claude/agents/developpeur.md'), '---\nname: developpeur\n---\n');
  execFileSync('cp', [SCRIPT, path.join(repo, 'scripts/enveloppe/enveloppe.mjs')]);
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
      env: { ...process.env, CLAUDE_BIN: fake },
    });
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
    expect(launch(longer).status).toBe(2);
  });
  it('places the copy next to the others when launched from a copy', () => {
    const r = spawnSync('bash', [LAUNCHER, 'demo-1', 'developpeur', 'packages/a', consigne], {
      cwd: copie,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_BIN: fake },
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
    expect(r.status).toBe(4);
    expect(readFileSync(copie + '.log', 'utf8')).toMatch(/fast-forward|Not possible|impossible/i);
  });
  it('refuses an instruction without its ticket', () => {
    const other = path.join(repo, 'autre.txt');
    writeFileSync(other, 'TON TICKET : demo-2 — autre.');
    const r = launch(other);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/ne porte pas/);
  });
});
