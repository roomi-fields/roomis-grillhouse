// The tone of each state the board shows (scripts/tableau.mjs `TONS`): one table names each state
// and its tone; every line and every alert takes it there, the same on each site that shows the
// state, whatever its duration; red only for what asks for a correction.
import { describe, expect, it } from 'vitest';
import { assembler, lignes, lignesEtats, TONS } from '../../scripts/tableau.mjs';
import { circuitLu } from './tableau-essai.js';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-11T12:00:00Z');

interface Ligne {
  texte: string;
  ton?: string;
  ticket?: string;
  section?: string;
}
interface Alerte {
  etat: string;
  ton: string;
  texte: string;
}

const T = (id: string, o: object = {}) => ({
  id,
  title: `${id.slice(5)} — Le sujet de ${id} — packages/demo`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: '2026-11-11T11:30:00Z',
  labels: ['circuit'],
  ...o,
});
const enQuestion = (ticket: string) =>
  circuitLu(ticket, {
    etape: 'controles',
    code: 14,
    arret: 'controles',
    question: 'Quel paquet lève ce rouge ?',
    qui: 'superviseur',
    numero: 1,
  });
const cle = (ticket: string) => `${ticket}:run-${ticket}:1:controles`;

const plateau = (lu: Record<string, unknown>) =>
  assembler({
    prefix: 'demo',
    registre: [],
    vivants: [],
    maintenant: MAINTENANT,
    jour: MAINTENANT - 12 * 60 * MIN,
    ...lu,
  } as Parameters<typeof assembler>[0]) as { alertes: Alerte[] };
const dessin = (t: { alertes: Alerte[] }) => lignes(t, 'demo') as Ligne[];

describe('the table of the tones', () => {
  it('keeps red for what asks for a correction', () => {
    const rouges = Object.entries(TONS)
      .filter(([, ton]) => ton === 'alerte')
      .map(([etat]) => etat)
      .sort();
    expect(rouges).toEqual(['fige', 'nuitRouge', 'panne', 'plafondRefuse', 'sansAttente']);
  });

  it('gives a wait for the supervisor the tone of attention', () => {
    expect(TONS.attendLeSuperviseur).toBe('attention');
  });
});

describe('a circuit that waits for the supervisor', () => {
  const vu = (attendu: number) => {
    const t = plateau({
      tous: [T('demo-1')],
      circuits: [enQuestion('demo-1')],
      remontees: [{ cle: cle('demo-1'), depuis: MAINTENANT - attendu * MIN }],
    });
    const l = dessin(t);
    return {
      circuit: l.find(x => x.ticket === 'demo-1' && x.section === 'agents'),
      alerte: l.find(x => /attend le superviseur depuis/.test(x.texte)),
    };
  };

  it('has the same tone on its line and in its alert, however long it has waited', () => {
    for (const attendu of [1, 11, 600]) {
      const { circuit, alerte } = vu(attendu);
      expect(circuit?.ton, `${attendu} min`).toBe(TONS.attendLeSuperviseur);
      expect(alerte?.ton, `${attendu} min`).toBe(TONS.attendLeSuperviseur);
    }
  });
});

describe('each alert', () => {
  it('takes the tone of its state, in the board and on its line', () => {
    const t = plateau({
      tous: [
        T('demo-1'),
        T('demo-87', {
          title: '87 — La nuit est rouge depuis la nuit du 2026-11-10 — parent',
          status: 'open',
          issue_type: 'bug',
          labels: ['nuit'],
        }),
      ],
      circuits: [enQuestion('demo-1')],
      remontees: [{ cle: cle('demo-1'), depuis: MAINTENANT - 30 * MIN }],
      attenteVivante: false,
      outil: { version: '0.29.0', raison: 'npm : ENOTFOUND' },
      faute: 'mémo illisible',
    });
    expect(t.alertes.map(a => a.etat).sort()).toEqual([
      'attendLeSuperviseur',
      'nuitRouge',
      'outilNonInstallable',
      'panne',
      'sansAttente',
    ]);
    const l = dessin(t);
    for (const a of t.alertes) {
      expect(a.ton, a.etat).toBe(TONS[a.etat as keyof typeof TONS]);
      const ligne = l.find(x => x.texte.includes(a.texte.slice(0, 20)));
      expect(ligne?.ton, a.etat).toBe(a.ton);
    }
  });
});

describe('a circuit that waits for the disk', () => {
  it('has the tone of that wait on the head of AGENTS and on its line', () => {
    const t = plateau({
      tous: [T('demo-2')],
      circuits: [circuitLu('demo-2', { etape: 'testwriter', vivant: true })],
      places: {
        prises: 1,
        plafond: 3,
        charge: 1,
        coeurs: 12,
        memoireGo: 9,
        attentes: [{ ticket: 'demo-2', depuis: MAINTENANT - MIN, disque: 'copies : 2 Go libres' }],
      },
    });
    const l = dessin(t).filter(x => x.ticket === 'demo-2' && x.section === 'agents');
    expect(l.map(x => x.ton)).toEqual([TONS.attendLeDisque, TONS.attendLeDisque]);
  });
});

describe('the states view', () => {
  it('gives each ticket the tone of its state', () => {
    const ticket = (id: string) => ({ id, numero: id, sujet: 'Un sujet', bloquePar: [] });
    const etats = (
      [
        ['enCours', 'demo-1'],
        ['sansGo', 'demo-2'],
        ['aValider', 'demo-3'],
        ['fermes', 'demo-4'],
      ] as const
    ).map(([cle, id]) => ({ cle, nom: cle, sens: '', tickets: [ticket(id)] }));
    const l = lignesEtats({ etats, parTicket: {} }) as Ligne[];
    for (const [cle, id] of [
      ['enCours', 'demo-1'],
      ['sansGo', 'demo-2'],
      ['aValider', 'demo-3'],
      ['fermes', 'demo-4'],
    ] as const) {
      expect(l.find(x => x.ticket === id)?.ton, cle).toBe(TONS[cle]);
    }
  });
});
