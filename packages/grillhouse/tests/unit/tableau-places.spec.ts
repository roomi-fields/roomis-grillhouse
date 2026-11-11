// grillhouse-9kq critères 4 et 18 — les places de la machine sur le panneau (scripts/tableau.mjs) :
// une ligne en tête d'AGENTS, « Places 3/3 · charge 11,2/12 · mémoire 9 Go » ; un ticket qui
// attend une place porte ⏳ et « attend une place » ; un ticket qui attend une dépendance garde
// « attend <ticket> ». Le panneau reçoit les places lues (`lirePlaces` de
// scripts/places-de-la-machine.mjs, la charge et la mémoire de la machine) dans `places`.
import { describe, expect, it } from 'vitest';
import { assembler, LARGEUR, lignes } from '../../scripts/tableau.mjs';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-02T17:25:00Z');

interface Ligne {
  texte: string;
  ton?: string;
  ticket?: string;
  section?: string;
}
const colonnes = (s: string) => [...s].length + (s.match(/[🔒⏳💤🌙]/gu)?.length ?? 0);

const T = (id: string, titre: string, o: object = {}) => ({
  id,
  title: `${id.slice(id.lastIndexOf('-') + 1)} — ${titre} — packages/x`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: '2026-11-02T17:00:00Z',
  labels: ['circuit'],
  ...o,
});
const circuit = (ticket: string, o: object = {}) => ({
  ticket,
  etape: 'testwriter',
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
  ...o,
});
type Places = {
  prises: number;
  plafond: number;
  faute?: string | null;
  charge: number;
  coeurs: number;
  memoireGo: number;
  attentes: Array<{ ticket: string; depuis: number; disque?: string | null }>;
};
const PLACES: Places = {
  prises: 3,
  plafond: 3,
  charge: 11.2,
  coeurs: 12,
  memoireGo: 9,
  attentes: [],
};
const plateau = (tous: object[], o: { circuits?: object[]; places?: Places | null } = {}) =>
  assembler({
    tous,
    prefix: 'demo',
    registre: [],
    vivants: [],
    circuits: o.circuits ?? [],
    maintenant: MAINTENANT,
    jour: MAINTENANT - 12 * 60 * MIN,
    machine: null,
    places: o.places === undefined ? PLACES : o.places,
  } as Parameters<typeof assembler>[0]);
const agents = (p: ReturnType<typeof plateau>) =>
  (lignes(p, 'depot') as Ligne[]).filter(l => l.section === 'agents');
const tete = (a: Ligne[]) => a.slice(a.findIndex(x => x.texte.startsWith('AGENTS')) + 1);

describe('grillhouse-9kq critères 4 et 18 — la ligne des places en tête d’AGENTS', () => {
  it('« Places n/N · charge x/c · mémoire m Go », la virgule décimale, juste sous le titre', () => {
    const [l] = tete(agents(plateau([])));
    expect(l.texte).toBe('Places 3/3 · charge 11,2/12 · mémoire 9 Go');
  });

  it('les chiffres suivent la machine : 1 place sur 2, charge entière, mémoire de 14 Go', () => {
    const places = { ...PLACES, prises: 1, plafond: 2, charge: 4, coeurs: 8, memoireGo: 14 };
    expect(tete(agents(plateau([], { places })))[0].texte).toBe(
      'Places 1/2 · charge 4/8 · mémoire 14 Go'
    );
  });

  it('un plafond refusé se dit par son nom, à la place de la charge', () => {
    const places = { ...PLACES, faute: 'GRILLHOUSE_PLACES vaut « x » dans machine.env' };
    const [l] = tete(agents(plateau([], { places })));
    expect(l.texte).toMatch(/^Places 3\/3 · plafond refusé : GRILLHOUSE_PLACES/);
    expect(l.ton).toBe('attention');
  });

  it('la ligne précède la mesure lourde et les étapes', () => {
    const a = tete(agents(plateau([T('demo-1', 'Un sujet')], { circuits: [circuit('demo-1')] })));
    expect(a[0].texte).toMatch(/^Places /);
  });

  it('sans lecture des places, aucune ligne', () => {
    expect(agents(plateau([], { places: null })).some(l => l.texte.startsWith('Places '))).toBe(
      false
    );
  });

  it('la ligne tient dans la largeur du panneau', () => {
    for (const l of agents(plateau([]))) {
      expect(colonnes(l.texte), l.texte).toBeLessThanOrEqual(LARGEUR);
    }
  });
});

describe('grillhouse-9kq critères 4 et 18 — ⏳ « attend une place »', () => {
  const tous = [T('demo-1', 'Le premier sujet'), T('demo-2', 'Le second sujet')];
  const circuits = [circuit('demo-1'), circuit('demo-2')];
  const places: Places = {
    ...PLACES,
    attentes: [{ ticket: 'demo-2', depuis: MAINTENANT - 3 * MIN }],
  };

  it('un ticket qui attend une place porte ⏳ et « attend une place » sur sa ligne', () => {
    const l = agents(plateau(tous, { circuits, places })).find(x => x.ticket === 'demo-2');
    expect(l?.texte).toMatch(/⏳/);
    expect(l?.texte).toMatch(/attend une place/);
  });

  it('le ticket qui n’attend pas de place ne le porte pas', () => {
    const l = agents(plateau(tous, { circuits, places })).find(x => x.ticket === 'demo-1');
    expect(l?.texte).not.toMatch(/attend une place/);
  });

  it('la ligne du ticket qui attend tient dans la largeur', () => {
    for (const l of agents(plateau(tous, { circuits, places }))) {
      expect(colonnes(l.texte), l.texte).toBeLessThanOrEqual(LARGEUR);
    }
  });
});

describe('un ticket en file, non démarré, qui attend une place de la machine', () => {
  it('sa ligne de chantier dit « attend une place », aucune ligne d’AGENTS', () => {
    const tous = [
      T('demo-e', 'e — Le chantier', { issue_type: 'epic' }),
      T('demo-e.1', 'Le sujet en file', { status: 'open', parent: 'demo-e' }),
    ];
    const places: Places = { ...PLACES, attentes: [{ ticket: 'demo-e.1', depuis: MAINTENANT }] };
    const p = plateau(tous, { places });
    const siennes = (lignes(p, 'depot') as Ligne[]).filter(x => x.ticket === 'demo-e.1');
    expect(siennes.length).toBeGreaterThan(0);
    expect(siennes.some(x => x.section === 'agents')).toBe(false);
    expect(siennes.map(x => x.texte).join(' ')).toMatch(/attend une place/);
  });
});

describe('un ticket en file qui attend le disque de ses copies', () => {
  it('sa ligne de chantier dit « attend le disque », une ligne d’AGENTS dit ce qui l’occupe', () => {
    const tous = [
      T('demo-e', 'e — Le chantier', { issue_type: 'epic' }),
      T('demo-e.1', 'Le sujet en file', { status: 'open', parent: 'demo-e' }),
    ];
    const raison = 'disque : 2,0 Go libres ; copies en pause : demo-e.9 7,0 Go';
    const places: Places = {
      ...PLACES,
      attentes: [{ ticket: 'demo-e.1', depuis: MAINTENANT, disque: raison }],
    };
    const l = (lignes(plateau(tous, { places }), 'depot') as Ligne[]).filter(
      x => x.ticket === 'demo-e.1'
    );
    expect(l.some(x => x.section === 'agents' && x.texte.startsWith('⏳ e.1 · disque'))).toBe(true);
    expect(l.some(x => x.section !== 'agents' && /attend le disque/.test(x.texte))).toBe(true);
  });
});

describe('grillhouse-9kq critère 18 — « attend <ticket> » pour une dépendance ouverte', () => {
  it('un ticket validé dont une dépendance est ouverte garde « attend <ticket> »', () => {
    // Under a chantier in progress, the blocked ticket stands in CHANTIER, under « bloqué ».
    const tous = [
      T('demo-e', 'Le chantier', { issue_type: 'epic' }),
      T('demo-1', 'Le fournisseur', { parent: 'demo-e' }),
      T('demo-2', 'Le consommateur', {
        parent: 'demo-e',
        status: 'open',
        dependencies: [{ type: 'blocks', depends_on_id: 'demo-1' }],
      }),
    ];
    const texte = (lignes(plateau(tous, { circuits: [circuit('demo-1')] }), 'depot') as Ligne[])
      .map(l => l.texte)
      .join('\n');
    expect(texte).toMatch(/attend .*demo-1|attend 1\b/);
  });
});
