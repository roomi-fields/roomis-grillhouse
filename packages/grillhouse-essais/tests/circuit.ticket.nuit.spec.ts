// @equipee: l'enveloppe bwrap, un serveur Temporal
import { rmSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { sortie, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// grillhouse-3uv.95.6 (decision 6 of 3uv.95): the circuit of a ticket, as a merge request: one
// author of the tests and one of the code for the whole ticket, one CI on the whole, one review.
// Witness: BP 320.9, 16 components, each step played again for each, 118 min of green steps
// played again. The one journey that stays whole in the night: the happy path, in the envelope of
// every package of the plan. The rules of the findings carried across relaunches, of a plan without
// tests and of the final pass are proved small (tests/unit of the package grillhouse,
// transitions.*.spec.ts, circuit.constats-d-un-rendu-a-l-autre.spec.ts).
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { revenirAuDebut, ticket, scenario, circuit, essai, etat, ordre, commentaires, historique } =
  circuitEssai(ESSAIS);

// What the one testwriter and the one developpeur of a ticket on forms and binder write: a red
// test, then the code, in each package of the plan.
const DANS_LE_PLAN = (script: string) =>
  `for c in packages/forms packages/binder; do\n${script}done\n`;

describe.runIf(canWrap)(
  'the circuit of a ticket, one session per agent',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);

    it('one testwriter and one developpeur carry the whole ticket, in the envelope of every package of its plan, its checks on the whole plan', () => {
      const id = 'demo-ticket';
      ticket(id, '000-forms, 030-binder');
      scenario(id, 'testwriter', `${DANS_LE_PLAN(ECRIT_ROUGE)}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${DANS_LE_PLAN(CODE_JUSTE)}passation 'Code écrit.'\n`);
      const r = circuit([id]);
      expect(r.status, sortie(r)).toBe(0);
      expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
      // Each session writes the whole plan, under the author of its role alone.
      for (const role of ['testwriter', 'developpeur']) {
        expect(essai(id, `${role}-1.paquets`), role).toBe('packages/forms:packages/binder');
        expect(essai(id, `${role}-1.acteur`), role).toBe(role);
      }
      // The proof plays every test of the lot; the checks, the tests and the packages of the plan,
      // its guards in the envelope of the whole plan; then the final pass, out of the envelope.
      const preuve = commentaires(id).find(t => t.startsWith('Circuit · preuve : '));
      expect(preuve).toContain('packages/forms/test/mesure.test.mjs');
      expect(preuve).toContain('packages/binder/test/mesure.test.mjs');
      const [controles, finale] = commentaires(id).filter(t =>
        t.startsWith('Circuit · controles : ')
      );
      expect(controles).toContain('npm test -- packages/binder');
      expect(controles).toContain('npm test -- packages/forms');
      expect(controles).toContain(
        'GRILLHOUSE_ENVELOPPE=packages/forms:packages/binder npm run gardes'
      );
      expect(finale).toContain('verts : npm run verifier');
      const gardes = essai(id, 'gardes').split('\n').slice(0, -1);
      expect(gardes[0]).toBe('packages/forms:packages/binder');
      expect(gardes.slice(1).every(g => g === '')).toBe(true);
      expect(historique(id)).toEqual([
        'testwriter',
        'preuve',
        'developpeur',
        'controles',
        'controles',
        'relecture',
        'integration',
        'file',
      ]);
      const e = etat(id);
      expect(e).toMatchObject({
        etape: 'integre',
        code: 0,
        paquets: ['packages/forms', 'packages/binder'],
      });
      for (const champ of ['composant', 'composants', 'dernier', 'renvois', 'atteints']) {
        expect(e, champ).not.toHaveProperty(champ);
      }
    });
  }
);
