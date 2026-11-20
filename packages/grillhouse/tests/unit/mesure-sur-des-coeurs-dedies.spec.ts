/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
// Une mesure de temps joue sur des cœurs dédiés (scripts/places-de-la-machine.mjs `prendreUnePart`
// avec `mesure: true`, scripts/regles-des-places.mjs `refusDePart`, scripts/passe-de-la-machine.mjs
// `lancementSousPart`) : elle réserve des cœurs précis, les passes ordinaires continuent sur les
// cœurs restants, et elle attend le repos de ses cœurs. La machine est celle d'un essai :
// 16 fils sur 8 cœurs, réserve de l'utilisateur 4, budget 12.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { departDe } from '../../scripts/mesure/base-de-passe.mjs';
import {
  delegationDeLaPasse,
  jugeLaChargeDuJeu,
  lancementSousPart,
} from '../../scripts/passe-de-la-machine.mjs';
import {
  dossierDesParts,
  lireLesParts,
  poserLaPart,
  lecteurDeLaCharge,
  prendreUnePart,
} from '../../scripts/places-de-la-machine.mjs';
import { refusDePart } from '../../scripts/regles-des-places.mjs';

const GO = 1024 ** 3;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'mesure-coeurs-dedies-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const unDossier = (nom: string) => mkdtempSync(path.join(ESSAIS, `${nom}-`));

type Topologie = { lisible: boolean; coeurs: { fils: number[]; noeud: number }[] };
// 8 cœurs de 2 fils (le fils k du cœur c est c + 8k), un nœud mémoire.
const topologie = (coeurs = 8): Topologie => ({
  lisible: true,
  coeurs: Array.from({ length: coeurs }, (_, c) => ({ fils: [c, c + coeurs], noeud: 0 })),
});
const illisible = (fils: number): Topologie => ({
  lisible: false,
  coeurs: Array.from({ length: fils }, (_, f) => ({ fils: [f], noeud: 0 })),
});
const cumul = (t: Topologie, fils: number[]) =>
  t.coeurs.filter(c => c.fils.some(f => fils.includes(f)));

// Un projet d'essai : sa racine, son package.json portant <grillhouse>.
function projet(grillhouse?: Record<string, unknown>) {
  const racine = unDossier('projet');
  writeFileSync(
    path.join(racine, 'package.json'),
    JSON.stringify({ name: 'essai', ...(grillhouse ? { grillhouse } : {}) })
  );
  return racine;
}
// L'environnement d'un poste d'essai : <fils> fils, réserve de l'utilisateur 4 cœurs, un état des
// parts à lui, de la place partout.
function poste(fils = 16, ajouts: Record<string, string> = {}) {
  return {
    HOME: unDossier('maison'),
    TMPDIR: unDossier('tmp'),
    GRILLHOUSE_PARTS_DE_LA_MACHINE: path.join(unDossier('parts'), 'etat'),
    GRILLHOUSE_RESERVE_COEURS: '4',
    GRILLHOUSE_MESURE_D_ESSAI: JSON.stringify({
      coeurs: fils,
      charge: 0,
      memoireLibre: 40 * GO,
      memoireTotale: 64 * GO,
    }),
    ...ajouts,
  };
}
const libre = () => Infinity;
const calme = () => 0;
type Opts = Record<string, unknown>;
const prendre = (env: Record<string, string>, racine: string, o: Opts = {}) =>
  prendreUnePart({
    env,
    racine,
    libre,
    occupe: () => 'rien',
    borneMs: 0,
    dire: () => {},
    topologie: topologie(),
    chargeDesCoeurs: calme,
    ...o,
  });
const arret = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    const { message, code } = e as { message: string; code: number };
    return { message, code };
  }
  return null;
};

describe('une mesure de temps réserve des cœurs précis', () => {
  it('reçoit, par défaut, 4 fils : 2 cœurs physiques avec leurs frères, et ne prend pas la machine entière', () => {
    const env = poste();
    const m = prendre(env, projet(), { mesure: true });
    expect(m.part.coeurs).toBe(4);
    expect(m.fils).toHaveLength(4);
    expect(cumul(topologie(), m.fils)).toHaveLength(2);
    expect(
      cumul(topologie(), m.fils)
        .flatMap(c => c.fils)
        .sort()
    ).toEqual([...m.fils].sort());
    m.rendre();
  });

  it('inscrit ses cœurs précis dans l’état de la machine, où ses voisines les lisent', () => {
    const env = poste();
    const m = prendre(env, projet(), { mesure: true });
    const { prises } = lireLesParts(dossierDesParts(env));
    expect(prises).toHaveLength(1);
    expect([...prises[0].fils].sort()).toEqual([...m.fils].sort());
    expect(prises[0].dediee).toBe(true);
    m.rendre();
    expect(lireLesParts(dossierDesParts(env)).prises).toEqual([]);
  });

  it('lit le nombre de cœurs dédiés dans la clé grillhouse.mesure du projet', () => {
    const m = prendre(poste(), projet({ mesure: { coeurs: 2 } }), { mesure: true });
    expect(m.part.coeurs).toBe(2);
    expect(m.fils).toHaveLength(2);
    m.rendre();
  });

  it('arrondit la demande au cœur physique entier : 3 fils déclarés, 4 fils reçus', () => {
    const m = prendre(poste(), projet({ mesure: { coeurs: 3 } }), { mesure: true });
    expect(m.fils).toHaveLength(4);
    expect(m.part.coeurs).toBe(4);
    m.rendre();
  });

  it('une valeur plus grande que le budget vaut le budget', () => {
    const m = prendre(poste(), projet({ mesure: { coeurs: 99 } }), { mesure: true });
    expect(m.fils).toHaveLength(12);
    m.rendre();
  });

  it('une clé fautive est refusée par son nom avant tout travail, code 1', () => {
    const env = poste();
    const r = arret(() => prendre(env, projet({ mesure: { coeurs: 0 } }), { mesure: true }));
    expect(r?.code).toBe(1);
    expect(r?.message).toMatch(/grillhouse\.mesure/);
    expect(lireLesParts(dossierDesParts(env))).toEqual({ prises: [], attentes: [] });
  });

  it('la clé de la part ne règle pas celle de la mesure, ni l’inverse', () => {
    const racine = projet({ part: { coeurs: 6 }, mesure: { coeurs: 2 } });
    const mesure = prendre(poste(), racine, { mesure: true });
    expect(mesure.part.coeurs).toBe(2);
    mesure.rendre();
    const ordinaire = prendre(poste(), racine);
    expect(ordinaire.part.coeurs).toBe(6);
    ordinaire.rendre();
  });

  it('une topologie illisible traite chaque fil comme un cœur et le dit une fois', () => {
    const dit: string[] = [];
    const m = prendre(poste(8), projet({ mesure: { coeurs: 3 } }), {
      mesure: true,
      topologie: illisible(8),
      dire: (l: string) => dit.push(l),
    });
    expect(m.fils).toHaveLength(3);
    m.rendre();
    expect(dit.filter(l => /topologie/.test(l))).toHaveLength(1);
  });
});

describe('les passes ordinaires continuent pendant une mesure de temps', () => {
  it('une passe dont la part tient dans les cœurs restants part, sur d’autres cœurs que la mesure', () => {
    const env = poste();
    const racine = projet();
    const m = prendre(env, racine, { mesure: true });
    const a = prendre(env, racine);
    const b = prendre(env, racine);
    expect(a.part.coeurs).toBe(4);
    const tous = [...m.fils, ...a.fils, ...b.fils];
    expect(new Set(tous).size).toBe(12);
    for (const f of a.fils) {
      expect(m.fils).not.toContain(f);
    }
    // Aucune passe ordinaire ne reçoit le fil frère d'un cœur dédié.
    const freres = cumul(topologie(), m.fils).flatMap(c => c.fils);
    for (const f of [...a.fils, ...b.fils]) {
      expect(freres).not.toContain(f);
    }
    for (const p of [m, a, b]) {
      p.rendre();
    }
  });

  it('une passe ordinaire déjà en jeu garde ses cœurs : la mesure prend les autres', () => {
    const env = poste();
    const racine = projet();
    const a = prendre(env, racine);
    const m = prendre(env, racine, { mesure: true });
    for (const f of m.fils) {
      expect(a.fils).not.toContain(f);
    }
    expect(cumul(topologie(), m.fils).flatMap(c => c.fils)).not.toEqual(
      expect.arrayContaining(a.fils)
    );
    a.rendre();
    m.rendre();
  });

  it('sur une machine où il ne reste pas de quoi tenir une part, la passe attend, comme avant', () => {
    // 8 fils, réserve 4 : budget de 4 fils, que la mesure prend entier.
    const env = poste(8);
    const racine = projet();
    const t = topologie(4);
    const m = prendre(env, racine, { mesure: true, topologie: t });
    const r = arret(() => prendre(env, racine, { topologie: t }));
    expect(r?.code).toBe(75);
    expect(r?.message).toMatch(/cœurs/);
    m.rendre();
  });

  it('plus aucune passe ne tient quand le budget est pris, mesure comprise', () => {
    const env = poste();
    const racine = projet();
    const prises = [
      prendre(env, racine, { mesure: true }),
      prendre(env, racine),
      prendre(env, racine),
    ];
    expect(arret(() => prendre(env, racine))?.code).toBe(75);
    prises.forEach(p => p.rendre());
  });
});

describe('une mesure de temps qui attend ses cœurs dédiés', () => {
  it('dit ce qu’elle attend : des cœurs dédiés, et les passes qui les tiennent', () => {
    const env = poste();
    const racine = projet();
    const tenues = [
      prendre(env, racine, { ticket: 'gh-1' }),
      prendre(env, racine, { ticket: 'gh-2' }),
      prendre(env, racine, { ticket: 'gh-3' }),
    ];
    const r = arret(() => prendre(env, racine, { mesure: true }));
    expect(r?.code).toBe(75);
    expect(r?.message).toMatch(/cœurs dédiés/);
    expect(r?.message).toMatch(/gh-1/);
    expect(r?.message).toMatch(/gh-3/);
    expect(r?.message).toMatch(/à repasser \(code 75\)/);
    tenues.forEach(p => p.rendre());
  });

  it('rend ses cœurs en s’arrêtant : elle ne laisse aucune part', () => {
    const env = poste();
    const racine = projet();
    const tenue = prendre(env, racine, { mesure: true });
    arret(() => prendre(env, racine, { mesure: true }));
    expect(lireLesParts(dossierDesParts(env)).prises).toHaveLength(1);
    expect(lireLesParts(dossierDesParts(env)).attentes).toEqual([]);
    tenue.rendre();
  });

  it('garde son rang : une passe ordinaire arrivée après attend derrière elle, même si sa part tiendrait', () => {
    const env = poste();
    const racine = projet();
    const dossier = dossierDesParts(env);
    mkdirSync(dossier, { recursive: true });
    poserLaPart(dossier, {
      id: 'mesure-en-attente',
      pid: process.pid,
      depart: departDe(process.pid),
      projet: 'essai',
      ticket: 'gh-9',
      sorte: 'Tests',
      rang: 1,
      coeurs: 4,
      memoire: 8 * GO,
      dediee: true,
      etat: 'attend',
      raison: 'cœurs dédiés : 4 demandés, 2 libres sur 12',
    });
    const r = arret(() => prendre(env, racine));
    expect(r?.code).toBe(75);
    expect(r?.message).toMatch(/rang réservé/);
    expect(r?.message).toMatch(/gh-9/);
  });
});

describe('le tour d’une mesure de temps parmi les parts', () => {
  const budget = { coeurs: 12, memoire: 48 * GO };
  const part = (coeurs: number) => ({ coeurs, memoire: coeurs * 4 * GO });
  const calmeMachine = { coeurs: 16, charge: 0, memoireLibre: 40 * GO };
  const prise = (id: string, coeurs: number, ticket: string) => ({
    id,
    coeurs,
    memoire: coeurs * 4 * GO,
    ticket,
  });

  it('une mesure dédiée qui ne tient pas dit « cœurs dédiés » et nomme les passes qui les tiennent', () => {
    const r = refusDePart(
      { prises: [prise('a', 6, 'gh-1'), prise('b', 4, 'gh-2')], attentes: [] },
      {
        id: 'moi',
        rang: 5,
        part: part(4),
        budget,
        mesurer: () => calmeMachine,
        dediee: true,
      }
    );
    expect(r).toMatch(/cœurs dédiés/);
    expect(r).toMatch(/gh-1/);
    expect(r).toMatch(/gh-2/);
  });

  it('une passe ordinaire dont la part tient dans les cœurs restants de la mesure en jeu part', () => {
    const r = refusDePart(
      { prises: [{ ...prise('m', 4, 'gh-1'), dediee: true }], attentes: [] },
      { id: 'moi', rang: 5, part: part(4), budget, mesurer: () => calmeMachine }
    );
    expect(r).toBeNull();
  });

  it('une passe ordinaire arrivée après une mesure qui attend attend derrière elle', () => {
    const r = refusDePart(
      {
        prises: [],
        attentes: [
          {
            id: 'm',
            rang: 2,
            ticket: 'gh-4',
            raison: 'cœurs dédiés : 4 demandés, 2 libres',
            dediee: true,
          },
        ],
      },
      { id: 'moi', rang: 7, part: part(2), budget, mesurer: () => calmeMachine }
    );
    expect(r).toMatch(/rang réservé/);
    expect(r).toMatch(/gh-4/);
  });
});

describe('le repos des cœurs dédiés avant de partir', () => {
  it('une mesure attend que la charge de ses cœurs hors elle passe sous 10 % et dit la charge relevée', () => {
    const env = poste();
    const lignes: string[] = [];
    const relevees = [0.4, 0.3, 0.05];
    const m = prendre(env, projet(), {
      mesure: true,
      borneMs: 60_000,
      rappelMs: 1,
      dormir: () => {},
      chargeDesCoeurs: () => relevees.shift() ?? 0.05,
      dire: (l: string) => lignes.push(l),
    });
    expect(relevees).toEqual([]);
    expect(lignes.some(l => /40 ?%/.test(l))).toBe(true);
    m.rendre();
  });

  it('à la borne de l’attente, une charge trop forte est à repasser (75) avec la charge relevée', () => {
    const r = arret(() =>
      prendre(poste(), projet(), { mesure: true, chargeDesCoeurs: () => 0.35 })
    );
    expect(r?.code).toBe(75);
    expect(r?.message).toMatch(/35 ?%/);
    expect(r?.message).toMatch(/à repasser \(code 75\)/);
  });

  it('la charge se lit sur les cœurs dédiés seuls, ceux que la mesure vient de recevoir', () => {
    let lus: number[] = [];
    const m = prendre(poste(), projet(), {
      mesure: true,
      chargeDesCoeurs: (fils: number[]) => {
        lus = fils;
        return 0;
      },
    });
    expect([...lus].sort()).toEqual([...m.fils].sort());
    m.rendre();
  });

  it('sans lecture possible, la mesure ne juge pas cette charge et le dit une fois', () => {
    const dit: string[] = [];
    const m = prendre(poste(), projet(), {
      mesure: true,
      chargeDesCoeurs: () => null,
      dire: (l: string) => dit.push(l),
    });
    expect(m.part.coeurs).toBe(4);
    expect(dit.filter(l => /charge/.test(l))).toHaveLength(1);
    m.rendre();
  });

  it('sur la machine d’un essai, les cœurs dédiés sont au repos : la charge du poste ne se lit pas', () => {
    const duPoste = () => 0.9;
    expect(lecteurDeLaCharge(poste(), duPoste)([0, 1])).toBe(0);
    expect(lecteurDeLaCharge({}, duPoste)).toBe(duPoste);
    // The measure of a trial leaves at once, whatever the machine that plays the test carries.
    const m = prendre(poste(), projet(), { mesure: true, chargeDesCoeurs: undefined });
    expect(m.part.coeurs).toBe(4);
    m.rendre();
  });

  it('sur la machine d’un essai, la charge du poste pendant le jeu ne se juge pas : un rouge garde son code', () => {
    expect(jugeLaChargeDuJeu({ dediee: true, voie: 'affinite', env: poste() })).toBe(false);
    expect(jugeLaChargeDuJeu({ dediee: true, voie: 'groupe', env: poste() })).toBe(false);
    expect(jugeLaChargeDuJeu({ dediee: true, voie: 'affinite', env: {} })).toBe(true);
    expect(jugeLaChargeDuJeu({ dediee: true, voie: 'aucune', env: {} })).toBe(false);
    expect(jugeLaChargeDuJeu({ dediee: false, voie: 'groupe', env: {} })).toBe(false);
  });

  it('sur la machine d’un essai, la délégation des cœurs du poste ne se demande pas', () => {
    // Under a trial without an injection: no, without asking the system.
    expect(delegationDeLaPasse({ env: poste() })?.()).toBe(false);
    // An injected delegation is the one read, under a trial too.
    const injectee = () => true;
    expect(delegationDeLaPasse({ env: poste(), delegation: injectee })).toBe(injectee);
    expect(delegationDeLaPasse({ env: {}, delegation: injectee })).toBe(injectee);
    // Out of a trial, the system's own answer stays.
    expect(delegationDeLaPasse({ env: {} })).toBeUndefined();
  });

  it('une passe ordinaire n’attend aucun repos', () => {
    const m = prendre(poste(), projet(), { chargeDesCoeurs: () => 0.9 });
    expect(m.part.coeurs).toBe(4);
    m.rendre();
  });
});

describe('l’attache d’une mesure à ses cœurs', () => {
  const part = { coeurs: 4, memoire: 8 * GO };
  const env = { PATH: '/bin' };

  it('avec la délégation, le groupe de la mesure ne permet que ses cœurs', () => {
    const l = lancementSousPart({
      part,
      cmd: 'npm',
      args: ['test'],
      env,
      groupe: true,
      fils: [1, 5, 2, 6],
    });
    expect(l.cmd).toBe('systemd-run');
    expect(l.args).toContain('AllowedCPUs=1-2,5-6');
    expect(l.args.slice(-2)).toEqual(['npm', 'test']);
  });

  it('sans la délégation, sur un système qui le permet, l’affinité de lancement attache la mesure, enfants compris', () => {
    const l = lancementSousPart({
      part,
      cmd: 'npm',
      args: ['test'],
      env,
      groupe: false,
      affinite: true,
      fils: [1, 5, 2, 6],
    });
    expect(l.cmd).toBe('taskset');
    expect(l.args).toEqual(['-c', '1-2,5-6', 'npm', 'test']);
    expect(l.env.GRILLHOUSE_TRAVAILLEURS).toBe('4');
  });

  it('sans aucune des deux voies, la mesure joue comme aujourd’hui, la commande intacte', () => {
    const l = lancementSousPart({
      part,
      cmd: 'npm',
      args: ['test'],
      env,
      groupe: false,
      affinite: false,
      fils: [1, 5, 2, 6],
    });
    expect(l.cmd).toBe('npm');
    expect(l.args).toEqual(['test']);
  });

  it('une passe sans cœurs précis garde son lancement d’avant, sans affinité', () => {
    const l = lancementSousPart({ part, cmd: 'npm', args: ['test'], env, groupe: false });
    expect(l.cmd).toBe('npm');
    expect(l.args).toEqual(['test']);
  });
});
