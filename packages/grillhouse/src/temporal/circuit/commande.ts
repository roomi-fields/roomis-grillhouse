#!/usr/bin/env node
// The subcommand `grillhouse circuit`, the client of the workflow of a ticket (./client.ts), as
// `gh run` speaks to a CI it does not run:
//
//   grillhouse circuit <ticket>                                          puts it in the queue
//   grillhouse circuit <ticket> --reprendre [--contexte <texte>]
//   grillhouse circuit <ticket> --depuis <testwriter|developpeur> --contexte <texte>
//   grillhouse circuit <ticket> --etendre <paquet>[,<paquet>…] [--contexte <texte>]
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
// - `--reprendre`, `--depuis` and `--etendre` answer the stop of the circuit (the updates of its
//   workflow, or a new workflow on the state a stopped one gave back), `--arreter` stops it (its
//   signal); a package of `--etendre` the repository does not hold is refused before, by its name; `--contexte` gives the supervisor's text to each, and `--depuis` requires it.
// - `--recommencer` starts a stopped circuit over, as a reset of Temporal: its copy (with any work
//   it carries), its sheets and its journal are removed, then the ticket goes in the queue and its
//   circuit starts from the testwriter in a fresh copy; the ticket, its plan and its comments stay.
//   A circuit that runs is refused; it goes alone (./appel.ts).
// - Each writes one line on the standard output, exit 0. A malformed call writes the usage, a
//   refusal (`ReponseRefusee`, the ticket refused) its reason, on the error stream, exit 2. A
//   server that does not answer, or Beads that fails, is said on the error stream, exit 1.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { WorkflowNotFoundError } from '@temporalio/client';
import { DepartRefuse, ticketAuLancement } from '../../../scripts/depart-du-ticket.mjs';
import { retirerLaCopieDuTicket } from '../../../scripts/recommencer.mjs';
import { sansReponseEn } from '../../../scripts/sans-reponse.mjs';
import {
  DELAI_JOIGNABLE_MS,
  adresseDuServeur,
  ouvrirLeClient,
  serveurJoignable,
} from '../client.js';
import { fileDuProjet } from '../installation.js';
import { demarrerLesTickets } from '../tickets/client.js';
import { USAGE, Usage, lireLAppel, refusDuLancementApresArret, type Appel } from './appel.js';
import {
  arreterLeCircuit,
  etendreLeCircuit,
  recommencerLeCircuit,
  reprendreDepuis,
  reprendreLeCircuit,
  ReponseRefusee,
} from './client.js';
import { idDuCircuit } from './contrat.js';

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

// bd in the repository at <racine>: its output, or the failure of Beads by its reason.
function bd(racine: string, ...args: string[]): string {
  const r = spawnSync('bd', args, { cwd: racine, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`bd ${args[0]} échoue : ${(r.stderr || r.error?.message || '').trim()}`);
  }
  return r.stdout;
}

// <f>, a reading of the ticket at the door (scripts/depart-du-ticket.mjs), its refusal a refused
// answer, by its reason.
function aLaPorte<T>(f: () => T): T {
  try {
    return f();
  } catch (x) {
    if (x instanceof DepartRefuse) {
      throw new ReponseRefusee(x.message);
    }
    throw x;
  }
}

// The supervisor's session that runs the command (Claude Code's `CLAUDE_CODE_SESSION_ID`), which the
// circuit's stop gone up keeps (`EntreeDuCircuit.superviseur`); null out of a session.
const seanceDuSuperviseur = (): string | null => process.env.CLAUDE_CODE_SESSION_ID || null;

// The ticket <ticket> of <racine> put in the queue of the tickets of the project: its line. With
// <recommence>, its circuit stopped on the supervisor's word was just started over: that stop no
// longer refuses the launch.
async function mettreEnFile(
  client: Parameters<typeof demarrerLesTickets>[0],
  racine: string,
  ticket: string,
  recommence = false
): Promise<string> {
  aLaPorte(() => ticketAuLancement(racine, ticket));
  try {
    const d = await client.workflow.getHandle(idDuCircuit(racine, ticket)).describe();
    if (d.status.name === 'RUNNING') {
      throw new ReponseRefusee(
        `un circuit tourne déjà sur ${ticket} : il mène le ticket à sa fin, \`--arreter\` l'arrête.`
      );
    }
    const fin = (await client.workflow.getHandle(idDuCircuit(racine, ticket)).result()) as {
      raison?: string;
    };
    if (fin?.raison === 'arrete' && !recommence) {
      throw new ReponseRefusee(refusDuLancementApresArret(ticket));
    }
  } catch (x) {
    if (!(x instanceof WorkflowNotFoundError)) {
      throw x;
    }
  }
  bd(racine, 'update', ticket, '--add-label', 'circuit');
  await demarrerLesTickets(client, { racine }, fileDuProjet(racine), seanceDuSuperviseur());
  return `▶ ${ticket} est dans la file des tickets du projet : son circuit part dès que ses dépendances sont fermées et qu'une place du réglage est libre ; sa question réveille l'attente des questions (\`npx grillhouse superviseur --attendre\`), sa fin se lit au panneau.`;
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
    bd(racine, 'update', ticket, '--defer', appel.reporter);
    bd(
      racine,
      'comments',
      'add',
      ticket,
      `Question reportée au ${appel.reporter}${contexte ? ` : ${contexte}` : ''} ; le circuit reste en attente, sa question remonte à l'heure.`
    );
    return `▶ Circuit de ${ticket} : sa question est reportée au ${appel.reporter} ; le circuit reste en attente, sa question remonte à l'heure.`;
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
      appel.reprendre || appel.depuis || appel.etendre || appel.arreter || appel.reporter;
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
