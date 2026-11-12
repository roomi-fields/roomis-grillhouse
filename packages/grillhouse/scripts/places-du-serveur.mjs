// The places of the machine read and taken on the Temporal server, in a process of its own, so
// that a synchronous caller (scripts/places-de-la-machine.mjs) waits for them as it waits for a
// lock: the workflow of the machine (src/temporal/places/deroule.ts) holds them, its client
// (src/temporal/places/client.ts) speaks to it.
//
//   node places-du-serveur.mjs rang
//   node places-du-serveur.mjs prendre <demande>
//   node places-du-serveur.mjs rendre <id>
//   node places-du-serveur.mjs rattacher <id> <pid> <depart>
//   node places-du-serveur.mjs lire
//
// - Each mode first starts the workflow of the machine when none runs (`demarrerLesPlaces`, on the
//   task queue of the worker of the machine), its spacing GRILLHOUSE_ESPACEMENT_MS
//   (scripts/places-de-la-machine.mjs); it reads its ceiling from the poste itself.
// - `rang` writes the next rank of arrival of the machine, which a circuit draws at its launch.
// - `prendre` asks for a place for <demande> (JSON: `{ pid, depart, ticket, rang, borneMs,
//   rappelMs }`, the process that holds it), then waits for it: each line it says, at the start of
//   a wait and every <rappelMs>, is one JSON line `{ dire }` on the standard output, then the place
//   given, `{ id, rang }`. At the bound <borneMs>, the request is withdrawn, its line said, exit 75.
// - `rendre` gives the place <id> back (or withdraws its request), `rattacher` names the process
//   that holds it; `lire` writes the places as the board reads them (`{ plafond, faute, prises,
//   attentes }`).
// - Each call waits DELAI_MS for the server, and is played again ESSAIS times when it fails
//   transiently. Still failing, its port open: the server is busy, said on the error stream, exit
//   75. A port refused (no server), another failure, or a client not built: said on the error
//   stream, exit 1. A malformed call, exit 2.
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { A_REPASSER } from './codes-de-sortie.mjs';
import { duree } from './regles-des-places.mjs';

const DIST = path.join(import.meta.dirname, '..', 'dist', 'temporal');
// How long a call waits for the server to answer, each attempt.
const DELAI_MS = 8_000;
// The attempts of a call the server fails transiently, and the pause before the next.
const ESSAIS = 3;
const RECUL_MS = 1_000;

// Whether <x> is a transient failure of the server, which a new attempt may pass: a deadline
// exceeded, or a call cancelled at its deadline (the connection slow to open under load), or the
// server unavailable, as Temporal's clients retry them (gRPC codes 1, 4 and 14).
export const transitoire = x =>
  [1, 4, 14].includes(x?.code ?? x?.cause?.code) ||
  /CANCELLED|DEADLINE_EXCEEDED|UNAVAILABLE/.test(`${x?.message ?? ''} ${x?.cause?.message ?? ''}`);

/**
 * Plays <appel> (an async function), again after a pause growing by <reculMs>, while it fails
 * transiently, at most <essais> times; any other failure, or the last, throws.
 * @template T
 * @param {() => Promise<T>} appel
 * @param {{ essais?: number, reculMs?: number, attendre?: (ms: number) => Promise<void> }} [o]
 * @returns {Promise<T>}
 */
export async function avecReprises(
  appel,
  { essais = ESSAIS, reculMs = RECUL_MS, attendre = ms => new Promise(r => setTimeout(r, ms)) } = {}
) {
  for (let n = 1; ; n++) {
    try {
      return await appel();
    } catch (x) {
      if (n >= essais || !transitoire(x)) {
        throw x;
      }
      await attendre(reculMs * n);
    }
  }
}
/**
 * Whether something listens on <adresse> (`hote:port`): false when the connection is refused (no
 * server), true when it opens or does not answer within <delaiMs> (a server busy).
 * @param {string} adresse
 * @param {number} [delaiMs]
 * @returns {Promise<boolean>}
 */
export function ecoute(adresse, delaiMs = 2_000) {
  const deux = adresse.lastIndexOf(':');
  return new Promise(ok => {
    const s = net.connect({ host: adresse.slice(0, deux), port: Number(adresse.slice(deux + 1)) });
    const fin = r => {
      s.destroy();
      ok(r);
    };
    s.once('connect', () => fin(true));
    s.once('error', () => fin(false));
    s.setTimeout(delaiMs, () => fin(true));
  });
}

// How often a wait reads its request again.
const VEILLE_MS = 1_000;

// The spacing of the machine under <env>, as scripts/places-de-la-machine.mjs reads it; the
// workflow's veille, a second. The ceiling, the workflow reads from the poste at each judgement.
const entreeDe = async env => {
  const { espacementDe } = await import('./places-de-la-machine.mjs');
  return { espacementMs: espacementDe(env), veilleMs: 1_000 };
};

const MODES = { rang: 0, prendre: 1, rendre: 1, rattacher: 3, lire: 0 };
const ecrire = o => process.stdout.write(`${JSON.stringify(o)}\n`);

// The wait of the request <id> for its place, under the handle <h> of the workflow of the
// machine, its lines said: 0 once given, 75 at the bound <borneMs>, the request withdrawn.
async function attendreLaPlace(c, places, { h, id, rang, borneMs, rappelMs, sous, LA_DEMANDE }) {
  const debut = Date.now();
  let dit = null;
  for (;;) {
    const e = await sous(() => h.query(LA_DEMANDE, id));
    if (e.etat === 'donnee') {
      if (dit !== null) {
        ecrire({ dire: `✓ place prise après ${duree(Date.now() - debut)}.` });
      }
      ecrire({ id, rang });
      return 0;
    }
    if (e.etat === 'inconnue') {
      throw new Error(`la demande de place ${id} n'est plus : retirée, ou son processus a disparu`);
    }
    const t = Date.now();
    if (t - debut >= borneMs) {
      await sous(() => places.rendreLaPlace(c.client, id));
      ecrire({
        dire: `⏱ attente de place bornée à ${duree(borneMs)} (GRILLHOUSE_ATTENTE_MACHINE_MS) : ${e.raison} ; à repasser (code ${A_REPASSER}).`,
      });
      return A_REPASSER;
    }
    if (dit === null) {
      ecrire({ dire: `⏳ attente d'une place : ${e.raison} ; ${duree(borneMs)} au plus.` });
      dit = t;
    } else if (t - dit >= rappelMs) {
      ecrire({ dire: `⏳ attente d'une place depuis ${duree(t - debut)} : ${e.raison}.` });
      dit = t;
    }
    await new Promise(r => setTimeout(r, VEILLE_MS));
  }
}

// The call <mode> with <args>: its exit code.
async function principal(mode, args) {
  if (!Object.hasOwn(MODES, mode ?? '') || args.length !== MODES[mode]) {
    process.stderr.write(
      'usage : places-du-serveur.mjs rang | prendre <demande> | rendre <id> | rattacher <id> <pid> <depart> | lire\n'
    );
    return 2;
  }
  if (!existsSync(path.join(DIST, 'places', 'client.js'))) {
    process.stderr.write(
      `le client Temporal n'est pas construit (${DIST}) : la construction du paquet le pose, \`npm run build --workspace @roomi-fields/grillhouse\`.\n`
    );
    return 1;
  }
  const depuisDist = (...p) => import(pathToFileURL(path.join(DIST, ...p)).href);
  const { ouvrirLeClient } = await depuisDist('client.js');
  const { FILE_DE_LA_MACHINE } = await depuisDist('installation.js');
  const { ID_DES_PLACES, LA_DEMANDE, PRENDRE } = await depuisDist('places', 'contrat.js');
  const places = await depuisDist('places', 'client.js');
  const c = ouvrirLeClient();
  // Each attempt gets its own deadline, counted from its start.
  const sous = f => avecReprises(() => c.client.connection.withDeadline(Date.now() + DELAI_MS, f));
  try {
    try {
      await sous(async () =>
        places.demarrerLesPlaces(c.client, await entreeDe(process.env), {
          file: FILE_DE_LA_MACHINE,
        })
      );
    } catch (x) {
      if (x?.name !== 'WorkflowExecutionAlreadyStartedError') {
        throw x;
      }
    }
    if (mode === 'rang') {
      ecrire(await sous(() => places.tirerUnRangParTemporal(c.client)));
    } else if (mode === 'rendre') {
      await sous(() => places.rendreLaPlace(c.client, args[0]));
    } else if (mode === 'rattacher') {
      const [id, pid, depart] = args;
      await sous(() =>
        places.rattacherLaPlace(c.client, id, {
          pid: Number(pid),
          depart: depart === 'null' ? null : depart,
        })
      );
    } else if (mode === 'lire') {
      ecrire(await sous(() => places.lireLesPlaces(c.client)));
    } else {
      const { borneMs, rappelMs, ...demande } = JSON.parse(args[0]);
      const h = c.client.workflow.getHandle(ID_DES_PLACES);
      const id = randomUUID();
      const { rang } = await sous(() =>
        h.executeUpdate(PRENDRE, { args: [{ ...demande, id }], updateId: id })
      );
      return await attendreLaPlace(c, places, {
        h,
        id,
        rang,
        borneMs,
        rappelMs,
        sous,
        LA_DEMANDE,
      });
    }
    return 0;
  } catch (x) {
    if (transitoire(x) && (await ecoute(c.adresse))) {
      // Still failing transiently after its attempts, its port open: the server is busy, not
      // absent; the measure is to be played again (75), never a red. A port refused is a server
      // absent, required on the poste, below.
      process.stderr.write(
        `les places de la machine ne répondent pas à temps sur le serveur Temporal (${c.adresse}), ${ESSAIS} essais : ${x?.message ?? x} ; à repasser.\n`
      );
      return A_REPASSER;
    }
    process.stderr.write(
      `les places de la machine ne se lisent pas sur le serveur Temporal (${c.adresse}) : ${x?.message ?? x}${x?.cause?.message ? ` (${x.cause.message})` : ''} ; le serveur est requis sur le poste (\`npx grillhouse temporal installer\`).\n`
    );
    return 1;
  } finally {
    await c.fermer();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [mode, ...args] = process.argv.slice(2);
  principal(mode, args).then(
    code => {
      process.exitCode = code;
    },
    x => {
      process.stderr.write(`${x?.stack ?? x}\n`);
      process.exitCode = 1;
    }
  );
}
