// grillhouse-9kq, critères 6 et 21 (décision 6) : les contrôles et la preuve du rouge, qui ne jouent
// que les tests du ticket, prennent une place comme une séance d'agent, et non le verrou exclusif de
// la machine ; le verrou ne sert qu'aux passes lourdes (passe finale, vérification, nuit, références).
// Interface : scripts/passe-de-la-machine.mjs — `passeLourde({ etape, args })` dit si une commande
// du circuit est une passe lourde ; `avecLaPasse(mesure, { lourde, env, racine, ...options })` la joue
// sous le verrou (lourde) ou sur une place (ciblée), et passe son environnement à <mesure>.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';

const MODULE = path.resolve(__dirname, '../../scripts/passe-de-la-machine.mjs');
const PLACES = path.resolve(__dirname, '../../scripts/places-de-la-machine.mjs');
const VERROU = path.resolve(__dirname, '../../scripts/verrou-de-machine.mjs');
const GO = 1024 ** 3;
/* eslint-disable @typescript-eslint/no-explicit-any */
const charger = (f: string): any => createRequire(path.join(__dirname, 'x.cjs'))(f);
const passeLourde = (...a: any[]) => charger(MODULE).passeLourde(...a);
const avecLaPasse = (...a: any[]) => charger(MODULE).avecLaPasse(...a);
const lirePlaces = (...a: any[]) => charger(PLACES).lirePlaces(...a);
const prendreUnePlace = (...a: any[]) => charger(PLACES).prendreUnePlace(...a);
/* eslint-enable @typescript-eslint/no-explicit-any */
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'passes-ciblees-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let n = 0;
const machine = (plafond = 3) => {
  const cache = path.join(ESSAIS, `machine-${++n}`);
  mkdirSync(cache, { recursive: true });
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: cache,
    XDG_CACHE_HOME: cache,
    GRILLHOUSE_PLACES: String(plafond),
  };
  return { cache, env };
};
const LIBRE = {
  coeurs: 12,
  charge: () => 1,
  memoireLibre: () => 16 * GO,
  espacementMs: 0,
  borneMs: 5_000,
  dire: () => {},
};
const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));

// Un enfant qui tient le verrou de la machine <env> jusqu'à sa mort (une passe lourde en cours).
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
    if (Date.now() > fin || e.exitCode !== null) throw new Error(`le verrou n'est pas tenu : ${texte}`);
    await attendre(25);
  }
  return e;
}
const tuer = (e: ChildProcess) =>
  new Promise<void>(r => {
    if (e.exitCode !== null) return r();
    e.on('exit', () => r());
    e.kill('SIGKILL');
  });

describe('grillhouse-9kq critère 6 — quelle commande est une passe lourde', () => {
  it('la passe finale (npm run verifier) est lourde', () => {
    expect(passeLourde({ etape: 'controles', args: ['run', 'verifier'] })).toBe(true);
  });
  it('la passe finale restreinte aux fichiers changés reste lourde', () => {
    expect(
      passeLourde({ etape: 'controles', args: ['run', 'verifier', '--', '--filter=...[a...b]'] })
    ).toBe(true);
  });
  it('la preuve du rouge (npm test sur les tests du lot) est ciblée', () => {
    expect(passeLourde({ etape: 'preuve', args: ['test', '--', '--force', 'a/b.spec.ts'] })).toBe(false);
  });
  it('la preuve sur un paquet entier est ciblée', () => {
    expect(passeLourde({ etape: 'preuve', args: ['test', '--', 'packages/x'] })).toBe(false);
  });
  it('les contrôles qui ne jouent que les tests du ticket (npm test) sont ciblés', () => {
    expect(passeLourde({ etape: 'controles', args: ['test', '--', 'packages/x/tests/a.spec.ts'] })).toBe(
      false
    );
  });
  it('les gardes d’une copie (npm run verifier -- --gardes) restent lourdes : verifier, quel que soit l’étape', () => {
    expect(passeLourde({ etape: 'controles', args: ['run', 'verifier', '--', '--gardes'] })).toBe(true);
  });
});

describe('grillhouse-9kq critères 6 et 21 — une passe ciblée prend une place, pas le verrou', () => {
  it('pendant qu’une passe lourde tient le verrou, une passe ciblée part sur une place', async () => {
    const { env } = machine(3);
    const lourde = await passeLourdeEnCours(env);
    try {
      let vue: unknown[] = [];
      const r = avecLaPasse(
        () => {
          vue = lirePlaces({ env }).prises;
          return 'jouee';
        },
        { ...LIBRE, lourde: false, env, racine: ESSAIS, borneMs: 3_000 }
      );
      expect(r).toBe('jouee');
      expect(vue).toHaveLength(1);
      expect(lirePlaces({ env }).prises).toHaveLength(0);
    } finally {
      await tuer(lourde);
    }
  });

  it('une passe ciblée rend sa place quand elle lève', () => {
    const { env } = machine(3);
    expect(() =>
      avecLaPasse(
        () => {
          throw new Error('rouge');
        },
        { ...LIBRE, lourde: false, env, racine: ESSAIS }
      )
    ).toThrow('rouge');
    expect(lirePlaces({ env }).prises).toHaveLength(0);
  });

  it('une passe ciblée ne prend pas le verrou : une passe lourde part pendant qu’elle joue', () => {
    const { env } = machine(3);
    let interieure = '';
    avecLaPasse(
      () => {
        interieure = avecLaPasse(() => 'lourde-jouee', {
          ...LIBRE,
          lourde: true,
          env,
          racine: ESSAIS,
          borneMs: 3_000,
        });
      },
      { ...LIBRE, lourde: false, env, racine: ESSAIS }
    );
    expect(interieure).toBe('lourde-jouee');
  });

  it('une passe ciblée au plafond attend, dit « place », puis sort à 75', () => {
    const { env } = machine(1);
    const prise = prendreUnePlace({ ...LIBRE, env });
    const dit: string[] = [];
    let erreur: { code?: number; message?: string } | null = null;
    try {
      avecLaPasse(() => 'jamais', {
        ...LIBRE,
        lourde: false,
        env,
        racine: ESSAIS,
        borneMs: 300,
        dire: (l: string) => dit.push(l),
      });
    } catch (e) {
      erreur = e as { code: number; message: string };
    }
    prise.rendre();
    expect(erreur?.code).toBe(75);
    expect(dit.join('\n') + (erreur?.message ?? '')).toMatch(/place/);
  });

  it('une passe ciblée sous une charge qui atteint les cœurs attend et dit « charge »', () => {
    const { env } = machine(3);
    const dit: string[] = [];
    let code: number | undefined;
    try {
      avecLaPasse(() => 'jamais', {
        ...LIBRE,
        lourde: false,
        env,
        racine: ESSAIS,
        charge: () => 12,
        borneMs: 300,
        dire: (l: string) => dit.push(l),
      });
    } catch (e) {
      code = (e as { code?: number }).code;
    }
    expect(code).toBe(75);
    expect(dit.join('\n')).toMatch(/charge/);
  });
});

describe('grillhouse-9kq critère 21 — une passe lourde part sans attendre les séances sur une place', () => {
  it('trois places prises, la passe lourde joue sans attendre leur fin, et ne prend aucune place', () => {
    const { env } = machine(3);
    const prises = [1, 2, 3].map(() => prendreUnePlace({ ...LIBRE, env }));
    let vue = -1;
    const r = avecLaPasse(
      () => {
        vue = lirePlaces({ env }).prises.length;
        return 'jouee';
      },
      { ...LIBRE, lourde: true, env, racine: ESSAIS, borneMs: 3_000 }
    );
    prises.forEach(p => p.rendre());
    expect(r).toBe('jouee');
    expect(vue).toBe(3);
  });
});
