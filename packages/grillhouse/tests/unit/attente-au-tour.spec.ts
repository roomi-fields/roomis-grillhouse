// The signal of the supervisor's turn (scripts/attente-au-tour.mjs, the subcommand
// `attente-au-tour` that the hook UserPromptSubmit of the mod runs): at each turn of a session of
// supervision, it names each circuit that waits for the supervisor (its ticket, its question, the
// command that answers it, and the wait to launch again), a circuit ended without its issue
// included; it says nothing more while a wait lives in the background (its lock names a live
// process), nor when no circuit waits, nor out of a session of supervision (a role agent's
// session, an agent's copy, out of git). A lock whose process is dead counts as no wait.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SOUS_COMMANDES } from '../../scripts/sous-commandes.mjs';
import { circuitLu } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'attente-au-tour-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const aucun = () => new Set<string>();
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
const VERROU = (racine: string) =>
  path.join(racine, '.claude', 'worktrees', 'attente-des-questions.lock');

// A pid no process holds: above the largest pid of Linux (2^22), so none ever lived under it.
const pidMort = () => 2 ** 31 - 2;

const arrete = (ticket: string, question = 'Quel paquet lève ce rouge ?') =>
  circuitLu(ticket, {
    etape: 'controles',
    code: 14,
    arret: 'controles',
    question,
    qui: 'superviseur',
  });
const sansIssue = (ticket: string) =>
  circuitLu(ticket, {
    etape: 'preuve',
    interrompu: true,
    sansIssue: true,
    question: 'Le déroulé du circuit a fini sans son issue (TERMINATED), aucun arrêt écrit.',
    qui: 'superviseur',
    reponse: `npx grillhouse circuit ${ticket} --reprendre\` ou \`--depuis <testwriter|developpeur> --contexte <texte>`,
  });

// The module is loaded at the call, so that a missing one fails each test, not the file's loading.
const dire = async (
  racine: string,
  circuits: ReturnType<typeof circuitLu>[],
  options: { env?: Record<string, string | undefined>; fermes?: () => Set<string> } = {}
): Promise<string> => {
  const { attenteAuTour } = (await import('../../scripts/attente-au-tour.mjs')) as {
    attenteAuTour: (
      dossier: string,
      options: {
        env: Record<string, string | undefined>;
        fermes: () => Set<string>;
        circuitsDe: () => Promise<unknown[]>;
      }
    ) => Promise<string>;
  };
  return attenteAuTour(racine, {
    env: options.env ?? {},
    fermes: options.fermes ?? aucun,
    circuitsDe: () => Promise.resolve(circuits),
  });
};

describe('the signal of the supervisor turn', () => {
  it('names each circuit that waits: its ticket, its question, the command that answers it, and the wait to launch again', async () => {
    const racine = depot();
    const texte = await dire(racine, [
      arrete('demo-1'),
      arrete('demo-2', 'Quel nom pour ce paquet ?'),
    ]);
    expect(texte).toContain('demo-1');
    expect(texte).toContain('Quel paquet lève ce rouge ?');
    expect(texte).toContain('`npx grillhouse circuit demo-1 --reprendre`');
    expect(texte).toContain('demo-2');
    expect(texte).toContain('Quel nom pour ce paquet ?');
    expect(texte).toContain('`npx grillhouse circuit demo-2 --reprendre`');
    expect(texte).toContain('`npx grillhouse superviseur --attendre`');
  });

  it('names a circuit ended without its issue with the command that resumes it', async () => {
    const texte = await dire(depot(), [sansIssue('demo-3')]);
    expect(texte).toContain('demo-3');
    expect(texte).toContain('npx grillhouse circuit demo-3 --reprendre');
    expect(texte).toContain('--depuis <testwriter|developpeur> --contexte <texte>');
  });

  it('names again, at each turn, a question already gone up to the wait', async () => {
    const racine = depot();
    writeFileSync(
      path.join(racine, '.claude', 'worktrees', 'questions-remontees.json'),
      `${JSON.stringify({ remontees: ['demo-1:run-demo-1:0:controles'] })}\n`
    );
    const circuits = [arrete('demo-1')];
    expect(await dire(racine, circuits)).toContain('demo-1');
    expect(await dire(racine, circuits)).toContain('demo-1');
  });

  it('names no circuit that runs, that the supervisor stopped, or whose ticket is closed', async () => {
    const texte = await dire(
      depot(),
      [
        circuitLu('demo-5', { etape: 'developpeur', vivant: true }),
        circuitLu('demo-6', { code: 0, arret: 'arrete' }),
        arrete('demo-7'),
        arrete('demo-8'),
      ],
      { fermes: () => new Set(['demo-7']) }
    );
    expect(texte).toContain('demo-8');
    for (const t of ['demo-5', 'demo-6', 'demo-7']) {
      expect(texte, t).not.toContain(t);
    }
  });

  it('says nothing when no circuit waits', async () => {
    const racine = depot();
    expect(await dire(racine, [])).toBe('');
    expect(await dire(racine, [circuitLu('demo-5', { vivant: true })])).toBe('');
  });

  it('says nothing more while a wait lives: its lock names a live process', async () => {
    const racine = depot();
    writeFileSync(VERROU(racine), `${process.pid}:marque`);
    expect(await dire(racine, [arrete('demo-1'), sansIssue('demo-2')])).toBe('');
  });

  it('a lock whose process is dead counts as no wait: the signal is given all the same', async () => {
    const racine = depot();
    writeFileSync(VERROU(racine), `${pidMort()}:marque`);
    const texte = await dire(racine, [arrete('demo-1')]);
    expect(texte).toContain('demo-1');
    expect(texte).toContain('`npx grillhouse superviseur --attendre`');
  });

  it('says nothing in the session of a role the circuit launches', async () => {
    const racine = depot();
    expect(await dire(racine, [arrete('demo-1')], { env: { BEADS_ACTOR: 'testwriter' } })).toBe('');
  });

  it('says nothing in the copy of an agent (a worktree), nor out of a git repository', async () => {
    const racine = depot();
    git(racine, 'commit', '-q', '--allow-empty', '-m', 'init');
    const copie = path.join(ESSAIS, 'copie-de-travail');
    expect(git(racine, 'worktree', 'add', '-q', copie, '-b', 'copie').status).toBe(0);
    expect(await dire(copie, [arrete('demo-1')])).toBe('');
    const horsGit = mkdtempSync(path.join(ESSAIS, 'hors-git-'));
    expect(await dire(horsGit, [arrete('demo-1')])).toBe('');
  });

  it('is one of the subcommands of the frame', () => {
    expect(Object.keys(SOUS_COMMANDES)).toContain('attente-au-tour');
    expect(SOUS_COMMANDES['attente-au-tour']).toBe('attente-au-tour.mjs');
  });
});
