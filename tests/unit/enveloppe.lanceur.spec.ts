import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { CODE_COPIE, CODE_REFUS, CODE_USAGE } from '../../scripts/enveloppe/codes.mjs';
import { dossierDeTravail } from '../../scripts/enveloppe/enveloppe.mjs';
import { SCRIPT, enveloppeEssai } from './enveloppe-essai.js';

// The launcher of an agent's session in its envelope (scripts/enveloppe/lancer.sh,
// tests/unit/enveloppe.spec.ts): its exit codes, the dependencies and the work in progress of the
// copy, and the role in the envelope.
// The trial harness: ./enveloppe-essai.ts.

// The real envelope, when this machine can build one. Its repositories live outside /tmp, which
// the envelope replaces with an empty directory, in a trial directory of this run alone.
const ESSAIS = racineSousLaMaison('grillhouse-essais-enveloppe-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { essai } = enveloppeEssai(ESSAIS);

const CODES = path.resolve(__dirname, '../../scripts/enveloppe/codes.mjs');
const LAUNCHER = path.resolve(__dirname, '../../scripts/enveloppe/lancer.sh');

// The envelope as a test repository holds it: enveloppe.mjs and every module it imports, followed
// from import to import, each copied at its path relative to the repository root.
const RACINE = path.resolve(__dirname, '../..');
function installerEnveloppe(repo: string) {
  const vus = new Set<string>();
  const suivre = (fichier: string) => {
    if (vus.has(fichier)) {
      return;
    }
    vus.add(fichier);
    const cible = path.join(repo, path.relative(RACINE, fichier));
    mkdirSync(path.dirname(cible), { recursive: true });
    execFileSync('cp', [fichier, cible]);
    const source = readFileSync(fichier, 'utf8');
    for (const [, spec] of source.matchAll(
      /^\s*(?:import|export)\b[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm
    )) {
      suivre(path.resolve(path.dirname(fichier), spec));
    }
  };
  suivre(SCRIPT);
}

describe.runIf(canWrap)('the launcher', () => {
  const repo = essai('lancer-');
  for (const d of ['packages/a/src', 'packages/b/src', '.claude/agents', 'scripts/enveloppe']) {
    mkdirSync(path.join(repo, d), { recursive: true });
  }
  writeFileSync(path.join(repo, 'packages/a/src/a.ts'), 'a');
  writeFileSync(path.join(repo, 'packages/b/src/b.ts'), 'secret');
  writeFileSync(path.join(repo, '.claude/agents/developpeur.md'), '---\nname: developpeur\n---\n');
  installerEnveloppe(repo);
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
  // A stand-in for claude: records its arguments, the prompt it reads on its standard input, and
  // what it can see of the neighbour.
  const fake = path.join(repo, 'faux-claude.sh');
  writeFileSync(
    fake,
    '#!/bin/bash\nprintf "%s|" "$@" > packages/a/args\ncat > packages/a/prompt\ncat packages/b/src/b.ts > packages/a/vu 2>&1 || echo cache >> packages/a/vu\n',
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
    expect(args).toBe('-p|--agent|developpeur|--permission-mode|bypassPermissions|');
    const prompt = execFileSync('cat', [path.join(copie, 'packages/a/prompt')], {
      encoding: 'utf8',
    });
    expect(prompt).toBe(
      'TON TICKET : demo-1 — un sujet.\n\n' +
        "## Ce que les composants d'avant publient\n\n" +
        '`a` ne dépend d’aucun composant : aucune section « Consommateurs » ne le nomme.\n\n' +
        '## Ton dossier de travail\n\n' +
        `Tout fichier temporaire s'écrit dans \`${dossierDeTravail(copie)}\`, que \`$TMPDIR\` nomme aussi.`
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
  installerEnveloppe(repo);
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

// « Un ticket bloqué repart de sa copie : sa copie garde le code de l'agent précédent » (pitmaster),
// and the safety measure of grillhouse-3uv.8.3: a reapplication that conflicts stops the launch
// (CODE_COPIE), names the conflict in the log and leaves the work in git's stash. The copy moves
// forward before its envelope, so these tests do not depend on bwrap.
describe('the launcher and the work in progress of the copy', () => {
  const ident = ['-c', 'user.name=t', '-c', 'user.email=t@t'];
  const lignes = (deuxieme: string) => `l1\n${deuxieme}\nl3\nl4\nl5\nl6\nl7\n`;
  // A repository with one launch behind it: its copy exists, at the main tree's HEAD.
  const depot = () => {
    const repo = essai('encours-');
    for (const d of ['packages/a/src', '.claude/agents', 'scripts/enveloppe']) {
      mkdirSync(path.join(repo, d), { recursive: true });
    }
    writeFileSync(path.join(repo, 'packages/a/src/a.ts'), lignes('l2'));
    writeFileSync(path.join(repo, 'packages/a/src/b.ts'), 'b\n');
    writeFileSync(
      path.join(repo, '.claude/agents/developpeur.md'),
      '---\nname: developpeur\n---\n'
    );
    writeFileSync(path.join(repo, '.gitignore'), 'consigne.txt\n');
    installerEnveloppe(repo);
    const consigne = path.join(repo, 'consigne.txt');
    writeFileSync(consigne, 'TON TICKET : demo-1 — un sujet.');
    const git = (dir: string, ...args: string[]) =>
      execFileSync('git', ['-C', dir, ...ident, ...args], { encoding: 'utf8' });
    git(repo, 'init', '-q');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'init');
    const copie = path.join(repo, '.claude/worktrees/demo-1');
    const home = essai('home-');
    const launch = () =>
      spawnSync('bash', [LAUNCHER, 'demo-1', 'developpeur', 'packages/a', consigne], {
        cwd: repo,
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_BIN: 'true', HOME: home },
      });
    launch();
    // main moves forward on a file: its new content is committed in the main tree.
    const avance = (fichier: string, contenu: string) => {
      writeFileSync(path.join(repo, fichier), contenu);
      git(repo, 'commit', '-qam', `main ${fichier}`);
    };
    const lire = (fichier: string) => readFileSync(path.join(copie, fichier), 'utf8');
    const ecrire = (fichier: string, contenu: string) =>
      writeFileSync(path.join(copie, fichier), contenu);
    const head = (dir: string) => git(dir, 'rev-parse', 'HEAD').trim();
    return { repo, copie, git, launch, avance, lire, ecrire, head };
  };

  it('moves a copy whose work touches the file that main changed, and keeps both changes', () => {
    const d = depot();
    expect(existsSync(d.copie)).toBe(true);
    d.avance('packages/a/src/a.ts', lignes('l2').replace('l7', 'MAIN'));
    d.ecrire('packages/a/src/a.ts', lignes('COPIE'));
    const r = d.launch();
    expect(r.status, readFileSync(d.copie + '.log', 'utf8')).not.toBe(CODE_COPIE);
    expect(d.head(d.copie)).toBe(d.head(d.repo));
    expect(d.lire('packages/a/src/a.ts')).toBe(lignes('COPIE').replace('l7', 'MAIN'));
  });

  it('keeps every kind of work: staged, unstaged, a new file, a deleted file', () => {
    const d = depot();
    d.avance('packages/a/src/a.ts', lignes('l2').replace('l7', 'MAIN'));
    d.avance('packages/a/src/b.ts', 'b\nMAIN\n');
    d.ecrire('packages/a/src/a.ts', lignes('COPIE'));
    d.git(d.copie, 'add', 'packages/a/src/a.ts');
    d.ecrire('packages/a/src/b.ts', 'COPIE\nb\n');
    d.ecrire('packages/a/src/neuf.ts', 'neuf\n');
    d.git(d.copie, 'add', 'packages/a/src/neuf.ts');
    d.ecrire('packages/a/src/libre.ts', 'libre\n');
    d.git(d.copie, 'rm', '-q', '.gitignore');
    const r = d.launch();
    expect(r.status, readFileSync(d.copie + '.log', 'utf8')).not.toBe(CODE_COPIE);
    expect(d.head(d.copie)).toBe(d.head(d.repo));
    expect(d.lire('packages/a/src/a.ts')).toBe(lignes('COPIE').replace('l7', 'MAIN'));
    expect(d.lire('packages/a/src/b.ts')).toBe('COPIE\nb\nMAIN\n');
    expect(d.lire('packages/a/src/neuf.ts')).toBe('neuf\n');
    expect(d.lire('packages/a/src/libre.ts')).toBe('libre\n');
    expect(existsSync(path.join(d.copie, '.gitignore'))).toBe(false);
  });

  it('leaves no stash behind when the work reapplies cleanly', () => {
    const d = depot();
    d.avance('packages/a/src/a.ts', lignes('l2').replace('l7', 'MAIN'));
    d.ecrire('packages/a/src/a.ts', lignes('COPIE'));
    d.launch();
    expect(d.head(d.copie)).toBe(d.head(d.repo));
    expect(d.git(d.copie, 'stash', 'list')).toBe('');
  });

  it('refuses with CODE_COPIE when the work conflicts with main, and names the conflict in the log', () => {
    const d = depot();
    d.avance('packages/a/src/a.ts', lignes('MAIN'));
    d.ecrire('packages/a/src/a.ts', lignes('COPIE'));
    const r = d.launch();
    expect(r.status).toBe(CODE_COPIE);
    expect(r.stderr).toMatch(/demo-1\.log/);
    const log = readFileSync(d.copie + '.log', 'utf8');
    expect(log).toMatch(/conflit|conflict/i);
    expect(log).toMatch(/packages\/a\/src\/a\.ts/);
  });

  it('keeps the conflicting work in the stash', () => {
    const d = depot();
    d.avance('packages/a/src/a.ts', lignes('MAIN'));
    d.ecrire('packages/a/src/a.ts', lignes('COPIE'));
    d.launch();
    const remise = d.git(d.copie, 'stash', 'list');
    expect(remise.trim().split('\n')).toHaveLength(1);
    expect(d.git(d.copie, 'stash', 'show', '-p', 'stash@{0}')).toMatch(/^\+COPIE$/m);
  });

  it('starts no agent on a copy whose work conflicts', () => {
    const d = depot();
    const trace = path.join(d.repo, 'lance');
    const fake = path.join(d.repo, 'faux-claude.sh');
    writeFileSync(fake, `#!/bin/bash\ntouch ${trace}\n`, { mode: 0o755 });
    d.avance('packages/a/src/a.ts', lignes('MAIN'));
    d.ecrire('packages/a/src/a.ts', lignes('COPIE'));
    const r = spawnSync(
      'bash',
      [LAUNCHER, 'demo-1', 'developpeur', 'packages/a', path.join(d.repo, 'consigne.txt')],
      {
        cwd: d.repo,
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_BIN: fake, HOME: essai('home-') },
      }
    );
    expect(r.status).toBe(CODE_COPIE);
    expect(existsSync(trace)).toBe(false);
  });

  it('keeps the work in the copy when the copy cannot move forward', () => {
    const d = depot();
    d.git(d.copie, 'commit', '-q', '--allow-empty', '-m', 'agent');
    d.avance('packages/a/src/a.ts', lignes('l2').replace('l7', 'MAIN'));
    d.ecrire('packages/a/src/a.ts', lignes('COPIE'));
    expect(d.launch().status).toBe(CODE_COPIE);
    expect(d.lire('packages/a/src/a.ts')).toBe(lignes('COPIE'));
  });
});

describe('the envelope without a role', () => {
  it('exits CODE_USAGE and names the role in its usage', () => {
    const r = spawnSync('node', [SCRIPT, '/wt', 'packages/a', '--', 'true'], { encoding: 'utf8' });
    expect(r.status).toBe(CODE_USAGE);
    expect(r.stderr).toMatch(/<rôle>/);
  });
});

// The launcher passes its role on to the envelope: the testeur's session writes the package of the
// shared test material, the developpeur's does not.
describe.runIf(canWrap)('the launcher and the role in the envelope', () => {
  const repo = essai('lancer-role-');
  const ecrire = (rel: string, contenu: string, mode?: number) => {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    writeFileSync(path.join(repo, rel), contenu, mode ? { mode } : undefined);
  };
  ecrire('packages/a/src/a.ts', 'a');
  ecrire(
    'packages/matiere/package.json',
    JSON.stringify({ name: 'matiere', exports: { './test-fixtures': './fixtures/index.js' } })
  );
  ecrire('packages/matiere/fixtures/index.js', 'm');
  for (const role of ['testeur', 'developpeur']) {
    ecrire(`.claude/agents/${role}.md`, `---\nname: ${role}\n---\n`);
  }
  mkdirSync(path.join(repo, 'scripts/enveloppe'), { recursive: true });
  installerEnveloppe(repo);
  // A stand-in for claude: tries to write the package, and records whether it could.
  ecrire(
    'faux-claude.sh',
    '#!/bin/bash\nif touch packages/matiere/fixtures/ecrit 2>/dev/null; then r=oui; else r=non; fi\n' +
      'echo "$r" > packages/a/ecrit\n',
    0o755
  );
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
    'i',
  ]);
  const home = essai('home-');
  const lancer = (ticket: string, role: string) => {
    const consigne = path.join(repo, `${ticket}.txt`);
    writeFileSync(consigne, `TON TICKET : ${ticket} — un sujet.`);
    const r = spawnSync('bash', [LAUNCHER, ticket, role, 'packages/a', consigne], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_BIN: path.join(repo, 'faux-claude.sh'), HOME: home },
    });
    const copie = path.join(repo, '.claude/worktrees', ticket);
    return { r, copie };
  };

  it("gives the testeur's session the package in writing", () => {
    const { r, copie } = lancer('demo-t', 'testeur');
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(path.join(copie, 'packages/a/ecrit'), 'utf8')).toBe('oui\n');
    expect(existsSync(path.join(copie, 'packages/matiere/fixtures/ecrit'))).toBe(true);
  });
  it("gives the developpeur's session the package read-only", () => {
    const { r, copie } = lancer('demo-d', 'developpeur');
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(path.join(copie, 'packages/a/ecrit'), 'utf8')).toBe('non\n');
    expect(existsSync(path.join(copie, 'packages/matiere/fixtures/ecrit'))).toBe(false);
  });
});
