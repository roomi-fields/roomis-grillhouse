// grillhouse-fy3: the launcher carries the local work of an agent's copy onto main in the copy
// alone (scripts/enveloppe/travail-de-la-copie.mjs, called by scripts/enveloppe/lancer.sh), never
// in git's stash, which every copy of a repository shares. Witness: OSC Bridge, OB-d0b
// (2026-10-31), a relaunch whose autostash met CHANGELOG.md left its work in refs/stash.
//
// Each case plays the real git in a repository of trial: main (the main tree) and the copy of a
// ticket under .claude/worktrees, as the launcher makes it.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { avancer, reporter } from '../../scripts/enveloppe/travail-de-la-copie.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'travail-de-la-copie-'));
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

// The repository of trial and the copy of demo-1 at its HEAD.
function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  writeFileSync(path.join(racine, 'a.txt'), lignes('l2'));
  writeFileSync(path.join(racine, 'b.txt'), 'b\n');
  writeFileSync(path.join(racine, '.gitignore'), '.claude/worktrees/\n');
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'base');
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
  const remise = () =>
    spawnSync('git', ['-C', racine, 'rev-parse', '--verify', '-q', 'refs/stash']).status === 0;
  const lot = () =>
    path.join(git(copie, 'rev-parse', '--absolute-git-dir'), 'grillhouse-travail.patch');
  return { racine, copie, avance, lire, ecrire, remise, lot };
}

describe('grillhouse-fy3 critère 1 — a conflict leaves the work in the copy, not in the stash', () => {
  it('stops, the conflicts marked in the copy, nothing in git’s stash, and names the copy and the file', () => {
    const d = depot();
    const main = d.avance('a.txt', lignes('MAIN'));
    d.ecrire('a.txt', lignes('COPIE'));
    const r = avancer(d.copie, main);
    expect(r.ok).toBe(false);
    expect(d.remise()).toBe(false);
    expect(git(d.copie, 'rev-parse', 'HEAD')).toBe(main);
    expect(d.lire('a.txt')).toMatch(/^<<<<<<< .*\nMAIN\n=======\nCOPIE\n>>>>>>> /m);
    expect(git(d.copie, 'diff', '--name-only', '--diff-filter=U')).toBe('a.txt');
    expect(r.message).toContain('il reste dans la copie');
    expect(r.message).toContain(d.copie);
    expect(r.message).toMatch(/^ {2}a\.txt$/m);
    expect(existsSync(d.lot())).toBe(false);
  });

  it('refuses a copy whose conflicts are unresolved, its files untouched', () => {
    const d = depot();
    const main = d.avance('a.txt', lignes('MAIN'));
    d.ecrire('a.txt', lignes('COPIE'));
    avancer(d.copie, main);
    const marque = d.lire('a.txt');
    const encore = d.avance('b.txt', 'b\nMAIN\n');
    const r = avancer(d.copie, encore);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/conflits non résolus/);
    expect(r.message).toMatch(/^ {2}a\.txt$/m);
    expect(d.lire('a.txt')).toBe(marque);
    expect(git(d.copie, 'rev-parse', 'HEAD')).toBe(main);
    expect(d.remise()).toBe(false);
  });
});

describe('grillhouse-fy3 critère 1 — a lot git refuses whole waits in the copy', () => {
  it('refuses every relaunch while the lot waits, and names its file', () => {
    const d = depot();
    git(d.copie, 'rm', '-q', 'a.txt');
    const main = d.avance('a.txt', lignes('MAIN'));
    const r = avancer(d.copie, main);
    expect(r.ok).toBe(false);
    expect(existsSync(d.lot())).toBe(true);
    expect(readFileSync(d.lot(), 'utf8')).toMatch(/^deleted file mode/m);
    expect(r.message).toContain(d.lot());
    d.ecrire('.gitignore', '.claude/worktrees/\nautre\n');
    const encore = avancer(d.copie, main);
    expect(encore.ok).toBe(false);
    expect(encore.message).toContain(d.lot());
    expect(encore.message).toMatch(/git apply --3way/);
    const plus = d.avance('b.txt', 'b\nMAIN\n');
    expect(avancer(d.copie, plus).ok).toBe(false);
    expect(readFileSync(d.lot(), 'utf8')).toMatch(/^deleted file mode/m);
    expect(git(d.copie, 'rev-parse', 'HEAD')).toBe(main);
    expect(d.remise()).toBe(false);
  });
});

describe('grillhouse-fy3 critère 2 — a relaunch without conflict moves as before', () => {
  it('moves forward and keeps every kind of work: staged, unstaged, new, deleted, untracked', () => {
    const d = depot();
    d.avance('a.txt', lignes('l2', 'MAIN'));
    const main = d.avance('b.txt', 'b\nMAIN\n');
    d.ecrire('a.txt', lignes('COPIE'));
    git(d.copie, 'add', 'a.txt');
    d.ecrire('b.txt', 'COPIE\nb\n');
    d.ecrire('neuf.txt', 'neuf\n');
    git(d.copie, 'add', 'neuf.txt');
    d.ecrire('libre.txt', 'libre\n');
    git(d.copie, 'rm', '-q', '.gitignore');
    const r = avancer(d.copie, main);
    expect(r, r.message).toEqual({ ok: true, message: '' });
    expect(git(d.copie, 'rev-parse', 'HEAD')).toBe(main);
    expect(d.lire('a.txt')).toBe(lignes('COPIE', 'MAIN'));
    expect(d.lire('b.txt')).toBe('COPIE\nb\nMAIN\n');
    expect(d.lire('neuf.txt')).toBe('neuf\n');
    expect(d.lire('libre.txt')).toBe('libre\n');
    expect(existsSync(path.join(d.copie, '.gitignore'))).toBe(false);
    expect(d.remise()).toBe(false);
    expect(existsSync(d.lot())).toBe(false);
  });

  it('moves a copy without work, and leaves a copy at main as it is', () => {
    const d = depot();
    const main = d.avance('a.txt', lignes('MAIN'));
    expect(avancer(d.copie, main).ok).toBe(true);
    expect(git(d.copie, 'rev-parse', 'HEAD')).toBe(main);
    d.ecrire('a.txt', lignes('COPIE'));
    expect(avancer(d.copie, main).ok).toBe(true);
    expect(d.lire('a.txt')).toBe(lignes('COPIE'));
  });

  it('refuses a copy whose branch carries commits main has not, its work in place', () => {
    const d = depot();
    git(d.copie, 'commit', '-q', '--allow-empty', '-m', 'agent');
    const main = d.avance('a.txt', lignes('l2', 'MAIN'));
    d.ecrire('a.txt', lignes('COPIE'));
    const r = avancer(d.copie, main);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/ne peut pas avancer/);
    expect(d.lire('a.txt')).toBe(lignes('COPIE'));
  });

  it('gives the work back when an untracked file stands in the way of the fast-forward', () => {
    const d = depot();
    writeFileSync(path.join(d.racine, 'c.txt'), 'main\n');
    git(d.racine, 'add', 'c.txt');
    git(d.racine, 'commit', '-qm', 'main c');
    const main = git(d.racine, 'rev-parse', 'HEAD');
    d.ecrire('c.txt', 'libre\n');
    d.ecrire('a.txt', lignes('COPIE'));
    const r = avancer(d.copie, main);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/travail reste en place/);
    expect(d.lire('a.txt')).toBe(lignes('COPIE'));
    expect(d.lire('c.txt')).toBe('libre\n');
    expect(d.remise()).toBe(false);
  });
});

// The same application carries the lot of a branch the queue sent back (grillhouse-3uv.63).
describe('the lot of a branch sent back, as local work', () => {
  it('applies the lot three ways, its conflict marked, the index as HEAD has it', () => {
    const d = depot();
    const base = git(d.racine, 'rev-parse', 'HEAD');
    d.ecrire('a.txt', lignes('COPIE'));
    d.ecrire('neuf.txt', 'neuf\n');
    git(d.copie, 'add', '-A');
    git(d.copie, 'commit', '-qm', 'lot');
    const pointe = git(d.copie, 'rev-parse', 'HEAD');
    const main = d.avance('a.txt', lignes('MAIN'));
    git(d.copie, 'reset', '-q', '--hard', main);
    const r = reporter(d.copie, { base, pointe });
    expect(r.ok, r.message).toBe(true);
    expect(d.lire('a.txt')).toMatch(/^<<<<<<< .*\nMAIN\n=======\nCOPIE\n>>>>>>> /m);
    expect(d.lire('neuf.txt')).toBe('neuf\n');
    expect(git(d.copie, 'diff', '--cached', '--name-only')).toBe('');
    expect(d.remise()).toBe(false);
  });
});

// grillhouse-8o9 critère 2: a generated file the project declares (`grillhouse.engendres`,
// scripts/engendres.mjs) is not merged when the copy moves onto main, nor when the lot of a branch
// sent back comes back as local work: the copy takes main's version, then the declared command
// writes it again on the work applied. Witness: OSC Bridge, 2026-10-31, SH-a3x.4 « U
// docs/devices.json », each copy moved onto main by hand, the file regenerated, then relaunched.
const LISTE = `import fs from 'node:fs';
fs.writeFileSync('liste.txt', fs.readdirSync('src').sort().join('\\n') + '\\n');
`;

// The repository of trial with a generated file declared: liste.txt, the list of the folder src,
// written by <commande>; the copy of demo-1 at its HEAD.
function depotEngendre(commande = 'node liste.mjs') {
  const d = depot();
  writeFileSync(
    path.join(d.racine, 'package.json'),
    JSON.stringify({
      name: 'essai',
      grillhouse: {
        engendres: { liste: { commande, fichiers: ['liste.txt'], lit: ['src/**'] } },
      },
    })
  );
  writeFileSync(path.join(d.racine, 'liste.mjs'), LISTE);
  mkdirSync(path.join(d.racine, 'src'));
  writeFileSync(path.join(d.racine, 'src/a.txt'), 'a\n');
  writeFileSync(path.join(d.racine, 'liste.txt'), 'a.txt\n');
  git(d.racine, 'add', '-A');
  git(d.racine, 'commit', '-qm', 'liste');
  git(d.copie, 'merge', '-q', '--ff-only', 'main');
  // Main gains the source b, and its list.
  const ajouterSurMain = () => {
    writeFileSync(path.join(d.racine, 'src/b.txt'), 'b\n');
    writeFileSync(path.join(d.racine, 'liste.txt'), 'a.txt\nb.txt\n');
    git(d.racine, 'add', '-A');
    git(d.racine, 'commit', '-qm', 'main b');
    return git(d.racine, 'rev-parse', 'HEAD');
  };
  return { ...d, ajouterSurMain };
}

describe('grillhouse-8o9 critère 2 — a declared generated file is written again, not merged', () => {
  it('moves the copy onto main: main’s version taken, the command played on the work, both sources listed', () => {
    const d = depotEngendre();
    mkdirSync(path.join(d.copie, 'src'), { recursive: true });
    d.ecrire('src/c.txt', 'c\n');
    git(d.copie, 'add', 'src/c.txt');
    d.ecrire('liste.txt', 'a.txt\nc.txt\n');
    const main = d.ajouterSurMain();
    const r = avancer(d.copie, main);
    expect(r, r.message).toEqual({ ok: true, message: '' });
    expect(git(d.copie, 'rev-parse', 'HEAD')).toBe(main);
    expect(d.lire('liste.txt')).toBe('a.txt\nb.txt\nc.txt\n');
    expect(git(d.copie, 'diff', '--name-only', '--diff-filter=U')).toBe('');
    expect(git(d.copie, 'diff', '--cached', '--name-only')).toBe('');
    expect(git(d.copie, 'diff', '--name-only', 'HEAD')).toBe('liste.txt');
    expect(d.lire('src/c.txt')).toBe('c\n');
    expect(existsSync(d.lot())).toBe(false);
  });

  it('brings back the lot of a branch sent back the same way', () => {
    const d = depotEngendre();
    const base = git(d.racine, 'rev-parse', 'HEAD');
    mkdirSync(path.join(d.copie, 'src'), { recursive: true });
    d.ecrire('src/c.txt', 'c\n');
    d.ecrire('liste.txt', 'a.txt\nc.txt\n');
    git(d.copie, 'add', '-A');
    git(d.copie, 'commit', '-qm', 'lot');
    const pointe = git(d.copie, 'rev-parse', 'HEAD');
    const main = d.ajouterSurMain();
    git(d.copie, 'reset', '-q', '--hard', main);
    const r = reporter(d.copie, { base, pointe });
    expect(r.ok, r.message).toBe(true);
    expect(d.lire('liste.txt')).toBe('a.txt\nb.txt\nc.txt\n');
    expect(git(d.copie, 'diff', '--cached', '--name-only')).toBe('');
  });

  it('stops on a command that fails, the command and its output named, the work in the copy', () => {
    const d = depotEngendre('echo "liste illisible" >&2; exit 4');
    mkdirSync(path.join(d.copie, 'src'), { recursive: true });
    d.ecrire('src/c.txt', 'c\n');
    git(d.copie, 'add', 'src/c.txt');
    d.ecrire('liste.txt', 'a.txt\nc.txt\n');
    const main = d.ajouterSurMain();
    const r = avancer(d.copie, main);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('echo "liste illisible" >&2; exit 4');
    expect(r.message).toContain('liste illisible');
    expect(git(d.copie, 'rev-parse', 'HEAD')).toBe(main);
    expect(d.lire('src/c.txt')).toBe('c\n');
    expect(git(d.copie, 'diff', '--name-only', '--diff-filter=U')).toBe('');
    expect(existsSync(d.lot())).toBe(false);
  });

  it('refuses a faulty key by its name before it touches the copy', () => {
    const d = depotEngendre();
    writeFileSync(
      path.join(d.racine, 'package.json'),
      JSON.stringify({ grillhouse: { engendres: { liste: { fichiers: ['liste.txt'] } } } })
    );
    git(d.racine, 'commit', '-qam', 'clé fautive');
    const tete = git(d.copie, 'rev-parse', 'HEAD');
    d.ecrire('liste.txt', 'a.txt\nc.txt\n');
    const main = d.ajouterSurMain();
    const r = avancer(d.copie, main);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('grillhouse.engendres.liste');
    expect(git(d.copie, 'rev-parse', 'HEAD')).toBe(tete);
    expect(d.lire('liste.txt')).toBe('a.txt\nc.txt\n');
  });
});
