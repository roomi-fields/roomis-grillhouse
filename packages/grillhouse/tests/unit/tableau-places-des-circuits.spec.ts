// La ligne des places compte les places de circuit (scripts/tableau.mjs, scripts/places-de-la-machine.mjs
// `etatDesPlaces`) : « Places s/n/N · charge x/c · mémoire m/M Go », `s` celles que tient le projet
// du panneau (les projets du panneau de plusieurs projets, ensemble), `n` celles tenues sur toute la
// machine, `N` le plafond. Un circuit tient sa place de son départ à sa fin, ses arrêts compris :
// le compte lit les places accordées aux circuits, chacune avec la racine de son projet.
import { describe, expect, it } from 'vitest';
import { etatDesPlaces } from '../../scripts/places-de-la-machine.mjs';
import { assembler, ensemble, lignes } from '../../scripts/tableau.mjs';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-12T17:25:00Z');
const GO = 1024 ** 3;
const ICI = '/depots/demo';
const SYNTHHUB = '/depots/synthhub';
const OSC = '/depots/osc-bridge';
const AILLEURS = '/depots/bpscript';

interface Ligne {
  texte: string;
  ton?: string;
}
type Tenue = { ticket: string | null; racine: string | null };
const PLACES = {
  plafond: 10,
  charge: 4.2,
  coeurs: 12,
  memoireGo: 9,
  memoireTotaleGo: 30,
  attentes: [],
};
const plateauDe = (racine: string, tenues: Tenue[], o: { faute?: string } = {}) =>
  assembler({
    tous: [],
    prefix: 'demo',
    racine,
    registre: [],
    vivants: [],
    circuits: [],
    maintenant: MAINTENANT,
    jour: MAINTENANT - 12 * 60 * MIN,
    machine: null,
    places: { ...PLACES, prises: tenues.length, tenues, ...(o.faute ? { faute: o.faute } : {}) },
  } as unknown as Parameters<typeof assembler>[0]);
const desPlaces = (plateau: unknown, largeur = 52) =>
  (lignes(plateau as Parameters<typeof lignes>[0], 'depot', largeur) as Ligne[]).find(l =>
    l.texte.startsWith('Places ')
  )!;
const tenue = (racine: string | null, ticket = 'x-1'): Tenue => ({ ticket, racine });

describe('la ligne des places compte les places de circuit : les siennes, celles de la machine, le plafond', () => {
  it('le projet du panneau tient 2 des 9 places prises sur 10', () => {
    const tenues = [
      tenue(ICI),
      tenue(ICI),
      ...Array.from({ length: 4 }, () => tenue(SYNTHHUB)),
      ...Array.from({ length: 2 }, () => tenue(AILLEURS)),
      tenue(OSC),
    ];
    expect(desPlaces(plateauDe(ICI, tenues)).texte.trimEnd()).toBe(
      'Places 2/9/10 · charge 4,2/12 · mémoire 9/30 Go'
    );
  });

  it('un projet sans circuit en vol lit 0 des places prises par les autres', () => {
    expect(desPlaces(plateauDe(ICI, [tenue(SYNTHHUB), tenue(OSC)])).texte.trimEnd()).toBe(
      'Places 0/2/10 · charge 4,2/12 · mémoire 9/30 Go'
    );
  });

  it('une machine sans circuit : 0/0 et le plafond', () => {
    expect(desPlaces(plateauDe(ICI, [])).texte.trimEnd()).toBe(
      'Places 0/0/10 · charge 4,2/12 · mémoire 9/30 Go'
    );
  });

  it('une place sans racine (état d’avant) compte pour la machine, pas pour le projet', () => {
    expect(desPlaces(plateauDe(ICI, [tenue(null), tenue(ICI)])).texte).toMatch(
      /^Places 1\/2\/10 · /
    );
  });

  it('la ligne ne nomme aucun ticket et tient dans la largeur du panneau', () => {
    const tenues = Array.from({ length: 9 }, (_, i) => tenue(i < 2 ? ICI : SYNTHHUB, `demo-${i}`));
    const { texte } = desPlaces(plateauDe(ICI, tenues));
    expect(texte).not.toMatch(/demo-|\+\d/);
    expect([...texte.trimEnd()].length).toBeLessThanOrEqual(52);
  });

  it('le plafond refusé reste dit après le compte, à la place de la charge et de la mémoire', () => {
    const l = desPlaces(
      plateauDe(ICI, [tenue(ICI)], { faute: 'GRILLHOUSE_PLACES vaut « x »' }),
      100
    );
    expect(l.texte.trimEnd()).toBe('Places 1/1/10 · plafond refusé : GRILLHOUSE_PLACES vaut « x »');
  });
});

describe('le panneau de plusieurs projets compte les places de ses projets ensemble', () => {
  it('trois projets du panneau : 4 + 1 + 0 des 9 places prises sur 10', () => {
    const tenues = [
      ...Array.from({ length: 4 }, () => tenue(SYNTHHUB)),
      tenue(OSC),
      ...Array.from({ length: 2 }, () => tenue(AILLEURS)),
      tenue('/depots/grillhouse'),
      tenue('/depots/grillhouse'),
    ];
    const lus = [OSC, SYNTHHUB, ICI].map((dossier, i) => ({
      dossier,
      etiquette: ['OB', 'SH', 'OSD'][i],
      t: plateauDe(dossier, tenues),
    }));
    const tout = ensemble(lus as unknown as Parameters<typeof ensemble>[0]);
    expect(desPlaces(tout).texte.trimEnd()).toBe('Places 5/9/10 · charge 4,2/12 · mémoire 9/30 Go');
  });
});

describe('l’état des places rend les places accordées aux circuits, chacune avec sa racine', () => {
  const machine = () => ({
    coeurs: 12,
    charge: 4.24,
    memoireLibre: 9 * GO,
    memoireTotale: 30 * GO,
  });
  const circuit = (ticket: string, racine: string | undefined, accordee: boolean) => ({
    ticket,
    rang: 1,
    accordee,
    depuis: 1,
    vu: 1,
    ...(racine === undefined ? {} : { racine }),
  });
  // Une place de séance ou de passe (`prises` du serveur) : le compte ne la lit pas.
  const prise = {
    id: 'a',
    pid: 1,
    depart: null,
    ticket: 'demo-9',
    rang: 1,
    depuis: 1,
    racine: ICI,
  };

  it('chaque circuit qui tient sa place donne son ticket et sa racine ; une séance en cours ne compte pas', () => {
    const lues = {
      plafond: 10,
      prises: [prise],
      attentes: [],
      circuits: [circuit('demo-1', ICI, true), circuit('SH-2', SYNTHHUB, true)],
    };
    const e = etatDesPlaces({ env: {}, mesurer: machine, lues });
    expect(e.prises).toBe(2);
    expect(e.tenues).toEqual([
      { ticket: 'demo-1', racine: ICI },
      { ticket: 'SH-2', racine: SYNTHHUB },
    ]);
  });

  it('un circuit qui attend sa place ne la tient pas : il reste parmi les attentes', () => {
    const lues = {
      plafond: 1,
      prises: [],
      attentes: [],
      circuits: [circuit('demo-1', ICI, true), circuit('demo-2', ICI, false)],
    };
    const e = etatDesPlaces({ env: {}, mesurer: machine, lues });
    expect(e.prises).toBe(1);
    expect(e.attentes.map((a: { ticket: string }) => a.ticket)).toEqual(['demo-2']);
  });

  it('un circuit sans racine (état d’avant) rend une racine nulle', () => {
    const lues = {
      plafond: 3,
      prises: [],
      attentes: [],
      circuits: [circuit('demo-1', undefined, true)],
    };
    expect(etatDesPlaces({ env: {}, mesurer: machine, lues }).tenues).toEqual([
      { ticket: 'demo-1', racine: null },
    ]);
  });
});
