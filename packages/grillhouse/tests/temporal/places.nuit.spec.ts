// @poste: un serveur Temporal
// grillhouse-4nr.7: the workflow of the machine played on a development server of trial (the
// pinned program TEMPORAL on a free port, a database file of its own) and the frame's worker
// started by its built code. A machine of trial gives a fixed measure (`mesureFixe`), so the load
// of the machine of the test does not decide. Criteria 1 (never more places than the ceiling),
// 2 (the order of arrival kept), 3 (a place whose process is gone is freed), 5 (Continue-As-New
// with its state, a request that waits among it) and 6 (the board reads the places by Temporal); a
// request withdrawn or whose process is gone ends for good, and a place follows the process
// attached to it.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { NativeConnection, Worker } from '@temporalio/worker';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ATTRIBUTS_DE_RECHERCHE,
  ouvrirLeClient,
  type ClientOuvert,
} from '../../src/temporal/client.js';
import {
  demarrerLesPlaces,
  lireLesPlaces,
  prendreUnePlaceParTemporal,
  rattacherLaPlace,
  rendreLaPlace,
  tirerUnRangParTemporal,
} from '../../src/temporal/places/client.js';
import type { EntreeDesPlaces, PlaceDonnee } from '../../src/temporal/places/contrat.js';
import { processusVivants } from '../../src/temporal/places/activites.js';
import { departDe } from '../../scripts/mesure/base-de-passe.mjs';
import {
  PAQUET,
  attendre,
  demarrerLeServeur,
  demarrerLeTravailleur,
  dossier,
  portLibre,
  programmeTemporal,
} from './essai.js';

const GO = 1024 ** 3;
const ouverts: ClientOuvert[] = [];
const arrets: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of ouverts.splice(0)) {
    await c.fermer();
  }
  for (const a of arrets.splice(0)) {
    await a();
  }
});

// A server, the frame's worker on its queue, the workflow of the machine started with <entree>.
async function machine(entree: Partial<EntreeDesPlaces> = {}) {
  const base = path.join(dossier('places'), 'temporal.db');
  const s = await demarrerLeServeur(
    programmeTemporal(),
    base,
    await portLibre(),
    ATTRIBUTS_DE_RECHERCHE
  );
  arrets.push(() => s.tuer());
  const t = await demarrerLeTravailleur(s.adresse, 'essai-machine');
  arrets.unshift(() => t.tuer());
  const c = ouvrirLeClient({ adresse: s.adresse });
  ouverts.push(c);
  await demarrerLesPlaces(
    c.client,
    {
      plafond: 2,
      espacementMs: 0,
      veilleMs: 300,
      mesureFixe: { coeurs: 12, charge: 1, memoireLibre: 16 * GO },
      ...entree,
    },
    { file: 'essai-machine' }
  );
  return c.client;
}
const MOI = { pid: process.pid, depart: departDe(process.pid) };
// Whether <p> has ended within <ms> ms.
const finiEn = (p: Promise<unknown>, ms: number) =>
  Promise.race([p.then(() => true), new Promise<boolean>(r => setTimeout(() => r(false), ms))]);

describe('jamais plus de places prises que le plafond', () => {
  it('the third taking of a ceiling of 2 waits, then takes the place given back', async () => {
    const client = await machine();
    const a = await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'a' });
    await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'b' });
    const c = prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'c' });
    expect(await finiEn(c, 1500)).toBe(false);
    const vue = await lireLesPlaces(client);
    expect(vue.prises).toHaveLength(2);
    expect(vue.attentes.map(x => x.ticket)).toEqual(['c']);
    expect(vue.attentes[0]?.raison).toContain('aucune place libre');
    await rendreLaPlace(client, a.id);
    await c;
    expect((await lireLesPlaces(client)).prises.map(p => p.ticket).sort()).toEqual(['b', 'c']);
  }, 120_000);
});

describe('l’ordre d’arrivée entre projets est gardé', () => {
  it('a taking of a lower rank passes before one that waits since longer', async () => {
    const client = await machine({ plafond: 1 });
    const a = await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'a', rang: 1 });
    const ordre: string[] = [];
    const tard = prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'tard', rang: 9 }).then(
      (p: PlaceDonnee) => (ordre.push('tard'), p)
    );
    await attendre('l’attente de tard', async () =>
      (await lireLesPlaces(client)).attentes.length === 1 ? true : undefined
    );
    const tot = prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'tot', rang: 3 }).then(
      (p: PlaceDonnee) => (ordre.push('tot'), p)
    );
    await attendre('l’attente de tot', async () =>
      (await lireLesPlaces(client)).attentes.length === 2 ? true : undefined
    );
    await rendreLaPlace(client, a.id);
    const p = await tot;
    expect(ordre).toEqual(['tot']);
    await rendreLaPlace(client, p.id);
    await tard;
    expect(ordre).toEqual(['tot', 'tard']);
  }, 120_000);
});

describe('une place dont le processus a disparu se libère', () => {
  it('the place of a process killed is freed, and the next taking passes', async () => {
    const client = await machine({ plafond: 1 });
    const enfant = spawn('sleep', ['60'], { stdio: 'ignore' });
    const pid = enfant.pid!;
    await prendreUnePlaceParTemporal(client, { pid, depart: departDe(pid), ticket: 'mort' });
    const suivante = prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'suivante' });
    expect(await finiEn(suivante, 1000)).toBe(false);
    enfant.kill('SIGKILL');
    await suivante;
    expect((await lireLesPlaces(client)).prises.map(p => p.ticket)).toEqual(['suivante']);
  }, 120_000);
});

describe('le déroulé se continue avant ses limites', () => {
  it('past its length of history, it continues as new with its places', async () => {
    const client = await machine({ plafond: 3, limiteDHistoire: 30 });
    const h = client.workflow.getHandle('grillhouse-places-de-la-machine');
    const premier = (await h.describe()).runId;
    const gardee = await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'gardee' });
    for (let i = 0; i < 6; i++) {
      const p = await prendreUnePlaceParTemporal(client, { ...MOI, ticket: `t${i}` });
      await rendreLaPlace(client, p.id);
    }
    const suivant = await attendre('un nouveau run', async () => {
      const d = await client.workflow.getHandle('grillhouse-places-de-la-machine').describe();
      return d.runId !== premier && d.status.name === 'RUNNING' ? d.runId : undefined;
    });
    expect(suivant).not.toBe(premier);
    const vue = await attendre('les places du nouveau run', async () => {
      const v = await lireLesPlaces(client);
      return v.prises.some(p => p.id === gardee.id) ? v : undefined;
    });
    expect(vue.prises.map(p => p.ticket)).toContain('gardee');
  }, 120_000);
});

describe('une attente vivante passe la continuation', () => {
  it('a request that waits is carried into the new run, and gets its place there', async () => {
    const client = await machine({ plafond: 1, limiteDHistoire: 40 });
    const h = client.workflow.getHandle('grillhouse-places-de-la-machine');
    const premier = (await h.describe()).runId;
    const a = await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'a' });
    const c = prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'c' });
    await attendre('un nouveau run', async () => {
      const d = await h.describe();
      return d.runId !== premier && d.status.name === 'RUNNING' ? d.runId : undefined;
    });
    expect((await lireLesPlaces(client)).attentes.map(x => x.ticket)).toEqual(['c']);
    await rendreLaPlace(client, a.id);
    await c;
    expect((await lireLesPlaces(client)).prises.map(p => p.ticket)).toEqual(['c']);
  }, 120_000);
});

describe('une demande retirée ou sans processus finit pour de bon', () => {
  it('a request whose process is gone is removed, and never takes the place freed after', async () => {
    const client = await machine({ plafond: 1 });
    const a = await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'a' });
    const enfant = spawn('sleep', ['60'], { stdio: 'ignore' });
    const pid = enfant.pid!;
    const morte = prendreUnePlaceParTemporal(client, {
      pid,
      depart: departDe(pid),
      ticket: 'morte',
    });
    const echec = morte.then(
      () => null,
      (e: Error) => e.message
    );
    await attendre('l’attente', async () =>
      (await lireLesPlaces(client)).attentes.length === 1 ? true : undefined
    );
    enfant.kill('SIGKILL');
    expect(await echec).toContain('n’est plus');
    await rendreLaPlace(client, a.id);
    await new Promise(r => setTimeout(r, 1500));
    expect(await lireLesPlaces(client)).toMatchObject({ prises: [], attentes: [] });
  }, 120_000);

  it('a request withdrawn by its caller ends, and leaves no wait', async () => {
    const client = await machine({ plafond: 1 });
    await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'a' });
    const arret = new AbortController();
    const retiree = prendreUnePlaceParTemporal(
      client,
      { ...MOI, ticket: 'r' },
      { signal: arret.signal }
    );
    await attendre('l’attente', async () =>
      (await lireLesPlaces(client)).attentes.length === 1 ? true : undefined
    );
    arret.abort(new Error('retirée par son appelant'));
    await expect(retiree).rejects.toThrow('retirée par son appelant');
    await attendre('plus d’attente', async () =>
      (await lireLesPlaces(client)).attentes.length === 0 ? true : undefined
    );
  }, 120_000);
});

describe('rattacher — une place suit le processus qu’on lui rattache', () => {
  it('a place attached to a process that dies is freed while its taker still lives', async () => {
    const client = await machine({ plafond: 1 });
    const p = await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 's' });
    const enfant = spawn('sleep', ['60'], { stdio: 'ignore' });
    const pid = enfant.pid!;
    await rattacherLaPlace(client, p.id, { pid, depart: departDe(pid) });
    await attendre('le processus rattaché', async () =>
      (await lireLesPlaces(client)).prises[0]?.pid === pid ? true : undefined
    );
    enfant.kill('SIGKILL');
    await attendre('la place libérée', async () =>
      (await lireLesPlaces(client)).prises.length === 0 ? true : undefined
    );
  }, 120_000);
});

describe('un rang donné avance le rang tiré', () => {
  it('a request without rank comes after the rank a caller gave', async () => {
    const client = await machine({ plafond: 3 });
    await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'donne', rang: 5 });
    const tire = await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'tire' });
    expect(tire.rang).toBe(6);
  }, 120_000);
  it('a rank drawn at the launch of a circuit comes before the requests drawn after it', async () => {
    const client = await machine({ plafond: 3 });
    expect(await tirerUnRangParTemporal(client)).toBe(1);
    const apres = await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'apres' });
    expect(apres.rang).toBe(2);
    const lui = await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'lui', rang: 1 });
    expect(lui.rang).toBe(1);
  }, 120_000);
});

describe('le tableau lit les places par Temporal', () => {
  it('reads the ceiling, the places with their ticket and rank, and the waits with their reason', async () => {
    const client = await machine({ plafond: 1 });
    await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'bp-320', rang: 4 });
    void prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'gh-12', rang: 7 }).catch(() => {});
    // An attente judged once: its reason is the rule's.
    const vue = await attendre('une attente jugée', async () => {
      const v = await lireLesPlaces(client);
      return v.attentes[0] && v.attentes[0].raison !== 'pas encore jugée' ? v : undefined;
    });
    expect(vue.plafond).toBe(1);
    expect(vue.prises).toMatchObject([{ ticket: 'bp-320', rang: 4, pid: process.pid }]);
    expect(vue.attentes).toMatchObject([{ ticket: 'gh-12', rang: 7 }]);
    expect(vue.attentes[0]?.raison).toContain('aucune place libre');
  }, 120_000);
});

// A gate an activity of a worker of this process passes: open, it passes at once; closed, the
// call waits (`atteinte` resolves once one waits) until the test opens it again.
function porte() {
  let ouverte = true;
  let ouvrir: () => void = () => {};
  let atteindre: () => void = () => {};
  let atteinte = new Promise<void>(r => (atteindre = r));
  let passage = Promise.resolve();
  return {
    fermer() {
      ouverte = false;
      passage = new Promise<void>(r => (ouvrir = r));
      atteinte = new Promise<void>(r => (atteindre = r));
    },
    ouvrir() {
      ouverte = true;
      ouvrir();
    },
    get atteinte() {
      return atteinte;
    },
    async passer() {
      if (!ouverte) {
        atteindre();
        await passage;
      }
    },
  };
}

// A server and a worker of this process whose measure of the machine and life of the processes
// pass the gates <mesure> and <vie> (the mocked activities of Temporal's tests), the life the
// real one: the workflow of the machine started with <entree>.
async function machineAPortes(entree: Partial<EntreeDesPlaces> = {}) {
  const mesure = porte();
  const vie = porte();
  const s = await demarrerLeServeur(
    programmeTemporal(),
    path.join(dossier('places-portes'), 'temporal.db'),
    await portLibre(),
    ATTRIBUTS_DE_RECHERCHE
  );
  arrets.push(() => s.tuer());
  const connexion = await NativeConnection.connect({ address: s.adresse });
  const travailleur = await Worker.create({
    connection: connexion,
    taskQueue: 'essai-portes',
    workflowsPath: path.join(PAQUET, 'dist/temporal/deroules.js'),
    activities: {
      processusVivants: async (l: { pid: number; depart: string | null }[]) => {
        await vie.passer();
        return processusVivants(l);
      },
      mesurerLaMachine: async () => {
        await mesure.passer();
        return { coeurs: 12, charge: 1, memoireLibre: 16 * GO };
      },
    },
  });
  const fin = travailleur.run();
  arrets.unshift(async () => {
    mesure.ouvrir();
    vie.ouvrir();
    travailleur.shutdown();
    await fin;
    await connexion.close();
  });
  const c = ouvrirLeClient({ adresse: s.adresse });
  ouverts.push(c);
  await demarrerLesPlaces(
    c.client,
    { plafond: 1, espacementMs: 0, veilleMs: 300, ...entree },
    { file: 'essai-portes' }
  );
  return { client: c.client, mesure, vie };
}
// The request of <ticket> as it stands, once judged (its reason no longer « pas encore jugée »).
const jugee = (client: Awaited<ReturnType<typeof machineAPortes>>['client'], ticket: string) =>
  attendre(`la demande ${ticket} jugée`, async () => {
    const v = await lireLesPlaces(client);
    const a = v.attentes.find(x => x.ticket === ticket);
    return a && a.raison !== 'pas encore jugée' ? a : undefined;
  });

describe('une demande retirée pendant la mesure n’est pas accordée', () => {
  it('a request withdrawn while the measure is read gets no place once the measure comes', async () => {
    const { client, mesure } = await machineAPortes();
    mesure.fermer();
    const arret = new AbortController();
    const retiree = prendreUnePlaceParTemporal(
      client,
      { ...MOI, ticket: 'retiree' },
      { signal: arret.signal }
    ).catch((e: Error) => e.message);
    await mesure.atteinte;
    arret.abort(new Error('retirée pendant la mesure'));
    expect(await retiree).toBe('retirée pendant la mesure');
    await attendre('le retrait', async () =>
      (await lireLesPlaces(client)).attentes.length === 0 ? true : undefined
    );
    mesure.ouvrir();
    // A request after it passes once the measure came: the judgement after it ran, the place free.
    await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'apres' });
    const v = await lireLesPlaces(client);
    expect(v.prises.map(p => p.ticket)).toEqual(['apres']);
    expect(v.attentes).toEqual([]);
  }, 120_000);
});

describe('les changements reçus pendant un jugement sont jugés sans attendre la veille', () => {
  it('a request that arrives while the measure is read is judged at once after it', async () => {
    // A watch of 60 s: only a change wakes the judgement within the test.
    const { client, mesure } = await machineAPortes({ plafond: 2, veilleMs: 60_000 });
    await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'a' });
    mesure.fermer();
    const b = prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'b' });
    await mesure.atteinte;
    const c = prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'c' }).catch(() => null);
    await attendre('la demande c', async () =>
      (await lireLesPlaces(client)).attentes.some(x => x.ticket === 'c') ? true : undefined
    );
    mesure.ouvrir();
    await b;
    const enC = await jugee(client, 'c');
    expect(enC.raison).toContain('aucune place libre');
    void c;
  }, 120_000);

  it('a place attached to a living process while the lives are read stays', async () => {
    const { client, vie } = await machineAPortes();
    const enfant = spawn('sleep', ['60'], { stdio: 'ignore' });
    const pid = enfant.pid!;
    const p = await prendreUnePlaceParTemporal(client, { pid, depart: departDe(pid), ticket: 'p' });
    vie.fermer();
    // A request that waits wakes a judgement, whose reading of the lives the gate holds.
    void prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'r' }).catch(() => null);
    await vie.atteinte;
    enfant.kill('SIGKILL');
    await rattacherLaPlace(client, p.id, MOI);
    await attendre('le rattachement', async () =>
      (await lireLesPlaces(client)).prises[0]?.pid === MOI.pid ? true : undefined
    );
    vie.ouvrir();
    const r = await jugee(client, 'r');
    expect(r.raison).toContain('aucune place libre');
    expect((await lireLesPlaces(client)).prises).toMatchObject([{ id: p.id, pid: MOI.pid }]);
  }, 120_000);
});
