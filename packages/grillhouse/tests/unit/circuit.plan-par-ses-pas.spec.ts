// The plan of a ticket played step by step (scripts/circuit.mjs, `unPasDuPlan`), in front of a
// stand-in for claude: the explorateur writes the plan in its sheet, the questionneur reads it
// once, the explorateur's session answers once, and what stays open goes up to the supervisor. A
// test of size medium: the repository is a trial git repository of two packages, the effects of
// the circuit are gathered in its context and read there (./seance-d-essai.ts).
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
const decrireLePlan = circuit.decrireLePlan as unknown as (
  description: string,
  criteres: string[],
  questions: object[],
  sorte?: object | null,
  noms?: object[],
  corrections?: object[]
) => string;
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
const questions = (...q: string[]) => ({
  issue: 'QUESTIONS',
  questions: q.map(question => ({ question, vise: 'flou', piece: 'CLAUDE.md:9' })),
});
// An open question of the plan, with why it goes up.
const OUVERTE = {
  question: 'Le format publié change-t-il ?',
  motif: 'architecture',
  piece: 'CLAUDE.md:7',
};
const ligne = (numero: string, reponse = 'GARDE', texte = 'Le format tient.') => ({
  numero,
  reponse,
  texte,
});
const valeur = (a: string[], option: string) => a[a.indexOf(option) + 1];
// The fingerprints the circuit keeps of the plans that passed.
const empreintes = (m: Monde) =>
  m.ctx.rendus.flatMap(e => {
    const entree = e.entree as { plan?: { empreinte: string } } | undefined;
    return e.genre === 'fiche' && entree?.plan ? [entree.plan.empreinte] : [];
  });
const questionnements = (m: Monde) =>
  m.ctx.rendus.flatMap(e => {
    const entree = e.entree as { questionnement?: Record<string, unknown> } | undefined;
    return e.genre === 'fiche' && entree?.questionnement ? [entree.questionnement] : [];
  });

describe('une passe de questions : l’explorateur répond une fois, CHANGE ou GARDE par question', () => {
  it('reprend la session de l’explorateur avec les questions numérotées, écrit le critère changé au ticket, et laisse passer le plan sans question ouverte', async () => {
    const m = monde();
    m.fiche(plan());
    m.fiche(questions('Que rend `mesure` de 0 ?', 'Pourquoi le double, pas le triple ?'));
    m.fiche(
      plan({
        criteres: ['`mesure(0)` rend 0.'],
        reponses: [
          ligne('1', 'CHANGE', 'Le critère 2 nomme `mesure(0)`.'),
          ligne('2', 'GARDE', 'Le format publié est le double.'),
        ],
      })
    );
    expect(await jouerLePlan(m)).toEqual({ passe: true });
    expect(m.appels()).toBe(3);
    expect(valeur(m.args(3), '--resume')).toBe(valeur(m.args(1), '--session-id'));
    expect(m.prompt(3)).toContain('1. Que rend `mesure` de 0 ?');
    expect(m.prompt(3)).toContain('2. Pourquoi le double, pas le triple ?');
    expect(m.planEcrit()?.description).toContain(
      '1. `mesure` rend le double de sa valeur.\n2. `mesure(0)` rend 0.'
    );
    const dit = m.commentaires().join('\n');
    expect(dit).toContain('1. CHANGE — Le critère 2 nomme `mesure(0)`.');
    expect(dit).toContain('2. GARDE — Le format publié est le double.');
    expect(questionnements(m)).toEqual([
      expect.objectContaining({
        objet: 'plan',
        questions: 2,
        change: true,
        issue: 'QUESTIONS',
        ouvertes: 0,
      }),
    ]);
  });

  it('ne dit CHANGE que lorsqu’une réponse change le plan : des réponses GARDE seules laissent le plan tel qu’il est', async () => {
    const m = monde();
    m.fiche(plan());
    m.fiche(questions('Pourquoi le double ?'));
    m.fiche(plan({ reponses: [ligne('1')] }));
    expect(await jouerLePlan(m)).toEqual({ passe: true });
    expect(questionnements(m)).toEqual([expect.objectContaining({ change: false, ouvertes: 0 })]);
    // Nothing changes the title or the description: the plan is not written again.
    expect(m.planEcrit()).toBeUndefined();
  });
});

describe('une réponse sans ligne pour chaque question posée', () => {
  it('est redemandée une fois à la même session, les numéros qui manquent nommés', async () => {
    const m = monde();
    m.fiche(plan());
    m.fiche(questions('Que rend `mesure` de 0 ?', 'Qui lit la mesure publiée ?', 'Et de -1 ?'));
    m.fiche(plan({ criteres: ['`mesure(0)` rend 0.'], reponses: [ligne('2')] }));
    m.fiche(plan({ reponses: [ligne('1'), ligne('2'), ligne('3')] }));
    expect(await jouerLePlan(m)).toEqual({ passe: true });
    expect(m.appels()).toBe(4);
    expect(valeur(m.args(4), '--resume')).toBe(valeur(m.args(1), '--session-id'));
    expect(m.prompt(4)).toContain('reponses : sans ligne pour les questions 1, 3');
    expect(questionnements(m).at(-1)).toMatchObject({ questions: 3, ouvertes: 0 });
  });

  it('reste ouverte après la reprise unique : la question sans réponse monte au superviseur avec la question ouverte du plan et sa pièce', async () => {
    const m = monde();
    m.fiche(plan());
    m.fiche(questions('Que rend `mesure` de 0 ?', 'Qui lit la mesure publiée ?'));
    const partielle = plan({
      reponses: [ligne('1', 'GARDE', '0, le double de 0.')],
      questions: [OUVERTE],
    });
    m.fiche(partielle);
    m.fiche(partielle);
    const r = await jouerLePlan(m);
    expect(r).toEqual({ code: codes.questionnement });
    expect(m.appels()).toBe(4);
    expect(m.prompt(4)).toContain('reponses : sans ligne pour les questions 2');
    expect(m.ctx.courant?.raison).toBe('questionnement');
    const piece = m.ctx.courant?.question?.piece ?? '';
    expect(piece).toContain('(architecture) Le format publié change-t-il ? (CLAUDE.md:7)');
    expect(piece).toContain('Qui lit la mesure publiée ?');
    expect(piece).not.toContain('Que rend `mesure` de 0 ?');
    expect(m.planEcrit()?.description).toContain(
      '## Questions ouvertes\n\n1. (architecture) Le format publié change-t-il ? (CLAUDE.md:7)'
    );
    expect(questionnements(m).at(-1)).toMatchObject({ questions: 2, change: false, ouvertes: 2 });
  });

  it('un désaccord du questionneur est une seule question, qui monte quand l’explorateur la laisse sans réponse', async () => {
    const m = monde();
    m.fiche(plan());
    m.fiche({ issue: 'DÉSACCORD', desaccord: 'Le plan corrige le symptôme, la cause reste.' });
    m.fiche(plan());
    m.fiche(plan());
    const r = await jouerLePlan(m);
    expect(r).toEqual({ code: codes.questionnement });
    expect(m.prompt(3)).toContain('1. Le plan corrige le symptôme, la cause reste.');
    expect(m.ctx.courant?.question?.piece).toContain(
      'Le plan corrige le symptôme, la cause reste.'
    );
    expect(questionnements(m).at(-1)).toMatchObject({ questions: 1, issue: 'DÉSACCORD' });
  });
});

describe('une question ouverte du plan, avec son motif', () => {
  it('sans motif est redemandée une fois à la même session, le champ nommé, puis monte avec son motif', async () => {
    const m = monde();
    const { motif: _, ...sansMotif } = OUVERTE;
    m.fiche(plan({ questions: [sansMotif] }));
    m.fiche(plan({ questions: [OUVERTE] }));
    m.fiche({ issue: 'AUCUNE' });
    const r = await jouerLePlan(m);
    expect(r).toEqual({ code: codes.questionnement });
    expect(valeur(m.args(2), '--resume')).toBe(valeur(m.args(1), '--session-id'));
    expect(m.prompt(2)).toContain('questions[0].motif : manque');
    expect(
      m
        .commentaires()
        .some(t => t.includes('sans fiche conforme') && t.includes('questions[0].motif : manque'))
    ).toBe(true);
    expect(m.ctx.courant?.question?.piece).toContain(
      '1. (architecture) Le format publié change-t-il ? (CLAUDE.md:7)'
    );
  });

  it('d’un motif hors de ses valeurs rend la fiche non conforme, et deux fois monte « sans-fiche »', async () => {
    const m = monde();
    m.fiche(plan({ questions: [{ ...OUVERTE, motif: 'recommandation' }] }));
    m.fiche(plan({ questions: [{ ...OUVERTE, motif: 'recommandation' }] }));
    const r = await jouerLePlan(m);
    expect(r).toEqual({ code: codes['sans-fiche'] });
    expect(m.appels()).toBe(2);
    expect(
      m
        .commentaires()
        .some(t => t.includes('sans fiche conforme') && t.includes('« recommandation »'))
    ).toBe(true);
  });

  it('une question du plan sans question du questionneur monte sans réponse à donner', async () => {
    const m = monde();
    m.fiche(plan({ questions: [OUVERTE] }));
    m.fiche({ issue: 'AUCUNE' });
    const r = await jouerLePlan(m);
    expect(r).toEqual({ code: codes.questionnement });
    expect(m.appels()).toBe(2);
    expect(questionnements(m).at(-1)).toMatchObject({ questions: 0, issue: 'AUCUNE', ouvertes: 1 });
  });
});

describe('les paquets et les écartés du plan', () => {
  // A criterion that names 030-binder: the survey of the plan names that component.
  const LIE_A_BINDER = `${DESCRIPTION}\n2. 030-binder lit la mesure.\n`;

  it('un paquet que le dépôt ne tient pas rend la fiche non conforme, deux fois monte « sans-fiche », titre inchangé', async () => {
    const m = monde();
    m.fiche(plan({ paquets: ['999-absent'] }));
    m.fiche(plan({ paquets: ['999-absent'] }));
    const r = await jouerLePlan(m);
    expect(r).toEqual({ code: codes['sans-fiche'] });
    expect(m.appels()).toBe(2);
    expect(
      m.commentaires().some(t => t.includes('sans fiche conforme') && t.includes('999-absent'))
    ).toBe(true);
    expect(m.planEcrit()).toBeUndefined();
  });

  it('un paquet nommé deux fois, par son nom et par son chemin, rend la fiche non conforme', async () => {
    const m = monde();
    m.fiche(plan({ paquets: ['000-forms', 'packages/forms'] }));
    m.fiche(plan({ paquets: ['000-forms', 'packages/forms'] }));
    const r = await jouerLePlan(m);
    expect(r).toEqual({ code: codes['sans-fiche'] });
    expect(m.appels()).toBe(2);
    expect(
      m.commentaires().some(t => t.includes('sans fiche conforme') && t.includes('packages/forms'))
    ).toBe(true);
  });

  it('un composant du relevé écarté avec sa raison passe, la raison écrite au ticket, le titre sans lui', async () => {
    const m = monde();
    m.ticket({ description: LIE_A_BINDER });
    m.fiche(
      plan({ ecartes: [{ composant: '030-binder', raison: 'il lit la mesure sans changement.' }] })
    );
    m.fiche({ issue: 'AUCUNE' });
    expect(await jouerLePlan(m)).toEqual({ passe: true });
    expect(m.appels()).toBe(2);
    expect(m.commentaires()[0]).toContain(
      'écartés : 030-binder (il lit la mesure sans changement.)'
    );
    expect(m.planEcrit()?.titre ?? 'demo-1 — La mesure — 000-forms').toBe(
      'demo-1 — La mesure — 000-forms'
    );
  });

  it('un composant du relevé ni dans les paquets ni écarté rend la fiche non conforme, bien que l’explorateur ne l’ait jamais nommé', async () => {
    const m = monde();
    m.ticket({ description: LIE_A_BINDER });
    m.fiche(plan());
    m.fiche(plan());
    const r = await jouerLePlan(m);
    expect(r).toEqual({ code: codes['sans-fiche'] });
    expect(m.appels()).toBe(2);
    expect(
      m
        .commentaires()
        .some(
          t =>
            t.includes('sans fiche conforme') &&
            t.includes('030-binder') &&
            t.includes('que le relevé nomme')
        )
    ).toBe(true);
  });

  it('la reprise de la même session qui met le composant dans ses paquets passe, le composant au titre', async () => {
    const m = monde();
    m.ticket({ description: LIE_A_BINDER });
    m.fiche(plan());
    m.fiche(plan({ paquets: ['000-forms', 'packages/binder'] }));
    m.fiche({ issue: 'AUCUNE' });
    expect(await jouerLePlan(m)).toEqual({ passe: true });
    expect(m.appels()).toBe(3);
    expect(valeur(m.args(2), '--resume')).toBe(valeur(m.args(1), '--session-id'));
    expect(m.prompt(2)).toContain('030-binder');
    expect(m.planEcrit()?.titre).toBe('demo-1 — La mesure — 000-forms, 030-binder');
  });
});

describe('la description du plan', () => {
  it('garde les critères écrits au ticket tels quels, suivis de ceux de la dernière fiche seule', async () => {
    const m = monde();
    m.fiche(plan({ criteres: ['Ajout X.'] }));
    m.fiche(questions('Pourquoi X ?'));
    m.fiche(
      plan({
        criteres: ['Ajout Y.'],
        reponses: [ligne('1', 'CHANGE', 'Y à la place de X.')],
        questions: [OUVERTE],
      })
    );
    expect(await jouerLePlan(m)).toEqual({ code: codes.questionnement });
    const d = m.planEcrit()?.description ?? '';
    expect(d).toContain(
      "## Critères d'acceptation\n\n1. `mesure` rend le double de sa valeur.\n2. Ajout Y.\n\n## Questions ouvertes"
    );
    expect(d).not.toContain('Ajout X.');
  });

  it('ne numérote les critères que de ceux écrits : les lignes du ticket restent, les ajouts suivent', () => {
    const d = decrireLePlan(`${DESCRIPTION}\n2. Un autre.`, ['Neuf A.', 'Neuf B.'], []);
    expect(d).toContain(
      '1. `mesure` rend le double de sa valeur.\n2. Un autre.\n3. Neuf A.\n4. Neuf B.'
    );
  });
});

describe('la consigne du questionneur', () => {
  it('porte le titre et la description du plan, la méta-règle, les rubriques de la charte, sans les commandes ni un relevé neuf', async () => {
    const m = monde();
    m.ticket({ description: `${DESCRIPTION}\n2. 030-binder lit la mesure, inchangé.\n` });
    m.fiche(
      plan({ ecartes: [{ composant: '030-binder', raison: 'il lit la mesure, inchangé.' }] })
    );
    m.fiche({ issue: 'AUCUNE' });
    expect(await jouerLePlan(m)).toEqual({ passe: true });
    const c = m.prompt(2);
    expect(c).toContain('TON TICKET : demo-1');
    expect(c).toContain('Un tableur mûr calcule chaque mesure une fois.');
    expect(c).toContain('Le format publié de la mesure.');
    expect(c).not.toContain('## Commandes');
    expect(c).toContain('2. 030-binder lit la mesure, inchangé.');
    expect(c).not.toContain('**Composants relevés**');
    expect(m.commentaires().at(-1)).toMatch(/aucune question/);
  });

  it('se lance en lecture seule : aucun outil d’écriture, aucune écriture au ticket', async () => {
    const m = monde();
    m.fiche(plan());
    m.fiche({ issue: 'AUCUNE' });
    await jouerLePlan(m);
    const a = m.args(2);
    expect(valeur(a, '--agent') ?? a[a.indexOf('--agent') + 1]).toBe('questionneur');
    const outils = a.includes('--tools') ? valeur(a, '--tools').split(',') : [];
    expect(outils).not.toContain('Edit');
    const reglages = JSON.parse(valeur(a, '--settings') ?? '{}') as {
      permissions: { deny: string[] };
    };
    expect(reglages.permissions.deny).toEqual(
      expect.arrayContaining(['Bash(bd comments add*)', 'Bash(bd update*)'])
    );
  });
});

describe('l’empreinte du plan, son titre et ses critères', () => {
  it('un changement de la description hors des critères ne change pas l’empreinte, un changement de critère la change', async () => {
    const m = monde();
    m.fiche(plan());
    m.fiche({ issue: 'AUCUNE' });
    await jouerLePlan(m);
    const [premiere] = empreintes(m);
    expect(premiere).toBeTruthy();
    // The supervisor's answer, in a section of the description out of the criteria.
    const avecReponse = `${DESCRIPTION}\n\n## Noms publiés\n\n- \`mesure\`, de 000-forms.\n`;
    m.ticket({ description: avecReponse });
    m.fiche(plan());
    m.fiche({ issue: 'AUCUNE' });
    await jouerLePlan(m);
    expect(empreintes(m).at(-1)).toBe(premiere);
    // A criterion changed is a plan changed.
    m.ticket({ description: avecReponse.replace('sa valeur.', 'sa valeur, négative comprise.') });
    m.fiche(plan());
    m.fiche({ issue: 'AUCUNE' });
    await jouerLePlan(m);
    expect(empreintes(m).at(-1)).not.toBe(premiere);
  });

  it('les lignes vides entre les critères ne changent pas l’empreinte', async () => {
    const m = monde();
    m.fiche(plan());
    m.fiche({ issue: 'AUCUNE' });
    await jouerLePlan(m);
    m.ticket({ description: DESCRIPTION.replace('## Critères', '\n## Critères') });
    m.fiche(plan());
    m.fiche({ issue: 'AUCUNE' });
    await jouerLePlan(m);
    const e = empreintes(m);
    expect(e[1]).toBe(e[0]);
  });
});
