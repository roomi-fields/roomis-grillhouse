// @poste: un serveur Temporal
// The nights of the machine under Temporal (src/temporal/nuits/), played on a development server of
// trial (the pinned program TEMPORAL on a free port, a database file of its own) with a worker of
// this process whose activities are simulated: the choice of the projects, the note of a skip and
// the pass of a night record their calls. The one workflow of the nights plays the nights one
// after the other, a red night or a failed activity never stopping those after it; a request by
// hand joins the workflow that runs, a project already in its queue or under way not put in
// twice; the one schedule is created once and updated when played again, and its firing asks the
// workflow for the scheduled nights.
import path from 'node:path';
import { NativeConnection, Worker } from '@temporalio/worker';
import { afterEach, describe, expect, it } from 'vitest';
import { ATTRIBUTS_DE_RECHERCHE, ouvrirLeClient } from '../../src/temporal/client.js';
import {
  demanderDesNuits,
  heureDeLaPlanification,
  lireLesNuits,
  optionsDeLaPlanification,
  planifierLesNuits,
} from '../../src/temporal/nuits/client.js';
import {
  ID_DES_NUITS,
  type ActivitesDesNuits,
  type ChoixDesNuits,
  type Saut,
  type VueDesNuits,
} from '../../src/temporal/nuits/contrat.js';
import {
  PAQUET,
  attendre,
  demarrerLeServeur,
  dossier,
  portLibre,
  programmeTemporal,
} from './essai.js';

const DEROULES = path.join(PAQUET, 'dist/temporal/deroules.js');
const FILE = 'essai-nuits';

const arrets: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const a of arrets.splice(0)) {
    await a();
  }
});

// What the simulated activities do and record: the choice they give, the verdict of each night
// (a code, or a failure), the nights that wait for their release.
function machine(choix: ChoixDesNuits, verdicts: Record<string, number | 'echec'> = {}) {
  const notes: Saut[] = [];
  const debuts: string[] = [];
  // The reservations of the machine and the nights, in their order: « reserver:<jeton> »,
  // « nuit:<racine>:<jeton> », « lever:<jeton> ».
  const journal: string[] = [];
  let enCours = 0;
  let auPlus = 0;
  const liberer = new Map<string, () => void>();
  const retenues = new Set<string>();
  let client: Parameters<typeof demanderDesNuits>[0] | null = null;
  const activites: ActivitesDesNuits = {
    choisirLesNuits: () => Promise.resolve(choix),
    noterLeSaut: s => {
      notes.push(s);
      return Promise.resolve();
    },
    reserverLaMachine: ({ jeton }) => {
      journal.push(`reserver:${jeton}`);
      return Promise.resolve();
    },
    leverLaMachine: ({ jeton }) => {
      journal.push(`lever:${jeton}`);
      return Promise.resolve();
    },
    jouerLaNuit: async ({ racine, jeton }) => {
      journal.push(`nuit:${racine}:${jeton}`);
      debuts.push(racine);
      enCours += 1;
      auPlus = Math.max(auPlus, enCours);
      try {
        if (retenues.has(racine)) {
          await new Promise<void>(ok => liberer.set(racine, ok));
        } else {
          await new Promise(ok => setTimeout(ok, 300));
        }
        const v = verdicts[racine] ?? 0;
        if (v === 'echec') {
          throw new Error(`la nuit de ${racine} échoue`);
        }
        return v;
      } finally {
        enCours -= 1;
      }
    },
    demanderLesNuitsPlanifiees: () =>
      demanderDesNuits(client!, { planifiee: true }, { file: FILE }),
  };
  return {
    activites,
    notes,
    debuts,
    journal,
    auPlus: () => auPlus,
    retenir: (racine: string) => retenues.add(racine),
    liberer: (racine: string) => liberer.get(racine)?.(),
    lier: (c: NonNullable<typeof client>) => {
      client = c;
    },
  };
}

// A server of trial, a worker of this process on FILE with <activites>, a client.
async function serveur(activites: ActivitesDesNuits) {
  const port = await portLibre();
  const s = await demarrerLeServeur(
    programmeTemporal(),
    path.join(dossier('nuits'), 'temporal.db'),
    port,
    ATTRIBUTS_DE_RECHERCHE
  );
  arrets.push(() => s.tuer());
  const connexion = await NativeConnection.connect({ address: s.adresse });
  const travailleur = await Worker.create({
    connection: connexion,
    taskQueue: FILE,
    workflowsPath: DEROULES,
    activities: activites,
  });
  const fin = travailleur.run();
  arrets.unshift(async () => {
    travailleur.shutdown();
    await fin;
    await connexion.close();
  });
  const c = ouvrirLeClient({ adresse: s.adresse });
  arrets.unshift(() => c.fermer());
  return c.client;
}

const resultat = (client: Awaited<ReturnType<typeof serveur>>) =>
  client.workflow.getHandle(ID_DES_NUITS).result() as Promise<VueDesNuits>;

describe('the scheduled nights play one after the other', () => {
  it('each night starts at the end of the one before, a red night or a failure stopping none after it', async () => {
    const m = machine(
      { jouer: ['/depot/a', '/depot/b', '/depot/c'], sautes: [], ecartes: [] },
      { '/depot/a': 1, '/depot/b': 'echec' }
    );
    const client = await serveur(m.activites);
    m.lier(client);
    await demanderDesNuits(client, { planifiee: true }, { file: FILE });
    const vue = await resultat(client);
    expect(vue.jouees.map(j => [j.racine, j.code])).toEqual([
      ['/depot/a', 1],
      ['/depot/b', null],
      ['/depot/c', 0],
    ]);
    expect(vue.jouees[1]!.echec).toBeTruthy();
    expect(m.auPlus()).toBe(1);
  }, 120_000);

  it('a project skipped is noted with its reason, and a project left out keeps its reason', async () => {
    const saut: Saut = {
      racine: '/depot/b',
      raison: 'son sommet abc1234 est celui de sa dernière nuit verte : rien n’a bougé',
      sommet: 'a'.repeat(40),
      reference: 'a'.repeat(40),
    };
    const m = machine({
      jouer: ['/depot/a'],
      sautes: [saut],
      ecartes: [{ racine: '/depot/c', raison: 'sa racine n’existe plus' }],
    });
    const client = await serveur(m.activites);
    await demanderDesNuits(client, { planifiee: true }, { file: FILE });
    const vue = await resultat(client);
    expect(m.notes).toEqual([saut]);
    expect(vue.sautes).toEqual([saut]);
    expect(vue.ecartes).toEqual([{ racine: '/depot/c', raison: 'sa racine n’existe plus' }]);
    expect(m.debuts).toEqual(['/depot/a']);
  }, 120_000);
});

// The jeton of the reservation of a journal: the one of its first « reserver:<jeton> ».
const jetonDe = (journal: string[]) =>
  journal.find(l => l.startsWith('reserver:'))?.slice('reserver:'.length);

describe('the nights reserve the whole machine once, before the first night, and lift it after the last', () => {
  it('reserves once for several nights, each night carries its jeton, then lifts', async () => {
    const m = machine({ jouer: ['/depot/a', '/depot/b', '/depot/c'], sautes: [], ecartes: [] });
    const client = await serveur(m.activites);
    await demanderDesNuits(client, { planifiee: true }, { file: FILE });
    await resultat(client);
    const jeton = jetonDe(m.journal);
    expect(jeton).toBeTruthy();
    expect(m.journal).toEqual([
      `reserver:${jeton}`,
      `nuit:/depot/a:${jeton}`,
      `nuit:/depot/b:${jeton}`,
      `nuit:/depot/c:${jeton}`,
      `lever:${jeton}`,
    ]);
  }, 120_000);

  it('lifts it when a night fails, ends red or ends with 75, and the nights after it play', async () => {
    const m = machine(
      { jouer: ['/depot/a', '/depot/b', '/depot/c'], sautes: [], ecartes: [] },
      { '/depot/a': 75, '/depot/b': 'echec', '/depot/c': 1 }
    );
    const client = await serveur(m.activites);
    await demanderDesNuits(client, { planifiee: true }, { file: FILE });
    await resultat(client);
    const jeton = jetonDe(m.journal);
    expect(m.journal.filter(l => l.startsWith('reserver:'))).toHaveLength(1);
    expect(m.journal.filter(l => l.startsWith('nuit:'))).toHaveLength(3);
    expect(m.journal.at(-1)).toBe(`lever:${jeton}`);
    expect(m.journal.filter(l => l.startsWith('lever:'))).toHaveLength(1);
  }, 120_000);

  it('lifts it when the workflow is cancelled during a night', async () => {
    const m = machine({ jouer: ['/depot/a'], sautes: [], ecartes: [] });
    m.retenir('/depot/a');
    const client = await serveur(m.activites);
    await demanderDesNuits(client, { planifiee: true }, { file: FILE });
    await attendre('la nuit de a en cours', async () =>
      (await lireLesNuits(client)).enCours === '/depot/a' ? true : undefined
    );
    await client.workflow.getHandle(ID_DES_NUITS).cancel();
    const jeton = jetonDe(m.journal);
    await attendre('la levée', () =>
      Promise.resolve(m.journal.includes(`lever:${jeton}`) ? true : undefined)
    );
  }, 120_000);

  it('reserves nothing when no night is to play', async () => {
    const m = machine({ jouer: [], sautes: [], ecartes: [] });
    const client = await serveur(m.activites);
    await demanderDesNuits(client, { planifiee: true }, { file: FILE });
    await resultat(client);
    expect(m.journal).toEqual([]);
  }, 120_000);

  it('a night asked while the nights play joins the same reservation', async () => {
    const m = machine({ jouer: ['/depot/a'], sautes: [], ecartes: [] });
    m.retenir('/depot/a');
    const client = await serveur(m.activites);
    await demanderDesNuits(client, { planifiee: true }, { file: FILE });
    await attendre('la nuit de a en cours', async () =>
      (await lireLesNuits(client)).enCours === '/depot/a' ? true : undefined
    );
    await demanderDesNuits(client, { projet: '/depot/b' }, { file: FILE });
    m.liberer('/depot/a');
    await resultat(client);
    expect(m.journal.filter(l => l.startsWith('reserver:'))).toHaveLength(1);
    expect(m.journal.filter(l => l.startsWith('lever:'))).toHaveLength(1);
    expect(m.journal.indexOf(`lever:${jetonDe(m.journal)}`)).toBe(m.journal.length - 1);
  }, 120_000);
});

describe('a night asked by hand', () => {
  it('joins the workflow that runs, and a project in its queue or under way plays once', async () => {
    const m = machine({ jouer: ['/depot/a', '/depot/b'], sautes: [], ecartes: [] });
    m.retenir('/depot/a');
    const client = await serveur(m.activites);
    await demanderDesNuits(client, { planifiee: true }, { file: FILE });
    await attendre('la nuit de a en cours', async () =>
      (await lireLesNuits(client)).enCours === '/depot/a' ? true : undefined
    );
    expect((await lireLesNuits(client)).depuis).toEqual(expect.any(Number));
    await demanderDesNuits(client, { projet: '/depot/a' }, { file: FILE });
    await demanderDesNuits(client, { projet: '/depot/b' }, { file: FILE });
    await demanderDesNuits(client, { projet: '/depot/d' }, { file: FILE });
    expect((await lireLesNuits(client)).attente).toEqual(['/depot/b', '/depot/d']);
    m.liberer('/depot/a');
    const vue = await resultat(client);
    expect(vue.jouees.map(j => j.racine)).toEqual(['/depot/a', '/depot/b', '/depot/d']);
    expect(m.auPlus()).toBe(1);
  }, 120_000);

  it('starts the workflow of the nights when none runs, its marker unread', async () => {
    const m = machine({ jouer: [], sautes: [], ecartes: [] });
    const client = await serveur(m.activites);
    await demanderDesNuits(client, { projet: '/depot/a' }, { file: FILE });
    const vue = await resultat(client);
    expect(vue.jouees.map(j => j.racine)).toEqual(['/depot/a']);
    expect(vue.sautes).toEqual([]);
  }, 120_000);
});

describe('the one schedule of the machine', () => {
  it('is created once, and updated when played again, its hour read back', async () => {
    const m = machine({ jouer: [], sautes: [], ecartes: [] });
    const client = await serveur(m.activites);
    const options = (heure: number) =>
      optionsDeLaPlanification(heure, 'Europe/Paris', { file: FILE });
    expect(await heureDeLaPlanification(client)).toBeNull();
    expect(await planifierLesNuits(client, options(1))).toBe(true);
    expect(await heureDeLaPlanification(client)).toBe(1);
    expect(await planifierLesNuits(client, options(22))).toBe(false);
    expect(await heureDeLaPlanification(client)).toBe(22);
    const ids: string[] = [];
    for await (const p of client.schedule.list()) {
      ids.push(p.scheduleId);
    }
    expect(ids).toEqual([options(22).scheduleId]);
    const d = await client.schedule.getHandle(options(22).scheduleId).describe();
    expect(d.spec.calendars?.[0]).toMatchObject({ hour: [{ start: 22, end: 22, step: 1 }] });
    expect(d.spec.timezone).toBe('Europe/Paris');
    expect(d.policies.overlap).toBe('SKIP');
    expect(d.policies.catchupWindow).toBe(24 * 3600 * 1000);
  }, 120_000);

  it('its firing asks the workflow of the nights for the scheduled nights', async () => {
    const m = machine({ jouer: ['/depot/a'], sautes: [], ecartes: [] });
    const client = await serveur(m.activites);
    m.lier(client);
    const options = optionsDeLaPlanification(1, 'UTC', { file: FILE });
    await planifierLesNuits(client, options);
    await client.schedule.getHandle(options.scheduleId).trigger();
    const vue = await attendre('les nuits planifiées', async () => {
      const v = await resultat(client);
      return v.jouees.length ? v : undefined;
    });
    expect(vue.jouees.map(j => j.racine)).toEqual(['/depot/a']);
  }, 120_000);
});
