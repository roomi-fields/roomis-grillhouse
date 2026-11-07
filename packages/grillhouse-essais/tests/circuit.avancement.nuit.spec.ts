import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// 2026-10-21 (Romain): each automatic pass the circuit runs (the proof of the red, the checks, the
// final pass, the verification of the integration, the queue and its CI) writes its files done and
// planned in the working directory of the ticket (scripts/avancement.mjs), which the board reads
// with the step of the circuit from the server (scripts/circuits-du-serveur.mjs); between two
// passes, none.
// Each pass is proven by the trace it leaves at its end, the totals of the repository
// (`<git common dir>/grillhouse/avancement.json`, `garderLeTotal` of scripts/avancement.mjs), never
// by a sampling of the board, which can miss a window; the board reads none once the circuit ends.
// How the board reads a progress directory of the working directory: tests/unit of the package
// grillhouse (avancement-de-la-file.spec.ts, file-relecture-ci.spec.ts).
// Witness: a pass frozen 40 min, the machine at rest, that nothing showed.
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-avancement-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { REPO, revenirAuDebut, ticket, scenario, circuitJusquALaFin, banc } = circuitEssai(ESSAIS);

// A circuit as the board reads it: the progress of its pass under way.
interface Lu {
  ticket: string;
  avancement: { prevus: number } | null;
}

describe.runIf(canWrap)(
  'the circuit names the progress of its automatic passes',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);
    it('each automatic pass counts its files and keeps its total at its end; the circuit ended, the board reads no progress', async () => {
      const id = 'demo-avancement';
      const totaux = path.join(REPO, '.git', 'grillhouse', 'avancement.json');
      rmSync(totaux, { force: true });
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const lire = () => (banc().circuits() as unknown as Lu[]).find(c => c.ticket === id) ?? null;
      const fin = circuitJusquALaFin([id]).fin;
      const journal = path.join(REPO, '.claude/worktrees', `${id}.log`);
      expect(await fin, existsSync(journal) ? readFileSync(journal, 'utf8').slice(-4000) : '').toBe(
        0
      );
      // The total each pass kept at its end, under its kind: the proof, the checks of the plan and
      // the final pass each counted their files. The verification of the integration plays on the
      // tree the final pass just played: a task Turborepo serves from its cache counts the number
      // its hash knows (`inscrireLePlan`), 0 when none is known; its total is kept under its kind
      // all the same (`garderLeTotal`), so the kind is what the trace proves.
      const { passes } = JSON.parse(readFileSync(totaux, 'utf8')) as {
        passes: Record<string, number>;
      };
      const total = (debut: string) =>
        Math.max(
          0,
          ...Object.entries(passes)
            .filter(([k]) => k.startsWith(debut))
            .map(([, n]) => n)
        );
      expect(total('preuve ')).toBeGreaterThan(0);
      expect(total('controles ')).toBeGreaterThan(0);
      expect(total('passe finale ')).toBeGreaterThan(0);
      expect(passes).toHaveProperty('integration');
      expect(lire()?.avancement ?? null).toBeNull();
    });
  }
);
