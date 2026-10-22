// The commit message of a lot, written once from the final state (`messageDuLot`,
// scripts/circuit.mjs), as a change merged on Gerrit carries the one description of its last patch
// set, never the run of the messages before it (grillhouse-3uv.92.5).
// Witness: BPScript 320.4 (2026-10-21), commit 5efb563, whose message said eight times that the
// fingerprint of the v2 changes, gave two contrary ceilings (548 → 547 and 547 → 546) and phrases
// out of date (« l'intégrateur la met à jour »).
import { describe, expect, it } from 'vitest';
import { messageDuLot } from '../../scripts/circuit.mjs';

const ENTETE =
  'feat(000-forms,spec,900-driver,995-tools): Une redéclaration ne peut que resserrer (bp-mono-vbwf.320.4)';

const DESCRIPTION = [
  '## Architecture',
  '',
  '- **Modèle mûr** : la fusion des déclarations de TypeScript.',
  '',
  "## Critères d'acceptation",
  '',
  '1. `def zx(integer? v)` puis `def zx(string? v)` se refuse, par `CHECK_MEMBER_RETYPED`.',
  "13. L'empreinte de sortie de la v2 se met à jour dans le commit, son écart nommé.",
  '',
  '## Décisions (toutes tranchées)',
  '',
  '- D1 : `owner` reste le plus proche.',
].join('\n');

// The sheets of the developpeurs and of the reviewer of 320.4 that carry deviations, in their
// order, reduced to their deviations, each under the subject it deviates on.
const EMPREINTE = 'Empreinte de sortie de la v2';
const MODULATION = 'Ordre de modulation[] dans les scènes de l’empreinte';
const OUT_TIME = 'Scène témoin temoins/out_time_object';
const PLAFOND = 'Plafond des mots de librairie de 000-forms';
const FICHES_320_4 = [
  {
    statut: 'FAIT',
    ecarts: [
      {
        sujet: EMPREINTE,
        texte:
          "la table des membres du son, du terminal et de l'acteur change. L'intégrateur la met à jour dans le commit (critère 13).",
      },
    ],
  },
  {
    statut: 'FAIT',
    ecarts: [{ sujet: EMPREINTE, texte: 'elle se met à jour dans ce commit.' }],
  },
  {
    statut: 'FAIT',
    ecarts: [
      { sujet: EMPREINTE, texte: 'la référence se met à jour hors de mon enveloppe.' },
      { sujet: MODULATION, texte: 'ordre changé (cause : table des membres).' },
      { sujet: OUT_TIME, texte: 'refusé par CHECK_NARROWING_WRITES_RANGE_ONLY.' },
    ],
  },
  {
    statut: 'BLOQUÉ',
    ecarts: [
      { sujet: MODULATION, texte: "l'ordre change." },
      { sujet: OUT_TIME, texte: 'passe à CHECK_NARROWING_WRITES_RANGE_ONLY.' },
    ],
  },
  {
    verdict: 'RENDU',
    ecarts: [
      {
        sujet: EMPREINTE,
        texte:
          "mise à jour (critère 13) : la table des membres du son, du terminal et de l'acteur change, car le son n'embarque plus `expression`.",
      },
      {
        sujet: MODULATION,
        texte: "il suit les contrôles d'expression reçus par receveur (critère 8).",
      },
      {
        sujet: OUT_TIME,
        texte: 'sa faute change, parce que `vel` est devenu un membre du terminal (critère 13).',
      },
      { sujet: PLAFOND, texte: 'abaissé de 548 à 547, mesuré sur la copie entière.' },
    ],
  },
  {
    statut: 'FAIT',
    ecarts: [{ sujet: PLAFOND, texte: 'abaissé de 547 à 546 (compte du circuit).' }],
  },
  { statut: 'FAIT' },
  { verdict: 'ACCEPTÉ' },
];

describe('the commit message is written once, from the final state', () => {
  const message = messageDuLot({
    entete: ENTETE,
    description: DESCRIPTION,
    fiches: FICHES_320_4,
  });
  const paragraphes = message.trimEnd().split('\n\n');

  it('carries the title of the ticket, what the lot changes by the plan, a paragraph per deviation, then the trailer (criterion 1)', () => {
    expect(paragraphes).toEqual([
      ENTETE,
      [
        '1. `def zx(integer? v)` puis `def zx(string? v)` se refuse, par `CHECK_MEMBER_RETYPED`.',
        "13. L'empreinte de sortie de la v2 se met à jour dans le commit, son écart nommé.",
      ].join('\n'),
      `${EMPREINTE} : mise à jour (critère 13) : la table des membres du son, du terminal et de l'acteur change, car le son n'embarque plus \`expression\`.`,
      `${MODULATION} : il suit les contrôles d'expression reçus par receveur (critère 8).`,
      `${OUT_TIME} : sa faute change, parce que \`vel\` est devenu un membre du terminal (critère 13).`,
      `${PLAFOND} : abaissé de 547 à 546 (compte du circuit).`,
      'Co-Authored-By: Claude <noreply@anthropic.com>',
    ]);
  });

  it('names a deviation several sheets carry once, with its last value (criterion 2)', () => {
    for (const sujet of [EMPREINTE, MODULATION, OUT_TIME, PLAFOND]) {
      expect(message.split(`${sujet} :`).length - 1, sujet).toBe(1);
    }
    expect(message).not.toContain('548 à 547');
    expect(message).not.toContain('intégrateur');
    expect(message).not.toContain('hors de mon enveloppe');
  });

  it('knows a subject again written in another case or spacing (criterion 2)', () => {
    const m = messageDuLot({
      entete: ENTETE,
      description: DESCRIPTION,
      fiches: [
        { statut: 'FAIT', ecarts: [{ sujet: PLAFOND, texte: 'abaissé de 548 à 547.' }] },
        {
          verdict: 'ACCEPTÉ',
          ecarts: [{ sujet: ` ${PLAFOND.toLowerCase()}  `, texte: 'abaissé de 547 à 546.' }],
        },
      ],
    });
    expect(m).not.toContain('548 à 547');
    expect(m.match(/plafond des mots/gi)).toHaveLength(1);
  });

  it('writes only the title and the trailer without a section of criteria or a deviation', () => {
    expect(messageDuLot({ entete: ENTETE, description: '', fiches: [{ statut: 'FAIT' }] })).toBe(
      `${ENTETE}\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n`
    );
  });
});
