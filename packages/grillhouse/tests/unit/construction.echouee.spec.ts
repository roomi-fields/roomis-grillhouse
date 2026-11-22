// La construction en échec d'un paquet du plan (`constructionsEchouees`, scripts/activites.mjs) : un
// rouge de la preuve, nommé « construction de <paquet> » avec son journal, dont les tests se jouent
// aux contrôles, après le développeur. La construction en échec d'un paquet hors du plan n'en est
// pas un (`dansLePlan`) : les fichiers du plan restent « ne se charge pas ». Témoin : BPScript
// (bp-mono-vbwf.320.2.2.1.5), la preuve de 030-binder ne voyait que la construction de 040-checker.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import { composantsDe } from '../../scripts/ticket-du-circuit.mjs';
import { copieEssai, mesureDe, preuve, resultatDe, run, type Ctx } from './preuve-essai.js';

type Liste = { dossier: string; pkg: { name: string }; hors: boolean }[];
const constructionsEchouees = activites.constructionsEchouees as (
  ctx: Ctx,
  liste: Liste,
  dossier: string
) => { nom: string; erreur: string }[];

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'construction-echouee-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ERREUR = "src/x.ts(1,1): error TS2741: Property 'champ' is missing in type 'Forme'.";
const TEST = 'packages/binder/test/mesure.test.mjs';

// A copy of two packages, forms and binder, the plan naming <plan>, and the file of the lot
// `packages/binder/test/mesure.test.mjs`.
function copie(plan: string[]): { ctx: Ctx; liste: Liste } {
  const ctx = copieEssai(ESSAIS, { [TEST]: '// un test du lot\n' });
  declarerLesLangages(ctx.copie, {
    'packages/forms': 'typescript',
    'packages/binder': 'typescript',
  });
  for (const [dossier, nom] of [
    ['forms', '000-forms'],
    ['binder', '030-binder'],
  ]) {
    mkdirSync(path.join(ctx.copie, 'packages', dossier), { recursive: true });
    writeFileSync(
      path.join(ctx.copie, 'packages', dossier, 'package.json'),
      JSON.stringify({ name: nom, type: 'module' })
    );
  }
  ctx.paquets = plan;
  return { ctx, liste: composantsDe(ctx.copie).filter(p => !p.hors) as Liste };
}

// The results directory of a run of Turborepo whose tasks <taches> (`{ paquet, dossier, script,
// code }`) each logged <ERREUR> in a file of the copy.
function resultats(
  ctx: Ctx,
  taches: { paquet: string; dossier: string; script: string; code: number | null }[]
) {
  const dossier = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  mkdirSync(path.join(dossier, 'turbo'), { recursive: true });
  writeFileSync(
    path.join(dossier, 'turbo', 'run.json'),
    JSON.stringify({
      tasks: taches.map(t => {
        const journal = `${t.paquet}-${t.script}.log`;
        writeFileSync(path.join(ctx.copie, journal), `${ERREUR}\n`);
        return {
          taskId: `${t.paquet}#${t.script}`,
          package: t.paquet,
          directory: t.dossier,
          task: t.script,
          execution: { exitCode: t.code },
          cache: { status: 'MISS' },
          logFile: journal,
        };
      }),
    })
  );
  return dossier;
}

const build = (paquet: string, dossier: string, code: number | null = 1) => ({
  paquet,
  dossier,
  script: 'build',
  code,
});

describe('la construction en échec d’un paquet du plan', () => {
  it('est nommée avec son journal et le début de sa sortie', () => {
    const { ctx, liste } = copie(['packages/binder']);
    const r = constructionsEchouees(
      ctx,
      liste,
      resultats(ctx, [build('030-binder', 'packages/binder')])
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.nom).toBe('030-binder');
    expect(r[0]!.erreur).toContain(`son journal : ${path.join(ctx.copie, '030-binder-build.log')}`);
    expect(r[0]!.erreur).toContain(ERREUR);
  });

  it('compte chacun de deux paquets du plan, une fois chacun', () => {
    const { ctx, liste } = copie(['packages/binder', 'packages/forms']);
    const r = constructionsEchouees(
      ctx,
      liste,
      resultats(ctx, [
        build('030-binder', 'packages/binder'),
        build('000-forms', 'packages/forms'),
        build('030-binder', 'packages/binder'),
      ])
    );
    expect(r.map(x => x.nom).sort()).toEqual(['000-forms', '030-binder']);
  });

  it('ne compte ni une construction verte, ni une tâche qui n’a pas joué, ni un « à repasser »', () => {
    const { ctx, liste } = copie(['packages/binder']);
    const dossier = resultats(ctx, [
      build('030-binder', 'packages/binder', 0),
      build('030-binder', 'packages/binder', null),
      build('030-binder', 'packages/binder', 75),
    ]);
    expect(constructionsEchouees(ctx, liste, dossier)).toEqual([]);
  });
});

describe('la construction en échec d’un paquet que le plan ne nomme pas', () => {
  it('n’est pas un rouge du plan', () => {
    const { ctx, liste } = copie(['packages/binder']);
    const dossier = resultats(ctx, [build('000-forms', 'packages/forms')]);
    expect(constructionsEchouees(ctx, liste, dossier)).toEqual([]);
  });

  it('l’est quand le plan nomme la racine, qui tient toute la copie', () => {
    const { ctx, liste } = copie(['.']);
    const dossier = resultats(ctx, [build('000-forms', 'packages/forms')]);
    expect(constructionsEchouees(ctx, liste, dossier).map(x => x.nom)).toEqual(['000-forms']);
  });
});

describe('la preuve devant une construction en échec', () => {
  it('prend la construction du plan pour un rouge, dont les tests se jouent aux contrôles', () => {
    const { ctx, liste } = copie(['packages/binder']);
    const construction = constructionsEchouees(
      ctx,
      liste,
      resultats(ctx, [build('030-binder', 'packages/binder')])
    );
    const r = preuve(ctx, {
      mesure: mesureDe(ctx, [{ ...run(TEST, []), code: 1, constructions: construction }]),
    });
    expect(r.ok).toBe(true);
    expect(r.rouges).toBe(1);
    expect(r.resume).toContain('0 fichier(s) qui ne se charge(nt) pas');
    expect(r.texte).toContain('construction de 030-binder — son journal : ');
    expect(r.texte).toContain(ERREUR);
    expect(r.texte).toContain(
      'Les tests de 030-binder se jouent aux contrôles, après le développeur.'
    );
  });

  it('laisse « ne se charge pas » le fichier du plan quand la construction en échec est hors du plan', () => {
    const { ctx, liste } = copie(['packages/binder']);
    const construction = constructionsEchouees(
      ctx,
      liste,
      resultats(ctx, [build('000-forms', 'packages/forms')])
    );
    const r = preuve(ctx, {
      mesure: mesureDe(ctx, [
        {
          ...run(TEST, [resultatDe(ctx, TEST, [], 'Error: Failed to load')], 1),
          constructions: construction,
        },
      ]),
    });
    expect(r.ok).toBe(false);
    expect(r.rouges).toBe(0);
    expect(r.resume).toContain('1 fichier(s) qui ne se charge(nt) pas');
    expect(r.texte).toContain(`${TEST} — ne se charge pas`);
    expect(r.texte).not.toContain('construction de 000-forms');
    expect(r.texte).not.toContain('Rouges (');
  });
});
