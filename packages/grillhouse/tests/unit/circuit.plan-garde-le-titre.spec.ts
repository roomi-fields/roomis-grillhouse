// The plan keeps each component the title of its ticket names, the root included (scripts/circuit.mjs,
// `fautesDesPaquets`): the declared scope of a change bounds what it writes, and the tool does not
// narrow it without saying so. The explorateur that leaves one out says so with its reason
// (`ecartes`); a sheet that leaves one out without a reason, or that sets apart a component of the
// title a file of which the ticket names, is out of conformity, asked again once of the same session. Witness: osc-bridge, OB-80g.20 (2026-11-22): the title named « osc-bridge, . »,
// a criterion named CHANGELOG.md, the sheet named « osc-bridge » alone, and the developpeur stopped
// « hors-plan » on CHANGELOG.md. A test of size medium, on the trial repository of
// ./seance-d-essai.ts.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';
import { ARRETS } from '../../scripts/etapes.mjs';
import { pasDuPlan } from '../../scripts/transitions.mjs';
import { DESCRIPTION, monde, type Monde } from './seance-d-essai.js';

interface EtatDuPlan {
  [cle: string]: unknown;
}
interface Rendu {
  passe?: boolean;
  code?: number;
}
const unPasDuPlan = circuit.unPasDuPlan as unknown as (
  ctx: object,
  pas: string,
  e: EtatDuPlan
) => Promise<Rendu & { plan?: EtatDuPlan }>;
const planAuDebut = circuit.planAuDebut as unknown as (ctx: object) => EtatDuPlan;
const pas = pasDuPlan as unknown as (e: EtatDuPlan) => string;
const codes = ARRETS as unknown as Record<string, number>;

// The plan played until it passes or goes up, as the workflow of a ticket plays its steps.
async function jouerLePlan(m: Monde): Promise<Rendu> {
  return m.jouer(async () => {
    let e = planAuDebut(m.ctx);
    for (;;) {
      const r = await unPasDuPlan(m.ctx, pas(e), e);
      if (!r.plan) {
        return r;
      }
      e = r.plan;
    }
  });
}

// The sheet of the explorateur on the plan, as the circuit reads it.
const plan = (o: Record<string, unknown> = {}) => ({
  criteres: [],
  paquets: ['000-forms'],
  questions: [],
  ...o,
});
const AUCUNE = { issue: 'AUCUNE' };
// A ticket whose title names the root, and whose criterion names a file of the root.
const A_LA_RACINE = {
  titre: 'demo-1 — La mesure — 000-forms, .',
  description: `${DESCRIPTION}\n2. CHANGELOG.md le dit.\n`,
};
const refus = (m: Monde, ...mots: string[]) =>
  m.commentaires().some(t => ['sans fiche conforme', ...mots].every(mot => t.includes(mot)));

describe('un plan garde chaque composant que le titre du ticket nomme', () => {
  it('une fiche qui laisse la racine du titre hors de ses paquets, sans l’écarter, est non conforme, et deux fois monte « sans-fiche », titre inchangé', async () => {
    const m = monde();
    m.ticket(A_LA_RACINE);
    m.fiche(plan());
    m.fiche(plan());
    expect(await jouerLePlan(m)).toEqual({ code: codes['sans-fiche'] });
    expect(m.appels()).toBe(2);
    expect(refus(m, 'paquets : .,', 'que le titre du ticket nomme')).toBe(true);
    expect(m.planEcrit()).toBeUndefined();
  });

  it('la reprise de la même session qui garde la racine passe : le plan des séances d’après tient la racine, le titre la nomme toujours', async () => {
    const m = monde();
    m.ticket(A_LA_RACINE);
    m.fiche(plan());
    m.fiche(plan({ paquets: ['000-forms', '.'] }));
    m.fiche(AUCUNE);
    expect(await jouerLePlan(m)).toEqual({ passe: true });
    expect(m.appels()).toBe(3);
    expect(m.prompt(2)).toContain('que le titre du ticket nomme');
    expect(m.ctx.paquets).toEqual(['packages/forms', '.']);
    expect(m.planEcrit()?.titre ?? A_LA_RACINE.titre).toBe(A_LA_RACINE.titre);
  });

  it('un paquet du titre que la fiche laisse sans l’écarter est non conforme, par son nom', async () => {
    const m = monde();
    m.ticket({ titre: 'demo-1 — La mesure — 000-forms, 030-binder' });
    m.fiche(plan());
    m.fiche(plan());
    expect(await jouerLePlan(m)).toEqual({ code: codes['sans-fiche'] });
    expect(refus(m, '030-binder', 'que le titre du ticket nomme')).toBe(true);
  });

  it('un paquet du titre que la racine du plan couvre est gardé', async () => {
    const m = monde();
    m.ticket({ titre: 'demo-1 — La mesure — 000-forms, 030-binder' });
    m.fiche(plan({ paquets: ['.'] }));
    m.fiche(AUCUNE);
    expect(await jouerLePlan(m)).toEqual({ passe: true });
    expect(m.appels()).toBe(2);
  });
});

describe('un composant du titre que l’explorateur écarte', () => {
  const RAISON = 'le lot ne change que le paquet.';
  const ECARTE = { ecartes: [{ composant: '.', raison: RAISON }] };
  const A_LA_RACINE_SEULE = { titre: A_LA_RACINE.titre };

  it('avec sa raison passe quand aucun critère ne nomme un de ses fichiers : la raison est écrite au ticket, et le titre ne le nomme plus', async () => {
    const m = monde();
    m.ticket(A_LA_RACINE_SEULE);
    m.fiche(plan(ECARTE));
    m.fiche(AUCUNE);
    expect(await jouerLePlan(m)).toEqual({ passe: true });
    expect(m.appels()).toBe(2);
    expect(m.commentaires()[0]).toContain(`écartés : . (${RAISON})`);
    expect(m.planEcrit()?.titre).toBe('demo-1 — La mesure — 000-forms');
  });

  it('alors qu’un critère nomme un fichier de ce composant rend la fiche non conforme, sa raison donnée : la racine du titre qui porte le CHANGELOG.md du critère reste au plan', async () => {
    const m = monde();
    writeFileSync(path.join(m.ctx.racine, 'CHANGELOG.md'), '# Changelog\n');
    m.ticket(A_LA_RACINE);
    m.fiche(plan(ECARTE));
    m.fiche(plan(ECARTE));
    expect(await jouerLePlan(m)).toEqual({ code: codes['sans-fiche'] });
    expect(m.appels()).toBe(2);
    expect(refus(m, 'ecartes : .,', 'CHANGELOG.md', 'ticket, critère 2')).toBe(true);
    expect(m.planEcrit()).toBeUndefined();
  });

  it('un fichier que le critère nomme dans un paquet du plan laisse écarter la racine', async () => {
    const m = monde();
    m.ticket({
      titre: A_LA_RACINE.titre,
      description: `${DESCRIPTION}\n2. packages/forms/src/index.mjs le porte.\n`,
    });
    m.fiche(plan(ECARTE));
    m.fiche(AUCUNE);
    expect(await jouerLePlan(m)).toEqual({ passe: true });
    expect(m.appels()).toBe(2);
  });

  it('au plan reste écarté par la réponse au questionneur qui ne redit pas ses écartés', async () => {
    const m = monde();
    m.ticket(A_LA_RACINE_SEULE);
    m.fiche(plan(ECARTE));
    m.fiche({
      issue: 'QUESTIONS',
      questions: [{ question: 'Pourquoi sans la racine ?', vise: 'flou', piece: 'CLAUDE.md:9' }],
    });
    m.fiche(plan({ reponses: [{ numero: '1', reponse: 'GARDE', texte: 'Rien n’y change.' }] }));
    expect(await jouerLePlan(m)).toEqual({ passe: true });
    expect(m.appels()).toBe(3);
    expect(m.ctx.paquets).toEqual(['packages/forms']);
  });
});

describe('la réponse de l’explorateur au questionneur', () => {
  it('qui laisse un composant du titre d’avant le plan sans l’écarter est non conforme, redemandée à la même session', async () => {
    const m = monde();
    m.ticket(A_LA_RACINE);
    m.fiche(plan({ paquets: ['000-forms', '.'] }));
    m.fiche({
      issue: 'QUESTIONS',
      questions: [{ question: 'Pourquoi la racine ?', vise: 'flou', piece: 'CLAUDE.md:9' }],
    });
    const reponses = [{ numero: '1', reponse: 'GARDE', texte: 'Le CHANGELOG y vit.' }];
    m.fiche(plan({ reponses }));
    m.fiche(plan({ paquets: ['000-forms', '.'], reponses }));
    expect(await jouerLePlan(m)).toEqual({ passe: true });
    expect(m.appels()).toBe(4);
    expect(m.prompt(4)).toContain('que le titre du ticket nomme');
    expect(m.ctx.paquets).toEqual(['packages/forms', '.']);
  });
});
