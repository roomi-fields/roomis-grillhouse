// Un conflit de l'avance sur les fichiers des deux rôles, de bout en bout du déroulé
// (src/temporal/circuit/deroule.ts : la préparation de la passe, `avantLaPasse` de
// scripts/circuit.mjs, puis la décision de l'étape, `transition` de scripts/transitions.mjs) : le
// testwriter relancé revient à la passe, sans preuve du rouge ; la passe relance le développeur
// tant qu'un de ses fichiers garde ses marques, l'index git dût-il ne plus le dire ; puis elle joue.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { avantLaPasse, suiteDuConflit } from '../../scripts/circuit.mjs';
import { transition } from '../../scripts/transitions.mjs';

interface Etat {
  etape: string;
  tentative: number;
  rapport: string | null;
  finale: boolean;
}
interface Pointe {
  arret?: { nom: string; rapport: string };
  conflit?: { fichiers: string[]; roles: string[]; rapport: string };
  avancee?: boolean;
}
interface Decision {
  besoin?: { fait: string };
  suivant: Etat;
  memoire: Record<string, unknown>;
  arret?: { nom: string };
}
const avant = avantLaPasse as unknown as (
  ctx: Record<string, unknown>,
  etape: string,
  regeneration: unknown,
  env: NodeJS.ProcessEnv,
  o: { estUnTest: (f: string) => unknown }
) => Pointe;
const suite = suiteDuConflit as unknown as (
  ctx: Record<string, unknown>,
  etat: Etat,
  conflit: { fichiers: string[]; roles: string[] }
) => { role: string; memoire: Record<string, unknown> };
const decider = transition as unknown as (e: {
  etat: Etat;
  memoire: Record<string, unknown>;
  ticket: object;
  faits: Record<string, unknown>;
}) => Decision;

const estUnTest = (f: string) => (f.endsWith('.spec.txt') ? {} : null);
const TICKET = { id: 'demo-1', paquets: ['.'], sorte: null, copie: '/copie' };

// La décision de l'étape <etat>, chaque fait demandé pris dans <faits>.
function decision(etat: Etat, memoire: Record<string, unknown>, faits: Record<string, unknown>) {
  const lus: Record<string, unknown> = {};
  for (let i = 0; i < 20; i++) {
    const d = decider({ etat, memoire, ticket: TICKET, faits: lus });
    if (!d.besoin) {
      return d;
    }
    if (!(d.besoin.fait in faits)) {
      throw new Error(`fait non donné : ${d.besoin.fait}`);
    }
    lus[d.besoin.fait] = faits[d.besoin.fait];
  }
  throw new Error('trop de faits');
}

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-conflit-mixte-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};
const lignes = (d: string) => `l1\n${d}\nl3\nl4\nl5\nl6\nl7\n`;
const MARQUES = /^(<{7}|>{7}) /m;

// Une copie dont l'avance sur main laisse des conflits sur <fichiers>.
function copieEnConflit(fichiers: string[]) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  writeFileSync(path.join(racine, '.gitignore'), '.claude/worktrees/\n');
  for (const f of fichiers) {
    writeFileSync(path.join(racine, f), lignes('base'));
  }
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'base');
  const copie = path.join(racine, '.claude/worktrees/demo-1');
  git(racine, 'worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
  for (const f of fichiers) {
    writeFileSync(path.join(racine, f), lignes('MAIN'));
  }
  git(racine, 'commit', '-qam', 'main');
  for (const f of fichiers) {
    writeFileSync(path.join(copie, f), lignes('COPIE'));
  }
  return { racine, copie, ticket: 'demo-1', journal: `${copie}.log` } as Record<string, unknown> & {
    racine: string;
    copie: string;
  };
}

const PASSE: Etat = { etape: 'controles', tentative: 0, rapport: null, finale: false };

describe('un conflit sur les fichiers des deux rôles se lève rôle par rôle, la passe entre eux', () => {
  it('le testwriter revient à la passe, qui relance le développeur, puis la passe joue', () => {
    const ctx = copieEnConflit(['x.spec.txt', 'src.txt']);
    let memoire: Record<string, unknown> = {};
    const garder = (m: Record<string, unknown>) => {
      memoire = { ...memoire, ...m };
      Object.assign(ctx, memoire);
    };

    // La passe rencontre le conflit : le testwriter d'abord.
    const p1 = avant(ctx, 'controles', null, process.env, { estUnTest });
    expect(p1.arret).toBeUndefined();
    expect(p1.conflit?.roles).toEqual(['testwriter', 'developpeur']);
    const s1 = suite(ctx, PASSE, p1.conflit!);
    expect(s1.role).toBe('testwriter');
    garder(s1.memoire);

    // Le testwriter résout son fichier ; sa séance revient à la passe, sans preuve du rouge.
    writeFileSync(path.join(ctx.copie, 'x.spec.txt'), lignes('RESOLU-TEST'));
    const d1 = decision(
      { etape: 'testwriter', tentative: 1, rapport: p1.conflit!.rapport, finale: false },
      memoire,
      { mecanique: false, sansTests: false, seance: { statut: 'FAIT' }, lecture: null }
    );
    expect(d1.arret).toBeUndefined();
    expect(d1.suivant).toMatchObject({ etape: 'controles', tentative: 0, finale: false });
    garder(d1.memoire);

    // La passe revoit la copie : le fichier du développeur garde ses marques, le développeur part.
    const p2 = avant(ctx, 'controles', null, process.env, { estUnTest });
    expect(p2.arret).toBeUndefined();
    expect(p2.conflit?.roles).toEqual(['developpeur']);
    expect(p2.conflit?.fichiers).toEqual(['src.txt']);
    const s2 = suite(ctx, PASSE, p2.conflit!);
    expect(s2.role).toBe('developpeur');
    garder(s2.memoire);

    // Le développeur résout le sien ; sa séance revient à la passe.
    writeFileSync(path.join(ctx.copie, 'src.txt'), lignes('RESOLU-CODE'));
    const d2 = decision(
      { etape: 'developpeur', tentative: 1, rapport: p2.conflit!.rapport, finale: false },
      memoire,
      {
        empreinteAvant: 'a',
        seance: { statut: 'FAIT' },
        renvoi: null,
        lecture: null,
        empreinte: 'b',
      }
    );
    expect(d2.arret).toBeUndefined();
    expect(d2.suivant).toMatchObject({ etape: 'controles', tentative: 0, finale: false });
    garder(d2.memoire);

    // La passe joue : la copie est sur main, le travail des deux rôles en place.
    const p3 = avant(ctx, 'controles', null, process.env, { estUnTest });
    expect(p3.arret).toBeUndefined();
    expect(p3.conflit).toBeUndefined();
    expect(git(ctx.copie, 'rev-parse', 'HEAD')).toBe(git(ctx.racine, 'rev-parse', 'HEAD'));
    expect(readFileSync(path.join(ctx.copie, 'x.spec.txt'), 'utf8')).toBe(lignes('RESOLU-TEST'));
    expect(readFileSync(path.join(ctx.copie, 'src.txt'), 'utf8')).toBe(lignes('RESOLU-CODE'));
  });

  it('un fichier qui garde ses marques, mis dans l’index sans être résolu, reste en conflit', () => {
    const ctx = copieEnConflit(['x.spec.txt', 'src.txt']);
    const p1 = avant(ctx, 'controles', null, process.env, { estUnTest });
    const s1 = suite(ctx, PASSE, p1.conflit!);
    Object.assign(ctx, s1.memoire);

    // Le testwriter résout le sien et met toute la copie dans l'index : git ne voit plus de conflit.
    writeFileSync(path.join(ctx.copie, 'x.spec.txt'), lignes('RESOLU-TEST'));
    git(ctx.copie, 'add', '-A');
    expect(git(ctx.copie, 'diff', '--name-only', '--diff-filter=U')).toBe('');
    expect(readFileSync(path.join(ctx.copie, 'src.txt'), 'utf8')).toMatch(MARQUES);

    const p2 = avant(ctx, 'controles', null, process.env, { estUnTest });
    expect(p2.arret).toBeUndefined();
    expect(p2.conflit?.roles).toEqual(['developpeur']);
    expect(p2.conflit?.fichiers).toEqual(['src.txt']);
    expect(readFileSync(path.join(ctx.copie, 'src.txt'), 'utf8')).toMatch(MARQUES);
  });

  it('le testwriter relancé qui laisse son fichier marqué fait monter l’arrêt, le développeur non relancé', () => {
    const ctx = copieEnConflit(['x.spec.txt', 'src.txt']);
    const p1 = avant(ctx, 'controles', null, process.env, { estUnTest });
    Object.assign(ctx, suite(ctx, PASSE, p1.conflit!).memoire);
    const p2 = avant(ctx, 'controles', null, process.env, { estUnTest });
    expect(p2.conflit).toBeUndefined();
    expect(p2.arret?.nom).toBe('lancement');
    expect(p2.arret?.rapport).toMatch(/^ {2}x\.spec\.txt$/m);
  });
});
