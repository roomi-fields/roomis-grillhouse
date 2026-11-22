/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
// Les cœurs dédiés d'une mesure de temps (scripts/coeurs-dedies.mjs) : des fonctions pures, le
// système en entrée, sans toucher la machine. Une unité de cœur dédié est un cœur physique entier
// (ses fils frères avec lui) ; le compte reste en fils, comme le budget.
import { beforeEach, describe, expect, it } from 'vitest';

// Le module se charge avant les tests : un module absent rougit chaque test, le fichier se charge.
const M: any = {};
beforeEach(async () => {
  Object.assign(M, await import('../../scripts/coeurs-dedies.mjs'));
});
const attacheDesCoeurs = (...a: any[]) => M.attacheDesCoeurs(...a);
const budgetEnFils = (...a: any[]) => M.budgetEnFils(...a);
const chargeHorsMesure = (...a: any[]) => M.chargeHorsMesure(...a);
const choisirLesCoeurs = (...a: any[]) => M.choisirLesCoeurs(...a);
const codeDeLaMesure = (...a: any[]) => M.codeDeLaMesure(...a);
const coeursDeLaMesureDe = (...a: any[]) => M.coeursDeLaMesureDe(...a);
const delegationDesCoeurs = (...a: any[]) => M.delegationDesCoeurs(...a);
const ecartDesProgrammes = (...a: any[]) => M.ecartDesProgrammes(...a);
const lireLaTopologie = (...a: any[]) => M.lireLaTopologie(...a);
const lireLesTempsOccupes = (...a: any[]) => M.lireLesTempsOccupes(...a);
const listeDeCoeurs = (...a: any[]) => M.listeDeCoeurs(...a);
const mesureDeclareeDe = (...a: any[]) => M.mesureDeclareeDe(...a);

const GO = 1024 ** 3;

type Topologie = { lisible: boolean; coeurs: { fils: number[]; noeud: number }[] };

// Une topologie : <coeurs> cœurs physiques de <fils> fils chacun (le fils k du cœur c est c + k ×
// coeurs, comme sur un processeur x86), répartis sur <noeuds> nœuds mémoire.
function topologie(coeurs: number, fils = 2, noeuds = 1): Topologie {
  return {
    lisible: true,
    coeurs: Array.from({ length: coeurs }, (_, c) => ({
      fils: Array.from({ length: fils }, (_, k) => c + k * coeurs),
      noeud: Math.floor((c * noeuds) / coeurs),
    })),
  };
}
const tous = (t: Topologie) => t.coeurs.flatMap(c => c.fils).sort((a, b) => a - b);
const cumul = (t: Topologie, fils: number[]) =>
  t.coeurs.filter(c => c.fils.some(f => fils.includes(f)));
// Les fils d'un résultat forment-ils des cœurs entiers de la topologie ?
const entiers = (t: Topologie, fils: number[]) =>
  cumul(t, fils).every(c => c.fils.every(f => fils.includes(f)));

describe('la clé grillhouse.mesure d’un projet', () => {
  it('sans clé, rien n’est déclaré', () => {
    expect(mesureDeclareeDe({})).toEqual({ declaree: null, faute: null });
    expect(mesureDeclareeDe({ grillhouse: { part: { coeurs: 2 } } })).toEqual({
      declaree: null,
      faute: null,
    });
  });

  it('lit les cœurs dédiés déclarés', () => {
    expect(mesureDeclareeDe({ grillhouse: { mesure: { coeurs: 6 } } })).toEqual({
      declaree: { coeurs: 6 },
      faute: null,
    });
  });

  it.each([
    [0, /coeurs/],
    [-1, /coeurs/],
    [1.5, /coeurs/],
    ['4', /coeurs/],
  ])('refuse la valeur fautive %j des cœurs en nommant la clé', (coeurs, motif) => {
    const r = mesureDeclareeDe({ grillhouse: { mesure: { coeurs } } });
    expect(r.declaree).toBeNull();
    expect(r.faute).toMatch(/grillhouse\.mesure/);
    expect(r.faute).toMatch(motif);
  });

  it.each([[null], [[2]], ['4'], [4]])('refuse la clé %j, qui n’est pas un objet', valeur => {
    expect(mesureDeclareeDe({ grillhouse: { mesure: valeur } }).faute).toMatch(
      /grillhouse\.mesure/
    );
  });

  it('refuse une clé inconnue de l’objet, nommée', () => {
    const r = mesureDeclareeDe({ grillhouse: { mesure: { coeurs: 2, memoireGo: 4 } } });
    expect(r.faute).toMatch(/grillhouse\.mesure/);
    expect(r.faute).toMatch(/memoireGo/);
  });
});

describe('le nombre de cœurs dédiés d’une mesure', () => {
  const budget = (coeurs: number) => ({ coeurs, memoire: 32 * GO });

  it.each([
    [28, 3],
    [12, 3],
    [4, 3],
    [3, 3],
  ])('sans clé, sur un budget de %i cœurs, vaut 3 cœurs : %i', (b, attendu) => {
    expect(coeursDeLaMesureDe({ declaree: null, budget: budget(b) })).toBe(attendu);
  });

  it('une valeur déclarée est reprise', () => {
    expect(coeursDeLaMesureDe({ declaree: { coeurs: 6 }, budget: budget(12) })).toBe(6);
  });

  it('une valeur plus grande que le budget vaut le budget', () => {
    expect(coeursDeLaMesureDe({ declaree: { coeurs: 40 }, budget: budget(12) })).toBe(12);
  });

  it('un budget de 2 cœurs donne 2 cœurs, jamais moins d’un', () => {
    expect(coeursDeLaMesureDe({ declaree: null, budget: budget(2) })).toBe(2);
    expect(coeursDeLaMesureDe({ declaree: null, budget: budget(1) })).toBe(1);
  });
});

describe('la topologie lue du système', () => {
  // Un système d'essai : <fichiers> est ce que lit le chemin demandé, null sinon.
  const systeme = (fichiers: Record<string, string>) => (chemin: string) =>
    fichiers[chemin] ?? null;
  const cpu = (n: number, freres: string) => [
    `/sys/devices/system/cpu/cpu${n}/topology/thread_siblings_list`,
    freres,
  ];

  it('groupe les fils frères d’un même cœur et donne le nœud mémoire de chacun', () => {
    const lire = systeme({
      ...Object.fromEntries([cpu(0, '0,2'), cpu(1, '1,3'), cpu(2, '0,2'), cpu(3, '1,3')]),
      '/sys/devices/system/node/online': '0-1',
      '/sys/devices/system/node/node0/cpulist': '0,2',
      '/sys/devices/system/node/node1/cpulist': '1,3',
    });
    const t = lireLaTopologie({ lire, nombreDeFils: 4 });
    expect(t.lisible).toBe(true);
    const parNoeud = Object.fromEntries(
      t.coeurs.map((c: { fils: number[]; noeud: number }) => [c.fils.join(','), c.noeud])
    );
    expect(parNoeud).toEqual({ '0,2': 0, '1,3': 1 });
  });

  it('lit une liste en intervalle de fils frères', () => {
    const lire = systeme({
      ...Object.fromEntries([cpu(0, '0-1'), cpu(1, '0-1')]),
      '/sys/devices/system/node/online': '0',
      '/sys/devices/system/node/node0/cpulist': '0-1',
    });
    const t = lireLaTopologie({ lire, nombreDeFils: 2 });
    expect(t.coeurs).toEqual([{ fils: [0, 1], noeud: 0 }]);
  });

  it('une machine sans nœuds lisibles met tous ses cœurs sur un seul nœud', () => {
    const lire = systeme(Object.fromEntries([cpu(0, '0'), cpu(1, '1')]));
    const t = lireLaTopologie({ lire, nombreDeFils: 2 });
    expect(new Set(t.coeurs.map((c: { noeud: number }) => c.noeud)).size).toBe(1);
  });

  it('une topologie illisible traite chaque fil comme un cœur et se dit illisible', () => {
    const t = lireLaTopologie({ lire: () => null, nombreDeFils: 4 });
    expect(t.lisible).toBe(false);
    expect(t.coeurs.map((c: { fils: number[] }) => c.fils)).toEqual([[0], [1], [2], [3]]);
  });
});

describe('la liste de cœurs écrite pour le système', () => {
  it.each([
    [[1, 5], '1,5'],
    [[0, 1, 2, 5], '0-2,5'],
    [[7, 3, 4], '3-4,7'],
    [[0], '0'],
    [[2, 3], '2-3'],
  ])('%j s’écrit %s', (fils, texte) => {
    expect(listeDeCoeurs(fils)).toBe(texte);
  });
});

describe('le budget en fils précis', () => {
  it('compte autant de fils que le budget, tous de la topologie', () => {
    const t = topologie(8);
    const b = budgetEnFils({ topologie: t, budget: 12 });
    expect(b).toHaveLength(12);
    expect(new Set(b).size).toBe(12);
    expect(b.every((f: number) => tous(t).includes(f))).toBe(true);
  });

  it('donne des cœurs entiers quand le budget le permet : 6 cœurs et leurs frères', () => {
    const t = topologie(8);
    expect(entiers(t, budgetEnFils({ topologie: t, budget: 12 }))).toBe(true);
  });

  it('un budget qui égale la machine donne tous ses fils', () => {
    const t = topologie(4);
    expect([...budgetEnFils({ topologie: t, budget: 8 })].sort((a, b) => a - b)).toEqual(tous(t));
  });
});

describe('le choix des cœurs précis', () => {
  const t8 = topologie(8);
  let budget12: number[] = [];
  beforeEach(() => {
    budget12 = budgetEnFils({ topologie: t8, budget: 12 });
  });

  it('la mesure par défaut sur 8 cœurs et 16 fils, budget 12, reçoit 4 fils : 2 cœurs et leurs frères', () => {
    const fils = choisirLesCoeurs({
      budget: budget12,
      topologie: t8,
      tenus: [],
      demande: 4,
      dedies: true,
    });
    expect(fils).toHaveLength(4);
    expect(entiers(t8, fils)).toBe(true);
    expect(cumul(t8, fils)).toHaveLength(2);
    expect(fils.every((f: number) => budget12.includes(f))).toBe(true);
  });

  it('les passes ordinaires reçoivent les 8 fils restants du budget, hors de ceux de la mesure', () => {
    const mesure = choisirLesCoeurs({
      budget: budget12,
      topologie: t8,
      tenus: [],
      demande: 4,
      dedies: true,
    });
    const premiere = choisirLesCoeurs({
      budget: budget12,
      topologie: t8,
      tenus: mesure,
      demande: 4,
      dedies: false,
    });
    const seconde = choisirLesCoeurs({
      budget: budget12,
      topologie: t8,
      tenus: [...mesure, ...premiere],
      demande: 4,
      dedies: false,
    });
    expect(premiere).toHaveLength(4);
    expect(seconde).toHaveLength(4);
    const ensemble = [...mesure, ...premiere, ...seconde];
    expect(new Set(ensemble).size).toBe(12);
    expect(ensemble.every((f: number) => budget12.includes(f))).toBe(true);
    // Une troisième passe n'a plus de quoi tenir sa part.
    expect(
      choisirLesCoeurs({
        budget: budget12,
        topologie: t8,
        tenus: ensemble,
        demande: 4,
        dedies: false,
      })
    ).toBeNull();
  });

  it('arrondit au-dessus de la demande : 3 fils demandés donnent 2 cœurs, 4 fils', () => {
    const fils = choisirLesCoeurs({
      budget: budget12,
      topologie: t8,
      tenus: [],
      demande: 3,
      dedies: true,
    });
    expect(fils).toHaveLength(4);
    expect(entiers(t8, fils)).toBe(true);
  });

  it('arrondit au-dessous quand le budget ne permet pas d’arrondir au-dessus, un groupe au moins', () => {
    // Le budget n'a qu'un cœur entier (1 et 5) ; les autres fils n'ont pas leur frère.
    const t = topologie(4);
    const budget = [0, 1, 2, 3, 5];
    const fils = choisirLesCoeurs({ budget, topologie: t, tenus: [], demande: 4, dedies: true });
    expect([...fils].sort((a, b) => a - b)).toEqual([1, 5]);
  });

  it('ne donne à la mesure aucun cœur que tient une passe : le frère d’un fil tenu est tenu', () => {
    const t = topologie(4);
    const budget = tous(t);
    // Une passe tient le fil 1 : son cœur (1 et 5) n'est plus libre pour la mesure.
    const fils = choisirLesCoeurs({ budget, topologie: t, tenus: [1], demande: 2, dedies: true });
    expect(fils).toHaveLength(2);
    expect(fils).not.toContain(1);
    expect(fils).not.toContain(5);
    expect(entiers(t, fils)).toBe(true);
  });

  it('une passe ordinaire ne reçoit aucun fil hors de son budget ni déjà tenu', () => {
    const t = topologie(4);
    const fils = choisirLesCoeurs({
      budget: [2, 3, 4, 6],
      topologie: t,
      tenus: [2],
      demande: 3,
      dedies: false,
    });
    expect([...fils].sort((a, b) => a - b)).toEqual([3, 4, 6]);
  });

  it('rend null quand il ne reste pas de quoi tenir la demande', () => {
    expect(
      choisirLesCoeurs({
        budget: budget12,
        topologie: t8,
        tenus: budget12.slice(0, 10),
        demande: 4,
        dedies: true,
      })
    ).toBeNull();
    expect(
      choisirLesCoeurs({
        budget: budget12,
        topologie: t8,
        tenus: budget12.slice(0, 10),
        demande: 3,
        dedies: false,
      })
    ).toBeNull();
  });

  it('prend les cœurs d’un seul nœud mémoire quand il en reste un qui tient', () => {
    // 4 cœurs, 2 fils, 2 nœuds : les cœurs 0 et 1 sur le nœud 0, 2 et 3 sur le nœud 1.
    const t = topologie(4, 2, 2);
    const budget = tous(t);
    // Un fil du cœur 0 est tenu : le nœud 0 n'a plus qu'un cœur libre, le nœud 1 en a deux.
    const fils = choisirLesCoeurs({ budget, topologie: t, tenus: [0], demande: 4, dedies: true });
    const noeuds = new Set(cumul(t, fils).map(c => c.noeud));
    expect(fils).toHaveLength(4);
    expect(noeuds.size).toBe(1);
  });

  it('s’étend sur deux nœuds quand aucun seul ne tient la demande', () => {
    const t = topologie(4, 2, 2);
    const fils = choisirLesCoeurs({
      budget: tous(t),
      topologie: t,
      tenus: [],
      demande: 6,
      dedies: true,
    });
    expect(fils).toHaveLength(6);
    expect(entiers(t, fils)).toBe(true);
    expect(new Set(cumul(t, fils).map(c => c.noeud)).size).toBe(2);
  });

  it('une topologie illisible donne chaque fil pour un cœur : 3 fils demandés, 3 fils reçus', () => {
    const t = lireLaTopologie({ lire: () => null, nombreDeFils: 8 });
    const fils = choisirLesCoeurs({
      budget: budgetEnFils({ topologie: t, budget: 6 }),
      topologie: t,
      tenus: [],
      demande: 3,
      dedies: true,
    });
    expect(fils).toHaveLength(3);
  });

  it('est pure : les entrées ne changent pas et le même appel rend le même choix', () => {
    const tenus = [0, 8];
    const copie = [...tenus];
    const a = choisirLesCoeurs({
      budget: budget12,
      topologie: t8,
      tenus,
      demande: 4,
      dedies: true,
    });
    const b = choisirLesCoeurs({
      budget: budget12,
      topologie: t8,
      tenus,
      demande: 4,
      dedies: true,
    });
    expect(tenus).toEqual(copie);
    expect(a).toEqual(b);
  });
});

describe('la voie d’attache d’une mesure', () => {
  const jamais = () => {
    throw new Error('sonde interrogée');
  };

  it('avec la délégation du contrôleur des cœurs, la mesure joue dans des groupes aux cœurs fixés', () => {
    const r = attacheDesCoeurs({ env: {}, delegation: () => true, affinite: jamais });
    expect(r.voie).toBe('groupe');
    expect(r.dit).toBeNull();
  });

  it('sans la délégation mais avec l’affinité, elle s’attache et dit le réglage du poste, une ligne', () => {
    const r = attacheDesCoeurs({ env: {}, delegation: () => false, affinite: () => true });
    expect(r.voie).toBe('affinite');
    expect(r.dit).toMatch(/Delegate=/);
    expect(r.dit).toMatch(/cpuset/);
    expect(r.dit).toMatch(/hors du cadre/);
    expect(r.dit).not.toContain('\n');
  });

  it('sans aucune des deux voies, elle ne réserve ni n’attache rien, et le dit', () => {
    const r = attacheDesCoeurs({ env: {}, delegation: () => false, affinite: () => false });
    expect(r.voie).toBe('aucune');
    expect(r.dit).toMatch(/sans part tenue/);
  });

  it('dans l’enveloppe d’un agent, elle ne réserve ni n’attache rien, sans interroger le système', () => {
    const r = attacheDesCoeurs({
      env: { GRILLHOUSE_ENVELOPPE: 'packages/a' },
      delegation: jamais,
      affinite: jamais,
    });
    expect(r.voie).toBe('aucune');
    expect(r.dit).toMatch(/enveloppe/);
  });
});

describe('la délégation du contrôleur des cœurs', () => {
  it('se lit dans les contrôleurs que le système délègue au compte', () => {
    expect(delegationDesCoeurs('cpuset cpu io memory pids\n')).toBe(true);
    expect(delegationDesCoeurs('memory pids cpuset\n')).toBe(true);
  });

  it('le contrôleur du temps de processeur seul n’est pas celui des cœurs', () => {
    expect(delegationDesCoeurs('cpu io memory pids\n')).toBe(false);
    expect(delegationDesCoeurs('')).toBe(false);
  });

  it('un texte illisible n’est pas une délégation', () => {
    expect(delegationDesCoeurs(null)).toBe(false);
  });
});

describe('les programmes hors du cadre tenus à l’écart des cœurs dédiés', () => {
  it('permet aux programmes hors du cadre tous les fils sauf ceux de la mesure', () => {
    const l = ecartDesProgrammes({ dedies: [2, 6], fils: [0, 1, 2, 3, 4, 5, 6, 7] });
    expect(l.args.join(' ')).toContain('AllowedCPUs=0-1,3-5,7');
    expect(l.args).toContain('--user');
  });

  it('sans mesure qui joue, rend tous les fils', () => {
    const l = ecartDesProgrammes({ dedies: [], fils: [0, 1, 2, 3] });
    expect(l.args.join(' ')).toContain('AllowedCPUs=0-3');
  });
});

describe('le repos des cœurs dédiés', () => {
  // /proc/stat : user nice system idle iowait irq softirq steal guest guest_nice, en centièmes de seconde.
  const stat = (lignes: Record<number, [number, number]>) =>
    [
      'cpu  1 1 1 1 1 1 1 1 0 0',
      ...Object.entries(lignes).map(
        ([n, [occupe, repos]]) => `cpu${n} ${occupe} 0 0 ${repos} 0 0 0 0 0 0`
      ),
      'intr 123 4 5',
    ].join('\n');

  it('lit le temps occupé et le temps total de chaque cœur', () => {
    const t = lireLesTempsOccupes(stat({ 0: [10, 90], 3: [40, 60] }));
    expect(t[0]).toEqual({ occupe: 10, total: 100 });
    expect(t[3]).toEqual({ occupe: 40, total: 100 });
    expect(t).not.toHaveProperty('cpu');
  });

  it('compte user, nice, system, irq, softirq et steal comme occupé, idle et iowait comme repos', () => {
    const t = lireLesTempsOccupes('cpu2 1 2 3 100 50 4 5 6 7 8\n');
    expect(t[2]).toEqual({
      occupe: 1 + 2 + 3 + 4 + 5 + 6,
      total: 1 + 2 + 3 + 4 + 5 + 6 + 100 + 50,
    });
  });

  it('la charge est le temps occupé sur la capacité des cœurs dédiés seuls', () => {
    const avant = lireLesTempsOccupes(stat({ 1: [0, 0], 5: [0, 0], 2: [0, 0] }));
    const apres = lireLesTempsOccupes(stat({ 1: [20, 80], 5: [20, 80], 2: [100, 0] }));
    // Deux fils dédiés, 200 de capacité, 40 d'occupé ; le fil 2 n'est pas à eux.
    expect(chargeHorsMesure({ avant, apres, fils: [1, 5] })).toBeCloseTo(0.2, 5);
  });

  it('ôte le temps de la mesure, tiré de son propre groupe', () => {
    const avant = lireLesTempsOccupes(stat({ 1: [0, 0], 5: [0, 0] }));
    const apres = lireLesTempsOccupes(stat({ 1: [20, 80], 5: [20, 80] }));
    // 30 centièmes de seconde de la mesure : 3e8 ns.
    expect(chargeHorsMesure({ avant, apres, fils: [1, 5], mesureNs: 3e8 })).toBeCloseTo(0.05, 5);
  });

  it('ne descend pas sous zéro quand la mesure explique tout le temps occupé', () => {
    const avant = lireLesTempsOccupes(stat({ 1: [0, 0] }));
    const apres = lireLesTempsOccupes(stat({ 1: [50, 50] }));
    expect(chargeHorsMesure({ avant, apres, fils: [1], mesureNs: 9e9 })).toBe(0);
  });

  it('sans lecture d’un des cœurs, la charge n’est pas jugée', () => {
    const avant = lireLesTempsOccupes(stat({ 1: [0, 0] }));
    const apres = lireLesTempsOccupes(stat({ 1: [20, 80] }));
    expect(chargeHorsMesure({ avant, apres, fils: [1, 5] })).toBeNull();
    expect(chargeHorsMesure({ avant: null, apres, fils: [1] })).toBeNull();
  });

  it('le seuil de repos est 10 % de la capacité des cœurs dédiés', () => {
    expect(M.SEUIL_DE_CHARGE).toBe(0.1);
  });
});

describe('le code d’une mesure de temps', () => {
  it('une mesure rouge jouée sur des cœurs chargés au-delà de 10 % est à repasser (75)', () => {
    expect(codeDeLaMesure({ code: 1, charge: 0.25 })).toBe(75);
  });

  it('une mesure rouge sur des cœurs au repos reste rouge (1)', () => {
    expect(codeDeLaMesure({ code: 1, charge: 0.04 })).toBe(1);
    expect(codeDeLaMesure({ code: 1, charge: 0.1 })).toBe(1);
  });

  it('une mesure verte reste verte, même sur des cœurs chargés', () => {
    expect(codeDeLaMesure({ code: 0, charge: 0.9 })).toBe(0);
  });

  it('sans lecture de la charge, la mesure ne juge pas cette charge', () => {
    expect(codeDeLaMesure({ code: 1, charge: null })).toBe(1);
  });

  it('un autre code que 1 reste ce qu’il est', () => {
    expect(codeDeLaMesure({ code: 75, charge: 0.02 })).toBe(75);
    expect(codeDeLaMesure({ code: 2, charge: 0.5 })).toBe(2);
  });
});
