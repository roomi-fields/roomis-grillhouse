// The queue of a trial's project played on the server of the trial (./integration-essai.ts), in a
// process of its own, so that a test waits for it synchronously while the worker runs apart:
//
//   node jouer-la-file.mjs <cadre> <racine> <file> <journal> <ticket>...
//
// <cadre> is the frame's package (its built client, dist/temporal/); the server, TEMPORAL_ADDRESS.
// It waits for the worker of the trial to poll the task queue <file> (`prêt` in its log
// <journal>), then sends each <ticket> to the queue of the project at <racine>, in their order, as
// the circuit of a ticket enters it at its step 5.2 (the signal ENTRER, the workflow
// `file:<racine>` started on <file> when none runs, its delays of the CI read from
// GRILLHOUSE_CI_RECHERCHE_MS, GRILLHOUSE_CI_ATTENTE_MS and GRILLHOUSE_CI_PAS_MS), and waits for
// the queue to give each its issue, then to stand idle. It writes `{ issues }`, the number of
// issues given since its start; past 10 min, or a queue that fails, it exits 1, the reason named.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [cadre, racine, file, journal, ...tickets] = process.argv.slice(2);
const charger = f => import(pathToFileURL(path.join(cadre, 'dist/temporal', f)).href);
const { ouvrirLeClient } = await charger('client.js');
const { idDeLaFile, ENTRER, ISSUE_DE_LA_FILE, L_ETAT_DE_LA_FILE } =
  await charger('file/contrat.js');

const LIMITE_MS = 600_000;
const dormir = ms => new Promise(r => setTimeout(r, ms));
// A delay of the CI read from <variable>, in ms, or undefined for the workflow's own.
const delai = variable => {
  const v = process.env[variable];
  return v === undefined || v === '' ? undefined : Number(v);
};

const debut = Date.now();
while (!(existsSync(journal) && /^prêt /m.test(readFileSync(journal, 'utf8')))) {
  if (Date.now() - debut > 60_000) {
    process.stderr.write(`le travailleur de l'essai ne sert pas ${file} en 60 s.\n`);
    process.exit(1);
  }
  await dormir(100);
}

const c = ouvrirLeClient();
const id = idDeLaFile(racine);
const h = c.client.workflow.getHandle(id);
// The gRPC status of a workflow the server does not hold: NOT_FOUND.
const NOT_FOUND = 5;
// The issues the queue gave since its start, counted in its history; none for a queue not started
// yet, which the history reading says by `WorkflowNotFoundError` or by a gRPC NOT_FOUND on the
// error or its cause (`fetchHistory` lets the service error through).
const issues = async () => {
  try {
    const { events } = await h.fetchHistory();
    return (events ?? []).filter(
      e =>
        e.signalExternalWorkflowExecutionInitiatedEventAttributes?.signalName === ISSUE_DE_LA_FILE
    ).length;
  } catch (x) {
    if (x?.name === 'WorkflowNotFoundError' || [x, x?.cause].some(e => e?.code === NOT_FOUND)) {
      return 0;
    }
    throw x;
  }
};

try {
  const avant = await issues();
  const ci = {
    rechercheMs: delai('GRILLHOUSE_CI_RECHERCHE_MS'),
    attenteMs: delai('GRILLHOUSE_CI_ATTENTE_MS'),
    pasMs: delai('GRILLHOUSE_CI_PAS_MS'),
  };
  for (const ticket of tickets) {
    await c.client.workflow.signalWithStart('fileDuProjet', {
      workflowId: id,
      taskQueue: file,
      args: [{ racine, ci }],
      signal: ENTRER,
      signalArgs: [{ ticket, branche: `agent/${ticket}`, deroule: `essai-sans-circuit:${ticket}` }],
    });
  }
  for (;;) {
    const d = await h.describe().catch(() => null);
    if (d && d.status.name !== 'RUNNING' && d.status.name !== 'CONTINUED_AS_NEW') {
      process.stderr.write(`la file de l'essai finit en ${d.status.name}.\n`);
      process.exitCode = 1;
      break;
    }
    const n = (await issues()) - avant;
    const vue = d ? await h.query(L_ETAT_DE_LA_FILE) : { enCours: null, attente: [] };
    if (n >= tickets.length && vue.enCours === null && vue.attente.length === 0) {
      process.stdout.write(JSON.stringify({ issues: n }));
      break;
    }
    if (Date.now() - debut > LIMITE_MS) {
      process.stderr.write(
        `la file de l'essai ne rend pas ses issues en ${LIMITE_MS / 60_000} min : ${n} sur ${tickets.length}, ${JSON.stringify(vue)}.\n`
      );
      process.exitCode = 1;
      break;
    }
    await dormir(250);
  }
} finally {
  await c.fermer();
}
