// The wait of the supervisor keeps listening by itself and presents again a question that nobody
// answered (grillhouse-d4n.7): `attendreUneQuestion` is an asynchronous iterator that gives one batch
// of questions at a time and goes on listening; a question whose circuit still stands on the same
// stop comes back when the interval of re-presentation has passed since its last presentation,
// never before; the file of the stops gone up keeps, for each one, `depuis` (its first going up) and
// `presentee` (its last presentation), in ms of the injected clock; an older file (a list of keys)
// reads without error. Every time is measured on an injected clock, with no real wait.
import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  attendreUneQuestion,
  texteDesQuestions,
  verrouDeLAttente,
} from '../../scripts/superviseur.mjs';
import { circuitLu } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'representation-des-questions-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MIN = 60_000;
const aucun = () => new Set<string>();
type Circuit = ReturnType<typeof circuitLu>;

const depot = () => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
  return racine;
};
const fichier = (racine: string) =>
  path.join(racine, '.claude', 'worktrees', 'questions-remontees.json');
interface Question {
  ticket: string;
  question: string;
  representee?: boolean;
}
interface Entree {
  cle: string;
  depuis: number;
  presentee: number;
}
const lireFichier = (racine: string) =>
  JSON.parse(readFileSync(fichier(racine), 'utf8')) as { remontees: Entree[] };

const arrete = (ticket: string, question: string, { numero = 1 } = {}) =>
  circuitLu(ticket, {
    etape: 'controles',
    code: 14,
    arret: 'controles',
    question,
    qui: 'superviseur',
    numero,
  });
const cle = (ticket: string, numero = 1) => `${ticket}:run-${ticket}:${numero}:controles`;

const horloge = (t0 = 10_000_000) => {
  let t = t0;
  return {
    debut: t0,
    maintenant: () => t,
    avance: (minutes: number) => {
      t += minutes * MIN;
    },
  };
};

const serveur = (circuits: Circuit[]) => {
  const s = { circuits, lire: () => Promise.resolve(s.circuits) };
  return s;
};

// The wait as an iterator: `prochain` gives the next batch, or null when none comes in <ms> real ms.
const ecoute = (
  racine: string,
  s: { lire: () => Promise<Circuit[]> },
  h: { maintenant: () => number },
  extra: { rappel?: number } = {}
) => {
  const fin = new AbortController();
  const it = attendreUneQuestion({
    racine,
    fermes: aucun,
    pas: 10,
    signal: fin.signal,
    circuitsDe: s.lire,
    maintenant: h.maintenant,
    ...extra,
  })[Symbol.asyncIterator]();
  let enCours: Promise<IteratorResult<Question[]>> | null = null;
  return {
    async prochain(ms = 250): Promise<Question[] | null> {
      enCours ??= it.next();
      const r = await Promise.race([
        enCours,
        new Promise<'rien'>(res => setTimeout(() => res('rien'), ms)),
      ]);
      if (r === 'rien') {
        return null;
      }
      enCours = null;
      return r.done ? null : r.value;
    },
    async arreter() {
      fin.abort();
      await it.return(undefined);
    },
  };
};

describe('the wait keeps listening by itself', () => {
  it('gives a batch, then goes on and gives the next question of another circuit, without any relaunch', async () => {
    const racine = depot();
    const h = horloge();
    const s = serveur([arrete('demo-1', 'Q1 ?')]);
    const e = ecoute(racine, s, h);
    try {
      expect((await e.prochain())?.map(q => q.ticket)).toEqual(['demo-1']);
      expect(existsSync(verrouDeLAttente(racine))).toBe(true);
      expect(await e.prochain(100)).toBeNull();
      s.circuits = [arrete('demo-1', 'Q1 ?'), arrete('demo-2', 'Q2 ?')];
      expect((await e.prochain())?.map(q => q.ticket)).toEqual(['demo-2']);
      s.circuits = [...s.circuits, arrete('demo-3', 'Q3 ?')];
      expect((await e.prochain())?.map(q => q.ticket)).toEqual(['demo-3']);
    } finally {
      await e.arreter();
    }
    expect(existsSync(verrouDeLAttente(racine))).toBe(false);
  });

  it('the text of a batch asks for no relaunch of the wait', () => {
    const texte = texteDesQuestions([
      {
        ticket: 'demo-1',
        etape: '3.1 Contrôles',
        question: 'Q1 ?',
        qui: 'superviseur',
        commande: 'npx grillhouse circuit demo-1 --reprendre',
      },
    ]);
    expect(texte).not.toMatch(/relance l'attente/);
    expect(texte).not.toContain('run_in_background');
    expect(texte).toContain('`npx grillhouse circuit demo-1 --reprendre`');
  });

  it('the text of a question presented again says that it still waits for an answer', () => {
    const q = {
      ticket: 'demo-1',
      etape: '3.1 Contrôles',
      question: 'Q1 ?',
      qui: 'superviseur',
      commande: 'npx grillhouse circuit demo-1 --reprendre',
    };
    expect(texteDesQuestions([{ ...q, representee: true }])).toMatch(/sans réponse/i);
    expect(texteDesQuestions([q])).not.toMatch(/sans réponse/i);
  });
});

describe('a question not answered is presented again', () => {
  it('after 5 minutes by default, never before, and again 5 minutes after each presentation', async () => {
    const racine = depot();
    const h = horloge();
    const s = serveur([arrete('demo-1', 'Q1 ?')]);
    const e = ecoute(racine, s, h);
    try {
      expect((await e.prochain())?.[0]).toMatchObject({ ticket: 'demo-1' });
      h.avance(4.9);
      expect(await e.prochain(100)).toBeNull();
      h.avance(0.1);
      const encore = await e.prochain();
      expect(encore?.map(q => q.ticket)).toEqual(['demo-1']);
      expect(encore?.[0].representee).toBe(true);
      h.avance(4);
      expect(await e.prochain(100)).toBeNull();
      h.avance(1);
      expect((await e.prochain())?.map(q => q.ticket)).toEqual(['demo-1']);
    } finally {
      await e.arreter();
    }
  });

  it('after the interval given, in minutes', async () => {
    const racine = depot();
    const h = horloge();
    const s = serveur([arrete('demo-1', 'Q1 ?')]);
    const e = ecoute(racine, s, h, { rappel: 2 });
    try {
      expect(await e.prochain()).not.toBeNull();
      h.avance(1.9);
      expect(await e.prochain(100)).toBeNull();
      h.avance(0.1);
      expect((await e.prochain())?.map(q => q.ticket)).toEqual(['demo-1']);
    } finally {
      await e.arreter();
    }
  });

  it('no longer once the circuit has left its stop', async () => {
    const racine = depot();
    const h = horloge();
    const s = serveur([arrete('demo-1', 'Q1 ?')]);
    const e = ecoute(racine, s, h);
    try {
      expect(await e.prochain()).not.toBeNull();
      s.circuits = [circuitLu('demo-1', { etape: 'controles', vivant: true })];
      h.avance(30);
      expect(await e.prochain(150)).toBeNull();
    } finally {
      await e.arreter();
    }
    expect(JSON.stringify(lireFichier(racine))).not.toContain('demo-1');
  });

  it('a stop whose key changes is a new question, given at once with a new `depuis`', async () => {
    const racine = depot();
    const h = horloge();
    const s = serveur([arrete('demo-1', 'Q1 ?')]);
    const e = ecoute(racine, s, h);
    try {
      expect(await e.prochain()).not.toBeNull();
      h.avance(2);
      s.circuits = [arrete('demo-1', 'Q1 bis ?', { numero: 2 })];
      const neuve = await e.prochain();
      expect(neuve?.[0]).toMatchObject({ ticket: 'demo-1', question: 'Q1 bis ?' });
      expect(neuve?.[0].representee).toBeFalsy();
    } finally {
      await e.arreter();
    }
    const entrees = lireFichier(racine).remontees;
    expect(entrees).toHaveLength(1);
    expect(entrees[0]).toMatchObject({
      cle: cle('demo-1', 2),
      depuis: h.debut + 2 * MIN,
      presentee: h.debut + 2 * MIN,
    });
  });

  it('only the questions whose interval has passed come back, each by its own last presentation', async () => {
    const racine = depot();
    const h = horloge();
    const s = serveur([arrete('demo-1', 'Q1 ?')]);
    const e = ecoute(racine, s, h);
    try {
      expect(await e.prochain()).not.toBeNull();
      h.avance(3);
      s.circuits = [arrete('demo-1', 'Q1 ?'), arrete('demo-2', 'Q2 ?')];
      expect((await e.prochain())?.map(q => q.ticket)).toEqual(['demo-2']);
      h.avance(2);
      expect((await e.prochain())?.map(q => q.ticket)).toEqual(['demo-1']);
      h.avance(3);
      expect((await e.prochain())?.map(q => q.ticket)).toEqual(['demo-2']);
    } finally {
      await e.arreter();
    }
  });
});

describe('the file of the stops gone up', () => {
  it('keeps the time of the first going up and of the last presentation of each stop', async () => {
    const racine = depot();
    const h = horloge();
    const s = serveur([arrete('demo-1', 'Q1 ?')]);
    const e = ecoute(racine, s, h);
    try {
      expect(await e.prochain()).not.toBeNull();
      expect(lireFichier(racine).remontees).toEqual([
        { cle: cle('demo-1'), depuis: h.debut, presentee: h.debut },
      ]);
      h.avance(5);
      expect(await e.prochain()).not.toBeNull();
      expect(lireFichier(racine).remontees).toEqual([
        { cle: cle('demo-1'), depuis: h.debut, presentee: h.debut + 5 * MIN },
      ]);
    } finally {
      await e.arreter();
    }
  });

  it('an older file, a list of keys, reads without error: its stops take the time of the reading', async () => {
    const racine = depot();
    writeFileSync(fichier(racine), `${JSON.stringify({ remontees: [cle('demo-1')] })}\n`);
    const h = horloge();
    const s = serveur([arrete('demo-1', 'Q1 ?')]);
    const e = ecoute(racine, s, h);
    try {
      // Already gone up: not given again at once.
      expect(await e.prochain(150)).toBeNull();
      h.avance(5);
      expect((await e.prochain())?.map(q => q.ticket)).toEqual(['demo-1']);
    } finally {
      await e.arreter();
    }
    expect(lireFichier(racine).remontees).toEqual([
      { cle: cle('demo-1'), depuis: h.debut, presentee: h.debut + 5 * MIN },
    ]);
  });
});
