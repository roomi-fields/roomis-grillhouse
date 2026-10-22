import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { lireAvancement } from '../../scripts/avancement.mjs';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { CIRCUIT, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// 2026-10-21 (Romain): the circuit names in its state the progress directory of each automatic
// pass it runs (`avancement`: the proof of the red, the checks, the final pass, the verification
// of the integration, the queue and its CI), where the passes write their files done and planned
// (scripts/avancement.mjs), which the board reads; between two passes, the state names none.
// The final pass, the checks of the last component, says `finale` in the state from its start.
// Witness: a pass frozen 40 min, the machine at rest, that nothing showed.
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-avancement-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { REPO, ENV, revenirAuDebut, ticket, scenario } = circuitEssai(ESSAIS);

const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Etat {
  etape?: string;
  finale?: boolean;
  avancement?: { dossier?: string } | null;
}

describe.runIf(canWrap)(
  'the circuit names the progress of its automatic passes',
  { timeout: 300_000 },
  () => {
    afterEach(revenirAuDebut);
    it('each automatic pass names its progress directory in the state while it plays, where its tasks count their files', async () => {
      const id = 'demo-avancement';
      ticket(id, '000-forms');
      scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
      scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
      const fichier = path.join(REPO, '.claude/worktrees', `${id}.circuit.json`);
      const lire = (): Etat | null => {
        try {
          return JSON.parse(readFileSync(fichier, 'utf8')) as Etat;
        } catch {
          return null;
        }
      };
      const enfant = spawn('node', [CIRCUIT, id], { cwd: REPO, env: ENV, stdio: 'ignore' });
      let fini = false;
      const fin = new Promise<number | null>(resolve =>
        enfant.on('close', c => {
          fini = true;
          resolve(c);
        })
      );
      // Each step seen with a progress directory, and the greatest number of files planned read there.
      const vus = new Map<string, number>();
      while (!fini) {
        const e = lire();
        const dossier = e?.avancement?.dossier;
        if (e && dossier) {
          const cle = `${e.etape}${e.finale ? ' finale' : ''}`;
          const a = lireAvancement(dossier);
          vus.set(cle, Math.max(vus.get(cle) ?? 0, a?.prevus ?? 0));
        }
        await attendre(50);
      }
      const journal = path.join(REPO, '.claude/worktrees', `${id}.log`);
      expect(await fin, existsSync(journal) ? readFileSync(journal, 'utf8').slice(-4000) : '').toBe(
        0
      );
      // The checks of the last component are the final pass (`npm run verifier`): the state says
      // `finale` from its start, as the board reads step 3 there.
      expect([...vus.keys()].sort()).toEqual(['controles finale', 'file', 'integration', 'preuve']);
      expect(vus.get('preuve')).toBeGreaterThan(0);
      expect(vus.get('controles finale')).toBeGreaterThan(0);
      expect(vus.get('integration')).toBeGreaterThan(0);
      expect(lire()?.avancement ?? null).toBeNull();
    });
  }
);
