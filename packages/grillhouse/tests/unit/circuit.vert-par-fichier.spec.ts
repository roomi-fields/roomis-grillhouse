import { readFileSync, rmSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, ARRETS, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts): the expected green of
// the testwriter's sheet that covers a whole test file (`verts_attendus`, its `fichier` and `raison`
// without `test`), in the proof of the red.
// Witness: BPScript (vbwf.320.2.4.5.1, 2026-10-20): the testwriter wrote one line per green test,
// most with the same reason (an existing test file adapted to a changed type), up to 14 KB per
// handover, and nine sessions of the testwriter served only to add these lines.
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { revenirAuDebut, ticket, scenario, circuit, essai, sessions, etat, commentaires } =
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
  it('justifies with one expected green of the file every green test of a file HEAD holds', () => {
    const id = 'demo-fichier-adapte';
    ticket(id, '000-forms');
    scenario(
      id,
      'testwriter-1',
      `${ADAPTE_VERT()}passation 'Fichier adapté au type changé.'\nfiche '{"statut":"FAIT","verts_attendus":[{"fichier":"${ADAPTE}","raison":"adapté au type changé, la forme est déjà juste"}]}'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(1);
    // A lot of tests alone: no red, so no developpeur; it goes to the checks.
    expect(sessions(id, 'developpeur')).toBe(0);
    const { preuve, entier } = rapportEntier(id);
    expect(preuve).toContain('0 rouge(s), 2 vert(s) justifié(s), 0 vert(s) sans vert attendu');
    expect(preuve).toContain('aucun rouge : un lot de tests seul, aux contrôles');
    // Each justified green names the expected green of its file.
    for (const nom of ['adapté — mesure rend un nombre', 'adapté — mesure rend un nombre fini']) {
      expect(entier).toContain(
        `${ADAPTE} › ${nom} — adapté au type changé, la forme est déjà juste (par le vert attendu du fichier)`
      );
    }
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  it('justifies nothing with the line of a new test file, and says so for it', () => {
    const id = 'demo-fichier-neuf';
    ticket(id, '000-forms');
    scenario(
      id,
      'testwriter',
      `${ECRIT_ROUGE}${ECRIT_VERT}passation 'Tests écrits.'\nfiche '{"statut":"FAIT","verts_attendus":[{"fichier":"packages/forms/test/forme.test.mjs","raison":"la forme est déjà juste"}]}'\n`
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS.preuve);
    expect(sessions(id, 'developpeur')).toBe(0);
    const relance = essai(id, 'testwriter-2.prompt');
    expect(relance).toContain('0 vert(s) justifié(s), 1 vert(s) sans vert attendu');
    expect(relance).toContain(
      '- packages/forms/test/forme.test.mjs › critère 1 — mesure rend un nombre'
    );
    expect(relance).toContain(
      '- packages/forms/test/forme.test.mjs — fichier neuf, que HEAD ne tient pas : son vert attendu sans test ne justifie aucun de ses verts'
    );
  });

  it('leaves a red test of a covered file red', () => {
    const id = 'demo-fichier-rouge';
    ticket(id, '000-forms');
    const rouge =
      "it('critère 1 — mesure rend le double', () => { expect(mesure(2)).toBe(4); });\n";
    scenario(
      id,
      'testwriter-1',
      `${ADAPTE_VERT(rouge)}passation 'Fichier adapté, un test neuf rouge.'\nfiche '{"statut":"FAIT","verts_attendus":[{"fichier":"${ADAPTE}","raison":"adapté au type changé"}]}'\n`
    );
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(1);
    expect(sessions(id, 'developpeur')).toBe(1);
    const { preuve, entier } = rapportEntier(id);
    expect(preuve).toContain('1 rouge(s), 2 vert(s) justifié(s), 0 vert(s) sans vert attendu');
    expect(preuve).toContain(`- ${ADAPTE} › critère 1 — mesure rend le double —`);
    expect(entier).not.toContain(`${ADAPTE} › critère 1 — mesure rend le double — adapté`);
  });

  it('combines the expected green of a file with those of tests', () => {
    const id = 'demo-fichier-melange';
    ticket(id, '000-forms');
    scenario(
      id,
      'testwriter-1',
      `${ECRIT_ROUGE}${ECRIT_VERT}${ADAPTE_VERT()}passation 'Tests écrits.'\nfiche '{"statut":"FAIT","verts_attendus":[{"fichier":"${ADAPTE}","raison":"adapté au type changé"},{"fichier":"packages/forms/test/forme.test.mjs","test":"critère 1 — mesure rend un nombre","raison":"la forme est déjà juste"}]}'\n`
    );
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(1);
    expect(sessions(id, 'developpeur')).toBe(1);
    const { preuve, entier } = rapportEntier(id);
    expect(preuve).toContain('1 rouge(s), 3 vert(s) justifié(s), 0 vert(s) sans vert attendu');
    expect(entier).toContain(
      `${ADAPTE} › adapté — mesure rend un nombre — adapté au type changé (par le vert attendu du fichier)`
    );
    expect(entier).toContain(
      'packages/forms/test/forme.test.mjs › critère 1 — mesure rend un nombre — la forme est déjà juste'
    );
  });
});
