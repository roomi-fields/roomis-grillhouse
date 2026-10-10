import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Ticket grillhouse-3uv.8.4: the index is for the roles that see the whole repository (charter,
// « L'index d'abord »); in an agent's copy (`.claude/worktrees/`), the session start asks neither
// to install nor to make the index of CodeGraph. In a project tree, it still does.
const SCRIPT = path.resolve(__dirname, '../../scripts/session-start.sh');
const BASH = execFileSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim();
const racine = mkdtempSync(path.join(tmpdir(), 'session-start-'));
afterAll(() => rmSync(racine, { recursive: true, force: true }));

// An executable stub in a PATH directory.
const stub = (bin: string, nom: string, corps: string) => {
  writeFileSync(path.join(bin, nom), `#!/bin/sh\n${corps}\n`);
  chmodSync(path.join(bin, nom), 0o755);
};

// A PATH holding the tools the script reads, with a codegraph or without one. The ticket tool is
// a stub with no ticket: the real one, run with the test root as its home, leaves a process that
// writes there while the root is removed.
const outils = (avecCodegraph: boolean) => {
  const bin = mkdtempSync(path.join(racine, 'bin-'));
  stub(bin, 'bd', 'echo "[]"');
  for (const outil of ['node', 'grep', 'sed', 'ls', 'basename', 'dirname', 'cat', 'git']) {
    const r = spawnSync('bash', ['-c', `command -v ${outil}`], { encoding: 'utf8' });
    if (r.status === 0) {
      symlinkSync(r.stdout.trim(), path.join(bin, outil));
    }
  }
  if (avecCodegraph) {
    stub(bin, 'codegraph', 'exit 0');
  }
  return bin;
};
const avec = outils(true);
const sans = outils(false);

// A project with its own git repository, and agent copies of it as the launcher makes them.
const projet = (nom: string) => {
  const p = path.join(racine, nom);
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
  return { racine: p, copie };
};

const demarrer = (dir: string, bin: string) =>
  spawnSync(BASH, [SCRIPT], {
    encoding: 'utf8',
    env: { HOME: racine, PATH: bin, CLAUDE_PROJECT_DIR: dir },
  });

const p = projet('projet');
const dansUnDossierWorktrees = projet('worktrees/projet');

describe('the session start and the index of CodeGraph', () => {
  it('asks a project tree without index for the index of CodeGraph', () => {
    const r = demarrer(p.racine, avec);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("l'index CodeGraph");
  });
  it('asks a project tree without codegraph for the tool', () => {
    expect(demarrer(p.racine, sans).stdout).toContain("l'outil CodeGraph");
  });
  it('asks a project whose path holds a worktrees directory, outside .claude, for the index', () => {
    expect(demarrer(dansUnDossierWorktrees.racine, avec).stdout).toContain("l'index CodeGraph");
  });
  it('asks an agent copy without index neither for the index nor the tool of CodeGraph', () => {
    for (const id of ['grillhouse-1', 'proj-3uv.8.4']) {
      const c = p.copie(id);
      for (const bin of [avec, sans]) {
        const r = demarrer(c, bin);
        expect(r.status, `${id}: ${r.stderr}`).toBe(0);
        expect(r.stdout, id).not.toMatch(/CodeGraph|codegraph/);
      }
    }
  });
  it('asks the copy of a project in a worktrees directory neither for the index', () => {
    const c = dansUnDossierWorktrees.copie('demo-1');
    expect(demarrer(c, avec).stdout).not.toMatch(/CodeGraph|codegraph/);
  });
});

// Ticket grillhouse-3uv.27: the session start reads docs/agents/hors-cadre.txt as every check
// does (« <package> <reason> », first word = a directory under packages/ or src/), and refuses a
// line that names no directory, so that a typo does not pass in silence.
describe('the session start and the packages out of the frame', () => {
  const SCRIPTS = path.resolve(__dirname, '../../scripts');
  // A project with packages a, v1 and v10, none with its three documents, the frame's scripts
  // installed, and the given list out of the frame.
  const avecPaquets = (liste: string | null) => {
    const dir = mkdtempSync(path.join(racine, 'paquets-'));
    symlinkSync(SCRIPTS, path.join(dir, 'scripts'));
    for (const nom of ['a', 'v1', 'v10']) {
      mkdirSync(path.join(dir, 'packages', nom, 'src'), { recursive: true });
    }
    mkdirSync(path.join(dir, 'src', 'gele'), { recursive: true });
    if (liste !== null) {
      mkdirSync(path.join(dir, 'docs', 'agents'), { recursive: true });
      writeFileSync(path.join(dir, 'docs', 'agents', 'hors-cadre.txt'), liste);
    }
    const r = demarrer(dir, avec);
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  };
  const docs = (nom: string) =>
    ['ARCHITECTURE', 'CADRE', 'INTERFACE'].map(d => `packages/${nom}/docs/${d}.md`);

  it('critère 5 — does not ask the three documents of a package out of the frame', () => {
    const sortie = avecPaquets('v1 version gelée\n');
    for (const d of docs('v1')) {
      expect(sortie).not.toContain(d);
    }
    for (const d of [...docs('a'), ...docs('v10')]) {
      expect(sortie).toContain(d);
    }
  });
  it('critère 5 — reads the first word as every check does: a tab or a bare name', () => {
    for (const liste of ['v1\tversion gelée\n', 'v1\n', 'v1   version gelée\n']) {
      const sortie = avecPaquets(liste);
      for (const d of docs('v1')) {
        expect(sortie, JSON.stringify(liste)).not.toContain(d);
      }
      for (const d of docs('v10')) {
        expect(sortie, JSON.stringify(liste)).toContain(d);
      }
    }
  });
  it('critère 6 — without hors-cadre.txt, asks the three documents of every package', () => {
    const sortie = avecPaquets(null);
    for (const d of [...docs('a'), ...docs('v1'), ...docs('v10')]) {
      expect(sortie).toContain(d);
    }
  });
  it('critère 6 — a blank line or a line starting with # leaves out no package', () => {
    const sortie = avecPaquets('# v1 version gelée\n\n   \n#v10\n');
    for (const d of [...docs('a'), ...docs('v1'), ...docs('v10')]) {
      expect(sortie).toContain(d);
    }
    expect(sortie).not.toMatch(/hors-cadre\.txt/);
  });
  it('critère 7 — a line naming no directory under packages/ or src/ is reported', () => {
    const sortie = avecPaquets('v1 version gelée\nv2 faute de frappe\n');
    expect(sortie).toMatch(/hors-cadre\.txt/);
    expect(sortie).toMatch(/\bv2\b/);
  });
  it('critère 7 — a line naming a directory under src/ is not reported', () => {
    const sortie = avecPaquets('gele module gelé\nv1 version gelée\n');
    expect(sortie).not.toMatch(/hors-cadre\.txt/);
  });
});
