// grillhouse-3uv.89, L5 — one supervisor per project (scripts/superviseur.mjs, played by the session
// start, scripts/session-start.sh), as Zuul has one scheduler: a session of supervision takes the
// lock of its repository; a second one reads it, says so, and launches no circuit. Witness:
// BPScript 320.3, where two supervisors of BPScript ran together and each opened the same discovery
// (320.3.7 and 320.3.8).
//
// The session is the first process above the hook that is not a shell: here, this test's process,
// which launches the hook through bash.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { configGit } from '../config-git.js';

const RACINE = path.resolve(__dirname, '../../../..');
const SUPERVISEUR = path.join(RACINE, 'packages/grillhouse/scripts/superviseur.mjs');
const OUVERTURE = path.join(RACINE, 'packages/grillhouse/scripts/session-start.sh');
const BASH = execFileSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim();
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'superviseur-'));
const dormeur = spawn('sleep', ['600'], { stdio: 'ignore' });
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => {
  dormeur.kill();
});

let n = 0;
// A project with its own git repository; `copie` makes an agent's copy of it.
const projet = () => {
  const p = path.join(ESSAIS, `projet-${++n}`);
  mkdirSync(p, { recursive: true });
  writeFileSync(path.join(p, 'LISEZMOI'), 'projet');
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', p, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'init');
  const copie = (id: string) => {
    const c = path.join(p, '.claude/worktrees', id);
    git('worktree', 'add', '-q', '-b', `agent/${id}`, c);
    return c;
  };
  return { racine: p, verrou: path.join(p, '.git', 'grillhouse-superviseur.lock'), copie };
};

const environnement = (ajouts: Record<string, string> = {}) => {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('VITEST') && k !== 'NODE_OPTIONS') {
      env[k] = v;
    }
  }
  delete env.BEADS_ACTOR;
  return { ...env, ...ajouts };
};
// The check of the session start in <dir>, launched through bash as a hook is.
const ouvrir = (dir: string, ajouts: Record<string, string> = {}) =>
  spawnSync('bash', ['-c', `node ${JSON.stringify(SUPERVISEUR)} ${JSON.stringify(dir)}`], {
    encoding: 'utf8',
    env: environnement(ajouts),
  });
const pid = (verrou: string) => readFileSync(verrou, 'utf8').split(':')[0];

describe('grillhouse-3uv.89 — un seul superviseur par projet', () => {
  it('la première séance prend le verrou du dépôt, sans rien dire', () => {
    const p = projet();
    const r = ouvrir(p.racine);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe('');
    expect(pid(p.verrou)).toBe(String(process.pid));
  });

  it('la même séance, rouverte, garde son verrou sans rien dire', () => {
    const p = projet();
    ouvrir(p.racine);
    const avant = readFileSync(p.verrou, 'utf8');
    const r = ouvrir(p.racine);
    expect(r.stdout).toBe('');
    expect(readFileSync(p.verrou, 'utf8')).toBe(avant);
  });

  it('une seconde séance lit le verrou d’une séance vivante, le dit, et ne lance aucun circuit', () => {
    const p = projet();
    writeFileSync(p.verrou, `${dormeur.pid}:autre-seance`);
    const r = ouvrir(p.racine);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^## Un autre superviseur tient ce dépôt/);
    expect(r.stdout).toContain(String(dormeur.pid));
    expect(r.stdout).toContain('responsable');
    expect(r.stdout).toContain('aucun circuit');
    expect(readFileSync(p.verrou, 'utf8')).toBe(`${dormeur.pid}:autre-seance`);
  });

  it('un verrou dont la séance est morte se reprend, sans rien dire', () => {
    const p = projet();
    const mort = spawnSync(process.execPath, ['-e', '']).pid;
    writeFileSync(p.verrou, `${mort}:seance-fermee`);
    const r = ouvrir(p.racine);
    expect(r.stdout).toBe('');
    expect(pid(p.verrou)).toBe(String(process.pid));
  });

  it('une copie d’agent, ou une séance de rôle que le circuit lance (BEADS_ACTOR), ne prend aucun verrou', () => {
    const p = projet();
    const c = p.copie('demo-1');
    expect(ouvrir(c).stdout).toBe('');
    expect(ouvrir(p.racine, { BEADS_ACTOR: 'regulateur' }).stdout).toBe('');
    expect(existsSync(p.verrou)).toBe(false);
    writeFileSync(p.verrou, `${dormeur.pid}:autre-seance`);
    expect(ouvrir(c).stdout).toBe('');
    expect(ouvrir(p.racine, { BEADS_ACTOR: 'relecteur' }).stdout).toBe('');
  });

  it('hors d’un dépôt git, rien ne se prend ni ne se dit', () => {
    const d = mkdtempSync(path.join(ESSAIS, 'nu-'));
    const r = ouvrir(d);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe('');
  });
});

describe('grillhouse-3uv.89 — l’ouverture de séance du cadre dit le superviseur qui tient le dépôt', () => {
  // The tools the session start reads, its ticket tool and claude stood in.
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  const stub = (nom: string, corps: string) => {
    writeFileSync(path.join(bin, nom), `#!/bin/sh\n${corps}\n`);
    chmodSync(path.join(bin, nom), 0o755);
  };
  stub('bd', 'echo "[]"');
  stub('claude', 'echo "[]"');
  stub('codegraph', 'exit 0');
  for (const outil of [
    'node',
    'grep',
    'sed',
    'ls',
    'basename',
    'dirname',
    'cat',
    'git',
    'timeout',
  ]) {
    const r = spawnSync('bash', ['-c', `command -v ${outil}`], { encoding: 'utf8' });
    if (r.status === 0) {
      symlinkSync(r.stdout.trim(), path.join(bin, outil));
    }
  }
  const maison = mkdtempSync(path.join(ESSAIS, 'maison-'));

  it('une seconde séance reçoit la section qui le dit, et la première rien de tel', () => {
    const p = projet();
    // The frame's scripts the check reads, as a project holds them.
    mkdirSync(path.join(p.racine, 'scripts'));
    for (const f of ['superviseur.mjs', 'verrou-de-fichier.mjs']) {
      copyFileSync(
        path.join(RACINE, 'packages/grillhouse/scripts', f),
        path.join(p.racine, 'scripts', f)
      );
    }
    const demarrer = () =>
      spawnSync(BASH, [OUVERTURE], {
        encoding: 'utf8',
        env: { HOME: maison, PATH: bin, CLAUDE_PROJECT_DIR: p.racine, ...configGit() },
      });
    const premiere = demarrer();
    expect(premiere.status, premiere.stderr).toBe(0);
    expect(premiere.stdout).not.toContain('Un autre superviseur');
    expect(pid(p.verrou)).toBe(String(process.pid));
    writeFileSync(p.verrou, `${dormeur.pid}:autre-seance`);
    const seconde = demarrer();
    expect(seconde.status, seconde.stderr).toBe(0);
    expect(seconde.stdout).toContain('## Un autre superviseur tient ce dépôt');
    expect(seconde.stdout).toContain('aucun circuit');
  });
});
