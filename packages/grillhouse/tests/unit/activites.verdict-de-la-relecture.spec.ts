// The verdict the circuit writes at the ticket from the reviewer's sheet (scripts/activites.mjs,
// `texteDuVerdict`): its word, each blocking finding under its heading, the conformity of each
// element, the findings before, the remarks and the deviations to name at the commit.
import { describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';

const texteDuVerdict = activites.texteDuVerdict as (fiche: object) => string;

const MESURE = 'packages/forms/src/index.mjs#mesure';
const ligne = (conforme: string) => ({
  element: MESURE,
  conforme,
  document: 'CADRE',
  reference: 'de 000-forms, R1',
  piece: 'packages/forms/src/index.mjs:1',
});

describe('le verdict que le circuit écrit au ticket depuis la fiche du relecteur', () => {
  it('ouvre sur son mot, chaque constat bloquant sous son titre avec son destinataire ou son critère, puis les remarques et les écarts', () => {
    expect(
      texteDuVerdict({
        verdict: 'RENDU',
        constats: [
          {
            titre: 'scripts/garde.mjs',
            genre: 'bloquant',
            regle: 'critère 1',
            role: 'developpeur',
            corps: 'Preuve : x.',
            piece: 'scripts/garde.mjs:3',
          },
          {
            titre: 'Un nom',
            genre: 'remarque',
            corps: 'un nom à revoir',
            piece: 'packages/forms/src/x.mjs:9',
          },
          {
            titre: 'packages/forms/src/forms.ts',
            genre: 'bloquant',
            regle: 'critère 2',
            critere_en_cause: '2',
            corps: 'Preuve : y.',
            piece: '$ npm test -- packages/forms\n1 failed',
          },
        ],
        ecarts: [{ sujet: 'ancien.test.mjs', texte: 'en quarantaine, demo-suite le referme' }],
      })
    ).toBe(
      [
        'RENDU',
        '',
        '### Constat 1 — scripts/garde.mjs',
        'Bloquant : critère 1',
        'Agent : developpeur',
        'Preuve : x.',
        'Pièce : scripts/garde.mjs:3',
        '',
        '### Constat 2 — packages/forms/src/forms.ts',
        'Bloquant : critère 2',
        'Critère en cause : 2',
        'Preuve : y.',
        'Pièce : $ npm test -- packages/forms\n1 failed',
        '',
        '## Remarques',
        '',
        '- Un nom — un nom à revoir (packages/forms/src/x.mjs:9)',
        '',
        '## Écarts à nommer au commit',
        '',
        '- ancien.test.mjs : en quarantaine, demo-suite le referme',
      ].join('\n')
    );
  });

  it('un ACCEPTÉ sans rien d’autre tient en son seul mot', () => {
    expect(texteDuVerdict({ verdict: 'ACCEPTÉ' })).toBe('ACCEPTÉ');
  });

  it('nomme, après une relecture bornée, chaque constat d’avant levé ou non, avec sa preuve', () => {
    expect(
      texteDuVerdict({
        verdict: 'ACCEPTÉ',
        suivi: [
          { titre: 'packages/forms/src/index.mjs', etat: 'levé', preuve: 'mesure(0) rend 0.' },
          { titre: 'packages/forms/src/autre.mjs', etat: 'non levé', preuve: 'il reste.' },
        ],
      })
    ).toBe(
      [
        'ACCEPTÉ',
        '',
        "## Constats d'avant",
        '',
        '- packages/forms/src/index.mjs : levé — mesure(0) rend 0.',
        '- packages/forms/src/autre.mjs : non levé — il reste.',
      ].join('\n')
    );
  });

  it('écrit une ligne par élément, avec sa règle et sa pièce', () => {
    const unite = { ...ligne('oui'), element: 'packages/forms/src/index.mjs#unite' };
    expect(texteDuVerdict({ verdict: 'ACCEPTÉ', conformite: [ligne('oui'), unite] })).toBe(
      [
        'ACCEPTÉ',
        '',
        '## Conformité',
        '',
        `- ${MESURE} : oui — CADRE de 000-forms, R1 — packages/forms/src/index.mjs:1`,
        '- packages/forms/src/index.mjs#unite : oui — CADRE de 000-forms, R1 — packages/forms/src/index.mjs:1',
      ].join('\n')
    );
  });

  it('un « non » de la conformité est un constat bloquant sous son titre, avec sa règle et son agent', () => {
    const texte = texteDuVerdict({
      verdict: 'RENDU',
      conformite: [{ ...ligne('non'), role: 'developpeur' }],
    });
    expect(texte).toContain(
      `### Constat 1 — ${MESURE}\nBloquant : CADRE de 000-forms, R1\nAgent : developpeur\n`
    );
  });

  it('la question au responsable porte sa pièce', () => {
    expect(
      texteDuVerdict({ verdict: 'ACCEPTÉ', question: 'Garder le nom ?', piece: 'x.mjs:1' })
    ).toBe(
      ['ACCEPTÉ', '', '## Question au responsable', '', '- Garder le nom ? (x.mjs:1)'].join('\n')
    );
  });
});
