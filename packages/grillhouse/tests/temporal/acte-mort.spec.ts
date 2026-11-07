// grillhouse-4nr.8: the group an attempt of an act left when its worker died
// (src/temporal/acte.ts `finirLaTentativeMorte`) ends before the attempt played again plays, its
// leader gone or not: a command of the dead act still running in its group is killed, as the
// session's group is judged alive (`groupeVivant` of scripts/mesure-de-la-machine.mjs).
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { departDe } from '../../scripts/mesure-de-la-machine.mjs';
import { finirLaTentativeMorte } from '../../src/temporal/acte.js';

// Whether the process group <groupe> still has a process.
const groupeVit = (groupe: number) => {
  try {
    process.kill(-groupe, 0);
    return true;
  } catch {
    return false;
  }
};

describe('le groupe d’une tentative morte', () => {
  it('its leader dead, a command of its group still running: the group is killed', async () => {
    // The leader of the dead act launches a command of its group, then dies.
    const meneur = spawn('sh', ['-c', 'sleep 30 & sleep 0.3'], { detached: true, stdio: 'ignore' });
    const mort = { pid: meneur.pid!, depart: departDe(meneur.pid!) };
    await new Promise(ok => meneur.once('close', ok));
    try {
      expect(groupeVit(mort.pid)).toBe(true);
      finirLaTentativeMorte(mort);
      await new Promise(r => setTimeout(r, 300));
      expect(groupeVit(mort.pid)).toBe(false);
    } finally {
      // The group the test launched never outlives it, the test red included.
      if (groupeVit(mort.pid)) {
        process.kill(-mort.pid, 'SIGKILL');
      }
    }
  });

  it('no process before it: nothing is killed', () => {
    expect(() => finirLaTentativeMorte(null)).not.toThrow();
  });
});
