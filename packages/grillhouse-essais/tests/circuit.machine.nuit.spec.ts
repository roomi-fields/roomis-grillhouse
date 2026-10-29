import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CIRCUIT, CODE_JUSTE, ECRIT_ROUGE, circuitEssai } from './circuit-essai.js';

// grillhouse-3uv.89, L5 — the heavy passes of the circuit (the proof of the red, the checks, the
// final pass) take the lock of the machine (scripts/verrou-de-machine.mjs), as every
// `npm run verifier` does: held by a measure of another repository, they wait for its end.
// The trial repository and its stand-ins: ./circuit-essai.ts.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-machine-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { REPO, ENV, revenirAuDebut, ticket, scenario, ordre } = circuitEssai(ESSAIS);

const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));

describe.runIf(canWrap)('the circuit of a ticket and the machine', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);
  it('waits for the measure that holds the machine, then plays its heavy passes under its lock', async () => {
    const id = 'demo-machine';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    // Another measure holds the machine: a live process that is not one of the circuit's.
    const verrou = path.join(ESSAIS, 'mesure-lourde.lock');
    const autre = spawn('sleep', ['600'], { stdio: 'ignore' });
    writeFileSync(verrou, `${autre.pid}:autre-depot`);
    const journal = path.join(REPO, '.claude/worktrees', `${id}.log`);
    const lire = () => (existsSync(journal) ? readFileSync(journal, 'utf8') : '');
    const enfant = spawn('node', [CIRCUIT, id], {
      cwd: REPO,
      env: { ...ENV, GRILLHOUSE_VERROU_MACHINE: verrou },
      stdio: 'ignore',
    });
    const fin = new Promise<number | null>(resolve => enfant.on('close', resolve));
    try {
      // The proof waits for the other measure, and says so.
      const limite = Date.now() + 200_000;
      while (!lire().includes('⏳') && Date.now() < limite) {
        await attendre(200);
      }
      const avant = lire();
      const attente = avant.indexOf('⏳');
      expect(attente, avant.slice(-4000)).toBeGreaterThan(-1);
      expect(avant.slice(attente, attente + 300)).toContain(String(autre.pid));
      expect(avant.lastIndexOf('$ npm test')).toBeLessThan(attente);
      await attendre(1_000);
      // Nothing of the proof plays while the other measure holds the machine.
      expect(lire().slice(attente)).not.toMatch(/Test Files/);
    } finally {
      autre.kill();
    }
    expect(await fin, lire().slice(-4000)).toBe(0);
    expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
    expect(existsSync(verrou)).toBe(false);
  });
});
