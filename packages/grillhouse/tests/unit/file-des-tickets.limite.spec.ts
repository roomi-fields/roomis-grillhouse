/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// La limite des circuits d'un projet (`grillhouse.circuits`) que tient la file des tickets : un
// circuit en attente du superviseur, ou repris et en attente de sa place de la machine, garde sa
// place dans la limite ; la question au responsable, le ticket reporté (`bd defer`) et l'attente
// d'un autre projet la rendent. `circuitsDeLaLimite(circuits, tous, { externes })` lit le mémo de
// chaque circuit vivant (`{ ticket, etape, question }`, `question.qui` le destinataire) et rend
// `{ tenant, superviseur }` : les circuits qui tiennent la limite, et parmi eux ceux qui attendent
// le superviseur (le circuit repris n'en est pas : son destinataire n'est plus dans le mémo).
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const FILE = path.resolve(__dirname, '../../scripts/file-des-tickets.mjs');
/* eslint-disable @typescript-eslint/no-explicit-any */
const charger = (): any => createRequire(path.join(__dirname, 'x.cjs'))(FILE);
const circuitsDeLaLimite = (...a: any[]): { tenant: string[]; superviseur: string[] } =>
  charger().circuitsDeLaLimite(...a);
/* eslint-enable @typescript-eslint/no-explicit-any */

const ATTEND_UNE_PLACE = 'attend-une-place';
const T = (id: string, o: object = {}) => ({
  id,
  status: 'in_progress',
  priority: 2,
  labels: ['circuit'],
  ...o,
});
const question = (qui?: string) => ({
  arret: 'question',
  fait: 'f',
  piece: 'p',
  question: 'q ?',
  ...(qui === undefined ? {} : { qui }),
});
const actif = (ticket: string) => ({ ticket, etape: 'testwriter', question: null });
const enQuestion = (ticket: string, qui?: string) => ({
  ticket,
  etape: 'testwriter',
  question: question(qui),
});
const repris = (ticket: string) => ({ ticket, etape: ATTEND_UNE_PLACE, question: null });

describe('la limite des circuits d’un projet', () => {
  it('un circuit arrêté sur une question au superviseur garde sa place', () => {
    const r = circuitsDeLaLimite([enQuestion('d-1', 'superviseur')], [T('d-1')]);
    expect(r.tenant).toEqual(['d-1']);
    expect(r.superviseur).toEqual(['d-1']);
  });

  it('une question sans destinataire est comptée en attente du superviseur', () => {
    const r = circuitsDeLaLimite([enQuestion('d-1')], [T('d-1')]);
    expect(r.tenant).toEqual(['d-1']);
    expect(r.superviseur).toEqual(['d-1']);
  });

  it('une question au responsable rend la place dans la limite', () => {
    const r = circuitsDeLaLimite([enQuestion('d-1', 'responsable')], [T('d-1')]);
    expect(r.tenant).toEqual([]);
    expect(r.superviseur).toEqual([]);
  });

  it('une question dont le destinataire passe de superviseur à responsable rend la place au réveil suivant', () => {
    const tous = [T('d-1')];
    expect(circuitsDeLaLimite([enQuestion('d-1', 'superviseur')], tous).tenant).toEqual(['d-1']);
    expect(circuitsDeLaLimite([enQuestion('d-1', 'responsable')], tous).tenant).toEqual([]);
  });

  it('un circuit repris qui attend sa place de la machine tient la limite, sans être en attente du superviseur', () => {
    const r = circuitsDeLaLimite([repris('d-1')], [T('d-1')]);
    expect(r.tenant).toEqual(['d-1']);
    expect(r.superviseur).toEqual([]);
  });

  it('un circuit qui travaille tient la limite', () => {
    const r = circuitsDeLaLimite([actif('d-1')], [T('d-1')]);
    expect(r.tenant).toEqual(['d-1']);
    expect(r.superviseur).toEqual([]);
  });

  it('une question reportée à une heure (ticket différé) rend la place, même au superviseur', () => {
    const r = circuitsDeLaLimite(
      [enQuestion('d-1', 'superviseur')],
      [T('d-1', { status: 'deferred' })]
    );
    expect(r.tenant).toEqual([]);
    expect(r.superviseur).toEqual([]);
  });

  it('un circuit en attente d’un autre projet rend la place', () => {
    const tous = [
      T('d-1', { dependencies: [{ type: 'blocks', depends_on_id: 'external:autre:X' }] }),
    ];
    const r = circuitsDeLaLimite([enQuestion('d-1', 'superviseur')], tous, { externes: {} });
    expect(r.tenant).toEqual([]);
  });

  it('une capacité d’un autre projet livrée ne rend pas la place', () => {
    const tous = [
      T('d-1', { dependencies: [{ type: 'blocks', depends_on_id: 'external:autre:X' }] }),
    ];
    const externes = { autre: [{ id: 'a-1', status: 'closed', labels: ['provides:X'] }] };
    const r = circuitsDeLaLimite([enQuestion('d-1', 'superviseur')], tous, { externes });
    expect(r.tenant).toEqual(['d-1']);
  });

  it('chaque circuit se juge à lui : le mélange rend les tenants triés et les attentes du superviseur', () => {
    const tous = [T('d-1'), T('d-2'), T('d-3'), T('d-4'), T('d-5')];
    const r = circuitsDeLaLimite(
      [
        enQuestion('d-5', 'superviseur'),
        enQuestion('d-2', 'responsable'),
        repris('d-4'),
        actif('d-1'),
        enQuestion('d-3'),
      ],
      tous
    );
    expect(r.tenant).toEqual(['d-1', 'd-3', 'd-4', 'd-5']);
    expect(r.superviseur).toEqual(['d-3', 'd-5']);
  });
});
