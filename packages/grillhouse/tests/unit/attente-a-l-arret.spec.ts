// The stop of the session of supervision (scripts/attente-a-l-arret.mjs, the subcommand
// `attente-a-l-arret` that the hook Stop of the plugin runs): the session does not go to wait for
// the owner while a circuit waits for its answer, nor while a circuit runs with no wait of the
// questions alive; each question blocks once, each state of the circuits running without a wait
// once. Witness: on 2026-11-11, bf5 stopped on a question at 17:06 and 44b.5.3 soon after; the
// supervisor read them 40 min later, on the owner's word (grillhouse-d4n.9).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
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

// The stop of the session in <dossier>, the circuits <circuits> read, a wait alive or not.
const arreter = (
  dossier: string,
  circuits: Circuit[],
  { attente = false, env = {} as Record<string, string | undefined> } = {}
) =>
  attenteALArret(dossier, {
    env,
    fermes: () => new Set<string>(),
    circuitsDe: () => Promise.resolve(circuits),
    attenteVit: () => attente,
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
    expect(await arreter(racine, premier, { attente: true })).toContain('demo-1');
    expect(await arreter(racine, premier, { attente: true })).toBeNull();
    const raison = await arreter(racine, [...premier, arrete('demo-2', 'Q2 ?')], {
      attente: true,
    });
    expect(raison).toContain('demo-2');
    expect(raison).not.toContain('demo-1');
  });

  it('the next question of the same circuit blocks again', async () => {
    const racine = depot();
    expect(await arreter(racine, [arrete('demo-1', 'Q1 ?')], { attente: true })).not.toBeNull();
    expect(await arreter(racine, [tourne('demo-1')], { attente: true })).toBeNull();
    expect(await arreter(racine, [arrete('demo-1', 'Q2 ?', 2)], { attente: true })).toContain(
      'Q2 ?'
    );
  });
});

describe('a circuit running with no wait alive holds the stop', () => {
  it('blocks the stop, naming the circuits that run and the wait to launch', async () => {
    const raison = await arreter(depot(), [tourne('demo-1'), tourne('demo-2')]);
    expect(raison).toContain('les circuits demo-1, demo-2 tournent');
    expect(raison).toContain('aucune attente des questions ne vit pour ce dépôt');
    expect(raison).toContain('`npx grillhouse superviseur --attendre`');
    expect(raison).toContain('sans tube');
  });

  it('blocks once per state: the same circuits let the next stop pass, another circuit blocks again', async () => {
    const racine = depot();
    expect(await arreter(racine, [tourne('demo-1')])).toContain('le circuit demo-1 tourne');
    expect(await arreter(racine, [tourne('demo-1')])).toBeNull();
    expect(await arreter(racine, [tourne('demo-1'), tourne('demo-2')])).toContain(
      'les circuits demo-1, demo-2 tournent'
    );
  });

  it('a wait alive lets the stop pass', async () => {
    expect(await arreter(depot(), [tourne('demo-1')], { attente: true })).toBeNull();
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
      attenteVit: () => false,
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
