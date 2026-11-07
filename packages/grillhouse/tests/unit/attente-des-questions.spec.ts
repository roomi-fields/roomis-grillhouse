// The wait of the questions of the circuits (grillhouse-pq6, grillhouse-4nr.10,
// scripts/superviseur.mjs): a command the session of supervision keeps in the background, which
// ends only when a new question of a circuit appears (its ticket, its step, its question, the
// command that answers it), whatever launched the circuit, and so wakes the session by the end of
// its task. It reads the circuits from the Temporal server at each step (here a reading injected).
// A question already gone up never wakes it twice, a question answered leaves the set of those
// gone up, and the normal end of a circuit never wakes it. Witness: on 2026-11-01, SyntHub's
// SH-ae6.5.2, SH-ae6.5.6 and SH-br0.1.5, launched by a queue in the background, stopped on a
// question to the supervisor and waited hours, read by no one.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  attendreUneQuestion,
  circuitsALOuverture,
  questionsEnAttente,
  texteDesQuestions,
} from '../../scripts/superviseur.mjs';
import { circuitLu } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'attente-des-questions-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const aucun = () => new Set<string>();

type Circuit = ReturnType<typeof circuitLu>;

// A repository, its folder of the circuits made.
const depot = () => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
  return racine;
};

// The circuit of <ticket> stopped on the question <question> of the supervisor, the <numero>th of
// its run <run>.
const arrete = (ticket: string, question: string, { run = `run-${ticket}`, numero = 1 } = {}) =>
  circuitLu(ticket, {
    etape: 'controles',
    code: 14,
    arret: 'controles',
    question,
    qui: 'superviseur',
    run,
    numero,
  });

// The reading of the server the test changes: `circuits`, what the next step reads; `lectures`,
// the steps read.
const serveur = (circuits: Circuit[] = []) => {
  const s = {
    circuits,
    lectures: 0,
    lire: () => {
      s.lectures++;
      return Promise.resolve(s.circuits);
    },
  };
  return s;
};

// The wait under <racine> on the reading <lire>, a step every <pas> ms, ended after <ms> by its
// signal when no question comes: its questions.
const attendre = (
  racine: string,
  lire: (r: string) => Promise<Circuit[]>,
  { ms = 1500, pas = 50 } = {}
) => {
  const fin = new AbortController();
  const minuteur = setTimeout(() => fin.abort(), ms);
  return attendreUneQuestion({
    racine,
    fermes: aucun,
    pas,
    signal: fin.signal,
    circuitsDe: lire,
  }).finally(() => clearTimeout(minuteur));
};

describe('the questions that wait for the supervisor, one source', () => {
  it('grillhouse-pq6 critère 2 — each one gives its ticket, its step, its question and the command that answers it', () => {
    const circuits = [
      arrete('demo-1', 'Quel paquet lève ce rouge ?'),
      circuitLu('demo-2', {
        etape: 'preuve',
        interrompu: true,
        reponse: `npx grillhouse circuit demo-2 --reprendre\` ou \`--depuis <testwriter|developpeur> --contexte <texte>`,
        question: 'Le déroulé du circuit a fini sans son issue (TERMINATED), aucun arrêt écrit.',
        qui: 'superviseur',
      }),
      circuitLu('demo-4', { code: 0, arret: 'arrete' }),
      circuitLu('demo-5', { etape: 'testwriter', vivant: true }),
    ];
    const q = questionsEnAttente(depot(), circuits, { fermes: aucun });
    expect(q.map(x => x.ticket)).toEqual(['demo-1', 'demo-2']);
    expect(q[0]).toMatchObject({
      ticket: 'demo-1',
      etape: '3.1 Contrôles',
      qui: 'superviseur',
      question: 'Quel paquet lève ce rouge ?',
    });
    expect(q[0]!.commande).toContain('npx grillhouse circuit demo-1 --reprendre');
    expect(q[1]).toMatchObject({ ticket: 'demo-2', etape: '2.1 Preuve du rouge' });
    expect(q[1]!.commande).toBe(
      'npx grillhouse circuit demo-2 --reprendre` ou `--depuis <testwriter|developpeur> --contexte <texte>'
    );
    // A question whose ticket is closed waits for no one.
    expect(
      questionsEnAttente(depot(), circuits, { fermes: () => new Set(['demo-1']) })
    ).toHaveLength(1);
  });

  it('a workflow ended during its question: the wake names the answers the client accepts once', () => {
    const reponse =
      'npx grillhouse circuit demo-1 --reprendre` ou `--depuis <testwriter|developpeur> --contexte <texte>';
    const texte = texteDesQuestions(
      questionsEnAttente(
        depot(),
        [
          circuitLu('demo-1', {
            etape: 'controles',
            arret: 'controles',
            sansIssue: true,
            reponse,
            question:
              'Le déroulé du circuit a fini sans son issue (TERMINATED), pendant sa question (controles).',
            qui: 'superviseur',
            numero: 1,
          }),
        ],
        { fermes: aucun }
      )
    );
    expect(texte.split('npx grillhouse circuit demo-1')).toHaveLength(2);
    expect(texte).toContain(`La réponse : \`${reponse}\`.`);
  });

  it('grillhouse-pq6 critère 2 — the text of the wake names each new question with its command', () => {
    const texte = texteDesQuestions(
      questionsEnAttente(depot(), [arrete('demo-1', 'Quel paquet lève ce rouge ?')], {
        fermes: aucun,
      })
    );
    expect(texte).toMatch(/^## Question neuve d'un circuit\n/);
    expect(texte).toMatch(
      /- demo-1, à 3\.1 Contrôles, au superviseur : Quel paquet lève ce rouge \?/
    );
    expect(texte).toContain('`npx grillhouse circuit demo-1 --reprendre`');
    expect(texte).toContain('`npx grillhouse superviseur --attendre`');
  });
});

describe('the wait of a new question', () => {
  it('grillhouse-pq6 critère 1 — a question already there and never gone up ends the wait at once', async () => {
    const s = serveur([arrete('demo-1', 'Q1 ?')]);
    const q = await attendre(depot(), s.lire);
    expect(q.map(x => x.ticket)).toEqual(['demo-1']);
  });

  it('grillhouse-4nr.10 critère 1 — a circuit that stops on a question while the wait runs ends it, whoever launched it', async () => {
    const s = serveur([circuitLu('demo-1', { etape: 'controles', vivant: true })]);
    const attente = attendre(depot(), s.lire, { ms: 5000 });
    await new Promise(r => setTimeout(r, 200));
    s.circuits = [arrete('demo-1', 'Q1 ?')];
    const q = await attente;
    expect(q.map(x => [x.ticket, x.question])).toEqual([['demo-1', 'Q1 ?']]);
  });

  it('grillhouse-4nr.10 critère 1 — the normal end of a circuit never ends the wait', async () => {
    const s = serveur([circuitLu('demo-1', { etape: 'controles', vivant: true })]);
    const attente = attendre(depot(), s.lire, { ms: 600 });
    await new Promise(r => setTimeout(r, 150));
    // Its workflow completes on the supervisor's « arrete », or is integrated: no longer read.
    s.circuits = [circuitLu('demo-1', { code: 0, arret: 'arrete' })];
    await new Promise(r => setTimeout(r, 150));
    s.circuits = [];
    expect(await attente).toEqual([]);
    expect(s.lectures).toBeGreaterThan(2);
  });

  it('grillhouse-pq6 critère 3 — a question already gone up does not wake the wait a second time', async () => {
    const racine = depot();
    const s = serveur([arrete('demo-1', 'Q1 ?')]);
    expect(await attendre(racine, s.lire)).toHaveLength(1);
    // The same question read again, and a circuit that runs: nothing new.
    s.circuits = [arrete('demo-1', 'Q1 ?'), circuitLu('demo-2', { vivant: true })];
    expect(await attendre(racine, s.lire, { ms: 500 })).toEqual([]);
  });

  it('grillhouse-pq6 critère 3 — the questions the opening names are gone up', async () => {
    const racine = depot();
    const s = serveur([arrete('demo-1', 'Q1 ?')]);
    expect(await circuitsALOuverture(racine, { fermes: aucun, circuitsDe: s.lire })).toContain(
      'demo-1'
    );
    expect(await attendre(racine, s.lire, { ms: 500 })).toEqual([]);
  });

  it('grillhouse-4nr.10 critère 2 — a session closed then opened again finds every question that waits, those gone up included', async () => {
    const racine = depot();
    const s = serveur([arrete('demo-1', 'Q1 ?'), arrete('demo-2', 'Q2 ?')]);
    expect(await attendre(racine, s.lire)).toHaveLength(2);
    const texte = await circuitsALOuverture(racine, { fermes: aucun, circuitsDe: s.lire });
    expect(texte).toContain('- demo-1 est arrêté sur une question');
    expect(texte).toContain('- demo-2 est arrêté sur une question');
  });

  it('grillhouse-pq6 critère 3 — a question answered leaves those gone up, and the next question of its circuit wakes again', async () => {
    const racine = depot();
    const s = serveur([arrete('demo-1', 'Q1 ?')]);
    expect(await attendre(racine, s.lire)).toHaveLength(1);
    // The supervisor answers: the circuit runs again, then stops on its next question.
    s.circuits = [circuitLu('demo-1', { etape: 'controles', vivant: true, numero: 1 })];
    expect(await attendre(racine, s.lire, { ms: 300 })).toEqual([]);
    const remontees = readFileSync(
      path.join(racine, '.claude', 'worktrees', 'questions-remontees.json'),
      'utf8'
    );
    expect(remontees).not.toContain('demo-1');
    s.circuits = [arrete('demo-1', 'Q1 ?', { numero: 2 })];
    expect((await attendre(racine, s.lire)).map(x => x.ticket)).toEqual(['demo-1']);
    // A new run of its workflow, its first question: another stop.
    s.circuits = [arrete('demo-1', 'Q1 ?', { run: 'run-2', numero: 1 })];
    expect((await attendre(racine, s.lire)).map(x => x.ticket)).toEqual(['demo-1']);
  });

  it('grillhouse-pq6 critère 1 — a circuit ended without its issue ends the wait', async () => {
    const s = serveur([circuitLu('demo-1', { etape: 'controles', vivant: true })]);
    const attente = attendre(depot(), s.lire, { ms: 5000 });
    await new Promise(r => setTimeout(r, 150));
    s.circuits = [
      circuitLu('demo-1', {
        etape: 'controles',
        interrompu: true,
        reponse: `npx grillhouse circuit demo-1 --reprendre\` ou \`--depuis <testwriter|developpeur> --contexte <texte>`,
        question: 'Le déroulé du circuit a fini sans son issue (TERMINATED), aucun arrêt écrit.',
        qui: 'superviseur',
      }),
    ];
    const q = await attente;
    expect(q.map(x => x.ticket)).toEqual(['demo-1']);
    expect(q[0]!.commande).toBe(
      'npx grillhouse circuit demo-1 --reprendre` ou `--depuis <testwriter|developpeur> --contexte <texte>'
    );
  });

  it('grillhouse-4nr.10 critère 1 — a reading that fails is tried again at the next step, the questions gone up kept', async () => {
    const racine = depot();
    const s = serveur([arrete('demo-1', 'Q1 ?')]);
    expect(await attendre(racine, s.lire)).toHaveLength(1);
    let pannes = 0;
    const enPanne = () => (pannes++ < 2 ? Promise.reject(new Error('UNAVAILABLE')) : s.lire());
    s.circuits = [arrete('demo-1', 'Q1 ?'), arrete('demo-2', 'Q2 ?')];
    const q = await attendre(racine, enPanne, { ms: 3000 });
    expect(pannes).toBeGreaterThan(2);
    expect(q.map(x => x.ticket)).toEqual(['demo-2']);
  });

  it('grillhouse-pq6 — one wait at a time: a second one is refused while the first runs', async () => {
    const racine = depot();
    const s = serveur();
    const premiere = attendre(racine, s.lire, { ms: 500 });
    await expect(
      attendreUneQuestion({ racine, fermes: aucun, circuitsDe: s.lire })
    ).rejects.toThrow(/une attente des questions tourne déjà/i);
    expect(await premiere).toEqual([]);
  });
});
