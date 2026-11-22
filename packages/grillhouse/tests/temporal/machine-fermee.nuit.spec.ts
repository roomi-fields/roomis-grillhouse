// @equipee: un serveur Temporal
// La fermeture de la machine par le superviseur, sur le déroulé des places (src/temporal/places/),
// jouée sur un serveur d'essai avec le travailleur du cadre : la seule réservation de la machine,
// avec son auteur et un jeton propre ; aucune place donnée, la demande attend avec sa
// raison sans être retirée, ce qui tourne finit, la fermeture survit à une continuation et à un
// rejeu du déroulé, ne périme jamais, et la réouverture donne la place d'elle-même ; fermer deux
// fois, ou rouvrir une machine ouverte, ne change rien ; la vue ne porte aucune nuit.
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ATTRIBUTS_DE_RECHERCHE,
  ouvrirLeClient,
  type ClientOuvert,
} from '../../src/temporal/client.js';
import {
  demarrerLesPlaces,
  fermerLaMachine,
  lireLesPlaces,
  prendreUnePlaceParTemporal,
  rendreLaPlace,
  reserverDesCircuits,
  rouvrirLaMachine,
  tirerUnRangParTemporal,
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

async function machine(entree: Partial<EntreeDesPlaces> = {}) {
  const s = await demarrerLeServeur(
    programmeTemporal(),
    path.join(dossier('machine-fermee'), 'temporal.db'),
    await portLibre(),
    ATTRIBUTS_DE_RECHERCHE
  );
  arrets.push(() => s.tuer());
  const t = await demarrerLeTravailleur(s.adresse, 'essai-machine', { GRILLHOUSE_PLACES: '3' });
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
const finiEn = (p: Promise<unknown>, ms: number) =>
  Promise.race([p.then(() => true), new Promise<boolean>(r => setTimeout(() => r(false), ms))]);

describe('la fermeture de la machine par le superviseur', () => {
  it('ferme la machine : l’auteur, le début et la phase se lisent, la demande attend sans être retirée', async () => {
    const client = await machine();
    expect(await fermerLaMachine(client)).toBe('fermee');
    const c = prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'c' });
    expect(await finiEn(c, 1500)).toBe(false);
    const vue = await lireLesPlaces(client);
    expect(vue.fermeture).toMatchObject({ auteur: 'superviseur', phase: 'vide' });
    expect(vue.fermeture?.depuis).toBeGreaterThan(0);
    expect(vue.prises).toHaveLength(0);
    expect(vue.attentes.map(x => x.ticket)).toEqual(['c']);
    expect(vue.attentes[0]?.raison).toMatch(/machine fermée par le superviseur/);
    expect(await rouvrirLaMachine(client)).toBe('rouverte');
    await c;
    expect((await lireLesPlaces(client)).prises.map(p => p.ticket)).toEqual(['c']);
  }, 120_000);

  it('la place prise avant la fermeture n’est pas interrompue : la phase dit qu’on attend', async () => {
    const client = await machine();
    const a = await prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'a' });
    await fermerLaMachine(client);
    let vue = await lireLesPlaces(client);
    expect(vue.fermeture?.phase).toBe('attend');
    expect(vue.prises.map(p => p.id)).toEqual([a.id]);
    await rendreLaPlace(client, a.id);
    await attendre('la machine vide', async () => {
      vue = await lireLesPlaces(client);
      return vue.fermeture?.phase === 'vide' ? true : undefined;
    });
  }, 120_000);

  it('aucun circuit neuf ne part, un circuit vivant garde sa place ; à la réouverture le candidat est donné', async () => {
    const client = await machine();
    const demande = { racine: '/p', vivants: ['p-1'], candidats: ['p-2'] };
    await reserverDesCircuits(client, { racine: '/p', candidats: ['p-1'] });
    await fermerLaMachine(client);
    expect(await reserverDesCircuits(client, demande)).toEqual([]);
    const vue = await lireLesPlaces(client);
    expect(vue.circuits?.find(x => x.ticket === 'p-1')?.accordee).toBe(true);
    expect(vue.circuits?.find(x => x.ticket === 'p-2')?.accordee).toBe(false);
    await rouvrirLaMachine(client);
    expect(await reserverDesCircuits(client, demande)).toEqual(['p-2']);
  }, 120_000);

  it('survit à une continuation du déroulé, avec son début et l’attente de la demande', async () => {
    const client = await machine({ limiteDHistoire: 40 });
    const h = client.workflow.getHandle('grillhouse-places-de-la-machine');
    const premier = (await h.describe()).runId;
    await fermerLaMachine(client);
    const depuis = (await lireLesPlaces(client)).fermeture?.depuis;
    const c = prendreUnePlaceParTemporal(client, { ...MOI, ticket: 'c' });
    for (let i = 0; i < 30; i++) {
      await tirerUnRangParTemporal(client);
    }
    await attendre('un nouveau run', async () => {
      const d = await h.describe();
      return d.runId !== premier && d.status.name === 'RUNNING' ? d.runId : undefined;
    });
    const vue = await lireLesPlaces(client);
    expect(vue.fermeture).toMatchObject({ auteur: 'superviseur', depuis });
    expect(vue.attentes.map(x => x.ticket)).toEqual(['c']);
    expect(await finiEn(c, 1000)).toBe(false);
    await rouvrirLaMachine(client);
    await c;
  }, 120_000);

  it('ne périme jamais : sans battement, la fermeture tient bien au-delà de la péremption de la nuit', async () => {
    const client = await machine({ veilleMs: 50 });
    await fermerLaMachine(client);
    await new Promise(r => setTimeout(r, 1500));
    expect((await lireLesPlaces(client)).fermeture?.auteur).toBe('superviseur');
  }, 120_000);

  it('fermer une machine déjà fermée, ou rouvrir une machine ouverte, réussit sans effet', async () => {
    const client = await machine();
    expect(await rouvrirLaMachine(client)).toBe('deja-ouverte');
    await fermerLaMachine(client);
    const depuis = (await lireLesPlaces(client)).fermeture?.depuis;
    expect(await fermerLaMachine(client)).toBe('deja-fermee');
    expect((await lireLesPlaces(client)).fermeture?.depuis).toBe(depuis);
    expect(await rouvrirLaMachine(client)).toBe('rouverte');
    expect((await lireLesPlaces(client)).fermeture ?? null).toBeNull();
  }, 120_000);
});

describe('la vue des places ne porte plus de nuit', () => {
  it('la machine fermée puis rouverte ne montre jamais de phase de nuit', async () => {
    const client = await machine();
    expect(Object.keys(await lireLesPlaces(client))).not.toContain('nuit');
    await fermerLaMachine(client);
    const vue = await lireLesPlaces(client);
    expect(vue.fermeture?.auteur).toBe('superviseur');
    expect(Object.keys(vue)).not.toContain('nuit');
    expect(await rouvrirLaMachine(client)).toBe('rouverte');
  }, 120_000);
});
