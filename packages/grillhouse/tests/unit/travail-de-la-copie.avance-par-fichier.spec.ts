// L'avance d'une copie applique son lot fichier par fichier, et une copie aux conflits non résolus
// ou au lot gardé en attente accepte la relance du rôle qui écrit ces fichiers
// (scripts/enveloppe/travail-de-la-copie.mjs). Chaque cas joue le vrai git dans un dépôt d'essai :
// main (l'arbre principal) et la copie d'un ticket sous .claude/worktrees, comme le lanceur la fait.
//
// Interface attendue de `avancer(copie, cible, { ecrit })` : `{ ok, message, conflits, enAttente }`,
// `conflits` les fichiers aux marques, `enAttente` ceux qui restent seuls dans le lot gardé ; `ecrit`
// (facultatif) dit si le rôle relancé écrit un fichier.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { avancer } from '../../scripts/enveloppe/travail-de-la-copie.mjs';

interface Resultat {
  ok: boolean;
  message: string;
  conflits?: string[];
  enAttente?: string[];
}
const avancerAvec = avancer as unknown as (
  copie: string,
  cible: string,
  o?: { ecrit?: (fichier: string) => boolean }
) => Resultat;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'avance-par-fichier-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};
const lignes = (deuxieme: string) => `l1\n${deuxieme}\nl3\nl4\nl5\nl6\nl7\n`;
const MARQUES = (main: string, copie: string) =>
  new RegExp(`^<<<<<<< .*\\n${main}\\n=======\\n${copie}\\n>>>>>>> `, 'm');

function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  for (const f of ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt']) {
    writeFileSync(path.join(racine, f), lignes(`${f}-base`));
  }
  writeFileSync(path.join(racine, '.gitignore'), '.claude/worktrees/\n');
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'base');
  const copie = path.join(racine, '.claude/worktrees/demo-1');
  git(racine, 'worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
  const avance = (fichier: string, deuxieme: string) => {
    writeFileSync(path.join(racine, fichier), lignes(deuxieme));
    git(racine, 'commit', '-qam', `main ${fichier}`);
    return git(racine, 'rev-parse', 'HEAD');
  };
  const lire = (f: string) => readFileSync(path.join(copie, f), 'utf8');
  const ecrire = (f: string, deuxieme: string) =>
    writeFileSync(path.join(copie, f), lignes(deuxieme));
  const lot = () =>
    path.join(git(copie, 'rev-parse', '--absolute-git-dir'), 'grillhouse-travail.patch');
  const conflits = () =>
    git(copie, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
  return { racine, copie, avance, lire, ecrire, lot, conflits };
}

describe("l'avance applique le lot fichier par fichier", () => {
  it('un fichier en conflit garde ses marques et les autres fichiers du lot s’appliquent', () => {
    const d = depot();
    d.avance('a.txt', 'MAIN');
    const main = d.avance('d.txt', 'MAIN-D');
    d.ecrire('a.txt', 'COPIE');
    d.ecrire('b.txt', 'COPIE-B');
    d.ecrire('c.txt', 'COPIE-C');
    const r = avancerAvec(d.copie, main);
    expect(r.ok).toBe(false);
    expect(d.lire('a.txt')).toMatch(MARQUES('MAIN', 'COPIE'));
    expect(d.lire('b.txt')).toBe(lignes('COPIE-B'));
    expect(d.lire('c.txt')).toBe(lignes('COPIE-C'));
    expect(d.conflits()).toEqual(['a.txt']);
    expect(r.conflits).toEqual(['a.txt']);
    expect(existsSync(d.lot())).toBe(false);
  });

  it('deux fichiers en conflit gardent chacun leurs marques, le troisième s’applique', () => {
    const d = depot();
    d.avance('a.txt', 'MAIN-A');
    const main = d.avance('b.txt', 'MAIN-B');
    d.ecrire('a.txt', 'COPIE-A');
    d.ecrire('b.txt', 'COPIE-B');
    d.ecrire('e.txt', 'COPIE-E');
    const r = avancerAvec(d.copie, main);
    expect(r.ok).toBe(false);
    expect(d.lire('a.txt')).toMatch(MARQUES('MAIN-A', 'COPIE-A'));
    expect(d.lire('b.txt')).toMatch(MARQUES('MAIN-B', 'COPIE-B'));
    expect(d.lire('e.txt')).toBe(lignes('COPIE-E'));
    expect([...(r.conflits ?? [])].sort()).toEqual(['a.txt', 'b.txt']);
    expect(d.conflits().sort()).toEqual(['a.txt', 'b.txt']);
  });

  it('une suppression que git refuse sans marques reste seule dans le lot gardé, nommée au message, les autres fichiers appliqués', () => {
    const d = depot();
    const main = d.avance('c.txt', 'MAIN-C');
    rmSync(path.join(d.copie, 'c.txt'));
    d.ecrire('b.txt', 'COPIE-B');
    const r = avancerAvec(d.copie, main);
    expect(r.ok).toBe(false);
    expect(d.lire('b.txt')).toBe(lignes('COPIE-B'));
    expect(d.lire('c.txt')).toBe(lignes('MAIN-C'));
    expect(d.conflits()).toEqual([]);
    expect(existsSync(d.lot())).toBe(true);
    const gardé = readFileSync(d.lot(), 'utf8');
    expect(gardé).toContain('c.txt');
    expect(gardé).not.toContain('b.txt');
    expect(r.enAttente).toEqual(['c.txt']);
    expect(r.message).toContain('c.txt');
    expect(r.message).toContain(d.lot());
  });

  it('une suppression refusée et un conflit à la fois : les marques d’un côté, le lot gardé de l’autre', () => {
    const d = depot();
    d.avance('c.txt', 'MAIN-C');
    const main = d.avance('a.txt', 'MAIN-A');
    rmSync(path.join(d.copie, 'c.txt'));
    d.ecrire('a.txt', 'COPIE-A');
    d.ecrire('e.txt', 'COPIE-E');
    const r = avancerAvec(d.copie, main);
    expect(r.ok).toBe(false);
    expect(d.lire('a.txt')).toMatch(MARQUES('MAIN-A', 'COPIE-A'));
    expect(d.lire('e.txt')).toBe(lignes('COPIE-E'));
    expect(r.conflits).toEqual(['a.txt']);
    expect(r.enAttente).toEqual(['c.txt']);
    const gardé = readFileSync(d.lot(), 'utf8');
    expect(gardé).toContain('c.txt');
    expect(gardé).not.toContain('a.txt');
  });

  it('les fichiers neufs non suivis restent en place quand un fichier échoue', () => {
    const d = depot();
    const main = d.avance('a.txt', 'MAIN');
    d.ecrire('a.txt', 'COPIE');
    writeFileSync(path.join(d.copie, 'neuf.txt'), 'neuf\n');
    avancerAvec(d.copie, main);
    expect(readFileSync(path.join(d.copie, 'neuf.txt'), 'utf8')).toBe('neuf\n');
    expect(d.lire('a.txt')).toMatch(MARQUES('MAIN', 'COPIE'));
  });

  it('un lot dont tous les fichiers s’appliquent laisse la copie nette, sans lot gardé', () => {
    const d = depot();
    const main = d.avance('d.txt', 'MAIN-D');
    d.ecrire('a.txt', 'COPIE-A');
    d.ecrire('b.txt', 'COPIE-B');
    const r = avancerAvec(d.copie, main);
    expect(r.ok).toBe(true);
    expect(d.lire('a.txt')).toBe(lignes('COPIE-A'));
    expect(d.lire('b.txt')).toBe(lignes('COPIE-B'));
    expect(existsSync(d.lot())).toBe(false);
    expect(d.conflits()).toEqual([]);
  });
});

describe('une relance est acceptée sur une copie aux conflits non résolus quand le rôle écrit un de leurs fichiers', () => {
  const enConflit = () => {
    const d = depot();
    d.avance('a.txt', 'MAIN-A');
    const main = d.avance('b.txt', 'MAIN-B');
    d.ecrire('a.txt', 'COPIE-A');
    d.ecrire('b.txt', 'COPIE-B');
    avancerAvec(d.copie, main);
    return { d, main };
  };

  it('est acceptée pour le rôle qui écrit un fichier en conflit, qui reçoit ses seuls fichiers', () => {
    const { d, main } = enConflit();
    const marques = d.lire('a.txt');
    const r = avancerAvec(d.copie, main, { ecrit: f => f === 'a.txt' });
    expect(r.ok).toBe(true);
    expect(r.conflits).toEqual(['a.txt']);
    expect(d.lire('a.txt')).toBe(marques);
    expect(d.lire('b.txt')).toMatch(MARQUES('MAIN-B', 'COPIE-B'));
  });

  it('est acceptée pour le rôle qui écrit tous les fichiers en conflit', () => {
    const { d, main } = enConflit();
    const r = avancerAvec(d.copie, main, { ecrit: () => true });
    expect(r.ok).toBe(true);
    expect([...(r.conflits ?? [])].sort()).toEqual(['a.txt', 'b.txt']);
  });

  it('est refusée, du refus actuel, quand le rôle n’écrit aucun fichier en conflit', () => {
    const { d, main } = enConflit();
    const r = avancerAvec(d.copie, main, { ecrit: () => false });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('garde des conflits non résolus');
    expect(r.message).toMatch(/^ {2}a\.txt$/m);
  });

  it('sans rôle donné, garde le refus actuel', () => {
    const { d, main } = enConflit();
    const r = avancerAvec(d.copie, main);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('garde des conflits non résolus');
  });
});

describe('une relance est acceptée sur une copie au lot gardé en attente quand le rôle écrit un de ses fichiers', () => {
  const lotEnAttente = () => {
    const d = depot();
    const main = d.avance('c.txt', 'MAIN-C');
    rmSync(path.join(d.copie, 'c.txt'));
    d.ecrire('b.txt', 'COPIE-B');
    avancerAvec(d.copie, main);
    return { d, main };
  };

  it('est acceptée pour le rôle qui écrit le fichier du lot, qui reçoit le lot et la liste, intacts', () => {
    const { d, main } = lotEnAttente();
    const avant = readFileSync(d.lot(), 'utf8');
    const r = avancerAvec(d.copie, main, { ecrit: f => f === 'c.txt' });
    expect(r.ok).toBe(true);
    expect(r.enAttente).toEqual(['c.txt']);
    expect(readFileSync(d.lot(), 'utf8')).toBe(avant);
  });

  it('est refusée, du refus actuel, quand le rôle n’écrit aucun fichier du lot', () => {
    const { d, main } = lotEnAttente();
    const r = avancerAvec(d.copie, main, { ecrit: f => f === 'b.txt' });
    expect(r.ok).toBe(false);
    expect(r.message).toContain(d.lot());
    expect(existsSync(d.lot())).toBe(true);
  });

  it('sans rôle donné, garde le refus actuel', () => {
    const { d, main } = lotEnAttente();
    const r = avancerAvec(d.copie, main);
    expect(r.ok).toBe(false);
    expect(r.message).toContain(d.lot());
  });
});
