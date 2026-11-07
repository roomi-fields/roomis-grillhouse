/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// grillhouse-4nr.12 (décision 2) : les places de la machine (scripts/places-de-la-machine.mjs) se
// prennent et se lisent sur le déroulé de la machine, par un processus à elles
// (scripts/places-du-serveur.mjs), comme un appelant synchrone attend un verrou. Les cas jouent le
// module contre un serveur d'essai et le travailleur du cadre sur la file de la machine, le déroulé
// démarré avec une mesure fixe (la charge du poste ne décide pas) ; la machine d'essai nomme ce
// serveur (GRILLHOUSE_PLACES_D_ESSAI).
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { departDe } from '../../scripts/mesure/base-de-passe.mjs';
import { attendre, portLibre } from './essai.js';
import { machineDesPlaces } from './machine-d-essai.js';

const MODULE = path.resolve(__dirname, '../../scripts/places-de-la-machine.mjs');
/* eslint-disable @typescript-eslint/no-explicit-any */
const P = (): any => createRequire(path.join(__dirname, 'x.cjs'))(MODULE);
/* eslint-enable @typescript-eslint/no-explicit-any */

// A machine of trial of <plafond> places (./machine-d-essai.ts).
const machine = (plafond = 2) => machineDesPlaces({ plafond });

// A child that plays <corps> (the module `P` imported) under <env>, its output kept.
function enfant(
  env: Record<string, string>,
  corps: string
): ChildProcess & { sortie: () => string } {
  const source = `import * as P from ${JSON.stringify(pathToFileURL(MODULE).href)};\n${corps}`;
  const e = spawn(process.execPath, ['--input-type=module', '-e', source], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let texte = '';
  e.stdout?.on('data', d => (texte += String(d)));
  e.stderr?.on('data', d => (texte += String(d)));
  return Object.assign(e, { sortie: () => texte });
}
const fini = (e: ChildProcess) =>
  new Promise<number | null>(r => (e.exitCode !== null ? r(e.exitCode) : e.on('exit', c => r(c))));
// A child that holds a place under <env> until it is killed.
const tenir = (env: Record<string, string>, ticket: string) =>
  enfant(
    env,
    `P.prendreUnePlace({ env: process.env, ticket: ${JSON.stringify(ticket)}, dire() {} });
process.stdout.write('tenue\\n');
setInterval(() => {}, 1000);`
  );

describe('une place se prend, s’attend et se rend sur le serveur', () => {
  it('the ceiling reached, the next taking waits, says « place », then stops at 75, withdrawn', async () => {
    const { env } = await machine(1);
    const a = P().prendreUnePlace({ env, ticket: 'a', dire: () => {} });
    expect(a.id).toEqual(expect.any(String));
    const dit: string[] = [];
    let erreur: { code?: number; message?: string } | null = null;
    try {
      P().prendreUnePlace({ env, ticket: 'b', borneMs: 1_500, dire: (l: string) => dit.push(l) });
    } catch (e) {
      erreur = e as { code?: number; message?: string };
    }
    expect(erreur?.code).toBe(75);
    expect(erreur?.message).toMatch(/à repasser/);
    expect(dit[0]).toMatch(/attente d'une place : .*place/);
    const vue = P().lirePlaces({ env });
    expect(vue.prises.map((p: { ticket: string }) => p.ticket)).toEqual(['a']);
    expect(vue.attentes).toEqual([]);
    a.rendre();
    expect(P().lirePlaces({ env }).prises).toEqual([]);
  }, 120_000);

  it('a place given back is taken again at once, and given back twice frees no other', async () => {
    const { env } = await machine(2);
    const a = P().prendreUnePlace({ env, ticket: 'a', dire: () => {} });
    const b = P().prendreUnePlace({ env, ticket: 'b', dire: () => {} });
    a.rendre();
    a.rendre();
    expect(
      P()
        .lirePlaces({ env })
        .prises.map((p: { ticket: string }) => p.ticket)
    ).toEqual(['b']);
    const c = P().prendreUnePlace({ env, ticket: 'c', borneMs: 5_000, dire: () => {} });
    expect(c.id).toEqual(expect.any(String));
    b.rendre();
    c.rendre();
  }, 120_000);

  it('avecUnePlace holds the place while its session plays, and gives it back when it throws', async () => {
    const { env } = await machine(2);
    const pendant = P().avecUnePlace(() => P().lirePlaces({ env }).prises.length, {
      env,
      dire: () => {},
    });
    expect(pendant).toBe(1);
    expect(() =>
      P().avecUnePlace(
        () => {
          throw new Error('séance tombée');
        },
        { env, dire: () => {} }
      )
    ).toThrow('séance tombée');
    expect(P().lirePlaces({ env }).prises).toEqual([]);
  }, 120_000);

  it('the place carries the process of the session, and a place attached follows its process', async () => {
    const { env } = await machine(2);
    const place = P().prendreUnePlace({ env, ticket: 'a', dire: () => {} });
    expect(P().lirePlaces({ env }).prises).toMatchObject([
      { pid: process.pid, depart: departDe(process.pid), ticket: 'a' },
    ]);
    const s = spawn('sleep', ['60'], { stdio: 'ignore' });
    place.rattacher({ pid: s.pid, depart: departDe(s.pid!) });
    expect(P().lirePlaces({ env }).prises).toMatchObject([{ pid: s.pid }]);
    s.kill('SIGKILL');
    await attendre('la place libérée', () =>
      Promise.resolve(P().lirePlaces({ env }).prises.length === 0 ? true : undefined)
    );
  }, 120_000);

  it('a child killed frees its place, and the taking that waits passes', async () => {
    const { env } = await machine(1);
    const e = tenir(env, 'mort');
    await attendre('la place tenue', () =>
      Promise.resolve(e.sortie().includes('tenue') ? true : undefined)
    );
    const suivant = enfant(
      env,
      `const p = P.prendreUnePlace({ env: process.env, ticket: 'suivant', borneMs: 60000, dire() {} });
process.stdout.write('prise ' + p.id + '\\n');`
    );
    await attendre('l’attente du suivant', () =>
      Promise.resolve(P().lirePlaces({ env }).attentes.length === 1 ? true : undefined)
    );
    e.kill('SIGKILL');
    expect(await fini(suivant), suivant.sortie()).toBe(0);
    expect(suivant.sortie()).toMatch(/^prise /m);
  }, 120_000);
});

describe('le rang d’arrivée et les attentes se lisent sur le serveur', () => {
  it('prendreUnRang gives ranks that grow, and the waits read in the order of arrival with their ticket and reason', async () => {
    const { env } = await machine(1);
    const r1 = P().prendreUnRang({ env });
    const r2 = P().prendreUnRang({ env });
    expect(r2).toBe(r1 + 1);
    const tenue = P().prendreUnePlace({ env, ticket: 'tenue', rang: r1, dire: () => {} });
    const tard = enfant(
      env,
      `P.prendreUnePlace({ env: process.env, ticket: 'tard', rang: ${r2 + 5}, borneMs: 60000, dire() {} });`
    );
    await attendre('l’attente de tard', () =>
      Promise.resolve(P().lirePlaces({ env }).attentes.length === 1 ? true : undefined)
    );
    const tot = enfant(
      env,
      `P.prendreUnePlace({ env: process.env, ticket: 'tot', rang: ${r2}, borneMs: 60000, dire() {} });`
    );
    await attendre('l’attente de tot', () =>
      Promise.resolve(P().lirePlaces({ env }).attentes.length === 2 ? true : undefined)
    );
    const attentes = P().lirePlaces({ env }).attentes;
    expect(attentes.map((a: { ticket: string }) => a.ticket)).toEqual(['tot', 'tard']);
    expect(attentes[0].raison).toEqual(expect.any(String));
    tenue.rendre();
    tot.kill('SIGKILL');
    tard.kill('SIGKILL');
  }, 120_000);
});

describe('une place tenue passe sa marque aux passes qu’elle joue', () => {
  it('the environment of the place carries its mark, under which a pass takes no second place', async () => {
    const { env } = await machine(1);
    const place = P().prendreUnePlace({ env, ticket: 'seance', dire: () => {} });
    expect(place.env.GRILLHOUSE_PLACE_TENUE).toBe(place.id);
    const dedans = P().prendreUnePlace({ env: place.env, ticket: 'passe', dire: () => {} });
    expect(dedans.id).toBeNull();
    expect(P().lirePlaces({ env }).prises).toHaveLength(1);
    place.rendre();
  }, 120_000);
});

describe('une commande lancée à la main joue sur une place', () => {
  it('surUnePlace plays the pass on a place carrying its mark, and gives back its code', async () => {
    const { env } = await machine(1);
    const vus: unknown[] = [];
    const code = P().surUnePlace(
      (e: Record<string, string>) => {
        vus.push(e.GRILLHOUSE_PLACE_TENUE, P().lirePlaces({ env }).prises.length);
        return 3;
      },
      { env, dire: () => {} }
    );
    expect(code).toBe(3);
    expect(vus).toEqual([expect.any(String), 1]);
    expect(P().lirePlaces({ env }).prises).toEqual([]);
  }, 120_000);

  it('the places all taken, the command says why it stops and ends at 75', async () => {
    const { env } = await machine(1);
    const tenue = P().prendreUnePlace({ env, dire: () => {} });
    const dit: string[] = [];
    const code = P().surUnePlace(() => 0, {
      env: { ...env, GRILLHOUSE_ATTENTE_MACHINE_MS: '1500' },
      dire: (l: string) => dit.push(l),
    });
    tenue.rendre();
    expect(code).toBe(75);
    expect(dit.at(-1)).toMatch(/à repasser/);
  }, 120_000);
});

describe('le serveur des places est requis sur le poste', () => {
  it('a place that does not go back is said, and its pass keeps its code', async () => {
    const { env, tuerLeServeur } = await machine(1);
    const dit: string[] = [];
    const place = P().prendreUnePlace({ env, dire: (l: string) => dit.push(l) });
    await tuerLeServeur();
    expect(() => place.rendre()).not.toThrow();
    expect(dit.at(-1)).toMatch(
      /^⚠ la place .+ ne se rend pas .*libère à la fin de son processus\.$/s
    );
  }, 120_000);

  it('a server that does not answer stops the taking, named', async () => {
    const port = await portLibre();
    const env = {
      PATH: process.env.PATH ?? '',
      GRILLHOUSE_VERROU_MACHINE: process.env.GRILLHOUSE_VERROU_MACHINE ?? '',
      GRILLHOUSE_PLACES_D_ESSAI: `127.0.0.1:${port}`,
    };
    let erreur: { code?: number; message?: string } | null = null;
    try {
      P().prendreUnePlace({ env, dire: () => {} });
    } catch (e) {
      erreur = e as { code?: number; message?: string };
    }
    expect(erreur?.code).toBe(1);
    expect(erreur?.message).toMatch(/places de la machine ne se lisent pas.*requis sur le poste/s);
  }, 60_000);
});
