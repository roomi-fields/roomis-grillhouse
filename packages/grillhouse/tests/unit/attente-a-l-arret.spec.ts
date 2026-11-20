// The stop of the session of supervision (scripts/attente-a-l-arret.mjs, the subcommand
// `attente-a-l-arret` that the hook Stop of the plugin runs): the session does not go to wait for
// the owner while a circuit waits for its answer; each question blocks once; a circuit that runs
// blocks nothing and asks for no wait (the greffon pushes the questions). Witness: on 2026-11-11,
// bf5 stopped on a question at 17:06 and 44b.5.3 soon after; the supervisor read them 40 min
// later, on the owner's word.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { attenteALArret } from '../../scripts/attente-a-l-arret.mjs';
import { SOUS_COMMANDES } from '../../scripts/sous-commandes.mjs';
import { circuitLu } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'attente-a-l-arret-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) =>
  spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    encoding: 'utf8',
  });

// A repository of the supervisor (its own git directory), its folder of the circuits made.
const depot = () => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q');
  mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
  return racine;
};

type Circuit = ReturnType<typeof circuitLu>;
const arrete = (ticket: string, question: string, numero = 1) =>
  circuitLu(ticket, {
    etape: 'controles',
    code: 14,
    arret: 'controles',
    question,
    qui: 'superviseur',
    numero,
  });
const tourne = (ticket: string) => circuitLu(ticket, { etape: 'developpeur', vivant: true });

// The stop of the session in <dossier>, the circuits <circuits> read.
const arreter = (
  dossier: string,
  circuits: Circuit[],
  { env = {} as Record<string, string | undefined> } = {}
) =>
  attenteALArret(dossier, {
    env,
    fermes: () => new Set<string>(),
    circuitsDe: () => Promise.resolve(circuits),
  });

describe('a question of a circuit holds the stop of the session of supervision', () => {
  it('blocks the stop with each question: its ticket, its step, its question and the command that answers it', async () => {
    const raison = await arreter(depot(), [
      arrete('demo-1', 'Quel paquet lève ce rouge ?'),
      arrete('demo-2', 'Quel nom pour ce paquet ?'),
    ]);
    expect(raison).toMatch(/^Ne te mets pas en attente : 2 circuits attendent ta réponse\./);
    expect(raison).toContain(
      '- demo-1, à 3.1 Contrôles, au superviseur : Quel paquet lève ce rouge ?'
    );
    expect(raison).toContain('`npx grillhouse circuit demo-1 --reprendre`');
    expect(raison).toContain('Quel nom pour ce paquet ?');
  });

  it('blocks once per question: the same question lets the next stop pass, a new one blocks alone', async () => {
    const racine = depot();
    const premier = [arrete('demo-1', 'Q1 ?')];
    expect(await arreter(racine, premier)).toContain('demo-1');
    expect(await arreter(racine, premier)).toBeNull();
    const raison = await arreter(racine, [...premier, arrete('demo-2', 'Q2 ?')]);
    expect(raison).toContain('demo-2');
    expect(raison).not.toContain('demo-1');
  });

  it('the next question of the same circuit blocks again', async () => {
    const racine = depot();
    expect(await arreter(racine, [arrete('demo-1', 'Q1 ?')])).not.toBeNull();
    expect(await arreter(racine, [tourne('demo-1')])).toBeNull();
    expect(await arreter(racine, [arrete('demo-1', 'Q2 ?', 2)])).toContain('Q2 ?');
  });
});

describe('a circuit that runs asks for no wait', () => {
  it('lets the stop pass: the greffon pushes the question and the end of the circuit', async () => {
    const racine = depot();
    expect(await arreter(racine, [tourne('demo-1'), tourne('demo-2')])).toBeNull();
    expect(await arreter(racine, [tourne('demo-1')])).toBeNull();
  });

  it('never asks to launch a wait, whatever blocks the stop', async () => {
    const raison = await arreter(depot(), [arrete('demo-1', 'Q1 ?'), tourne('demo-2')]);
    expect(raison).toContain('demo-1');
    expect(raison).not.toContain('--attendre');
    expect(raison).not.toMatch(/aucune attente/i);
    expect(raison).not.toContain('demo-2');
  });
});

describe('the note of what blocked the stop', () => {
  const note = (racine: string) =>
    path.join(racine, '.claude', 'worktrees', 'signale-a-l-arret.json');

  it('holds the keys of the questions that still wait, and no state', async () => {
    const racine = depot();
    await arreter(racine, [arrete('demo-1', 'Q1 ?'), tourne('demo-2')]);
    const ecrite = JSON.parse(readFileSync(note(racine), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(ecrite)).toEqual(['questions']);
    expect(ecrite.questions).toHaveLength(1);
  });

  it('an older note that holds a state reads without error: its questions count, the state is dropped', async () => {
    const racine = depot();
    await arreter(racine, [arrete('demo-1', 'Q1 ?')]);
    const lue = JSON.parse(readFileSync(note(racine), 'utf8')) as { questions: string[] };
    writeFileSync(
      note(racine),
      `${JSON.stringify({ questions: lue.questions, etat: 'sans-attente:demo-2' })}\n`
    );
    expect(await arreter(racine, [arrete('demo-1', 'Q1 ?'), tourne('demo-2')])).toBeNull();
    const apres = JSON.parse(readFileSync(note(racine), 'utf8')) as Record<string, unknown>;
    expect(apres).not.toHaveProperty('etat');
    expect(apres.questions).toEqual(lue.questions);
  });

  it('an older note that holds a state and no question blocks a question that waits', async () => {
    const racine = depot();
    writeFileSync(note(racine), `${JSON.stringify({ questions: [], etat: 'sans-attente:x' })}\n`);
    expect(await arreter(racine, [arrete('demo-1', 'Q1 ?')])).toContain('demo-1');
  });
});

describe('the stop passes', () => {
  it('when no circuit waits nor runs', async () => {
    expect(await arreter(depot(), [circuitLu('demo-6', { code: 0, arret: 'arrete' })])).toBeNull();
  });

  it('when the circuits do not read', async () => {
    const raison = await attenteALArret(depot(), {
      env: {},
      fermes: () => new Set<string>(),
      circuitsDe: () => Promise.reject(new Error('UNAVAILABLE')),
    });
    expect(raison).toBeNull();
  });

  it('in the session of a role the circuit launches, in the copy of an agent, out of git', async () => {
    const racine = depot();
    const circuits = [arrete('demo-1', 'Q1 ?'), tourne('demo-2')];
    expect(await arreter(racine, circuits, { env: { BEADS_ACTOR: 'testwriter' } })).toBeNull();
    git(racine, 'commit', '-q', '--allow-empty', '-m', 'init');
    const copie = path.join(ESSAIS, 'copie-de-travail');
    expect(git(racine, 'worktree', 'add', '-q', copie, '-b', 'copie').status).toBe(0);
    expect(await arreter(copie, circuits)).toBeNull();
    expect(await arreter(mkdtempSync(path.join(ESSAIS, 'hors-git-')), circuits)).toBeNull();
  });

  it('is one of the subcommands of the frame', () => {
    expect(SOUS_COMMANDES['attente-a-l-arret']).toBe('attente-a-l-arret.mjs');
  });
});
