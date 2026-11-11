// @poste: l'enveloppe bwrap, un serveur Temporal
import { readFileSync, rmSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.portent-le-travail.spec.ts): the
// line of the testwriter's sheet that names a whole test file (`portent_le_travail`, its `fichier`
// without `test`), in the proof of the red (grillhouse-3e2.5, critères 5 et 7): each green test of
// that file is a defect, and a green test HEAD holds under the same name has nothing to prove.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { revenirAuDebut, ticket, scenario, circuit, essai, sessions, commentaires } =
  circuitEssai(ESSAIS);

const ADAPTE = 'packages/forms/test/ancien.test.mjs';

// The test file HEAD holds (`ancien.test.mjs`), adapted: its tests renamed, so that HEAD does not
// hold them, green on the code of today; <plus> the tests added to it.
const ADAPTE_VERT = (plus = '') => `cat > $c/test/ancien.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('adapté — mesure rend un nombre', () => { expect(typeof mesure(1)).toBe('number'); });
it('adapté — mesure rend un nombre fini', () => { expect(Number.isFinite(mesure(1))).toBe(true); });
${plus}EOF
`;
const ECRIT_VERT = `cat > $c/test/forme.test.mjs <<'EOF'
import { expect, it } from 'vitest';
import { mesure } from '../src/index.mjs';
it('critère 1 — mesure rend un nombre', () => { expect(typeof mesure(1)).toBe('number'); });
EOF
`;

// The whole report of the last proof on forms, which the proof at the ticket names.
const rapportEntier = (id: string) => {
  const preuve = commentaires(id)
    .filter(t => t.startsWith('Circuit · preuve'))
    .at(-1);
  const complet = /Le rapport entier, avec les verts justifiés et leurs raisons : (\S+)/.exec(
    preuve ?? ''
  )?.[1];
  return { preuve: preuve ?? '', entier: complet ? readFileSync(complet, 'utf8') : '' };
};

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  const fiche = (portent: unknown[]) =>
    `fiche '${JSON.stringify({ statut: 'FAIT', portent_le_travail: portent })}'\n`;

  it('grillhouse-3e2.5 critère 7 — a file named whole is a defect for each of its green tests, even a file HEAD holds, adapted', () => {
    const id = 'demo-fichier-nomme';
    ticket(id, '000-forms');
    scenario(
      id,
      'testwriter-1',
      `${ADAPTE_VERT()}passation 'Fichier adapté.'\n${fiche([{ fichier: ADAPTE }])}`
    );
    scenario(
      id,
      'testwriter-2',
      `${ECRIT_ROUGE}passation 'Fichier non nommé, un test rouge.'\n${fiche([])}`
    );
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(2);
    const relance = essai(id, 'testwriter-2.prompt');
    expect(relance).toContain('Tests qui portent le travail, verts avant le code (2) :');
    for (const nom of ['adapté — mesure rend un nombre', 'adapté — mesure rend un nombre fini']) {
      expect(relance).toContain(`- ${ADAPTE} › ${nom}`);
    }
  });

  it('grillhouse-3e2.5 critères 2 et 6 — the same adapted file, not named, is accepted without reason; with no red the proof fails (critère 8)', () => {
    const id = 'demo-fichier-non-nomme';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ADAPTE_VERT()}passation 'Fichier adapté.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.preuve);
    expect(sessions(id, 'developpeur')).toBe(0);
    const relance = essai(id, 'testwriter-2.prompt');
    expect(relance).toContain('Verts non nommés (acceptés sans justification) (2) :');
    expect(relance).not.toContain('Tests qui portent le travail, verts avant le code');
  });

  it('grillhouse-3e2.5 critère 9 — a red test of a named file stays red, and the file named whole lets it carry the work', () => {
    const id = 'demo-fichier-rouge';
    ticket(id, '000-forms');
    const rouge =
      "it('critère 1 — mesure rend le double', () => { expect(mesure(2)).toBe(4); });\n";
    scenario(
      id,
      'testwriter-1',
      `${ADAPTE_VERT(rouge)}passation 'Fichier adapté, un test neuf rouge.'\n${fiche([{ fichier: ADAPTE, test: 'critère 1 — mesure rend le double' }])}`
    );
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(1);
    expect(sessions(id, 'developpeur')).toBe(1);
    const { preuve } = rapportEntier(id);
    expect(preuve).toContain(`- ${ADAPTE} › critère 1 — mesure rend le double —`);
    expect(preuve).toContain('Verts non nommés (acceptés sans justification) (2) :');
  });

  it('grillhouse-3e2.5 critère 7 — a red and a named green together: the green is the defect, the lot is sent back', () => {
    const id = 'demo-fichier-melange';
    ticket(id, '000-forms');
    scenario(
      id,
      'testwriter-1',
      `${ECRIT_ROUGE}${ECRIT_VERT}${ADAPTE_VERT()}passation 'Tests écrits.'\n${fiche([{ fichier: 'packages/forms/test/forme.test.mjs', test: 'critère 1 — mesure rend un nombre' }])}`
    );
    scenario(id, 'testwriter-2', `passation 'Vert nommé retiré de la fiche.'\n${fiche([])}`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(2);
    expect(essai(id, 'testwriter-2.prompt')).toContain(
      '- packages/forms/test/forme.test.mjs › critère 1 — mesure rend un nombre'
    );
  });
});
