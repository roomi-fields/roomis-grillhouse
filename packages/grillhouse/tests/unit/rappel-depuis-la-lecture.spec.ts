// The reminder of a question counts from its reading, not from its sending (the model of a queue with
// acknowledgement: a message's visibility delay runs from its reception). A question has three
// states the greffon keeps in the file of the stops gone up: sent (put in the message of the
// session), read (a turn of the session started with that message, or the session opened and listed
// it), answered (it leaves the file). A read question comes back once its reminder delay has passed
// since its reading; a question still in the queue is never sent again; a question the supervisor
// carried to the owner (`--chez-le-responsable`) is silent until its answer. Every time is measured
// on an injected clock; the reading of a turn is `marquerLues`, the command `superviseur --lue`.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as superviseur from '../../scripts/superviseur.mjs';
import { lesReponses } from '../../scripts/reponses-du-circuit.mjs';
import { lireLAppel, Usage } from '../../src/temporal/circuit/appel.js';
import { circuitLu } from './tableau-essai.js';

const { circuitsALOuverture, texteDesQuestions } = superviseur;

interface Donnee {
  ticket: string;
  cle: string;
  representee?: boolean;
  integre?: boolean;
}
type Circuit = ReturnType<typeof circuitLu>;
interface Entree {
  cle: string;
  depuis: number;
  presentee: number;
  lue?: number;
  chez?: number;
}
const api = superviseur as unknown as {
  relever: (
    racine: string,
    circuits: Circuit[],
    o: {
      fermes: () => Set<string>;
      maintenant: number;
      rappelMs: number;
      toutes?: boolean;
      ciDeMain?: { cle: string; texte: string } | null;
    }
  ) => Donnee[];
  marquerLues: (racine: string, o: { lueA: number; envoyeesAvant: number }) => void;
  marquerChezLeResponsable: (racine: string, o: { cle: string; depuisA: number }) => void;
};

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'rappel-depuis-la-lecture-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MIN = 60_000;
const T0 = 10_000_000;
const aucun = () => new Set<string>();
const depot = () => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
  return racine;
};
const fichier = (racine: string) =>
  path.join(racine, '.claude', 'worktrees', 'questions-remontees.json');
const entrees = (racine: string) =>
  (JSON.parse(readFileSync(fichier(racine), 'utf8')) as { remontees: Entree[] }).remontees;
const ecrire = (racine: string, remontees: object[]) =>
  writeFileSync(fichier(racine), `${JSON.stringify({ remontees })}\n`);
const arrete = (ticket: string, numero = 1) =>
  circuitLu(ticket, {
    etape: 'controles',
    code: 14,
    arret: 'controles',
    question: 'Q ?',
    qui: 'superviseur',
    run: `run-${ticket}`,
    numero,
  });
const tourne = (ticket: string) => circuitLu(ticket, { etape: 'controles', vivant: true });
const cle = (ticket: string, numero = 1) => `${ticket}:run-${ticket}:${numero}:controles`;
const tickets = (lot: Donnee[]) => lot.map(q => q.ticket);

// A reading of <circuits> at <minutes> after T0, the reminder at <rappel> minutes (10 by default).
const lire = (racine: string, circuits: Circuit[], minutes: number, rappel = 10, extra = {}) =>
  api.relever(racine, circuits, {
    fermes: aucun,
    maintenant: T0 + minutes * MIN,
    rappelMs: rappel * MIN,
    ...extra,
  });
// The turn of the session that read, at <minutes>, the messages sent up to <jusqua> minutes.
const lue = (racine: string, minutes: number, jusqua = minutes) =>
  api.marquerLues(racine, { lueA: T0 + minutes * MIN, envoyeesAvant: T0 + jusqua * MIN });

describe('a question is sent, then read, then answered', () => {
  it('is written sent, with no reading, at the moment the reading puts it in the message', () => {
    const racine = depot();
    expect(tickets(lire(racine, [arrete('demo-1')], 2))).toEqual(['demo-1']);
    expect(entrees(racine)).toEqual([
      { cle: cle('demo-1'), depuis: T0 + 2 * MIN, presentee: T0 + 2 * MIN },
    ]);
  });

  it('is read at the time of the turn that took its message, by the question sent before the message was submitted', () => {
    const racine = depot();
    lire(racine, [arrete('demo-1')], 2);
    lue(racine, 9, 2);
    expect(entrees(racine)).toEqual([
      { cle: cle('demo-1'), depuis: T0 + 2 * MIN, presentee: T0 + 2 * MIN, lue: T0 + 9 * MIN },
    ]);
  });

  it('is left sent when it was sent after the message the turn took', () => {
    const racine = depot();
    lire(racine, [arrete('demo-1')], 2);
    lire(racine, [arrete('demo-1'), arrete('demo-2')], 4);
    lue(racine, 5, 3);
    const lues = Object.fromEntries(entrees(racine).map(e => [e.cle, e.lue]));
    expect(lues[cle('demo-1')]).toBe(T0 + 5 * MIN);
    expect(lues[cle('demo-2')]).toBeUndefined();
  });

  it('keeps the time of its first reading when a later turn reads again', () => {
    const racine = depot();
    lire(racine, [arrete('demo-1')], 0);
    lue(racine, 1);
    lue(racine, 6);
    expect(entrees(racine)[0]!.lue).toBe(T0 + 1 * MIN);
  });

  it('leaves the file once answered, and the next question of its circuit is a new one, sent', () => {
    const racine = depot();
    lire(racine, [arrete('demo-1')], 0);
    lue(racine, 1);
    expect(lire(racine, [tourne('demo-1')], 2)).toEqual([]);
    expect(JSON.stringify(entrees(racine))).not.toContain('demo-1');
    const suivante = lire(racine, [arrete('demo-1', 2)], 3);
    expect(suivante[0]).not.toHaveProperty('representee', true);
    expect(entrees(racine)).toEqual([
      { cle: cle('demo-1', 2), depuis: T0 + 3 * MIN, presentee: T0 + 3 * MIN },
    ]);
  });

  it('marks nothing when no question is in the file', () => {
    const racine = depot();
    lue(racine, 1);
    expect(() => readFileSync(fichier(racine), 'utf8')).toThrow();
  });
});

describe('the reminder runs from the reading, never from the sending', () => {
  it('never sends again a question still in the queue, whatever the time since its sending', () => {
    const racine = depot();
    const attend = [arrete('demo-1')];
    expect(lire(racine, attend, 0)).toHaveLength(1);
    for (const m of [1, 10, 11, 60, 1000]) {
      expect(lire(racine, attend, m), `à ${m} min`).toEqual([]);
    }
  });

  it('sends again a read question at the delay after its reading, not before', () => {
    const racine = depot();
    const attend = [arrete('demo-1')];
    lire(racine, attend, 0);
    lue(racine, 30);
    expect(lire(racine, attend, 39.9)).toEqual([]);
    const encore = lire(racine, attend, 40);
    expect(tickets(encore)).toEqual(['demo-1']);
    expect(encore[0]!.representee).toBe(true);
  });

  it('counts the delay from the reading at the delay the reading gives, at each reading', () => {
    const racine = depot();
    const attend = [arrete('demo-1')];
    lire(racine, attend, 0);
    lue(racine, 1);
    expect(lire(racine, attend, 3, 5)).toEqual([]);
    expect(tickets(lire(racine, attend, 6, 5))).toEqual(['demo-1']);
  });

  it('sends the reminder once per delay: it is sent again, so unread, until its next reading', () => {
    const racine = depot();
    const attend = [arrete('demo-1')];
    lire(racine, attend, 0);
    lue(racine, 0);
    expect(tickets(lire(racine, attend, 10))).toEqual(['demo-1']);
    for (const m of [11, 20, 21, 100]) {
      expect(lire(racine, attend, m), `à ${m} min`).toEqual([]);
    }
    lue(racine, 21);
    expect(lire(racine, attend, 30.9)).toEqual([]);
    expect(tickets(lire(racine, attend, 31))).toEqual(['demo-1']);
  });

  it('sends again only the questions whose reading is old enough, each by its own reading', () => {
    const racine = depot();
    const deux = [arrete('demo-1'), arrete('demo-2')];
    lire(racine, [arrete('demo-1')], 0);
    lue(racine, 1, 0);
    lire(racine, deux, 2);
    lue(racine, 5, 2);
    expect(tickets(lire(racine, deux, 11))).toEqual(['demo-1']);
    expect(tickets(lire(racine, deux, 15))).toEqual(['demo-2']);
  });

  it('a question answered never comes back, read or not', () => {
    const racine = depot();
    lire(racine, [arrete('demo-1')], 0);
    lue(racine, 1);
    expect(lire(racine, [tourne('demo-1')], 11)).toEqual([]);
    expect(lire(racine, [tourne('demo-1')], 60)).toEqual([]);
  });

  it('an older file with no reading field reads as sent: no reminder', () => {
    const racine = depot();
    ecrire(racine, [{ cle: cle('demo-1'), depuis: T0, presentee: T0 }]);
    expect(lire(racine, [arrete('demo-1')], 600)).toEqual([]);
    ecrire(racine, [cle('demo-2')]);
    expect(lire(racine, [arrete('demo-2')], 600)).toEqual([]);
  });

  it('the reminder of a stop the opening listed runs from the opening', async () => {
    const racine = depot();
    const attend = [arrete('demo-1')];
    await circuitsALOuverture(racine, {
      fermes: aucun,
      circuitsDe: () => Promise.resolve(attend),
      ticketsDe: () => [],
    });
    const [e] = entrees(racine);
    expect(e!.lue).toBeGreaterThan(0);
    expect(e!.lue).toBe(e!.presentee);
    expect(lire(racine, attend, 0, 10, { maintenant: e!.lue! + 9 * MIN })).toEqual([]);
    expect(tickets(lire(racine, attend, 0, 10, { maintenant: e!.lue! + 10 * MIN }))).toEqual([
      'demo-1',
    ]);
  });
});

describe('the opening reads every question it lists', () => {
  const ouvrir = (racine: string, circuits: Circuit[]) =>
    circuitsALOuverture(racine, {
      fermes: aucun,
      circuitsDe: () => Promise.resolve(circuits),
      ticketsDe: () => [],
    });

  it('reads a question sent to a closed session, or whose message was never recognised', async () => {
    const racine = depot();
    ecrire(racine, [{ cle: cle('demo-1'), depuis: T0, presentee: T0 }]);
    const avant = Date.now();
    await ouvrir(racine, [arrete('demo-1')]);
    const [e] = entrees(racine);
    expect(e!.lue).toBeGreaterThanOrEqual(avant);
    expect(e!.lue).toBeLessThanOrEqual(Date.now());
  });

  it('reads the questions that were never sent as well', async () => {
    const racine = depot();
    await ouvrir(racine, [arrete('demo-1'), arrete('demo-2')]);
    expect(entrees(racine).map(e => e.lue !== undefined)).toEqual([true, true]);
  });

  it('keeps a question carried to the owner as it is', async () => {
    const racine = depot();
    ecrire(racine, [{ cle: cle('demo-1'), depuis: T0, presentee: T0, lue: T0, chez: T0 + MIN }]);
    await ouvrir(racine, [arrete('demo-1')]);
    expect(entrees(racine)[0]!.chez).toBe(T0 + MIN);
  });
});

describe('a question that is not a circuit’s, the alert of the CI of main', () => {
  const ALERTE = { cle: 'rouge 9', texte: 'CI de main rouge : CI, passage 9.' };

  it('has no state in the file and no reminder', () => {
    const racine = depot();
    expect(lire(racine, [], 0, 10, { ciDeMain: ALERTE })).toHaveLength(1);
    lue(racine, 1);
    for (const m of [10, 11, 120]) {
      expect(lire(racine, [], m, 10, { ciDeMain: ALERTE }), `à ${m} min`).toEqual([]);
    }
    expect(existsSync(fichier(racine))).toBe(false);
  });
});

describe('the reminder line names the answer « chez le responsable »', () => {
  const q = {
    ticket: 'demo-1',
    etape: '3.1 Contrôles',
    question: 'Q ?',
    qui: 'superviseur',
    commande: 'npx grillhouse circuit demo-1 --reprendre',
    arret: 'controles',
  };

  it('beside the command of the circuit, on the line after its head', () => {
    expect(texteDesQuestions([{ ...q, representee: true }]).split('\n')).toEqual([
      'Toujours sans réponse · demo-1 · 3.1 Contrôles · controles',
      '→ npx grillhouse circuit demo-1 <réponse> ou --chez-le-responsable',
    ]);
  });

  it('is not on the line of a question sent for the first time', () => {
    expect(texteDesQuestions([q])).not.toContain('--chez-le-responsable');
  });
});

describe('a question carried to the owner is silent until the circuit answers', () => {
  it('is marked at its time, in the file, its other fields kept', () => {
    const racine = depot();
    lire(racine, [arrete('demo-1')], 0);
    lue(racine, 1);
    api.marquerChezLeResponsable(racine, { cle: cle('demo-1'), depuisA: T0 + 3 * MIN });
    expect(entrees(racine)).toEqual([
      {
        cle: cle('demo-1'),
        depuis: T0,
        presentee: T0,
        lue: T0 + 1 * MIN,
        chez: T0 + 3 * MIN,
      },
    ]);
  });

  it('is never sent again, whatever the time since its reading', () => {
    const racine = depot();
    const attend = [arrete('demo-1')];
    lire(racine, attend, 0);
    lue(racine, 1);
    api.marquerChezLeResponsable(racine, { cle: cle('demo-1'), depuisA: T0 + 2 * MIN });
    for (const m of [11, 12, 60, 1440]) {
      expect(lire(racine, attend, m), `à ${m} min`).toEqual([]);
    }
    expect(entrees(racine)[0]!.chez).toBe(T0 + 2 * MIN);
  });

  it('stays silent when a turn reads it', () => {
    const racine = depot();
    const attend = [arrete('demo-1')];
    lire(racine, attend, 0);
    api.marquerChezLeResponsable(racine, { cle: cle('demo-1'), depuisA: T0 + 1 * MIN });
    lue(racine, 2);
    expect(lire(racine, attend, 200)).toEqual([]);
  });

  it('stands aside the others: a question not carried to the owner still comes back', () => {
    const racine = depot();
    const deux = [arrete('demo-1'), arrete('demo-2')];
    lire(racine, deux, 0);
    lue(racine, 1);
    api.marquerChezLeResponsable(racine, { cle: cle('demo-1'), depuisA: T0 + 2 * MIN });
    expect(tickets(lire(racine, deux, 11))).toEqual(['demo-2']);
  });

  it('loses its mark when the circuit leaves its stop, and the next question is a new one', () => {
    const racine = depot();
    lire(racine, [arrete('demo-1')], 0);
    lue(racine, 1);
    api.marquerChezLeResponsable(racine, { cle: cle('demo-1'), depuisA: T0 + 2 * MIN });
    lire(racine, [tourne('demo-1')], 5);
    expect(JSON.stringify(entrees(racine))).not.toContain('chez');
    const suivante = lire(racine, [arrete('demo-1', 2)], 6);
    expect(suivante).toHaveLength(1);
    expect(entrees(racine)[0]).not.toHaveProperty('chez');
  });
});

describe('the answer --chez-le-responsable of the circuit', () => {
  it('is read as an answer of its own, and goes alone', () => {
    expect(lireLAppel(['demo-1', '--chez-le-responsable'])).toMatchObject({
      ticket: 'demo-1',
      chezLeResponsable: true,
      reprendre: false,
      arreter: false,
    });
    expect(lireLAppel(['demo-1', '--reprendre'])).toMatchObject({ chezLeResponsable: false });
    for (const autre of [
      ['--reprendre'],
      ['--arreter'],
      ['--etendre', 'a'],
      ['--recommencer'],
      ['--reporter', '+1h'],
      ['--depuis', 'testwriter', '--contexte', 'x'],
      ['--mecanique', '--contexte', 'x'],
    ]) {
      expect(() => lireLAppel(['demo-1', '--chez-le-responsable', ...autre]), autre[0]).toThrow(
        Usage
      );
    }
  });

  it('is among the answers a circuit stopped on a question accepts, with its help text', () => {
    for (const statut of ['RUNNING', 'COMPLETED']) {
      expect(lesReponses('demo-1', statut, true), statut).toContain('--chez-le-responsable');
    }
  });

  it('is not among the answers of a circuit ended without its issue', () => {
    expect(lesReponses('demo-1', 'TERMINATED', true)).not.toContain('--chez-le-responsable');
  });
});
