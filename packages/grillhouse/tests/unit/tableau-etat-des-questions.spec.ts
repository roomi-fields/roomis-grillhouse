// The line « ⤷ Question · <qui> » of the board carries the state of its question at its right: « envoyée »
// (in the queue of the session, not read, no reminder), « lue il y a N min » (N from its reading),
// « chez lui · N min » (carried to the owner, N from that mark). The state comes from the file of the
// stops gone up (`remontees`); no other line of the board changes. A question carried to the owner
// stands under « ⤷ Question · responsable » and the head's count of questions counts it.
import { describe, expect, it } from 'vitest';
import { assembler, comptesDAgents, lignes } from '../../scripts/tableau.mjs';
import { circuitLu } from './tableau-essai.js';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-10-18T12:00:00Z');

interface Ligne {
  texte: string;
  section?: string;
}
interface Entree {
  cle: string;
  depuis: number;
  presentee: number;
  lue?: number;
  chez?: number;
}

const T = (id: string) => ({
  id,
  title: `${id.slice(5)} — Le sujet de ${id} — packages/demo`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: '2026-10-18T11:30:00Z',
  labels: ['circuit'],
});
const arrete = (ticket: string, qui = 'superviseur') =>
  circuitLu(ticket, {
    etape: 'controles',
    code: 14,
    arret: 'controles',
    question: 'Quel paquet lève ce rouge ?',
    qui,
    numero: 1,
  });
const cle = (ticket: string) => `${ticket}:run-${ticket}:1:controles`;
const entree = (ticket: string, reste: Partial<Entree> = {}): Entree => ({
  cle: cle(ticket),
  depuis: MAINTENANT - 30 * MIN,
  presentee: MAINTENANT - 30 * MIN,
  ...reste,
});

const plateau = (circuits: object[], remontees: Entree[]) =>
  assembler({
    tous: circuits.map(c => T((c as { ticket: string }).ticket)),
    prefix: 'demo',
    registre: [],
    vivants: [],
    circuits,
    remontees,
    maintenant: MAINTENANT,
    jour: MAINTENANT - 24 * 60 * MIN,
  } as Parameters<typeof assembler>[0]);
const agents = (t: unknown) =>
  (lignes(t, 'depot') as Ligne[]).filter(x => x.section === 'agents').map(x => x.texte.trimEnd());
const questions = (t: unknown) => agents(t).filter(l => l.includes('⤷ Question'));

describe('the state of a question at the right of its line', () => {
  it('says « envoyée » for a question in the queue of the session, not read', () => {
    const t = plateau([arrete('demo-1')], [entree('demo-1')]);
    expect(questions(t)).toHaveLength(1);
    expect(questions(t)[0]).toMatch(/^ {2}⤷ Question · superviseur +envoyée$/);
  });

  it('says « lue il y a N min », N counted from its reading, not from its sending', () => {
    const t = plateau([arrete('demo-1')], [entree('demo-1', { lue: MAINTENANT - 4 * MIN })]);
    expect(questions(t)[0]).toMatch(/^ {2}⤷ Question · superviseur +lue il y a 4 min$/);
    const autre = plateau([arrete('demo-1')], [entree('demo-1', { lue: MAINTENANT - 17 * MIN })]);
    expect(questions(autre)[0]).toMatch(/lue il y a 17 min$/);
  });

  it('puts the state at the right edge of the line, the width of the panel kept', () => {
    const t = plateau([arrete('demo-1')], [entree('demo-1', { lue: MAINTENANT - 4 * MIN })]);
    const [ligne] = (lignes(t, 'depot') as Ligne[]).filter(x => x.texte.includes('⤷ Question'));
    expect(ligne!.texte.endsWith('lue il y a 4 min')).toBe(true);
    const sans = plateau([arrete('demo-1')], []);
    const [nue] = (lignes(sans, 'depot') as Ligne[]).filter(x => x.texte.includes('⤷ Question'));
    expect(ligne!.texte.length).toBe(nue!.texte.length);
  });

  it('says « chez lui · N min » for a question carried to the owner, N from that mark, under « ⤷ Question · responsable »', () => {
    const t = plateau(
      [arrete('demo-1')],
      [entree('demo-1', { lue: MAINTENANT - 20 * MIN, chez: MAINTENANT - 12 * MIN })]
    );
    expect(questions(t)).toHaveLength(1);
    expect(questions(t)[0]).toMatch(/^ {2}⤷ Question · responsable +chez lui · 12 min$/);
    expect(agents(t).join('\n')).not.toContain('⤷ Question · superviseur');
  });

  it('draws the circuits the line stands for as before: only the line of the question changes', () => {
    const avec = plateau([arrete('demo-1')], [entree('demo-1', { lue: MAINTENANT - 4 * MIN })]);
    const sans = plateau([arrete('demo-1')], []);
    const autres = (t: unknown) => agents(t).filter(l => !l.includes('⤷ Question'));
    expect(autres(avec)).toEqual(autres(sans));
  });

  it('leaves a line without state for a question the greffon has not sent yet', () => {
    const t = plateau([arrete('demo-1')], []);
    expect(questions(t)).toEqual(['  ⤷ Question · superviseur']);
  });

  it('reads a file of the old format, with no reading field, as « envoyée »', () => {
    const ancien = { cle: cle('demo-1'), depuis: MAINTENANT - 30 * MIN } as unknown as Entree;
    expect(questions(plateau([arrete('demo-1')], [ancien]))[0]).toMatch(/envoyée$/);
  });

  it('writes each question of the owner with its own state', () => {
    const t = plateau(
      [arrete('demo-1', 'responsable')],
      [entree('demo-1', { lue: MAINTENANT - 3 * MIN })]
    );
    expect(questions(t)[0]).toMatch(/^ {2}⤷ Question · responsable +lue il y a 3 min$/);
  });
});

describe('the head counts the question carried to the owner', () => {
  const toi = (t: unknown) =>
    (lignes(t, 'depot') as Ligne[]).find(x => x.texte.startsWith('toi : '))!.texte.trimEnd();

  it('counts it among the questions of « toi », which a question of the supervisor does not feed', () => {
    const attend = plateau([arrete('demo-1')], [entree('demo-1', { lue: MAINTENANT - 2 * MIN })]);
    const chez = plateau(
      [arrete('demo-1')],
      [entree('demo-1', { lue: MAINTENANT - 2 * MIN, chez: MAINTENANT - 1 * MIN })]
    );
    expect(toi(attend)).toMatch(/ 0 question$/);
    expect(toi(chez)).toMatch(/ 1 question$/);
  });

  it('draws it ⛔ in AGENTS', () => {
    const attend = plateau([arrete('demo-1')], [entree('demo-1', { lue: MAINTENANT - 2 * MIN })]);
    const chez = plateau(
      [arrete('demo-1')],
      [entree('demo-1', { lue: MAINTENANT - 2 * MIN, chez: MAINTENANT - 1 * MIN })]
    );
    expect(comptesDAgents(chez).arretes).toBe(comptesDAgents(attend).arretes + 1);
  });
});
