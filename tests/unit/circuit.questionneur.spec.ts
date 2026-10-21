import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import {
  sortie,
  ARRETS,
  CODE_JUSTE,
  DESCRIPTION,
  ECRIT_ROUGE,
  circuitEssai,
} from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the questionneur
// (grillhouse-3uv.89.1, L9), a look that did not write the proposal, as Amazon's bar raiser, the
// challenge and response of a cockpit and the devil's advocate of a design review. It asks its
// questions of the ticket's plan, before the first testeur and after the survey of the components,
// and of each decision of the regulator, before the admission control; the author answers by
// resuming its session, the questionneur reads the answer by resuming its own, 4 rounds at most;
// the end is a sheet without question; the fourth round still questioned, or a disagreement,
// goes up to the supervisor. The whole exchange goes to the ticket. Witness: BPScript 320.3, four
// errors of judgement no mechanical rule catches, where two to four questions of the owner find
// the right solution nine times out of ten.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-questionneur-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  BEADS,
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
  bilans,
} = circuitEssai(ESSAIS);

const QUESTIONNEUR = 'questionneur';
const REFERENT = 'referent-technique';
const REGULATEUR = 'regulateur';
const RIEN = "passation 'Rien à écrire.'\n";
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
const description = (id: string) =>
  (JSON.parse(readFileSync(path.join(BEADS, `${id}.json`), 'utf8')) as { description: string }[])[0]
    .description;
const questionnements = (id: string) =>
  entrees(id).flatMap(e => (e.questionnement ? [e.questionnement as Record<string, unknown>] : []));
const METACADRE = readFileSync(path.resolve(__dirname, '../../METACADRE.md'), 'utf8');

describe.runIf(canWrap)(
  'the questionneur, on the plan and on the decisions',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    it('critère 1 — the plan is questioned before the first testeur; the référent technique answers, its change applied by the circuit, and the exchange is at the ticket', () => {
      const id = 'demo-questions-plan';
      ticket(id, '000-forms');
      scenario(
        id,
        `${QUESTIONNEUR}-1`,
        fiche(
          questions(
            ['Je n’ai pas compris : que rend `mesure` de 0 ?', 'flou'],
            ['Que fait un tableur mûr de la mesure ?', 'référence']
          )
        )
      );
      const nouvelle = `${DESCRIPTION}\n2. \`mesure\` de 0 rend 0.`;
      scenario(
        id,
        `${REFERENT}-1`,
        fiche({
          reponses: [
            {
              question: 'Je n’ai pas compris : que rend `mesure` de 0 ?',
              choix: 'CHANGE',
              texte: 'Un critère 2 : `mesure` de 0 rend 0.',
            },
            {
              question: 'Que fait un tableur mûr de la mesure ?',
              choix: 'GARDE',
              texte: 'Il la calcule une fois, comme le plan.',
            },
          ],
          description: nouvelle,
        })
      );
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      // Two rounds before the testeur: the questions, the answer, the questions read again.
      expect(ordre(id, { questionneur: true })).toEqual([
        QUESTIONNEUR,
        REFERENT,
        QUESTIONNEUR,
        'testeur packages/forms',
        'developpeur packages/forms',
        'relecteur',
      ]);
      // Each one out of the envelope; the questionneur resumes its own session to read the answer.
      const q1 = args(id, QUESTIONNEUR, 1);
      expect(q1.slice(0, 3)).toEqual(['-p', '--agent', QUESTIONNEUR]);
      const seance = valeur(q1, '--session-id');
      expect(seance).toBeTruthy();
      expect(valeur(args(id, QUESTIONNEUR, 2), '--resume')).toBe(seance);
      expect(args(id, REFERENT, 1).slice(0, 3)).toEqual(['-p', '--agent', REFERENT]);
      expect(essai(id, `${REFERENT}-1.prompt`)).toContain('que rend `mesure` de 0 ?');
      expect(essai(id, `${QUESTIONNEUR}-2.prompt`)).toContain(
        'Un critère 2 : `mesure` de 0 rend 0.'
      );
      // The change, written by the circuit, reaches the testeur's instruction.
      expect(description(id)).toBe(nouvelle);
      expect(essai(id, 'testeur-1.prompt')).toContain('2. `mesure` de 0 rend 0.');
      // The exchange at the ticket: the questions, the answers, the end.
      const e = echange(id);
      expect(e.some(t => t.includes('tour 1/4') && t.includes('que rend `mesure` de 0 ?'))).toBe(
        true
      );
      expect(e.some(t => t.includes('CHANGE') && t.includes('Un critère 2'))).toBe(true);
      expect(e.some(t => t.includes('GARDE') && t.includes('comme le plan'))).toBe(true);
      expect(e.at(-1)).toMatch(/aucune question au tour 2\/4/);
      // Its count kept, which the bilan reads.
      expect(questionnements(id)).toEqual([
        expect.objectContaining({ objet: 'plan', tours: 2, change: true, issue: 'AUCUNE' }),
      ]);
      expect(bilans(id).at(-1)?.text).toContain('2 tours, 1 décision changée');
    });

    it('critère 4 — its instruction carries the frame that orients it: the métacadre, « Comment on arbitre », « Ce qui monte au superviseur », the ticket and the survey', () => {
      const id = 'demo-questions-consigne';
      ticket(id, '000-forms');
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
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
      // A plan without question passes in one round, its line at the ticket.
      expect(sessions(id, QUESTIONNEUR)).toBe(1);
      expect(sessions(id, REFERENT)).toBe(0);
      expect(echange(id)).toEqual([expect.stringMatching(/aucune question au tour 1\/4/)]);
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

    it('critère 1 — the fourth round still questioned goes up to the supervisor, before any testeur; his answer lets the plan pass, questioned no more', () => {
      const id = 'demo-questions-quatre';
      ticket(id, '000-forms');
      scenario(id, QUESTIONNEUR, fiche(questions(['Illustre par un exemple ?', 'flou'])));
      scenario(
        id,
        REFERENT,
        fiche({
          reponses: [
            { question: 'Illustre par un exemple ?', choix: 'GARDE', texte: 'mesure(2) = 4.' },
          ],
        })
      );
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS.questionnement);
      expect(sessions(id, QUESTIONNEUR)).toBe(4);
      expect(sessions(id, REFERENT)).toBe(3);
      expect(sessions(id, 'testeur')).toBe(0);
      // The author resumes its own session from its second answer.
      const a = valeur(args(id, REFERENT, 1), '--session-id');
      expect(valeur(args(id, REFERENT, 3), '--resume')).toBe(a);
      const e = etat(id) as unknown as {
        raison: string;
        rapport: string;
        boucles: Record<string, number>;
      };
      expect(e.raison).toBe('questionnement');
      expect(e.rapport).toContain('Illustre par un exemple ?');
      expect(e.boucles).toEqual({ questionnement: 4 });
      expect(questionnements(id).at(-1)).toMatchObject({ objet: 'plan', tours: 4, issue: 'MONTE' });
      // The supervisor's answer, written at the ticket, lets the plan pass, from the first testeur.
      const s = circuit([id, '--reponse', 'Le plan tient : mesure(2) = 4 suffit.']);
      expect(s.status, sortie(s)).toBe(0);
      expect(sessions(id, QUESTIONNEUR)).toBe(4);
      expect(sessions(id, 'testeur')).toBe(1);
      expect(echange(id).some(t => t.includes('Le plan tient : mesure(2) = 4 suffit.'))).toBe(true);
    });

    it('critère 1 — a disagreement the questionneur declares goes up to the supervisor at once', () => {
      const id = 'demo-questions-desaccord';
      ticket(id, '000-forms');
      scenario(
        id,
        `${QUESTIONNEUR}-1`,
        fiche(questions(['Cause commune ou symptôme ?', 'intention']))
      );
      scenario(
        id,
        REFERENT,
        fiche({
          reponses: [
            { question: 'Cause commune ou symptôme ?', choix: 'GARDE', texte: 'Symptôme.' },
          ],
        })
      );
      scenario(
        id,
        `${QUESTIONNEUR}-2`,
        fiche({ issue: 'DÉSACCORD', desaccord: 'Le plan corrige le symptôme, la cause reste.' })
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS.questionnement);
      expect(sessions(id, QUESTIONNEUR)).toBe(2);
      expect(sessions(id, 'testeur')).toBe(0);
      expect(etat(id)?.rapport).toContain('Le plan corrige le symptôme, la cause reste.');
      expect(questionnements(id).at(-1)).toMatchObject({ tours: 2, issue: 'DÉSACCORD' });
    });

    it('critère 2 — a decision of the regulateur is questioned before it is applied, the regulateur answering in its own session; a decision changed applies changed', () => {
      const id = 'demo-questions-decision';
      ticket(id, '000-forms');
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur-1', RIEN);
      scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      scenario(
        id,
        `${REGULATEUR}-1`,
        fiche({ decision: 'RELANCE --reprendre', contexte: 'Écris le double.' })
      );
      // The plan passes (its sheet by default); the decision is questioned.
      scenario(
        id,
        `${QUESTIONNEUR}-2`,
        fiche(questions(['Le test du critère 1 est-il juste ?', 'critère']))
      );
      scenario(
        id,
        `${REGULATEUR}-2`,
        fiche({
          decision: 'RELANCE --depuis',
          depuis: { role: 'testeur', composant: 'packages/forms' },
          contexte: 'Relis le test du critère 1.',
          reponses: [
            {
              question: 'Le test du critère 1 est-il juste ?',
              choix: 'CHANGE',
              texte: 'Le testeur le relit d’abord.',
            },
          ],
        })
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(ordre(id, { questionneur: true })).toEqual([
        QUESTIONNEUR,
        'testeur packages/forms',
        'developpeur packages/forms',
        REGULATEUR,
        QUESTIONNEUR,
        REGULATEUR,
        QUESTIONNEUR,
        'testeur packages/forms',
        'developpeur packages/forms',
        'relecteur',
      ]);
      // The regulateur answers in its own session.
      const seance = valeur(args(id, REGULATEUR, 1), '--session-id');
      expect(valeur(args(id, REGULATEUR, 2), '--resume')).toBe(seance);
      expect(essai(id, `${REGULATEUR}-2.prompt`)).toContain('Le test du critère 1 est-il juste ?');
      expect(essai(id, `${QUESTIONNEUR}-2.prompt`)).toContain('RELANCE --reprendre');
      expect(essai(id, `${QUESTIONNEUR}-3.prompt`)).toContain('Le testeur le relit d’abord.');
      // The decision applied is the changed one, and only it is written as the regulateur's.
      const decisions = commentaires(id).filter(t => / · regulateur : RELANCE/.test(t));
      expect(decisions).toEqual([
        expect.stringContaining('RELANCE --depuis testeur packages/forms'),
      ]);
      expect(questionnements(id).at(-1)).toMatchObject({
        objet: 'decision',
        tours: 2,
        change: true,
        issue: 'AUCUNE',
      });
    });

    it('critère 2 — a decision still questioned at the fourth round goes up to the supervisor as the regulateur’s question, its session kept; the answer is not questioned again', () => {
      const id = 'demo-questions-decision-monte';
      ticket(id, '000-forms');
      scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', RIEN);
      scenario(id, REGULATEUR, fiche({ decision: 'RELANCE --reprendre', contexte: 'Écris-le.' }));
      for (const n of [2, 3, 4, 5]) {
        scenario(
          id,
          `${QUESTIONNEUR}-${n}`,
          fiche(questions(['Pourquoi pas le testeur ?', 'règle']))
        );
      }
      scenario(id, `${REGULATEUR}-5`, fiche({ decision: 'MONTE', question: 'Toujours ?' }));
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS.question);
      expect(sessions(id, QUESTIONNEUR)).toBe(5);
      expect(sessions(id, REGULATEUR)).toBe(4);
      const e = etat(id) as unknown as {
        raison: string;
        rapport: string;
        regulateur: { seance: string };
      };
      expect(e.raison).toBe('question');
      expect(e.rapport).toContain('Pourquoi pas le testeur ?');
      expect(e.regulateur.seance).toBe(valeur(args(id, REGULATEUR, 1), '--session-id'));
      const s = circuit([id, '--reponse', 'Relance le testeur.']);
      expect(s.status, sortie(s)).toBe(ARRETS.question);
      expect(valeur(args(id, REGULATEUR, 5), '--resume')).toBe(e.regulateur.seance);
      expect(sessions(id, QUESTIONNEUR)).toBe(5);
    });
  }
);
