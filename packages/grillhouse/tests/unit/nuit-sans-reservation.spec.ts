// La nuit ne réserve plus la machine : le jeton de la nuit, la réservation entière, son battement et
// sa raison « la nuit tient la machine » n'existent plus, avec leurs lecteurs. Ce que la nuit
// publiait n'est plus publié (les activités des nuits, le client des places, la prise de place, la
// vue des places), et le panneau montre la nuit comme une passe, avec sa part, non comme une phase
// de la machine. Petits tests : les modules par leur interface, sans serveur ni processus.
import { describe, expect, it } from 'vitest';
import * as places from '../../scripts/places-de-la-machine.mjs';
import { demandeDePlace, etatDesPlaces } from '../../scripts/places-de-la-machine.mjs';
import { assembler, lignes, lignesDesParts } from '../../scripts/tableau.mjs';
import * as nuits from '../../src/temporal/nuits/activites.js';
import * as clientDesPlaces from '../../src/temporal/places/client.js';
import * as contratDesPlaces from '../../src/temporal/places/contrat.js';

describe('ce que la réservation de la nuit publiait n’est plus publié', () => {
  it('les activités des nuits ne réservent ni ne lèvent la machine', () => {
    expect(Object.keys(nuits.activitesDesNuits)).not.toContain('reserverLaMachine');
    expect(Object.keys(nuits.activitesDesNuits)).not.toContain('leverLaMachine');
    expect(Object.keys(nuits)).not.toContain('reserverLaMachine');
    expect(Object.keys(nuits)).not.toContain('leverLaMachine');
  });

  it('l’environnement de la passe de la nuit ne porte plus de jeton', () => {
    expect(Object.keys(nuits)).not.toContain('environnementDeLaNuit');
  });

  it('le client des places ne réserve, ne bat ni ne lève une réservation de nuit', () => {
    for (const nom of ['reserverLaMachineEntiere', 'battreLaReservation', 'leverLaReservation']) {
      expect(Object.keys(clientDesPlaces), nom).not.toContain(nom);
    }
  });

  it('le contrat des places n’a plus la mise à jour de réservation de la nuit', () => {
    for (const nom of ['RESERVER_LA_MACHINE', 'BATTRE_LA_RESERVATION', 'LEVER_LA_RESERVATION']) {
      expect(Object.keys(contratDesPlaces), nom).not.toContain(nom);
    }
  });

  it('la prise de place ne publie plus la variable du jeton', () => {
    expect(Object.keys(places)).not.toContain('VARIABLE_JETON');
  });

  it('la demande de place ne joint aucun jeton, même celui d’une ancienne nuit dans l’environnement', () => {
    const d = demandeDePlace({
      env: { GRILLHOUSE_JETON_DE_LA_NUIT: 'jeton-1' },
      pid: 42,
      depart: 'x',
      ticket: 't-1',
    } as Parameters<typeof demandeDePlace>[0]);
    expect(d).toMatchObject({ pid: 42, ticket: 't-1' });
    expect('jeton' in d).toBe(false);
  });
});

describe('la nuit n’est plus une phase de la machine à l’état des places', () => {
  const MESURE = JSON.stringify({
    coeurs: 4,
    charge: 1,
    memoireLibre: 2 ** 33,
    memoireTotale: 2 ** 34,
  });
  const etat = (lues: object) =>
    (etatDesPlaces as unknown as (o: unknown) => Record<string, unknown>)({
      env: { CI: '1', GRILLHOUSE_MESURE_D_ESSAI: MESURE },
      lues: { plafond: 3, prises: [], attentes: [], ...lues },
    });

  it('l’état n’a aucune phase de nuit, même quand la vue en porte une', () => {
    expect(Object.keys(etat({ nuit: { phase: 'en cours' } }))).not.toContain('nuit');
    expect(Object.keys(etat({}))).not.toContain('nuit');
  });

  it('la fermeture du superviseur se lit toujours', () => {
    const fermeture = { auteur: 'superviseur', depuis: 1, phase: 'vide' };
    expect(etat({ fermeture }).fermeture).toEqual(fermeture);
  });
});

describe('le panneau montre la nuit comme une passe, avec sa part', () => {
  const GO = 1024 ** 3;
  const budget = { coeurs: 8, memoire: 16 * GO };
  const MAINTENANT = Date.parse('2026-11-12T02:00:00Z');
  interface Ligne {
    texte: string;
    section?: string;
  }

  it('une nuit qui tient sa part est une ligne de passe : son projet, sa sorte et ses cœurs', () => {
    const l = lignesDesParts({
      budget,
      prises: [
        { id: 'n', ticket: null, projet: 'demo', sorte: 'Nuit', coeurs: 2, memoire: 4 * GO },
        {
          id: 'v',
          ticket: 'gh-1',
          projet: 'autre',
          sorte: 'Vérification',
          coeurs: 2,
          memoire: 4 * GO,
        },
      ],
      attentes: [],
    }).find((x: string) => /demo/.test(x));
    expect(l).toBeDefined();
    expect(l).toMatch(/2 cœurs/);
  });

  it('le panneau ne dit plus que la nuit tient la machine ou attend la fin des étapes', () => {
    const p = assembler({
      tous: [],
      prefix: 'demo',
      registre: [],
      vivants: [],
      circuits: [],
      maintenant: MAINTENANT,
      jour: MAINTENANT - 2 * 3_600_000,
      machine: null,
      places: {
        prises: 1,
        plafond: 3,
        charge: 4,
        coeurs: 12,
        memoireGo: 9,
        memoireTotaleGo: 30,
        attentes: [],
        nuit: 'attend',
      },
      nuit: null,
    } as unknown as Parameters<typeof assembler>[0]);
    const texte = (lignes(p, 'depot') as Ligne[]).map(l => l.texte).join('\n');
    expect(texte).not.toMatch(/nuit : attend la fin des étapes/);
    expect(texte).not.toMatch(/nuit en cours/);
    expect(texte).not.toMatch(/la nuit tient la machine/);
  });
});
