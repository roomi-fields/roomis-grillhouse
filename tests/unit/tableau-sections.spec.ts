// The board shows the open work: a closed ticket leaves the chantier's tree, mother included, and
// stays counted in the « faits » of the head and of the chantier; the tickets closed today go to
// FAITS AUJOURD'HUI. Each line of the board carries its section (agents, chantier, faits), which
// a reader takes instead of guessing it from the text (grillhouse-3uv.42).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assembler, lignes, LARGEUR } from '../../scripts/tableau.mjs';

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
  replie?: Ligne[];
}
interface Board {
  global: { compteurs: Record<string, number> };
  chantiers: { faits: number; total: number }[];
  faitsDuJour: { id: string }[];
}

const T = (id: string, o: object = {}) => ({
  id,
  title: `${id.slice(5)} — Sujet ${id.slice(5)}`,
  status: 'open',
  priority: 2,
  issue_type: 'task',
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

// The lines with the lines they fold, each once.
const toutes = (l: Ligne[]): Ligne[] => l.flatMap(x => [x, ...toutes(x.replie ?? [])]);
// The board's parts, by position: the head down to the AGENTS title, AGENTS down to the first
// CHANTIER line (the blank line before it, or « N chantiers »), CHANTIER down to FAITS AUJOURD'HUI.
const indexAgents = (l: Ligne[]) => l.findIndex(x => x.texte.startsWith('AGENTS'));
const indexFaits = (l: Ligne[]) => l.findIndex(x => x.texte === "FAITS AUJOURD'HUI");
const finChantier = (l: Ligne[]) => (indexFaits(l) < 0 ? l.length : indexFaits(l) - 1);
const debutChantier = (l: Ligne[]) => {
  const i = l.findIndex(
    (x, j) =>
      j > indexAgents(l) &&
      (x.texte.startsWith('CHANTIER ') || /^(\+ )?\d+ (autres? )?chantiers?$/.test(x.texte))
  );
  return i < 0 ? finChantier(l) : i - 1;
};
const lignesChantier = (l: Ligne[]) => l.slice(debutChantier(l), finChantier(l));
const partieChantier = (l: Ligne[]) => toutes(lignesChantier(l));
const partieAgents = (l: Ligne[]) => toutes(l.slice(indexAgents(l), debutChantier(l)));
const partieFaits = (l: Ligne[]) => toutes(l.slice(indexFaits(l)));

describe('3uv.42 critère 1 : a closed ticket leaves CHANTIER, mother included, and stays counted', () => {
  it('3uv.42 critère 1 : the fixture draws a chantier and an agents title', () => {
    expect(L0.some(x => x.texte.startsWith('CHANTIER e'))).toBe(true);
    expect(indexAgents(L0)).toBeGreaterThan(0);
  });

  it('3uv.42 critère 1 : no line of CHANTIER, folded or not, names a closed ticket', () => {
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

describe('3uv.42 critère 3 : an open mother keeps its open tickets in place, its closed ones gone', () => {
  it('3uv.42 critère 3 : its ticket in progress keeps its line, under it', () => {
    const c = partieChantier(L0);
    const i1 = c.findIndex(x => x.ticket === 'demo-e.1');
    const i11 = c.findIndex(x => x.ticket === 'demo-e.1.1');
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i11).toBeGreaterThan(i1);
    expect(c[i11].texte).toMatch(/^ {2}e\.1\.1 {2}/);
  });

  it('3uv.42 critère 3 : its blocked ticket stays counted under it, carried by the counting line', () => {
    const plie = lignesChantier(L0).find(x => x.replie?.some(y => y.ticket === 'demo-e.1.6'));
    expect(plie?.texte).toMatch(/^ {2}\+ 1 bloqués$/);
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
    expect(tete.some(x => x.texte.startsWith('⚠'))).toBe(true);
    for (const x of tete) {
      expect(x.section, x.texte).toBe('agents');
    }
  });

  it('3uv.42 critère 4 : the chantier, its tree, its counting lines and the other chantiers are in chantier', () => {
    expect(section(L0, x => x.texte.startsWith('CHANTIER e'))).toBe('chantier');
    expect(section(L0, x => /^ {2}8\/14 faits/.test(x.texte))).toBe('chantier');
    expect(section(L0, x => x.ticket === 'demo-e.1.1')).toBe('chantier');
    expect(section(L0, x => /^ {2}\+ 1 bloqués$/.test(x.texte))).toBe('chantier');
    expect(section(L0, x => x.texte === '+ 1 autre chantier')).toBe('chantier');
  });

  it('3uv.42 critère 4 : the agents title, each role and its tickets are in agents', () => {
    expect(section(L0, x => x.texte.startsWith('AGENTS'))).toBe('agents');
    expect(section(L0, x => x.texte === '1 explorateur  —')).toBe('agents');
    expect(section(L0, x => x.texte === '4 développeur')).toBe('agents');
    expect(section(L0, x => x.ticket === 'demo-e.1.4')).toBe('agents');
    expect(section(L0, x => x.texte === '6 intégrateur  —')).toBe('agents');
  });

  it("3uv.42 critère 4 : the FAITS AUJOURD'HUI title and its tickets are in faits", () => {
    expect(section(L0, x => x.texte === "FAITS AUJOURD'HUI")).toBe('faits');
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
        compteurs: { enCours: 0, prets: 5, bloques: 0, fermes: 7 },
        jour: { travail: 0, jetons: 0 },
        cumul: { travail: 0, jetons: 0 },
      },
      alertes: [{ niveau: 'rouge', texte: 'La nuit est rouge : 1' }],
      chantiers: [],
      autres: [],
      agents: [
        { numero: 3, role: 'testeur', nom: 'testeur', enCours: [], attend: [1, 2, 3, 4, 5].map(x) },
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

  it('3uv.42 critère 4 : without a chantier in progress, the head is in agents and « N chantiers » in chantier', () => {
    const l = lignes(
      plateau([
        T('demo-a', { issue_type: 'epic', title: 'a — Premier' }),
        T('demo-a.1', { parent: 'demo-a' }),
      ]),
      'demo'
    ) as Ligne[];
    expect(l.some(x => x.texte.startsWith('CHANTIER'))).toBe(false);
    expect(section(l, x => x.texte === 'DEMO')).toBe('agents');
    expect(section(l, x => x.texte === '1 chantier')).toBe('chantier');
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
    expect(l.some(x => /^▶ 1 en cours · \d+ prêts · \d+ bloqués · 2 faits$/.test(x))).toBe(true);
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
// no agent block shows (« + 1 bloqués » carries its ticket), 6 tickets waiting for the tester,
// 7 tickets closed today, and « + 1 autre chantier ».
const PLIS = [
  T('demo-e', { issue_type: 'epic', title: 'e — Le chantier' }),
  ...Array.from({ length: 31 }, (_, i) =>
    T(`demo-e.${i + 1}`, { parent: 'demo-e', status: 'in_progress' })
  ),
  ...[40, 41, 42, 43, 44].map(n => T(`demo-e.${n}`, { parent: 'demo-e' })),
  T('demo-e.45', {
    parent: 'demo-e',
    dependencies: [{ type: 'blocks', depends_on_id: 'demo-e.1' }],
  }),
  ...[50, 51, 52, 53, 54, 55, 56].map(n =>
    T(`demo-e.${n}`, { parent: 'demo-e', ...ferme(AUJOURDHUI) })
  ),
  T('demo-z', { issue_type: 'epic', title: 'z — Un autre' }),
  T('demo-z.1', { parent: 'demo-z' }),
];
const LP = lignes(plateau(PLIS), 'demo') as Ligne[];

describe('3uv.42 critère 7 : a folded line carries the section of the line that folds it', () => {
  // Each folding line with its folded lines, at any depth.
  const plis = (l: Ligne[]): [Ligne, Ligne][] =>
    l.flatMap(x => (x.replie ?? []).flatMap(y => [[x, y] as [Ligne, Ligne], ...plis([y])]));

  it('3uv.42 critère 7 : the fixture folds the tree by state and the other chantiers', () => {
    const p = plis(LP);
    expect(p.some(([x]) => x.texte === '+ 1 autre chantier')).toBe(true);
    expect(p.some(([x]) => x.texte === ' + 1 bloqués')).toBe(true);
  });

  it('3uv.42 critère 7 : every folded line, at any depth, carries the section of its folding line', () => {
    const p = plis(LP);
    expect(p.length).toBe(2);
    for (const [x, y] of p) {
      expect(SECTIONS, x.texte).toContain(x.section);
      expect(y.section, `${y.texte} ⊂ ${x.texte}`).toBe(x.section);
    }
  });

  it('3uv.42 critère 7 : the folds of the chantier are chantier', () => {
    const sous = (f: (x: Ligne) => boolean) => toutes(LP.find(f)?.replie ?? []).map(y => y.section);
    const arbre = sous(x => x.texte === ' + 1 bloqués');
    expect(arbre).toHaveLength(1);
    expect(new Set(arbre)).toEqual(new Set(['chantier']));
    expect(new Set(sous(x => x.texte === '+ 1 autre chantier'))).toEqual(new Set(['chantier']));
  });

  it('3uv.42 critère 7 : « N chantiers » of a hand-built board folds lines of chantier', () => {
    const t = {
      global: {
        compteurs: { enCours: 0, prets: 5, bloques: 0, fermes: 7 },
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
    expect((l.find(y => y.texte === '1 chantier')?.replie ?? []).map(y => y.section)).toEqual([
      'chantier',
    ]);
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
      compteurs: { enCours: 0, prets: 40, bloques: 0, fermes: 40 },
      jour: { travail: 0, jetons: 0 },
      cumul: { travail: 0, jetons: 0 },
    },
    alertes: [],
    chantiers: [],
    autres: [],
    agents: [
      {
        numero: 3,
        role: 'testeur',
        nom: 'testeur',
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
        arbre.some(y => y.ticket === `demo-e.${i}` && !y.replie),
        `e.${i}`
      ).toBe(true);
    }
    expect(LP.some(y => /lignes? de plus/.test(y.texte))).toBe(false);
  });

  it('an agent block shows its 20 waiting tickets, each on its line, none folded', () => {
    const attente = LM.filter(y => y.section === 'agents' && y.ticket);
    expect(attente.map(y => y.ticket)).toEqual(MAIN.agents[0].attend.map(y => y.id));
    expect(LM.some(y => / en attente$/.test(y.texte) && y.replie)).toBe(false);
  });

  it("FAITS AUJOURD'HUI shows its 20 tickets, each on its line, none folded", () => {
    const faits = LM.filter(y => y.section === 'faits' && y.ticket);
    expect(faits.map(y => y.ticket)).toEqual(MAIN.faitsDuJour.map(y => y.id));
    expect(LM.some(y => y.section === 'faits' && y.replie)).toBe(false);
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

  it('3uv.42 critère 8 : the blank line before CHANTIER, or before « N chantiers », is chantier', () => {
    const c = L0.findIndex(x => x.texte.startsWith('CHANTIER e'));
    expect(L0[c - 1]).toMatchObject({ texte: '', section: 'chantier' });
    const l = lignes(
      plateau([
        T('demo-a', { issue_type: 'epic', title: 'a — Premier' }),
        T('demo-a.1', { parent: 'demo-a' }),
      ]),
      'demo'
    ) as Ligne[];
    const n = l.findIndex(x => x.texte === '1 chantier');
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

describe('3uv.42 critère 9 : an open mother whose tickets are all closed stays in CHANTIER, checked', () => {
  it('3uv.42 critère 9 : an open mother not in progress, its only ticket closed, keeps its line « 1/1 ✓ »', () => {
    const e2 = partieChantier(L9).find(x => x.ticket === 'demo-e.2');
    expect(e2?.texte).toMatch(/^ e\.2 {2}.* 1\/1 ✓$/);
  });

  it('3uv.42 critère 9 : an open mother deeper, under a mother in progress, keeps its line « 2/2 ✓ »', () => {
    const c = partieChantier(L9);
    const i1 = c.findIndex(x => x.ticket === 'demo-e.1');
    const i12 = c.findIndex(x => x.ticket === 'demo-e.1.2');
    expect(i12).toBeGreaterThan(i1);
    expect(c[i12].texte).toMatch(/^ {2}e\.1\.2 {2}.* 2\/2 ✓$/);
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
    dependencies: [{ type: 'blocks', depends_on_id: 'demo-e.1' }],
  }),
];
const B10 = plateau(T10);
const L10 = lignes(B10, 'demo') as Ligne[];
const C10 = lignesChantier(L10);

describe('3uv.42 critère 10 : the open ticket of a closed mother rises to its mother’s level, in its place', () => {
  it('3uv.42 critère 10 : a ticket in progress of a closed mother stands at its mother’s level, in her place', () => {
    const ids = C10.map(x => x.ticket).filter(Boolean);
    const i1 = ids.indexOf('demo-e.1');
    const i41 = ids.indexOf('demo-e.4.1');
    const i5 = ids.indexOf('demo-e.5');
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i41).toBeGreaterThan(i1);
    expect(i5).toBeGreaterThan(i41);
    expect(C10.find(x => x.ticket === 'demo-e.4.1')?.texte).toMatch(/^ e\.4\.1 {2}.*▶$/);
  });

  it('3uv.42 critère 10 : under nested closed mothers, it rises to the level of the highest, in her place', () => {
    const ids = C10.map(x => x.ticket).filter(Boolean);
    expect(ids.indexOf('demo-e.6.1.1')).toBeGreaterThan(ids.indexOf('demo-e.5'));
    expect(ids.indexOf('demo-e.7')).toBeGreaterThan(ids.indexOf('demo-e.6.1.1'));
    expect(C10.find(x => x.ticket === 'demo-e.6.1.1')?.texte).toMatch(
      /^ e\.6\.1\.1 {2}.*\? à valider$/
    );
  });

  it('3uv.42 critère 10 : a deferred ticket of a closed mother counts in « reportés » of its level’s folded line (3uv.2.1)', () => {
    const plie = C10.find(x => /^ \+ /.test(x.texte));
    expect(plie?.texte).toBe(' + 1 bloqués · 2 reportés');
    expect(plie?.replie?.map(y => y.ticket)).toEqual(['demo-e.2.1', 'demo-e.3', 'demo-e.8.1']);
    expect(plie?.replie?.find(y => y.ticket === 'demo-e.2.1')?.texte).toMatch(
      /^ e\.2\.1 {2}.*reporté$/
    );
  });

  it('3uv.42 critère 10 : deeper, under an open mother in progress, it rises to the level of its closed mother', () => {
    const plie = C10.find(x => /^ {2}\+ /.test(x.texte));
    expect(plie?.texte).toBe('  + 1 reportés');
    expect(plie?.replie?.map(y => y.ticket)).toEqual(['demo-e.7.2.1']);
    expect(plie?.replie?.[0].texte).toMatch(/^ {2}e\.7\.2\.1 {2}/);
    const ids = C10.map(x => x.ticket).filter(Boolean);
    expect(ids.indexOf('demo-e.7.1')).toBeGreaterThan(ids.indexOf('demo-e.7'));
  });

  it('3uv.42 critère 10 : the closed mothers have no line, folded or not', () => {
    const ids = toutes(C10).map(x => x.ticket);
    for (const id of ['demo-e.2', 'demo-e.4', 'demo-e.6', 'demo-e.6.1', 'demo-e.7.2', 'demo-e.8']) {
      expect(ids, id).not.toContain(id);
    }
  });

  it('3uv.42 critère 10 : the risen tickets count by their own state in the head and the chantier', () => {
    expect(B10.global.compteurs).toMatchObject({ enCours: 4, bloques: 1, reportes: 3, fermes: 1 });
    expect([B10.chantiers[0].faits, B10.chantiers[0].total]).toEqual([1, 10]);
    expect(C10.some(x => /^ {2}1\/10 faits · /.test(x.texte))).toBe(true);
  });
});
