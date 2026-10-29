import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';

// grillhouse-3uv.72: the lock of a shared file is one module at the root of scripts/ (arbitrage
// « Où vit le verrou de fichier… »), imported by the integration (judged by the owner's process
// number) and by the registre (judged by age, `perime`: a role agent runs under bwrap
// --unshare-pid, and its process number means nothing outside its envelope).
//
// The interface, fixed by these tests:
//   prendreVerrou(verrou, { attendre, perime }) -> boolean
//   lacherVerrou(verrou)
// A lock is the file <verrou>, created exclusively. These tests read only its presence, its age
// (mtime) and its content as an opaque mark of its holder.

// An adversary inside node:fs, armed by one test only: after the first call that hits the lock
// path following a failed exclusive creation (EEXIST), it runs `declencher` once — another taker
// acting between two steps of the takeover. Unarmed, every function passes through.
const piege = vi.hoisted(() => ({
  verrou: null as string | null,
  contention: false,
  fait: false,
  declencher: () => {},
}));

vi.mock('node:fs', async importOriginal => {
  const reel = await importOriginal<Record<string, unknown>>();
  const enveloppe: Record<string, unknown> = { ...reel };
  for (const [nom, f] of Object.entries(reel)) {
    if (typeof f !== 'function' || !nom.endsWith('Sync')) {
      continue;
    }
    enveloppe[nom] = (...args: unknown[]) => {
      const vise =
        piege.verrou !== null &&
        args.slice(0, 2).some(a => typeof a === 'string' && path.resolve(a) === piege.verrou);
      const suivant = vise && piege.contention && !piege.fait;
      try {
        return (f as (...a: unknown[]) => unknown)(...args);
      } catch (e) {
        if (vise && (e as NodeJS.ErrnoException).code === 'EEXIST') {
          piege.contention = true;
        }
        throw e;
      } finally {
        if (suivant) {
          piege.fait = true;
          piege.declencher();
        }
      }
    };
  }
  return { ...enveloppe, default: enveloppe };
});

// The lock is imported after the registry is emptied: a setup file of the base configuration may
// have loaded it already (the pressure, by the services of the core, grillhouse-3dr.2.2), with the
// real node:fs, and the adversary above must sit under the module this file judges.
vi.resetModules();
const { lacherVerrou, prendreVerrou } = await import('../../scripts/verrou-de-fichier.mjs');

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verrou-de-fichier-'));
const RACINE = path.resolve(__dirname, '../../../..');
const MODULE = pathToFileURL(
  path.join(RACINE, 'packages/grillhouse/scripts/verrou-de-fichier.mjs')
).href;

// A live process that is not the test's, and the number of a process that has ended.
const dormeur: ChildProcess = spawn('sleep', ['600'], { stdio: 'ignore' });
const PID_VIVANT = String(dormeur.pid);
const PID_MORT = String(spawnSync(process.execPath, ['-e', '']).pid);
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => {
  dormeur.kill();
});

let n = 0;
const unVerrou = () => path.join(ESSAIS, `registre-${++n}.jsonl.verrou`);
const poser = (verrou: string, contenu: string) => writeFileSync(verrou, contenu);
const vieillir = (verrou: string, ms: number) => {
  const t = (Date.now() - ms) / 1000;
  utimesSync(verrou, t, t);
};

// Another process takes the lock through the module, unarmed: { pris, contenu }.
function autrePreneur(verrou: string, perime: number): { pris: boolean; contenu: string } {
  const code = `
    import { readFileSync } from 'node:fs';
    import { prendreVerrou } from ${JSON.stringify(MODULE)};
    const pris = prendreVerrou(process.argv[1], { attendre: false, perime: ${perime} });
    console.log(JSON.stringify({ pris, contenu: readFileSync(process.argv[1], 'utf8') }));
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code, verrou], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(r.stderr);
  }
  return JSON.parse(r.stdout) as { pris: boolean; contenu: string };
}

describe('grillhouse-3uv.72 — le verrou de fichier (scripts/verrou-de-fichier.mjs)', () => {
  it('arbitrage, avec perime : un verrou récent, quel que soit son contenu, fait rendre false sans attente et reste', () => {
    for (const contenu of [PID_MORT, PID_VIVANT, String(process.pid), '', 'pas un pid']) {
      const verrou = unVerrou();
      poser(verrou, contenu);
      expect(prendreVerrou(verrou, { attendre: false, perime: 60_000 }), contenu).toBe(false);
      expect(readFileSync(verrou, 'utf8'), contenu).toBe(contenu);
    }
  });

  it('arbitrage, avec perime : un verrou plus vieux que perime est repris, quel que soit le pid qu’il porte', () => {
    for (const contenu of [PID_VIVANT, PID_MORT, '']) {
      const verrou = unVerrou();
      poser(verrou, contenu);
      vieillir(verrou, 60_000);
      expect(prendreVerrou(verrou, { attendre: false, perime: 30_000 }), contenu).toBe(true);
      expect(existsSync(verrou), contenu).toBe(true);
      expect(readFileSync(verrou, 'utf8'), contenu).not.toBe(contenu);
    }
  });

  it('arbitrage, sans perime (jugement au pid de l’intégration) : un verrou au pid vivant reste, même vieux', () => {
    const verrou = unVerrou();
    poser(verrou, PID_VIVANT);
    vieillir(verrou, 24 * 3600_000);
    expect(prendreVerrou(verrou, { attendre: false })).toBe(false);
    expect(readFileSync(verrou, 'utf8')).toBe(PID_VIVANT);
  });

  it('arbitrage, sans perime (jugement au pid de l’intégration) : un verrou au pid mort est repris, même récent', () => {
    const verrou = unVerrou();
    poser(verrou, PID_MORT);
    expect(prendreVerrou(verrou, { attendre: false })).toBe(true);
    expect(readFileSync(verrou, 'utf8')).not.toBe(PID_MORT);
  });

  it('critère 4 : la libération ne retire que le verrou de celui qui le libère, pas celui qu’un autre a repris après abandon', () => {
    const verrou = unVerrou();
    expect(prendreVerrou(verrou, { attendre: false, perime: 30_000 })).toBe(true);
    lacherVerrou(verrou);
    expect(existsSync(verrou)).toBe(false);

    expect(prendreVerrou(verrou, { attendre: false, perime: 30_000 })).toBe(true);
    vieillir(verrou, 60_000);
    const autre = autrePreneur(verrou, 30_000);
    expect(autre.pris).toBe(true);
    lacherVerrou(verrou);
    expect(existsSync(verrou)).toBe(true);
    expect(readFileSync(verrou, 'utf8')).toBe(autre.contenu);
  });

  it('critère 4 : la reprise d’un verrou abandonné n’efface pas un verrou neuf posé entre-temps ; jamais deux preneurs ensemble', () => {
    const verrou = unVerrou();
    poser(verrou, PID_MORT);
    vieillir(verrou, 60_000);
    let autre: { pris: boolean; contenu: string } | null = null;
    piege.declencher = () => {
      autre = autrePreneur(verrou, 30_000);
    };
    piege.verrou = path.resolve(verrou);
    let moi: boolean;
    try {
      moi = prendreVerrou(verrou, { attendre: false, perime: 30_000 });
    } finally {
      piege.verrou = null;
    }
    expect(piege.fait, 'l’autre preneur a agi pendant la reprise').toBe(true);
    const lui = autre as unknown as { pris: boolean; contenu: string };
    expect([moi, lui.pris], 'preneurs qui tiennent le verrou').not.toEqual([true, true]);
    if (lui.pris) {
      expect(readFileSync(verrou, 'utf8')).toBe(lui.contenu);
    }
  });
});
