// Le panneau (scripts/tableau.mjs) dit la part d'une passe sur la ligne de son ticket : « 🔒 » quand
// elle tient sa part, « ⏳ » quand elle attend la sienne ; le bloc « Parts » ne garde que sa ligne de
// compte et les passes sans ticket. Petits tests : `assembler` et `lignes` par leur interface.
import { describe, expect, it } from 'vitest';
import { assembler, LARGEUR, lignes, lignesDesParts } from '../../scripts/tableau.mjs';

const MIN = 60_000;
const GO = 1024 ** 3;
const MAINTENANT = Date.parse('2026-11-22T12:00:00Z');

interface Ligne {
  texte: string;
  ticket?: string;
  section?: string;
}
const colonnes = (s: string) => [...s].length + (s.match(/[🔒⏳⛔💤🌙]/gu)?.length ?? 0);

const T = (id: string, titre: string, labels: string[]) => ({
  id,
  title: `${id.slice(id.indexOf('-') + 1)} — ${titre} — packages/x`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: '2026-11-22T09:00:00Z',
  assignee: 'roomi-fields',
  labels,
});
const circuit = (ticket: string) => ({
  ticket,
  etape: 'developpeur',
  tentative: 1,
  finale: false,
  code: null,
  arret: null,
  raison: null,
  question: null,
  qui: null,
  questionnement: null,
  boucles: {},
  mene: null,
  avancement: null,
  vivant: true,
});
const vivant = (agent: string, ticket: string, role: string) => ({
  agent,
  ticket,
  role,
  ligne: false,
  depuis: MAINTENANT - 30 * MIN,
  entre: null,
  jetons: 40,
  travail: 20 * MIN,
  tours: [[MAINTENANT - 20 * MIN, MAINTENANT]],
});
const tient = (ticket: string | null, o: object = {}) => ({
  id: `p-${ticket ?? 'sans'}`,
  ticket,
  projet: 'demo',
  sorte: 'Contrôles',
  coeurs: 2,
  memoire: 4 * GO,
  depuis: MAINTENANT - 3 * MIN,
  ...o,
});
const attend = (ticket: string | null, o: object = {}) => ({
  id: `w-${ticket ?? 'sans'}`,
  ticket,
  projet: 'demo',
  sorte: 'Contrôles',
  coeurs: 2,
  depuis: MAINTENANT - MIN,
  rang: 1,
  raison: 'cœurs : 2 demandés, 0 libres sur 28',
  ...o,
});
const budget = { coeurs: 28, memoire: 26 * GO };
type Machine = { prises: object[]; attentes: object[] };
const plateau = (
  tous: object[],
  o: { circuits?: object[]; vivants?: object[]; machine: Machine }
) =>
  assembler({
    tous,
    prefix: 'demo',
    registre: [],
    vivants: o.vivants ?? [],
    circuits: o.circuits ?? [],
    voies: {},
    muet: false,
    maintenant: MAINTENANT,
    jour: MAINTENANT - 10 * 60 * MIN,
    machine: { budget, ...o.machine },
    places: null,
  } as unknown as Parameters<typeof assembler>[0]);
const toutes = (p: ReturnType<typeof plateau>, largeur?: number) =>
  lignes(p, 'depot', largeur ?? 110) as Ligne[];
const duTicket = (l: Ligne[], id: string) => l.find(x => x.ticket === id && x.section === 'agents');
const sousParts = (l: Ligne[]) => l.filter(x => /^(🔒|⏳)/.test(x.texte));

// Les quatre sortes de ticket que le panneau montre sur une ligne.
const SORTES = [
  {
    nom: 'un circuit',
    tous: [T('demo-1', 'Le sujet', ['circuit'])],
    options: { circuits: [circuit('demo-1')] },
    id: 'demo-1',
    tete: /^\S+ 1 +/,
  },
  {
    nom: 'un ticket mené en direct',
    tous: [T('demo-9', 'Le sujet', ['direct'])],
    options: { vivants: [vivant('d1', 'demo-9', 'direct')] },
    id: 'demo-9',
    tete: /^\S+ 9 +/,
  },
  {
    nom: 'un ticket travaillé hors circuit',
    tous: [T('demo-7', 'Le sujet', ['direct'])],
    options: {},
    id: 'demo-7',
    tete: /^\S+ 7 +/,
  },
  {
    nom: 'un agent hors circuit',
    tous: [T('demo-8', 'Le sujet', [])],
    options: { vivants: [vivant('a1', 'demo-8', 'developpeur')] },
    id: 'demo-8',
    tete: /^\S+ 8 +/,
  },
];

describe.each(SORTES)(
  'la part d’une passe de $nom, dite sur sa ligne',
  ({ tous, options, id, tete }) => {
    it('une passe qui tient sa part porte « 🔒 » juste après la tête, avant le sujet, sans ligne sous « Parts »', () => {
      const l = toutes(
        plateau(tous, { ...options, machine: { prises: [tient(id)], attentes: [] } })
      );
      const ligne = duTicket(l, id)!;
      expect(ligne.texte).toMatch(new RegExp(`${tete.source}🔒 Le sujet`));
      expect(sousParts(l)).toEqual([]);
      expect(l.some(x => x.texte.startsWith('Parts · 1 passe '))).toBe(true);
    });

    it('une passe qui attend sa part porte « ⏳ » et dit ce qu’elle attend, sans ligne sous « Parts »', () => {
      const machine = { prises: [tient(null, { coeurs: 24 })], attentes: [attend(id)] };
      const l = toutes(plateau(tous, { ...options, machine }));
      const ligne = duTicket(l, id)!;
      expect(ligne.texte).toMatch(new RegExp(`${tete.source}⏳ Le sujet`));
      expect(ligne.texte).toMatch(/attend 2 cœurs · 24 réservés sur 28 · 1 min/);
      expect(sousParts(l).some(x => x.texte.startsWith('⏳'))).toBe(false);
    });

    it('l’alerte de dépassement va sur la ligne du ticket', () => {
      const depasse = 'cœurs : 7,5 mesurés pour 2';
      const l = toutes(
        plateau(tous, { ...options, machine: { prises: [tient(id, { depasse })], attentes: [] } })
      );
      expect(duTicket(l, id)!.texte).toContain(`⚠ ${depasse}`);
      expect(l.some(x => x.texte.includes(depasse) && x !== duTicket(l, id))).toBe(false);
    });

    it('une passe sans ticket garde sa ligne sous « Parts », celle du ticket reste sans icône', () => {
      const machine = { prises: [tient(null, { sorte: 'Nuit' })], attentes: [attend(null)] };
      const l = toutes(plateau(tous, { ...options, machine }));
      expect(sousParts(l).map(x => [...x.texte][0])).toEqual(['🔒', '⏳']);
      expect(duTicket(l, id)!.texte).not.toMatch(/🔒|⏳/);
    });

    it('le sujet se coupe avant l’icône, la ligne tient dans la largeur', () => {
      const longs = tous.map(x => ({
        ...x,
        title: `${(x as { title: string }).title.replace('Le sujet', 'Un sujet très très long '.repeat(6))}`,
      }));
      const l = toutes(
        plateau(longs, { ...options, machine: { prises: [tient(id)], attentes: [] } }),
        60
      );
      const texte = duTicket(l, id)!.texte;
      expect(texte).toMatch(/🔒/);
      expect(texte).toMatch(/…/);
      expect(texte.indexOf('🔒')).toBeLessThan(texte.indexOf('…'));
      expect(colonnes(texte)).toBeLessThanOrEqual(60);
    });
  }
);

describe('le sens de la ligne du ticket', () => {
  it('l’icône s’ajoute au signe de la ligne, ▶ ici, sans le remplacer', () => {
    const l = toutes(
      plateau([T('demo-7', 'Le sujet', ['direct'])], {
        machine: { prises: [tient('demo-7')], attentes: [] },
      })
    );
    expect(duTicket(l, 'demo-7')!.texte).toMatch(/^▶ 7 +🔒 /);
  });

  it('un direct qui tient sa part dit sa sorte, ses cœurs et sa durée', () => {
    const l = toutes(
      plateau([T('demo-9', 'Le sujet', ['direct'])], {
        vivants: [vivant('d1', 'demo-9', 'direct')],
        machine: { prises: [tient('demo-9')], attentes: [] },
      })
    );
    expect(duTicket(l, 'demo-9')!.texte).toMatch(/direct · contrôles · 2 cœurs · 3 min/);
  });

  it('une passe figée garde « figée » avec son icône', () => {
    const l = toutes(
      plateau([T('demo-1', 'Le sujet', ['circuit'])], {
        circuits: [circuit('demo-1')],
        machine: {
          prises: [
            tient('demo-1', {
              avancement: { faits: 1, prevus: 3, dernier: MAINTENANT - 20 * MIN },
            }),
          ],
          attentes: [],
        },
      })
    );
    const texte = duTicket(l, 'demo-1')!.texte;
    expect(texte).toMatch(/🔒/);
    expect(texte).toMatch(/figée/);
  });
});

describe('les passes que le panneau ne montre pas, et le compte', () => {
  it('une passe d’un ticket que le panneau ne montre pas n’a ni ligne ni icône, et reste dans le compte', () => {
    const machine = {
      prises: [tient('autre-5', { projet: 'autre' }), tient('demo-1')],
      attentes: [],
    };
    const l = toutes(
      plateau([T('demo-1', 'Le sujet', ['circuit'])], { circuits: [circuit('demo-1')], machine })
    );
    expect(sousParts(l)).toEqual([]);
    expect(l.some(x => x.texte.startsWith('Parts · 2 passes · 4 sur 28 cœurs'))).toBe(true);
    expect(l.filter(x => /🔒/.test(x.texte))).toHaveLength(1);
  });

  it('le compte des passes se recoupe avec les icônes du déroulé et les lignes sans ticket', () => {
    const machine = {
      prises: [tient('demo-1'), tient('demo-9'), tient(null, { sorte: 'Nuit' }), tient('autre-5')],
      attentes: [],
    };
    const l = toutes(
      plateau([T('demo-1', 'Le sujet', ['circuit']), T('demo-9', 'Un autre', ['direct'])], {
        circuits: [circuit('demo-1')],
        vivants: [vivant('d1', 'demo-9', 'direct')],
        machine,
      })
    );
    const icones = l.filter(x => x.ticket && /^\S+ \S+ +🔒 /.test(x.texte)).length;
    expect(icones).toBe(2);
    expect(sousParts(l)).toHaveLength(1);
    expect(l.some(x => x.texte.startsWith('Parts · 4 passes'))).toBe(true);
  });

  it('la ligne de compte tient dans la largeur du panneau', () => {
    const l = toutes(
      plateau([T('demo-1', 'Le sujet', ['circuit'])], {
        circuits: [circuit('demo-1')],
        machine: { prises: [tient('demo-1')], attentes: [attend('demo-2')] },
      })
    );
    for (const x of l.filter(y => y.texte.startsWith('Parts'))) {
      expect(colonnes(x.texte), x.texte).toBeLessThanOrEqual(LARGEUR);
    }
  });
});

describe('lignesDesParts', () => {
  it('ne rend plus de ligne pour une passe dont le ticket a une ligne au panneau, quand l’appelant le dit', () => {
    const rendues = lignesDesParts({
      budget,
      prises: [tient('demo-1'), tient(null)],
      attentes: [attend('demo-2')],
      masquer: (p: { ticket: string | null }) => p.ticket === 'demo-1' || p.ticket === 'demo-2',
    });
    expect(rendues).toHaveLength(2);
    expect(rendues[0]).toMatch(/^Parts · 2 passes/);
    expect(rendues[1]).toMatch(/^🔒 /);
  });
});
