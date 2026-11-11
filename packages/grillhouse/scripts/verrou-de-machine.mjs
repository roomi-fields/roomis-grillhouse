// The lock of the machine for the heavy measure: one heavy measure at a time on the machine,
// whatever repository it plays in, as GNU make's job server shares its slots between every make of
// one build, and as Bazel holds a test that declares it wants the whole machine. Taken by every
// `npm run verifier` (scripts/langages/typescript/verifier.mjs: the night's, a supervisor's) and by the heavy passes of the circuit of a ticket (scripts/circuit.mjs: the proof
// of the red and the checks), so that a measure gives the result of the code, not that of another
// measure beside it.
//
// - The lock is one file of the user's cache, shared by every repository of the machine:
//   `${XDG_CACHE_HOME:-~/.cache}/grillhouse/mesure-lourde.lock`; GRILLHOUSE_VERROU_MACHINE names
//   another file (the base configuration of the tests gives each test file its own,
//   scripts/langages/typescript/vitest-config/machine.setup.mjs). It is taken through scripts/verrou-de-fichier.mjs,
//   judged by its owner's process: a lock whose process is gone is taken over.
// - A second measure waits for the end of the first, then plays once it holds the lock. It says
//   that it waits and whom for (the process that holds the lock, its working directory, its
//   command, since when) when it begins, then every 30 s, so that a log shows a pass is not
//   frozen.
// - The wait is bounded, as `flock -w` and a database's lock timeout: ATTENTE_MACHINE_MS, 60 min,
//   longer than the longest full pass measured (the frame's, 21 min; a final pass of BPScript
//   320.3, 35.5 min, a wait for rest of the CPU included); GRILLHOUSE_ATTENTE_MACHINE_MS names
//   another bound, in ms. The bound reached, the measure stops at « à repasser » (75): another
//   measure holds the machine, which is neither green nor red, and whoever launched the measure
//   presents it again later. The stop throws an AttenteDeLaMachine, which names the holder.
// - A lock held by an ancestor of the waiting process (its parent, its parent's parent…, or the
//   process itself) is a deadlock: the ancestor waits for its descendant, which waits for the
//   lock. The wait says so at once and stops, red (1): the descendant lost the mark of the taking
//   (an environment rebuilt, a test's), a defect to correct and not a load to wait out. It does
//   not play under the ancestor's lock: make plays such a child at `-j1` because it cannot tell,
//   but here the lost mark is the defect, and playing would hide it.
// - Who holds the lock passes it to its children, as make passes its job server in MAKEFLAGS: the
//   variable GRILLHOUSE_MESURE_TENUE carries the mark of the taking, and a process whose variable
//   names the mark the lock holds plays under it without taking it again (the final pass of the
//   circuit, `npm run verifier`, under the circuit's lock).
// - In the envelope of an agent (GRILLHOUSE_ENVELOPPE set, scripts/enveloppe/paquets-du-plan.mjs)
//   no lock is taken: the envelope has its own process space, where an owner's number means nothing
//   outside, and its home shows no cache.
// - A measure has a rank, as the job server of GNU make serves its own build first and Bazel's
//   `--experimental_local_test_priority` orders the tests that wait for the machine. A measure
//   played in the frame's own repository (one whose workspaces hold the package
//   @roomi-fields/grillhouse in development, its agent copies included: `rangDeLaMesure`) is of
//   the first rank, « mesure du cadre »; a project's (a circuit, a `npm run verifier`) is of the
//   second, « mesure d'un projet ». A measure that waits for the lock names its rank among the
//   waits (`<lock>.attentes/`, below); a measure of the second rank does not take the lock, even
//   free, while a live measure of the first waits for it, so a check of the frame, whose next
//   version every project waits for, never waits behind the projects' measures (the verification
//   of 0.26.0 waited 61 min behind five measures of two projects). Between measures of one rank,
//   the first to find the lock free takes it. The bound of the wait is the same for both ranks,
//   and the wait says its rank.
// - The lock names its holder and its waits, as lslocks names who holds a lock and cargo's
//   « Blocking waiting for file lock » says what a wait waits for. Whoever takes it, a pass out of
//   a ticket or the circuit of a ticket, of any project of the machine, names itself beside it in
//   `<lock>.detenteur.json`: its mark, its process, its project, its copy, its ticket or null, its kind
//   (`sorte`: « Vérification » by default, or GRILLHOUSE_VERIFICATION_SORTE and
//   GRILLHOUSE_VERIFICATION_TICKET from the caller, a step's title for a circuit), since when, and its progress
//   directory once it names it (`nommerLAvancement`); the name goes with the lock. Each measure
//   that waits, for the lock or for room in the temporary directory, names itself in the
//   directory `<lock>.attentes/`, one file per waiting process (its process, its rank, its
//   project, copy, ticket and kind, what it waits for `quoi`, since when), removed once it stops
//   waiting. The project is named by the root of the main tree of the repository the measure
//   plays in, its copies included (`depot`, `racineDuDepot`); the board gives it the name it
//   gives that project, its folder's for a project out of the board (scripts/tableau.mjs). The copy
//   is the root of the working tree the measure plays in (`copie`, `racineDeLaCopie`): the main tree
//   or a copy under .claude/worktrees/, which names a measure without a ticket.
//   `lireLeVerrou` reads them for the board (through `lireLaMesure` of scripts/avancement.mjs): a
//   holder or a wait whose process is gone names no one, and the wait's file goes; a lock a live
//   process holds without naming itself (a frame older than this naming) shows as the repository
//   of its process's directory, of the kind « Verrou ».
// - The lock is let go at the end of the measure, whether it succeeds or throws.
// - A measure first wants room in the temporary directory (`os.tmpdir()` under its environment),
//   a disk in memory that the sessions of the machine share: under LIBRE_MIN, 4 GB free
//   (GRILLHOUSE_TEMPORAIRE_LIBRE names another floor, in bytes; the base configuration of the
//   tests sets 0, scripts/langages/typescript/vitest-config/machine.setup.mjs), it waits for room
//   instead of failing for lack of it (ENOSPC: 25 reds of the night of 2026-11-01, the
//   scratchpads holding 8 GB of 16), as Kubernetes schedules no new pod on a node under
//   DiskPressure. It says so, with what holds the directory (its largest
//   entries, by the blocks their files hold, the temporary directory of a ticket naming its
//   ticket), when it begins and every 30 s, under the same bound as the
//   lock's, then « à repasser » (75).
// - It then wants room on the disk of the copy it plays in (its root, `racine`), where cargo
//   writes its target directories: under LIBRE_MIN as well (GRILLHOUSE_COPIE_LIBRE names another
//   floor, in bytes; the base configuration of the tests sets 0), it waits the same way, under
//   the same bound counted from the start of the wait, and says what holds that disk: the copies
//   of its repository, the largest first, each with its ticket and its tools' outputs
//   (`occupantsDesCopies` of scripts/copies-finies.mjs: « .claude/worktrees/SH-ae6.2.7 (le
//   ticket SH-ae6.2.7, 5,0 Go, dont target 4,8 Go) »), as Bazel and Buildkite refuse to start a
//   build under a floor of free room rather than fail in its middle (the main disk full on
//   2026-11-01, three circuits killed without a word, grillhouse-k5y).
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statfsSync,
  statSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { occupantsDesCopies } from './copies-finies.mjs';
import { paquetsDeLEnveloppe } from './enveloppe/paquets-du-plan.mjs';
import { paquets } from './paquets.mjs';
import { attendreUnPeu, lacherVerrou, prendreVerrou } from './verrou-de-fichier.mjs';
import { ecrireAtomique } from './mesure/avancement.mjs';
import { ticketDeLaBase, vivant } from './mesure/base-de-passe.mjs';
import { A_REPASSER } from './codes-de-sortie.mjs';

const VARIABLE_VERROU = 'GRILLHOUSE_VERROU_MACHINE';
const VARIABLE_TENUE = 'GRILLHOUSE_MESURE_TENUE';
const VARIABLE_VERIFICATION_SORTE = 'GRILLHOUSE_VERIFICATION_SORTE';
const VARIABLE_VERIFICATION_TICKET = 'GRILLHOUSE_VERIFICATION_TICKET';
const VARIABLE_ATTENTE = 'GRILLHOUSE_ATTENTE_MACHINE_MS';
const VARIABLE_LIBRE = 'GRILLHOUSE_TEMPORAIRE_LIBRE';
const VARIABLE_COPIE = 'GRILLHOUSE_COPIE_LIBRE';

/** The room a heavy measure wants free in the temporary directory, and on the disk of its copy,
 * in bytes: 4 GB. */
export const LIBRE_MIN = 4 * 1024 ** 3;

// The name of the frame's package, which a repository of the first rank develops.
const CADRE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).name;

/**
 * The rank of a measure played at <racine>: 1 in the frame's own repository (its workspaces hold
 * the package @roomi-fields/grillhouse in development), 2 elsewhere.
 * @param {string} racine the root of the repository the measure plays in
 * @returns {1 | 2}
 */
export function rangDeLaMesure(racine) {
  return paquets(racine).some(p => p.pkg.name === CADRE) ? 1 : 2;
}

const RANGS = { 1: 'mesure du cadre', 2: "mesure d'un projet" };

/** The longest wait for the lock of the machine, in ms, unless GRILLHOUSE_ATTENTE_MACHINE_MS names another. */
export const ATTENTE_MACHINE_MS = 60 * 60_000;
// The gap between two lines that say the wait goes on.
const RAPPEL_MS = 30_000;

/** The stop of a wait for the lock of the machine: `code` is 75 at the bound, 1 for a deadlock. */
export class AttenteDeLaMachine extends Error {
  /**
   * @param {string} message what stops the wait, the holder named
   * @param {number} code the exit code the measure ends on
   */
  constructor(message, code) {
    super(message);
    this.name = 'AttenteDeLaMachine';
    this.code = code;
  }
}

// The lock file of the machine under <env>, beside which its holder and its waits name
// themselves.
export function verrouDeMachine(env = process.env) {
  if (env[VARIABLE_VERROU]) {
    return env[VARIABLE_VERROU];
  }
  const cache = env.XDG_CACHE_HOME || path.join(env.HOME || homedir(), '.cache');
  return path.join(cache, 'grillhouse', 'mesure-lourde.lock');
}

const lire = f => {
  try {
    return readFileSync(f, 'utf8').trim();
  } catch {
    return null;
  }
};

// The process number in the lock <verrou>, or null.
function detenteur(verrou) {
  const pid = /^(\d+)/.exec(lire(verrou) ?? '')?.[1];
  return pid ? Number(pid) : null;
}

const heure = ms => new Date(ms).toTimeString().slice(0, 8);
const duree = ms =>
  ms < 120_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`;

// The process <pid>, its working directory and command when they read (on one line, cut at 200
// characters): « le processus 12 (dans /d) : node x ».
function processus(pid) {
  let ou = '';
  try {
    ou = ` (dans ${readlinkSync(`/proc/${pid}/cwd`)})`;
  } catch {
    // its directory does not read: the process alone is named
  }
  const commande = (lire(`/proc/${pid}/cmdline`) ?? '')
    .split('\0')
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
  const quoi = commande
    ? ` : ${commande.length > 200 ? `${commande.slice(0, 200)}…` : commande}`
    : '';
  return `le processus ${pid}${ou}${quoi}`;
}

// Who holds the lock <verrou>: its process (`processus`) and since when the lock stands
// (« le processus 12 (dans /d) : node x, depuis 10:04:31 (3 min) »).
function qui(verrou) {
  const pid = detenteur(verrou);
  if (pid === null) {
    return 'une autre mesure';
  }
  let depuis = '';
  try {
    const t = statSync(verrou).mtimeMs;
    depuis = `, depuis ${heure(t)} (${duree(Date.now() - t)})`;
  } catch {
    // the lock is gone meanwhile
  }
  return `${processus(pid)}${depuis}`;
}

/**
 * The root of the working tree at <racine>, the main tree or a copy (git's top level); <racine>
 * itself out of git.
 * @param {string} racine
 * @returns {string}
 */
export function racineDeLaCopie(racine) {
  const r = spawnSync('git', ['-C', racine, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : path.resolve(racine);
}

/**
 * The root of the repository at <racine>: its main tree, its copies included (the parent of its
 * common directory of git); <racine> itself out of git.
 * @param {string} racine
 * @returns {string}
 */
export function racineDuDepot(racine) {
  const r = spawnSync(
    'git',
    ['-C', racine, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    { encoding: 'utf8' }
  );
  return r.status === 0 ? path.dirname(r.stdout.trim()) : path.resolve(racine);
}

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// The file where the holder of <verrou> names itself, and the directory of its waits.
const fichierDuDetenteur = verrou => `${verrou}.detenteur.json`;
const dossierDesAttentes = verrou => `${verrou}.attentes`;

// Who a measure is, from its options: `{ depot, copie, ticket, sorte }`, the root of its
// repository and of its working tree read when first asked.
// The kind and the ticket come from the option of the caller (the circuit) when it gives one,
// else from the caller's environment (GRILLHOUSE_VERIFICATION_SORTE, GRILLHOUSE_VERIFICATION_TICKET,
// empty as absent), else « Vérification » and null.
function identite({ racine, env = {}, ticket, sorte }) {
  ticket = ticket ?? (env[VARIABLE_VERIFICATION_TICKET] || null);
  sorte = sorte ?? (env[VARIABLE_VERIFICATION_SORTE] || 'Vérification');
  let depot = null;
  let copie = null;
  return {
    get depot() {
      depot ??= racineDuDepot(racine);
      return depot;
    },
    get copie() {
      copie ??= racineDeLaCopie(racine);
      return copie;
    },
    ticket,
    sorte,
  };
}

// Names this process, <id>, among the waits of <verrou>, waiting for <quoi> (« verrou »,
// « place ») at the rank <rang> (null for room); a function that removes its name.
function inscrireLAttente(verrou, id, quoi, rang = null) {
  const f = path.join(dossierDesAttentes(verrou), `${process.pid}-${randomUUID()}.json`);
  try {
    ecrireAtomique(f, {
      pid: process.pid,
      rang,
      depot: id.depot,
      copie: id.copie,
      ticket: id.ticket,
      sorte: id.sorte,
      quoi,
      depuis: Date.now(),
    });
  } catch {
    return () => {};
  }
  return () => rmSync(f, { force: true });
}

// The waits of <verrou> whose process lives, the oldest first; the file of a process that is gone
// is removed.
function attentesDe(verrou) {
  const dossier = dossierDesAttentes(verrou);
  let noms;
  try {
    noms = readdirSync(dossier);
  } catch {
    return [];
  }
  const out = [];
  for (const nom of noms) {
    const pid = Number(/^(\d+)-/.exec(nom)?.[1]);
    if (!pid || !vivant(pid)) {
      rmSync(path.join(dossier, nom), { force: true });
      continue;
    }
    const a = nom.endsWith('.json') ? lireJson(path.join(dossier, nom)) : null;
    if (a?.pid === pid) {
      out.push(a);
    }
  }
  return out.sort((a, b) => (a.depuis ?? 0) - (b.depuis ?? 0));
}

// The live processes of the measures of the first rank that wait for <verrou>.
const premiersQuiAttendent = verrou =>
  attentesDe(verrou)
    .filter(a => a.quoi === 'verrou' && a.rang === 1)
    .map(a => a.pid);

// Names this process, <id>, holder of <verrou> under the mark it holds; a function that removes
// the name while it is still this taking's.
function nommerLeDetenteur(verrou, id) {
  const f = fichierDuDetenteur(verrou);
  const marque = lire(verrou);
  try {
    ecrireAtomique(f, {
      marque,
      pid: process.pid,
      depot: id.depot,
      copie: id.copie,
      ticket: id.ticket,
      sorte: id.sorte,
      depuis: Date.now(),
      dossier: null,
    });
  } catch {
    return () => {};
  }
  return () => {
    if (lireJson(f)?.marque === marque) {
      rmSync(f, { force: true });
    }
  };
}

/**
 * Names the progress directory <dossier> of the measure that holds the lock of the machine under
 * <env> (its mark in GRILLHOUSE_MESURE_TENUE), beside the lock, where the board reads it; a
 * function that takes it out. Nothing without a lock this environment holds (in the envelope of
 * an agent).
 * @param {{ env?: Record<string, string | undefined>, dossier: string }} o
 * @returns {() => void}
 */
export function nommerLAvancement({ env = process.env, dossier }) {
  const f = fichierDuDetenteur(verrouDeMachine(env));
  const marque = env[VARIABLE_TENUE];
  const ecrire = d => {
    const n = lireJson(f);
    if (!marque || n?.marque !== marque) {
      return false;
    }
    try {
      ecrireAtomique(f, { ...n, dossier: d });
      return true;
    } catch {
      return false;
    }
  };
  return ecrire(dossier) ? () => void ecrire(null) : () => {};
}

/**
 * Who holds the lock of the machine under <env> and who waits for it. `detenteur`: its process,
 * repository (`depot`, the root of its main tree, and `projet`, its folder), ticket, kind, since
 * when (ms) and progress directory; null when the lock is free or its process gone; a live process
 * that names nothing beside the lock shows as the repository of its directory, of the kind
 * « Verrou ». `attentes`: each live wait, the oldest first, its process, rank, repository,
 * ticket, kind, what it waits for (`quoi`: « verrou » or « place ») and since when.
 * @param {Record<string, string | undefined>} [env]
 */
export function lireLeVerrou(env = process.env) {
  const verrou = verrouDeMachine(env);
  const attentes = attentesDe(verrou).map(
    ({ pid, rang, depot, copie, ticket, sorte, quoi, depuis }) => ({
      pid,
      rang,
      depot,
      copie: copie ?? null,
      projet: path.basename(String(depot)),
      ticket,
      sorte,
      quoi,
      depuis,
    })
  );
  const marque = lire(verrou);
  const pid = detenteur(verrou);
  if (marque === null || pid === null || !vivant(pid)) {
    return { detenteur: null, attentes };
  }
  const n = lireJson(fichierDuDetenteur(verrou));
  if (n?.marque === marque) {
    const { depot, copie = null, ticket, sorte, depuis, dossier } = n;
    const projet = path.basename(String(depot));
    return { detenteur: { pid, depot, copie, projet, ticket, sorte, depuis, dossier }, attentes };
  }
  let depuis = null;
  let ou = null;
  try {
    depuis = statSync(verrou).mtimeMs;
    ou = readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    // the lock gone meanwhile, or the directory of its process unreadable: its number names it
  }
  const depot = ou ? racineDuDepot(ou) : null;
  return {
    detenteur: {
      pid,
      depot,
      copie: ou ? racineDeLaCopie(ou) : null,
      projet: depot ? path.basename(depot) : `processus ${pid}`,
      ticket: null,
      sorte: 'Verrou',
      depuis,
      dossier: null,
    },
    attentes,
  };
}

// Whom a measure of the rank <rang> waits for at <verrou>: the holder of the lock, and for the
// second rank the measures of the first that wait too, which pass first.
function attendus(verrou, rang) {
  const tenu = detenteur(verrou) === null ? 'libre' : `tenu par ${qui(verrou)}`;
  const premiers = rang === 2 ? premiersQuiAttendent(verrou) : [];
  const avant = !premiers.length
    ? ''
    : premiers.length === 1
      ? ` ; une mesure du cadre attend aussi et passe d'abord : ${processus(premiers[0])}`
      : ` ; ${premiers.length} mesures du cadre attendent aussi et passent d'abord : ${premiers.map(processus).join(' ; ')}`;
  return `le verrou de la mesure lourde (${verrou}) est ${tenu}${avant}`;
}

// Whether a measure of the rank <rang> may take the lock <verrou>: the second rank only while no
// measure of the first waits.
const peutPrendre = (verrou, rang) => rang === 1 || premiersQuiAttendent(verrou).length === 0;

// The parent of the process <pid>, read in /proc (the field after the state, which follows the
// command, itself free to hold spaces and parentheses), or null.
function parent(pid) {
  const stat = lire(`/proc/${pid}/stat`);
  const ppid = stat ? Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]) : NaN;
  return Number.isInteger(ppid) && ppid > 0 ? ppid : null;
}

// Whether <pid> is this process or one of its ancestors.
function ancetre(pid) {
  for (let p = process.pid; p !== null; p = parent(p)) {
    if (p === pid) {
      return true;
    }
  }
  return false;
}

// The floor of room the variable <variable> names under <env>, in bytes, LIBRE_MIN by default.
function plancherDe(env, variable) {
  const n = Number(env[variable]);
  return env[variable] && Number.isFinite(n) && n >= 0 ? n : LIBRE_MIN;
}

// The room free in <dossier>, in bytes; Infinity when it does not read.
function libreDans(dossier) {
  try {
    const s = statfsSync(dossier);
    return s.bavail * s.bsize;
  } catch {
    return Infinity;
  }
}

const go = octets => `${(octets / 1024 ** 3).toFixed(1).replace('.', ',')} Go`;

// The entries a count of what holds the temporary directory reads at most, so that it stays
// short on a directory of millions of files: past it, a size is a floor.
const ENTREES_LUES = 500_000;

// The largest entries of <dossier>, the five first, each by the blocks its files hold, as `du`
// counts them: « claude-1000 (8,0 Go), grillhouse-vitest-x (1,2 Go) ».
function occupants(dossier) {
  let noms;
  try {
    noms = readdirSync(dossier);
  } catch {
    return 'illisible';
  }
  if (noms.length === 0) {
    return 'rien';
  }
  let budget = ENTREES_LUES;
  const taille = racine => {
    let octets = 0;
    const pile = [racine];
    while (pile.length > 0 && budget-- > 0) {
      const p = pile.pop();
      let e;
      try {
        e = lstatSync(p);
      } catch {
        continue;
      }
      octets += e.blocks * 512;
      if (e.isDirectory()) {
        try {
          for (const n of readdirSync(p)) {
            pile.push(path.join(p, n));
          }
        } catch {
          // an unreadable directory counts for itself alone
        }
      }
    }
    return octets;
  };
  return noms
    .map(nom => ({ nom, octets: taille(path.join(dossier, nom)) }))
    .sort((a, b) => b.octets - a.octets)
    .slice(0, 5)
    .map(o => {
      const ticket = ticketDeLaBase(o.nom);
      return `${o.nom} (${ticket ? `le ticket ${ticket}, ` : ''}${go(o.octets)})`;
    })
    .join(', ');
}

// The disks a heavy pass waits for room on, in order: `{ nom, ou, variable }`, the words of its
// lines (« le dossier temporaire », « dans le dossier temporaire »), and the variable of its floor.
const DISQUES = {
  temporaire: {
    nom: 'le dossier temporaire',
    ou: 'dans le dossier temporaire',
    variable: VARIABLE_LIBRE,
  },
  copie: {
    nom: 'le disque de la copie',
    ou: 'sur le disque de la copie',
    variable: VARIABLE_COPIE,
  },
};

// Waits until <dossier> holds <plancher> bytes free (`libre`, a statfs at each turn), saying so
// (`dire`) in the words of <disque> (DISQUES) with what holds it (`occupe`, counted only when a
// line is written) when it begins and every <rappelMs>, and naming itself among the waits once it
// waits (`inscrire`, a function that returns the removal of its name). Throws an
// AttenteDeLaMachine (75) at <borneMs> from <debut> (now by default), the start of the whole wait.
function attendreLaPlace(dossier, { inscrire, ...o }) {
  let retirer = null;
  try {
    return attendreLaPlaceEnNommant(dossier, {
      ...o,
      nommer: () => {
        retirer ??= inscrire();
      },
    });
  } finally {
    retirer?.();
  }
}

function attendreLaPlaceEnNommant(
  dossier,
  {
    disque,
    plancher,
    libre,
    occupe,
    dire,
    borneMs,
    rappelMs,
    nommer,
    maintenant = Date.now,
    dormir = attendreUnPeu,
    debut = maintenant(),
  }
) {
  let dit = null;
  for (;;) {
    const l = libre(dossier);
    if (l >= plancher) {
      if (dit !== null) {
        dire(`✓ place ${disque.ou} après ${duree(maintenant() - debut)}.`);
      }
      return;
    }
    nommer();
    const t = maintenant();
    const etat = () =>
      `${disque.nom} (${dossier}) n'a que ${go(l)} libres, moins des ${go(plancher)} qu'une passe lourde demande (${disque.variable}) ; l'occupent : ${occupe(dossier)}`;
    if (t - debut >= borneMs) {
      throw new AttenteDeLaMachine(
        `⏱ attente de place bornée à ${duree(borneMs)} (${VARIABLE_ATTENTE}) : ${etat()} ; à repasser (code ${A_REPASSER}).`,
        A_REPASSER
      );
    }
    if (dit === null) {
      dire(`⏳ ${etat()} ; attente de place, ${duree(borneMs)} au plus.`);
    } else if (t - dit >= rappelMs) {
      dire(`⏳ attente de place depuis ${duree(t - debut)} : ${etat()}.`);
    }
    if (dit === null || t - dit >= rappelMs) {
      dit = t;
    }
    dormir(Math.max(1, Math.min(200, borneMs - (maintenant() - debut))));
  }
}

/**
 * Waits for room in the temporary directory under <env> (`os.tmpdir()` as it reads it), then on
 * the disk of the copy at <racine>, where the pass writes its target directories: what a heavy
 * pass does before it plays (see the header).
 * @param {{ env?: Record<string, string | undefined>, dire?: (l: string) => void, borneMs?: number,
 *   rappelMs?: number, libre?: (dossier: string) => number, occupe?: (dossier: string) => string,
 *   occupeLaCopie?: (racine: string) => string, racine?: string, ticket?: string | null,
 *   sorte?: string, maintenant?: () => number, dormir?: (ms: number) => void }} [o]
 *   `maintenant` and `dormir` are the clock (Date.now) and the sleep of the wait, the real ones
 *   when left out; `libre` reads the room of each disk, `occupe` what holds the temporary
 *   directory, `occupeLaCopie` the copies that hold the disk of the copy; the wait names its
 *   project <racine>, its ticket and its kind among the waits of the lock of the machine under
 *   <env> while it waits
 * @throws {AttenteDeLaMachine} at the bound of the wait (code 75)
 */
export function attendreDeLaPlace({
  env = process.env,
  dire = l => process.stdout.write(`${l}\n`),
  borneMs = borneDe(env),
  rappelMs = RAPPEL_MS,
  libre = libreDans,
  occupe = occupants,
  occupeLaCopie = occupantsDesCopies,
  racine = process.cwd(),
  ticket,
  sorte,
  maintenant = Date.now,
  dormir = attendreUnPeu,
} = {}) {
  const temporaire = env.TMPDIR || env.TMP || env.TEMP || tmpdir();
  const id = identite({ racine, env, ticket, sorte });
  const inscrire = () => inscrireLAttente(verrouDeMachine(env), id, 'place');
  const debut = maintenant();
  const commun = { libre, dire, borneMs, rappelMs, inscrire, debut, maintenant, dormir };
  attendreLaPlace(temporaire, {
    ...commun,
    disque: DISQUES.temporaire,
    plancher: plancherDe(env, VARIABLE_LIBRE),
    occupe,
  });
  attendreLaPlace(racine, {
    ...commun,
    disque: DISQUES.copie,
    plancher: plancherDe(env, VARIABLE_COPIE),
    occupe: occupeLaCopie,
  });
}

/**
 * The bound of the wait under <env>, in ms (GRILLHOUSE_ATTENTE_MACHINE_MS, else ATTENTE_MACHINE_MS);
 * the wait for a place of the machine (scripts/places-de-la-machine.mjs) has the same.
 * @param {Record<string, string | undefined>} env
 * @returns {number}
 */
export function borneDe(env) {
  const n = Number(env[VARIABLE_ATTENTE]);
  return env[VARIABLE_ATTENTE] && Number.isFinite(n) && n >= 0 ? n : ATTENTE_MACHINE_MS;
}

// Waits for the lock <verrou> at the rank <rang>, saying so (`dire`) when it begins and every
// <rappelMs>; returns the time waited, in ms. Throws an AttenteDeLaMachine at once when an ancestor
// holds the lock, and at the bound <borneMs>. The measure, <id>, names itself among the waits,
// with its rank, while it waits.
function attendreLaMachine(verrou, { id, rang, dire, borneMs, rappelMs, maintenant, dormir }) {
  const retirer = inscrireLAttente(verrou, id, 'verrou', rang);
  try {
    return attendreAuRang(verrou, { rang, dire, borneMs, rappelMs, maintenant, dormir });
  } finally {
    retirer();
  }
}

function attendreAuRang(
  verrou,
  { rang, dire, borneMs, rappelMs, maintenant = Date.now, dormir = attendreUnPeu }
) {
  const debut = maintenant();
  let dit = null;
  for (;;) {
    const pid = detenteur(verrou);
    if (pid !== null && ancetre(pid)) {
      throw new AttenteDeLaMachine(
        `✗ blocage : le verrou de la mesure lourde (${verrou}) est tenu par un ancêtre de ce processus (${process.pid}), ${qui(verrou)} ; il attend la fin de ce processus, qui attendrait la sienne. L'environnement a perdu la marque de la prise (${VARIABLE_TENUE}) ; un essai nomme son propre verrou (${VARIABLE_VERROU}).`,
        1
      );
    }
    const t = maintenant();
    if (t - debut >= borneMs) {
      throw new AttenteDeLaMachine(
        `⏱ attente du verrou de la machine bornée à ${duree(borneMs)} (${VARIABLE_ATTENTE}), ${RANGS[rang]} : ${attendus(verrou, rang)} ; à repasser (code ${A_REPASSER}).`,
        A_REPASSER
      );
    }
    if (dit === null) {
      dire(
        `⏳ ${RANGS[rang]}, la machine mesure déjà : ${attendus(verrou, rang)} ; attente de son tour, ${duree(borneMs)} au plus.`
      );
    } else if (t - dit >= rappelMs) {
      dire(
        `⏳ ${RANGS[rang]}, attente du verrou de la machine depuis ${duree(t - debut)} : ${attendus(verrou, rang)}.`
      );
    }
    if (dit === null || t - dit >= rappelMs) {
      dit = t;
    }
    if (peutPrendre(verrou, rang) && prendreVerrou(verrou, { attendre: false })) {
      return maintenant() - debut;
    }
    dormir(Math.max(1, Math.min(200, borneMs - (maintenant() - debut))));
  }
}

/**
 * Runs <mesure> under the lock of the machine and returns what it returns. <mesure> receives the
 * environment of its children, which carries the lock to them.
 * @param {(envEnfant: Record<string, string | undefined>) => T} mesure a synchronous measure
 * @param {{ env?: Record<string, string | undefined>, racine?: string,
 *   dire?: (ligne: string) => void, borneMs?: number, rappelMs?: number,
 *   libre?: (dossier: string) => number, occupe?: (dossier: string) => string,
 *   ticket?: string | null, sorte?: string, maintenant?: () => number,
 *   dormir?: (ms: number) => void }} options `maintenant` and `dormir`, the clock and the sleep of
 *   the wait (Date.now and the real sleep when left out); `racine`, the
 *   root of the repository the measure plays in, which gives its rank (`rangDeLaMesure`; the
 *   working directory by default); `borneMs`, the bound of the wait
 *   (GRILLHOUSE_ATTENTE_MACHINE_MS, else ATTENTE_MACHINE_MS); `rappelMs`, the gap between two
 *   lines that say the wait goes on (30 s); `libre`, the room free in a directory, in bytes
 *   (`statfs`, at each turn); `occupe`, what holds it, counted when a line of the wait is written;
 *   `ticket` (null out of a ticket) and `sorte` (« Vérification » by default), who the measure is;
 *   an option left out is read from GRILLHOUSE_VERIFICATION_TICKET and GRILLHOUSE_VERIFICATION_SORTE,
 *   named beside the lock while it waits and while it holds it, with its project
 * @returns {T}
 * @throws {AttenteDeLaMachine} at the bound of the wait (code 75), or at once when an ancestor
 *   holds the lock (code 1)
 * @template T
 */
export function avecLaMachine(
  mesure,
  {
    env = process.env,
    racine = process.cwd(),
    dire = l => process.stdout.write(`${l}\n`),
    borneMs = borneDe(env),
    rappelMs = RAPPEL_MS,
    libre = libreDans,
    occupe = occupants,
    ticket,
    sorte,
    maintenant = Date.now,
    dormir = attendreUnPeu,
  } = {}
) {
  if (paquetsDeLEnveloppe(env)) {
    return mesure(env);
  }
  const verrou = verrouDeMachine(env);
  if (env[VARIABLE_TENUE] && lire(verrou) === env[VARIABLE_TENUE]) {
    return mesure(env);
  }
  attendreDeLaPlace({
    env,
    libre,
    occupe,
    dire,
    borneMs,
    rappelMs,
    racine,
    ticket,
    sorte,
    maintenant,
    dormir,
  });
  const id = identite({ racine, env, ticket, sorte });
  mkdirSync(path.dirname(verrou), { recursive: true });
  const rang = rangDeLaMesure(racine);
  if (!(peutPrendre(verrou, rang) && prendreVerrou(verrou, { attendre: false }))) {
    const attendu = attendreLaMachine(verrou, {
      id,
      rang,
      dire,
      borneMs,
      rappelMs,
      maintenant,
      dormir,
    });
    dire(`✓ verrou de la machine pris après ${Math.round(attendu / 1000)} s.`);
  }
  let oublier = () => {};
  try {
    oublier = nommerLeDetenteur(verrou, id);
    const {
      [VARIABLE_VERIFICATION_SORTE]: _s,
      [VARIABLE_VERIFICATION_TICKET]: _t,
      ...enfant
    } = env;
    return mesure({ ...enfant, [VARIABLE_TENUE]: lire(verrou) ?? '' });
  } finally {
    oublier();
    lacherVerrou(verrou);
  }
}
