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

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the supervisor's
// answer to a question of the regulator enters the plan (grillhouse-3uv.91.1), as an amended RFC
// or ADR: the technical referent pours it into the ticket's description, the circuit writes it,
// and a plan changed passes the questionneur before the regulator resumes; every agent then
// judges on the plan, the comments staying the history. Witness: BPScript 325, where the
// regulator never read the owner's answer, kept in the comments only, and ordered a bench the
// owner had just ruled out (~15 min).
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-reponse-');
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
} = circuitEssai(ESSAIS);

const QUESTIONNEUR = 'questionneur';
const REFERENT = 'referent-technique';
const REGULATEUR = 'regulateur';
const RIEN = "passation 'Rien à écrire.'\n";
const QUESTION = 'La mesure rend-elle le double ou le triple ?';
const REPONSE = 'Le responsable : le double, jamais le triple.';
const CRITERE = '2. `mesure` ne rend jamais le triple de sa valeur.';
// A scenario's sheet, its quotes escaped for the shell.
const fiche = (f: Record<string, unknown>) =>
  `fiche '${JSON.stringify(f).replaceAll("'", "'\\''")}'\n`;
const valeur = (a: string[], option: string) =>
  a.includes(option) ? a[a.indexOf(option) + 1] : undefined;
const description = (id: string) =>
  (JSON.parse(readFileSync(path.join(BEADS, `${id}.json`), 'utf8')) as { description: string }[])[0]
    .description;
const questionnements = (id: string) =>
  entrees(id).flatMap(e => (e.questionnement ? [e.questionnement as Record<string, unknown>] : []));
const lire = (f: string) =>
  readFileSync(path.resolve(__dirname, '../../../..', f), 'utf8').replace(/\s+/g, ' ');

// The first run of the ticket <id>: its developpeur changes nothing, and the regulator asks its
// question, which ends the circuit at « question ».
function jusquALaQuestion(id: string) {
  ticket(id, '000-forms');
  scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
  scenario(id, 'developpeur-1', RIEN);
  scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Code écrit.'\n`);
  scenario(id, `${REGULATEUR}-1`, fiche({ decision: 'MONTE', question: QUESTION }));
  const r = circuit([id]);
  expect(r.status, sortie(r)).toBe(ARRETS.question);
}

describe.runIf(canWrap)(
  "the supervisor's answer enters the plan, which every agent reads",
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    it('critère 1 — --reponse goes to the référent technique, who pours it into the plan; the circuit writes the plan, then the questionneur questions it before the regulateur resumes on it', () => {
      const id = 'demo-reponse-au-plan';
      jusquALaQuestion(id);
      const seance = etat(id)?.regulateur?.seance;
      const plan = `${DESCRIPTION}\n${CRITERE}`;
      scenario(
        id,
        REFERENT,
        fiche({
          reponses: [{ question: QUESTION, choix: 'CHANGE', texte: `Un critère 2 : ${CRITERE}` }],
          description: plan,
        })
      );
      scenario(
        id,
        `${REGULATEUR}-2`,
        fiche({
          decision: 'RELANCE --depuis',
          depuis: [
            { role: 'testwriter', composant: 'packages/forms', contexte: 'Le rouge de la mesure.' },
          ],
        })
      );
      const r = circuit([id, '--reponse', REPONSE]);
      expect(r.status, sortie(r)).toBe(0);
      // The referent first, then the questionneur on the plan changed, then the regulateur resumed.
      expect(ordre(id, { questionneur: true }).slice(5)).toEqual([
        REFERENT,
        QUESTIONNEUR,
        REGULATEUR,
        'testwriter packages/forms',
        'developpeur packages/forms',
        'relecteur',
      ]);
      // The referent, a fresh session out of the envelope, reads the question, the answer and the plan.
      const consigne = essai(id, `${REFERENT}-1.prompt`);
      expect(consigne).toContain(QUESTION);
      expect(consigne).toContain(REPONSE);
      expect(consigne).toContain('`mesure` rend le double de sa valeur.');
      expect(valeur(args(id, REFERENT, 1), '--session-id')).toBeTruthy();
      // The circuit writes the plan it gives.
      expect(description(id)).toBe(plan);
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(
          /^Circuit · packages\/forms · questionnement : la réponse du superviseur entre dans le plan/
        )
      );
      // The questionneur reads the plan changed; its questioning passes it.
      const n = sessions(id, QUESTIONNEUR);
      expect(essai(id, `${QUESTIONNEUR}-${n}.prompt`)).toContain(CRITERE);
      expect(questionnements(id).at(-1)).toMatchObject({ objet: 'plan', issue: 'AUCUNE' });
      // The regulateur resumes its session, on the plan as the answer leaves it.
      const a = args(id, REGULATEUR, 2);
      expect(valeur(a, '--resume')).toBe(seance);
      expect(essai(id, `${REGULATEUR}-2.prompt`)).toContain(CRITERE);
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    });

    it('critère 2 — an answer that changes no criterion leaves the plan as it is, said at the ticket, and the regulateur resumes with no questioning', () => {
      const id = 'demo-reponse-sans-effet';
      jusquALaQuestion(id);
      const questionneurs = sessions(id, QUESTIONNEUR);
      scenario(
        id,
        REFERENT,
        fiche({
          reponses: [
            { question: QUESTION, choix: 'GARDE', texte: 'Le critère 1 dit déjà le double.' },
          ],
        })
      );
      scenario(
        id,
        `${REGULATEUR}-2`,
        fiche({
          decision: 'RELANCE --depuis',
          depuis: [
            {
              role: 'developpeur',
              composant: 'packages/forms',
              contexte: 'Le rouge de la mesure.',
            },
          ],
        })
      );
      const r = circuit([id, '--reponse', REPONSE]);
      expect(r.status, sortie(r)).toBe(0);
      expect(ordre(id, { questionneur: true }).slice(5, 8)).toEqual([
        REFERENT,
        REGULATEUR,
        'developpeur packages/forms',
      ]);
      expect(sessions(id, QUESTIONNEUR)).toBe(questionneurs);
      expect(description(id)).toBe(DESCRIPTION);
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(
          /^Circuit · packages\/forms · questionnement : la réponse du superviseur ne change pas le plan/
        )
      );
      expect(essai(id, `${REGULATEUR}-2.prompt`)).toContain(
        '`mesure` rend le double de sa valeur.'
      );
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    });

    it('critère 3 — the regulateur judges on the plan: its instruction carries the description, and its skill and the reviewer’s seek no decision in the comments', () => {
      const id = 'demo-reponse-plan-du-regulateur';
      jusquALaQuestion(id);
      expect(essai(id, `${REGULATEUR}-1.prompt`)).toContain(
        '`mesure` rend le double de sa valeur.'
      );
      const regulateur = lire('mods/grillhouse/skills/regulateur/SKILL.md');
      expect(regulateur).not.toMatch(/`bd comments <ticket>`\)/);
      expect(regulateur).toMatch(/je juge sur le plan/i);
      const relecteur = lire('mods/grillhouse/skills/relecteur/SKILL.md');
      expect(relecteur).not.toMatch(/un chemin qu'un arbitrage a écarté/);
      expect(relecteur).toMatch(/tu juges sur le plan/i);
    });

    it('critère 4 — on --reponse, a component the title gained starts at its testwriter, the stop as its context, never the answer', () => {
      const id = 'demo-reponse-composant-ajoute';
      jusquALaQuestion(id);
      // The referent puts the provider's reader in the title: the plan changes.
      scenario(
        id,
        REFERENT,
        fiche({
          reponses: [
            { question: QUESTION, choix: 'CHANGE', texte: 'Le classeur rejoint le titre.' },
          ],
          titre: `${id} — La mesure — 000-forms, 030-binder`,
        })
      );
      scenario(id, 'testwriter-2', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const r = circuit([id, '--reponse', REPONSE]);
      expect(r.status, sortie(r)).toBe(0);
      expect(sessions(id, REGULATEUR)).toBe(1);
      const consigne = essai(id, 'testwriter-2.prompt');
      expect(consigne).toContain('TON COMPOSANT : packages/binder');
      expect(consigne).toContain(QUESTION);
      expect(consigne).not.toContain(REPONSE);
    });

    // grillhouse-3uv.84.8: the path of an answer lives in the supervisor's skill; the charter
    // keeps that every agent judges on the plan.
    it('critères 4 et 5 — the skills of the regulateur, the référent technique and the superviseur say the path of an answer, the common charter that the plan holds it', () => {
      const charte = lire('mods/grillhouse/charte.md').replace(/\s+/g, ' ');
      expect(charte).toMatch(/une décision du responsable entre dans la description du ticket/);
      const pitmaster = lire('mods/grillhouse/skills/pitmaster/SKILL.md');
      expect(pitmaster.replace(/\s+/g, ' ')).toMatch(/réponse du responsable entre dans le plan/);
      expect(pitmaster.replace(/\s+/g, ' ')).toMatch(
        /le contexte d'une relance porte l'arrêt, jamais une décision du responsable/
      );
      expect(pitmaster).toMatch(/le référent technique la verse dans le plan/);
      expect(pitmaster).toMatch(
        /le contexte d.une relance porte l.arrêt, jamais une décision du responsable/i
      );
      const referent = lire('mods/grillhouse/skills/referent-technique/SKILL.md');
      expect(referent).toMatch(/## La réponse au plan/);
      const regulateur = lire('mods/grillhouse/skills/regulateur/SKILL.md');
      expect(regulateur).toMatch(/le référent technique la verse dans le plan/);
      expect(regulateur).toMatch(
        /le contexte d'une relance porte l'arrêt, jamais une décision du responsable/
      );
    });
  }
);
