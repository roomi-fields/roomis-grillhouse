import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ecrire, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): a red judged by the
// component that owns it, after a developpeur and at the final pass.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { revenirAuDebut, ticket, scenario, circuit, essai, etat, ordre, commentaires, historique } =
  circuitEssai(ESSAIS);

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  it('judges after a developpeur only the components done: a later red waits for its own', () => {
    const id = 'demo-partiel';
    const copie = ticket(id, '000-forms, 030-binder');
    // The lot of binder is already in the copy, red until its developpeur writes the code.
    ecrire(
      path.join(copie, 'packages/binder/test/mesure.test.mjs'),
      `import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure rend le double', () => { expect(mesure(2)).toBe(4); });
`
    );
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'relecteur',
    ]);
    // The checks of forms play its tests of the lot, not those of binder.
    const forms = commentaires(id).find(t => t.startsWith('Circuit · packages/forms · controles'));
    expect(forms).toContain('packages/forms/test/mesure.test.mjs');
    expect(forms).not.toContain('packages/binder/test/mesure.test.mjs');
    // The guards of forms play in its envelope; the final pass, on the whole repository (when
    // Turborepo plays it rather than replay a run of the same tree from its cache).
    const gardes = essai(id, 'gardes').split('\n').slice(0, -1);
    expect(gardes[0]).toBe('packages/forms');
    expect(gardes.slice(1).every(g => g === '')).toBe(true);
    expect(forms).toContain('GRILLHOUSE_ENVELOPPE=packages/forms npm run gardes');
    const finale = commentaires(id).find(t =>
      t.startsWith('Circuit · packages/binder · controles')
    );
    expect(finale).toContain('controles : verts : npm run verifier.');
  });

  it('sends a red of the final pass to the developpeur of the component that owns its file', () => {
    const id = 'demo-finale';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code de forms écrit.'\n`);
    scenario(
      id,
      'developpeur-2',
      `${CODE_JUSTE}echo rouge > $c/garde-rouge.txt\npassation 'Code de binder écrit.'\n`
    );
    scenario(
      id,
      'developpeur-3',
      `printf '// accordé\\n' >> $c/src/index.mjs\npassation 'Forms accordé.'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'developpeur packages/forms',
      'relecteur',
    ]);
    expect(historique(id).slice(-6)).toEqual([
      ['packages/binder', 'controles'],
      ['packages/forms', 'developpeur'],
      ['packages/forms', 'controles'],
      ['packages/forms', 'relecture'],
      ['packages/forms', 'integration'],
      ['packages/forms', 'file'],
    ]);
    // The developpeur of forms receives the red guard, which names its file.
    const consigne = essai(id, 'developpeur-3.prompt');
    expect(consigne).toContain('TON COMPOSANT : packages/forms');
    expect(consigne).toContain('packages/forms/src/index.mjs:1');
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0, finale: true });
  });
});
