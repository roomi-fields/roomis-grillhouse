// The dedicated cores of a measure of time: the cores a measure plays on alone, the rest of the
// machine going on working, as the benches of rustc-perf and `pyperf system tune` isolate cores and
// pin the measure to them, as the static policy of the CPU Manager of Kubernetes gives a pod of the
// guaranteed class cores of its own, and as Slurm binds a job to its cores. Functions with the
// system as input (what it reads is passed in, nothing is changed here):
// - The key `grillhouse.mesure` of a project (`{ "coeurs": <integer ≥ 1> }`) and the number of
//   dedicated cores: the default one is 3 (`COEURS_PAR_DEFAUT`).
// - The topology of the system (the sibling threads of a core, the memory node): a unit of
//   dedicated core is a physical core whole, its sibling threads with it. The count stays in
//   threads (« cores » of the budget), as the budget does.
// - The choice of the precise threads (`choisirLesCoeurs`), a pure function of the budget, the
//   topology, the threads held and the request.
// - How the measure is attached (`attacheDesCoeurs`): in control groups whose allowed cores are
//   fixed when the system delegates the cpuset controller to the account, else by the affinity
//   of the launch, else not at all.
// - The rest of the dedicated cores: the load of those cores alone, read from /proc/stat.
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { spawnSync } from 'node:child_process';
import { paquetsDeLEnveloppe } from './enveloppe/paquets-du-plan.mjs';
import { COEURS_PAR_DEFAUT } from './plafond-de-la-machine.mjs';

/** The tool that pins a command, and its children, to cores (util-linux). */
export const OUTIL_D_AFFINITE = 'taskset';

/** The load of the dedicated cores, out of the measure, above which they are not at rest: 10 %. */
export const SEUIL_DE_CHARGE = 0.1;

/**
 * The cores a project declares for its measures in the key `grillhouse.mesure` of its
 * `package.json` <pkg> (`{ coeurs }`): `{ declaree, faute }`, `declaree` null without the key,
 * `faute` the line that names the key and what is wrong when it is.
 * @param {{ grillhouse?: { mesure?: unknown } }} pkg
 * @returns {{ declaree: { coeurs?: number } | null, faute: string | null }}
 */
export function mesureDeclareeDe(pkg) {
  const mesure = pkg?.grillhouse?.mesure;
  if (mesure === undefined) {
    return { declaree: null, faute: null };
  }
  const faute = dit => ({
    declaree: null,
    faute: `grillhouse.mesure : ${dit} ({ "coeurs": <entier ≥ 1> } est attendu).`,
  });
  if (mesure === null || typeof mesure !== 'object' || Array.isArray(mesure)) {
    return faute(`« ${JSON.stringify(mesure)} » n’est pas un objet`);
  }
  const inconnue = Object.keys(mesure).find(k => k !== 'coeurs');
  if (inconnue !== undefined) {
    return faute(`la clé « ${inconnue} » est inconnue`);
  }
  const { coeurs } = mesure;
  if (coeurs !== undefined && !(Number.isInteger(coeurs) && coeurs >= 1)) {
    return faute(`coeurs vaut ${JSON.stringify(coeurs)}`);
  }
  return { declaree: coeurs === undefined ? {} : { coeurs }, faute: null };
}

/**
 * The number of dedicated cores (threads) a measure asks for: the one its project declares, else
 * the default part of the budget; within the budget and one at least.
 * @param {{ declaree: { coeurs?: number } | null, budget: { coeurs: number, memoire: number },
 *   places: number }} o
 * @returns {number}
 */
export function coeursDeLaMesureDe({ declaree, budget }) {
  const voulus = declaree?.coeurs ?? COEURS_PAR_DEFAUT;
  return Math.max(1, Math.min(budget.coeurs, voulus));
}

// The threads of a list of the system, « 0-1,4 » → [0, 1, 4]; null when it does not read.
function fils(texte) {
  if (typeof texte !== 'string' || texte.trim() === '') {
    return null;
  }
  const sortie = [];
  for (const morceau of texte.trim().split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(morceau.trim());
    if (!m) {
      return null;
    }
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    for (let i = a; i <= b; i++) {
      sortie.push(i);
    }
  }
  return sortie;
}

const lireUnFichier = chemin => {
  try {
    return readFileSync(chemin, 'utf8');
  } catch {
    return null;
  }
};

/**
 * The topology of the system: `{ lisible, coeurs: [{ fils, noeud }] }`, each physical core its
 * sibling threads and its memory node. A topology that does not read (a thread whose siblings are
 * unknown) counts each thread as a core, `lisible` false; nodes that do not read put every core
 * on one node.
 * @param {{ lire?: (chemin: string) => string | null, nombreDeFils?: number }} [o] `lire`, the
 *   reading of a file of the system (null when it does not read), for a trial
 * @returns {{ lisible: boolean, coeurs: { fils: number[], noeud: number }[] }}
 */
export function lireLaTopologie({ lire = lireUnFichier, nombreDeFils = availableParallelism() } = {}) {
  const cpu = n => `/sys/devices/system/cpu/cpu${n}/topology/thread_siblings_list`;
  const groupes = new Map();
  let lisible = true;
  for (let n = 0; n < nombreDeFils && lisible; n++) {
    const freres = fils(lire(cpu(n)));
    if (freres === null || !freres.includes(n)) {
      lisible = false;
    } else {
      groupes.set(freres.join(','), freres);
    }
  }
  if (!lisible) {
    return {
      lisible: false,
      coeurs: Array.from({ length: nombreDeFils }, (_, f) => ({ fils: [f], noeud: 0 })),
    };
  }
  const noeudDe = new Map();
  for (const noeud of fils(lire('/sys/devices/system/node/online')) ?? []) {
    for (const f of fils(lire(`/sys/devices/system/node/node${noeud}/cpulist`)) ?? []) {
      noeudDe.set(f, noeud);
    }
  }
  const coeurs = [...groupes.values()]
    .map(f => [...f].sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0])
    .map(f => ({ fils: f, noeud: noeudDe.get(f[0]) ?? 0 }));
  return { lisible: true, coeurs };
}

/**
 * A list of threads as the system writes it, sorted, the runs in intervals: [0, 1, 2, 5] → « 0-2,5 ».
 * @param {number[]} liste
 * @returns {string}
 */
export function listeDeCoeurs(liste) {
  const tri = [...new Set(liste)].sort((a, b) => a - b);
  const morceaux = [];
  for (let i = 0; i < tri.length; ) {
    let j = i;
    while (j + 1 < tri.length && tri[j + 1] === tri[j] + 1) {
      j++;
    }
    morceaux.push(j === i ? String(tri[i]) : `${tri[i]}-${tri[j]}`);
    i = j + 1;
  }
  return morceaux.join(',');
}

/**
 * The precise threads of the budget <budget> (a count of threads): physical cores whole, in the
 * order of the topology, their sibling threads with them, the last one cut when the budget does
 * not end on a core.
 * @param {{ topologie: { coeurs: { fils: number[] }[] }, budget: number }} o
 * @returns {number[]}
 */
export function budgetEnFils({ topologie, budget }) {
  const choisis = [];
  for (const c of topologie.coeurs) {
    for (const f of c.fils) {
      if (choisis.length < budget) {
        choisis.push(f);
      }
    }
  }
  return choisis;
}

// The cores of the budget whole (every sibling thread in it), in the order of the topology.
const coeursEntiersDuBudget = (topologie, budget) =>
  topologie.coeurs.filter(c => c.fils.every(f => budget.includes(f)));

// The cores to take to give <demande> threads, rounded up to a whole core while the cores
// <disponibles> allow it, else all they give, one core at least; the threads they hold.
const taille = coeurs => coeurs.reduce((n, c) => n + c.fils.length, 0);
function cible(disponibles, demande) {
  const n = [];
  let somme = 0;
  for (const c of disponibles) {
    if (somme >= demande) {
      break;
    }
    n.push(c);
    somme += c.fils.length;
  }
  return n.length;
}

/**
 * The threads a measure of time of <demande> threads takes, rounded up to physical cores whole
 * while the budget allows it, down otherwise, one core at least; null when the budget holds no
 * whole core.
 * @param {{ budget: number[], topologie: { coeurs: { fils: number[], noeud: number }[] },
 *   demande: number }} o
 * @returns {number | null}
 */
export function filsDeLaMesure({ budget, topologie, demande }) {
  const entiers = coeursEntiersDuBudget(topologie, budget);
  const n = cible(entiers, demande);
  return n === 0 ? null : taille(entiers.slice(0, n));
}

/**
 * The precise threads of a pass of <demande> threads: for a measure (<dedies>), physical cores
 * whole rounded as `filsDeLaMesure` says, none of whose threads is held, of one memory node when a
 * node holds them, else of the fewest; for an ordinary pass, threads of the budget not held, the
 * cores that are whole free first. A pure function: null when what is left does not hold the
 * request.
 * @param {{ budget: number[], topologie: { coeurs: { fils: number[], noeud: number }[] },
 *   tenus: number[], demande: number, dedies: boolean }} o
 * @returns {number[] | null}
 */
export function choisirLesCoeurs({ budget, topologie, tenus, demande, dedies }) {
  const pris = new Set(tenus);
  const dansLeBudget = new Set(budget);
  if (!dedies) {
    const entiers = [];
    const partiels = [];
    for (const c of topologie.coeurs) {
      const libres = c.fils.filter(f => dansLeBudget.has(f) && !pris.has(f));
      (libres.length === c.fils.length ? entiers : partiels).push(...libres);
    }
    const libres = [...entiers, ...partiels];
    return libres.length < demande ? null : libres.slice(0, demande);
  }
  const voulu = filsDeLaMesure({ budget, topologie, demande });
  if (voulu === null) {
    return null;
  }
  const libres = coeursEntiersDuBudget(topologie, budget).filter(c =>
    c.fils.every(f => !pris.has(f))
  );
  const parNoeud = new Map();
  for (const c of libres) {
    parNoeud.set(c.noeud, [...(parNoeud.get(c.noeud) ?? []), c]);
  }
  const prendre = coeurs => {
    const n = cible(coeurs, voulu);
    const choisis = coeurs.slice(0, n);
    return taille(choisis) >= voulu ? choisis.flatMap(c => c.fils) : null;
  };
  // One node that holds the request, the tightest; else the nodes with the most free cores first.
  const qui = [...parNoeud.entries()]
    .filter(([, c]) => taille(c) >= voulu)
    .sort((a, b) => taille(a[1]) - taille(b[1]) || a[0] - b[0]);
  if (qui.length > 0) {
    return prendre(qui[0][1]);
  }
  const ordre = [...parNoeud.entries()]
    .sort((a, b) => taille(b[1]) - taille(a[1]) || a[0] - b[0])
    .flatMap(([, c]) => c);
  return prendre(ordre);
}

/**
 * Whether the controller of the cores (`cpuset`) is among the controllers the system delegates to
 * the account, read from its `cgroup.controllers`.
 * @param {string | null} texte
 * @returns {boolean}
 */
export const delegationDesCoeurs = texte =>
  typeof texte === 'string' && texte.split(/\s+/).includes('cpuset');

// What the system gives, asked once by process.
let delegue = null;
const delegationDuSysteme = () => {
  const uid = process.getuid?.() ?? 0;
  delegue ??= delegationDesCoeurs(
    lireUnFichier(
      `/sys/fs/cgroup/user.slice/user-${uid}.slice/user@${uid}.service/cgroup.controllers`
    )
  );
  return delegue;
};
let attache = null;
const affiniteDuSysteme = () => {
  attache ??=
    spawnSync(OUTIL_D_AFFINITE, ['-c', '0', 'true'], { stdio: 'ignore', timeout: 20_000 }).status ===
    0;
  return attache;
};

/**
 * How a measure is attached to its dedicated cores: `{ voie, dit }`. `voie` « groupe » (the
 * controller of the cores is delegated to the account: control groups whose allowed cores are
 * fixed, and the programs out of the frame kept away from the dedicated cores), « affinite » (the
 * affinity of the launch, children included; `dit` says once that the programs out of the frame
 * are not kept away, and the poste's setting that delegates the controller), « aucune » (the
 * envelope of an agent, or a system with neither: the measure plays without a part held, `dit`
 * says it). The system is asked only out of the envelope.
 * @param {{ env: Record<string, string | undefined>, delegation?: () => boolean,
 *   affinite?: () => boolean }} o
 * @returns {{ voie: 'groupe' | 'affinite' | 'aucune', dit: string | null }}
 */
export function attacheDesCoeurs({
  env,
  delegation = delegationDuSysteme,
  affinite = affiniteDuSysteme,
}) {
  if (paquetsDeLEnveloppe(env) !== null) {
    return {
      voie: 'aucune',
      dit: "dans l'enveloppe d'un agent, la mesure joue sans part tenue : ses cœurs ne sont ni réservés ni attachés.",
    };
  }
  if (delegation()) {
    return { voie: 'groupe', dit: null };
  }
  if (affinite()) {
    return {
      voie: 'affinite',
      dit: 'les programmes hors du cadre ne sont pas tenus à l’écart des cœurs dédiés : le réglage du poste est `Delegate=cpuset cpu io memory pids` dans un fichier de `user@.service.d/` (le contrôleur cpuset délégué au compte).',
    };
  }
  return {
    voie: 'aucune',
    dit: 'la mesure joue sans part tenue : ce système ne délègue pas le contrôleur cpuset au compte et ne donne pas l’affinité de lancement (taskset).',
  };
}

/**
 * The command that keeps the programs out of the frame away from the dedicated cores <dedies>:
 * the cores their group (`app.slice` of the user's manager) may use are the threads <fils> but
 * them; all of them without a measure under way.
 * @param {{ dedies: number[], fils: number[] }} o
 * @returns {{ cmd: string, args: string[] }}
 */
export function ecartDesProgrammes({ dedies, fils: tous }) {
  const permis = tous.filter(f => !dedies.includes(f));
  return {
    cmd: 'systemctl',
    args: ['--user', 'set-property', '--runtime', 'app.slice', `AllowedCPUs=${listeDeCoeurs(permis)}`],
  };
}

/**
 * The busy and the total time of each thread, from the text of /proc/stat (hundredths of a
 * second): busy is user, nice, system, irq, softirq and steal; idle and iowait are rest. Null
 * when the text does not read.
 * @param {string | null} texte
 * @returns {Record<number, { occupe: number, total: number }> | null}
 */
export function lireLesTempsOccupes(texte) {
  if (typeof texte !== 'string') {
    return null;
  }
  const temps = {};
  for (const ligne of texte.split('\n')) {
    const m = /^cpu(\d+)\s+(.*)$/.exec(ligne);
    if (!m) {
      continue;
    }
    const [user, nice, system, idle, iowait, irq, softirq, steal] = m[2]
      .split(/\s+/)
      .map(Number);
    const occupe = user + nice + system + irq + softirq + steal;
    temps[Number(m[1])] = { occupe, total: occupe + idle + iowait };
  }
  return temps;
}

/**
 * The load of the dedicated threads <fils> out of the measure between two readings of the times
 * (`lireLesTempsOccupes`): their busy time less <mesureNs> (the measure's own, read from its
 * group) over their capacity, never under zero; null when a reading lacks.
 * @param {{ avant: Record<number, { occupe: number, total: number }> | null,
 *   apres: Record<number, { occupe: number, total: number }> | null, fils: number[],
 *   mesureNs?: number }} o
 * @returns {number | null}
 */
export function chargeHorsMesure({ avant, apres, fils: dedies, mesureNs = 0 }) {
  if (!avant || !apres || dedies.length === 0) {
    return null;
  }
  let occupe = 0;
  let total = 0;
  for (const f of dedies) {
    if (!avant[f] || !apres[f]) {
      return null;
    }
    occupe += apres[f].occupe - avant[f].occupe;
    total += apres[f].total - avant[f].total;
  }
  if (!(total > 0)) {
    return null;
  }
  // A hundredth of a second is 1e7 ns.
  return Math.max(0, occupe - mesureNs / 1e7) / total;
}

/**
 * The exit code of a measure of time: a red (1) played while the dedicated cores were loaded out of
 * it beyond SEUIL_DE_CHARGE is « à repasser » (75); any other code stays, and so does a red
 * without a reading of the load.
 * @param {{ code: number, charge: number | null }} o
 * @returns {number}
 */
export function codeDeLaMesure({ code, charge }) {
  return code === 1 && charge !== null && charge > SEUIL_DE_CHARGE ? 75 : code;
}

/**
 * Reads the load of the dedicated threads <fils> out of any measure over <ms> (two readings of
 * /proc/stat, spaced): null without a reading.
 * @param {number[]} fils
 * @param {{ lire?: () => string | null, dormir?: (ms: number) => void }} [o]
 * @returns {number | null}
 */
export function chargeDesCoeursDuSysteme(fils, { lire = () => lireUnFichier('/proc/stat'), dormir } = {}) {
  const avant = lireLesTempsOccupes(lire());
  (dormir ?? attendre)(1000);
  return chargeHorsMesure({ avant, apres: lireLesTempsOccupes(lire()), fils });
}

function attendre(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** The text of /proc/stat, null when it does not read. */
export const tempsDuSysteme = () => lireUnFichier('/proc/stat');
