#!/usr/bin/env node
// Creates a ticket under its mother, titled « <number> — <subject> — <components> », and prints its
// id: `grillhouse ticket <mother> <subject> <components> <body> [label]` (USAGE).
//
// The creation is played again without a second ticket (« create if not exists », the
// Idempotency-Key of a payment API): its key is the mother and the title. Before it creates, the
// command reads the children of the mother; a child that bears the title is the ticket: the
// command creates nothing, says so on the error stream and prints that id.
// - A closed child counts for a discovery alone, which is created closed: under any other label a
//   closed ticket is no obstacle, and a defect that comes back gets a new ticket.
// - A child that bears the bare subject and the body of the request is a creation stopped before
//   its title: the command finishes it (its title, the closure of a discovery). A bare subject
//   with another body is someone else's ticket, left alone.
// - A reading that fails, or answers nothing, creates nothing.
//
// The reading and the creation are one step under a lock of the project, in the main tree, whose
// store of Beads the copies share (`.beads/grillhouse-ticket.lock`, scripts/verrou-de-fichier.mjs;
// Beads' own .gitignore leaves `*.lock` out of git): a creation launched while another still runs,
// its caller's delay passed, waits for it, then finds its ticket. The lock is judged by its age
// (5 min, a process number meaning nothing across envelopes) and written again after each call of
// Beads; one left by a command that was killed is taken over past that age. A command its caller
// cuts (SIGTERM, SIGINT) releases the lock before it ends, so that the next creation does not wait.
//
// Beads serves one process at a time (its embedded store is taken under an exclusive lock), and
// the command calls it two to four times: on a store other processes read, each call waits its
// turn. Past a threshold, the command says which call of Beads it waits for, and for how long.
import { spawn } from 'node:child_process';
import { readFileSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { arbrePrincipal } from './outils-cles.mjs';
import { prefixe } from './prefixe-des-tickets.mjs';
import { lacherVerrou, prendreVerrou } from './verrou-de-fichier.mjs';

export const USAGE = [
  'Crée un ticket sous sa mère, titré « <numéro> — <sujet> — <composants> », et affiche son id.',
  '  grillhouse ticket <mère> <sujet> <composants> <corps> [étiquette]',
  'Les composants tiennent en un argument, séparés par des virgules, le fournisseur d’abord :',
  '« 020-loader, 050-emitter ».',
  'Un corps @<fichier> se lit dans ce fichier. L’étiquette vaut a-valider par défaut ;',
  'decouverte crée le ticket fermé (« découverte consignée »).',
  'Le numéro est l’id sans le préfixe entier du projet (la clé issue-prefix de .beads/config.yaml).',
  'Rejouée pour la même mère et le même titre, la commande ne crée rien : elle rend le ticket',
  'existant et le dit (un ticket fermé ne compte que pour une découverte).',
  '',
].join('\n');

// The label of a ticket that waits for the owner, the one of a discovery, and the reason a
// discovery is closed with.
const A_VALIDER = 'a-valider';
const DECOUVERTE = 'decouverte';
const CLOTURE = 'découverte consignée';

// The wait of one call of Beads after which the command says it, and the step between two lines.
const SEUIL_MS = 5_000;
const PAS_MS = 10_000;

/** The lock of the creations of tickets of a project, from the root of its main tree. */
export const VERROU = '.beads/grillhouse-ticket.lock';
/** The age past which that lock is abandoned. */
export const PERIME_MS = 5 * 60_000;
// The pause between two tries of the lock.
const ESSAI_MS = 200;
// The signals by which a caller cuts the command.
const COUPURES = ['SIGTERM', 'SIGINT'];

/**
 * @typedef {{ status: number | null, stdout?: string, stderr?: string }} Reponse
 * @typedef {(args: string[]) => Promise<Reponse>} Bd
 * @typedef {{ mere: string, sujet: string, composants: string, corps: string, etiquette?: string }} Demande
 */

/**
 * The title of the ticket <id> of a project whose tickets bear <prefixeDuProjet>: its number (the
 * id without the whole prefix), its subject and its components.
 * @param {string} prefixeDuProjet
 * @param {string} id
 * @param {string} sujet
 * @param {string} composants
 */
export function titreDe(prefixeDuProjet, id, sujet, composants) {
  const debut = `${prefixeDuProjet}-`;
  return `${id.startsWith(debut) ? id.slice(debut.length) : id} — ${sujet} — ${composants}`;
}

/**
 * Beads run with <args> in <cwd>: what it answers, its failure to start included (status 127).
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<Reponse>}
 */
export function lancerBd(args, cwd) {
  return new Promise(resolve => {
    const enfant = spawn('bd', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    // Decoded as a stream: a character cut between two chunks stays whole.
    enfant.stdout.setEncoding('utf8');
    enfant.stderr.setEncoding('utf8');
    enfant.stdout.on('data', d => (stdout += d));
    enfant.stderr.on('data', d => (stderr += d));
    enfant.on('error', e => resolve({ status: 127, stdout, stderr: e.message }));
    enfant.on('close', status => resolve({ status: status ?? 1, stdout, stderr }));
  });
}

// What <promesse> answers; while it lasts past <seuilMs>, then every <pasMs>, <dire> receives the
// call of Beads <quoi> the command waits for and for how long.
async function enDisantLAttente(promesse, quoi, { dire, seuilMs, pasMs }) {
  const debut = Date.now();
  let veille;
  const dit = () => {
    const secondes = Math.round((Date.now() - debut) / 1000);
    dire(
      `… grillhouse ticket attend la réponse de bd (${quoi}) depuis ${secondes} s : Beads sert un processus à la fois, et d’autres lisent ou écrivent les tickets du projet.\n`
    );
    veille = setTimeout(dit, pasMs);
  };
  veille = setTimeout(dit, seuilMs);
  try {
    return await promesse;
  } finally {
    clearTimeout(veille);
  }
}

// What <f> returns, played under the lock <verrou>; while another creation holds it past
// <seuilMs>, then every <pasMs>, <dire> receives what the command waits for and for how long. A
// signal of COUPURES that <signaux> emits while the lock is held releases it, stops listening,
// then sends the signal again by <renvoyer>: the process ends by it, as one that never listened.
async function sousLeVerrou(verrou, { dire, seuilMs, pasMs, signaux, renvoyer }, f) {
  const debut = Date.now();
  let aDire = seuilMs;
  while (!prendreVerrou(verrou, { attendre: false, perime: PERIME_MS })) {
    const attendu = Date.now() - debut;
    if (attendu >= aDire) {
      dire(
        `… grillhouse ticket attend la fin d’une autre création de ticket du projet depuis ${Math.round(attendu / 1000)} s (${verrou}).\n`
      );
      aDire = attendu + pasMs;
    }
    await new Promise(resolve => setTimeout(resolve, ESSAI_MS));
  }
  const sourd = () => {
    for (const [signal, coupe] of coupes) {
      signaux.off(signal, coupe);
    }
  };
  const coupes = COUPURES.map(signal => [
    signal,
    () => {
      lacherVerrou(verrou);
      sourd();
      renvoyer(signal);
    },
  ]);
  for (const [signal, coupe] of coupes) {
    signaux.on(signal, coupe);
  }
  try {
    return await f();
  } finally {
    sourd();
    lacherVerrou(verrou);
  }
}

const premiereLigne = t =>
  String(t ?? '')
    .trim()
    .split('\n')[0];

/**
 * The ticket of <demande> under its mother, created unless a child of the mother already bears its
 * title: `{ id, cree }`, `cree` false when the ticket existed; one creation of the project at a
 * time, the others waiting for it. Throws, nothing created, when the prefix of the project at
 * <racine> or the children of the mother cannot be read; throws with the call of Beads that failed
 * otherwise.
 * @param {Demande} demande
 * @param {{ racine: string, bd: Bd, dire: (ligne: string) => void, seuilMs?: number, pasMs?: number, signaux?: Pick<NodeJS.EventEmitter, 'on' | 'off'>, renvoyer?: (signal: string) => void }} options
 *   `signaux` emits the signals that cut the command (the process by default), `renvoyer` sends
 *   one to the process again
 * @returns {Promise<{ id: string, cree: boolean }>}
 */
export async function creerLeTicket(
  demande,
  {
    racine,
    bd,
    dire,
    seuilMs = SEUIL_MS,
    pasMs = PAS_MS,
    signaux = process,
    renvoyer = signal => void process.kill(process.pid, signal),
  }
) {
  const duProjet = prefixe(racine);
  const attente = { dire, seuilMs, pasMs, signaux, renvoyer };
  const verrou = path.join(arbrePrincipal(racine), VERROU);
  // The lock written again: a creation Beads makes wait is not taken for an abandoned one.
  const tenu = async args => {
    try {
      return await bd(args);
    } finally {
      try {
        const maintenant = new Date();
        utimesSync(verrou, maintenant, maintenant);
      } catch {
        // the lock is gone: taken over past its age, the creation ends without it
      }
    }
  };
  return sousLeVerrou(verrou, attente, () =>
    creerSousLeVerrou(demande, racine, duProjet, tenu, attente)
  );
}

// The body of a request: the text of the file a body « @file » names, read from <racine>, else
// the body itself; null when that file does not read.
function texteDuCorps(corps, racine) {
  if (!corps.startsWith('@')) {
    return corps;
  }
  try {
    return readFileSync(path.resolve(racine, corps.slice(1)), 'utf8');
  } catch {
    return null;
  }
}

// The ticket of <demande> in the project at <racine>, whose tickets bear <duProjet>, found or
// created, the lock of the creations held.
async function creerSousLeVerrou(
  { mere, sujet, composants, corps, etiquette: demandee },
  racine,
  duProjet,
  bd,
  { dire, seuilMs, pasMs }
) {
  const etiquette = demandee || A_VALIDER;
  const titre = id => titreDe(duProjet, id, sujet, composants);
  const appeler = async (...args) => {
    const r = await enDisantLAttente(bd(args), args[0], { dire, seuilMs, pasMs });
    if (r.status !== 0) {
      throw new Error(`bd ${args[0]} : ${premiereLigne(r.stderr) || `code ${r.status}`}`);
    }
    return r.stdout ?? '';
  };
  const titrer = id => appeler('update', id, '--title', titre(id));
  const clore = id => appeler('close', id, '-r', CLOTURE);

  const lus = await appeler('list', '--parent', mere, '--all', '--limit', '0', '--json');
  let enfants;
  try {
    enfants = JSON.parse(lus);
  } catch (e) {
    throw new Error(`bd list : les tickets sous ${mere} sont illisibles (${e.message})`);
  }
  if (!Array.isArray(enfants)) {
    throw new Error(`bd list : les tickets sous ${mere} sont illisibles (aucune liste rendue)`);
  }
  const texte = texteDuCorps(corps, racine)?.trim();
  const interrompu = t =>
    t.title === sujet && texte !== undefined && String(t.description ?? '').trim() === texte;
  const existant = enfants.find(
    t =>
      (t.status !== 'closed' || etiquette === DECOUVERTE) &&
      (t.title === titre(t.id) || interrompu(t))
  );
  if (existant) {
    const { id } = existant;
    if (existant.title !== titre(id)) {
      await titrer(id);
    }
    if (
      etiquette === DECOUVERTE &&
      existant.status !== 'closed' &&
      (existant.labels ?? []).includes(DECOUVERTE)
    ) {
      await clore(id);
    }
    dire(`grillhouse ticket : ${id} existe déjà sous ${mere} avec ce titre, aucun ticket créé.\n`);
    return { id, cree: false };
  }

  const source = corps.startsWith('@') ? ['--body-file', corps.slice(1)] : ['-d', corps];
  const cree = await appeler(
    'create',
    sujet,
    '--parent',
    mere,
    '--no-inherit-labels',
    '-t',
    'task',
    '-l',
    etiquette,
    ...source,
    '--silent'
  );
  const id = cree.trim().split('\n').at(-1) ?? '';
  if (!id) {
    throw new Error('bd create : aucun id rendu');
  }
  await titrer(id);
  if (etiquette === DECOUVERTE) {
    await clore(id);
  }
  return { id, cree: true };
}

/**
 * The command played with <argv> in the project at <racine>: its exit code, 0 with the id of the
 * ticket on <sortie>, 2 with its usage on <dire> under four arguments, 1 with the reason on <dire>
 * otherwise.
 * @param {string[]} argv
 * @param {{ racine?: string, bd?: Bd, sortie?: (texte: string) => void, dire?: (texte: string) => void }} [options]
 * @returns {Promise<number>}
 */
export async function principal(
  argv,
  {
    racine = process.cwd(),
    bd = args => lancerBd(args, racine),
    sortie = t => void process.stdout.write(t),
    dire = t => void process.stderr.write(t),
  } = {}
) {
  if (argv.length < 4) {
    dire(USAGE);
    return 2;
  }
  const [mere, sujet, composants, corps, etiquette] = argv;
  try {
    const { id } = await creerLeTicket(
      { mere, sujet, composants, corps, etiquette },
      { racine, bd, dire }
    );
    sortie(`${id}\n`);
    return 0;
  } catch (e) {
    dire(`${e.message}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await principal(process.argv.slice(2));
}
