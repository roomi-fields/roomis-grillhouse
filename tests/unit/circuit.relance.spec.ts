import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ecrire, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the context of a
// relaunch `--depuis <étape> <composant>` (grillhouse-3uv.91.4) reaches each agent of that
// component's chain, testwriter then developpeur, on the line CONTEXTE of its instruction, as a
// GitLab CI retry plays the jobs after it with the same variables.
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

  it('critères 1 et 3 — --depuis testwriter <composant>: its testwriter, then its developpeur, each on its line CONTEXTE; a component after it does not get it', () => {
    const id = 'demo-relance-testwriter';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id, '--depuis', 'testwriter', '000-forms', '--contexte', CONTEXTE]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testwriter packages/forms',
      'developpeur packages/forms',
      'testwriter packages/binder',
      'developpeur packages/binder',
      'relecteur',
    ]);
    expect(essai(id, 'testwriter-1.prompt')).toContain(`CONTEXTE : ${CONTEXTE}`);
    expect(essai(id, 'developpeur-1.prompt')).toContain(`CONTEXTE : ${CONTEXTE}`);
    // The context speaks of forms: binder's agents do not receive it.
    expect(essai(id, 'testwriter-2.prompt')).toContain('CONTEXTE : aucun');
    expect(essai(id, 'developpeur-2.prompt')).toContain('CONTEXTE : aucun');
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it('critères 2 et 3 — --depuis developpeur <composant>: its developpeur, on its line CONTEXTE', () => {
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
    const r = circuit([id, '--depuis', 'developpeur', '000-forms', '--contexte', CONTEXTE]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual(['developpeur packages/forms', 'relecteur']);
    expect(essai(id, 'developpeur-1.prompt')).toContain(`CONTEXTE : ${CONTEXTE}`);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });
});
