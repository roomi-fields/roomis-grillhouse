#!/usr/bin/env node
// The CPU pressure of the machine, the witness of rest for every measure of time: a time witness
// is measured with the CPU at rest, and a failure that depends on a duration under load is played
// again at rest (« à repasser »), never taken as a red nor as a green. The model is Bazel's
// TIMEOUT/FLAKY and CTest's `--repeat after-timeout`: classify, then play again.
//
// - The signal is the kernel's pressure stall information, `/proc/pressure/cpu`, line `some`,
//   field `avg10`: the share of the last ten seconds in which a task waited for a CPU, in %.
//   GRILLHOUSE_PRESSION_CPU names another file of the same form (the trials write it).
// - The machine is at rest under SEUIL_PRESSION (25 %); at or above it, it is under load.
// - A file that does not read (no pressure stall information on the machine) gives null: whoever
//   reads it says « pression illisible » and leaves the verdict to Vitest.
// - A_REPASSER, 75, is the exit code of « à repasser » (EX_TEMPFAIL of sysexits.h: try again
//   later), neither green nor red: the duration reporter of Vitest gives it
//   (./duree.reporter.mjs), `npm run verifier` reads it (scripts/verifier.mjs), and so do the
//   integration, the queue and the night.
//
//   node scripts/vitest-config/pression.mjs attendre
//
// waits for rest (`attendreLeRepos`, bound 15 min) and exits 0 at rest, 75 at the bound: the night
// waits so before it plays its time budget benches again (scripts/nuit.sh).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SEUIL_PRESSION = 25;
export const A_REPASSER = 75;
export const FICHIER_PRESSION = '/proc/pressure/cpu';
// The longest wait for rest, and the shortest gap between two lines that say it waits.
export const BORNE_ATTENTE_MS = 15 * 60_000;
const ECART_LIGNES_MS = 30_000;

// The pressure `some avg10` of <fichier>, in %, or null when it does not read.
export function lirePression(fichier = process.env.GRILLHOUSE_PRESSION_CPU || FICHIER_PRESSION) {
  try {
    const m = /^some\b.*\bavg10=(\d+(?:\.\d+)?)/m.exec(readFileSync(fichier, 'utf8'));
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

// A pressure written for a line: « 31.2 % », or « illisible ».
export const ecrirePression = p => (p === null ? 'illisible' : `${p.toFixed(1)} %`);

// Sleeps <ms> milliseconds, the process held.
export const dormir = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Waits until the pressure (`lire`) is under the threshold, or until the instant <limite>
// (`maintenant`, in ms). Says the pressure (`dire`) while it waits, one line per 30 s at most.
// True at rest, false at the bound; a pressure that does not read ends the wait (true), said.
export function attendreLeRepos({
  lire = () => lirePression(),
  maintenant = () => Date.now(),
  dormir: dort = dormir,
  limite,
  pasMs = 2_000,
  dire,
}) {
  let derniere = -Infinity;
  for (;;) {
    const p = lire();
    if (p === null) {
      dire('⏳ pression CPU illisible : la relance part sans attendre, verdict de Vitest.');
      return true;
    }
    if (p < SEUIL_PRESSION) return true;
    const t = maintenant();
    if (t >= limite) return false;
    if (t - derniere >= ECART_LIGNES_MS) {
      const reste = Math.ceil((limite - t) / 60_000);
      dire(
        `⏳ pression CPU ${ecrirePression(p)} (seuil ${SEUIL_PRESSION} %) : attente du repos, ${reste} min au plus.`
      );
      derniere = t;
    }
    dort(Math.min(pasMs, limite - t));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv[2] !== 'attendre') {
    process.stderr.write('usage: pression.mjs attendre\n');
    process.exitCode = 2;
  } else {
    const dire = l => process.stdout.write(`${l}\n`);
    const repos = attendreLeRepos({ limite: Date.now() + BORNE_ATTENTE_MS, dire });
    if (!repos) dire(`⏳ pas de repos en ${BORNE_ATTENTE_MS / 60_000} min.`);
    process.exitCode = repos ? 0 : A_REPASSER;
  }
}
