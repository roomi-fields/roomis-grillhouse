#!/usr/bin/env node
// The subcommand `grillhouse circuit`, the client of the workflow of a ticket (./client.ts), as
// `gh run` speaks to a CI it does not run:
//
//   grillhouse circuit <ticket>                                          puts it in the queue
//   grillhouse circuit <ticket> --reprendre [--contexte <texte>]
//   grillhouse circuit <ticket> --depuis <testwriter|developpeur> --contexte <texte>
//   grillhouse circuit <ticket> --etendre <paquet>[,<paquet>…] [--contexte <texte>]
//   grillhouse circuit <ticket> --mecanique [<commande>] --contexte <raison>
//   grillhouse circuit <ticket> --arreter [--contexte <motif>]
//   grillhouse circuit <ticket> --recommencer
//
// - The repository is the main tree of the working directory (git's common directory), as the
//   worker of the project runs there; the server, TEMPORAL_ADDRESS or the account's.
// - Alone, the ticket goes in the queue of the tickets of the project (../tickets/), which starts
//   its circuit once its dependencies are closed and a place of the setting is free: the label
//   `circuit` is added (`bd update --add-label circuit`), and the queue is started when none runs.
//   A ticket the circuit could not run is refused before, by its name (scripts/depart-du-ticket.mjs:
//   unreadable, without its section « ## Architecture », a title that names no component, or a
//   component the repository does not hold); so is a ticket whose circuit runs (`--arreter` stops
//   it), and one stopped on the supervisor's word (`--reprendre`, `--depuis` or `--recommencer`
//   reopens it).
// - `--mecanique` answers the stop of the testwriter that finds no behaviour to test: the ticket
//   goes the short circuit on the same plan, to 1.1 with a command, to the developpeur without one
//   (its `--contexte`, the reason, is required); refused (exit 2) out of that stop or when the ticket
//   is already mechanical.
// - `--reprendre`, `--depuis` and `--etendre` answer the stop of the circuit (the updates of its
//   workflow, or a new workflow on the state a stopped one gave back), `--arreter` stops it (its
//   signal); a package of `--etendre` the repository does not hold is refused before, by its name; `--contexte` gives the supervisor's text to each, and `--depuis` requires it.
// - `--recommencer` starts a stopped circuit over, resetting its copy, not Temporal: its copy (with
//   any work it carries), its sheets and its journal are removed, then the ticket goes in the queue
//   and its circuit starts from the testwriter in a fresh copy; the ticket, its plan and its
//   comments stay. The finished workflow stays on the server, but the queue counts only the live
//   circuits and no more holds the ticket back (grillhouse-d0t). A circuit that runs is refused; it
//   goes alone (./appel.ts).
// - Each writes one line on the standard output, exit 0. A malformed call writes the usage, a
//   refusal (`ReponseRefusee`, the ticket refused) its reason, on the error stream, exit 2. A
//   server that does not answer, or Beads that fails, is said on the error stream, exit 1.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ticketAuLancement } from '../../../scripts/depart-du-ticket.mjs';
import { retirerLaCopieDuTicket } from '../../../scripts/recommencer.mjs';
import { heureDuReport } from '../../../scripts/reponses-du-circuit.mjs';
import { sansReponseEn } from '../../../scripts/sans-reponse.mjs';
import {
  DELAI_JOIGNABLE_MS,
  adresseDuServeur,
  ouvrirLeClient,
  serveurJoignable,
} from '../client.js';
import { USAGE, Usage, lireLAppel, type Appel } from './appel.js';
import {
  arreterLeCircuit,
  basculerEnMecanique,
  etendreLeCircuit,
  recommencerLeCircuit,
  reprendreDepuis,
  reprendreLeCircuit,
  ReponseRefusee,
  aLaPorte,
  bd,
  mettreEnFile,
  seanceDuSuperviseur,
} from './client.js';

// The main tree of the repository of the working directory, from git's common directory.
function arbrePrincipal(): string {
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`le dépôt ne se lit pas (git rev-parse) : ${r.stderr.trim()}`);
  }
  return path.dirname(r.stdout.trim());
}

// The answer <appel> to the circuit of its ticket in <racine>: its line.
async function repondre(
  client: Parameters<typeof reprendreLeCircuit>[0],
  racine: string,
  appel: Appel
): Promise<string> {
  const { ticket, contexte } = appel;
  if (appel.reporter) {
    // The ticket deferred, its circuit left waiting on its question: the wait, the stop and the
    // opening keep it quiet until the hour (scripts/superviseur.mjs `horsAttente`).
    const { defer, quand } = heureDuReport(appel.reporter, new Date());
    bd(racine, 'update', ticket, '--defer', defer);
    bd(
      racine,
      'comments',
      'add',
      ticket,
      `Question reportée ${quand}${contexte ? ` : ${contexte}` : ''} ; le circuit reste en attente, sa question remonte à l'heure.`
    );
    return `▶ Circuit de ${ticket} : sa question est reportée ${quand} ; le circuit reste en attente, sa question remonte à l'heure.`;
  }
  if (appel.arreter) {
    await arreterLeCircuit(client, racine, ticket, contexte);
    return `▶ Circuit de ${ticket} : l'arrêt est demandé ; il s'arrête, sa séance avec lui.`;
  }
  if (appel.etendre) {
    // A package the repository does not hold is refused at the door, by its name, as a component of
    // the title is at the launch.
    const { resoudre } = aLaPorte(() => ticketAuLancement(racine, ticket, { arreter: true }));
    aLaPorte(() => appel.etendre!.forEach(resoudre));
  }
  // An answer lifts a deferral of the question.
  bd(racine, 'update', ticket, '--defer', '');
  const ou = { superviseur: seanceDuSuperviseur() };
  const dit = appel.depuis
    ? await reprendreDepuis(client, racine, ticket, appel.depuis, contexte, ou)
    : appel.etendre
      ? await etendreLeCircuit(client, racine, ticket, appel.etendre, contexte, ou)
      : appel.mecanique
        ? await basculerEnMecanique(client, racine, ticket, appel.mecanique.commande, contexte, ou)
        : await reprendreLeCircuit(client, racine, ticket, contexte, ou);
  return `▶ Circuit de ${ticket} : ${dit}.`;
}

async function principal(argv: string[]): Promise<number> {
  let appel: Appel;
  try {
    appel = lireLAppel(argv);
  } catch (x) {
    if (x instanceof Usage) {
      process.stderr.write(`${USAGE}⛔ ${x.message}\n`);
      return 2;
    }
    throw x;
  }
  const adresse = adresseDuServeur();
  if (!(await serveurJoignable(adresse))) {
    process.stderr.write(
      `⛔ ${sansReponseEn(DELAI_JOIGNABLE_MS)} sur ${adresse} : \`npx grillhouse temporal etat\` dit l'état du service.\n`
    );
    return 1;
  }
  const racine = arbrePrincipal();
  const c = ouvrirLeClient();
  try {
    const repond =
      appel.reprendre ||
      appel.depuis ||
      appel.etendre ||
      appel.mecanique ||
      appel.arreter ||
      appel.reporter;
    let ligne: string;
    if (appel.recommencer) {
      const retiree = await recommencerLeCircuit(
        c.client,
        racine,
        appel.ticket,
        retirerLaCopieDuTicket
      );
      ligne = `${retiree} ; ${await mettreEnFile(c.client, racine, appel.ticket, true)}`;
    } else {
      ligne = repond
        ? await repondre(c.client, racine, appel)
        : await mettreEnFile(c.client, racine, appel.ticket);
    }
    process.stdout.write(`${ligne}\n`);
    return 0;
  } catch (x) {
    if (x instanceof ReponseRefusee) {
      process.stderr.write(`⛔ ${x.message}\n`);
      return 2;
    }
    throw x;
  } finally {
    await c.fermer();
  }
}

// The message of <e> and of each of its causes, as Temporal wraps a failure in its own.
const raisons = (e: unknown): string =>
  e instanceof Error
    ? [e.message, ...(e.cause === undefined ? [] : [raisons(e.cause)])].join(' : ')
    : String(e);

principal(process.argv.slice(2)).then(
  code => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`⛔ grillhouse circuit : ${raisons(e)}\n`);
    process.exitCode = 1;
  }
);
