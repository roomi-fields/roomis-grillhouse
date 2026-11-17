// The watch of the memory of a pass (scripts/garde-de-la-memoire.mjs): a command runs under it and
// is cut, at 75, with all it started, when the memory available and the free swap run out or the
// pressure of the memory reaches its threshold; otherwise the watch gives the command's own code.
//
// The readings are small tests; the watch itself is a medium one: it starts local processes.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  lireLaPressionDeLaMemoire,
  memoireEpuisee,
  SEUIL_PRESSION_MEMOIRE,
  veiller,
} from '../../scripts/garde-de-la-memoire.mjs';
import { lireLaMemoire } from '../../scripts/mesure-de-la-machine.mjs';

const GO = 1024 ** 3;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'garde-de-la-memoire-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe('ce que la machine donne encore', () => {
  it('reads the memory available and the free swap of /proc/meminfo, in bytes', () => {
    const texte = 'MemTotal: 100 kB\nMemAvailable:    2048 kB\nSwapFree:        1024 kB\n';
    expect(lireLaMemoire(texte)).toEqual({ disponible: 2048 * 1024, echange: 1024 * 1024 });
  });
  it('a machine without swap has none free', () => {
    expect(lireLaMemoire('MemAvailable: 8 kB\n')).toEqual({ disponible: 8 * 1024, echange: 0 });
  });
  it('a text that does not say the memory available gives none known', () => {
    expect(lireLaMemoire('MemTotal: 100 kB\n').disponible).toBeNull();
  });
  it('reads the pressure of the memory, line full, field avg10', () => {
    const texte =
      'some avg10=12.50 avg60=3.00 avg300=1.00 total=1\nfull avg10=61.25 avg60=2.00 avg300=0.50 total=1\n';
    expect(lireLaPressionDeLaMemoire(texte)).toBe(61.25);
    expect(lireLaPressionDeLaMemoire('some avg10=1.00\n')).toBeNull();
  });
});

describe('la coupure', () => {
  it('a pass goes on while memory and swap together keep 4 GB, the pressure low', () => {
    expect(memoireEpuisee({ disponible: 1 * GO, echange: 3 * GO, pression: 10 })).toBeNull();
    expect(memoireEpuisee({ disponible: 20 * GO, echange: 0, pression: null })).toBeNull();
  });
  it('under 4 GB for both together, it is cut, and the reason says both', () => {
    const raison = memoireEpuisee({ disponible: 0.5 * GO, echange: 1 * GO, pression: 0 });
    expect(raison).toContain('mémoire épuisée');
    expect(raison).toContain('0,5 Go disponibles');
    expect(raison).toContain("1,0 Go d'échange");
    expect(raison).toContain('à repasser');
  });
  it('at the threshold of pressure, it is cut though swap is said free (a swap held in memory)', () => {
    const raison = memoireEpuisee({
      disponible: 1 * GO,
      echange: 10 * GO,
      pression: SEUIL_PRESSION_MEMOIRE,
    });
    expect(raison).toContain('attend sa mémoire');
    expect(raison).toContain('à repasser');
  });
  it('a machine that says neither its memory nor its pressure is never cut', () => {
    expect(memoireEpuisee({ disponible: null, echange: 0, pression: null })).toBeNull();
  });
});

describe('une commande sous la veille', { timeout: 30_000 }, () => {
  const large = { disponible: 20 * GO, echange: 0, pression: 0 };
  const epuisee = { disponible: 0.5 * GO, echange: 0, pression: 0 };
  const sous = (memoire: typeof large, code: string, dossier: string) =>
    veiller({
      cmd: process.execPath,
      args: ['-e', code],
      temoin: path.join(dossier, 'temoin'),
      mesurer: () => memoire,
      pas: 100,
      delai: 1000,
      stdio: 'ignore',
    });
  const vivant = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  it('with room, the watch gives the code of the command and writes no witness', async () => {
    const d = mkdtempSync(path.join(ESSAIS, 'veille-'));
    expect(await sous(large, 'setTimeout(() => process.exit(3), 300)', d)).toBe(3);
    expect(existsSync(path.join(d, 'temoin'))).toBe(false);
  });

  it('memory run out, the command and a process it started that ignores SIGTERM are dead when the watch gives 75, its witness saying why', async () => {
    const d = mkdtempSync(path.join(ESSAIS, 'veille-'));
    const pids = path.join(d, 'pids');
    // A command that starts a child deaf to SIGTERM, then waits: the pass and one of its tasks.
    const sourd = "process.on('SIGTERM', () => {}); setTimeout(() => {}, 60000)";
    const code = `
      const { spawn } = require('node:child_process');
      const e = spawn(process.execPath, ['-e', ${JSON.stringify(sourd)}], { stdio: 'ignore' });
      setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(pids)}, process.pid + ' ' + e.pid), 300);
      setTimeout(() => {}, 60000);`;
    // The measure says room until the command wrote its processes, the deaf child started.
    const mesure = () => (existsSync(pids) ? epuisee : large);
    const rendu = await veiller({
      cmd: process.execPath,
      args: ['-e', code],
      temoin: path.join(d, 'temoin'),
      mesurer: mesure,
      pas: 100,
      delai: 1000,
      stdio: 'ignore',
    });
    expect(rendu).toBe(75);
    expect(readFileSync(path.join(d, 'temoin'), 'utf8')).toContain('mémoire épuisée');
    const [commande, enfant] = readFileSync(pids, 'utf8').split(' ').map(Number);
    // No wait: the watch gives 75 only once both are dead.
    expect(vivant(commande!)).toBe(false);
    expect(vivant(enfant!)).toBe(false);
  });
});
