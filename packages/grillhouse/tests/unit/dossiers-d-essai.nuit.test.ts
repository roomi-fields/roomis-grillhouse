import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Ticket grillhouse-3uv.34, critères 1 and 4: a night test (`*.nuit.test.*`), which npm test and
// the integration of the day leave out and the night plays; it lasts about seventy seconds. By
// day, the guards of tests/unit/dossiers-d-essai.spec.ts keep the trial directories off a fixed
// path shared between sessions.
// The package of the frame's tests.
const DEPOT = path.resolve(__dirname, '../..');

// Two runs of the tests of the envelope and of the locks at once, as an integration and a review
// play them in two copies; the second starts a few seconds after the first, so that the first
// ends while the second still works in its trial directories. Both pass.
const SUITES = [
  'tests/unit/enveloppe.spec.ts',
  'tests/unit/enveloppe.maison.spec.ts',
  'tests/unit/enveloppe.matiere-de-test.spec.ts',
  'tests/unit/verrous.spec.ts',
];
// The tests of the launcher, of the real envelope and of the locks' hooks, night tests of the
// package of the frame's chain beside this one, which a run in that package plays when it names
// them (GRILLHOUSE_TESTS, scripts/langages/typescript/vitest-config/cibles.mjs).
const ESSAIS_DU_CADRE = path.resolve(DEPOT, '../grillhouse-essais');
const LANCEUR = [
  'enveloppe.lanceur',
  'enveloppe',
  'enveloppe.maison',
  'enveloppe.matiere-de-test',
  'verrous',
].map(f => path.join(ESSAIS_DU_CADRE, `tests/${f}.nuit.spec.ts`));
const VITEST = path.resolve(DEPOT, '../../node_modules/vitest/vitest.mjs');
const ECART_MS = 8000;

// A run of Vitest in <cwd>, with <args> and the variables <ajouts>: its exit code and its output.
function vitest(
  cwd: string,
  args: string[],
  ajouts: Record<string, string>
): Promise<{ code: number | null; sortie: string }> {
  // The child is a run of its own, not a worker of this one.
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
    ),
    ...ajouts,
  };
  return new Promise(resolve => {
    const p = spawn(process.execPath, [VITEST, 'run', '--reporter=dot', ...args], { cwd, env });
    let sortie = '';
    p.stdout.on('data', d => (sortie += d));
    p.stderr.on('data', d => (sortie += d));
    p.on('close', code => resolve({ code, sortie }));
  });
}

// One run of the tests of the envelope and of the locks, after <delai>: the frame's and the
// launcher's at once; its code is the worst of the two.
function executer(delai: number): Promise<{ code: number | null; sortie: string }> {
  return new Promise(resolve => {
    setTimeout(() => {
      void Promise.all([
        vitest(DEPOT, SUITES, {}),
        vitest(ESSAIS_DU_CADRE, [], { GRILLHOUSE_TESTS: JSON.stringify({ arguments: LANCEUR }) }),
      ]).then(([cadre, lanceur]) =>
        resolve({
          code: cadre.code === 0 ? lanceur.code : cadre.code,
          sortie: `${cadre.sortie}\n${lanceur.sortie}`,
        })
      );
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
