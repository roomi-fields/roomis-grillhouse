// The tasks of the graph of the packages, which the modules of every language run the same way: the
// tests of the packages of a language, and the build of a copy for the plan of a session. A package
// of any language is a node of the graph the project's task runner reads (a `package.json` beside
// its manifest, scripts/paquet-npm.mjs), so the cache of its tasks selects what plays again, as
// Bazel's cache of a test target does, with no choice of the frame's own.
//
// The module gives <outil>, the name of the task runner, which this file does not name: the core
// names no tool (tests/unit/jointure.spec.ts).
//
// - `lancerLesTaches` runs `<outil> run <tâche>… --filter=<paquet>… --continue=dependencies-successful`
//   in the project: every task whose dependencies succeed plays to its end, a red hides no other.
//   The paths a targeted run names, and its options, reach the task in the variable
//   `GRILLHOUSE_TESTS` (`TESTS_CIBLES`), JSON `{ arguments, rejouer? }`, which the `env` of the task
//   `test:unit` names: it enters that task's hash alone, so a run by path of a package unchanged
//   replays from the cache, and another path moves the hash. `rejouer`, the moment of the run, is a
//   value no cached run holds: the task plays for real. The variable of the caller never passes on.
// - `construireDuPlan` is the command `construire --echec <fichier> <plan>` of every module, which
//   the launcher (scripts/enveloppe/lancer.sh) runs in the prepared copy: the session finds built
//   what it reads out of its plan. As Bazel builds the dependencies of a target before the target:
//   for a plan whose every path is a package of the graph, their providers are built first (the
//   builds their builds wait for, read in the runner's plan `run build --filter=<paquet>…
//   --dry=json`), and a failure stops the launch; then the traces of other packages their tests
//   wait for (`grillhouse.traces`, read in the plan of their tests), which the envelope shows
//   read-only, and a failure stops the launch. A task of either step that waits, directly or not,
//   for a task of a package of the plan (`attendentLePlan`) is not played there: as with Bazel's
//   --keep_going, a package of the plan stays a target of the plan even as another's provider, and
//   goes with the plan. Then the packages, the traces of the plan or that wait for it, and what
//   their tests read (`run build <those traces> --filter=<paquet>… --continue=dependencies-successful`),
//   whose failure does not stop the launch. Any other plan, the whole repository (`.`) included, or
//   a path that is no package of the graph, reads the graph of the whole copy dry (`run build
//   --dry=json`), whose failure stops the launch, then builds the copy whole as far as it builds
//   (`run build --continue=dependencies-successful`), whose failure does not stop the launch either.
//   A build that fails without stopping the launch writes in <fichier> the line that says which
//   build failed and what was built, then its output, which the launcher puts in the session's
//   instruction. The exit code: 0 when the launch goes on, a build failure included; 1 for a step
//   that stops it; 2 for a malformed call.
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { lireLaListe } from './enveloppe/paquets-du-plan.mjs';
import { paquets } from './paquets.mjs';
import { RESULTATS } from './resultats.mjs';
import { langage } from './langages.mjs';

/** The name of the script and of the task of the tests of a package, the same for every language. */
export const SCRIPT_DES_TESTS = 'test:unit';
// The variable that carries the paths and the options of a targeted run to the task of the tests.
export const TESTS_CIBLES = 'GRILLHOUSE_TESTS';
/**
 * Set by the composed command (./commandes-composees.mjs) to the modules of a `verifier` that
 * plays beside the module whose manifest is a package.json: that one passes over the whole graph
 * (`verifier.mjs` of typescript), so the others play no task of the graph again.
 */
export const GRAPHE_JOUE = 'GRILLHOUSE_GRAPHE_JOUE';
/** The variable that tells a module it plays after a red one: that pass keeps no green. */
export const PASSE_ROUGE = 'GRILLHOUSE_PASSE_ROUGE';
/** The form of a tranche, as Vitest's `--shard` and nextest's `--partition` read it. */
export const LA_FORME = 'i/n';

/**
 * The tranche <texte> reads, `{ index, count }`, or null when it is not `i/n` with 1 ≤ i ≤ n.
 * @param {unknown} texte
 * @returns {{ index: number, count: number } | null}
 */
export function lireLaTranche(texte) {
  const m = /^([1-9]\d*)\/([1-9]\d*)$/.exec(typeof texte === 'string' ? texte : '');
  if (!m) {
    return null;
  }
  const index = Number(m[1]);
  const count = Number(m[2]);
  return index <= count ? { index, count } : null;
}

/**
 * Whether the tests a tool cannot split play in the tranche <tranche>: in a pass without a tranche,
 * or in the first; so the n tranches together play them once.
 * @param {{ index: number, count: number } | null | undefined} tranche
 */
export const joueCeQuiNeSeDivisePas = tranche => !tranche || tranche.index === 1;

/** The beginning of the name of a trace task, the output of a package that another's tests read. */
export const TRACE = 'trace:';
const SANS_INSTALLER = '--no-install';
const ENTIERE =
  "La construction de la copie entière échoue ; ce qui n'attend pas la construction en échec est construit.";
const DU_PLAN =
  "La construction des paquets de ton plan échoue ; leurs fournisseurs et ce que leurs tests lisent sans dépendre d'eux sont construits.";

/**
 * The name of the package of the graph whose folder is <dossier> (absolute) in <racine>, the
 * `name` of its package.json; null when that folder is no package of the graph, or is out of the
 * frame.
 * @param {string} racine
 * @param {string} dossier
 * @returns {string | null}
 */
export function nomDuPaquet(racine, dossier) {
  const p = paquets(racine).find(x => !x.hors && path.join(racine, x.dossier) === dossier);
  return typeof p?.pkg?.name === 'string' ? p.pkg.name : null;
}

/**
 * Runs the tasks <taches> of the packages <noms> (all of them when <noms> is empty) with <outil> in
 * <racine>, each task whose dependencies succeed played to its end: its exit code, the runner's.
 * <tests>, when given, is the content of the variable `TESTS_CIBLES` of the run (`{ arguments,
 * rejouer? }`); the variable of <env> never passes on.
 * @param {{ outil: string, racine: string, taches: string[], noms?: Iterable<string>,
 *   tests?: { arguments: string[], rejouer?: string }, env?: NodeJS.ProcessEnv }} o
 * @returns {number}
 */
export function lancerLesTaches({ outil, racine, taches, noms = [], tests, env = process.env }) {
  const e = { ...env };
  delete e[TESTS_CIBLES];
  if (tests) {
    e[TESTS_CIBLES] = JSON.stringify(tests);
  }
  const filtres = [...new Set(noms)].sort().map(n => `--filter=${n}`);
  // A named results directory asks the runner for its summary, kept there; the summaries of a run
  // are never left in the project.
  const resume = e[RESULTATS] ? ['--summarize'] : [];
  const lanceur = langage('typescript');
  const avant = lanceur.resumesDuLancement(racine);
  const r = spawnSync(
    outil,
    ['run', ...taches, ...filtres, '--continue=dependencies-successful', ...resume],
    { cwd: racine, stdio: 'inherit', env: e }
  );
  lanceur.garderLesResumes(racine, avant, e);
  return r.status ?? 1;
}

/**
 * The content of the variable `TESTS_CIBLES` for a targeted run: the paths and options
 * <arguments> it names, and the moment of the run when <force> (the task plays for real); undefined
 * when there is nothing to carry, the variable then unset.
 * @param {{ arguments: string[], force?: boolean }} o
 * @returns {{ arguments: string[], rejouer?: string } | undefined}
 */
export function testsCibles({ arguments: donnes, force = false }) {
  if (donnes.length === 0 && !force) {
    return undefined;
  }
  return { arguments: donnes, ...(force ? { rejouer: new Date().toISOString() } : {}) };
}

/**
 * The paths and the options of a task of the tests of a package, run by its script: the paths
 * <donnes> its script names (its own folder), each replaced by the paths of the variable
 * `TESTS_CIBLES` of <env> that lie in the same component (<dossierDe>, from an absolute path, the
 * variable or null), and the options of the variable. A task with no path of the
 * variable in its component plays whole what its script names. `tranche`: the tranche of a pass the
 * variable carries (`verifier --tranche i/n`), `{ index, count }`, or null; the module of the
 * language plays its part of the tests in it.
 * @param {{ racine: string, donnes: string[], env?: NodeJS.ProcessEnv,
 *   dossierDe: (absolu: string) => string | null }} o
 * @returns {{ chemins: string[], options: string[], tranche: { index: number, count: number } | null }}
 */
export function cheminsDeLaTache({ racine, donnes, env = process.env, dossierDe }) {
  let variable = [];
  let tranche = null;
  try {
    const lu = JSON.parse(env[TESTS_CIBLES] ?? '{}');
    variable = Array.isArray(lu?.arguments) ? lu.arguments.map(String) : [];
    tranche = lireLaTranche(lu?.tranche);
  } catch {
    variable = [];
  }
  const nommes = variable.filter(a => !a.startsWith('-'));
  const dossier = chemin => dossierDe(path.resolve(racine, chemin));
  const chemins = donnes.flatMap(g => {
    const d = dossier(g);
    const siens = d === null ? [] : nommes.filter(n => dossier(n) === d);
    return siens.length ? siens : [g];
  });
  return {
    chemins: [...new Set(chemins)],
    options: variable.filter(a => a.startsWith('-')),
    tranche,
  };
}

/**
 * The trace tasks of a plan of the runner (`run … --dry=json`, parsed), its tasks that <garder>
 * keeps: their task ids (`<producer>#trace:<name>`), sorted.
 * @param {{ tasks: { task: string, taskId: string }[] }} plan
 * @param {(t: any) => boolean} [garder]
 * @returns {string[]}
 */
export const tracesDuPlan = (plan, garder = () => true) =>
  plan.tasks
    .filter(t => t.task.startsWith(TRACE) && garder(t))
    .map(t => t.taskId)
    .sort();

/**
 * The tasks of a plan of the runner (`run … --dry=json`, parsed) that wait, directly or not, for a
 * task of one of the packages <paquets>, those tasks included: their task ids. As Bazel under
 * --keep_going, a task that waits for a target of the plan goes with the plan, whose failure is the
 * session's work; the others are the plan's providers.
 * @param {{ tasks: { taskId: string, package: string, dependencies?: string[] }[] }} plan
 * @param {string[]} paquets
 * @returns {Set<string>}
 */
function attendentLePlan(plan, paquets) {
  const parId = new Map(plan.tasks.map(t => [t.taskId, t]));
  const verdicts = new Map();
  const attend = id => {
    if (verdicts.has(id)) {
      return verdicts.get(id);
    }
    // A cycle of tasks is no wait on the plan by itself; the runner refuses it anyway.
    verdicts.set(id, false);
    const t = parId.get(id);
    const v =
      t !== undefined && (paquets.includes(t.package) || (t.dependencies ?? []).some(attend));
    verdicts.set(id, v);
    return v;
  };
  return new Set(plan.tasks.map(t => t.taskId).filter(attend));
}

class Arret extends Error {}

// The runner with <args> in <racine>, its output on this process's; throws Arret on a failure.
function jouer(outil, racine, args) {
  const r = spawnSync('npx', [SANS_INSTALLER, outil, ...args], { cwd: racine, stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Arret(`${outil} ${args.join(' ')}`);
  }
}

// The plan of the runner of <args> in <racine>, parsed; throws Arret on a failure.
function plan(outil, racine, args) {
  const r = spawnSync('npx', [SANS_INSTALLER, outil, ...args, '--dry=json'], {
    cwd: racine,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (r.status !== 0) {
    throw new Arret(`${outil} ${args.join(' ')} --dry=json`);
  }
  return JSON.parse(r.stdout);
}

/**
 * The hashes of the inputs of the tests tasks of the packages <noms> (by their package name) and
 * of their dependents, as the runner <outil> plans them in <racine> (the hash of a task covers the
 * content of the files it reads and of the tasks it waits for): `{ <paquet>: <hash> }`; null when
 * the runner gives no plan. The fingerprint of a step of the circuit reads it
 * (scripts/reprise.mjs).
 * @param {string} outil the task runner
 * @param {string} racine
 * @param {string[]} noms
 * @returns {Record<string, string> | null}
 */
export function empreintesDesTaches(outil, racine, noms) {
  if (!noms.length) {
    return {};
  }
  try {
    const graphe = plan(outil, racine, [
      'run',
      SCRIPT_DES_TESTS,
      ...noms.map(n => `--filter=...${n}`),
    ]);
    return Object.fromEntries((graphe.tasks ?? []).map(t => [t.package, t.hash]));
  } catch {
    return null;
  }
}

// The build <args> in <racine>, its output in <echec> then on this process's: when it fails,
// <echec> holds <ligne> then that output, and the warning <alerte> follows it.
function construireJusquOuIlConstruit(outil, racine, args, echec, ligne, alerte) {
  const fd = openSync(echec, 'w');
  let r;
  try {
    r = spawnSync('npx', [SANS_INSTALLER, outil, ...args], {
      cwd: racine,
      stdio: ['ignore', fd, fd],
    });
  } finally {
    closeSync(fd);
  }
  const sortie = readFileSync(echec, 'utf8');
  process.stdout.write(sortie);
  if (r.status === 0) {
    writeFileSync(echec, '');
    return;
  }
  process.stdout.write(`${alerte}\n`);
  writeFileSync(echec, `${ligne}\n${sortie}`);
}

/**
 * Builds the copy at <racine> for the plan <liste> with <outil>, the failure of a build that does
 * not stop the launch written in <echec>: the exit code (see the header).
 * @param {string} outil the task runner
 * @param {string} racine the root of the copy
 * @param {string} liste the plan, in the form of the envelope's variable
 * @param {string} echec the file of a build that fails
 * @returns {number}
 */
function construire(outil, racine, liste, echec) {
  writeFileSync(echec, '');
  const tous = paquets(racine).filter(p => !p.hors);
  const noms = lireLaListe(liste).map(
    d => tous.find(p => p.dossier === path.normalize(d).replace(/\/$/, ''))?.pkg.name ?? null
  );
  try {
    if (noms.length === 0 || !noms.every(Boolean)) {
      plan(outil, racine, ['run', 'build']);
      construireJusquOuIlConstruit(
        outil,
        racine,
        ['run', 'build', '--continue=dependencies-successful'],
        echec,
        ENTIERE,
        "⚠️  La construction de la copie échoue : la séance s'ouvre, la consigne porte l'erreur."
      );
      return 0;
    }
    const cibles = noms.map(n => `--filter=${n}`);
    // Their providers: the builds their own builds wait for, save those that wait for a package
    // of the plan, which go with the plan below.
    const graphe = plan(outil, racine, ['run', 'build', ...cibles]);
    const avecLePlan = attendentLePlan(graphe, noms);
    const fournisseurs = graphe.tasks
      .map(t => t.taskId)
      .filter(id => !avecLePlan.has(id))
      .sort();
    if (fournisseurs.length) {
      jouer(outil, racine, ['run', ...fournisseurs]);
    }
    // The traces their tests wait for: another package's trace that waits for no package of the
    // plan is produced here, a failure stopping the launch, as a provider's; a trace of the plan,
    // or one that waits for it, is produced with the plan below.
    const tests = plan(outil, racine, ['run', SCRIPT_DES_TESTS, ...cibles]);
    const attend = attendentLePlan(tests, noms);
    const autres = tracesDuPlan(tests, t => !attend.has(t.taskId));
    if (autres.length) {
      jouer(outil, racine, ['run', ...autres]);
    }
    const avec = tracesDuPlan(tests, t => attend.has(t.taskId));
    construireJusquOuIlConstruit(
      outil,
      racine,
      [
        'run',
        'build',
        ...avec,
        ...noms.map(n => `--filter=${n}...`),
        '--continue=dependencies-successful',
      ],
      echec,
      DU_PLAN,
      `⚠️  La construction du plan (${noms.join(' ')}) échoue : la séance s'ouvre, la consigne porte l'erreur.`
    );
    return 0;
  } catch (e) {
    if (!(e instanceof Arret)) {
      throw e;
    }
    process.stderr.write(`⛔ ${e.message} échoue.\n`);
    return 1;
  }
}

/**
 * The command `construire --echec <fichier> <plan>` of a module, run from the root of the copy:
 * its exit code. <args> are the arguments after the command's name; a call without the file of a
 * failure and a plan is refused (2).
 * @param {string} outil the task runner
 * @param {string[]} args
 * @param {string} [racine]
 * @returns {number}
 */
export function construireDepuisLesArguments(outil, args, racine = process.cwd()) {
  const i = args.indexOf('--echec');
  const echec = i >= 0 ? args[i + 1] : undefined;
  const reste = i >= 0 ? [...args.slice(0, i), ...args.slice(i + 2)] : args;
  if (!echec || reste.length !== 1) {
    process.stderr.write('usage: construire --echec <fichier> <plan>\n');
    return 2;
  }
  return construire(outil, racine, reste[0], echec);
}

/**
 * The tasks of the verdict of a language that does not read the summary of the task runner itself
 * (cargo, python): those of the summary under the results directory <dossier>, read by the module
 * that drives the runner, then each of <ecrites> (the tasks the module wrote) whose id the summary
 * lacks. A task of the tests that the cache replayed, with no exit code, is a success without
 * report (code 0).
 * @template {{ tache: string }} T
 * @param {string} dossier
 * @param {T[]} ecrites
 * @returns {Array<import('./jointure.js').TacheDuResume | T>}
 */
export function tachesDuVerdict(dossier, ecrites) {
  const resumees = langage('typescript')
    .lireLesResumes(dossier)
    .map(t => (t.tests && t.code === null && t.cache === 'HIT' ? { ...t, code: 0 } : t));
  const ids = new Set(resumees.map(t => t.tache));
  return [...resumees, ...ecrites.filter(t => !ids.has(t.tache))];
}
