// grillhouse-527.1: each version of the lot is taken against the tip of main of its time (its
// base, the copy's HEAD when it is kept), as Gerrit compares two patch sets: after an advance of
// the copy between two reviews, the lot the review before read is replayed on the new base, and
// the bounded review, the elements to judge again and the restricted final pass read the
// difference between that replay and the new lot, never the commits of main. Witness: the
// reviewer of grillhouse-527 (2026-11-01), a difference that held main's changes on the files of
// the lot, marked to judge again; an ACCEPTÉ sent back to 4.1 and one more review for each move of
// main.
//
// Each case plays the real git in a repository of trial: main (the main tree) and the copy of a
// ticket under .claude/worktrees, advanced by the launcher's own advance.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';
import { avancer } from '../../scripts/enveloppe/travail-de-la-copie.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-lot-base-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Lot {
  commit: string;
  arbre: string;
}
const leLotGarde = circuit.leLotGarde as (ctx: object) => {
  avant: unknown;
  depuis: string | null;
  lot: Lot | null;
};
const laPasseFinale = circuit.laPasseFinale as (ctx: object) => {
  arbre: string;
  restreinte: { avant: string; apres: string } | null;
};
const leLotAccepte = circuit.leLotAccepte as (ctx: object, arbre: string) => boolean;

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};
const lignes = (deuxieme: string, septieme = 'l7') =>
  `l1\n${deuxieme}\nl3\nl4\nl5\nl6\n${septieme}\n`;

// The repository of trial, the copy of demo-1 on its HEAD, and the context of its circuit.
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
  const tmp = mkdtempSync(path.join(ESSAIS, 'tmp-'));
  const ctx = {
    racine,
    copie,
    ticket: 'demo-1',
    tmp,
    numero: 0,
    fiches: path.join(tmp, 'fiches.jsonl'),
  };
  const ecrire = (fichier: string, contenu: string) =>
    writeFileSync(path.join(copie, fichier), contenu);
  // main moves <fichier> to <contenu>, and the copy advances on it, its work kept.
  const avance = (fichier: string, contenu: string) => {
    writeFileSync(path.join(racine, fichier), contenu);
    git(racine, 'commit', '-qam', `main ${fichier}`);
    const r = avancer(copie, git(racine, 'rev-parse', 'HEAD'));
    if (!r.ok) {
      throw new Error(r.message);
    }
  };
  // A review of the lot as it stands, its verdict <verdict>, inscribed as the circuit does.
  const relu = (verdict: string, fichiers: string[]) => {
    const { lot } = leLotGarde(ctx);
    appendFileSync(
      ctx.fiches,
      `${JSON.stringify({ role: 'relecteur', fiche: { verdict }, lot: { ...lot, fichiers } })}\n`
    );
    return lot;
  };
  const difference = (avant: string, apres: string, ...options: string[]) =>
    git(copie, 'diff', ...options, avant, apres);
  return { racine, copie, ctx, ecrire, avance, relu, difference };
}

describe('grillhouse-527.1 critère 1 — after an advance, the bounded difference holds only the lot', () => {
  it('main moves a file out of the lot: the difference is what the lot changed since', () => {
    const d = depot();
    d.ecrire('a.txt', lignes('COPIE'));
    d.relu('RENDU', ['a.txt']);
    d.avance('b.txt', 'b\nMAIN\n');
    d.ecrire('c.txt', 'c\n');
    const { avant, depuis, lot } = leLotGarde(d.ctx);
    expect(avant).not.toBeNull();
    expect(depuis).toBeTruthy();
    expect(d.difference(depuis!, lot!.commit, '--name-only')).toBe('c.txt');
  });

  it('main moves a line of a file of the lot: the difference holds none of main’s lines', () => {
    const d = depot();
    d.ecrire('a.txt', lignes('COPIE'));
    d.relu('RENDU', ['a.txt']);
    d.avance('a.txt', lignes('l2', 'MAIN'));
    d.ecrire('c.txt', 'c\n');
    const { depuis, lot } = leLotGarde(d.ctx);
    expect(d.difference(depuis!, lot!.commit, '--name-only')).toBe('c.txt');
    expect(d.difference(depuis!, lot!.commit)).not.toContain('MAIN');
  });

  it('each lot kept carries its base, the copy’s HEAD when it is kept', () => {
    const d = depot();
    d.ecrire('a.txt', lignes('COPIE'));
    d.relu('RENDU', ['a.txt']);
    d.avance('b.txt', 'b\nMAIN\n');
    const { lot } = leLotGarde(d.ctx);
    expect(lot!.base).toBe(git(d.copie, 'rev-parse', 'HEAD'));
  });

  it('a lot of before that conflicts with main once replayed bounds nothing: the review is whole', () => {
    const d = depot();
    d.ecrire('a.txt', lignes('COPIE'));
    d.relu('RENDU', ['a.txt']);
    // The lot takes back its line, main changes it: the advance passes, the replay conflicts.
    d.ecrire('a.txt', lignes('l2'));
    d.ecrire('c.txt', 'c\n');
    d.avance('a.txt', lignes('MAIN'));
    const { avant, depuis, lot } = leLotGarde(d.ctx);
    expect(avant).not.toBeNull();
    expect(depuis).toBeNull();
    expect(lot).not.toBeNull();
    expect(laPasseFinale(d.ctx).restreinte).toBeNull();
  });

  it('a review of before kept without its base is no review to bound from', () => {
    const d = depot();
    d.ecrire('a.txt', lignes('COPIE'));
    const lot = d.relu('RENDU', ['a.txt']);
    writeFileSync(
      d.ctx.fiches,
      `${JSON.stringify({ role: 'relecteur', fiche: { verdict: 'RENDU' }, lot: { commit: lot!.commit, arbre: lot!.arbre, fichiers: ['a.txt'] } })}\n`
    );
    expect(leLotGarde(d.ctx).avant).toBeNull();
  });
});

describe('grillhouse-527.1 critère 2 — the restricted final pass follows the same difference', () => {
  it('after an advance, the range of the final pass holds only what the lot changed', () => {
    const d = depot();
    d.ecrire('a.txt', lignes('COPIE'));
    d.relu('RENDU', ['a.txt']);
    d.avance('a.txt', lignes('l2', 'MAIN'));
    d.ecrire('c.txt', 'c\n');
    const { restreinte } = laPasseFinale(d.ctx);
    expect(restreinte).not.toBeNull();
    expect(d.difference(restreinte!.avant, restreinte!.apres, '--name-only')).toBe('c.txt');
    // Turborepo reads the range from its merge base: the replayed lot itself.
    expect(git(d.copie, 'merge-base', restreinte!.avant, restreinte!.apres)).toBe(
      restreinte!.avant
    );
  });
});

describe('grillhouse-527.1 critère 3 — without an advance, unchanged', () => {
  it('the lot of before is compared as it was kept, the new lot its child', () => {
    const d = depot();
    d.ecrire('a.txt', lignes('COPIE'));
    const avant = d.relu('RENDU', ['a.txt']);
    d.ecrire('c.txt', 'c\n');
    const { depuis, lot } = leLotGarde(d.ctx);
    expect(depuis).toBe(avant!.commit);
    expect(git(d.copie, 'rev-parse', `${lot!.commit}^`)).toBe(avant!.commit);
    const { restreinte } = laPasseFinale(d.ctx);
    expect(restreinte!.avant).toBe(avant!.commit);
  });

  it('the lot accepted, unchanged and without an advance, plays the whole pass and goes on', () => {
    const d = depot();
    d.ecrire('a.txt', lignes('COPIE'));
    d.relu('ACCEPTÉ', ['a.txt']);
    const passe = laPasseFinale(d.ctx);
    expect(passe.restreinte).toBeNull();
    expect(leLotAccepte(d.ctx, passe.arbre)).toBe(true);
  });
});

describe('grillhouse-527.1 critère 4 — an advance out of the files of the lot sends nothing back', () => {
  it('the lot accepted, main moved elsewhere: the whole pass, then the integration', () => {
    const d = depot();
    d.ecrire('a.txt', lignes('COPIE'));
    d.relu('ACCEPTÉ', ['a.txt']);
    d.avance('b.txt', 'b\nMAIN\n');
    const passe = laPasseFinale(d.ctx);
    expect(passe.restreinte).toBeNull();
    expect(leLotAccepte(d.ctx, passe.arbre)).toBe(true);
  });

  it('the lot accepted, then changed after the advance: one more review', () => {
    const d = depot();
    d.ecrire('a.txt', lignes('COPIE'));
    d.relu('ACCEPTÉ', ['a.txt']);
    d.avance('b.txt', 'b\nMAIN\n');
    d.ecrire('c.txt', 'c\n');
    const passe = laPasseFinale(d.ctx);
    expect(passe.restreinte).not.toBeNull();
    expect(leLotAccepte(d.ctx, passe.arbre)).toBe(false);
  });
});
