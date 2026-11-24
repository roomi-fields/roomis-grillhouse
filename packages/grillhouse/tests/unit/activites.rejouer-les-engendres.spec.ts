// `rejouerLesEngendres` (scripts/activites.mjs) et `avantLaPasse` (scripts/circuit.mjs) : un fichier
// engendré (`grillhouse.engendres`) dont un motif `lit` couvre un fichier que le lot change est
// rejoué dans la copie avant la passe qui joue les tests du lot, comme un graphe de construction
// (Bazel, Nx, Turborepo) construit une sortie avant les tests qui la lisent. Des tests moyens : un
// dépôt git d'essai et de petites lignes de shell.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { declarerLeLangage } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { afterAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import { avantLaPasse } from '../../scripts/circuit.mjs';
import { Arret } from '../../scripts/ticket-du-circuit.mjs';
import { depotDeReferences } from './references-essai.js';
import type { Ctx } from './preuve-essai.js';

const rejouer = activites.rejouerLesEngendres as (ctx: object) => unknown;
const avant = avantLaPasse as unknown as (
  ctx: object,
  etape: string,
  regeneration: unknown
) => { arret?: { nom: string } };

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'activites-rejouer-les-engendres-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const engendre = (commande: string) => ({
  nom: 'les sommes',
  commande,
  fichiers: ['SUMS'],
  lit: ['cas'],
  gardes: [],
  entiers: ['SUMS'],
});
const SOMMES = 'ls cas | sort > SUMS';

const lignes: string[] = [];
function copie(commande = SOMMES): Ctx & { engendres: object[] } {
  const ctx = depotDeReferences(ESSAIS, [], { 'cas/a.txt': 'a\n', SUMS: 'a.txt\n' });
  lignes.length = 0;
  return Object.assign(ctx, {
    engendres: [engendre(commande)],
    bdSous: (_auteur: string, ...a: string[]) => {
      lignes.push(a.join(' '));
      return { status: 0, stdout: '', stderr: '' };
    },
  });
}
const lire = (ctx: Ctx, f: string) => readFileSync(path.join(ctx.copie, f), 'utf8');

describe('le rejeu des fichiers engendrés que le lot nourrit', () => {
  it('écrit le fichier engendré quand le lot change un fichier que sa déclaration lit', () => {
    const ctx = copie();
    writeFileSync(path.join(ctx.copie, 'cas/b.txt'), 'b\n');
    rejouer(ctx);
    expect(lire(ctx, 'SUMS')).toBe('a.txt\nb.txt\n');
  });

  it('ne joue aucune commande quand le lot ne change rien de ce qu’elle lit', () => {
    const ctx = copie('echo joue > SUMS');
    writeFileSync(path.join(ctx.copie, 'autre.txt'), 'x\n');
    expect(rejouer(ctx)).toBeNull();
    expect(lire(ctx, 'SUMS')).toBe('a.txt\n');
  });

  it('arrête à « references » quand la commande échoue', () => {
    const ctx = copie('exit 3');
    writeFileSync(path.join(ctx.copie, 'cas/b.txt'), 'b\n');
    try {
      rejouer(ctx);
      throw new Error("aucun arrêt n'a été levé");
    } catch (e) {
      expect(e).toBeInstanceOf(Arret);
      expect((e as Arret).nom).toBe('references');
    }
  });

  it('est joué avant la preuve du rouge', () => {
    const ctx = copie();
    writeFileSync(path.join(ctx.copie, 'cas/b.txt'), 'b\n');
    expect(avant(ctx, 'preuve', null).arret).toBeUndefined();
    expect(lire(ctx, 'SUMS')).toBe('a.txt\nb.txt\n');
    expect(lignes.join('\n')).toContain('rejeu-des-engendres');
  });

  it('monte l’arrêt « references » de la commande qui échoue, avant la preuve', () => {
    const ctx = copie('exit 3');
    writeFileSync(path.join(ctx.copie, 'cas/b.txt'), 'b\n');
    expect(avant(ctx, 'preuve', null).arret?.nom).toBe('references');
  });
});

describe('le rejeu des fichiers engendrés aux contrôles et à la passe finale', () => {
  // Un dépôt d'essai (main) et la copie du ticket sous .claude/worktrees, comme le lanceur la fait.
  function depotEtCopie(commande: string) {
    const racine = mkdtempSync(path.join(ESSAIS, 'main-'));
    const git = (dossier: string, ...a: string[]) =>
      spawnSync('git', ['-C', dossier, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
        encoding: 'utf8',
      });
    git(racine, 'init', '-q', '-b', 'main');
    mkdirSync(path.join(racine, 'cas'));
    writeFileSync(path.join(racine, 'cas/a.txt'), 'a\n');
    writeFileSync(path.join(racine, 'SUMS'), 'a.txt\n');
    writeFileSync(path.join(racine, '.gitignore'), '.claude/worktrees/\nnode_modules/\n');
    declarerLeLangage(racine);
    git(racine, 'add', '-A');
    git(racine, 'commit', '-q', '-m', 'base');
    const copie = path.join(racine, '.claude/worktrees/demo-1');
    git(racine, 'worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
    lignes.length = 0;
    const tmp = mkdtempSync(path.join(ESSAIS, 'tmp-'));
    return {
      racine,
      copie,
      ticket: 'demo-1',
      journal: `${copie}.log`,
      tmp,
      base: { dossier: tmp },
      paquets: ['.'],
      engendres: [engendre(commande)],
      bdSous: (_auteur: string, ...a: string[]) => {
        lignes.push(a.join(' '));
        return { status: 0, stdout: '', stderr: '' };
      },
    };
  }

  it('écrit le fichier engendré que le lot nourrit avant les contrôles', () => {
    const ctx = depotEtCopie(SOMMES);
    writeFileSync(path.join(ctx.copie, 'cas/b.txt'), 'b\n');
    expect(avant(ctx, 'controles', null).arret).toBeUndefined();
    expect(readFileSync(path.join(ctx.copie, 'SUMS'), 'utf8')).toBe('a.txt\nb.txt\n');
    expect(lignes.join('\n')).toContain('rejeu-des-engendres');
  });

  it('monte l’arrêt « references » de la commande qui échoue, avant les contrôles', () => {
    const ctx = depotEtCopie('exit 3');
    writeFileSync(path.join(ctx.copie, 'cas/b.txt'), 'b\n');
    expect(avant(ctx, 'controles', null).arret?.nom).toBe('references');
  });
});
