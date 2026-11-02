// A command run as a daemon (scripts/demon.mjs), as the circuit of a ticket runs (grillhouse-ybq.4):
// its caller relays the daemon's output to its last line before it ends on the daemon's code.
// Witness: the review of grillhouse-ybq.4, a caller that read the code as soon as it was written,
// without reading the output once more, lost the end of 3 runs in 150, the « ⛔ » of a question
// among it.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// grillhouse-pq6: a run that gives the hand back (`rendreLaMain`, as `systemctl start` returns
// once its unit has started) ends its caller at 0 once its output so far is relayed, its line
// last, and goes on alone.
const RENDU = path.join(ESSAIS, 'circuit-qui-rend-la-main.mjs');
writeFileSync(
  RENDU,
  `import { writeFileSync } from 'node:fs';
import { executerEnDemon, rendreLaMain } from ${JSON.stringify(DEMON)};
const main = async ([fin]) => {
  process.stdout.write('avant\\n');
  rendreLaMain('▶ lancé\\n');
  rendreLaMain('▶ une seconde fois\\n');
  await new Promise(r => setTimeout(r, 1500));
  process.stdout.write('après\\n');
  writeFileSync(fin, 'fini');
  return 14;
};
process.exitCode = await executerEnDemon(import.meta.filename, process.argv.slice(2), main);
`
);

describe('a daemon that gives the hand back', { timeout: 60_000 }, () => {
  it('grillhouse-pq6 — ends its caller at 0 on its line, and goes on alone to its end', async () => {
    const fin = path.join(ESSAIS, 'fin-du-demon');
    const r = await new Promise<{ code: number | null; sortie: string; erreurs: string }>(ok => {
      const p = spawn('node', [RENDU, fin], { stdio: ['ignore', 'pipe', 'pipe'] });
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
    expect(r).toEqual({ code: 0, sortie: 'avant\n', erreurs: '▶ lancé\n' });
    // The caller ended before the run did.
    expect(existsSync(fin)).toBe(false);
    const limite = Date.now() + 20_000;
    while (!existsSync(fin) && Date.now() < limite) {
      await new Promise(ok => setTimeout(ok, 50));
    }
    expect(readFileSync(fin, 'utf8')).toBe('fini');
  });
});

// grillhouse-pq6.1: whether the run's error output reaches a reader, which the circuit reads to
// inscribe the question it says there as gone up: in a daemon, while it has not given the hand
// back to its caller; out of a daemon, always, its output its caller's own.
const LUE = path.join(ESSAIS, 'circuit-dont-la-sortie-est-lue.mjs');
writeFileSync(
  LUE,
  `import { writeFileSync } from 'node:fs';
import { executerEnDemon, rendreLaMain, sortieLue } from ${JSON.stringify(DEMON)};
const main = async ([fin]) => {
  const avant = sortieLue();
  rendreLaMain('▶ lancé\\n');
  writeFileSync(fin, JSON.stringify([avant, sortieLue()]));
  return 0;
};
process.exitCode = await executerEnDemon(import.meta.filename, process.argv.slice(2), main);
`
);

describe('the output of a daemon, read', { timeout: 60_000 }, () => {
  it('grillhouse-pq6.1 — read until the hand goes back to the caller, unread after; read out of a daemon', async () => {
    const fin = path.join(ESSAIS, 'sortie-lue');
    const code = await new Promise<number | null>(ok => {
      const p = spawn('node', [LUE, fin], { stdio: ['ignore', 'ignore', 'ignore'] });
      p.on('close', ok);
    });
    expect(code).toBe(0);
    const limite = Date.now() + 20_000;
    while (!existsSync(fin) && Date.now() < limite) {
      await new Promise(ok => setTimeout(ok, 50));
    }
    expect(JSON.parse(readFileSync(fin, 'utf8'))).toEqual([true, false]);
    const { sortieLue } = await import('../../scripts/demon.mjs');
    expect(sortieLue()).toBe(true);
  });
});
