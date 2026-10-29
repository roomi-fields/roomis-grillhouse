import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs), grillhouse-5m1.2 critère 2: a ticket labelled
// `arbitrage` whose arbitrage the integration would refuse (`refusArbitrage` of
// scripts/integration/integrer.mjs, the one rule) does not start, nor resume: the circuit stops
// before any session, a question to the supervisor, as a CI refuses a pull request without its
// required label before it runs a job. BPScript 320.3.2.1 carried the label from 11:37 and learned
// the refusal at its integration, at 12:36, after three reviews.
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { BEADS, revenirAuDebut, ticket, scenario, circuit, sessions, etat, commentaires } =
  circuitEssai(ESSAIS);

// The ticket <id> of the stand-in bd, labelled `arbitrage`.
const etiqueter = (id: string) => {
  const f = path.join(BEADS, `${id}.json`);
  const [t] = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>[];
  writeFileSync(f, JSON.stringify([{ ...t, labels: ['arbitrage'] }]));
};
// A comment of the supervisor at the ticket <id>, as the stand-in bd keeps it.
const commenter = (id: string, text: string) =>
  appendFileSync(
    path.join(BEADS, `${id}.comments.jsonl`),
    `${JSON.stringify({ author: 'superviseur', text, created_at: '2026-10-25T11:37:05Z' })}\n`
  );
const SANS_ARBITRAGE = /est étiqueté arbitrage sans commentaire « Arbitrage »/;

describe.runIf(canWrap)(
  'a ticket labelled arbitrage starts only on its arbitrage',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    it('critère 2 — refuses to start without a comment « Arbitrage », before any session, a question to the supervisor', () => {
      const id = 'demo-arbitrage-lancement';
      ticket(id, '000-forms');
      etiqueter(id);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(ARRETS.besoin);
      for (const role of ['explorateur', 'questionneur', 'testwriter', 'developpeur']) {
        expect(sessions(id, role), role).toBe(0);
      }
      const e = etat(id);
      expect(e?.question).toMatchObject({ arret: 'besoin', qui: 'superviseur' });
      expect(e?.question?.question).toMatch(SANS_ARBITRAGE);
      // Before the plan, the stop is at « 1 Plan », not at the testwriter's step.
      expect(commentaires(id)).toContainEqual(
        expect.stringMatching(/^Circuit · question : besoin à 1 Plan — /)
      );
    });

    it('critère 2 — refuses the resumption the same way, then resumes once the arbitrage is settled, through to the integration', () => {
      const id = 'demo-arbitrage-reprise';
      ticket(id, '000-forms');
      etiqueter(id);
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      expect(circuit([id]).status).toBe(ARRETS.besoin);
      const r1 = circuit([id, '--reprendre']);
      expect(r1.status, sortie(r1)).toBe(ARRETS.besoin);
      expect(sessions(id, 'testwriter')).toBe(0);
      expect(etat(id)?.question?.question).toMatch(SANS_ARBITRAGE);
      // An arbitrage still open refuses too, by the same rule.
      commenter(id, '## Arbitrage — la mesure\n\n### Verdict — monte au responsable\n');
      const r2 = circuit([id, '--reprendre']);
      expect(r2.status, sortie(r2)).toBe(ARRETS.besoin);
      expect(etat(id)?.question?.question).toMatch(/ni tranché ni répondu par le responsable/);
      expect(sessions(id, 'testwriter')).toBe(0);
      commenter(id, '## Réponse du responsable — la mesure\n\nLa mesure double.\n');
      const r3 = circuit([id, '--reprendre']);
      expect(r3.status, sortie(r3)).toBe(0);
      expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    });
  }
);
