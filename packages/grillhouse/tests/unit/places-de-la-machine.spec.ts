// grillhouse-9kq — les places de la machine (scripts/places-de-la-machine.mjs) : un nombre fixe de
// places pour toute la machine, comme les exécuteurs de Jenkins et le serveur de tâches de GNU
// make ; une admission à la charge, comme `make -l` (un départ seulement sous la charge des cœurs,
// avec 4 Go de mémoire libres) ; une attente qui garde son rang d'arrivée. Chaque séance d'agent
// prend une place à son départ et la rend à sa fin ; l'état est commun à la machine, sous le
// cache de l'utilisateur, sous verrou de fichier. Témoin : 2026-11-02, charge 39 sur 12 cœurs
// avec cinq circuits à la fois.
//
// Les cas jouent le module dans le processus du test (une machine d'essai : un cache à soi par
// `XDG_CACHE_HOME`, la charge et la mémoire données), et dans des processus enfants quand le cas
// l'exige (un enfant tué, des départs simultanés, l'ordre d'arrivée).
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { departDe } from '../../scripts/mesure/base-de-passe.mjs';
import { createRequire } from 'node:module';

const MODULE = path.resolve(__dirname, '../../scripts/places-de-la-machine.mjs');
const GO = 1024 ** 3;
// Le module se charge à l'appel : s'il manque, chaque test échoue seul, au lieu du fichier entier.
/* eslint-disable @typescript-eslint/no-explicit-any */
const charger = (): any => createRequire(path.join(__dirname, 'x.cjs'))(MODULE);
const admission = (...a: any[]) => charger().admission(...a);
const avecUnePlace = (...a: any[]) => charger().avecUnePlace(...a);
const cheminDesPlaces = (...a: any[]) => charger().cheminDesPlaces(...a);
const lirePlaces = (...a: any[]) => charger().lirePlaces(...a);
const plafondDe = (...a: any[]) => charger().plafondDe(...a);
const prendreUnePlace = (...a: any[]) => charger().prendreUnePlace(...a);
const prendreUnRang = (...a: any[]) => charger().prendreUnRang(...a);
const travailleursDe = (...a: any[]) => charger().travailleursDe(...a);
/* eslint-enable @typescript-eslint/no-explicit-any */
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'places-de-la-machine-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let n = 0;
// Un cache à soi : l'environnement d'une machine d'essai, `plafond` places.
const machine = (plafond = 3) => {
  const cache = path.join(ESSAIS, `machine-${++n}`);
  mkdirSync(cache, { recursive: true });
  const env: Record<string, string> = {
    HOME: cache,
    XDG_CACHE_HOME: cache,
    GRILLHOUSE_PLACES: String(plafond),
  };
  return { cache, env };
};
// Les options d'un départ qui passe l'admission : charge basse, mémoire large, aucun espacement.
const LIBRE = {
  coeurs: 12,
  charge: () => 1,
  memoireLibre: () => 16 * GO,
  espacementMs: 0,
  borneMs: 5_000,
  dire: () => {},
};
const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));
async function jusqua(condition: () => boolean, ms = 60_000) {
  const fin = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > fin) throw new Error('la condition ne vient pas');
    await attendre(25);
  }
}

// Un enfant qui joue <corps> (module `P` importé), l'environnement <env> de la machine d'essai.
function enfant(env: Record<string, string>, corps: string): ChildProcess & { sortie: () => string } {
  const source = `import * as P from ${JSON.stringify(pathToFileURL(MODULE).href)};\n${corps}`;
  const e = spawn(process.execPath, ['--input-type=module', '-e', source], {
    env: { PATH: process.env.PATH ?? '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let texte = '';
  e.stdout?.on('data', d => (texte += String(d)));
  e.stderr?.on('data', d => (texte += String(d)));
  return Object.assign(e, { sortie: () => texte });
}
const fini = (e: ChildProcess) =>
  new Promise<number | null>(r => (e.exitCode !== null ? r(e.exitCode) : e.on('exit', c => r(c))));

describe('grillhouse-9kq critère 12 — le plafond : 3 par défaut, réglé par une variable d’environnement', () => {
  it('3 places sans variable', () => {
    expect(plafondDe({})).toBe(3);
  });

  it('GRILLHOUSE_PLACES règle le plafond', () => {
    expect(plafondDe({ GRILLHOUSE_PLACES: '5' })).toBe(5);
    expect(plafondDe({ GRILLHOUSE_PLACES: '1' })).toBe(1);
  });

  it.each(['abc', '0', '-2', '1.5', '3 places'])(
    'la valeur fautive « %s » est refusée par le nom de la variable',
    valeur => {
      expect(() => plafondDe({ GRILLHOUSE_PLACES: valeur })).toThrow(/GRILLHOUSE_PLACES/);
    }
  );
});

describe('grillhouse-9kq critères 5 et 17 — le nombre de travailleurs vaut max(1, cœurs ÷ places)', () => {
  it('12 cœurs, 3 places : 4 travailleurs', () => {
    expect(travailleursDe({ coeurs: 12, places: 3 })).toBe(4);
  });

  it('la division est entière : 12 cœurs, 5 places : 2', () => {
    expect(travailleursDe({ coeurs: 12, places: 5 })).toBe(2);
  });

  it('jamais moins de 1 : 2 cœurs, 3 places : 1', () => {
    expect(travailleursDe({ coeurs: 2, places: 3 })).toBe(1);
  });

  it('une seule place garde tous les cœurs', () => {
    expect(travailleursDe({ coeurs: 12, places: 1 })).toBe(12);
  });
});

describe('grillhouse-9kq critères 3 et 16 — l’admission à la charge, comme make -l', () => {
  const base = { coeurs: 12, charge: 3, memoireLibre: 16 * GO };

  it('sous la charge des cœurs, avec 4 Go libres : admis', () => {
    expect(admission(base)).toEqual({ ok: true });
  });

  it('la charge qui atteint le nombre de cœurs refuse, et dit « charge »', () => {
    const r = admission({ ...base, charge: 12 });
    expect(r.ok).toBe(false);
    expect(r.raison).toMatch(/charge/);
    expect(r.raison).toMatch(/12/);
  });

  it('une charge juste sous les cœurs passe', () => {
    expect(admission({ ...base, charge: 11.9 }).ok).toBe(true);
  });

  it('moins de 4 Go libres refuse, et dit « mémoire »', () => {
    const r = admission({ ...base, memoireLibre: 4 * GO - 1 });
    expect(r.ok).toBe(false);
    expect(r.raison).toMatch(/mémoire/);
  });

  it('4 Go libres exactement passent', () => {
    expect(admission({ ...base, memoireLibre: 4 * GO }).ok).toBe(true);
  });

  it('une prise sous une charge qui atteint les cœurs attend, dit pourquoi, puis s’arrête à « à repasser » (75)', () => {
    const { env } = machine();
    const dit: string[] = [];
    let erreur: { code?: number; message?: string } | null = null;
    try {
      prendreUnePlace({
        ...LIBRE,
        env,
        charge: () => 12,
        borneMs: 300,
        rappelMs: 50,
        dire: (l: string) => dit.push(l),
      });
    } catch (e) {
      erreur = e as { code: number; message: string };
    }
    expect(erreur?.code).toBe(75);
    expect(erreur?.message).toMatch(/charge/);
    expect(dit.join('\n')).toMatch(/charge/);
    expect(lirePlaces({ env }).prises).toEqual([]);
  });

  it('une prise sous 4 Go de mémoire libre attend et dit « mémoire »', () => {
    const { env } = machine();
    const dit: string[] = [];
    expect(() =>
      prendreUnePlace({
        ...LIBRE,
        env,
        memoireLibre: () => 3 * GO,
        borneMs: 300,
        dire: (l: string) => dit.push(l),
      })
    ).toThrow(/mémoire/);
    expect(dit.join('\n')).toMatch(/mémoire/);
  });

  it('l’attente d’une charge qui retombe finit par la prise', () => {
    const { env } = machine();
    let lectures = 0;
    const p = prendreUnePlace({ ...LIBRE, env, charge: () => (++lectures < 3 ? 20 : 1) });
    expect(lectures).toBeGreaterThanOrEqual(3);
    expect(lirePlaces({ env }).prises).toHaveLength(1);
    p.rendre();
  });
});

describe('grillhouse-9kq critères 1 et 7 — jamais plus de N places, rendues à la fin', () => {
  it('le plafond atteint, la prise suivante attend, dit « place », puis s’arrête à 75', () => {
    const { env } = machine(2);
    const a = prendreUnePlace({ ...LIBRE, env });
    const b = prendreUnePlace({ ...LIBRE, env });
    const dit: string[] = [];
    let erreur: { code?: number; message?: string } | null = null;
    try {
      prendreUnePlace({ ...LIBRE, env, borneMs: 300, dire: (l: string) => dit.push(l) });
    } catch (e) {
      erreur = e as { code: number; message: string };
    }
    expect(erreur?.code).toBe(75);
    expect(erreur?.message).toMatch(/place/);
    expect(dit.join('\n')).toMatch(/place/);
    expect(lirePlaces({ env }).prises).toHaveLength(2);
    a.rendre();
    b.rendre();
  });

  it('une place rendue se reprend aussitôt', () => {
    const { env } = machine(1);
    const a = prendreUnePlace({ ...LIBRE, env });
    a.rendre();
    expect(lirePlaces({ env }).prises).toEqual([]);
    prendreUnePlace({ ...LIBRE, env }).rendre();
  });

  it('une place rendue deux fois ne libère pas celle d’un autre', () => {
    const { env } = machine(2);
    const a = prendreUnePlace({ ...LIBRE, env, ticket: 'x-1' });
    const b = prendreUnePlace({ ...LIBRE, env, ticket: 'x-2' });
    a.rendre();
    a.rendre();
    expect(lirePlaces({ env }).prises.map((p: { ticket: string }) => p.ticket)).toEqual(['x-2']);
    b.rendre();
  });

  it('l’état est commun à la machine : un fichier sous ~/.cache/grillhouse (XDG_CACHE_HOME)', () => {
    const { env, cache } = machine();
    expect(cheminDesPlaces(env)).toBe(path.join(cache, 'grillhouse', path.basename(cheminDesPlaces(env))));
    const sans = { HOME: '/home/essai' };
    expect(cheminDesPlaces(sans)).toBe(
      path.join('/home/essai', '.cache', 'grillhouse', path.basename(cheminDesPlaces(env)))
    );
  });

  it('avecUnePlace tient la place le temps de la séance et la rend à sa fin', () => {
    const { env } = machine(1);
    const pendant = avecUnePlace(() => lirePlaces({ env }).prises.length, { ...LIBRE, env });
    expect(pendant).toBe(1);
    expect(lirePlaces({ env }).prises).toEqual([]);
  });

  it('avecUnePlace rend la place quand la séance lève', () => {
    const { env } = machine(1);
    expect(() =>
      avecUnePlace(
        () => {
          throw new Error('la séance échoue');
        },
        { ...LIBRE, env }
      )
    ).toThrow('la séance échoue');
    expect(lirePlaces({ env }).prises).toEqual([]);
  });

  it('un enfant tué (SIGKILL) libère sa place : la suivante passe', async () => {
    const { env } = machine(1);
    const e = enfant(
      env,
      `P.prendreUnePlace({ env: process.env, coeurs: 12, charge: () => 0, memoireLibre: () => 1e12, espacementMs: 0, borneMs: 5000, dire() {} });
       console.log('tenue'); setInterval(() => {}, 1000);`
    );
    await jusqua(() => e.sortie().includes('tenue'));
    expect(lirePlaces({ env }).prises).toHaveLength(1);
    expect(() => prendreUnePlace({ ...LIBRE, env, borneMs: 200 })).toThrow(/place/);
    e.kill('SIGKILL');
    await fini(e);
    prendreUnePlace({ ...LIBRE, env }).rendre();
  });
});

describe('grillhouse-9kq critère 8 — une place s’inscrit avec le processus et son début', () => {
  it('la place porte le pid et le début du processus de la séance', () => {
    const { env } = machine();
    const p = prendreUnePlace({ ...LIBRE, env });
    const [prise] = lirePlaces({ env }).prises;
    expect(prise.pid).toBe(process.pid);
    expect(prise.depart).toBe(departDe(process.pid));
    p.rendre();
  });

  it('un pid et un début donnés s’inscrivent tels quels (la séance lancée par le circuit)', () => {
    const { env } = machine();
    const p = prendreUnePlace({
      ...LIBRE,
      env,
      pid: process.pid,
      depart: departDe(process.pid),
      ticket: 'demo-1',
    });
    expect(lirePlaces({ env }).prises).toMatchObject([{ pid: process.pid, ticket: 'demo-1' }]);
    p.rendre();
  });

  it('le prochain lecteur libère la place dont le début diffère (le numéro réutilisé)', () => {
    const { env } = machine(1);
    prendreUnePlace({ ...LIBRE, env, pid: process.pid, depart: '1' });
    expect(lirePlaces({ env }).prises).toEqual([]);
    prendreUnePlace({ ...LIBRE, env }).rendre();
  });

  it('le prochain lecteur libère la place dont le processus n’existe plus, sans bail ni durée', async () => {
    const { env } = machine(1);
    const e = enfant(env, 'console.log(process.pid); setTimeout(() => {}, 100);');
    await jusqua(() => /\d+/.test(e.sortie()));
    const pid = Number(/\d+/.exec(e.sortie())?.[0]);
    const depart = departDe(pid) ?? '1';
    await fini(e);
    prendreUnePlace({ ...LIBRE, env, pid, depart });
    expect(lirePlaces({ env }).prises).toEqual([]);
  });
});

describe('grillhouse-9kq critères 10 et 14 — le rang d’arrivée', () => {
  it('prendreUnRang donne des rangs croissants, communs à la machine', () => {
    const { env } = machine();
    const a = prendreUnRang({ env });
    const b = prendreUnRang({ env });
    const c = prendreUnRang({ env });
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('un circuit arrivé avant passe avant celui arrivé après, même s’il attend depuis moins longtemps', async () => {
    const { env } = machine(1);
    const tenue = prendreUnePlace({ ...LIBRE, env });
    const avant = prendreUnRang({ env });
    const apres = prendreUnRang({ env });
    const corps = (rang: number, nom: string) => `
      try {
        const p = P.prendreUnePlace({ env: process.env, rang: ${rang}, ticket: '${nom}', coeurs: 12, charge: () => 0, memoireLibre: () => 1e12, espacementMs: 0, borneMs: 2500, dire() {} });
        console.log('PRIS ${nom} ' + Date.now());
        setTimeout(() => p.rendre(), 300);
      } catch (e) { console.log('REFUSE ${nom} ' + e.code); }`;
    // Le plus récent attend le premier, l'ancien l'attente ensuite : le rang décide, pas l'ordre des attentes.
    const b = enfant(env, corps(apres, 'apres'));
    await jusqua(() => lirePlaces({ env }).attentes.length === 1);
    const a = enfant(env, corps(avant, 'avant'));
    await jusqua(() => lirePlaces({ env }).attentes.length === 2);
    tenue.rendre();
    await Promise.all([fini(a), fini(b)]);
    const quand = (e: { sortie: () => string }, nom: string) =>
      Number(new RegExp(`PRIS ${nom} (\\d+)`).exec(e.sortie())?.[1]);
    expect(quand(a, 'avant')).toBeGreaterThan(0);
    expect(quand(b, 'apres')).toBeGreaterThan(quand(a, 'avant'));
  });

  it('les attentes se lisent dans l’ordre d’arrivée, avec leur ticket et leur raison', async () => {
    const { env } = machine(1);
    const tenue = prendreUnePlace({ ...LIBRE, env });
    const r1 = prendreUnRang({ env });
    const r2 = prendreUnRang({ env });
    const corps = (rang: number, nom: string) =>
      `try { P.prendreUnePlace({ env: process.env, rang: ${rang}, ticket: '${nom}', coeurs: 12, charge: () => 0, memoireLibre: () => 1e12, espacementMs: 0, borneMs: 1500, dire() {} }); } catch {}`;
    const b = enfant(env, corps(r2, 'second'));
    const a = enfant(env, corps(r1, 'premier'));
    await jusqua(() => lirePlaces({ env }).attentes.length === 2);
    expect(lirePlaces({ env }).attentes.map((x: { ticket: string }) => x.ticket)).toEqual([
      'premier',
      'second',
    ]);
    tenue.rendre();
    await Promise.all([fini(a), fini(b)]);
  });
});

describe('grillhouse-9kq critère 15 — la mesure et la prise sous le même verrou, deux départs espacés', () => {
  it('deux départs sont espacés : le second attend et dit « espacement »', () => {
    const { env } = machine();
    const dit: string[] = [];
    const a = prendreUnePlace({ ...LIBRE, env });
    let erreur: { code?: number; message?: string } | null = null;
    try {
      prendreUnePlace({
        ...LIBRE,
        env,
        espacementMs: 60_000,
        borneMs: 300,
        dire: (l: string) => dit.push(l),
      });
    } catch (e) {
      erreur = e as { code: number; message: string };
    }
    expect(erreur?.code).toBe(75);
    expect(erreur?.message).toMatch(/espacement/);
    expect(dit.join('\n')).toMatch(/espacement/);
    a.rendre();
  });

  it('l’espacement est réglable par GRILLHOUSE_ESPACEMENT_MS', () => {
    const { env } = machine();
    const a = prendreUnePlace({
      ...LIBRE,
      env: { ...env, GRILLHOUSE_ESPACEMENT_MS: '60000' },
      espacementMs: undefined,
    });
    expect(() =>
      prendreUnePlace({
        ...LIBRE,
        env: { ...env, GRILLHOUSE_ESPACEMENT_MS: '60000' },
        espacementMs: undefined,
        borneMs: 300,
      })
    ).toThrow(/espacement/);
    a.rendre();
  });

  it('la charge se mesure sous le verrou de la prise : à charge égale à une place par départ, les départs ne passent pas tous', () => {
    // Chaque séance qui démarre ajoute 4 à la charge : trois places libres, 12 cœurs, la charge
    // lue après chaque prise compte les places prises. Le quatrième départ ne passe pas.
    const { env } = machine(10);
    const prises: Array<{ rendre: () => void }> = [];
    const charge = () => 4 * lirePlaces({ env }).prises.length;
    const essai = () => prendreUnePlace({ ...LIBRE, env, charge, borneMs: 200 });
    prises.push(essai(), essai(), essai());
    expect(essai).toThrow(/charge/);
    for (const p of prises) p.rendre();
  });

  it('trois départs simultanés ne passent pas tous le test', async () => {
    const { env } = machine(3);
    const corps = `
      try {
        P.prendreUnePlace({ env: process.env, coeurs: 12, charge: () => 0, memoireLibre: () => 1e12, espacementMs: 8000, borneMs: 1500, dire() {} });
        console.log('PRIS'); setTimeout(() => {}, 2500);
      } catch (e) { console.log('ATTENTE ' + e.code); }`;
    const trois = [enfant(env, corps), enfant(env, corps), enfant(env, corps)];
    await Promise.all(trois.map(fini));
    const sorties = trois.map(e => e.sortie());
    expect(sorties.filter(s => s.includes('PRIS'))).toHaveLength(1);
    expect(sorties.filter(s => s.includes('ATTENTE 75'))).toHaveLength(2);
  });
});

describe('grillhouse-9kq critère 9 — la borne de l’attente est celle du verrou de la machine', () => {
  it('GRILLHOUSE_ATTENTE_MACHINE_MS borne l’attente d’une place : « à repasser » (75)', () => {
    const { env } = machine(1);
    const a = prendreUnePlace({ ...LIBRE, env });
    const { borneMs: _, ...sansBorne } = LIBRE;
    void _;
    let erreur: { code?: number } | null = null;
    try {
      prendreUnePlace({ ...sansBorne, env: { ...env, GRILLHOUSE_ATTENTE_MACHINE_MS: '250' } });
    } catch (e) {
      erreur = e as { code: number };
    }
    expect(erreur?.code).toBe(75);
    a.rendre();
  });

  it('une attente de place se nomme dans l’état commun (ticket, raison) et s’efface quand elle finit', () => {
    const { env } = machine(1);
    const a = prendreUnePlace({ ...LIBRE, env });
    expect(() => prendreUnePlace({ ...LIBRE, env, ticket: 'demo-2', borneMs: 200 })).toThrow();
    expect(lirePlaces({ env }).attentes).toEqual([]);
    a.rendre();
  });
});
