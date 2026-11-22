// @equipee: un serveur Temporal
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// Une passe (ciblée ou lourde) prend sa part de la machine, jamais une place : les places sont
// celles des séances d'agent et des circuits, la part seule borne une passe. Interface :
// scripts/passe-de-la-machine.mjs, `avecLaPasse(mesure, { lourde, env, racine, ...options })`, qui
// passe à <mesure> l'environnement de ses enfants, et scripts/places-de-la-machine.mjs
// (`prendreUnePart`, `lirePlaces`, `lireLesParts`). Les places vivent sur un serveur d'essai
// (./machine-d-essai.ts), les parts dans le dossier d'état de la machine d'essai.
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { machineDesPlaces } from './machine-d-essai.js';

const MODULE = path.resolve(__dirname, '../../scripts/passe-de-la-machine.mjs');
const PLACES = path.resolve(__dirname, '../../scripts/places-de-la-machine.mjs');
/* eslint-disable @typescript-eslint/no-explicit-any */
const charger = (f: string): any => createRequire(path.join(__dirname, 'x.cjs'))(f);
const avecLaPasse = (...a: any[]) => charger(MODULE).avecLaPasse(...a);
const lirePlaces = (...a: any[]) => charger(PLACES).lirePlaces(...a);
const lireLesParts = (...a: any[]) => charger(PLACES).lireLesParts(...a);
const dossierDesParts = (...a: any[]) => charger(PLACES).dossierDesParts(...a);
const prendreUnePlace = (...a: any[]) => charger(PLACES).prendreUnePlace(...a);
/* eslint-enable @typescript-eslint/no-explicit-any */
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'passes-de-la-machine-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
// Un projet dont la part déclarée dépasse le budget : sa part est le budget entier.
const TENANT = path.join(ESSAIS, 'tenant');
mkdirSync(TENANT);
writeFileSync(
  path.join(TENANT, 'package.json'),
  JSON.stringify({ name: 'tenant', grillhouse: { part: { coeurs: 1000, memoireGo: 1000 } } })
);
execFileSync('git', ['-C', TENANT, 'init', '-q']);
const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));
// Sans groupe de contrôle : la passe joue sur sa part seule, ce que ces cas mesurent.
const SANS_GROUPE = { sonde: () => false };
const MUET = { dire: () => {}, ...SANS_GROUPE };

// A child that holds the whole budget of the machine <env> until its death (a pass under way).
async function passeEnCours(env: Record<string, string>): Promise<ChildProcess> {
  const source = `import * as P from ${JSON.stringify(pathToFileURL(PLACES).href)};
P.prendreUnePart({ env: process.env, racine: ${JSON.stringify(TENANT)}, dire() {} });
process.stdout.write('tenu\\n');
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000);`;
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
      throw new Error(`le budget n'est pas tenu : ${texte}`);
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

describe.each([
  ['ciblée', false],
  ['lourde', true],
])('une passe %s prend sa part, pas une place', (_nom, lourde) => {
  it('plays on its part, with no place taken, and gives the part back at its end', async () => {
    const { env } = await machineDesPlaces({ plafond: 1 });
    let places = -1;
    let parts = -1;
    const r = avecLaPasse(
      () => {
        places = lirePlaces({ env }).prises.length;
        parts = lireLesParts(dossierDesParts(env)).prises.length;
        return 'jouee';
      },
      { ...MUET, lourde, env, racine: ESSAIS, borneMs: 5_000 }
    );
    expect(r).toBe('jouee');
    expect(places).toBe(0);
    expect(parts).toBe(1);
    expect(lireLesParts(dossierDesParts(env)).prises).toHaveLength(0);
  }, 120_000);

  it('plays at the ceiling of the places all taken: the places are not its', async () => {
    const { env } = await machineDesPlaces({ plafond: 1 });
    const prise = prendreUnePlace({ ...MUET, env });
    try {
      const r = avecLaPasse(() => 'jouee', {
        ...MUET,
        lourde,
        env,
        racine: ESSAIS,
        borneMs: 5_000,
      });
      expect(r).toBe('jouee');
    } finally {
      prise.rendre();
    }
  }, 120_000);

  it('gives its part back when it throws', async () => {
    const { env } = await machineDesPlaces({ plafond: 1 });
    expect(() =>
      avecLaPasse(
        () => {
          throw new Error('rouge');
        },
        { ...MUET, lourde, env, racine: ESSAIS }
      )
    ).toThrow('rouge');
    expect(lireLesParts(dossierDesParts(env)).prises).toHaveLength(0);
  }, 120_000);

  it('waits while the budget is held, says what it waits for, then stops at 75', async () => {
    const { env } = await machineDesPlaces({ plafond: 3 });
    const tenue = await passeEnCours(env);
    const dit: string[] = [];
    let code: number | undefined;
    let joue = false;
    try {
      avecLaPasse(
        () => {
          joue = true;
        },
        {
          ...SANS_GROUPE,
          lourde,
          env,
          racine: ESSAIS,
          borneMs: 1_500,
          dire: (l: string) => dit.push(l),
        }
      );
    } catch (e) {
      code = (e as { code?: number }).code;
    } finally {
      await tuer(tenue);
    }
    expect(code).toBe(75);
    expect(joue).toBe(false);
    expect(dit.join('\n')).toMatch(/cœurs/);
  }, 120_000);

  it('under a load that reaches the cores waits and says « charge »', async () => {
    const { env } = await machineDesPlaces({ plafond: 3, charge: 12 });
    const dit: string[] = [];
    let code: number | undefined;
    try {
      avecLaPasse(() => 'jamais', {
        ...SANS_GROUPE,
        lourde,
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
