// La ligne des places nomme qui tient chaque place (scripts/tableau.mjs, scripts/places-de-la-machine.mjs
// `etatDesPlaces`) : la prise du projet du panneau par son numéro court, la prise d'un autre projet
// par « <SIGLE> <numéro court> », une prise sans ticket « passe » ; les prises se séparent par « , »
// et suivent « Places n/N · » ; au-delà de la largeur, les prises en trop se comptent « +n ».
// Maquette : « Places 1/3 · GH giw · charge 4,2/12 · mémoire 9/30 Go ».
// Chaque prise porte sa racine (celle du dépôt principal de son projet) : aucun lien ne passe par le
// numéro du ticket. Le sigle d'un autre projet se lit de sa racine (scripts/sigle-du-projet.mjs).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { etatDesPlaces } from '../../scripts/places-de-la-machine.mjs';
import { assembler, LARGEUR, lignes } from '../../scripts/tableau.mjs';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-12T17:25:00Z');
const GO = 1024 ** 3;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-places-nommees-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// La racine d'un projet d'essai : son préfixe de tickets (.beads/config.yaml), son sigle déclaré
// (package.json) quand il en a un.
const racineDe = (prefixe: string, sigle?: string) => {
  const d = mkdtempSync(path.join(ESSAIS, `${prefixe}-`));
  mkdirSync(path.join(d, '.beads'));
  writeFileSync(path.join(d, '.beads', 'config.yaml'), `issue-prefix: "${prefixe}"\n`);
  writeFileSync(
    path.join(d, 'package.json'),
    JSON.stringify(sigle ? { grillhouse: { sigle } } : { name: prefixe })
  );
  return d;
};
const ICI = racineDe('demo');
const GRILLHOUSE = racineDe('grillhouse', 'GH');
const OSC = racineDe('osc-bridge', 'OB');

interface Ligne {
  texte: string;
  ton?: string;
  section?: string;
}
type Tenue = { ticket: string | null; racine?: string | null };
const PLACES = {
  prises: 1,
  plafond: 3,
  charge: 4.2,
  coeurs: 12,
  memoireGo: 9,
  memoireTotaleGo: 30,
  attentes: [],
};
const tete = (tenues: Tenue[], o: { largeur?: number; faute?: string } = {}) => {
  const plateau = assembler({
    tous: [],
    prefix: 'demo',
    racine: ICI,
    registre: [],
    vivants: [],
    circuits: [],
    maintenant: MAINTENANT,
    jour: MAINTENANT - 12 * 60 * MIN,
    machine: null,
    places: { ...PLACES, prises: tenues.length, tenues, ...(o.faute ? { faute: o.faute } : {}) },
  } as unknown as Parameters<typeof assembler>[0]);
  return (lignes(plateau, 'depot', o.largeur ?? 100) as Ligne[]).find(l =>
    l.texte.startsWith('Places ')
  )!;
};
const colonnes = (s: string) => [...s].length;

describe('la ligne des places nomme le ticket de chaque prise', () => {
  it('la prise d’un autre projet porte le sigle de ce projet, avant son numéro court', () => {
    expect(tete([{ ticket: 'grillhouse-giw', racine: GRILLHOUSE }], { largeur: 60 }).texte).toBe(
      'Places 1/3 · GH giw · charge 4,2/12 · mémoire 9/30 Go'
    );
  });

  it('la prise du projet du panneau se nomme par son numéro court, sans sigle', () => {
    expect(tete([{ ticket: 'demo-giw', racine: ICI }]).texte).toBe(
      'Places 1/3 · giw · charge 4,2/12 · mémoire 9/30 Go'
    );
  });

  it('un numéro à points garde ses points : « 13y.6 »', () => {
    expect(tete([{ ticket: 'demo-13y.6', racine: ICI }]).texte).toContain('· 13y.6 ·');
  });

  it('plusieurs prises se séparent par « , » dans l’ordre des prises, le projet du panneau sans sigle', () => {
    const l = tete([
      { ticket: 'demo-giw', racine: ICI },
      { ticket: 'osc-bridge-7gv', racine: OSC },
    ]);
    expect(l.texte).toBe('Places 2/3 · giw, OB 7gv · charge 4,2/12 · mémoire 9/30 Go');
  });

  it('le numéro court retire le préfixe du projet de la prise, lu de sa racine (un préfixe à tiret)', () => {
    expect(tete([{ ticket: 'osc-bridge-k2', racine: OSC }]).texte).toContain('· OB k2 ·');
  });

  it('un projet sans sigle déclaré s’affiche par son préfixe de tickets', () => {
    const sans = racineDe('abc');
    expect(tete([{ ticket: 'abc-5', racine: sans }]).texte).toContain('· abc 5 ·');
  });

  it('deux prises de même numéro court de deux projets se distinguent par le sigle', () => {
    const l = tete([
      { ticket: 'demo-giw', racine: ICI },
      { ticket: 'grillhouse-giw', racine: GRILLHOUSE },
    ]);
    expect(l.texte).toContain('· giw, GH giw ·');
  });

  it('une prise sans ticket se nomme « passe », précédée du sigle quand elle est d’un autre projet', () => {
    expect(tete([{ ticket: null, racine: ICI }]).texte).toContain('· passe ·');
    expect(tete([{ ticket: null, racine: OSC }]).texte).toContain('· OB passe ·');
    expect(
      tete([
        { ticket: null, racine: ICI },
        { ticket: null, racine: OSC },
      ]).texte
    ).toContain('· passe, OB passe ·');
  });

  it('une prise sans racine (état d’avant) se nomme sans sigle', () => {
    const l = tete([{ ticket: 'demo-giw' }, { ticket: null, racine: null }]);
    expect(l.texte).toBe('Places 2/3 · giw, passe · charge 4,2/12 · mémoire 9/30 Go');
  });

  it('le plafond refusé reste dit après les noms, à la place de la charge et de la mémoire', () => {
    const l = tete([{ ticket: 'demo-giw', racine: ICI }], {
      faute: 'GRILLHOUSE_PLACES vaut « x »',
    });
    expect(l.texte).toBe('Places 1/3 · giw · plafond refusé : GRILLHOUSE_PLACES vaut « x »');
    expect(l.ton).toBe('alerte');
  });

  it('sans prise tenue, la ligne garde sa forme d’avant', () => {
    expect(tete([]).texte).toBe('Places 0/3 · charge 4,2/12 · mémoire 9/30 Go');
  });
});

describe('la ligne tient dans la largeur du panneau, les prises en trop se comptent', () => {
  const quatre: Tenue[] = [
    { ticket: 'grillhouse-aaa', racine: GRILLHOUSE },
    { ticket: 'osc-bridge-bbb', racine: OSC },
    { ticket: 'osc-bridge-ccc', racine: OSC },
    { ticket: 'grillhouse-ddd', racine: GRILLHOUSE },
  ];

  it('les prises qui ne tiennent pas se comptent « +n », la charge et la mémoire restant après', () => {
    expect(tete(quatre, { largeur: 70 }).texte).toBe(
      'Places 4/3 · GH aaa, OB bbb +2 · charge 4,2/12 · mémoire 9/30 Go'
    );
  });

  it('à toute largeur du panneau, la ligne ne dépasse pas et chaque prise est nommée ou comptée', () => {
    const noms = ['GH aaa', 'OB bbb', 'OB ccc', 'GH ddd'];
    for (let largeur = LARGEUR; largeur <= 90; largeur++) {
      const { texte } = tete(quatre, { largeur });
      expect(colonnes(texte), `${largeur} : ${texte}`).toBeLessThanOrEqual(largeur);
      const segment = texte.slice('Places 4/3 · '.length, texte.indexOf(' · charge'));
      const compte = /\+(\d+)$/.exec(segment);
      const montres = segment
        .replace(/\s*\+\d+$/, '')
        .split(', ')
        .filter(Boolean);
      expect(montres, `${largeur}`).toEqual(noms.slice(0, montres.length));
      expect(montres.length + (compte ? Number(compte[1]) : 0), `${largeur} : ${texte}`).toBe(4);
    }
  });

  it('un plafond refusé aussi tient dans la largeur', () => {
    const l = tete(quatre, { largeur: 60, faute: 'GRILLHOUSE_PLACES vaut « x » dans machine.env' });
    expect(colonnes(l.texte)).toBeLessThanOrEqual(60);
    expect(l.texte).toMatch(/^Places 4\/3 · .*plafond refusé/);
  });
});

describe('l’état des places rend pour chaque prise son ticket et sa racine', () => {
  const machine = () => ({
    coeurs: 12,
    charge: 4.24,
    memoireLibre: 9 * GO,
    memoireTotale: 30 * GO,
  });
  const prise = (id: string, ticket: string | null, racine?: string) => ({
    id,
    pid: 1,
    depart: null,
    ticket,
    rang: 1,
    depuis: 1,
    ...(racine === undefined ? {} : { racine }),
  });

  it('chaque prise donne son ticket et sa racine, dans l’ordre des prises', () => {
    const lues = {
      plafond: 3,
      prises: [prise('a', 'demo-1', '/depots/un'), prise('b', null, '/depots/deux')],
      attentes: [],
    };
    const e = etatDesPlaces({ env: {}, mesurer: machine, lues });
    expect(e.prises).toBe(2);
    expect(e.tenues).toEqual([
      { ticket: 'demo-1', racine: '/depots/un' },
      { ticket: null, racine: '/depots/deux' },
    ]);
  });

  it('deux prises de même ticket de deux projets restent deux, chacune sa racine', () => {
    const lues = {
      plafond: 3,
      prises: [prise('a', 'x-7', '/depots/un'), prise('b', 'x-7', '/depots/deux')],
      attentes: [],
    };
    const e = etatDesPlaces({ env: {}, mesurer: machine, lues });
    expect(e.tenues.map((t: { racine: string }) => t.racine)).toEqual([
      '/depots/un',
      '/depots/deux',
    ]);
  });

  it('une prise sans racine (état d’avant) rend une racine nulle', () => {
    const lues = { plafond: 3, prises: [prise('a', 'demo-1')], attentes: [] };
    const e = etatDesPlaces({ env: {}, mesurer: machine, lues });
    expect(e.tenues).toEqual([{ ticket: 'demo-1', racine: null }]);
  });
});
