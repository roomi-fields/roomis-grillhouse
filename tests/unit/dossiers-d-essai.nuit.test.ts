import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Ticket grillhouse-3uv.34, critères 1 and 4: a night test (`*.nuit.test.*`), which npm test and
// the integration of the day leave out and the night plays; it lasts about seventy seconds. By
// day, the guards of tests/unit/dossiers-d-essai.spec.ts keep the trial directories off a fixed
// path shared between sessions.
const DEPOT = path.resolve(__dirname, '../..');

// Two runs of the tests of the envelope and of the locks at once, as an integration and a review
// play them in two copies; the second starts a few seconds after the first, so that the first
// ends while the second still works in its trial directories. Both pass.
const SUITES = ['tests/unit/enveloppe.spec.ts', 'tests/unit/verrous.spec.ts'];
const VITEST = path.join(DEPOT, 'node_modules/vitest/vitest.mjs');
const ECART_MS = 8000;

function executer(delai: number): Promise<{ code: number | null; sortie: string }> {
  // The child is a run of its own, not a worker of this one.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
  );
  return new Promise(resolve => {
    setTimeout(() => {
      const p = spawn(process.execPath, [VITEST, 'run', '--reporter=dot', ...SUITES], {
        cwd: DEPOT,
        env,
      });
      let sortie = '';
      p.stdout.on('data', d => (sortie += d));
      p.stderr.on('data', d => (sortie += d));
      p.on('close', code => resolve({ code, sortie }));
    }, delai);
  });
}

describe('two runs of the tests of the envelope at once', () => {
  it('critère 1 — two simultaneous runs of the tests of the envelope and of the locks both pass', async () => {
    const [a, b] = await Promise.all([executer(0), executer(ECART_MS)]);
    const fin = (r: { sortie: string }) => r.sortie.slice(-3000);
    expect({ a: a.code, b: b.code }, `${fin(a)}\n――― b ―――\n${fin(b)}`).toEqual({ a: 0, b: 0 });
  }, 600_000);
});
