// La passe lourde garde ce qu'elle consomme (`avecLaPasse` de scripts/passe-de-la-machine.mjs) :
// son scope est ouvert une fois le verrou pris et lu avant qu'il ne se rende, sa ligne va au
// registre du projet, et sans le moyen de mesurer la passe joue comme avant. Le scope est un port
// (`scope.ouvrir()` rend `{ lire }`, ou `{ raison }` quand rien ne mesure) : l'essai le simule, le
// vrai se joue la nuit. Le verrou se joue en processus, sur un fichier d'essai
// (GRILLHOUSE_VERROU_MACHINE), sans serveur de places.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPTS = path.resolve(__dirname, '../../scripts');
const PASSE = pathToFileURL(path.join(SCRIPTS, 'passe-de-la-machine.mjs')).href;
const VERROU = pathToFileURL(path.join(SCRIPTS, 'verrou-de-machine.mjs')).href;
const CONSOMMATION = pathToFileURL(path.join(SCRIPTS, 'consommation-des-passes.mjs')).href;

type Lecture = { cpuNs: number | null; memoirePic: number | null };
type Scope = { ouvrir: () => { lire: () => Lecture | null } | { raison: string } };
type Env = Record<string, string | undefined>;
type Options = {
  lourde: boolean;
  env: Env;
  racine: string;
  ticket?: string;
  sorte?: string;
  dire: (l: string) => void;
  scope: Scope;
  horloge: () => number;
  coeurs: number;
};
type Ligne = {
  sorte: string;
  ticket?: string;
  dureeMs: number;
  cpuNs: number | null;
  memoirePic: number | null;
  coeurs: number;
  issue: string;
  fin: string;
};

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'passe-lourde-mesuree-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
let n = 0;
const unDepot = (): string => {
  const d = path.join(ESSAIS, `depot-${++n}`);
  mkdirSync(d, { recursive: true });
  expect(spawnSync('git', ['-C', d, 'init', '-q'], { encoding: 'utf8' }).status).toBe(0);
  return d;
};
// Un environnement qui ne vient pas de celui du test : une enveloppe d'agent qui l'entourerait
// ferait passer la passe sans verrou.
const unEnvironnement = (): Env => ({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: ESSAIS,
  GRILLHOUSE_VERROU_MACHINE: path.join(ESSAIS, `verrou-${++n}.lock`),
});

const GO = 1024 ** 3;

// Un banc : un scope simulé qui note quand il s'ouvre et se lit, et si le verrou est alors tenu.
async function banc(lectures: (Lecture | null)[] = [{ cpuNs: 30e9, memoirePic: 3 * GO }]) {
  const { lireLeVerrou } = (await import(VERROU)) as {
    lireLeVerrou: (env: Env) => { detenteur: unknown };
  };
  const { avecLaPasse } = (await import(PASSE)) as {
    avecLaPasse: <T>(mesure: (env: Env) => T, o: Options) => T;
  };
  const { lireLaConsommation } = (await import(CONSOMMATION)) as {
    lireLaConsommation: (racine: string) => Ligne[];
  };
  const env = unEnvironnement();
  const racine = unDepot();
  const dites: string[] = [];
  const evenements: string[] = [];
  let t = 1_000;
  let ouvertures = 0;
  const scope: Scope = {
    ouvrir: () => {
      const i = ouvertures++;
      evenements.push(`ouvrir:${lireLeVerrou(env).detenteur ? 'verrou-tenu' : 'verrou-libre'}`);
      return {
        lire: () => {
          evenements.push(`lire:${lireLeVerrou(env).detenteur ? 'verrou-tenu' : 'verrou-libre'}`);
          return lectures[Math.min(i, lectures.length - 1)] ?? null;
        },
      };
    },
  };
  const options = (o: Partial<Options> = {}): Options => ({
    lourde: true,
    env,
    racine,
    dire: l => dites.push(l),
    scope,
    horloge: () => t,
    coeurs: 8,
    ...o,
  });
  const jouer = <T>(mesure: (e: Env) => T, o: Partial<Options> = {}): T =>
    avecLaPasse(mesure, options(o));
  return {
    jouer,
    avance: (ms: number) => (t += ms),
    dites,
    evenements,
    ouvertures: () => ouvertures,
    lignes: () => lireLaConsommation(racine),
    libre: () => lireLeVerrou(env).detenteur === null,
    env,
    options,
  };
}

describe('la passe lourde garde sa consommation', () => {
  it('ouvre le scope une fois le verrou pris, le lit avant que le verrou ne se rende', async () => {
    const b = await banc();
    const vu: string[] = [];
    b.jouer(() => {
      vu.push(...b.evenements);
      return { status: 0 };
    });
    expect(vu).toEqual(['ouvrir:verrou-tenu']);
    expect(b.evenements).toEqual(['ouvrir:verrou-tenu', 'lire:verrou-tenu']);
    expect(b.libre()).toBe(true);
  });
  it('garde une ligne avec sorte, ticket, durée, processeur, pic, cœurs, issue et date', async () => {
    const b = await banc([{ cpuNs: 30e9, memoirePic: 3 * GO }]);
    b.jouer(
      () => {
        b.avance(2500);
        return { status: 0 };
      },
      { sorte: 'controles', ticket: 'grillhouse-x.1' }
    );
    const [l] = b.lignes();
    expect(b.lignes()).toHaveLength(1);
    expect(l).toMatchObject({
      sorte: 'controles',
      ticket: 'grillhouse-x.1',
      dureeMs: 2500,
      cpuNs: 30e9,
      memoirePic: 3 * GO,
      coeurs: 8,
      issue: 'verte',
    });
    expect(Number.isNaN(Date.parse(l?.fin as string))).toBe(false);
  });
  it('une passe lancée seule, hors circuit, est de la sorte « verification », sans ticket', async () => {
    const b = await banc();
    b.jouer(() => ({ status: 0 }));
    const [l] = b.lignes();
    expect(l?.sorte).toBe('verification');
    expect('ticket' in (l as object)).toBe(false);
  });
  it('rend ce que la passe rend', async () => {
    const b = await banc();
    const r = b.jouer(() => ({ status: 0, valeur: 42 }));
    expect(r).toEqual({ status: 0, valeur: 42 });
  });
  it('une passe rouge garde sa mesure, dite rouge', async () => {
    const b = await banc();
    b.jouer(() => ({ status: 1 }));
    expect(b.lignes().map(l => l.issue)).toEqual(['rouge']);
  });
  it('une passe qui rend un code de sortie non nul garde sa mesure, dite rouge', async () => {
    const b = await banc();
    b.jouer(() => 1);
    expect(b.lignes().map(l => l.issue)).toEqual(['rouge']);
  });
  it('une passe tuée par un signal garde sa mesure, dite interrompue', async () => {
    const b = await banc();
    b.jouer(() => ({ status: null, signal: 'SIGTERM' }));
    expect(b.lignes().map(l => l.issue)).toEqual(['interrompue']);
  });
  it('une passe qui lève garde sa mesure, dite rouge, et relève son erreur, verrou rendu', async () => {
    const b = await banc();
    expect(() =>
      b.jouer(() => {
        throw new Error('la passe a cassé');
      })
    ).toThrow('la passe a cassé');
    expect(b.lignes().map(l => l.issue)).toEqual(['rouge']);
    expect(b.libre()).toBe(true);
  });
  it('deux passes ont chacune leur scope et ne se comptent pas l’une l’autre', async () => {
    const b = await banc([
      { cpuNs: 10e9, memoirePic: 1 * GO },
      { cpuNs: 50e9, memoirePic: 5 * GO },
    ]);
    b.jouer(() => ({ status: 0 }));
    b.jouer(() => ({ status: 0 }));
    expect(b.ouvertures()).toBe(2);
    expect(b.lignes().map(l => [l.cpuNs, l.memoirePic])).toEqual([
      [10e9, 1 * GO],
      [50e9, 5 * GO],
    ]);
  });
  it('une passe lancée sous le verrou tenu par son parent ne se mesure pas une seconde fois', async () => {
    const b = await banc();
    b.jouer(envEnfant => {
      b.jouer(() => ({ status: 0 }), { env: envEnfant });
      return { status: 0 };
    });
    expect(b.ouvertures()).toBe(1);
    expect(b.lignes()).toHaveLength(1);
  });
  it('une lecture du scope illisible garde une ligne sans valeurs', async () => {
    const b = await banc([null]);
    b.jouer(() => ({ status: 0 }));
    expect(b.lignes()).toHaveLength(1);
    expect(b.lignes()[0]).toMatchObject({ cpuNs: null, memoirePic: null, issue: 'verte' });
  });
});

describe('une passe qui n’est pas lourde', () => {
  it('ne garde aucune mesure et n’ouvre aucun scope', async () => {
    const b = await banc();
    const r = b.jouer(() => ({ status: 0 }), { lourde: false });
    expect(r).toEqual({ status: 0 });
    expect(b.ouvertures()).toBe(0);
    expect(b.lignes()).toEqual([]);
  });
});

describe('sans le moyen de mesurer', () => {
  it('la passe joue comme avant et le dit une fois, sans écrire de ligne', async () => {
    const b = await banc();
    let joue = 0;
    const r = b.jouer(
      () => {
        joue += 1;
        return { status: 0 };
      },
      { scope: { ouvrir: () => ({ raison: 'aucun gestionnaire systemd utilisateur joignable' }) } }
    );
    expect(r).toEqual({ status: 0 });
    expect(joue).toBe(1);
    const dites = b.dites.filter(l => l.includes('consommation non mesurée'));
    expect(dites).toEqual([
      'consommation non mesurée : aucun gestionnaire systemd utilisateur joignable',
    ]);
    expect(b.lignes()).toEqual([]);
    expect(b.libre()).toBe(true);
  });
  it('une passe rouge sans moyen de mesurer reste rouge et sans ligne', async () => {
    const b = await banc();
    const r = b.jouer(() => ({ status: 3 }), {
      scope: { ouvrir: () => ({ raison: 'pas de groupes de contrôle' }) },
    });
    expect(r).toEqual({ status: 3 });
    expect(b.lignes()).toEqual([]);
  });
  it('dans l’enveloppe d’un agent, la passe joue, le dit une fois et n’écrit aucune ligne', async () => {
    const b = await banc();
    let joue = 0;
    // Le scope simulé ne doit pas servir : l'enveloppe n'a pas le moyen de mesurer.
    const r = b.jouer(
      () => {
        joue += 1;
        return { status: 0 };
      },
      { env: { ...b.env, GRILLHOUSE_ENVELOPPE: 'packages/grillhouse' } }
    );
    expect(r).toEqual({ status: 0 });
    expect(joue).toBe(1);
    expect(b.dites.filter(l => l.includes('consommation non mesurée'))).toHaveLength(1);
    expect(b.ouvertures()).toBe(0);
    expect(b.lignes()).toEqual([]);
  });
});
