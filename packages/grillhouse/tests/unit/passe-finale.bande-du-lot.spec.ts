// The final pass plays the band of the lot: from its base (the copy's HEAD) to its top, never the
// whole repository (Bazel and TAP play the reverse-dependency closure of the change; Nx `affected`).
// Each case plays the real git in a repository of trial.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import { avancer } from '../../scripts/enveloppe/travail-de-la-copie.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'passe-finale-bande-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const laPasseFinale = activites.laPasseFinale as (ctx: object) => {
  arbre: string;
  restreinte: { avant: string; apres: string } | null;
};
const leLotGarde = activites.leLotGarde as (ctx: object) => { lot: { commit: string } | null };

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};

function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  writeFileSync(path.join(racine, 'a.txt'), 'a\n');
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
  const avance = (fichier: string, contenu: string) => {
    writeFileSync(path.join(racine, fichier), contenu);
    git(racine, 'commit', '-qam', `main ${fichier}`);
    const r = avancer(copie, git(racine, 'rev-parse', 'HEAD'));
    if (!r.ok) {
      throw new Error(r.message);
    }
  };
  const relu = (verdict: string) => {
    const { lot } = leLotGarde(ctx);
    appendFileSync(
      ctx.fiches,
      `${JSON.stringify({ role: 'relecteur', fiche: { verdict }, lot: { ...lot, fichiers: ['a.txt'] } })}\n`
    );
  };
  const fichiersDeLaBande = (b: { avant: string; apres: string }) =>
    git(copie, 'diff', '--name-only', b.avant, b.apres);
  return { racine, copie, ctx, ecrire, avance, relu, fichiersDeLaBande };
}

describe('the final pass plays the band of the lot', () => {
  it('before any review, the band runs from the base of the lot to its top', () => {
    const d = depot();
    d.ecrire('a.txt', 'COPIE\n');
    d.ecrire('c.txt', 'c\n');
    const { restreinte } = laPasseFinale(d.ctx);
    expect(restreinte).not.toBeNull();
    expect(restreinte!.avant).toBe(git(d.copie, 'rev-parse', 'HEAD'));
    expect(d.fichiersDeLaBande(restreinte!)).toBe('a.txt\nc.txt');
  });

  it('the band of a lot confined to one file holds that file alone, nothing of the rest', () => {
    const d = depot();
    d.ecrire('b.txt', 'B\n');
    const { restreinte } = laPasseFinale(d.ctx);
    expect(restreinte).not.toBeNull();
    expect(d.fichiersDeLaBande(restreinte!)).toBe('b.txt');
  });

  it('the band is read from its merge base, the base of the lot', () => {
    const d = depot();
    d.ecrire('a.txt', 'COPIE\n');
    const { restreinte } = laPasseFinale(d.ctx);
    expect(git(d.copie, 'merge-base', restreinte!.avant, restreinte!.apres)).toBe(
      restreinte!.avant
    );
  });

  it('after a review that did not accept the lot, the band still runs from the base of the lot', () => {
    const d = depot();
    d.ecrire('a.txt', 'COPIE\n');
    d.relu('RENDU');
    d.ecrire('c.txt', 'c\n');
    const { restreinte } = laPasseFinale(d.ctx);
    expect(restreinte).not.toBeNull();
    expect(restreinte!.avant).toBe(git(d.copie, 'rev-parse', 'HEAD'));
    expect(d.fichiersDeLaBande(restreinte!)).toBe('a.txt\nc.txt');
  });

  it('on a lot the last review accepted, the band is the base to the lot, not the whole copy', () => {
    const d = depot();
    d.ecrire('a.txt', 'COPIE\n');
    d.relu('ACCEPTÉ');
    const { restreinte } = laPasseFinale(d.ctx);
    expect(restreinte).not.toBeNull();
    expect(restreinte!.avant).toBe(git(d.copie, 'rev-parse', 'HEAD'));
    expect(d.fichiersDeLaBande(restreinte!)).toBe('a.txt');
  });

  it('on an accepted lot after an advance of the copy, the band is still the base to the lot', () => {
    const d = depot();
    d.ecrire('a.txt', 'COPIE\n');
    d.relu('ACCEPTÉ');
    d.avance('b.txt', 'b\nMAIN\n');
    const { restreinte } = laPasseFinale(d.ctx);
    expect(restreinte).not.toBeNull();
    expect(d.fichiersDeLaBande(restreinte!)).toBe('a.txt');
  });

  it('when main advanced, the band holds the work of the ticket, never what main changed', () => {
    const d = depot();
    d.ecrire('a.txt', 'COPIE\n');
    d.avance('b.txt', 'b\nMAIN\n');
    const { restreinte } = laPasseFinale(d.ctx);
    expect(restreinte).not.toBeNull();
    expect(restreinte!.avant).toBe(git(d.copie, 'rev-parse', 'HEAD'));
    expect(d.fichiersDeLaBande(restreinte!)).toBe('a.txt');
  });

  // Witness: BPScript (bp-mono-vbwf.320.2.2.1.5): a file added to a directory of the root that a
  // package out of the plan reads, its test red only at the integration.
  describe('the band plays the packages whose tests read a path it changes', () => {
    const filtresDeLaBande = activites.filtresDeLaBande as (
      ctx: object,
      liste: { dossier: string; pkg: { name?: string } }[],
      restreinte: { avant: string; apres: string }
    ) => string[];
    const lecteur = (d: ReturnType<typeof depot>) => {
      mkdirSync(path.join(d.copie, 'packages/loader'), { recursive: true });
      writeFileSync(
        path.join(d.copie, 'packages/loader/package.json'),
        JSON.stringify({ name: '020-loader', grillhouse: { lit: ['libraries'] } })
      );
      mkdirSync(path.join(d.copie, 'libraries'), { recursive: true });
      writeFileSync(path.join(d.copie, 'libraries/base.bp'), 'base\n');
      git(d.copie, 'add', '-A');
      git(d.copie, 'commit', '-qm', 'loader');
      return [
        { dossier: 'packages/loader', pkg: { name: '020-loader' } },
        { dossier: 'packages/forms', pkg: { name: '000-forms' } },
      ];
    };

    it('a lot that adds a file under a path a package declares it reads plays that package and its dependents', () => {
      const d = depot();
      const liste = lecteur(d);
      d.ecrire('libraries/notes.txt', 'notes\n');
      const { restreinte } = laPasseFinale(d.ctx);
      expect(filtresDeLaBande(d.ctx, liste, restreinte!)).toEqual([
        '--',
        `--filter=...[${restreinte!.avant}...${restreinte!.apres}]`,
        '--filter=...020-loader',
        '--filter=//',
      ]);
    });

    it('a lot that changes no path a package reads plays the band and the root alone', () => {
      const d = depot();
      const liste = lecteur(d);
      d.ecrire('a.txt', 'COPIE\n');
      const { restreinte } = laPasseFinale(d.ctx);
      expect(filtresDeLaBande(d.ctx, liste, restreinte!)).toEqual([
        '--',
        `--filter=...[${restreinte!.avant}...${restreinte!.apres}]`,
        '--filter=//',
      ]);
    });
  });

  it('when git cannot keep the lot, the pass rejects naming git and never returns a null band', () => {
    const d = depot();
    const horsDepot = mkdtempSync(path.join(ESSAIS, 'hors-depot-'));
    const ctx = { ...d.ctx, copie: horsDepot };
    expect(() => laPasseFinale(ctx)).toThrow(/git/i);
  });
});
