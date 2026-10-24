import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ecrire, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the context of a
// relaunch `--depuis <étape>` (grillhouse-3uv.91.4, 3uv.95.6) reaches each agent the run plays from
// that step of the whole ticket, testwriter then developpeur, on the line CONTEXTE of its
// instruction, as a GitLab CI retry plays the jobs after it with the same variables.
// Witness: BPScript 325, whose `--depuis testeur packages/995-tools --contexte …` gave its
// developpeur only the report of the proof, « CONTEXTE : aucun ».
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { revenirAuDebut, ticket, scenario, circuit, essai, etat, ordre } = circuitEssai(ESSAIS);

const CONTEXTE = 'Retire le correctif ; le filtre reste.';

describe.runIf(canWrap)('the context of a relaunch', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('critères 1 et 3 — --depuis testwriter: the testwriter, then the developpeur, of the whole ticket, each on its line CONTEXTE', () => {
    const id = 'demo-relance-testwriter';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id, '--depuis', 'testwriter', '--contexte', CONTEXTE]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
    expect(essai(id, 'testwriter-1.prompt')).toContain(`CONTEXTE : ${CONTEXTE}`);
    expect(essai(id, 'developpeur-1.prompt')).toContain(`CONTEXTE : ${CONTEXTE}`);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it('critères 2 et 3 — --depuis developpeur: the developpeur, on its line CONTEXTE', () => {
    const id = 'demo-relance-developpeur';
    const copie = ticket(id, '000-forms');
    ecrire(
      path.join(copie, 'packages/forms/test/mesure.test.mjs'),
      `import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure rend le double', () => { expect(mesure(2)).toBe(4); });
`
    );
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id, '--depuis', 'developpeur', '--contexte', CONTEXTE]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual(['developpeur', 'relecteur']);
    expect(essai(id, 'developpeur-1.prompt')).toContain(`CONTEXTE : ${CONTEXTE}`);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });
});
