// The board shows the open work: a closed ticket leaves the chantier's tree, mother included, and
// stays counted in the « faits » of the head and of the chantier; the tickets closed today go to
// FAITS AUJOURD'HUI. Each line of the board carries its section (agents, chantier, faits), which
// a reader takes instead of guessing it from the text (grillhouse-3uv.42). A ticket waits in
// AGENTS only once the owner launched it (label `circuit`); one never launched stands in CHANTIER.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assembler, duree, k, lignes as lignesRepliees, LARGEUR } from '../../scripts/tableau.mjs';
// The board's lines with each folded group unfolded in place: the lines the tests of the tree read.
const lignes = (t: unknown, nom: string, largeur?: number) => {
  const groupes: Record<string, { groupe?: string }[]> = {};
  return (lignesRepliees(t, nom, largeur, groupes) as { groupe?: string }[]).flatMap(l =>
    l.groupe ? groupes[l.groupe] : [l]
  );
};

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-sections-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.resolve(__dirname, '../../scripts/tableau.mjs');
const SECTIONS = ['agents', 'chantier', 'faits'];

interface Ligne {
  texte: string;
  ton?: string;
  ticket?: string;
  section?: string;
}
interface Board {
  global: { compteurs: Record<string, number> };
  chantiers: { faits: number; total: number }[];
  faitsDuJour: { id: string }[];
}

// A fixture ticket is in the circuit (label `circuit`): the owner launched it.
const T = (id: string, o: object = {}) => ({
  id,
  title: `${id.slice(5)} — Sujet ${id.slice(5)}`,
  status: 'open',
  priority: 2,
  issue_type: 'task',
  labels: ['circuit'],
  ...o,
});
const MAINTENANT = Date.parse('2026-10-10T12:00:00Z');
const JOUR = Date.parse('2026-10-10T00:00:00Z');
const AUJOURDHUI = '2026-10-10T09:00:00Z';
const AVANT = '2026-10-01T09:00:00Z';
const ferme = (closed_at: string, o: object = {}) => ({ status: 'closed', closed_at, ...o });

// Every case of the domain in one project:
// - e, the epic in progress;
//   - e.1, an open mother in progress, with a ticket in progress (e.1.1), one closed today
//     (e.1.2), one closed before (e.1.3), one an agent block shows (e.1.4), a closed mother
//     (e.1.5) of a closed ticket (e.1.5.1), and one blocked by e.1.1 (e.1.6);
//   - e.2, a closed mother of closed tickets, one closed today (e.2.2), one before (e.2.1);
//   - e.4, a closed mother with an open ticket (e.4.1);
//   - e.5 closed today, e.6 closed before, e.7 awaiting the responsable, under the epic;
//   - e.8, an open mother not in progress, with a closed ticket (e.8.1) and a ready one (e.8.2);
// - z, another epic, its only ticket closed before.
const TOUS = [
  T('demo-e', { issue_type: 'epic', title: 'e — Le chantier' }),
  T('demo-e.1', { parent: 'demo-e' }),
  T('demo-e.1.1', { parent: 'demo-e.1', status: 'in_progress' }),
  T('demo-e.1.2', { parent: 'demo-e.1', ...ferme(AUJOURDHUI) }),
  T('demo-e.1.3', { parent: 'demo-e.1', ...ferme(AVANT) }),
  T('demo-e.1.4', { parent: 'demo-e.1' }),
  T('demo-e.1.5', { parent: 'demo-e.1', ...ferme(AVANT) }),
  T('demo-e.1.5.1', { parent: 'demo-e.1.5', ...ferme(AVANT) }),
  T('demo-e.1.6', {
    parent: 'demo-e.1',
    labels: [],
    dependencies: [{ type: 'blocks', depends_on_id: 'demo-e.1.1' }],
  }),
  T('demo-e.2', { parent: 'demo-e', ...ferme(AUJOURDHUI) }),
  T('demo-e.2.1', { parent: 'demo-e.2', ...ferme(AVANT) }),
  T('demo-e.2.2', { parent: 'demo-e.2', ...ferme(AUJOURDHUI) }),
  T('demo-e.4', { parent: 'demo-e', ...ferme(AVANT) }),
  T('demo-e.4.1', { parent: 'demo-e.4' }),
  T('demo-e.5', { parent: 'demo-e', ...ferme(AUJOURDHUI) }),
  T('demo-e.6', { parent: 'demo-e', ...ferme(AVANT) }),
  T('demo-e.7', { parent: 'demo-e', labels: ['a-valider'] }),
  T('demo-e.8', { parent: 'demo-e' }),
  T('demo-e.8.1', { parent: 'demo-e.8', ...ferme(AVANT) }),
  T('demo-e.8.2', { parent: 'demo-e.8' }),
  T('demo-z', { issue_type: 'epic', title: 'z — Un autre' }),
  T('demo-z.1', { parent: 'demo-z', ...ferme(AVANT) }),
];
const FERMES = TOUS.filter(t => t.status === 'closed').map(t => t.id);
// A tester finished on e.1.4: it waits for the developer, in the agents' blocks.
const REGISTRE = [
  {
    agent: 'r1',
    ticket: 'demo-e.1.4',
    role: 'testeur',
    fin: '2026-10-10T10:00:00Z',
    travail: 60_000,
    jetons: 10,
  },
];
const plateau = (tous: object[] = TOUS) =>
  assembler({
    tous,
    prefix: 'demo',
    registre: REGISTRE,
    vivants: [],
    maintenant: MAINTENANT,
    jour: JOUR,
  }) as Board;
const T0 = plateau();
const L0 = lignes(T0, 'demo') as Ligne[];

// The board's parts, by position: the head down to the AGENTS title, AGENTS down to the first
// CHANTIER line (the blank line before it, or before « CHANTIERS »), CHANTIER down to FAITS
// AUJOURD'HUI.
const indexAgents = (l: Ligne[]) => l.findIndex(x => x.texte.startsWith('AGENTS'));
const indexFaits = (l: Ligne[]) => l.findIndex(x => x.texte.startsWith("FAITS AUJOURD'HUI"));
const finChantier = (l: Ligne[]) => (indexFaits(l) < 0 ? l.length : indexFaits(l) - 1);
const debutChantier = (l: Ligne[]) => {
  const i = l.findIndex(
    (x, j) =>
      j > indexAgents(l) && (x.texte.startsWith('CHANTIER ') || /^CHANTIERS\b/.test(x.texte))
  );
  return i < 0 ? finChantier(l) : i - 1;
};
const lignesChantier = (l: Ligne[]) => l.slice(debutChantier(l), finChantier(l));
const partieChantier = (l: Ligne[]) => lignesChantier(l);
const partieAgents = (l: Ligne[]) => l.slice(indexAgents(l), debutChantier(l));
const partieFaits = (l: Ligne[]) => l.slice(indexFaits(l));

describe('3uv.42 critère 1 : a closed ticket leaves CHANTIER, mother included, and stays counted', () => {
  it('3uv.42 critère 1 : the fixture draws a chantier and an agents title', () => {
    expect(L0.some(x => x.texte.startsWith('CHANTIER e'))).toBe(true);
    expect(indexAgents(L0)).toBeGreaterThan(0);
  });

  it('3uv.42 critère 1 : no line of CHANTIER names a closed ticket', () => {
    const nommes = partieChantier(L0)
      .map(x => x.ticket)
      .filter((id): id is string => Boolean(id));
    expect(nommes.length).toBeGreaterThan(0);
    expect(nommes.filter(id => FERMES.includes(id))).toEqual([]);
  });

  it('3uv.42 critère 1 : a closed mother of closed tickets has no line (2sq, 3uv.8)', () => {
    expect(partieChantier(L0).filter(x => x.ticket === 'demo-e.2')).toEqual([]);
    expect(partieChantier(L0).some(x => /\be\.2 {2}/.test(x.texte))).toBe(false);
  });

  it('3uv.42 critère 1 : a closed mother with an open ticket has no line', () => {
    expect(partieChantier(L0).filter(x => x.ticket === 'demo-e.4')).toEqual([]);
  });

  it('3uv.42 critère 1 : a closed mother under an open mother has no line', () => {
    expect(partieChantier(L0).filter(x => x.ticket === 'demo-e.1.5')).toEqual([]);
  });

  it('3uv.42 critère 1 : a closed mother alone under its epic has no line either', () => {
    const l = lignes(
      plateau([
        T('demo-e', { issue_type: 'epic', title: 'e — Le chantier' }),
        T('demo-e.1', { parent: 'demo-e', status: 'in_progress' }),
        T('demo-e.9', { parent: 'demo-e', ...ferme(AVANT) }),
        T('demo-e.9.1', { parent: 'demo-e.9', ...ferme(AVANT) }),
      ]),
      'demo'
    ) as Ligne[];
    expect(l.some(x => x.texte.startsWith('CHANTIER e'))).toBe(true);
    expect(partieChantier(l).filter(x => x.ticket?.startsWith('demo-e.9'))).toEqual([]);
  });

  it('3uv.42 critère 1 : the closed tickets stay counted in the « faits » of the head', () => {
    // Closed work: e.1.2, e.1.3, e.1.5.1, e.2.1, e.2.2, e.5, e.6, e.8.1, z.1.
    expect(T0.global.compteurs.fermes).toBe(9);
    expect(L0.slice(0, indexAgents(L0)).some(x => /· 9 faits$/.test(x.texte))).toBe(true);
  });

  it('3uv.42 critère 1 : the closed tickets stay counted in the « faits » of the chantier', () => {
    // Work under e: 14 tickets, 8 of them closed.
    expect([T0.chantiers[0].faits, T0.chantiers[0].total]).toEqual([8, 14]);
    expect(L0.some(x => /^ {2}8\/14 faits · /.test(x.texte))).toBe(true);
  });

  it('3uv.42 critère 1 : an open mother counts its closed tickets in its own line', () => {
    const e1 = partieChantier(L0).find(x => x.ticket === 'demo-e.1');
    expect(e1?.texte).toMatch(/ 3\/6\b/);
    const e8 = partieChantier(L0).find(x => x.ticket === 'demo-e.8');
    expect(e8?.texte).toMatch(/ 1\/2\b/);
  });
});

describe("FAITS AUJOURD'HUI carries the day's total on its title", () => {
  it('the title ends with the count of tickets, their working time and their tokens, right-aligned', () => {
    const f = T0.faitsDuJour as { travail: number; jetons: number }[];
    const n = f.length;
    const total = `${n} ticket${n > 1 ? 's' : ''} · ${duree(f.reduce((s, x) => s + x.travail, 0))} · ${k(f.reduce((s, x) => s + x.jetons, 0))}`;
    const titre = L0[indexFaits(L0)]!.texte;
    expect(titre.startsWith("FAITS AUJOURD'HUI")).toBe(true);
    expect(titre.endsWith(total)).toBe(true);
    expect(titre.length).toBe(LARGEUR);
  });
});

describe("3uv.42 critère 2 : a ticket closed today stands in FAITS AUJOURD'HUI", () => {
  it("3uv.42 critère 2 : the work tickets closed today, at any depth, have their line in FAITS AUJOURD'HUI", () => {
    expect(indexFaits(L0)).toBeGreaterThan(debutChantier(L0));
    const ids = partieFaits(L0).map(x => x.ticket);
    for (const id of ['demo-e.1.2', 'demo-e.2.2', 'demo-e.5']) {
      expect(ids, id).toContain(id);
    }
  });

  it("3uv.42 critère 2 : a ticket closed before today, or a mother closed today, is not in FAITS AUJOURD'HUI", () => {
    const ids = partieFaits(L0).map(x => x.ticket);
    for (const id of ['demo-e.1.3', 'demo-e.2.1', 'demo-e.6', 'demo-e.2', 'demo-z.1']) {
      expect(ids, id).not.toContain(id);
    }
    expect(T0.faitsDuJour.map(x => x.id).sort()).toEqual(['demo-e.1.2', 'demo-e.2.2', 'demo-e.5']);
  });

  it("3uv.42 critère 2 : without a ticket closed today, no FAITS AUJOURD'HUI", () => {
    const l = lignes(
      plateau(TOUS.filter(t => !('closed_at' in t) || t.closed_at !== AUJOURDHUI)),
      'demo'
    ) as Ligne[];
    expect(indexFaits(l)).toBe(-1);
  });
});

// The state whose title stands above a ticket's line in CHANTIER: the nearest title line that names
// no ticket, its count left out.
const categorie = (l: Ligne[], id: string) => {
  const i = l.findIndex(x => x.ticket === id);
  const titre = [...l.slice(0, i)].reverse().find(x => x.ton === 'titre' && !x.ticket);
  return i < 0 ? undefined : titre?.texte.trim().replace(/ +\d+$/, '');
};

describe('CHANTIER lists its open tickets under the title of their state', () => {
  it('each state with tickets has its title line, its count at the right, in the order of the states', () => {
    const titres = lignesChantier(L10)
      .filter(x => x.ton === 'titre' && !x.ticket)
      .map(x => x.texte.trim().replace(/ +\d+$/, ''));
    expect(titres).toEqual(['en cours', 'sans go', 'à valider', 'reporté']);
    expect(lignesChantier(L10).find(x => x.texte.trim().startsWith('reporté'))?.texte).toMatch(
      / 3$/
    );
  });

  it('the tickets of a state follow its title, in the order of their numbers', () => {
    const c = lignesChantier(L10);
    const i = c.findIndex(x => x.texte.trim().startsWith('reporté'));
    expect(c.slice(i + 1, i + 4).map(x => x.ticket)).toEqual([
      'demo-e.2.1',
      'demo-e.3',
      'demo-e.7.2.1',
    ]);
  });
});

describe('3uv.42 critère 3 : an open mother keeps its open tickets, its closed ones gone', () => {
  it('3uv.42 critère 3 : its ticket in progress has its line under « en cours »', () => {
    expect(categorie(L0, 'demo-e.1.1')).toBe('en cours');
    expect(partieChantier(L0).find(x => x.ticket === 'demo-e.1.1')?.texte).toMatch(
      /^ {3}e\.1\.1 {2}/
    );
  });

  it('its ticket without the go has its line under « sans go »', () => {
    expect(categorie(L0, 'demo-e.1.6')).toBe('sans go');
  });

  it('3uv.42 critère 3 : its ticket an agent block shows stays in the agents only', () => {
    expect(partieChantier(L0).some(x => x.ticket === 'demo-e.1.4')).toBe(false);
    expect(partieAgents(L0).some(x => x.ticket === 'demo-e.1.4' && x.texte.startsWith('·'))).toBe(
      true
    );
  });

  it('3uv.42 critère 3 : its closed tickets, a closed mother and its tickets included, have no line', () => {
    const ids = partieChantier(L0).map(x => x.ticket);
    for (const id of ['demo-e.1.2', 'demo-e.1.3', 'demo-e.1.5', 'demo-e.1.5.1']) {
      expect(ids, id).not.toContain(id);
    }
  });

  it('3uv.42 critère 3 : an open mother not in progress keeps its line, its closed ticket gone', () => {
    const ids = partieChantier(L0).map(x => x.ticket);
    expect(ids).toContain('demo-e.8');
    expect(ids).not.toContain('demo-e.8.1');
  });
});

describe('3uv.42 critère 4 : each line carries its section', () => {
  const section = (l: Ligne[], f: (x: Ligne) => boolean) => l.find(f)?.section;

  it('3uv.42 critère 4 : every line carries agents, chantier or faits, in that order', () => {
    expect(L0.length).toBeGreaterThan(10);
    for (const x of L0) {
      expect(SECTIONS, JSON.stringify(x)).toContain(x.section);
    }
    const rangs = L0.map(x => SECTIONS.indexOf(x.section ?? ''));
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
  });

  it('3uv.42 critère 4 : the head above AGENTS counts in agents', () => {
    const tete = L0.slice(0, indexAgents(L0));
    expect(tete.length).toBeGreaterThanOrEqual(4);
    expect(tete.some(x => / sans go · \d+ à valider · /.test(x.texte))).toBe(true);
    for (const x of tete) {
      expect(x.section, x.texte).toBe('agents');
    }
  });

  it('3uv.42 critère 4 : the chantier, its tree and the other chantiers are in chantier', () => {
    expect(section(L0, x => x.texte.startsWith('CHANTIER e'))).toBe('chantier');
    expect(section(L0, x => /^ {2}8\/14 faits/.test(x.texte))).toBe('chantier');
    expect(section(L0, x => x.ticket === 'demo-e.1.1')).toBe('chantier');
    expect(section(L0, x => x.ticket === 'demo-e.1.6')).toBe('chantier');
    expect(section(L0, x => x.texte.startsWith('AUTRES CHANTIERS'))).toBe('chantier');
    expect(section(L0, x => x.ticket === 'demo-z')).toBe('chantier');
  });

  it('3uv.42 critère 4 : the agents title, each step and its tickets are in agents', () => {
    expect(section(L0, x => x.texte.startsWith('AGENTS'))).toBe('agents');
    expect(section(L0, x => x.texte === '  2.3 · Code · développeur')).toBe('agents');
    expect(section(L0, x => x.ticket === 'demo-e.1.4')).toBe('agents');
  });

  it("3uv.42 critère 4 : the FAITS AUJOURD'HUI title and its tickets are in faits", () => {
    expect(section(L0, x => x.texte.startsWith("FAITS AUJOURD'HUI"))).toBe('faits');
    for (const id of ['demo-e.1.2', 'demo-e.2.2', 'demo-e.5']) {
      expect(
        section(L0, x => x.ticket === id && x.texte.startsWith('✓')),
        id
      ).toBe('faits');
    }
  });

  it('3uv.42 critère 4 : the waiting lines of the agents and the lines of the faits carry their section', () => {
    const x = (n: number) => ({
      id: `demo-${n}`,
      numero: `${n}`,
      sujet: `S${n}`,
      duree: 0,
      travail: 0,
      jetons: 0,
    });
    const t = {
      global: {
        compteurs: {
          enCours: 0,
          enAttente: 5,
          bloques: 0,
          fermes: 7,
          sansGo: 0,
          aValider: 0,
          reportes: 0,
        },
        jour: { travail: 0, jetons: 0 },
        cumul: { travail: 0, jetons: 0 },
      },
      alertes: [{ niveau: 'rouge', texte: 'La nuit est rouge : 1' }],
      chantiers: [],
      autres: [],
      agents: [
        {
          numero: '2.1',
          titre: 'Tests',
          roles: ['testeur'],
          qui: 'testeur',
          enCours: [],
          attend: [1, 2, 3, 4, 5].map(x),
        },
      ],
      faitsDuJour: [1, 2, 3, 4, 5, 6, 7].map(x),
    };
    const l = lignes(t, 'demo') as Ligne[];
    expect(section(l, y => y.ticket === 'demo-5')).toBe('agents');
    expect(section(l, y => y.ticket === 'demo-7')).toBe('faits');
    expect(section(l, y => y.texte.startsWith('⚠ La nuit'))).toBe('agents');
    for (const y of l) {
      expect(SECTIONS, y.texte).toContain(y.section);
    }
  });

  it('3uv.42 critère 4 : without a chantier in progress, the head is in agents and « CHANTIERS » in chantier', () => {
    const l = lignes(
      plateau([
        T('demo-a', { issue_type: 'epic', title: 'a — Premier' }),
        T('demo-a.1', { parent: 'demo-a' }),
      ]),
      'demo'
    ) as Ligne[];
    expect(l.some(x => x.texte.startsWith('CHANTIER '))).toBe(false);
    expect(section(l, x => x.texte === 'DEMO')).toBe('agents');
    expect(section(l, x => x.texte.startsWith('CHANTIERS'))).toBe('chantier');
    expect(section(l, x => x.ticket === 'demo-a')).toBe('chantier');
    expect(section(l, x => x.texte.startsWith('AGENTS'))).toBe('agents');
  });
});

// A repository whose Beads answers from a file: a fake `bd` on the PATH, an empty register, an
// empty home; the board run as the person runs it.
const depot = (tickets: object[]) => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  const home = mkdtempSync(path.join(ESSAIS, 'home-'));
  writeFileSync(path.join(bin, 'tous.json'), JSON.stringify(tickets));
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\ncase "$1" in\n  config) echo demo ;;\n  list) cat '${bin}/tous.json' ;;\n  *) echo '[]' ;;\nesac\n`,
    { mode: 0o755 }
  );
  const registre = path.join(bin, 'registre.jsonl');
  writeFileSync(registre, '');
  return (...args: string[]) =>
    execFileSync('node', [SCRIPT, ...args], {
      cwd: racine,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HOME: home,
        GRILLHOUSE_REGISTRE: registre,
      },
    });
};

describe('3uv.42 critère 5 : the text output stays readable, without the closed tickets', () => {
  const maintenant = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const avant = iso(maintenant - 10 * 24 * 3_600_000);
  const tickets = [
    T('demo-e', { issue_type: 'epic', title: 'e — Le chantier' }),
    T('demo-e.1', { parent: 'demo-e', title: 'e.1 — Une mère ouverte' }),
    T('demo-e.1.1', { parent: 'demo-e.1', status: 'in_progress', title: 'e.1.1 — En cours' }),
    T('demo-e.1.2', {
      parent: 'demo-e.1',
      ...ferme(iso(maintenant)),
      title: 'e.1.2 — Fait ce jour',
    }),
    T('demo-e.2', { parent: 'demo-e', ...ferme(avant), title: 'e.2 — Mère fermée' }),
    T('demo-e.2.1', { parent: 'demo-e.2', ...ferme(avant), title: 'e.2.1 — Fait avant' }),
  ];
  const lancer = depot(tickets);
  const texte = lancer('--texte');
  const json = JSON.parse(lancer()) as { lignes: Ligne[] };

  it('3uv.42 critère 5 : the text is the texts of the lines, one per line, nothing more', () => {
    expect(json.lignes.length).toBeGreaterThan(5);
    expect(texte).toBe(`${json.lignes.map(x => x.texte).join('\n')}\n`);
  });

  it('3uv.42 critère 5 : the text keeps its head, its chantier, its agents and its faits, no wider than the pane', () => {
    const l = texte.split('\n');
    expect(l[0]).toMatch(/^DEPOT-/);
    expect(l.some(x => /^▶ 1 en cours · \d+ en attente · \d+ bloqués · 2 faits$/.test(x))).toBe(
      true
    );
    expect(l.some(x => x.startsWith('CHANTIER e — Le chantier'))).toBe(true);
    expect(l.some(x => x.startsWith('AGENTS'))).toBe(true);
    expect(l.some(x => /^✓ e\.1\.2 {2}Fait ce jour/.test(x))).toBe(true);
    for (const x of l) {
      expect([...x].length, x).toBeLessThanOrEqual(LARGEUR);
    }
  });

  it('3uv.42 critère 5 : the chantier of the text names no closed ticket', () => {
    const l = texte.split('\n');
    const chantier = l.slice(
      l.findIndex(x => x.startsWith('CHANTIER')),
      l.findIndex(x => x.startsWith("FAITS AUJOURD'HUI"))
    );
    expect(chantier.some(x => /\be\.1 {2}Une mère ouverte/.test(x))).toBe(true);
    expect(chantier.some(x => /\be\.2 {2}Mère fermée/.test(x))).toBe(false);
    expect(chantier.some(x => /\be\.2\.1 {2}/.test(x))).toBe(false);
    expect(chantier.some(x => /\be\.1\.2 {2}/.test(x))).toBe(false);
  });
});

describe('3uv.42 critère 6 : the unused module-level liste is gone', () => {
  it('3uv.42 critère 6 : scripts/tableau.mjs declares no liste at module level', () => {
    const source = readFileSync(SCRIPT, 'utf8');
    expect(source).toMatch(/^export function lignes\(/m);
    expect(source).not.toMatch(/^(const|let|var|function) liste\b/m);
  });
});

// A long board: a tree of 31 tickets in progress, then a line folding by state the open tickets
// no agent block shows (« + 1 sans go » carries its ticket), 6 tickets waiting for the tester,
// 7 tickets closed today, and « + 1 autre chantier ».
const PLIS = [
  T('demo-e', { issue_type: 'epic', title: 'e — Le chantier' }),
  ...Array.from({ length: 31 }, (_, i) =>
    T(`demo-e.${i + 1}`, { parent: 'demo-e', status: 'in_progress' })
  ),
  ...[40, 41, 42, 43, 44].map(n => T(`demo-e.${n}`, { parent: 'demo-e' })),
  T('demo-e.45', {
    parent: 'demo-e',
    labels: [],
    dependencies: [{ type: 'blocks', depends_on_id: 'demo-e.1' }],
  }),
  ...[50, 51, 52, 53, 54, 55, 56].map(n =>
    T(`demo-e.${n}`, { parent: 'demo-e', ...ferme(AUJOURDHUI) })
  ),
  T('demo-z', { issue_type: 'epic', title: 'z — Un autre' }),
  T('demo-z.1', { parent: 'demo-z' }),
];
const LP = lignes(plateau(PLIS), 'demo') as Ligne[];

describe('the other chantiers stand under their title, each on its line', () => {
  it('« AUTRES CHANTIERS » counts them, and each epic has its line, selectable, a chantier', () => {
    const i = LP.findIndex(x => x.texte.startsWith('AUTRES CHANTIERS'));
    expect(LP[i]).toMatchObject({ ton: 'titre', section: 'chantier' });
    expect(LP[i].texte).toMatch(/ 1$/);
    expect(LP[i + 1]).toMatchObject({ ticket: 'demo-z', chantier: true, section: 'chantier' });
  });

  it('every open ticket of the chantier has its line', () => {
    expect(categorie(LP, 'demo-e.45')).toBe('sans go');
  });

  it('« CHANTIERS » titles the epics of a hand-built board with none in progress', () => {
    const t = {
      global: {
        compteurs: {
          enCours: 0,
          enAttente: 5,
          bloques: 0,
          fermes: 7,
          sansGo: 0,
          aValider: 0,
          reportes: 0,
        },
        jour: { travail: 0, jetons: 0 },
        cumul: { travail: 0, jetons: 0 },
      },
      alertes: [],
      chantiers: [],
      autres: [{ id: 'demo-a', numero: 'a', sujet: 'A', faits: 0, total: 1 }],
      agents: [],
      faitsDuJour: [],
    };
    const l = lignes(t, 'demo') as Ligne[];
    const i = l.findIndex(y => y.texte.startsWith('CHANTIERS'));
    expect(l[i + 1]).toMatchObject({ ticket: 'demo-a', chantier: true, section: 'chantier' });
  });
});

describe('the board shows every line of each list, and AGENTS before CHANTIER', () => {
  const x = (n: number) => ({
    id: `demo-${n}`,
    numero: `${n}`,
    sujet: `S${n}`,
    duree: 0,
    travail: 0,
    jetons: 0,
  });
  const MAIN = {
    global: {
      compteurs: {
        enCours: 0,
        enAttente: 40,
        bloques: 0,
        fermes: 40,
        sansGo: 0,
        aValider: 0,
        reportes: 0,
      },
      jour: { travail: 0, jetons: 0 },
      cumul: { travail: 0, jetons: 0 },
    },
    alertes: [],
    chantiers: [],
    autres: [],
    agents: [
      {
        numero: '2.1',
        titre: 'Tests',
        roles: ['testeur'],
        qui: 'testeur',
        enCours: [],
        attend: Array.from({ length: 20 }, (_, i) => x(i + 1)),
      },
    ],
    faitsDuJour: Array.from({ length: 20 }, (_, i) => x(i + 101)),
  };
  const LM = lignes(MAIN, 'demo') as Ligne[];

  it('the tree of a chantier shows its 31 tickets in progress, each on its line, none folded', () => {
    const arbre = lignesChantier(LP);
    for (let i = 1; i <= 31; i++) {
      expect(
        arbre.some(y => y.ticket === `demo-e.${i}`),
        `e.${i}`
      ).toBe(true);
    }
    expect(LP.some(y => /lignes? de plus/.test(y.texte))).toBe(false);
  });

  it('an agent block shows its 20 waiting tickets, each on its line, none folded', () => {
    const attente = LM.filter(y => y.section === 'agents' && y.ticket);
    expect(attente.map(y => y.ticket)).toEqual(MAIN.agents[0].attend.map(y => y.id));
  });

  it("FAITS AUJOURD'HUI shows its 20 tickets, each on its line, none folded", () => {
    const faits = LM.filter(y => y.section === 'faits' && y.ticket);
    expect(faits.map(y => y.ticket)).toEqual(MAIN.faitsDuJour.map(y => y.id));
  });

  it("the head comes first, then AGENTS, then CHANTIER, then FAITS AUJOURD'HUI", () => {
    for (const l of [L0, LP]) {
      const tete = l.findIndex(y => y.texte === 'DEMO');
      const agents = indexAgents(l);
      const chantier = l.findIndex(y => y.texte.startsWith('CHANTIER e'));
      const faits = indexFaits(l);
      expect(tete).toBe(0);
      expect(agents).toBeGreaterThan(tete);
      expect(chantier).toBeGreaterThan(agents);
      expect(faits).toBeGreaterThan(chantier);
    }
  });

  it('the text output lays AGENTS before CHANTIER too', () => {
    const lancer = depot([
      T('demo-e', { issue_type: 'epic', title: 'e — Le chantier' }),
      T('demo-e.1', { parent: 'demo-e', status: 'in_progress' }),
    ]);
    const l = lancer('--texte').split('\n');
    const agents = l.findIndex(y => y.startsWith('AGENTS'));
    expect(agents).toBeGreaterThan(0);
    expect(l.findIndex(y => y.startsWith('CHANTIER e'))).toBeGreaterThan(agents);
  });
});

describe('3uv.42 critère 8 : a blank line before a section title belongs to that section', () => {
  it("3uv.42 critère 8 : the blank line before AGENTS is agents, the one before FAITS AUJOURD'HUI is faits", () => {
    for (const l of [L0, LP]) {
      const a = indexAgents(l);
      const f = indexFaits(l);
      expect(l[a - 1]).toMatchObject({ texte: '', section: 'agents' });
      expect(l[f - 1]).toMatchObject({ texte: '', section: 'faits' });
    }
  });

  it('3uv.42 critère 8 : the blank line before CHANTIER, or before « CHANTIERS », is chantier', () => {
    const c = L0.findIndex(x => x.texte.startsWith('CHANTIER e'));
    expect(L0[c - 1]).toMatchObject({ texte: '', section: 'chantier' });
    const l = lignes(
      plateau([
        T('demo-a', { issue_type: 'epic', title: 'a — Premier' }),
        T('demo-a.1', { parent: 'demo-a' }),
      ]),
      'demo'
    ) as Ligne[];
    const n = l.findIndex(x => x.texte.startsWith('CHANTIERS'));
    expect(l[n - 1]).toMatchObject({ texte: '', section: 'chantier' });
  });

  it('3uv.42 critère 8 : every blank line carries the section of the line after it', () => {
    for (const l of [L0, LP]) {
      const blancs = l.map((x, i) => [x, i] as const).filter(([x]) => x.texte === '');
      expect(blancs.length).toBeGreaterThanOrEqual(3);
      for (const [x, i] of blancs) {
        expect(SECTIONS, `ligne ${i}`).toContain(x.section);
        expect(x.section, `ligne ${i}`).toBe(l[i + 1].section);
      }
    }
  });
});

// Open mothers whose tickets are all closed: e.2 not in progress, e.1.2 under e.1 in progress; and,
// for contrast, a closed mother of closed tickets (e.3).
const L9 = lignes(
  plateau([
    T('demo-e', { issue_type: 'epic', title: 'e — Le chantier' }),
    T('demo-e.1', { parent: 'demo-e' }),
    T('demo-e.1.1', { parent: 'demo-e.1', status: 'in_progress' }),
    T('demo-e.1.2', { parent: 'demo-e.1' }),
    T('demo-e.1.2.1', { parent: 'demo-e.1.2', ...ferme(AVANT) }),
    T('demo-e.1.2.2', { parent: 'demo-e.1.2', ...ferme(AUJOURDHUI) }),
    T('demo-e.2', { parent: 'demo-e' }),
    T('demo-e.2.1', { parent: 'demo-e.2', ...ferme(AVANT) }),
    T('demo-e.3', { parent: 'demo-e', ...ferme(AVANT) }),
    T('demo-e.3.1', { parent: 'demo-e.3', ...ferme(AVANT) }),
  ]),
  'demo'
) as Ligne[];

describe('3uv.42 critère 9 : an open mother whose tickets are all closed stays in CHANTIER, with her own state', () => {
  it('an open mother not in progress, its only ticket closed, keeps her line « 1/1 » under her state', () => {
    const e2 = partieChantier(L9).find(x => x.ticket === 'demo-e.2');
    expect(e2?.texte).toMatch(/^ {3}e\.2 {2}.* 1\/1$/);
    expect(categorie(L9, 'demo-e.2')).toBe('en attente');
  });

  it('an open mother deeper, under a mother in progress, keeps her line « 2/2 » under her state', () => {
    expect(partieChantier(L9).find(x => x.ticket === 'demo-e.1.2')?.texte).toMatch(/ 2\/2$/);
    expect(categorie(L9, 'demo-e.1.2')).toBe('en attente');
  });

  it('3uv.42 critère 9 : its closed tickets have no line, and the closed mother beside it none either', () => {
    const ids = partieChantier(L9).map(x => x.ticket);
    for (const id of ['demo-e.1.2.1', 'demo-e.1.2.2', 'demo-e.2.1', 'demo-e.3', 'demo-e.3.1']) {
      expect(ids, id).not.toContain(id);
    }
  });
});

// The open tickets of closed mothers (the case 3uv.2 / 3uv.2.1):
// - e.2 closed, its e.2.1 deferred and e.2.2 closed; e.3 deferred beside it;
// - e.4 closed, its e.4.1 in progress, between e.1 and e.5 in progress;
// - e.6 closed, its e.6.1 closed, its e.6.1.1 awaiting the responsable;
// - e.7 open in progress, its e.7.1 in progress and e.7.2 closed, whose e.7.2.1 is deferred;
// - e.8 closed, its e.8.1 blocked by e.1.
const T10 = [
  T('demo-e', { issue_type: 'epic', title: 'e — Le chantier' }),
  T('demo-e.1', { parent: 'demo-e', status: 'in_progress' }),
  T('demo-e.2', { parent: 'demo-e', ...ferme(AVANT) }),
  T('demo-e.2.1', { parent: 'demo-e.2', status: 'deferred' }),
  T('demo-e.2.2', { parent: 'demo-e.2', ...ferme(AVANT) }),
  T('demo-e.3', { parent: 'demo-e', status: 'deferred' }),
  T('demo-e.4', { parent: 'demo-e', ...ferme(AVANT) }),
  T('demo-e.4.1', { parent: 'demo-e.4', status: 'in_progress' }),
  T('demo-e.5', { parent: 'demo-e', status: 'in_progress' }),
  T('demo-e.6', { parent: 'demo-e', ...ferme(AVANT) }),
  T('demo-e.6.1', { parent: 'demo-e.6', ...ferme(AVANT) }),
  T('demo-e.6.1.1', { parent: 'demo-e.6.1', labels: ['a-valider'] }),
  T('demo-e.7', { parent: 'demo-e' }),
  T('demo-e.7.1', { parent: 'demo-e.7', status: 'in_progress' }),
  T('demo-e.7.2', { parent: 'demo-e.7', ...ferme(AVANT) }),
  T('demo-e.7.2.1', { parent: 'demo-e.7.2', status: 'deferred' }),
  T('demo-e.8', { parent: 'demo-e', ...ferme(AVANT) }),
  T('demo-e.8.1', {
    parent: 'demo-e.8',
    labels: [],
    dependencies: [{ type: 'blocks', depends_on_id: 'demo-e.1' }],
  }),
];
const B10 = plateau(T10);
const L10 = lignes(B10, 'demo') as Ligne[];
const C10 = lignesChantier(L10);

describe('3uv.42 critère 10 : the open ticket of a closed mother keeps its line, under its state', () => {
  it('3uv.42 critère 10 : a ticket in progress of a closed mother stands under « en cours »', () => {
    expect(categorie(L10, 'demo-e.4.1')).toBe('en cours');
  });

  it('3uv.42 critère 10 : under nested closed mothers, it stands under its state', () => {
    expect(categorie(L10, 'demo-e.6.1.1')).toBe('à valider');
  });

  it('a deferred ticket of a closed mother stands under « reporté » (3uv.2.1)', () => {
    expect(categorie(L10, 'demo-e.2.1')).toBe('reporté');
    expect(categorie(L10, 'demo-e.3')).toBe('reporté');
    expect(categorie(L10, 'demo-e.8.1')).toBe('sans go');
  });

  it('3uv.42 critère 10 : deeper, under an open mother in progress, it stands under its state', () => {
    expect(categorie(L10, 'demo-e.7.2.1')).toBe('reporté');
    expect(categorie(L10, 'demo-e.7.1')).toBe('en cours');
  });

  it('3uv.42 critère 10 : the closed mothers have no line', () => {
    const ids = C10.map(x => x.ticket);
    for (const id of ['demo-e.2', 'demo-e.4', 'demo-e.6', 'demo-e.6.1', 'demo-e.7.2', 'demo-e.8']) {
      expect(ids, id).not.toContain(id);
    }
  });

  it('3uv.42 critère 10 : the risen tickets count by their own state in the head and the chantier', () => {
    expect(B10.global.compteurs).toMatchObject({ enCours: 4, sansGo: 1, reportes: 3, fermes: 1 });
    expect([B10.chantiers[0].faits, B10.chantiers[0].total]).toEqual([1, 10]);
    expect(C10.some(x => /^ {2}1\/10 faits · /.test(x.texte))).toBe(true);
  });
});

describe('a ticket waits in AGENTS only once the owner launched it (label circuit)', () => {
  interface Agents {
    agents: { roles: string[]; enCours: { id: string }[]; attend: { id: string }[] }[];
  }
  // A chantier in progress, its ticket k.1 ready and open, with the labels, passages and running
  // agents given.
  const circuit = (labels: string[], registre: object[] = [], vivants: object[] = []) => {
    const t = assembler({
      tous: [
        T('demo-k', { issue_type: 'epic', status: 'in_progress', title: 'k — Le circuit' }),
        T('demo-k.1', { parent: 'demo-k', labels }),
      ],
      prefix: 'demo',
      registre,
      vivants,
      maintenant: MAINTENANT,
      jour: JOUR,
    }) as Board & Agents;
    return { t, l: lignes(t, 'demo') as Ligne[] };
  };
  const attend = (t: Agents) =>
    t.agents.flatMap(b => b.attend.map(x => `${b.roles.join(' ')} ${x.id}`));
  const passage = {
    agent: 'r1',
    ticket: 'demo-k.1',
    role: 'testeur',
    fin: '2026-10-10T10:00:00Z',
    travail: 60_000,
    jetons: 10,
  };

  it('a ready ticket never launched waits nowhere in AGENTS and stands in CHANTIER', () => {
    const { t, l } = circuit([]);
    expect(attend(t)).toEqual([]);
    expect(partieAgents(l).some(x => x.ticket === 'demo-k.1')).toBe(false);
    expect(partieChantier(l).some(x => x.ticket === 'demo-k.1')).toBe(true);
  });

  // Decided by the owner on 2026-10-17 (grill, Q10): the supervisor launches the circuit, whose
  // first agent is the testeur; a regulator comes only on a stop of the circuit.
  it('the same ticket in the circuit waits for the testeur, the first agent of the circuit', () => {
    const { t, l } = circuit(['circuit']);
    expect(attend(t)).toEqual(['testeur demo-k.1']);
    expect(partieAgents(l).some(x => x.ticket === 'demo-k.1')).toBe(true);
  });

  it('a ticket worked then taken out of the circuit waits nowhere in AGENTS', () => {
    const { t, l } = circuit([], [passage]);
    expect(attend(t)).toEqual([]);
    expect(partieAgents(l).some(x => x.ticket === 'demo-k.1')).toBe(false);
    expect(partieChantier(l).some(x => x.ticket === 'demo-k.1')).toBe(true);
  });

  it('an agent running on a ticket out of the circuit still stands in progress', () => {
    const vivant = {
      agent: 'd1',
      ticket: 'demo-k.1',
      role: 'developpeur',
      ligne: false,
      depuis: MAINTENANT - 30 * 60_000,
      entre: null,
      jetons: 40,
      travail: 20 * 60_000,
      tours: [[MAINTENANT - 20 * 60_000, MAINTENANT]],
    };
    const { t } = circuit([], [passage], [vivant]);
    expect(t.agents.find(b => b.roles.includes('developpeur'))?.enCours.map(x => x.id)).toEqual([
      'demo-k.1',
    ]);
    expect(attend(t)).toEqual([]);
  });
});

describe('the heavy groups fold to their title and count, the pane opens them whole', () => {
  const sansGo = (id: string, o: object = {}) => T(id, { parent: 'demo-r', labels: [], ...o });
  const tous = [
    T('demo-r', { issue_type: 'epic', title: 'r — Le chantier', status: 'in_progress' }),
    T('demo-r.1', { parent: 'demo-r', status: 'in_progress' }),
    sansGo('demo-r.2'),
    sansGo('demo-r.3', { status: 'deferred' }),
    ...Array.from({ length: 11 }, (_, i) => sansGo(`demo-r.${10 + i}`, { labels: ['a-valider'] })),
    T('demo-q', { issue_type: 'epic', title: 'q — Un autre chantier' }),
  ];
  const fold = (l: object[]) => {
    const groupes: Record<string, Ligne[]> = {};
    return {
      l: lignesRepliees(plateau(l), 'demo', LARGEUR, groupes) as (Ligne & { groupe?: string })[],
      groupes,
    };
  };
  it('« sans go », « reporté », « à valider » past 10 and the other chantiers fold, each line naming its group', () => {
    const { l, groupes } = fold(tous);
    const replies = l.filter(x => x.groupe).map(x => [x.texte.split('›')[0].trim(), x.groupe]);
    expect(replies).toEqual([
      ['sans go', 'demo-r/sansGo'],
      ['à valider', 'demo-r/aValider'],
      ['reporté', 'demo-r/reportes'],
      ['AUTRES CHANTIERS', 'autres'],
    ]);
    expect(
      l.some(x => x.ticket === 'demo-r.2' || x.ticket === 'demo-r.10' || x.ticket === 'demo-q')
    ).toBe(false);
    expect(groupes['demo-r/sansGo'].map(x => x.ticket)).toEqual([undefined, 'demo-r.2']);
    expect(groupes['demo-r/aValider']).toHaveLength(12);
    expect(groupes.autres.map(x => x.ticket)).toEqual([undefined, 'demo-q']);
  });
  it('« à valider » with 10 tickets or fewer keeps its lines', () => {
    const { l } = fold(tous.filter(x => x.id !== 'demo-r.20'));
    expect(l.some(x => x.groupe === 'demo-r/aValider')).toBe(false);
    expect(l.some(x => x.ticket === 'demo-r.10')).toBe(true);
  });
});
