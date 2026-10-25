// A command run as a daemon (scripts/demon.mjs), as the circuit of a ticket runs (grillhouse-ybq.4):
// its caller relays the daemon's output to its last line before it ends on the daemon's code.
// Witness: the review of grillhouse-ybq.4, a caller that read the code as soon as it was written,
// without reading the output once more, lost the end of 3 runs in 150, the « ⛔ » of a question
// among it.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'demon-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEMON = path.resolve(__dirname, '../../scripts/demon.mjs');
// A run as the circuit's: lines of output, a wait of <attente> ms, then its last line and a
// question on its error stream, and its code, 13.
const FAUX = path.join(ESSAIS, 'faux-circuit.mjs');
writeFileSync(
  FAUX,
  `import { executerEnDemon } from ${JSON.stringify(DEMON)};
const main = async ([attente]) => {
  for (let i = 0; i < 50; i++) process.stdout.write('ligne ' + i + '\\n');
  await new Promise(r => setTimeout(r, Number(attente)));
  process.stdout.write('FIN\\n');
  process.stderr.write('⛔ la question du circuit\\n');
  return 13;
};
process.exitCode = await executerEnDemon(import.meta.filename, process.argv.slice(2), main);
`
);

const lancer = (attente: number) =>
  new Promise<{ code: number | null; sortie: string; erreurs: string }>(ok => {
    const p = spawn('node', [FAUX, String(attente)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let sortie = '';
    let erreurs = '';
    p.stdout.on('data', d => {
      sortie += String(d);
    });
    p.stderr.on('data', d => {
      erreurs += String(d);
    });
    p.on('close', code => ok({ code, sortie, erreurs }));
  });

describe('the caller of a daemon', { timeout: 300_000 }, () => {
  it('grillhouse-ybq.4 critère 2 — relays the last line of the run before its exit code, every time', async () => {
    const fins: { code: number | null; sortie: string; erreurs: string }[] = [];
    // The ends spread over the caller's reading interval, 150 runs, 15 at a time.
    for (let lot = 0; lot < 10; lot++) {
      fins.push(...(await Promise.all(Array.from({ length: 15 }, (_, i) => lancer(i * 7)))));
    }
    const perdues = fins.filter(
      f =>
        f.code !== 13 ||
        !f.sortie.endsWith('ligne 49\nFIN\n') ||
        f.erreurs !== '⛔ la question du circuit\n'
    );
    expect(fins).toHaveLength(150);
    expect(perdues).toEqual([]);
  });
});
