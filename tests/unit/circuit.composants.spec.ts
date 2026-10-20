import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ecrire, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

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

  it('names in the report of a red check of a component that component and what its checks play', () => {
    const id = 'demo-controles-composant';
    ticket(id, '000-forms, 030-binder');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    // The first session of forms changes a file of forms, never the code its test waits for.
    scenario(id, 'developpeur-1', `touch $c/essai.txt\npassation 'Un essai.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    const consigne = essai(id, 'developpeur-2.prompt');
    expect(consigne).toContain('TON COMPOSANT : packages/forms');
    expect(consigne).toContain(
      'Contrôles du composant packages/forms, ses tests et ses paquets, ses gardes dans son enveloppe'
    );
    expect(consigne).not.toContain('Contrôles de la passe finale');
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
    expect(consigne).toContain(
      'Contrôles de la passe finale, hors enveloppe, sur la copie entière'
    );
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0, finale: true });
  });

  // Witness: BPScript (320.2.4.5.1), whose circuit stopped at the proof of its first component;
  // `RELANCE --depuis developpeur spec` played only the checks of the nine components after it,
  // never worked, and the reviewer sent the lot back: a whole pass lost.
  it('--depuis <étape> <composant> plays in full the components after it that the circuit has not reached yet', () => {
    const id = 'demo-depuis-neufs';
    ticket(id, '000-forms, 030-binder');
    // The testeur of forms writes nothing, three times: the proof stops the circuit.
    for (const n of [1, 2, 3]) {
      scenario(id, `testeur-${n}`, "passation 'Rien écrit.'\n");
    }
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r1 = circuit([id]);
    expect(r1.status, sortie(r1)).toBe(ARRETS.preuve);
    const r2 = circuit([
      id,
      '--depuis',
      'developpeur',
      '000-forms',
      '--contexte',
      'Le double, sans test neuf.',
    ]);
    expect(r2.status, sortie(r2)).toBe(0);
    expect(ordre(id).filter(l => !l.startsWith('regulateur'))).toEqual([
      'testeur packages/forms',
      'testeur packages/forms',
      'testeur packages/forms',
      'developpeur packages/forms',
      'testeur packages/binder',
      'developpeur packages/binder',
      'relecteur',
    ]);
    expect(historique(id)).toContainEqual(['packages/binder', 'preuve']);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it('launches the developpeur of a component without tests directly: no testeur, no proof', () => {
    const id = 'demo-sans-tests';
    const copie = ticket(id, '000-forms, spec');
    // A component of documentation alone: no package, so no script test:vitest.
    ecrire(path.join(copie, 'spec/mesure.md'), '# La mesure\n');
    scenario(id, 'testeur', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur-1', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      'developpeur-2',
      `printf 'La mesure rend le double.\\n' >> $c/mesure.md\npassation 'Spécification écrite.'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(ordre(id)).toEqual([
      'testeur packages/forms',
      'developpeur packages/forms',
      'developpeur spec',
      'relecteur',
    ]);
    expect(historique(id).filter(([c]) => c === 'spec')[0]).toEqual(['spec', 'testeur']);
    expect(historique(id)).not.toContainEqual(['spec', 'preuve']);
    const ligne = commentaires(id).find(t => t.startsWith('Circuit · spec · testeur : '));
    expect(ligne).toContain('aucun test');
    // Its developpeur is told why it starts without a red.
    expect(essai(id, 'developpeur-2.prompt')).toContain('TON COMPOSANT : spec');
    expect(essai(id, 'developpeur-2.prompt')).toContain('ne porte aucun test');
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });
});
