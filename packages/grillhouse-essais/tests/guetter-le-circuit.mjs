// The watch of the circuit of a ticket on the server of a trial (./circuit-essai.ts), in a process
// of its own, so that a test reads it synchronously while the worker of the trial runs apart:
//
//   node guetter-le-circuit.mjs <cadre> lire <racine> <ticket>
//   node guetter-le-circuit.mjs <cadre> attendre <racine> <ticket> <signe> <ms>
//
// <cadre> is the frame's package (its built client, dist/temporal/); the server, TEMPORAL_ADDRESS.
// - `lire` writes, in JSON, the sign of where the circuit stands (`signe`: its run, the rank of its
//   question, its replays, the step it published, whether it waits) and its state as it wrote it
//   last (`etat`, whole), null for a ticket whose circuit the server does not hold.
// - `attendre` waits, within <ms>, for the circuit to stand elsewhere than <signe> and to stop
//   there: a question awaited (`code` the code of its stop), a « a-repasser » asleep (`code` 75), or
//   its workflow ended (`code` 0, integrated or stopped on the supervisor's word); a workflow that
//   ended without its issue is its `fin`. It writes `{ code, fin, signe, etat, ou, question }`, `ou`
//   the step of the state in words (scripts/etapes.mjs), `question` the one the workflow awaits;
//   past <ms>, it exits 1 with the last sign it read.
// Each call to the server is bounded (`DELAI_MS`) by its gRPC deadline (`withDeadline` of the
// connection): in `lire`, a server or a workflow that does not answer exits 1, the call named;
// in the watch, a call that fails transiently is probed again until <ms>, then exits 1 as any
// watch past its bound, instead of a watch that hangs without a word. Each call ends with its
// deadline, so no retry of it outlives the client closed.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [cadre, mode, racine, ticket, avant, ms] = process.argv.slice(2);
const charger = f => import(pathToFileURL(path.join(cadre, 'dist/temporal', f)).href);
const { ouvrirLeClient } = await charger('client.js');
const { idDuCircuit, L_ETAT } = await charger('circuit/contrat.js');
const { etapeDuCircuit, libelle } = await import(
  pathToFileURL(path.join(cadre, 'scripts/etapes.mjs')).href
);
// The step of the state <e> in words, as the circuit says where it stops (« 1 Plan »).
const ouDansLeCircuit = e => {
  const x = e ? etapeDuCircuit(e) : null;
  return x ? libelle(x) : (e?.etape ?? null);
};

const DELAI_MS = 30_000;
// The gRPC status of a deadline exceeded (DEADLINE_EXCEEDED).
const DELAI_DEPASSE = 4;
// Whether <e>, or one of its causes, is a gRPC call ended by its deadline.
const horsDelai = e => {
  for (let x = e; x instanceof Error; x = x.cause) {
    if (x.code === DELAI_DEPASSE) {
      return true;
    }
  }
  return false;
};
// The gRPC statuses a later call may pass: cancelled (a deadline reached by the client),
// deadline exceeded, unavailable, as Temporal's clients retry them.
const PASSAGERS = new Set([1, 4, 14]);
// Whether <e>, or one of its causes, is a call of the server that failed transiently.
const passager = e => {
  for (let x = e; x instanceof Error; x = x.cause) {
    if (PASSAGERS.has(x.code)) {
      return true;
    }
  }
  return false;
};

const c = ouvrirLeClient();
// The calls <f> makes to the server, named <quoi>, under a deadline DELAI_MS from now: past it,
// an error that names the call.
const borne = async (f, quoi) => {
  try {
    return await c.client.connection.withDeadline(Date.now() + DELAI_MS, f);
  } catch (x) {
    if (horsDelai(x)) {
      throw new Error(`le serveur ne répond pas à ${quoi} en ${DELAI_MS / 1000} s`, { cause: x });
    }
    throw x;
  }
};
const h = c.client.workflow.getHandle(idDuCircuit(racine, ticket));

// The message of <e> and of each of its causes, as Temporal wraps a failure in its own.
const raisons = e =>
  e instanceof Error
    ? [e.message, ...(e.cause === undefined ? [] : [raisons(e.cause)])].join(' : ')
    : String(e);

// Where the circuit stands now: `{ signe, statut, vue, fin }`, null when the server holds none.
async function lire() {
  let d;
  try {
    d = await borne(() => h.describe(), 'la description du déroulé');
  } catch (x) {
    if (x?.name === 'WorkflowNotFoundError') {
      return null;
    }
    throw x;
  }
  const memo = d.memo ?? {};
  const statut = d.status.name;
  const vue =
    statut === 'RUNNING' ? await borne(() => h.query(L_ETAT), "la requête de l'état") : null;
  const fin =
    statut === 'RUNNING'
      ? null
      : await borne(() => h.result(), 'la lecture de la fin').catch(x => ({ echec: raisons(x) }));
  const signe = [
    d.runId,
    memo.numero ?? 0,
    vue?.repasses ?? '',
    memo.etape ?? '',
    vue?.attente ?? false,
    statut,
  ].join(':');
  return { signe, statut, vue, fin, etat: vue?.ecrit ?? fin?.etat ?? null };
}

// The stop where the circuit stands, or null while it runs.
function arret(l) {
  if (l.statut !== 'RUNNING') {
    return { code: l.fin?.echec ? 1 : 0, fin: l.fin };
  }
  if (!l.vue?.attente) {
    return null;
  }
  return l.vue.question ? { code: l.etat?.code ?? 1, fin: null } : { code: 75, fin: null };
}

try {
  if (mode === 'lire') {
    const l = await lire();
    process.stdout.write(JSON.stringify(l ? { signe: l.signe, etat: l.etat } : null));
  } else {
    const limite = Date.now() + Number(ms);
    let l = null;
    for (;;) {
      // A reading the server answers late is a probe missed, not a failure: the watch probes
      // again until its bound, the last reading kept.
      try {
        l = await lire();
      } catch (x) {
        if (!passager(x)) {
          throw x;
        }
      }
      const a = l && l.signe !== avant ? arret(l) : null;
      if (a) {
        process.stdout.write(
          JSON.stringify({
            ...a,
            signe: l.signe,
            etat: l.etat,
            ou: ouDansLeCircuit(l.etat),
            question: l.vue?.question ?? null,
          })
        );
        break;
      }
      if (Date.now() > limite) {
        process.stderr.write(
          `le circuit de ${ticket} ne s'arrête pas en ${ms} ms : ${l?.signe ?? 'aucun déroulé'}\n`
        );
        process.exitCode = 1;
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }
  }
} catch (x) {
  process.stderr.write(`le guet du circuit de ${ticket} échoue : ${raisons(x)}\n`);
  process.exitCode = 1;
} finally {
  // Closing makes no call to the server: every call above has ended, within its deadline.
  await c.fermer();
}
