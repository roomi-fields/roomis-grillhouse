// One act of the circuit (scripts/faits-du-circuit.mjs), which the activities of the workflow of a
// ticket (./circuit/activites.ts) and of the queue of a project (./file/activites.ts) play, in a
// process of its own, in the main tree of the repository, as
// a CI runner plays each job in a child process. While the act plays, the activity sends a
// heartbeat every few seconds, the last sign of life of its session among its details; an attempt
// played again after its worker died hands that sign to its session (`precedent`), which waits
// for the group the dead attempt left before it launches its own (scripts/seances.mjs `lancer`),
// and kills the group of the dead attempt first, its leader gone or not (`finirLaTentativeMorte`).
// Each act receives the key of its activity (`cle`, `cleDeLActivite`), the same for each of its
// attempts, under which the act `effet` writes its effect once, the attempt of its activity
// (`essai`, 1 for the first), which says whether Temporal plays it again, and whether it is its
// last (`derniere`), past which Temporal tries it no more. The act leads a process group of its own, with
// the commands it runs (a rebase, a verification), as a session does (scripts/seances.mjs
// `jouerLeGroupe`). A cancellation (the supervisor's `--arreter`, a timeout of the activity) sends
// SIGTERM to its group, which ends its session, its group killed, then SIGKILL 10 s later; the
// activity fails once the whole group is gone, so that no command of the act outlives it. An act
// that fails is an error of the activity that is not tried again (`ApplicationFailure`, its
// message and its stack).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Context } from '@temporalio/activity';
import { ApplicationFailure } from '@temporalio/common';
import { departDe, groupeVivant, signalerGroupe } from '../../scripts/mesure-de-la-machine.mjs';

// The program of the acts: the circuit's, or a machine of trial's (GRILLHOUSE_ACTE_DU_CIRCUIT).
const ACTE =
  process.env.GRILLHOUSE_ACTE_DU_CIRCUIT ??
  fileURLToPath(new URL('../../scripts/faits-du-circuit.mjs', import.meta.url));
// How often an act in progress sends its heartbeat.
const BATTEMENT_MS = 5_000;
// How long a cancelled act's group has after SIGTERM, before SIGKILL: beyond the 5 s the act gives
// its session's group (scripts/seances.mjs), so that the act kills that group first.
const GRACE_MS = 10_000;

/** The details of a heartbeat: the process of the act, the last sign of life of its session. */
interface Battement {
  processus: { pid: number; depart: string | null } | null;
  vie: unknown;
}

/**
 * The group of the process <mort> of a dead attempt ended (SIGKILL) before the attempt played
 * again plays, its leader gone or not (`groupeVivant`: a command of the dead act still running in
 * its group); nothing without one.
 */
export function finirLaTentativeMorte(
  mort: { pid: number; depart: string | null } | null | undefined
) {
  if (groupeVivant(mort)) {
    signalerGroupe(mort!.pid, 'SIGKILL');
  }
}

/**
 * The key of the activity whose information is <info>: its workflow, its run and its activity id,
 * the same for each of its attempts, as Temporal recommends an idempotency key (the run, because
 * a workflow starts again under a new run, Continue-As-New or a circuit launched again, its
 * activity ids counted anew); null out of a workflow.
 */
export function cleDeLActivite(info: {
  workflowExecution?: { workflowId: string; runId: string } | null;
  activityId: string;
}): string | null {
  const d = info.workflowExecution;
  return d ? `${d.workflowId}:${d.runId}:${info.activityId}` : null;
}

/** Plays the act <acte> on <entree> in the main tree <racine>: its outcome. */
export async function jouer<T>(acte: string, entree: object, racine: string): Promise<T> {
  const contexte = Context.current();
  const avant = (contexte.info.heartbeatDetails as Battement | undefined) ?? null;
  // The group of a dead attempt ends before this one plays; its session's group stays, which
  // the session of this attempt waits for.
  finirLaTentativeMorte(avant?.processus);
  const precedent = avant?.vie ?? null;
  const cle = cleDeLActivite(contexte.info);
  const enfant = spawn(process.execPath, [ACTE, acte], {
    cwd: racine,
    stdio: ['pipe', 'pipe', 'inherit'],
    env: process.env,
    detached: true,
  });
  const moi = { pid: enfant.pid!, depart: departDe(enfant.pid!) };
  let vie: unknown = precedent;
  let resultat: { genre: string; valeur: unknown } | null = null;
  let reste = '';
  enfant.stdout.on('data', (d: Buffer) => {
    reste += d.toString();
    const lignes = reste.split('\n');
    reste = lignes.pop() ?? '';
    for (const l of lignes) {
      const m = /^(vie|resultat|erreur) (.*)$/.exec(l);
      if (!m) {
        continue;
      }
      const valeur: unknown = JSON.parse(m[2]!);
      if (m[1] === 'vie') {
        // The end of a launch (null) keeps the group it named: what remains of it may run.
        if (valeur !== null) {
          vie = valeur;
        }
        contexte.heartbeat({ processus: moi, vie } satisfies Battement);
      } else {
        resultat = { genre: m[1]!, valeur };
      }
    }
  });
  // An act dead before it reads its input says so by its exit, which the close gives.
  enfant.stdin.on('error', () => {});
  // Its last attempt: the one past which Temporal tries it no more (none under an unbounded policy,
  // 0 or absent, as Temporal's default).
  const tentatives = contexte.info.retryPolicy?.maximumAttempts ?? 0;
  const derniere = tentatives > 0 && contexte.info.attempt >= tentatives;
  enfant.stdin.end(
    JSON.stringify({ ...entree, precedent, cle, essai: contexte.info.attempt, derniere })
  );
  contexte.heartbeat({ processus: moi, vie } satisfies Battement);
  const battre = setInterval(
    () => contexte.heartbeat({ processus: moi, vie } satisfies Battement),
    BATTEMENT_MS
  );
  let tuer: NodeJS.Timeout | null = null;
  const annuler = () => {
    signalerGroupe(moi.pid, 'SIGTERM');
    tuer = setTimeout(() => signalerGroupe(moi.pid, 'SIGKILL'), GRACE_MS);
  };
  contexte.cancellationSignal.addEventListener('abort', annuler);
  try {
    const code = await new Promise<number | null>(ok => enfant.on('close', c => ok(c)));
    const r = resultat as { genre: string; valeur: unknown } | null;
    if (contexte.cancellationSignal.aborted) {
      // What remains of the group ends before the activity fails.
      while (signalerGroupe(moi.pid, 0)) {
        await new Promise(ok => setTimeout(ok, 200));
      }
      throw ApplicationFailure.nonRetryable(`acte ${acte} annulé`, 'Annule');
    }
    if (r?.genre === 'resultat') {
      return r.valeur as T;
    }
    const e = (r?.valeur ?? {}) as { message?: string; pile?: string; reessayable?: boolean };
    // An effect not written before its last attempt: Temporal tries it again (its policy).
    if (e.reessayable) {
      throw ApplicationFailure.retryable(
        e.message ?? `acte ${acte} sans résultat`,
        'EffetNonEcrit',
        {
          message: e.message ?? null,
          pile: e.pile ?? null,
        }
      );
    }
    throw ApplicationFailure.nonRetryable(
      e.message ?? `acte ${acte} sorti (${code}) sans résultat`,
      'Inattendu',
      { message: e.message ?? null, pile: e.pile ?? null }
    );
  } finally {
    if (tuer) {
      clearTimeout(tuer);
    }
    clearInterval(battre);
    contexte.cancellationSignal.removeEventListener('abort', annuler);
  }
}
