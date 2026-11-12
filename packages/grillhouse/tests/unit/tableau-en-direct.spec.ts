// Un ticket hors circuit sur le panneau (scripts/tableau.mjs) : un ticket pris (`in_progress`) sans
// circuit sur le serveur Temporal se travaille en direct ; il a une ligne d'AGENTS, une seule,
// hors des étapes, « ✎ <numéro>  <sujet> · en direct · <assignee> », de sa prise à sa fermeture.
// Un ticket qui a un circuit, vivant ou arrêté, garde sa ligne de circuit à son étape.
import { describe, expect, it } from 'vitest';
import { assembler, LARGEUR, lignes, TONS } from '../../scripts/tableau.mjs';
import { circuitLu } from './tableau-essai.js';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-12T10:00:00Z');

interface Ligne {
  texte: string;
  ton?: string;
  ticket?: string;
  section?: string;
}
const colonnes = (s: string) => [...s].length + (s.match(/[🔒⏳💤🌙]/gu)?.length ?? 0);

const T = (id: string, titre: string, o: object = {}) => ({
  id,
  title: `${id.slice(id.indexOf('-') + 1)} — ${titre} — packages/x`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: '2026-11-12T09:00:00Z',
  assignee: 'roomi-fields',
  labels: ['circuit'],
  ...o,
});
// A circuit stopped on a question to the supervisor.
const SUR_UNE_QUESTION = {
  etape: 'controles',
  code: 14,
  arret: 'controles',
  question: 'Quel paquet lève ce rouge ?',
  qui: 'superviseur',
  numero: 1,
};
const plateau = (tous: object[], o: { circuits?: object[]; muet?: boolean } = {}) =>
  assembler({
    tous,
    prefix: 'demo',
    registre: [],
    vivants: [],
    circuits: o.circuits ?? [],
    muet: o.muet ?? false,
    maintenant: MAINTENANT,
    jour: MAINTENANT - 10 * 60 * MIN,
    machine: null,
    places: null,
  } as Parameters<typeof assembler>[0]);
const dessin = (p: ReturnType<typeof plateau>) => lignes(p, 'depot') as Ligne[];
const agents = (p: ReturnType<typeof plateau>) => dessin(p).filter(l => l.section === 'agents');
const duTicket = (l: Ligne[], id: string) => l.filter(x => x.ticket === id);

describe('un ticket pris sans circuit sur le serveur', () => {
  it('a une ligne d’AGENTS « ✎ <numéro>  <sujet> · en direct · <assignee> »', () => {
    const p = plateau([T('demo-9', 'La nuit')]);
    const [l] = duTicket(agents(p), 'demo-9');
    expect(l.texte).toBe('✎ 9  La nuit · en direct · roomi-fields');
    expect(l.ton).toBe(TONS.enDirect);
    expect(TONS.enDirect).toBe('actif');
  });

  it('se montre une seule fois sur tout le panneau, hors des étapes', () => {
    const p = plateau([
      T('demo-1', 'La mère', { issue_type: 'epic', status: 'open' }),
      T('demo-9', 'Le sujet', { parent: 'demo-1' }),
    ]);
    const l = dessin(p);
    expect(duTicket(l, 'demo-9')).toHaveLength(1);
    const a = agents(p);
    const i = a.findIndex(x => x.ticket === 'demo-9');
    const premiereEtape = a.findIndex(x => /^\s*[▾▸ ]\s*1 · /.test(x.texte));
    expect(premiereEtape).toBeGreaterThan(-1);
    expect(i).toBeLessThan(premiereEtape);
  });

  it('ne se dit jamais « attend une place » ni à une étape', () => {
    const l = duTicket(agents(plateau([T('demo-9', 'Le sujet')])), 'demo-9');
    expect(l[0].texte).not.toMatch(/attend une place/);
    expect(l[0].texte).toMatch(/^✎ /);
  });

  it('sans assignee, la ligne s’arrête à « en direct »', () => {
    const p = plateau([T('demo-9', 'Le sujet', { assignee: undefined })]);
    expect(duTicket(agents(p), 'demo-9')[0].texte).toBe('✎ 9  Le sujet · en direct');
  });

  it('un sujet long se coupe, « en direct » et l’assignee restent', () => {
    const p = plateau([T('demo-9', 'Un sujet très long '.repeat(6))]);
    const [l] = duTicket(agents(p), 'demo-9');
    expect(colonnes(l.texte)).toBeLessThanOrEqual(LARGEUR);
    expect(l.texte).toMatch(/… · en direct · roomi-fields$/);
  });

  it('un ticket fermé n’a plus de ligne en direct', () => {
    const p = plateau([T('demo-9', 'Le sujet', { status: 'closed' })]);
    expect(agents(p).some(x => x.texte.startsWith('✎ '))).toBe(false);
  });

  it('un ticket ouvert, non pris, n’a pas de ligne en direct', () => {
    const p = plateau([T('demo-9', 'Le sujet', { status: 'open' })]);
    expect(agents(p).some(x => x.texte.startsWith('✎ '))).toBe(false);
  });
});

describe('un ticket qui a un circuit garde sa ligne de circuit', () => {
  it('un circuit vivant reste à son étape, sans ligne en direct', () => {
    const p = plateau([T('demo-9', 'Le sujet')], {
      circuits: [circuitLu('demo-9', { vivant: true })],
    });
    const l = duTicket(agents(p), 'demo-9');
    expect(l).toHaveLength(1);
    expect(l[0].texte).not.toMatch(/en direct/);
  });

  it('un circuit arrêté sur une question reste une ligne de circuit', () => {
    const p = plateau([T('demo-9', 'Le sujet')], {
      circuits: [circuitLu('demo-9', SUR_UNE_QUESTION)],
    });
    const l = duTicket(agents(p), 'demo-9');
    expect(l).toHaveLength(1);
    expect(l[0].texte).not.toMatch(/en direct/);
  });

  it('un circuit que le superviseur a arrêté ne tient plus le ticket pris : il est en direct, sans ligne de circuit', () => {
    const p = plateau([T('demo-9', 'Le sujet')], {
      circuits: [circuitLu('demo-9', { etape: 'plan', arret: 'arrete' })],
    });
    const l = duTicket(agents(p), 'demo-9');
    expect(l).toHaveLength(1);
    expect(l[0].texte).toBe('✎ 9  Le sujet · en direct · roomi-fields');
  });

  it('le circuit court du geste mécanique (1.1) reste une ligne de circuit', () => {
    const p = plateau([T('demo-9', 'Le sujet')], {
      circuits: [circuitLu('demo-9', { etape: 'geste', vivant: true })],
    });
    const l = duTicket(agents(p), 'demo-9');
    expect(l).toHaveLength(1);
    expect(l[0].texte).not.toMatch(/en direct/);
  });

  it('un ticket sous la mère d’un circuit, ou la mère d’un ticket en circuit, est de ce circuit', () => {
    const p = plateau(
      [
        T('demo-1', 'La mère'),
        T('demo-1.1', 'L’enfant', { parent: 'demo-1' }),
        T('demo-2', 'Une autre mère'),
        T('demo-2.1', 'Son enfant', { parent: 'demo-2' }),
      ],
      {
        circuits: [circuitLu('demo-1', { vivant: true }), circuitLu('demo-2.1', SUR_UNE_QUESTION)],
      }
    );
    expect(agents(p).some(x => x.texte.startsWith('✎ '))).toBe(false);
  });

  it('un serveur muet ne fait passer aucun ticket pris pour un ticket en direct', () => {
    const p = plateau([T('demo-9', 'Le sujet')], { muet: true });
    expect(agents(p).some(x => x.texte.startsWith('✎ '))).toBe(false);
  });
});

describe('un ticket étiqueté `direct`', () => {
  it('ouvert, il a sa ligne en direct, même étiqueté `circuit`', () => {
    const p = plateau([T('demo-9', 'Le sujet', { status: 'open', labels: ['circuit', 'direct'] })]);
    const l = duTicket(agents(p), 'demo-9');
    expect(l).toHaveLength(1);
    expect(l[0].texte).toBe('✎ 9  Le sujet · en direct · roomi-fields');
  });

  it('en cours, il a sa ligne en direct, une seule', () => {
    const p = plateau([T('demo-9', 'Le sujet', { labels: ['direct'] })]);
    expect(duTicket(dessin(p), 'demo-9')).toHaveLength(1);
    expect(duTicket(agents(p), 'demo-9')[0].texte).toMatch(/^✎ 9 .* · en direct/);
  });

  it('fermé, il n’a plus de ligne en direct', () => {
    const p = plateau([T('demo-9', 'Le sujet', { status: 'closed', labels: ['direct'] })]);
    expect(agents(p).some(x => x.texte.startsWith('✎ '))).toBe(false);
  });
});
