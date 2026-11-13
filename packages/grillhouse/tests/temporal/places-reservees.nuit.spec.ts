// @poste: un serveur Temporal
// La réservation exclusive de la machine par la nuit, sur le déroulé des places (src/temporal/places/),
// joué sur un serveur d'essai avec le travailleur du cadre : la machine entière se demande (une
// mise à jour), ce qui tourne finit, une demande sans le jeton de la nuit attend avec sa raison
// sans être refusée ni retirée, une demande qui porte le jeton est donnée, la phase se lit dans la
// vue, la réservation survit à une continuation et se lève par le jeton.
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ATTRIBUTS_DE_RECHERCHE,
  ouvrirLeClient,
  type ClientOuvert,
} from '../../src/temporal/client.js';
import {
  battreLaReservation,
  demarrerLesPlaces,
  leverLaReservation,
  lireLesPlaces,
  prendreUnePlaceParTemporal,
  rendreLaPlace,
  reserverDesCircuits,
  reserverLaMachineEntiere,
} from '../../src/temporal/places/client.js';
import type { EntreeDesPlaces } from '../../src/temporal/places/contrat.js';
import { departDe } from '../../scripts/mesure/base-de-passe.mjs';
import {
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

async function machine({ plafond = 3, ...entree }: Partial<EntreeDesPlaces> = {}) {
  const s = await demarrerLeServeur(
    programmeTemporal(),
    path.join(dossier('places-reservees'), 'temporal.db'),
    await portLibre(),
    ATTRIBUTS_DE_RECHERCHE
  );
  arrets.push(() => s.tuer());
  const t = await demarrerLeTravailleur(s.adresse, 'essai-machine', {
    GRILLHOUSE_PLACES: String(plafond),
  });
  arrets.unshift(() => t.tuer());
  const c = ouvrirLeClient({ adresse: s.adresse });
  ouverts.push(c);
  await demarrerLesPlaces(
    c.client,
    {
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
const JETON = 'jeton-d-essai';
const finiEn = (p: Promise<unknown>, ms: number) =>
  Promise.race([p.then(() => true), new Promise<boolean>(r => setTimeout(() => r(false), ms))]);
const phase = async (client: Awaited<ReturnType<typeof machine>>) =>
  (await lireLesPlaces(client)).nuit?.phase ?? null;

describe('la nuit demande la machine entière', () => {
  it('attend la fin des étapes en cours : la place prise n’est pas interrompue, la phase dit qu’on attend', async () => {
    const client = await machine();
    const a = await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'a' });
    await reserverLaMachineEntiere(client, { jeton: JETON });
    expect(await phase(client)).toBe('attend');
    expect((await lireLesPlaces(client)).prises.map(p => p.id)).toEqual([a.id]);
    await rendreLaPlace(client, a.id);
    await attendre('la phase en cours', async () =>
      (await phase(client)) === 'en cours' ? true : undefined
    );
  }, 120_000);

  it('sans place prise, la phase est « en cours » aussitôt ; hors réservation, aucune phase', async () => {
    const client = await machine();
    expect(await phase(client)).toBeNull();
    await reserverLaMachineEntiere(client, { jeton: JETON });
    await attendre('la phase en cours', async () =>
      (await phase(client)) === 'en cours' ? true : undefined
    );
  }, 120_000);

  it('une demande sans jeton attend avec la nuit pour raison, sous le plafond, sans être retirée', async () => {
    const client = await machine();
    await reserverLaMachineEntiere(client, { jeton: JETON });
    const c = prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'c' });
    expect(await finiEn(c, 1500)).toBe(false);
    const vue = await lireLesPlaces(client);
    expect(vue.prises).toHaveLength(0);
    expect(vue.attentes.map(x => x.ticket)).toEqual(['c']);
    expect(vue.attentes[0]?.raison).toMatch(/nuit/);
    await leverLaReservation(client, JETON);
    await c;
    expect((await lireLesPlaces(client)).prises.map(p => p.ticket)).toEqual(['c']);
  }, 120_000);

  it('une demande qui porte le jeton est donnée pendant la réservation', async () => {
    const client = await machine();
    await reserverLaMachineEntiere(client, { jeton: JETON });
    const n = await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'nuit', jeton: JETON });
    const vue = await lireLesPlaces(client);
    expect(vue.prises.map(p => p.id)).toEqual([n.id]);
    expect(vue.nuit?.phase).toBe('en cours');
  }, 120_000);

  it('la file ne lance aucun circuit neuf : un candidat attend, un circuit vivant garde sa place', async () => {
    const client = await machine();
    expect(await reserverDesCircuits(client, { racine: '/p', vivants: ['p-1'] })).toEqual([]);
    await reserverLaMachineEntiere(client, { jeton: JETON });
    const donnes = await reserverDesCircuits(client, {
      racine: '/p',
      vivants: ['p-1'],
      candidats: ['p-2'],
    });
    expect(donnes).toEqual([]);
    const circuits = (await lireLesPlaces(client)).circuits ?? [];
    expect(circuits.find(c => c.ticket === 'p-1')?.accordee).toBe(true);
    expect(circuits.find(c => c.ticket === 'p-2')?.accordee).toBe(false);
    await leverLaReservation(client, JETON);
    expect(
      await reserverDesCircuits(client, { racine: '/p', vivants: ['p-1'], candidats: ['p-2'] })
    ).toEqual(['p-2']);
  }, 120_000);
});

describe('la levée de la réservation', () => {
  it('un autre jeton ne la lève pas, le sien la lève', async () => {
    const client = await machine();
    await reserverLaMachineEntiere(client, { jeton: JETON });
    await leverLaReservation(client, 'un-autre');
    await battreLaReservation(client, JETON);
    expect(await phase(client)).toBe('en cours');
    await leverLaReservation(client, JETON);
    await attendre('la levée', async () => ((await phase(client)) === null ? true : undefined));
  }, 120_000);
});

describe('la réservation survit à une continuation du déroulé', () => {
  it('le nouveau run garde la réservation, sa phase et l’attente de la demande sans jeton', async () => {
    const client = await machine({ limiteDHistoire: 40 });
    const h = client.workflow.getHandle('grillhouse-places-de-la-machine');
    const premier = (await h.describe()).runId;
    await reserverLaMachineEntiere(client, { jeton: JETON });
    const c = prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'c' });
    for (let i = 0; i < 30; i++) {
      await battreLaReservation(client, JETON);
    }
    await attendre('un nouveau run', async () => {
      const d = await h.describe();
      return d.runId !== premier && d.status.name === 'RUNNING' ? d.runId : undefined;
    });
    const vue = await lireLesPlaces(client);
    expect(vue.nuit?.phase).toBe('en cours');
    expect(vue.attentes.map(x => x.ticket)).toEqual(['c']);
    await leverLaReservation(client, JETON);
    await c;
  }, 120_000);
});
