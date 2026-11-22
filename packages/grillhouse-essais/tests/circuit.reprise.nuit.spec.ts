// @poste: l'enveloppe bwrap, un serveur Temporal
import { rmSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { sortie, ARRETS, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): a relaunch of an
// agent on its step resumes its session. The one journey that stays whole in the night: the real
// launcher (lancer.sh) under the real envelope, which turns `--seance` into claude's `--session-id`
// and `--reprise` into `--resume`, and finds the transcript of a session by its working directory.
// The rules of the resumption itself (which attempt resumes, the short instruction, the sheet asked
// again, the fall back on a fresh session) are proved small: tests/unit/seances.reprise-de-la-seance.spec.ts.
// The trial repository and its stand-ins: ./circuit-essai.ts (its claude keeps a session's
// transcript under its id, and fails a `--resume` it does not find); each file of the circuit's
// tests builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { revenirAuDebut, ticket, scenario, circuit, essai, sessions, args, etat } =
  circuitEssai(ESSAIS);

const valeur = (a: string[], option: string) =>
  a.includes(option) ? a[a.indexOf(option) + 1] : undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// What tells the two templates apart: the whole instruction, the short one of a resumption.
const ENTIERE = 'LE TICKET, sa description et ses critères';
const COURTE = 'TA SÉANCE REPRISE';

describe.runIf(canWrap)(
  'a relaunch resumes the same session, save the last',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    it('the developpeur relaunched on red checks resumes its first session with the short template; the last attempt is fresh and whole', () => {
      const id = 'demo-reprise-dev';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits.'\n`);
      // Each session changes a file of forms, never the code that the test waits for.
      scenario(
        id,
        'developpeur',
        `echo $(( $(cat $c/tour 2>/dev/null || echo 0) + 1 )) > $c/tour\npassation 'Un essai.'\n`
      );
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS.controles);
      expect(sessions(id, 'developpeur')).toBe(3);
      const [a1, a2, a3] = [1, 2, 3].map(n => args(id, 'developpeur', n));
      const premiere = valeur(a1, '--session-id');
      expect(premiere).toMatch(UUID);
      expect(a1).not.toContain('--resume');
      // The second session resumes the first, with the short template and the red checks.
      expect(valeur(a2, '--resume')).toBe(premiere);
      expect(a2).not.toContain('--session-id');
      expect(valeur(a2, '--model')).toBe('sonnet');
      const courte = essai(id, 'developpeur-2.prompt');
      expect(courte).toContain(COURTE);
      expect(courte).not.toContain(ENTIERE);
      expect(courte).toContain(`TON TICKET : ${id}`);
      expect(courte).toContain('TON PLAN : packages/forms');
      expect(courte).toContain('critère 1 — mesure rend le double');
      expect(courte).toContain('Ta séance finit sur ta fiche');
      // The resumption carries no section the launcher adds to a whole instruction.
      expect(courte).not.toContain("## Ce que les composants d'avant publient");
      // The last, on the strong model: a fresh session, its instruction whole.
      const derniere = valeur(a3, '--session-id');
      expect(derniere).toMatch(UUID);
      expect(derniere).not.toBe(premiere);
      expect(a3).not.toContain('--resume');
      expect(valeur(a3, '--model')).toBe('opus');
      expect(essai(id, 'developpeur-3.prompt')).toContain(ENTIERE);
      expect(etat(id)?.seanceReprise).toEqual({ agent: 'developpeur', seance: derniere });
    });
  }
);
