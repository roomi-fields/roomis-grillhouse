import { rmSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import {
  sortie,
  ARRETS,
  CODE_JUSTE,
  ECRIT_ROUGE,
  circuitEssai,
  enProcessus,
} from './circuit-essai.js';

const texteDuVerdict = enProcessus<string>('scripts/circuit.mjs', 'texteDuVerdict');

// The conformity of everything the lot changes (grillhouse-3uv.95.7), decision 2 of
// grillhouse-3uv.95, Romain (2026-10-23): « il faut que le relecteur valide vraiment la conformité
// à l'architecture de tout ce qu'il y a de nouveau/changé ». As API Extractor's report and its
// diff, read line by line, and a review that asks a word on every changed file, the circuit gives
// the reviewer the list of each element the lot adds, changes or removes
// (scripts/langages/typescript/elements-du-lot.mjs); the reviewer's sheet holds one line per element (`conformite`),
// a sheet that misses one is refused, and a « non » sends the lot back to its agent.
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { revenirAuDebut, ticket, scenario, circuit, essai, sessions, etat, commentaires } =
  circuitEssai(ESSAIS);

// The developpeur's code, with the tsconfig.json that puts the package in the language service.
const TSCONFIG = `printf '{"compilerOptions":{"allowJs":true,"noEmit":true},"include":["src"]}\\n' > $c/tsconfig.json\n`;
const CODE = `${CODE_JUSTE}${TSCONFIG}passation 'Code écrit.'\n`;
// The one element of the lot: the constant mesure of forms, changed.
const MESURE = 'packages/forms/src/index.mjs#mesure';
const ligne = (conforme: string, plus: Record<string, string> = {}) => ({
  element: MESURE,
  conforme,
  document: 'CADRE',
  reference: 'de 000-forms, R1',
  piece: 'packages/forms/src/index.mjs:1',
  ...plus,
});
const fiche = (f: unknown) => `fiche '${JSON.stringify(f)}'\n`;

describe('the verdict the circuit writes at the ticket names the conformity of each element', () => {
  it('one line per element, conforming or not, with its rule and its piece', () => {
    expect(
      texteDuVerdict({
        verdict: 'ACCEPTÉ',
        conformite: [ligne('oui')],
      })
    ).toBe(
      [
        'ACCEPTÉ',
        '',
        '## Conformité',
        '',
        `- ${MESURE} : oui — CADRE de 000-forms, R1 — packages/forms/src/index.mjs:1`,
      ].join('\n')
    );
  });
});

describe.runIf(canWrap)('the conformity of each element of the lot', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('the reviewer receives the list of the elements; a sheet that misses one is refused, twice a stop', () => {
    const id = 'demo-conformite-manque';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', CODE);
    scenario(id, 'relecteur', fiche({ verdict: 'ACCEPTÉ' }));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(ARRETS['sans-fiche']);
    // Its instruction lists the element, its kind, its status, its export, its package, its place.
    const consigne = essai(id, 'relecteur-1.prompt');
    expect(consigne).toContain(
      `- \`${MESURE}\` : constante, changé, non exporté, paquet 000-forms, packages/forms/src/index.mjs:1`
    );
    expect(consigne).not.toContain('{{');
    // The sheet without its line is refused, naming the element; resumed once, then the stop.
    expect(sessions(id, 'relecteur')).toBe(2);
    expect(essai(id, 'relecteur-2.prompt')).toContain(MESURE);
    expect(etat(id)).toMatchObject({ raison: 'sans-fiche' });
  });

  // As a review unticks « viewed » on the files changed since: the bounded review takes up the
  // line of an element the difference does not touch, and judges again the one it touches.
  it('a « non » sends the lot back to its agent; the bounded review judges again what the fix touches, takes up the rest, and still asks every line', () => {
    const id = 'demo-conformite-non';
    const UNITE = 'packages/forms/src/index.mjs#unite';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(
      id,
      'developpeur-1',
      `printf 'export const mesure = x => 2 * x;\\nexport const unite = 1;\\n' > $c/src/index.mjs\n${TSCONFIG}passation 'Code écrit.'\n`
    );
    scenario(
      id,
      'developpeur-2',
      `printf 'export const mesure = x => x * 2;\\nexport const unite = 1;\\n' > $c/src/index.mjs\npassation 'Rendu traité.'\n`
    );
    const unite = ligne('oui', { element: UNITE, piece: 'packages/forms/src/index.mjs:2' });
    scenario(
      id,
      'relecteur-1',
      fiche({
        verdict: 'RENDU',
        conformite: [ligne('non', { role: 'developpeur' }), unite],
      })
    );
    // The line of unite left out: refused, the session resumed once.
    scenario(id, 'relecteur-2', fiche({ verdict: 'ACCEPTÉ', conformite: [ligne('oui')] }));
    scenario(id, 'relecteur-3', fiche({ verdict: 'ACCEPTÉ', conformite: [ligne('oui'), unite] }));
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'developpeur')).toBe(2);
    expect(sessions(id, 'relecteur')).toBe(3);
    // The « non » is a blocking finding at the ticket, with its rule and its agent.
    expect(commentaires(id)).toContainEqual(
      expect.stringMatching(
        /^RENDU\n\n### Constat 1 — packages\/forms\/src\/index\.mjs#mesure\nBloquant : CADRE de 000-forms, R1\nAgent : developpeur\n/
      )
    );
    expect(essai(id, 'developpeur-2.prompt')).toContain(MESURE);
    // The bounded review: mesure, which the fix changes, to judge again; unite taken up.
    const borne = essai(id, 'relecteur-2.prompt');
    expect(borne).toMatch(
      new RegExp(`- \`${MESURE}\` : [^\\n]* — à rejuger : la différence le touche\\n`)
    );
    expect(borne).toContain(
      `- \`${UNITE}\` : constante, neuf, non exporté, paquet 000-forms, packages/forms/src/index.mjs:2 — reprise, la différence ne le touche pas : oui — CADRE de 000-forms, R1 — packages/forms/src/index.mjs:2`
    );
    expect(essai(id, 'relecteur-3.prompt')).toContain(UNITE);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });

  // grillhouse-9jr.1: on BPScript bp-mono-vbwf.328, the reviewer named the elements of a file out
  // of the language service as « <fichier>#<nom> », then as the file alone, and the circuit refused
  // both (« n'est pas un élément du lot »), a stop « sans-fiche ». As a review accepts a comment
  // on any line of the diff, the instruction says the form, and the circuit accepts it.
  it('a file out of the language service: the instruction says the form of its lines, and the sheet that uses it is accepted', () => {
    const id = 'demo-conformite-hors-service';
    const FICHIER = 'packages/forms/src/index.mjs';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    // No tsconfig.json: the package stays out of the language service.
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    scenario(
      id,
      'relecteur',
      fiche({ verdict: 'ACCEPTÉ', conformite: [ligne('oui'), ligne('oui', { element: FICHIER })] })
    );
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'relecteur')).toBe(1);
    const consigne = essai(id, 'relecteur-1.prompt');
    expect(consigne).toContain(FICHIER);
    expect(consigne).toContain('`<fichier>#<nom>`');
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
  });
});
