// Les rouges de style que `rougesDe` (scripts/activites.mjs) lit dans les résultats des contrôles :
// la mise en forme et le lint se jouent par paquet (`<paquet>#lint`, `<paquet>#format:check`) et à la
// racine (`//#lint`). Un rouge d'un paquet du plan est nommé par sa tâche et revient à
// l'auteur du fichier ; celui d'un paquet hors du plan porte son paquet en `horsTitre`, nommé par sa
// tâche ; celui de la racine n'est dans aucun paquet. Des tests moyens : une copie d'essai et le
// résumé d'un Turborepo écrit à la main.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import { composantsDe } from '../../scripts/ticket-du-circuit.mjs';
import { copieEssai, type Ctx } from './preuve-essai.js';

interface Rouge {
  texte: string;
  fichier: string | null;
  dansLePlan: boolean;
  paquet: string | null;
  horsTitre: string | null;
  joue: string | null;
}
type Liste = { dossier: string; pkg: { name: string }; hors: boolean }[];
const rougesDe = activites.rougesDe as (
  ctx: Ctx & { ecartes: string[] },
  liste: Liste,
  c: { args: string[]; code: number; dossier: string }
) => { rouges: Rouge[]; avertissements: string[] };

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'controles-rouges-de-style-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

/** Une copie dont le plan est le seul paquet forms ; binder, qui lit forms, est hors du plan. */
function copie() {
  const ctx = copieEssai(ESSAIS);
  declarerLesLangages(ctx.copie, {
    'packages/forms': 'typescript',
    'packages/binder': 'typescript',
  });
  for (const [dossier, nom] of [
    ['forms', '000-forms'],
    ['binder', '030-binder'],
  ]) {
    mkdirSync(path.join(ctx.copie, 'packages', dossier!), { recursive: true });
    writeFileSync(
      path.join(ctx.copie, 'packages', dossier!, 'package.json'),
      JSON.stringify({ name: nom, type: 'module', scripts: { lint: 'x', 'format:check': 'x' } })
    );
  }
  return { ...ctx, paquets: ['packages/forms'], ecartes: [] };
}

interface Tache {
  paquet: string;
  dossier: string;
  script: string;
  code: number;
}
const tache = (paquet: string, dossier: string, script: string, code: number): Tache => ({
  paquet,
  dossier,
  script,
  code,
});

/** Le résumé d'un Turborepo des <taches> (ni rapport de test ni constat de garde) sous <ctx>. */
function resultats(taches: Tache[]) {
  const dossier = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  mkdirSync(path.join(dossier, 'turbo'), { recursive: true });
  writeFileSync(
    path.join(dossier, 'turbo', 'run.json'),
    JSON.stringify({
      tasks: taches.map(t => ({
        taskId: `${t.paquet}#${t.script}`,
        package: t.paquet,
        directory: t.dossier,
        task: t.script,
        execution: { exitCode: t.code },
        cache: { status: 'MISS' },
        logFile: null,
      })),
    })
  );
  return dossier;
}

function jouer(taches: Tache[]) {
  const ctx = copie();
  const liste = composantsDe(ctx.copie).filter(p => !p.hors) as Liste;
  return rougesDe(ctx, liste, { args: ['run', 'lint'], code: 1, dossier: resultats(taches) })
    .rouges;
}

describe('le lint d’un paquet du plan', () => {
  it('est nommé par sa tâche, dans le plan, à l’auteur du paquet, sans la mise en forme verte', () => {
    const rouges = jouer([
      tache('000-forms', 'packages/forms', 'lint', 1),
      tache('000-forms', 'packages/forms', 'format:check', 0),
    ]);
    expect(rouges).toHaveLength(1);
    expect(rouges[0]!.texte).toContain('tâche 000-forms#lint rouge (code 1)');
    expect(rouges.some(r => r.texte.includes('000-forms#format:check'))).toBe(false);
    expect(rouges[0]).toMatchObject({ dansLePlan: true, paquet: '000-forms', horsTitre: null });
  });
});

describe('la mise en forme d’un paquet du plan', () => {
  it('est nommée par sa tâche, dans le plan, sans le lint vert', () => {
    const rouges = jouer([
      tache('000-forms', 'packages/forms', 'lint', 0),
      tache('000-forms', 'packages/forms', 'format:check', 1),
    ]);
    expect(rouges).toHaveLength(1);
    expect(rouges[0]!.texte).toContain('tâche 000-forms#format:check rouge (code 1)');
    expect(rouges[0]).toMatchObject({ dansLePlan: true, paquet: '000-forms', horsTitre: null });
  });
});

describe('le lint et la mise en forme d’un paquet hors du plan', () => {
  it.each(['lint', 'format:check'])(
    'le %s rouge porte son paquet et sa tâche en « hors du plan », hors du plan',
    script => {
      const rouges = jouer([tache('030-binder', 'packages/binder', script, 1)]);
      expect(rouges).toHaveLength(1);
      expect(rouges[0]).toMatchObject({
        dansLePlan: false,
        paquet: '030-binder',
        horsTitre: `030-binder#${script}`,
      });
    }
  );
});

describe('le lint de la racine', () => {
  it('est une tâche « //#lint » de nul paquet, hors de tout paquet du plan', () => {
    const rouges = jouer([tache('//', '.', 'lint', 1)]);
    expect(rouges).toHaveLength(1);
    expect(rouges[0]!.texte).toContain('tâche //#lint rouge (code 1)');
    expect(rouges[0]).toMatchObject({ dansLePlan: false, paquet: null, horsTitre: null });
  });

  it('se distingue du lint d’un paquet du plan rouge en même temps', () => {
    const rouges = jouer([
      tache('//', '.', 'lint', 1),
      tache('000-forms', 'packages/forms', 'lint', 1),
    ]);
    expect(rouges.map(r => r.paquet).sort()).toEqual(['000-forms', null]);
    expect(rouges.find(r => r.paquet === null)!.dansLePlan).toBe(false);
    expect(rouges.find(r => r.paquet === '000-forms')!.dansLePlan).toBe(true);
  });
});

describe('des tâches de style vertes', () => {
  it('ne rendent aucun rouge de style quand la commande est verte', () => {
    const ctx = copie();
    const liste = composantsDe(ctx.copie).filter(p => !p.hors) as Liste;
    const { rouges } = rougesDe(ctx, liste, {
      args: ['run', 'lint'],
      code: 0,
      dossier: resultats([tache('000-forms', 'packages/forms', 'lint', 0)]),
    });
    expect(rouges).toEqual([]);
  });
});
