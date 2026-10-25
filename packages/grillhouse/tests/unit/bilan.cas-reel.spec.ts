// The bilan of a real ticket (grillhouse-5m1.1): BPScript bp-mono-vbwf.320.3.2.1, led by Grillhouse
// 0.24.3, whose bilan said 34 % lost where its inspection measured 8.5 %. The material,
// tests/cas-reels/bp-320.3.2.1/, is the real case reduced: the register's lines of the ticket, the
// results its circuit kept without their reports nor the bodies of the sheets, and each
// transcript's dated events, their content cut. The register writes a session's line from its
// transcript (scripts/registre.mjs, `ligne`): its turns here are those the present reading gives.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bilan } from '../../scripts/bilan.mjs';
import { lireTranscription } from '../../scripts/tableau.mjs';

const CAS = path.join(__dirname, '../cas-reels/bp-320.3.2.1');
const TICKET = 'bp-mono-vbwf.320.3.2.1';
const jsonl = (f: string) =>
  readFileSync(path.join(CAS, f), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as Record<string, unknown>);

// The turns of each session, read from its transcript.
const tours = Object.fromEntries(
  readdirSync(path.join(CAS, 'transcriptions')).map(f => [
    f.replace(/\.jsonl$/, ''),
    lireTranscription(readFileSync(path.join(CAS, 'transcriptions', f), 'utf8')).tours,
  ])
) as Record<string, [number, number][]>;
const t = (iso: string) => Date.parse(iso);

// The reds of the final passes around the regeneration, as the journal of the ticket shows them
// (its lines 4967-5957, 10027-10435, 14649-14912), their texts shortened; the circuit of 0.24.3
// kept their outcome alone.
const AVANT = [
  "//:gardes : constat mots-de-librairie — le plafond d'un paquet touché reste au-dessus de son compte : 000-forms compte 542 < plafond 546.",
  "packages/000-forms : constat interfaces-contre-code packages/000-forms/docs/INTERFACE.api.md — l'API a changé sans son rapport",
  'packages/000-forms : constat interfaces-contre-code packages/000-forms/docs/INTERFACE.md — la part générée n’est pas celle du code',
  '995-tools : test packages/995-tools/test/mots-de-librairie-declarations.test.ts › the ceiling follows the count down',
];
const INDEX = [
  "//:gardes : constat l'index des interfaces en retard sur une interface — docs/agents/index-des-interfaces.md",
  'hors des paquets : constat index-interfaces docs/agents/index-des-interfaces.md — pas à jour avec les interfaces',
];
const ROUGES: Record<string, string[]> = {
  '2026-10-25T12:08:30.966Z': AVANT,
  '2026-10-25T12:15:46.436Z': INDEX,
  '2026-10-25T12:16:59.838Z': INDEX,
};
const entrees = jsonl('fiches.jsonl').map(e => {
  const rouges = ROUGES[e.date as string];
  if (!rouges) {
    return e;
  }
  const resultat = (e.resultat as object | undefined) ?? { issue: 'rouge', finale: true };
  return { ...e, resultat: { ...resultat, rouges } };
});
// The register's lines, each session's turns those of its transcript.
const lignes = jsonl('registre.jsonl').map(l =>
  tours[l.agent as string] ? { ...l, tours: tours[l.agent as string] } : l
);
const b = bilan({ ticket: TICKET, lignes, entrees, etat: { etape: 'integre' } }) as {
  categories: Record<string, { ms: number; n: number }>;
  seances: { total: number };
};

describe('5m1.1 critère 1 : a turn of a resumed session starts at its incoming message (BP 320.3.2.1)', () => {
  it('ends the first turn of each testwriter at its last work, before the proof, and starts the next at the message of the resumption', () => {
    // The proofs start at 11:45:28 and 11:53:22; a turn opens with the attachments of its message.
    expect(tours['25adfcd3-49bd-4a87-be16-f51553c4fb72']).toEqual([
      [t('2026-10-25T11:42:29.843Z'), t('2026-10-25T11:45:02.395Z')],
      [t('2026-10-25T11:46:29.357Z'), t('2026-10-25T11:46:35.462Z')],
    ]);
    expect(tours['0374e709-b133-4d00-87fe-1ace8fd4a2f1'][0][1]).toBeLessThan(
      t('2026-10-25T11:53:22Z')
    );
    expect(tours['0374e709-b133-4d00-87fe-1ace8fd4a2f1'][1][0]).toBe(t('2026-10-25T11:54:05.108Z'));
  });

  it('ends the second turn of the explorateur before the questionneur starts', () => {
    expect(tours['9a158fa5-0784-435b-86ce-035d031d6623'][1]).toEqual([
      t('2026-10-25T11:38:37.054Z'),
      t('2026-10-25T11:38:43.119Z'),
    ]);
  });

  it('counts the first turn of each testwriter as work kept in the lot, not as a relaunch without effect', () => {
    // 4 turns of the explorateur, 2 testwriters, 3 developpeurs, 3 reviewers.
    expect(b.categories.travail.n).toBe(4 + 2 + 3 + 3);
    expect(b.seances.total).toBe(10);
  });
});

describe('5m1.1 critère 2 : a final pass after a regeneration, its reds another, counts (BP 320.3.2.1)', () => {
  it('counts without effect only the testwriters resumed for their « vert attendu », the proofs they replay and the pass that plays the same red again', () => {
    // 25adfcd3 and 0374e709, their second turn; the proofs of 11:46:38 and 11:54:16; the pass of
    // 12:16:19, the index red again. The pass of 12:10:03 measures the regeneration.
    expect(b.categories.sansEffet.n).toBe(2 + 2 + 1);
    expect(b.categories.sansEffet.ms).toBeLessThan(1.5 * 60_000);
  });
});
