// @equipee: l'enveloppe bwrap, un serveur Temporal
import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { sortie, CODE_JUSTE, circuitEssai, lire } from './circuit-essai.js';

// A gesture without new behaviour leaves the circuit of code (grillhouse-sos), as Google's
// large-scale changes (Rosie, ClangMR) let a tool make the change that a verification and a review
// judge: the explorateur's plan says the ticket mechanical, with its reason and its command; the
// circuit skips the testwriter, the proof and the developpeur, the explorateur plays the command in
// the copy (1.1), then the checks, the final pass, the review and the queue. Witnesses: BPScript
// 320.16 (38 tools moved by mv, 117 comments), 320.40.1 (an unused variable, 4 sessions), si61.8
// (a threshold 77 → 95).
//
// This file keeps the one journey that goes through the real session of the explorateur in the
// copy, the lot its command delivers read by git, then the real checks, the review and the queue.
// The rules of the short circuit are proved small: the sort of the plan and its survival to the
// questionneur's answer (tests/unit/circuit.sorte.spec.ts), a mechanical lot's red that goes up
// (tests/unit/transitions.spec.ts), the plan « tests-adaptés » without a red
// (tests/unit/circuit.court-par-critere.spec.ts, tests/unit/transitions.preuve-sans-rouge.spec.ts).
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-mecanique-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  REPO,
  BEADS,
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  sessions,
  etat,
  ordre,
  commentaires,
} = circuitEssai(ESSAIS);

// The sheet of the plan of the explorateur, on the package of forms, with its sort.
const plan = (sorte: object) =>
  `fiche '${JSON.stringify({ criteres: [], paquets: ['000-forms'], questions: [], sorte })}'\n`;
const MECANIQUE = {
  genre: 'mécanique',
  raison: 'le code de la mesure se réécrit par sa commande, sans comportement neuf',
  commande: 'printf … > packages/forms/src/index.mjs',
};
const gestes = (id: string) => commentaires(id).filter(t => /^Circuit · geste : /.test(t));
const description = (id: string) =>
  (JSON.parse(lire(path.join(BEADS, `${id}.json`))) as { description: string }[])[0].description;

describe.runIf(canWrap)('a mechanical ticket goes by its command', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('the explorateur plays the command in the copy, then the checks, the review and the queue: no testwriter, no developpeur', () => {
    const id = 'demo-meca';
    ticket(id, '000-forms');
    scenario(id, 'explorateur-1', plan(MECANIQUE));
    scenario(id, 'explorateur-2', `${CODE_JUSTE}fiche '{"statut":"FAIT"}'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id, { plan: true })).toEqual([
      'explorateur',
      'questionneur',
      'explorateur',
      'relecteur',
    ]);
    expect(sessions(id, 'testwriter')).toBe(0);
    expect(sessions(id, 'developpeur')).toBe(0);
    expect(gestes(id)).toEqual([expect.stringMatching(/^Circuit · geste : mecanique → /)]);
    expect(description(id)).toContain(`## Sorte\n\nmécanique — ${MECANIQUE.raison}`);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    expect(lire(path.join(REPO, 'packages/forms/src/index.mjs'))).toContain('2 * x');
  });
});
