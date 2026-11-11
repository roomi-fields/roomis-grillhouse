// @poste: un serveur Temporal
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// grillhouse-9kq, critères 6 et 21, et grillhouse-4nr.12 (décision 2) : chaque passe du circuit
// prend une place de la machine, comme une séance d'agent ; une passe lourde (la passe finale, la
// vérification, les références) tient en plus le verrou exclusif de la machine, une fois sa place
// donnée. Interface : scripts/passe-de-la-machine.mjs, `avecLaPasse(mesure, { lourde, env, racine,
// ...options })`, qui passe à <mesure> l'environnement de ses enfants. Les places vivent sur un
// serveur d'essai (./machine-d-essai.ts), le verrou dans le fichier de la machine d'essai.
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { machineDesPlaces } from './machine-d-essai.js';

const MODULE = path.resolve(__dirname, '../../scripts/passe-de-la-machine.mjs');
const PLACES = path.resolve(__dirname, '../../scripts/places-de-la-machine.mjs');
const VERROU = path.resolve(__dirname, '../../scripts/verrou-de-machine.mjs');
/* eslint-disable @typescript-eslint/no-explicit-any */
const charger = (f: string): any => createRequire(path.join(__dirname, 'x.cjs'))(f);
const avecLaPasse = (...a: any[]) => charger(MODULE).avecLaPasse(...a);
const lirePlaces = (...a: any[]) => charger(PLACES).lirePlaces(...a);
const prendreUnePlace = (...a: any[]) => charger(PLACES).prendreUnePlace(...a);
/* eslint-enable @typescript-eslint/no-explicit-any */
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'passes-de-la-machine-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));
const MUET = { dire: () => {} };

// A child that holds the lock of the machine <env> until its death (a heavy pass under way).
async function passeLourdeEnCours(env: Record<string, string>): Promise<ChildProcess> {
  const source = `import * as V from ${JSON.stringify(pathToFileURL(VERROU).href)};
V.avecLaMachine(() => {
  process.stdout.write('tenu\\n');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000);
}, { env: process.env, racine: ${JSON.stringify(ESSAIS)}, dire() {} });`;
  const e = spawn(process.execPath, ['--input-type=module', '-e', source], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let texte = '';
  e.stdout?.on('data', d => (texte += String(d)));
  e.stderr?.on('data', d => (texte += String(d)));
  const fin = Date.now() + 60_000;
  while (!texte.includes('tenu')) {
    if (Date.now() > fin || e.exitCode !== null) {
      throw new Error(`le verrou n'est pas tenu : ${texte}`);
    }
    await attendre(25);
  }
  return e;
}
const tuer = (e: ChildProcess) =>
  new Promise<void>(r => {
    if (e.exitCode !== null) {
      return r();
    }
    e.on('exit', () => r());
    e.kill('SIGKILL');
  });

describe('une passe ciblée prend une place, pas le verrou', () => {
  it('while a heavy pass holds the lock, a targeted pass plays on a place', async () => {
    const { env } = await machineDesPlaces({ plafond: 3 });
    const lourde = await passeLourdeEnCours(env);
    try {
      let vue: unknown[] = [];
      const r = avecLaPasse(
        () => {
          vue = lirePlaces({ env }).prises;
          return 'jouee';
        },
        { ...MUET, lourde: false, env, racine: ESSAIS, borneMs: 5_000 }
      );
      expect(r).toBe('jouee');
      expect(vue).toHaveLength(1);
      expect(lirePlaces({ env }).prises).toHaveLength(0);
    } finally {
      await tuer(lourde);
    }
  }, 120_000);

  it('a targeted pass gives its place back when it throws', async () => {
    const { env } = await machineDesPlaces({ plafond: 3 });
    expect(() =>
      avecLaPasse(
        () => {
          throw new Error('rouge');
        },
        { ...MUET, lourde: false, env, racine: ESSAIS }
      )
    ).toThrow('rouge');
    expect(lirePlaces({ env }).prises).toHaveLength(0);
  }, 120_000);

  it('a heavy pass played inside a targeted one takes the lock on its place, without a second', async () => {
    const { env } = await machineDesPlaces({ plafond: 1 });
    let interieure = '';
    avecLaPasse(
      (envDeLaPasse: Record<string, string>) => {
        interieure = avecLaPasse(() => 'lourde-jouee', {
          ...MUET,
          lourde: true,
          env: envDeLaPasse,
          racine: ESSAIS,
          borneMs: 3_000,
        });
      },
      { ...MUET, lourde: false, env, racine: ESSAIS }
    );
    expect(interieure).toBe('lourde-jouee');
  }, 120_000);

  it('a targeted pass at the ceiling waits, says « place », then stops at 75', async () => {
    const { env } = await machineDesPlaces({ plafond: 1 });
    const prise = prendreUnePlace({ ...MUET, env });
    const dit: string[] = [];
    let erreur: { code?: number; message?: string } | null = null;
    try {
      avecLaPasse(() => 'jamais', {
        lourde: false,
        env,
        racine: ESSAIS,
        borneMs: 1_500,
        dire: (l: string) => dit.push(l),
      });
    } catch (e) {
      erreur = e as { code: number; message: string };
    }
    prise.rendre();
    expect(erreur?.code).toBe(75);
    expect(dit.join('\n') + (erreur?.message ?? '')).toMatch(/place/);
  }, 120_000);

  it('a targeted pass under a load that reaches the cores waits and says « charge »', async () => {
    const { env } = await machineDesPlaces({ plafond: 3, charge: 12 });
    const dit: string[] = [];
    let code: number | undefined;
    try {
      avecLaPasse(() => 'jamais', {
        lourde: false,
        env,
        racine: ESSAIS,
        borneMs: 1_500,
        dire: (l: string) => dit.push(l),
      });
    } catch (e) {
      code = (e as { code?: number }).code;
    }
    expect(code).toBe(75);
    expect(dit.join('\n')).toMatch(/charge/);
  }, 120_000);
});

describe('une passe lourde prend sa place, puis le verrou', () => {
  it('a heavy pass plays on a place of its own, then holds the lock', async () => {
    const { env } = await machineDesPlaces({ plafond: 2 });
    let vue = -1;
    const r = avecLaPasse(
      () => {
        vue = lirePlaces({ env }).prises.length;
        return 'jouee';
      },
      { ...MUET, lourde: true, env, racine: ESSAIS, borneMs: 5_000 }
    );
    expect(r).toBe('jouee');
    expect(vue).toBe(1);
    expect(lirePlaces({ env }).prises).toHaveLength(0);
  }, 120_000);

  it('the places all taken, a heavy pass waits for one and stops at 75, its lock never taken', async () => {
    const { env } = await machineDesPlaces({ plafond: 2 });
    const prises = [1, 2].map(() => prendreUnePlace({ ...MUET, env }));
    let joue = false;
    let code: number | undefined;
    try {
      avecLaPasse(
        () => {
          joue = true;
        },
        { ...MUET, lourde: true, env, racine: ESSAIS, borneMs: 1_500 }
      );
    } catch (e) {
      code = (e as { code?: number }).code;
    }
    prises.forEach(p => p.rendre());
    expect(code).toBe(75);
    expect(joue).toBe(false);
  }, 120_000);
});
