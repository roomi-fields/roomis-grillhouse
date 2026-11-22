// Le panneau montre un direct en cours comme une séance d'agent : un bloc « Direct » en tête de la
// liste des agents, une ligne par ticket mené (son ticket, son rôle, sa durée). Un ticket direct pris
// sans séance d'agent garde sa ligne « en direct » (tableau-en-direct.spec.ts).
import { describe, expect, it } from 'vitest';
import { assembler, duree, lignes } from '../../scripts/tableau.mjs';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-22T12:00:00Z');

interface Ligne {
  texte: string;
  ton?: string;
  ticket?: string;
  section?: string;
}

const T = (id: string, titre: string, labels: string[] = ['direct']) => ({
  id,
  title: `${id.slice(id.indexOf('-') + 1)} — ${titre} — packages/x`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: '2026-11-22T09:00:00Z',
  assignee: 'roomi-fields',
  labels,
});
const vivant = (agent: string, ticket: string, role: string, o: object = {}) => ({
  agent,
  ticket,
  role,
  ligne: false,
  depuis: MAINTENANT - 30 * MIN,
  entre: null,
  jetons: 40,
  travail: 20 * MIN,
  tours: [[MAINTENANT - 20 * MIN, MAINTENANT]],
  ...o,
});
const plateau = (tous: object[], vivants: object[]) =>
  assembler({
    tous,
    prefix: 'demo',
    registre: [],
    vivants,
    circuits: [],
    voies: {},
    muet: false,
    maintenant: MAINTENANT,
    jour: MAINTENANT - 10 * 60 * MIN,
    machine: null,
    places: null,
  } as Parameters<typeof assembler>[0]);
const agents = (p: ReturnType<typeof plateau>) =>
  (lignes(p, 'depot') as Ligne[]).filter(l => l.section === 'agents');

describe('un direct en cours se montre comme une séance d’agent', () => {
  const p = plateau(
    [T('demo-9', 'Le sujet'), T('demo-4', 'Un circuit', ['circuit'])],
    [vivant('d1', 'demo-9', 'direct')]
  );
  const a = agents(p);

  it('un bloc « Direct » ouvre la liste des agents, avant la première étape', () => {
    const titre = a.findIndex(x => /^[▾▸ ]*\s*Direct\b/.test(x.texte));
    const etape = a.findIndex(x => /^\s*[▾▸ ]\s*1 · /.test(x.texte));
    expect(titre).toBeGreaterThan(-1);
    expect(etape).toBeGreaterThan(-1);
    expect(titre).toBeLessThan(etape);
  });

  it('sa ligne dit le ticket, le rôle et la durée de la séance', () => {
    const l = a.find(x => x.ticket === 'demo-9');
    expect(l?.texte).toContain('9');
    expect(l?.texte).toContain('direct');
    expect(l?.texte).toContain(duree(20 * MIN));
  });

  it('le ticket n’a pas, en plus, la seule ligne « en direct »', () => {
    expect(a.filter(x => x.ticket === 'demo-9')).toHaveLength(1);
    expect(a.some(x => x.ticket === 'demo-9' && / · en direct$/.test(x.texte))).toBe(false);
  });

  it('la ligne du direct vient sous le bloc « Direct », avant les étapes', () => {
    const i = a.findIndex(x => x.ticket === 'demo-9');
    const titre = a.findIndex(x => /^[▾▸ ]*\s*Direct\b/.test(x.texte));
    const etape = a.findIndex(x => /^\s*[▾▸ ]\s*1 · /.test(x.texte));
    expect(titre).toBeGreaterThan(-1);
    expect(i).toBeGreaterThan(titre);
    expect(i).toBeLessThan(etape);
  });
});

describe('sans séance de direct, aucun bloc « Direct »', () => {
  it('un ticket direct pris sans agent garde sa ligne « en direct », sans bloc', () => {
    const a = agents(plateau([T('demo-9', 'Le sujet')], []));
    expect(a.some(x => /^[▾▸ ]*\s*Direct\b/.test(x.texte))).toBe(false);
    expect(a.find(x => x.ticket === 'demo-9')?.texte).toBe('▶ 9  Le sujet · en direct');
  });

  it('un rôle du circuit n’ouvre pas le bloc « Direct »', () => {
    const a = agents(
      plateau([T('demo-4', 'Un circuit', ['circuit'])], [vivant('c1', 'demo-4', 'questionneur')])
    );
    expect(a.some(x => /^[▾▸ ]*\s*Direct\b/.test(x.texte))).toBe(false);
  });
});

describe('plusieurs directs en cours', () => {
  it('chaque ticket mené a sa ligne sous le même bloc', () => {
    const a = agents(
      plateau(
        [T('demo-9', 'Le sujet'), T('demo-8', 'Un autre')],
        [vivant('d1', 'demo-9', 'direct'), vivant('d2', 'demo-8', 'direct')]
      )
    );
    expect(a.filter(x => /^[▾▸ ]*\s*Direct\b/.test(x.texte))).toHaveLength(1);
    expect(a.filter(x => x.ticket === 'demo-9')).toHaveLength(1);
    expect(a.filter(x => x.ticket === 'demo-8')).toHaveLength(1);
  });
});
