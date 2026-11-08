// The trial harness of the circuits under Temporal (grillhouse-4nr.6, grillhouse-4nr.11), shared by
// tests/circuit.temporal.nuit.spec.ts and tests/repetition.temporal.nuit.spec.ts: on the trial
// repository of ./circuit-essai.ts, a development server of its own (the pinned program TEMPORAL,
// on a free port and a database of its own), which a test may kill and start again on the same
// database and port, and the frame's worker started by its built code, which a test may kill and
// start again. The test speaks to the server by the CLI of Temporal, answers a stop by the frame's
// built client (dist/temporal/circuit/client.js, in a process of its own, as ./cadre.ts has every
// script of the frame), reads the circuits as the board does (scripts/circuits-du-serveur.mjs) and
// keeps the wait of the questions (`superviseur --attendre`) running, as a session of supervision
// does. At its end, green or red, every workflow still running stops, then the worker, then the
// server: nothing outlives the test.
import { spawn, spawnSync, type ChildProcess, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, expect } from 'vitest';
import { CADRE, enProcessus, valeursDe } from './cadre.js';

const TRAVAILLEUR = path.join(CADRE, 'dist/temporal/travailleur.js');
const SUPERVISEUR = path.join(CADRE, 'scripts/superviseur.mjs');
const LECTURE = path.join(CADRE, 'scripts/circuits-du-serveur.mjs');
const CLIENT = path.join(CADRE, 'dist/temporal/client.js');
const CLIENT_DU_CIRCUIT = path.join(CADRE, 'dist/temporal/circuit/client.js');
const CLIENT_DES_TICKETS = path.join(CADRE, 'dist/temporal/tickets/client.js');
const CLIENT_DE_LA_FILE = path.join(CADRE, 'dist/temporal/file/client.js');
// The task queue of the project at <racine>, the one its worker serves and the command starts on
// (src/temporal/installation.ts).
const fileDuProjet = enProcessus<string>('dist/temporal/installation.js', 'fileDuProjet');
// The deadlines of the waits, measured at rest on 2026-11-06: a question goes up within about
// 60 s of the start (5 times as long), a ticket ends within 260 s, 466 s for the longest, the
// server restarted (about 2 times as long); past them, the wait fails with its pieces.
const QUESTION_MS = 300_000;
const FIN_MS = 900_000;
// How long a server started has to answer the CLI.
const SERVEUR_MS = 60_000;

const enfants: ChildProcess[] = [];
afterAll(() => {
  for (const e of enfants) {
    if (e.exitCode === null && e.signalCode === null) {
      e.kill('SIGKILL');
    }
  }
});
// The end of <enfant>, SIGTERM first, SIGKILL past 30 s.
const finirLEnfant = async (enfant: ChildProcess) => {
  if (enfant.exitCode !== null || enfant.signalCode !== null) {
    return;
  }
  const fini = new Promise<void>(ok => enfant.once('exit', () => ok()));
  enfant.kill('SIGTERM');
  const t = setTimeout(() => enfant.kill('SIGKILL'), 30_000);
  await fini;
  clearTimeout(t);
};
export const dormir = (ms: number) => new Promise(r => setTimeout(r, ms));

// The pinned program of Temporal: TEMPORAL when it names an existing program, else the pinned
// program already laid down under ~/.cache/grillhouse/temporal/<version>/temporal, else the test
// fails naming the variable and the command that lays it down.
function programmeTemporal(): string {
  const p = process.env.TEMPORAL;
  if (p && existsSync(p)) {
    return p;
  }
  const version = (
    valeursDe('dist/temporal/installation.js', ['EPINGLE']).EPINGLE as
      { version: string } | undefined
  )?.version;
  const pose = version
    ? path.join(process.env.HOME || homedir(), '.cache/grillhouse/temporal', version, 'temporal')
    : null;
  if (pose && existsSync(pose)) {
    return pose;
  }
  throw new Error(
    `La variable TEMPORAL ne nomme pas le programme temporal (${p ?? 'absente'}) : ` +
      'posez-le par `npx grillhouse temporal installer --programme-seul`.'
  );
}
const temporal = programmeTemporal;
const portLibre = () =>
  new Promise<number>((ok, ko) => {
    const s = createServer();
    s.once('error', ko);
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => ok(port));
    });
  });
// The line <motif> on the output of <enfant>, within <ms> ms.
const attendreLaLigne = (enfant: ChildProcess, motif: RegExp, ms: number) =>
  new Promise<void>((ok, ko) => {
    const t = setTimeout(() => ko(new Error(`rien de ${motif} en ${ms} ms`)), ms);
    let lu = '';
    const lire = (d: Buffer) => {
      lu += d.toString();
      if (motif.test(lu)) {
        clearTimeout(t);
        ok();
      }
    };
    enfant.stdout?.on('data', lire);
    enfant.stderr?.on('data', lire);
  });

/** The state of a circuit as its query gives it: whether it waits on a question, and its text. */
export interface Vue {
  attente: boolean;
  question: boolean;
  texte: string;
}

/** What the bench reads of the trial of ./circuit-essai.ts: its repository, its environment, its log. */
interface Essai {
  REPO: string;
  ENV: Record<string, string | undefined>;
  journal: (id: string) => string;
}

/**
 * The bench of one test on the trial <essai> under <ESSAIS>: its server and its worker, opened by
 * `ouvrir`, closed by `fermer`.
 */
export async function ouvrirLeBanc(ESSAIS: string, essai: Essai, nom: string) {
  const { REPO, ENV, journal } = essai;
  // The trial's worker serves the task queue of its project, as the worker of a project does.
  const FILE = fileDuProjet(REPO);
  const base = path.join(ESSAIS, `temporal-${nom}`);
  mkdirSync(base, { recursive: true });
  const port = await portLibre();
  const adresse = `127.0.0.1:${port}`;
  const tmp = path.join(ESSAIS, 'tmp');
  mkdirSync(tmp, { recursive: true });
  const env = { ...ENV, TEMPORAL_ADDRESS: adresse, TMPDIR: tmp };
  const cli = (...a: string[]): SpawnSyncReturns<string> =>
    spawnSync(temporal(), [...a, '--address', adresse], {
      encoding: 'utf8',
      env,
      timeout: 30_000,
    });

  // The server on its database and its port, ready once the CLI reaches it.
  const unServeur = async () => {
    const s = spawn(
      temporal(),
      [
        'server',
        'start-dev',
        '--headless',
        '--ip',
        '127.0.0.1',
        '--port',
        String(port),
        '--db-filename',
        path.join(base, 'temporal.db'),
        '--log-level',
        'warn',
        '--search-attribute',
        'GrillhouseTicket=Keyword',
        '--search-attribute',
        'GrillhouseEtape=Keyword',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    enfants.push(s);
    const limite = Date.now() + SERVEUR_MS;
    while (cli('operator', 'cluster', 'health').status !== 0) {
      if (Date.now() > limite || s.exitCode !== null) {
        throw new Error(
          `le serveur d'essai ne répond pas en ${SERVEUR_MS / 1000} s sur ${adresse} (code ${s.exitCode ?? 'aucun'}).`
        );
      }
      await dormir(200);
    }
    return s;
  };
  // What the worker writes, its acts' lines included, kept for the harness of the circuit.
  let sortieDuTravailleur = '';
  // The environment the worker runs with, besides the bench's.
  let enPlus: Record<string, string> = {};
  const unTravailleur = async () => {
    const t = spawn(process.execPath, [TRAVAILLEUR, '--file', FILE], {
      env: { ...env, ...enPlus },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    enfants.push(t);
    const garder = (d: Buffer) => {
      sortieDuTravailleur += d.toString();
    };
    t.stdout?.on('data', garder);
    t.stderr?.on('data', garder);
    await attendreLaLigne(t, /^prêt /m, 60_000);
    return t;
  };
  let serveur = await unServeur();
  let travailleur = await unTravailleur();
  const attentes: ChildProcess[] = [];

  const workflow = (id: string) => `circuit:${REPO}:${id}`;
  // The status of the workflow <wf>, as the CLI gives it; `?` when the server holds none.
  const statut = (wf: string) => {
    const d = cli('workflow', 'describe', '--workflow-id', wf, '--output', 'json');
    return /"status":\s*"(?:WORKFLOW_EXECUTION_STATUS_)?([A-Z_]+)"/.exec(d.stdout)?.[1] ?? '?';
  };
  // The state of the circuit of <id> (the query of its workflow), as the CLI writes it.
  const vue = (id: string): Vue => {
    const q = cli(
      'workflow',
      'query',
      '--workflow-id',
      workflow(id),
      '--type',
      'etatDuCircuit',
      '--output',
      'json'
    );
    return {
      attente: /"attente":\s*true/.test(q.stdout),
      question: /"question":\s*\{/.test(q.stdout),
      texte: `${q.stdout}${q.stderr}`,
    };
  };
  // What a failure says of the circuit of <id>: its state, its memo and the end of its log.
  const pieces = (id: string) => {
    const d = cli('workflow', 'describe', '--workflow-id', workflow(id), '--output', 'json');
    let memo = d.stdout;
    try {
      const champs = (
        JSON.parse(d.stdout) as {
          workflowExecutionInfo?: { memo?: { fields?: Record<string, unknown> } };
        }
      ).workflowExecutionInfo?.memo?.fields;
      memo = Object.entries(champs ?? {})
        .map(
          ([k, v]) =>
            `${k} = ${typeof (v as { data?: unknown })?.data === 'string' ? Buffer.from((v as { data: string }).data, 'base64').toString('utf8') : JSON.stringify(v)}`
        )
        .join('\n');
    } catch {
      // the description as the CLI wrote it
    }
    return `état du déroulé : ${vue(id).texte}\nmémo : ${memo}\njournal du ticket :\n${journal(id)
      .split('\n')
      .slice(-40)
      .join('\n')}`;
  };

  // The function <nom> of the built module <module>, called on a client of the server and <args>
  // in a process of its own; its result, as JSON.
  const parLeClient = (module: string, nom: string, ...args: unknown[]): unknown => {
    const code = `const { ouvrirLeClient } = await import(${JSON.stringify(pathToFileURL(CLIENT).href)});
const m = await import(${JSON.stringify(pathToFileURL(module).href)});
const c = ouvrirLeClient();
try {
  process.stdout.write(JSON.stringify((await m[${JSON.stringify(nom)}](c.client, ...JSON.parse(process.argv[1]))) ?? null));
} finally {
  await c.fermer();
}`;
    const r = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', code, JSON.stringify(args)],
      { encoding: 'utf8', env, timeout: 60_000 }
    );
    if (r.status !== 0) {
      throw new Error(`${nom} : ${r.stderr}`);
    }
    return JSON.parse(r.stdout || 'null') as unknown;
  };

  const banc = {
    adresse,
    env,
    /** The task queue the worker of the trial serves, the project's. */
    file: FILE,
    cli,
    statut,
    vue,
    workflow,
    pieces,
    /** Starts the circuit of <id> by its client, its entry completed by <entree>. */
    demarrerLeCircuit: (id: string, entree: Record<string, unknown> = {}) => {
      return parLeClient(
        CLIENT_DU_CIRCUIT,
        'demarrerLeCircuit',
        { racine: REPO, ticket: id, repasserMs: 5000, ...entree },
        FILE
      );
    },
    /** Starts the queue of the tickets of the repository, each circuit's entry <circuit>. */
    demarrerLesTickets: (circuit: Record<string, unknown> = {}) => {
      return parLeClient(
        CLIENT_DES_TICKETS,
        'demarrerLesTickets',
        { racine: REPO, reveilMs: 2000, circuit: { repasserMs: 5000, ...circuit } },
        FILE
      );
    },
    /** Resumes the circuit of <id> stopped on its question (`--reprendre`), by its client. */
    reprendre: (id: string, contexte: string | null = null) => {
      return parLeClient(CLIENT_DU_CIRCUIT, 'reprendreLeCircuit', REPO, id, contexte) as string;
    },
    /**
     * The tickets in the queue of integration of the repository, the one under way first, as its
     * query gives them; none while the queue does not run.
     */
    laFile: (): string[] => {
      const code = `const { ouvrirLeClient } = await import(${JSON.stringify(pathToFileURL(CLIENT).href)});
const { lireLaFile } = await import(${JSON.stringify(pathToFileURL(CLIENT_DE_LA_FILE).href)});
const c = ouvrirLeClient();
try {
  const v = await lireLaFile(c.client, process.argv[1]);
  process.stdout.write(JSON.stringify([...(v.enCours ? [v.enCours] : []), ...v.attente]));
} catch (e) {
  if (e?.name !== 'WorkflowNotFoundError') throw e;
  process.stdout.write('[]');
} finally {
  await c.fermer();
}`;
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', code, REPO], {
        encoding: 'utf8',
        env,
        timeout: 60_000,
      });
      if (r.status !== 0) {
        throw new Error(`lireLaFile : ${r.stderr}`);
      }
      return JSON.parse(r.stdout) as string[];
    },
    /** The circuits of the repository, as the board reads them. */
    circuits: (): { ticket: string; vivant: boolean; etape: string | null }[] => {
      const code = `const m = await import(${JSON.stringify(pathToFileURL(LECTURE).href)});
process.stdout.write(JSON.stringify(await m.circuitsDuServeur(process.argv[1])));`;
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', code, REPO], {
        encoding: 'utf8',
        env,
        timeout: 60_000,
      });
      if (r.status !== 0) {
        throw new Error(`circuitsDuServeur : ${r.stderr}`);
      }
      return JSON.parse(r.stdout) as { ticket: string; vivant: boolean; etape: string | null }[];
    },
    /**
     * The wait of the questions of the repository, launched as a session of supervision keeps it:
     * `fin`, its output once it ends; `finie`, whether it ended.
     */
    attendreLesQuestions: () => {
      const a = spawn(process.execPath, [SUPERVISEUR, '--attendre', REPO], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      enfants.push(a);
      attentes.push(a);
      let sortie = '';
      a.stdout?.on('data', d => {
        sortie += String(d);
      });
      a.stderr?.on('data', d => {
        sortie += String(d);
      });
      let finie = false;
      const fin = new Promise<string>(ok =>
        a.once('exit', () => {
          finie = true;
          ok(sortie);
        })
      );
      return { fin, finie: () => finie };
    },
    /**
     * Waits for the circuit of <id> to stop on a question (its workflow waiting for the answer),
     * within <ms>; its state.
     */
    attendreLaQuestion: async (id: string, ms = QUESTION_MS): Promise<Vue> => {
      const limite = Date.now() + ms;
      while (Date.now() < limite) {
        const v = vue(id);
        if (v.attente && v.question) {
          return v;
        }
        if (statut(workflow(id)) === 'COMPLETED') {
          break;
        }
        await dormir(2000);
      }
      return expect.fail(`aucune question ne monte :\n${pieces(id)}`);
    },
    /**
     * Waits for the circuit of <id> to end within <ms>, no question going up meanwhile; ends
     * integrated.
     */
    attendreLaFin: async (id: string, ms = FIN_MS) => {
      const limite = Date.now() + ms;
      // The workflow of a circuit the queue starts appears once the queue wakes.
      let s = statut(workflow(id));
      while ((s === 'RUNNING' || s === '?') && Date.now() < limite) {
        const v = vue(id);
        // A question that goes up waits for the supervisor, whom the test is not.
        if (v.attente && v.question) {
          expect.fail(`une question monte au superviseur :\n${pieces(id)}`);
        }
        await dormir(2000);
        s = statut(workflow(id));
      }
      expect(s, pieces(id)).toBe('COMPLETED');
      const fin = cli('workflow', 'result', '--workflow-id', workflow(id), '--output', 'json');
      expect(fin.status, `${fin.stdout}\n${fin.stderr}`).toBe(0);
      expect(fin.stdout).toContain('"raison": "integre"');
    },
    /** What the worker wrote since the start of the bench. */
    sortieDuTravailleur: () => sortieDuTravailleur,
    /** The environment the worker runs with, besides the bench's: <e>, the worker started again. */
    travailleurAvec: async (e: Record<string, string>) => {
      enPlus = e;
      await finirLEnfant(travailleur);
      travailleur = await unTravailleur();
    },
    /** Kills the worker (SIGKILL), then starts another. */
    couperLeTravailleur: async () => {
      const fini = new Promise<void>(ok => travailleur.once('exit', () => ok()));
      travailleur.kill('SIGKILL');
      await fini;
      travailleur = await unTravailleur();
    },
    /** Kills the server (SIGKILL), then starts it again on the same database and port. */
    redemarrerLeServeur: async () => {
      const fini = new Promise<void>(ok => serveur.once('exit', () => ok()));
      serveur.kill('SIGKILL');
      await fini;
      serveur = await unServeur();
    },
    /**
     * The end of the bench: each workflow of <ids> still running stopped on the supervisor's word
     * (its session killed), the queue of the tickets ended, the waits, the worker, the server.
     */
    fermer: async (ids: string[]) => {
      for (const id of ids) {
        if (statut(workflow(id)) === 'RUNNING') {
          cli(
            'workflow',
            'signal',
            '--workflow-id',
            workflow(id),
            '--name',
            'arreter',
            '--input',
            'null'
          );
          for (let i = 0; i < 60 && statut(workflow(id)) === 'RUNNING'; i++) {
            await dormir(1000);
          }
        }
      }
      if (statut(`tickets:${REPO}`) === 'RUNNING') {
        cli('workflow', 'terminate', '--workflow-id', `tickets:${REPO}`, '--reason', 'fin');
      }
      for (const a of attentes) {
        await finirLEnfant(a);
      }
      await finirLEnfant(travailleur);
      await finirLEnfant(serveur);
    },
  };
  return banc;
}

export type Banc = Awaited<ReturnType<typeof ouvrirLeBanc>>;
