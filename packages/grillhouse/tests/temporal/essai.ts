// The trial helpers of the tests of src/temporal/ (grillhouse-4nr.2): trial folders under the
// temporary directory of the run, the pinned program `temporal` that the variable TEMPORAL names
// (`grillhouse.outils` of the root package.json), a development server of trial started on a free
// port and a database file of its own, and the sonde's worker started as its own process, by the
// built code (dist/temporal/travailleur.js), as the units of the account start it; a server
// stopped while workflows run on it is stopped once they are at rest (`attendreLeRepos`).
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Connection, type Client } from '@temporalio/client';
import { afterAll } from 'vitest';
import { ouvrirLeClient, rendreCourante } from '../../src/temporal/client.js';
import { EPINGLE } from '../../src/temporal/installation.js';
import { apresUnRefus } from './port-d-essai.js';
import { estAuRepos } from './repos-d-essai.js';

export const PAQUET = path.resolve(__dirname, '../..');
const TRAVAILLEUR = path.join(PAQUET, 'dist/temporal/travailleur.js');
export const COMMANDE = path.join(PAQUET, 'bin/grillhouse.mjs');

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'temporal-'));
const enfants = new Set<ChildProcess>();
afterAll(() => {
  for (const e of enfants) {
    e.kill('SIGKILL');
  }
  rmSync(ESSAIS, { recursive: true, force: true });
});

let n = 0;
/** A new trial folder under the run's temporary directory, removed after the file's tests. */
export function dossier(nom: string): string {
  const d = path.join(ESSAIS, `${nom}-${++n}`);
  mkdirSync(d, { recursive: true });
  return d;
}

/**
 * The pinned program `temporal`: the variable TEMPORAL when it names an existing program, else the
 * pinned program already laid down under ~/.cache/grillhouse/temporal/<version>/temporal, else a
 * failure naming the variable and the command that lays it down; never skipped.
 */
export function programmeTemporal(): string {
  const p = process.env.TEMPORAL;
  if (p && existsSync(p)) {
    return p;
  }
  const maison = process.env.HOME || homedir();
  const pose = path.join(maison, '.cache/grillhouse/temporal', EPINGLE.version, 'temporal');
  if (existsSync(pose)) {
    return pose;
  }
  throw new Error(
    `La variable TEMPORAL ne nomme pas le programme temporal (${p ?? 'absente'}) : ` +
      'posez-le par `npx grillhouse temporal installer --programme-seul`.'
  );
}

/** A free TCP port of the loopback. */
export async function portLibre(): Promise<number> {
  return new Promise((ok, ko) => {
    const s = createServer();
    s.once('error', ko);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      s.close(() => (typeof a === 'object' && a ? ok(a.port) : ko(new Error('aucun port'))));
    });
  });
}

// Waits for the line <motif> on the standard output of <enfant>, within <delai> ms.
function attendreLaLigne(enfant: ChildProcess, motif: RegExp, delai: number, quoi: string) {
  return new Promise<void>((ok, ko) => {
    const lignes: string[] = [];
    const minuteur = setTimeout(
      () => ko(new Error(`${quoi} : pas de ligne ${motif} en ${delai} ms :\n${lignes.join('\n')}`)),
      delai
    );
    createInterface({ input: enfant.stdout! }).on('line', l => {
      lignes.push(l);
      if (motif.test(l)) {
        clearTimeout(minuteur);
        ok();
      }
    });
    enfant.once('exit', c => {
      clearTimeout(minuteur);
      ko(new Error(`${quoi} sorti (${c}) avant ${motif} :\n${lignes.join('\n')}`));
    });
  });
}

export interface ServeurDEssai {
  adresse: string;
  base: string;
  /** Kills the server with SIGKILL and waits for its end. */
  tuer(): Promise<void>;
}

// The line of temporal's frontend whose port another process holds.
const PORT_REFUSE = /address already in use/;
// The time a server whose port is refused takes to say so and exit, once another server answers
// on that port. A fixed wait, and so a limit: a server slower than it to say its refusal would
// still be taken for the one that answers.
const VERDICT_MS = 500;

// The server of this start did not get its port.
class PortRefuse extends Error {}

// The port each base of this file is served on: a restart on a base keeps it.
const portsDesBases = new Map<string, number>();

/**
 * Starts the development server of the program <programme> on the port <port> of the loopback,
 * its state in the database file <base>, the search attributes of the frame registered, its web
 * interface off; resolves once it answers (`attendreLaReponse`), not once its port opens.
 *
 * A free port is read then released (`portLibre`), and bound later by the server: another process
 * of the machine may take it between the two. What follows a refused port is `apresUnRefus`
 * (./port-d-essai.ts): a first start takes another free port, and `adresse` names the port it
 * got; a restart on a base this file already served keeps the port of that base, where its
 * clients are, whatever <port> says, and tries it again after <pauseMs>; <essais> starts in all.
 */
export async function demarrerLeServeur(
  programme: string,
  base: string,
  port: number,
  attributs: Record<string, string>,
  { essais = 5, pauseMs = 1000 }: { essais?: number; pauseMs?: number } = {}
): Promise<ServeurDEssai> {
  const servie = portsDesBases.has(base);
  let p = portsDesBases.get(base) ?? port;
  for (let essai = 1; ; essai++) {
    try {
      const s = await lancerLeServeur(programme, base, p, attributs);
      portsDesBases.set(base, p);
      return s;
    } catch (e) {
      const suite = e instanceof PortRefuse ? apresUnRefus({ servie, essai, essais }) : 'echec';
      if (suite === 'echec') {
        throw e;
      }
      if (suite === 'meme-port') {
        await new Promise(r => setTimeout(r, pauseMs));
      } else {
        p = await portLibre();
      }
    }
  }
}

// One start of the server on <port>: the server once it answers, or `PortRefuse`.
async function lancerLeServeur(
  programme: string,
  base: string,
  port: number,
  attributs: Record<string, string>
): Promise<ServeurDEssai> {
  const args = ['server', 'start-dev', '--headless', '--ip', '127.0.0.1', '--port', String(port)];
  args.push('--db-filename', base, '--log-level', 'warn');
  for (const [k, t] of Object.entries(attributs)) {
    args.push('--search-attribute', `${k}=${t}`);
  }
  const enfant = spawn(programme, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  enfants.add(enfant);
  const sortie: string[] = [];
  enfant.stderr.on('data', (d: Buffer) => sortie.push(d.toString()));
  enfant.stdout.on('data', (d: Buffer) => sortie.push(d.toString()));
  const adresse = `127.0.0.1:${port}`;
  try {
    await attendreLaReponse(port, 30_000, () => sortie.join(''), enfant);
  } catch (e) {
    await tuer(enfant);
    enfants.delete(enfant);
    throw e;
  }
  return {
    adresse,
    base,
    tuer: () => tuer(enfant),
  };
}

// The service whose health the frontend reports (grpc.health.v1, as `temporal operator cluster
// health` reads it), and its status SERVING (`ServingStatus` of grpc.health.v1).
const SERVING = 1;
const SERVICE = 'temporal.api.workflowservice.v1.WorkflowService';

// Waits, within <delai> ms, for the server on <port> to answer: its frontend reports itself
// serving, and it describes the namespace `default` that start-dev registers. A port that accepts
// a connection is not enough: the frontend refuses each call until it is healthy (« Frontend is
// not healthy yet »). The server that answers must be <enfant>: one whose port another server
// holds says so and exits (`PortRefuse`), and an answer on the port is taken only once <enfant>,
// given the time to say it, still runs and has not said it.
async function attendreLaReponse(
  port: number,
  delai: number,
  journal: () => string,
  enfant: ChildProcess
) {
  const fin = Date.now() + delai;
  const refuse = () => PORT_REFUSE.test(journal());
  const sorti = () => enfant.exitCode !== null || enfant.signalCode !== null;
  const juger = () => {
    if (refuse()) {
      throw new PortRefuse(`port ${port} refusé au serveur :\n${journal()}`);
    }
    if (sorti()) {
      throw new Error(`serveur sorti (${enfant.exitCode}) :\n${journal()}`);
    }
  };
  for (;;) {
    juger();
    if (await repond(port)) {
      await new Promise(r => setTimeout(r, VERDICT_MS));
      juger();
      return;
    }
    if (Date.now() > fin) {
      throw new Error(`serveur muet sur ${port} :\n${journal()}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

// Whether the server on <port> answers within 2 s (see `attendreLaReponse`).
async function repond(port: number): Promise<boolean> {
  const c = await Connection.connect({
    address: `127.0.0.1:${port}`,
    connectTimeout: 2000,
  }).catch(() => null);
  if (!c) {
    return false;
  }
  try {
    return await c.withDeadline(Date.now() + 2000, async () => {
      const sante = await c.healthService.check({ service: SERVICE });
      if (Number(sante.status) !== SERVING) {
        return false;
      }
      await c.workflowService.describeNamespace({ namespace: 'default' });
      return true;
    });
  } catch {
    return false;
  } finally {
    await c.close();
  }
}

// Kills <enfant> with SIGKILL and waits for its end.
function tuer(enfant: ChildProcess): Promise<void> {
  if (enfant.exitCode !== null || enfant.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise(ok => {
    enfant.once('exit', () => ok());
    enfant.kill('SIGKILL');
  });
}

export interface TravailleurDEssai {
  pid: number;
  tuer(): Promise<void>;
}

/**
 * Starts the sonde's worker (dist/temporal/travailleur.js) on the task queue <file> of the server
 * at <adresse>, as its own process; resolves once it says it is ready and its version, that of the
 * package, is the current one of the deployment of <file> (`rendreCourante`).
 */
export async function demarrerLeTravailleur(
  adresse: string,
  file: string,
  env: Record<string, string> = {}
): Promise<TravailleurDEssai> {
  const enfant = spawn(process.execPath, [TRAVAILLEUR, '--file', file], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, ...env, TEMPORAL_ADDRESS: adresse },
  });
  enfants.add(enfant);
  await attendreLaLigne(enfant, /^prêt /, 60_000, 'travailleur');
  const { version } = JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')) as {
    version: string;
  };
  const { client, fermer } = ouvrirLeClient({ adresse });
  try {
    await rendreCourante(client, file, version);
  } finally {
    await fermer();
  }
  return { pid: enfant.pid!, tuer: () => tuer(enfant) };
}

/** Polls <lire> every 200 ms until it gives a value, within <delai> ms; fails naming <quoi>. */
export async function attendre<T>(
  quoi: string,
  lire: () => Promise<T | undefined>,
  delai = 30_000
): Promise<T> {
  const fin = Date.now() + delai;
  for (;;) {
    const v = await lire().catch(() => undefined);
    if (v !== undefined) {
      return v;
    }
    if (Date.now() > fin) {
      throw new Error(`${quoi} : rien en ${delai} ms`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

/**
 * Waits, within <delai> ms, for each workflow of <ids> to be at rest on the server of <client>
 * (`estAuRepos`, ./repos-d-essai.ts): a server stopped then loses no task it handed out. The
 * workflows are read in their order, and a workflow read at rest stays so only if nothing wakes it
 * meanwhile: the one a timer wakes comes last, its timer set well beyond the stop.
 */
export async function attendreLeRepos(client: Client, ids: string[], delai = 30_000) {
  await attendre(
    `le repos de ${ids.join(', ')}`,
    async () => {
      for (const id of ids) {
        if (!estAuRepos((await client.workflow.getHandle(id).describe()).raw)) {
          return undefined;
        }
      }
      return true;
    },
    delai
  );
}

/**
 * The acts of a circuit's pause on a trial machine: no copy to measure, a place always there.
 */
export const PAUSE_D_ESSAI = {
  mesurerLaCopieDuTicket: () => Promise.resolve(null),
  reprendreUnePlace: () => Promise.resolve(true),
};
