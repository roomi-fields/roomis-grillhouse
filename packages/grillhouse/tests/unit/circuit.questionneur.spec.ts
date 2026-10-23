import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the questionneur
// (grillhouse-3uv.89.1, L9), a look that did not write the proposal, as Amazon's bar raiser, the
// challenge and response of a cockpit and the devil's advocate of a design review. It reads the
// ticket's plan once, before the first testwriter and after the survey of the components; its
// questions, or its disagreement, go to the ticket and up to the supervisor as a question
// (grillhouse-3uv.95.4: no author answers it in the circuit), who changes the plan or keeps it, then
// resumes: the plan passes as it is then. Witness: BPScript 320.3, four errors of judgement no
// mechanical rule catches, where two to four questions of the owner find the right solution nine
// times out of ten.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-questionneur-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  essai,
  sessions,
  args,
  etat,
  ordre,
  commentaires,
  entrees,
} = circuitEssai(ESSAIS);

const QUESTIONNEUR = 'questionneur';
// A scenario's sheet, its quotes escaped for the shell.
const fiche = (f: Record<string, unknown>) =>
  `fiche '${JSON.stringify(f).replaceAll("'", "'\\''")}'\n`;
const questions = (...q: [string, string][]) => ({
  issue: 'QUESTIONS',
  questions: q.map(([question, vise]) => ({ question, vise })),
});
const valeur = (a: string[], option: string) =>
  a.includes(option) ? a[a.indexOf(option) + 1] : undefined;
// The lines of the questioning at the ticket.
const echange = (id: string) => commentaires(id).filter(t => / · questionnement : /.test(t));
const questionnements = (id: string) =>
  entrees(id).flatMap(e => (e.questionnement ? [e.questionnement as Record<string, unknown>] : []));
const METACADRE = readFileSync(
  path.resolve(__dirname, '../../../../mods/grillhouse/METACADRE.md'),
  'utf8'
);

describe.runIf(canWrap)('the questionneur, on the plan', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('critère 1 — the plan is read once before the first testwriter; its questions go to the ticket and up to the supervisor, whose resumption lets the plan pass', () => {
    const id = 'demo-questions-plan';
    ticket(id, '000-forms');
    scenario(
      id,
      QUESTIONNEUR,
      fiche(
        questions(
          ['Je n’ai pas compris : que rend `mesure` de 0 ?', 'flou'],
          ['Que fait un tableur mûr de la mesure ?', 'référence']
        )
      )
    );
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.questionnement);
    expect(sessions(id, QUESTIONNEUR)).toBe(1);
    expect(sessions(id, 'testwriter')).toBe(0);
    // Out of the envelope, one session of its own.
    const q1 = args(id, QUESTIONNEUR, 1);
    expect(q1.slice(0, 3)).toEqual(['-p', '--agent', QUESTIONNEUR]);
    expect(valeur(q1, '--session-id')).toBeTruthy();
    // The question goes up to the supervisor, the questions as its piece.
    const e = etat(id) as unknown as {
      raison: string;
      rapport: string;
      question: { arret: string; piece: string; qui: string };
    };
    expect(e.raison).toBe('questionnement');
    expect(e.rapport).toContain('que rend `mesure` de 0 ?');
    expect(e.question).toMatchObject({ arret: 'questionnement', qui: 'superviseur' });
    expect(e.question.piece).toContain('Que fait un tableur mûr de la mesure ?');
    expect(echange(id).some(t => t.includes('que rend `mesure` de 0 ?'))).toBe(true);
    expect(questionnements(id)).toEqual([
      expect.objectContaining({ objet: 'plan', tours: 1, issue: 'QUESTIONS' }),
    ]);
    // The supervisor keeps the plan and resumes: it passes, questioned no more.
    const s = circuit([id, '--reprendre']);
    expect(s.status, sortie(s)).toBe(0);
    expect(sessions(id, QUESTIONNEUR)).toBe(1);
    expect(ordre(id, { questionneur: true })).toEqual([
      QUESTIONNEUR,
      'testwriter packages/forms',
      'developpeur packages/forms',
      'relecteur',
    ]);
    expect(echange(id).at(-1)).toMatch(
      /le plan passe tel qu’il est, sur la reprise du superviseur/
    );
  });

  it('critère 4 — its instruction carries the frame that orients it: the métacadre, « Comment on arbitre », « Ce qui monte au superviseur », the ticket and the survey', () => {
    const id = 'demo-questions-consigne';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    const c = essai(id, `${QUESTIONNEUR}-1.prompt`);
    expect(c).toContain('TON TICKET : demo-questions-consigne');
    expect(c).toContain(METACADRE.trim().split('\n').at(-1));
    expect(c).toContain('Un tableur mûr calcule chaque mesure une fois.');
    expect(c).toContain('Le format publié de la mesure.');
    expect(c).not.toContain('## Commandes');
    expect(c).toContain('1. `mesure` rend le double de sa valeur.');
    expect(c).toContain('**Composants relevés**');
    // A plan without question passes in one reading, its line at the ticket.
    expect(sessions(id, QUESTIONNEUR)).toBe(1);
    expect(echange(id)).toEqual([expect.stringMatching(/aucune question ; il reste tel quel/)]);
    // Read-only: no tool of writing, no write at the ticket.
    const a = args(id, QUESTIONNEUR, 1);
    expect(valeur(a, '--tools')?.split(',')).not.toEqual(expect.arrayContaining(['Edit']));
    expect(valeur(a, '--tools')?.split(',')).not.toEqual(expect.arrayContaining(['Write']));
    const reglages = JSON.parse(valeur(a, '--settings') ?? '{}') as {
      permissions: { deny: string[] };
    };
    expect(reglages.permissions.deny).toEqual(
      expect.arrayContaining(['Bash(bd comments add*)', 'Bash(bd update*)'])
    );
  });

  it('critère 1 — a disagreement the questionneur declares goes up to the supervisor at once', () => {
    const id = 'demo-questions-desaccord';
    ticket(id, '000-forms');
    scenario(
      id,
      QUESTIONNEUR,
      fiche({ issue: 'DÉSACCORD', desaccord: 'Le plan corrige le symptôme, la cause reste.' })
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.questionnement);
    expect(sessions(id, QUESTIONNEUR)).toBe(1);
    expect(sessions(id, 'testwriter')).toBe(0);
    expect(etat(id)?.rapport).toContain('Le plan corrige le symptôme, la cause reste.');
    expect(questionnements(id).at(-1)).toMatchObject({ tours: 1, issue: 'DÉSACCORD' });
  });
});
