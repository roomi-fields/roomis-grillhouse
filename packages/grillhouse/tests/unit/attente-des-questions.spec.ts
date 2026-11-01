// The wait of the questions of the circuits (grillhouse-pq6, scripts/superviseur.mjs): a command
// the session of supervision keeps in the background, which ends only when a new question of a
// circuit appears (its ticket, its step, its question, the command that answers it), whatever
// launched the circuit, and so wakes the session by the end of its task. A question already gone
// up never wakes it twice, and a question answered leaves the set of those gone up. Witness: on
// 2026-11-01, SyntHub's SH-ae6.5.2, SH-ae6.5.6 and SH-br0.1.5, launched by a queue in the
// background, stopped on a question to the supervisor and waited hours, read by no one.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  attendreUneQuestion,
  circuitsALOuverture,
  questionsEnAttente,
  texteDesQuestions,
} from '../../scripts/superviseur.mjs';
import { departDe } from '../../scripts/mesure/base-de-passe.mjs';
import { rendreVivant } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'attente-des-questions-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const aucun = () => new Set<string>();

// A repository whose circuits <etats> names, as scripts/circuit.mjs writes their state.
const depot = (etats: Record<string, object> = {}) => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
  for (const [ticket, e] of Object.entries(etats)) {
    ecrire(racine, ticket, e);
  }
  return racine;
};
const ecrire = (racine: string, ticket: string, e: object) =>
  writeFileSync(
    path.join(racine, '.claude', 'worktrees', `${ticket}.circuit.json`),
    JSON.stringify({ etape: 'developpeur', tentative: 1, code: null, raison: null, ...e })
  );

// A circuit stopped on a question of the supervisor, its process <processus> gone.
const arrete = (question: string, processus = 4_000_001, depart = '11') => ({
  etape: 'controles',
  code: 14,
  raison: 'controles',
  processus,
  depart,
  question: { arret: 'controles', fait: 'rouge', piece: 'p', question, qui: 'superviseur' },
});

// The wait under <racine>, ended after <ms> by its signal when no question comes: its questions.
const attendre = (racine: string, ms = 1500, pas = 60_000) => {
  const fin = new AbortController();
  const minuteur = setTimeout(() => fin.abort(), ms);
  return attendreUneQuestion({ racine, fermes: aucun, pas, signal: fin.signal }).finally(() =>
    clearTimeout(minuteur)
  );
};

describe('the questions that wait for the supervisor, one source', () => {
  it('grillhouse-pq6 critère 2 — each one gives its ticket, its step, its question and the command that answers it', () => {
    const racine = depot({
      'demo-1': arrete('Quel paquet lève ce rouge ?'),
      'demo-2': { etape: 'preuve', processus: 4_000_002, depart: '12' },
      'demo-3': { etape: 'integre', code: 0 },
      'demo-4': { etape: 'developpeur', code: 0, raison: 'arrete' },
      'demo-5': { etape: 'testwriter' },
    });
    rendreVivant(racine, 'demo-5');
    const q = questionsEnAttente(racine, { fermes: aucun });
    expect(q.map(x => x.ticket)).toEqual(['demo-1', 'demo-2']);
    expect(q[0]).toMatchObject({
      ticket: 'demo-1',
      etape: '3.1 Contrôles',
      qui: 'superviseur',
      question: 'Quel paquet lève ce rouge ?',
    });
    expect(q[0].commande).toContain('npx grillhouse circuit demo-1 --reprendre');
    expect(q[1]).toMatchObject({ ticket: 'demo-2', etape: '2.1 Preuve du rouge' });
    expect(q[1].question).toMatch(/mort sans état final/);
    expect(q[1].commande).toBe('npx grillhouse circuit demo-2 --reprendre');
    // A question whose ticket is closed waits for no one.
    expect(questionsEnAttente(racine, { fermes: () => new Set(['demo-1']) })).toHaveLength(1);
  });

  it('grillhouse-pq6 critère 2 — the text of the wake names each new question with its command', () => {
    const racine = depot({ 'demo-1': arrete('Quel paquet lève ce rouge ?') });
    const texte = texteDesQuestions(questionsEnAttente(racine, { fermes: aucun }));
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
    const racine = depot({ 'demo-1': arrete('Q1 ?') });
    const q = await attendre(racine);
    expect(q.map(x => x.ticket)).toEqual(['demo-1']);
  });

  it('grillhouse-pq6 critère 1 — a circuit that stops on a question while the wait runs ends it, whoever launched it', async () => {
    const racine = depot({ 'demo-1': { etape: 'controles' } });
    rendreVivant(racine, 'demo-1');
    const attente = attendre(racine, 5000);
    await new Promise(r => setTimeout(r, 200));
    ecrire(racine, 'demo-1', arrete('Q1 ?'));
    const q = await attente;
    expect(q.map(x => [x.ticket, x.question])).toEqual([['demo-1', 'Q1 ?']]);
  });

  it('grillhouse-pq6 critère 3 — a question already gone up does not wake the wait a second time', async () => {
    const racine = depot({ 'demo-1': arrete('Q1 ?') });
    expect(await attendre(racine)).toHaveLength(1);
    const attente = attendre(racine, 1500);
    await new Promise(r => setTimeout(r, 200));
    // Its state written again, unchanged, and a circuit that runs: nothing new.
    ecrire(racine, 'demo-1', arrete('Q1 ?'));
    ecrire(racine, 'demo-2', { etape: 'testwriter' });
    rendreVivant(racine, 'demo-2');
    expect(await attente).toEqual([]);
  });

  it('grillhouse-pq6 critère 3 — the questions the opening names are gone up', async () => {
    const racine = depot({ 'demo-1': arrete('Q1 ?') });
    expect(circuitsALOuverture(racine, { fermes: aucun })).toContain('demo-1');
    expect(await attendre(racine, 500)).toEqual([]);
  });

  it('grillhouse-pq6 critère 3 — a question answered leaves those gone up, and the next stop of its circuit wakes again', async () => {
    const racine = depot({ 'demo-1': arrete('Q1 ?') });
    expect(await attendre(racine)).toHaveLength(1);
    // The supervisor answers: the circuit runs again, then stops on a question, a new run.
    ecrire(racine, 'demo-1', { etape: 'controles' });
    rendreVivant(racine, 'demo-1');
    expect(await attendre(racine, 300)).toEqual([]);
    const remontees = readFileSync(
      path.join(racine, '.claude', 'worktrees', 'questions-remontees.json'),
      'utf8'
    );
    expect(remontees).not.toContain('demo-1');
    ecrire(racine, 'demo-1', arrete('Q1 ?', 4_000_009, '19'));
    expect((await attendre(racine)).map(x => x.ticket)).toEqual(['demo-1']);
  });

  it('grillhouse-pq6 critère 1 — a circuit that dies without a state written ends the wait', async () => {
    const enfant = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)']);
    try {
      await new Promise(r => enfant.once('spawn', r));
      const racine = depot({
        'demo-1': {
          etape: 'controles',
          processus: enfant.pid,
          depart: departDe(enfant.pid ?? 0),
        },
      });
      const fin = new AbortController();
      const minuteur = setTimeout(() => fin.abort(), 5000);
      const attente = attendreUneQuestion({ racine, fermes: aucun, pas: 100, signal: fin.signal });
      await new Promise(r => setTimeout(r, 200));
      enfant.kill('SIGKILL');
      const q = await attente;
      clearTimeout(minuteur);
      expect(q.map(x => x.ticket)).toEqual(['demo-1']);
      expect(q[0].commande).toBe('npx grillhouse circuit demo-1 --reprendre');
    } finally {
      enfant.kill('SIGKILL');
    }
  });

  it('grillhouse-pq6 — a circuit that leaves its last mark at its exit (its state touched) ends the wait at once, with no periodic reading', async () => {
    const racine = depot();
    const etat = path.join(racine, '.claude', 'worktrees', 'demo-1.circuit.json');
    // A run as the circuit's: its state names it, then, at its exit without a stop written, the
    // state touched, as the entry of scripts/circuit.mjs does.
    const enfant = spawn(process.execPath, [
      '-e',
      `const fs = require('node:fs');
process.on('exit', () => { const t = new Date(); fs.utimesSync(${JSON.stringify(etat)}, t, t); });
setTimeout(() => {}, 600);`,
    ]);
    try {
      await new Promise(r => enfant.once('spawn', r));
      ecrire(racine, 'demo-1', {
        etape: 'controles',
        processus: enfant.pid,
        depart: departDe(enfant.pid ?? 0),
      });
      const q = await attendre(racine, 10_000, 3_600_000);
      expect(q.map(x => x.ticket)).toEqual(['demo-1']);
    } finally {
      enfant.kill('SIGKILL');
    }
  });

  it('grillhouse-pq6 — one wait at a time: a second one is refused while the first runs', async () => {
    const racine = depot();
    const premiere = attendre(racine, 500);
    await expect(attendreUneQuestion({ racine, fermes: aucun })).rejects.toThrow(
      /une attente des questions tourne déjà/i
    );
    expect(await premiere).toEqual([]);
  });
});
