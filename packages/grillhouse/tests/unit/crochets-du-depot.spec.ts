// The hooks the repository of Grillhouse commits (.beads/hooks/) carry the lines the frame lays
// today (scripts/crochets.mjs `CROCHETS`): a committed hook left on a former text is rewritten by
// the frame at each push, and the working tree is then never clean.
//
// @lit .beads/hooks/commit-msg .beads/hooks/pre-push packages/grillhouse/scripts/crochets.mjs
//
// Small test: the text of the committed files against the table of the frame.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CROCHETS } from '../../scripts/crochets.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');

describe('the hooks the repository commits are those the frame lays', () => {
  for (const [nom, { lignes }] of Object.entries(
    CROCHETS as Record<string, { lignes: string[] }>
  )) {
    it(`.beads/hooks/${nom} holds each line of the frame, as written today`, () => {
      const texte = readFileSync(path.join(DEPOT, '.beads/hooks', nom), 'utf8').split('\n');
      for (const ligne of lignes) {
        expect(texte, ligne.slice(0, 60)).toContain(ligne);
      }
    });
  }
});
