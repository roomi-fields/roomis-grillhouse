// The waits of a pass for the room of the machine, and the stop they end on: what a pass wants
// before it plays, besides its part of the budget (scripts/places-de-la-machine.mjs).
// Architecture: docs/architecture/machine.md (§5.1, §6 « Le disque »).
//
// - A pass first wants room in the temporary directory (`os.tmpdir()` under its environment):
//   under LIBRE_MIN, 4 GB free (GRILLHOUSE_TEMPORAIRE_LIBRE names another floor, in bytes; the
//   base configuration of the tests sets 0, scripts/langages/typescript/vitest-config/
//   machine.setup.mjs), it waits for room instead of failing for lack of it. It says so, with
//   what holds the directory (its largest entries, by the blocks their files hold), when it
//   begins and every 30 s, under a bound (GRILLHOUSE_ATTENTE_MACHINE_MS, ATTENTE_MACHINE_MS,
//   60 min), then « à repasser » (75).
// - It then wants room on the disk of the copy it plays in (its root, `racine`), where cargo
//   writes its target directories: under LIBRE_MIN as well (GRILLHOUSE_COPIE_LIBRE names another
//   floor, in bytes; the base configuration of the tests sets 0), it waits the same way, under
//   the same bound counted from the start of the wait, and says what holds that disk: the copies
//   of its repository, the largest first, each with its ticket and its tools' outputs
//   (`occupantsDesCopies` of scripts/copies-finies.mjs).
// - The stop of a wait is an AttenteDeLaMachine: `code` 75 at the bound, 1 for a server of the
//   places that does not answer.
// - A pass has a rank: one played in the frame's own repository (one whose workspaces hold the
//   package @roomi-fields/grillhouse in development, its agent copies included: `rangDeLaMesure`)
//   is of the first rank, « mesure du cadre »; a project's is of the second, « mesure d'un
//   projet ».
import { spawnSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, statfsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { A_REPASSER } from './codes-de-sortie.mjs';
import { occupantsDesCopies } from './copies-finies.mjs';
import { paquets } from './paquets.mjs';
import { duree } from './regles-des-places.mjs';
import { attendreUnPeu } from './verrou-de-fichier.mjs';

const VARIABLE_ATTENTE = 'GRILLHOUSE_ATTENTE_MACHINE_MS';
const VARIABLE_LIBRE = 'GRILLHOUSE_TEMPORAIRE_LIBRE';
const VARIABLE_COPIE = 'GRILLHOUSE_COPIE_LIBRE';

/** The room a pass wants free in the temporary directory, and on the disk of its copy, in bytes:
 * 4 GB. */
export const LIBRE_MIN = 4 * 1024 ** 3;

/** The longest wait of a pass, in ms, unless GRILLHOUSE_ATTENTE_MACHINE_MS names another. */
export const ATTENTE_MACHINE_MS = 60 * 60_000;
// The gap between two lines that say the wait goes on.
const RAPPEL_MS = 30_000;

// The name of the frame's package, which a repository of the first rank develops.
const CADRE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).name;

/**
 * The rank of a pass played at <racine>: 1 in the frame's own repository (its workspaces hold
 * the package @roomi-fields/grillhouse in development), 2 elsewhere.
 * @param {string} racine the root of the repository the pass plays in
 * @returns {1 | 2}
 */
export function rangDeLaMesure(racine) {
  return paquets(racine).some(p => p.pkg.name === CADRE) ? 1 : 2;
}

/** The stop of a wait of the machine: `code` is 75 at the bound, 1 for a server that fails. */
export class AttenteDeLaMachine extends Error {
  /**
   * @param {string} message what stops the wait
   * @param {number} code the exit code the pass ends on
   */
  constructor(message, code) {
    super(message);
    this.name = 'AttenteDeLaMachine';
    this.code = code;
  }
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

/**
 * The bound of a wait under <env>, in ms (GRILLHOUSE_ATTENTE_MACHINE_MS, else ATTENTE_MACHINE_MS);
 * the wait for a place of the machine (scripts/places-de-la-machine.mjs) and for a part has the
 * same.
 * @param {Record<string, string | undefined>} env
 * @returns {number}
 */
export function borneDe(env) {
  const n = Number(env[VARIABLE_ATTENTE]);
  return env[VARIABLE_ATTENTE] && Number.isFinite(n) && n >= 0 ? n : ATTENTE_MACHINE_MS;
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
    .map(o => `${o.nom} (${go(o.octets)})`)
    .join(', ');
}

// The disks a pass waits for room on, in order: `{ nom, ou, variable }`, the words of its lines
// (« le dossier temporaire », « dans le dossier temporaire »), and the variable of its floor.
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
// line is written) when it begins and every <rappelMs>, and naming its wait once it waits
// (`inscrire(texte)`, which returns the removal of its name). Throws an AttenteDeLaMachine (75) at
// <borneMs> from <debut> (now by default), the start of the whole wait.
function attendreLaPlace(dossier, { inscrire, ...o }) {
  let retirer = null;
  try {
    return attendreLaPlaceEnNommant(dossier, {
      ...o,
      nommer: texte => {
        retirer ??= inscrire(texte);
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
    const t = maintenant();
    const etat = () =>
      `${disque.nom} (${dossier}) n'a que ${go(l)} libres, moins des ${go(plancher)} qu'une passe lourde demande (${disque.variable}) ; l'occupent : ${occupe(dossier)}`;
    nommer(`${disque.nom} : ${go(l)} libres sur ${go(plancher)}`);
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
 * the disk of the copy at <racine>, where the pass writes its target directories: what a pass does
 * before it plays (see the header).
 * @param {{ env?: Record<string, string | undefined>, dire?: (l: string) => void, borneMs?: number,
 *   rappelMs?: number, libre?: (dossier: string) => number, occupe?: (dossier: string) => string,
 *   occupeLaCopie?: (racine: string) => string, racine?: string,
 *   inscrire?: (texte: string) => () => void, maintenant?: () => number,
 *   dormir?: (ms: number) => void }} [o]
 *   `maintenant` and `dormir` are the clock (Date.now) and the sleep of the wait, the real ones
 *   when left out; `libre` reads the room of each disk, `occupe` what holds the temporary
 *   directory, `occupeLaCopie` the copies that hold the disk of the copy; `inscrire` names the
 *   wait (what it waits for) while it waits, and returns the removal of its name
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
  inscrire = () => () => {},
  maintenant = Date.now,
  dormir = attendreUnPeu,
} = {}) {
  const temporaire = env.TMPDIR || env.TMP || env.TEMP || tmpdir();
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
