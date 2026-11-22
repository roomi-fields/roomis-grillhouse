// `rougesDe` (scripts/activites.mjs) : les rouges et les avertissements que les contrôles lisent
// dans le SARIF des gardes et le résumé de Turborepo. Un constat de niveau « error » échoue ; un
// avertissement se montre sans échouer (SARIF 2.1.0). Des tests moyens : une copie d'essai et des
// résultats écrits à la main, sans Turborepo.
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
  gardes?: string[];
  dansLePlan: boolean;
  paquet: string | null;
  horsTitre: string | null;
}
type Liste = { dossier: string; pkg: { name: string }; hors: boolean }[];
const rougesDe = activites.rougesDe as (
  ctx: Ctx & { ecartes: string[] },
  liste: Liste,
  c: { args: string[]; code: number; dossier: string }
) => { rouges: Rouge[]; avertissements: string[] };

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'activites-rouges-de-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Constat {
  garde: string;
  fichier?: string;
  ligne?: number;
  niveau?: 'error' | 'warning';
  message: string;
}
interface Tache {
  paquet: string;
  dossier: string;
  script: string;
  code: number;
}

/** Une copie dont le plan est le seul paquet forms ; binder est hors du plan. */
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
      JSON.stringify({ name: nom, type: 'module' })
    );
  }
  return { ...ctx, paquets: ['packages/forms'], ecartes: [] };
}

/** Les résultats d'une passe : un constat SARIF par garde, un résumé de Turborepo des tâches. */
function resultats(constats: Constat[], taches: Tache[] = []) {
  const dossier = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  mkdirSync(path.join(dossier, 'sarif'), { recursive: true });
  mkdirSync(path.join(dossier, 'turbo'), { recursive: true });
  const gardes = [...new Set(constats.map(k => k.garde))];
  for (const garde of gardes) {
    writeFileSync(
      path.join(dossier, 'sarif', `${garde}.sarif`),
      JSON.stringify({
        version: '2.1.0',
        runs: [
          {
            tool: { driver: { name: garde } },
            results: constats
              .filter(k => k.garde === garde)
              .map(k => ({
                ruleId: k.garde,
                level: k.niveau ?? 'error',
                message: { text: k.message },
                ...(k.fichier
                  ? {
                      locations: [
                        {
                          physicalLocation: {
                            artifactLocation: { uri: k.fichier },
                            region: { startLine: k.ligne ?? 1 },
                          },
                        },
                      ],
                    }
                  : {}),
              })),
          },
        ],
      })
    );
  }
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

function lire(constats: Constat[], taches: Tache[] = []) {
  const ctx = copie();
  const liste = composantsDe(ctx.copie).filter(p => !p.hors) as Liste;
  return rougesDe(ctx, liste, {
    args: ['run', 'verifier'],
    code: 1,
    dossier: resultats(constats, taches),
  });
}

const MOT = (n: number): Constat => ({
  garde: 'mots',
  fichier: 'packages/forms/src/index.mjs',
  ligne: n,
  niveau: 'warning',
  message: `le mot n° ${n} déjà présent sur une ligne touchée`,
});
const PLAFOND: Constat = {
  garde: 'mots',
  fichier: 'packages/binder/plafond.txt',
  ligne: 1,
  message: 'le plafond reste au-dessus de son compte',
};
const GARDES_ROUGE: Tache = { paquet: '//', dossier: '.', script: 'gardes', code: 1 };

describe('les avertissements d’une garde', () => {
  it('se listent à part, sans entrer dans les rouges, à côté d’un refus de la même garde', () => {
    const { rouges, avertissements } = lire([
      PLAFOND,
      ...Array.from({ length: 8 }, (_, i) => MOT(i + 1)),
    ]);
    expect(rouges).toHaveLength(1);
    expect(rouges[0]!.texte).toContain('le plafond reste au-dessus de son compte');
    expect(avertissements).toHaveLength(8);
    expect(avertissements[7]).toContain('le mot n° 8 déjà présent sur une ligne touchée');
    expect(avertissements.every(a => a.startsWith('warning '))).toBe(true);
  });

  it('seuls, sous une commande rouge, ne laissent qu’un rouge de la commande', () => {
    const { rouges, avertissements } = lire([MOT(1), MOT(2)]);
    expect(avertissements).toHaveLength(2);
    expect(rouges.map(r => r.texte).join('\n')).not.toContain('déjà présent');
    expect(rouges).toHaveLength(1);
    expect(rouges[0]!.texte).toContain('rouge (code 1), sans résultat qui situe son rouge');
  });

  it('une commande verte rend ses avertissements sans aucun rouge', () => {
    const ctx = copie();
    const liste = composantsDe(ctx.copie).filter(p => !p.hors) as Liste;
    const r = rougesDe(ctx, liste, {
      args: ['run', 'verifier'],
      code: 0,
      dossier: resultats([MOT(1)]),
    });
    expect(r.rouges).toEqual([]);
    expect(r.avertissements).toHaveLength(1);
  });
});

describe('la tâche `gardes` rouge', () => {
  it('sans constat de niveau error garde sa ligne de tâche rouge, sans que l’avertissement devienne un rouge', () => {
    const { rouges, avertissements } = lire([MOT(1), MOT(2)], [GARDES_ROUGE]);
    const textes = rouges.map(r => r.texte);
    expect(textes).toHaveLength(1);
    expect(textes[0]).toContain('tâche //#gardes rouge (code 1)');
    expect(textes.join('\n')).not.toContain('déjà présent sur une ligne touchée');
    expect(avertissements).toHaveLength(2);
    expect(rouges[0]).toMatchObject({ dansLePlan: false, paquet: null });
  });

  it('ne double pas le constat d’une garde du projet par sa ligne de tâche', () => {
    const { rouges } = lire([PLAFOND], [GARDES_ROUGE]);
    expect(rouges.map(r => r.texte)).toEqual([expect.stringContaining('constat mots')]);
  });
});

describe('le constat d’une garde de référence', () => {
  it('sur un fichier que nul paquet du plan ne tient reste hors du plan, sans paquet', () => {
    const { rouges } = lire([
      { garde: 'reference', fichier: 'reference.txt', message: 'la référence dit 2, la mesure 4.' },
    ]);
    expect(rouges).toHaveLength(1);
    expect(rouges[0]).toMatchObject({
      fichier: 'reference.txt',
      gardes: ['reference'],
      dansLePlan: false,
      paquet: null,
      horsTitre: null,
    });
  });

  it('se distingue d’un constat sur un paquet hors du plan, qui nomme son paquet', () => {
    const { rouges } = lire([
      { garde: 'reference', fichier: 'reference.txt', message: 'périmée' },
      { garde: 'autre', fichier: 'packages/binder/src/a.mjs', message: 'binder rouge' },
    ]);
    const binder = rouges.find(r => r.texte.includes('binder rouge'))!;
    expect(binder).toMatchObject({
      dansLePlan: false,
      paquet: '030-binder',
      horsTitre: '030-binder',
    });
    expect(rouges.find(r => r.fichier === 'reference.txt')!.horsTitre).toBeNull();
  });

  it('sur le code d’un paquet du plan est dans le plan', () => {
    const { rouges } = lire([
      { garde: 'mots', fichier: 'packages/forms/src/index.mjs', message: 'forms compte 4' },
    ]);
    expect(rouges[0]).toMatchObject({ dansLePlan: true, paquet: '000-forms', horsTitre: null });
  });
});
