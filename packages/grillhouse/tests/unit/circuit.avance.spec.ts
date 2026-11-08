// grillhouse-527: before every pass that judges the lot (the checks, 3.1, and the final pass, 4.1,
// a resumption included), the circuit prepares its copy on the tip of main by the launcher's own
// preparation (scripts/enveloppe/travail-de-la-copie.mjs, `preparer`: the guard of the submodules,
// the advance, the pose of the submodules, the installation when the lock file is newer), as a
// merge queue plays its checks on the branch set on the tip of main, never on its base of origin.
// Witness: OSC Bridge, SH-cgi.8.2 (2026-11-01), a final pass and its resumption red on two reds
// main had lifted in 65a1f5b, the copy still on bc721aa; BPScript, the lock file changed 27 times
// in two weeks, and the submodule vendor/bp3-engine.
//
// Each case plays the real git in a repository of trial: main (the main tree) and the copy of a
// ticket under .claude/worktrees, as the launcher makes it.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ARRETS, SUR_LA_POINTE, avantLaPasse } from '../../scripts/circuit.mjs';
import { etapeDuCircuit, monteeDe } from '../../scripts/etapes.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-avance-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};
const lignes = (deuxieme: string, septieme = 'l7') =>
  `l1\n${deuxieme}\nl3\nl4\nl5\nl6\n${septieme}\n`;

// A repository of trial with one commit holding <fichiers>.
function nouveauDepot(fichiers: Record<string, string>) {
  const dir = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'essai@example.com');
  git(dir, 'config', 'user.name', 'essai');
  for (const [f, c] of Object.entries(fichiers)) {
    writeFileSync(path.join(dir, f), c);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  return dir;
}

// The repository of trial and the copy of demo-1 at its HEAD, with the context of its circuit;
// <avant> runs in the main tree before the copy is made.
function depot(fichiers: Record<string, string> = {}, avant = (_racine: string) => {}) {
  const racine = nouveauDepot({
    'a.txt': lignes('l2'),
    'b.txt': 'b\n',
    '.gitignore': '.claude/worktrees/\nnode_modules/\n',
    ...fichiers,
  });
  avant(racine);
  const copie = path.join(racine, '.claude/worktrees/demo-1');
  git(racine, 'worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
  const avance = (fichier: string, contenu: string) => {
    writeFileSync(path.join(racine, fichier), contenu);
    git(racine, 'commit', '-qam', `main ${fichier}`);
    return git(racine, 'rev-parse', 'HEAD');
  };
  const lire = (fichier: string) => readFileSync(path.join(copie, fichier), 'utf8');
  const ecrire = (fichier: string, contenu: string) =>
    writeFileSync(path.join(copie, fichier), contenu);
  const tete = () => git(copie, 'rev-parse', 'HEAD');
  const ctx = { racine, copie, ticket: 'demo-1', journal: `${copie}.log` };
  return { racine, copie, avance, lire, ecrire, tete, ctx };
}

// An `npm` of trial on the PATH, which notes each call in <trace>.
function npmDEssai() {
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  const trace = path.join(bin, 'appels');
  writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\necho "$*" >> '${trace}'\n`);
  chmodSync(path.join(bin, 'npm'), 0o755);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  const appels = () => (existsSync(trace) ? readFileSync(trace, 'utf8') : '');
  return { env, appels };
}

const REGENERATION = { restreinte: { avant: 'a', apres: 'b' }, reportes: null };

describe('grillhouse-527 critère 2 — the passes that judge the lot are those of 3.1 and 4.1', () => {
  it('the steps prepared on the tip of main are 3.1 Contrôles and 4.1 Passe finale, and no other', () => {
    const numeros = [...SUR_LA_POINTE].flatMap(etape =>
      [false, true].map(finale => etapeDuCircuit({ etape, finale })?.numero)
    );
    expect(numeros.sort()).toEqual(['3.1', '4.1']);
  });

  it('at another step, the copy behind main is not touched, the regeneration kept', () => {
    for (const etape of ['testwriter', 'preuve', 'developpeur', 'references', 'relecture']) {
      const d = depot();
      const avant = d.tete();
      d.avance('b.txt', 'b\nMAIN\n');
      expect(avantLaPasse(d.ctx, etape, REGENERATION), etape).toEqual({
        avancee: false,
        regeneration: REGENERATION,
      });
      expect(d.tete(), etape).toBe(avant);
    }
  });
});

describe('grillhouse-527 critères 1 et 2 — the copy is prepared on the tip of main before the pass', () => {
  it('moves a copy behind main to its tip, its local work kept, the regeneration before dropped', () => {
    const d = depot();
    const main = d.avance('b.txt', 'b\nMAIN\n');
    d.ecrire('a.txt', lignes('COPIE'));
    expect(avantLaPasse(d.ctx, 'controles', REGENERATION)).toEqual({
      avancee: true,
      regeneration: null,
    });
    expect(d.tete()).toBe(main);
    expect(d.lire('a.txt')).toBe(lignes('COPIE'));
    expect(d.lire('b.txt')).toBe('b\nMAIN\n');
  });

  it('installs again when main brings a lock file newer than the installation, not otherwise', () => {
    const d = depot({ 'package.json': '{"name":"essai"}\n', 'package-lock.json': '{}\n' });
    const npm = npmDEssai();
    mkdirSync(path.join(d.copie, 'node_modules'));
    const installe = path.join(d.copie, 'node_modules', '.package-lock.json');
    writeFileSync(installe, '{}\n');
    const futur = new Date(Date.now() + 60_000);
    utimesSync(installe, futur, futur);
    expect(avantLaPasse(d.ctx, 'controles', null, npm.env).arret).toBeUndefined();
    expect(npm.appels()).toBe('');
    d.avance('package-lock.json', '{"v":2}\n');
    utimesSync(installe, new Date(0), new Date(0));
    expect(avantLaPasse(d.ctx, 'controles', null, npm.env)).toEqual({
      avancee: true,
      regeneration: null,
    });
    expect(npm.appels()).toContain(`--prefix ${d.copie} install --no-save`);
  });

  it('sets a submodule at the commit main brings', () => {
    const sous = nouveauDepot({ 'm.txt': 'un\n' });
    const d = depot({}, racine => {
      git(racine, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sous, 'vendor/sm');
      git(racine, 'commit', '-qm', 'sous-module');
    });
    expect(avantLaPasse(d.ctx, 'controles', null).arret).toBeUndefined();
    writeFileSync(path.join(sous, 'm.txt'), 'deux\n');
    git(sous, 'commit', '-qam', 'deux');
    const neuf = git(sous, 'rev-parse', 'HEAD');
    const principal = path.join(d.racine, 'vendor/sm');
    git(principal, '-c', 'protocol.file.allow=always', 'fetch', '-q', 'origin');
    git(principal, 'checkout', '-q', neuf);
    git(d.racine, 'commit', '-qam', 'sous-module avancé');
    const r = avantLaPasse(d.ctx, 'controles', null);
    expect(r.arret?.rapport).toBeUndefined();
    expect(r.avancee).toBe(true);
    expect(git(path.join(d.copie, 'vendor/sm'), 'rev-parse', 'HEAD')).toBe(neuf);
    expect(readFileSync(path.join(d.copie, 'vendor/sm/m.txt'), 'utf8')).toBe('deux\n');
  });
});

describe('grillhouse-527 critère 4 — a copy at the tip of main, or ahead of it, is not moved', () => {
  it('leaves a copy at the tip of main as it is, the regeneration kept', () => {
    const d = depot();
    const avant = d.tete();
    d.ecrire('a.txt', lignes('COPIE'));
    expect(avantLaPasse(d.ctx, 'controles', REGENERATION)).toEqual({
      avancee: false,
      regeneration: REGENERATION,
    });
    expect(d.tete()).toBe(avant);
    expect(d.lire('a.txt')).toBe(lignes('COPIE'));
  });

  it('leaves a copy ahead of main as it is', () => {
    const d = depot();
    d.ecrire('b.txt', 'b\nCOPIE\n');
    git(d.copie, 'commit', '-qam', 'copie');
    const avant = d.tete();
    d.ecrire('a.txt', lignes('COPIE'));
    expect(avantLaPasse(d.ctx, 'controles', null)).toEqual({ avancee: false, regeneration: null });
    expect(d.tete()).toBe(avant);
    expect(d.lire('a.txt')).toBe(lignes('COPIE'));
  });
});

describe('grillhouse-527 critère 3 — a preparation that fails stops the circuit on a question', () => {
  it('a conflict: the question names the copy, each file in conflict and the gesture that resumes; the work stays in the copy', () => {
    const d = depot();
    const main = d.avance('a.txt', lignes('MAIN'));
    d.ecrire('a.txt', lignes('COPIE'));
    const r = avantLaPasse(d.ctx, 'controles', null);
    expect(r.avancee).toBeUndefined();
    expect(r.arret?.nom).toBe('lancement');
    expect(ARRETS[r.arret!.nom as keyof typeof ARRETS]).toBe(10);
    expect(monteeDe(r.arret!.nom)).not.toBeNull();
    expect(r.arret!.rapport).toContain(d.copie);
    expect(r.arret!.rapport).toMatch(/^ {2}a\.txt$/m);
    expect(r.arret!.piece).toMatch(/^ {2}a\.txt$/m);
    expect(r.arret!.question).toContain('npx grillhouse circuit demo-1 --reprendre');
    expect(r.arret!.question).toContain(d.copie);
    expect(d.tete()).toBe(main);
    expect(d.lire('a.txt')).toMatch(/^<<<<<<< .*\nMAIN\n=======\nCOPIE\n>>>>>>> /m);
  });

  it('a branch gone from main: the copy and its work are not touched', () => {
    const d = depot();
    d.avance('b.txt', 'b\nMAIN\n');
    d.ecrire('b.txt', 'b\nCOPIE\n');
    git(d.copie, 'commit', '-qam', 'copie');
    const avant = d.tete();
    d.ecrire('a.txt', lignes('COPIE'));
    const r = avantLaPasse(d.ctx, 'controles', null);
    expect(r.arret?.nom).toBe('lancement');
    expect(r.arret!.rapport).toContain(d.copie);
    expect(r.arret!.question).toContain('--reprendre');
    expect(d.tete()).toBe(avant);
    expect(d.lire('a.txt')).toBe(lignes('COPIE'));
  });

  it('a lot that waits in the git directory of the copy: the copy is not touched, the file named', () => {
    const d = depot();
    const avant = d.tete();
    d.avance('b.txt', 'b\nMAIN\n');
    const lot = path.join(
      git(d.copie, 'rev-parse', '--absolute-git-dir'),
      'grillhouse-travail.patch'
    );
    writeFileSync(lot, 'un lot\n');
    const r = avantLaPasse(d.ctx, 'controles', null);
    expect(r.arret?.nom).toBe('lancement');
    expect(r.arret!.rapport).toContain(lot);
    expect(r.arret!.question).toContain('--reprendre');
    expect(d.tete()).toBe(avant);
    expect(existsSync(lot)).toBe(true);
  });
});
