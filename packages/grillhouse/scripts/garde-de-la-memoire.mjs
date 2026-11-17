// The watch of the memory of a pass: a heavy pass runs its command under it, and is cut before the
// kernel kills, as earlyoom and systemd-oomd end a group before the kernel's own OOM killer does.
//
//   node garde-de-la-memoire.mjs --temoin <file> -- <command> [<argument>…]
//
// - The command runs in the process group of the watch, its streams the caller's: a signal sent
//   to the group of a pass (the stop of an act, of a night, of a session) reaches it as it reaches
//   the watch.
// - Every PAS ms the watch reads what the machine still gives (`memoireRestante` of
//   scripts/mesure-de-la-machine.mjs: the memory available and the free swap) and the pressure of
//   the memory (`/proc/pressure/memory`, line `full`, field `avg10`: the share of the last ten
//   seconds in which every task waited for memory, in %). The pass is cut (`memoireEpuisee`) under
//   MEMOIRE_MIN for memory and swap together, or at SEUIL_PRESSION_MEMOIRE of pressure, which a
//   swap held in memory (zram) reaches first.
// - Cut, the watch ends the command and each process born of it (SIGTERM, then SIGKILL after DELAI
//   ms for those still alive), writes why in <file>, and exits at 75, « à repasser », once they are
//   dead: the pass was not judged, and holds no memory when it gives the machine back.
// - Otherwise it exits with the command's own code; a command a signal ended gives 1, the signal
//   said on the error output.
// - A machine that says neither its memory nor its pressure is not watched: the command runs as
//   it is.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { A_REPASSER } from './codes-de-sortie.mjs';
import { departDe, memoireRestante, processusVivant } from './mesure-de-la-machine.mjs';
import { MEMOIRE_MIN } from './regles-des-places.mjs';

/** This script. */
export const SCRIPT = fileURLToPath(import.meta.url);
/** The variable a trial fixes what the machine gives under: JSON `{ disponible, echange, pression }`. */
export const VARIABLE_MEMOIRE_D_ESSAI = 'GRILLHOUSE_MEMOIRE_D_ESSAI';
/** The pressure of the memory a pass is cut at, in %. */
export const SEUIL_PRESSION_MEMOIRE = 50;
const FICHIER_PRESSION = '/proc/pressure/memory';
const PAS = 2000;
const DELAI = 5000;

const go = n => (n / 1024 ** 3).toFixed(1).replace('.', ',');

/**
 * The pressure `full avg10` of the memory in <texte> (/proc/pressure/memory), in %; null when it
 * does not say it.
 * @param {string} texte
 * @returns {number | null}
 */
export function lireLaPressionDeLaMemoire(texte) {
  const m = /^full\b.*\bavg10=(\d+(?:\.\d+)?)/m.exec(texte);
  return m ? Number(m[1]) : null;
}

/**
 * Why a pass is cut at this memory, null while it may go on: the memory available and the free
 * swap together under MEMOIRE_MIN, or the pressure of the memory at SEUIL_PRESSION_MEMOIRE.
 * @param {{ disponible: number | null, echange: number, pression: number | null }} m bytes, %
 * @returns {string | null}
 */
export function memoireEpuisee({ disponible, echange, pression }) {
  const suite =
    'la passe est coupée avant que le système ne tue, à repasser quand la machine a de la place.';
  if (disponible !== null && disponible + echange < MEMOIRE_MIN) {
    return `mémoire épuisée : ${go(disponible)} Go disponibles et ${go(echange)} Go d'échange libres, sous les ${go(MEMOIRE_MIN)} Go gardés ; ${suite}`;
  }
  if (pression !== null && pression >= SEUIL_PRESSION_MEMOIRE) {
    return `mémoire épuisée : la machine attend sa mémoire ${String(pression).replace('.', ',')} % du temps (seuil ${SEUIL_PRESSION_MEMOIRE} %) ; ${suite}`;
  }
  return null;
}

/**
 * What the machine gives now under <env>: a trial's, else the kernel's.
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ disponible: number | null, echange: number, pression: number | null }}
 */
export function mesurerLaMemoire(env = process.env) {
  if (env[VARIABLE_MEMOIRE_D_ESSAI]) {
    return { pression: null, ...JSON.parse(env[VARIABLE_MEMOIRE_D_ESSAI]) };
  }
  let pression = null;
  try {
    pression = lireLaPressionDeLaMemoire(readFileSync(FICHIER_PRESSION, 'utf8'));
  } catch {
    // no pressure stall information on the machine
  }
  return { ...memoireRestante(), pression };
}

// The processes born of <pid>, itself left out, as /proc says them now.
function descendants(pid) {
  /** @type {Map<number, number[]>} */
  const enfants = new Map();
  for (const n of readdirSync('/proc')) {
    if (!/^\d+$/.test(n)) {
      continue;
    }
    try {
      // The fields after the name, which may hold spaces and parentheses: state, then parent.
      const stat = readFileSync(`/proc/${n}/stat`, 'utf8');
      const parent = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      enfants.set(parent, [...(enfants.get(parent) ?? []), Number(n)]);
    } catch {
      // gone meanwhile
    }
  }
  const nes = [];
  for (const file = [pid]; file.length;) {
    for (const e of enfants.get(file.shift()) ?? []) {
      nes.push(e);
      file.push(e);
    }
  }
  return nes;
}

// <signal> to each process of <relevés> (`{ pid, depart }`) that still is the one relevé.
const signaler = (releves, signal) => {
  for (const r of releves) {
    if (!processusVivant(r)) {
      continue;
    }
    try {
      process.kill(r.pid, signal);
    } catch {
      // gone
    }
  }
};

// The processes <pids> as relevés now: each with its start, which tells it from another process
// that takes its number later.
const relever = pids => pids.map(pid => ({ pid, depart: departDe(pid) })).filter(r => r.depart);

/**
 * Runs <cmd> <args> under the watch: its exit code, 75 when the watch cut it, its witness
 * <temoin> then saying why. A cut ends only once the command and every process relevé are dead,
 * SIGKILL sent after <delai> ms to those SIGTERM did not end.
 * @param {{ cmd: string, args: string[], temoin: string, mesurer?: () => { disponible: number | null, echange: number, pression: number | null }, pas?: number, delai?: number, stdio?: import('node:child_process').StdioOptions, env?: NodeJS.ProcessEnv, cwd?: string }} o
 * @returns {Promise<number>}
 */
export function veiller({
  cmd,
  args,
  temoin,
  mesurer = () => mesurerLaMemoire(),
  pas = PAS,
  delai = DELAI,
  stdio = 'inherit',
  env = process.env,
  cwd,
}) {
  return new Promise(resolve => {
    const enfant = spawn(cmd, args, { stdio, env, cwd });
    // The processes relevés at the cut, and its end: all dead, or SIGKILL sent at the delay.
    let releves = null;
    let finDeLaCoupe = null;
    const couper = raison => {
      // Relevés twice, the command still their ancestor: one born between the two is caught.
      const nes = new Set([enfant.pid, ...descendants(enfant.pid)]);
      for (const p of descendants(enfant.pid)) {
        nes.add(p);
      }
      releves = relever([...nes]);
      signaler(releves, 'SIGTERM');
      finDeLaCoupe = new Promise(fin => {
        // SIGKILL at the delay to those SIGTERM did not end; the end once none lives, or DELAI ms
        // after SIGKILL at the latest.
        const limite = Date.now() + delai;
        let tues = false;
        const voir = setInterval(() => {
          const vivants = releves.filter(processusVivant);
          if (vivants.length && !tues && Date.now() >= limite) {
            tues = true;
            signaler(vivants, 'SIGKILL');
          }
          if (vivants.length === 0 || Date.now() >= limite + DELAI) {
            clearInterval(voir);
            fin();
          }
        }, 100);
      });
      try {
        writeFileSync(temoin, `${raison}\n`);
      } catch {
        // the exit code alone says the cut
      }
    };
    const veille = setInterval(() => {
      if (releves) {
        return;
      }
      let raison = null;
      try {
        raison = memoireEpuisee(mesurer());
      } catch {
        // a measure that does not read cuts nothing
      }
      if (raison) {
        couper(raison);
      }
    }, pas);
    enfant.on('error', e => {
      clearInterval(veille);
      process.stderr.write(`⛔ ${cmd} ne se lance pas : ${e.message}\n`);
      resolve(1);
    });
    enfant.on('exit', (code, signal) => {
      clearInterval(veille);
      if (finDeLaCoupe) {
        void finDeLaCoupe.then(() => resolve(A_REPASSER));
        return;
      }
      if (code === null) {
        process.stderr.write(`⛔ ${cmd} est arrêté par le signal ${signal}.\n`);
      }
      resolve(code ?? 1);
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  if (args[0] !== '--temoin' || args[2] !== '--' || args.length < 4) {
    process.stderr.write(
      'usage: garde-de-la-memoire.mjs --temoin <fichier> -- <commande> [<argument>…]\n'
    );
    process.exitCode = 2;
  } else {
    const [cmd, ...reste] = args.slice(3);
    process.exitCode = await veiller({ cmd, args: reste, temoin: args[1] });
  }
}
