#!/usr/bin/env node
// The commands of the module python, the demand `commandes` of the join (scripts/jointure.d.ts):
// each one this script with its name first, `{ script, args }`, described, never run, by
// `commandes`; run by `grillhouse <commande>` in the root of the project, its arguments after.
//
//   npx grillhouse tests [--force] [<chemin>…] [--<option>…]   tester
//   npx grillhouse verifier [--tout | --gardes]                 verifier
//   node commandes.mjs typer                                    typer
//   npx grillhouse preparer                                     preparer
//   npx grillhouse tests-de-nuit                                tests-de-nuit
//   npx grillhouse tailles-des-tests | index-interfaces         each guard, its own script
//
// - Each command plays in the folder of each package (./composants.mjs), one after the other, by
//   uv, which reads its pyproject.toml, its uv.lock (`--locked`: a lock out of date is refused, as
//   `npm ci`), and the Python its `requires-python` and its `.python-version` ask.
// - `tester` plays pytest in each package that plays tests: `uv run --locked --group test pytest`,
//   the group `test` holding pytest and what the tests depend on, its JUnit report in the family
//   `xunit1` (./verdict.mjs). A path, written from the root, chooses the package that holds it,
//   and pytest plays that path alone; a path out of every package is refused, named, and nothing
//   plays (code 2). Without a path, every package that plays tests plays, or, under the circuit's
//   mark (`GRILLHOUSE_DEPUIS_LE_VERT`), the packages the changes since the last green touch
//   (./lot.mjs), every package when no last green counts; the night tests (`*_nuit_test.py`) are
//   left out (`--ignore-glob`), and a night test plays when its own file is named. `--force`
//   changes nothing: pytest keeps no result to replay. Another option goes to pytest.
// - `verifier` plays, in each package the changes since the last green touch (every package with
//   `--tout`, or when no last green counts), the typing then the tests of the day; green, it keeps
//   the last green (scripts/dernier-vert.mjs). It plays under the lock of the machine
//   (`avecLaMachine` of ./jointure), as the module cargo's. `verifier --gardes` plays the guards
//   alone: the project's root scripts `grillhouse:gardes` then `gardes` the package.json holds.
// - `typer`: `uv run --locked python -m compileall`, the folders whose name begins with a dot (the
//   `.venv`) left out. `preparer`: `uv sync --locked --group test`.
// - `tests-de-nuit`: pytest on the night tests of each package that holds some; none, nothing
//   plays and the code is 0. The night (scripts/nuit.sh) runs it.
// - Each command plays under a temporary directory of its pass, the guard of the temporary
//   directory: a base (`ouvrirBase` of ./jointure) named in TMPDIR, TMP and TEMP, removed at the
//   end of the pass, green, red or interrupted; what the tests left there fails the pass (code 1),
//   each name written on the error stream, the lock files uv takes there (`uv-<hash>.lock`) apart,
//   which the base removes with the rest. A test makes its temporary
//   directory or file with `tempfile` (`TemporaryDirectory`, `NamedTemporaryFile`), removed at
//   its end, a failed test included, never `mkdtemp` by hand.
// - Python writes its bytecode under one tree at the root, `__pycache__` (PYTHONPYCACHEPREFIX),
//   which the envelope makes proper to the session (`sorties.propres` of ./index.mjs); uv the
//   environment of each package under `.venv/<dossier>` at the root (UV_PROJECT_ENVIRONMENT), and
//   pytest its cache under `.pytest_cache/<dossier>` (`cache_dir`), where the envelope opens them
//   in writing, rather than in the package's folder, which a session whose plan does not write the
//   package could not write.
// - While the environment names a results directory (`GRILLHOUSE_RESULTATS`), the run writes
//   there what ./verdict.mjs reads: its tasks, each planned before it plays, and the JUnit report
//   of each run of pytest.
// - uv absent from the PATH: one line that names it and `npx grillhouse maj`, which installs it.
// - The exit code: 0 when every task is green, 75 when the only reds are « à repasser », 1
//   otherwise; 2 for a path refused or a command unknown.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RESULTATS } from '../../resultats.mjs';
import {
  AttenteDeLaMachine,
  avecLaMachine,
  CHANGEMENTS,
  DEPUIS_LE_VERT,
  garderLeVert,
  ligneDesRestes,
  mesure,
  ouvrirBase,
  retirerALInterruption,
} from '../../services-du-noyau.mjs';
import {
  composantDans,
  composants,
  estDeNuit,
  fichiersDeTest,
  GROUPE,
  joueDesTests,
} from './composants.mjs';
import { touchesDesFichiers } from './lot.mjs';
import { JUNIT, TACHES } from './verdict.mjs';

const ICI = fileURLToPath(import.meta.url);
export const NOMS = ['tester', 'verifier', 'typer', 'preparer', 'tests-de-nuit'];
const A_REPASSER = 75;
const RACINE = '//';
/** The night tests, which the day leaves out. */
export const DE_NUIT = '*_nuit_test.py';
/** The tree of the bytecode of Python, at the root. */
export const PYCACHE = '__pycache__';
/** The environments of uv and the caches of pytest, one per package, at the root. */
export const VENV = '.venv';
export const CACHE_DE_PYTEST = '.pytest_cache';

/** The guards of the module: each its name and its script beside this one. */
export const GARDES = [
  { nom: 'tailles-des-tests', args: [] },
  { nom: 'index-interfaces', args: ['--verifier'] },
].map(g => ({
  ...g,
  script: path.join(path.dirname(ICI), `${g.nom}.mjs`),
}));

/** The commands of the module, each this script and its name; then each guard, its script. */
export const commandes = () =>
  Object.fromEntries([
    ...NOMS.map(n => [n, { script: ICI, args: [n] }]),
    ...GARDES.map(g => [g.nom, { script: g.script, args: [] }]),
  ]);

// The run of the tasks of a command in <racine>: each planned, then played, written in the
// results directory <env> names.
function passe(racine, env) {
  const dossier = env[RESULTATS] || null;
  const id = `${Date.now()}-${process.pid}`;
  const taches = [];
  const rapports = {};
  const environnement = { ...env, PYTHONPYCACHEPREFIX: path.join(racine, PYCACHE) };
  const ecrire = () => {
    if (!dossier) {
      return;
    }
    mkdirSync(path.join(dossier, TACHES), { recursive: true });
    writeFileSync(
      path.join(dossier, TACHES, `${id}.json`),
      `${JSON.stringify({ taches, rapports }, null, 2)}\n`
    );
  };
  return {
    racine,
    prevoir(paquet, dossierDuPaquet, script, tests, args, programme = 'uv') {
      const t = {
        tache: `${paquet}#${script}`,
        paquet,
        dossier: path.relative(racine, dossierDuPaquet) || '.',
        script,
        tests,
        code: null,
        cache: null,
        journal: null,
      };
      taches.push(t);
      ecrire();
      return { t, args, cwd: dossierDuPaquet, programme };
    },
    // The JUnit report of a run of pytest of the package <nom> at <dossierDuPaquet>, its option;
    // none without a results directory.
    junit(nom, dossierDuPaquet) {
      if (!dossier) {
        return [];
      }
      const f = `${id}-${nom}.xml`;
      rapports[f] = dossierDuPaquet;
      return ['-o', 'junit_family=xunit1', `--junit-xml=${path.join(dossier, JUNIT, f)}`];
    },
    jouer({ t, args, cwd, programme }) {
      // The environment of uv of the package, at the root (`sorties` of ./index.mjs).
      const venv = path.join(racine, VENV, path.relative(racine, cwd));
      const r = spawnSync(programme, args, {
        cwd,
        env: { ...environnement, UV_PROJECT_ENVIRONMENT: venv },
        stdio: 'inherit',
      });
      if (r.error?.code === 'ENOENT' && programme === 'uv') {
        process.stderr.write("⛔ uv absent du PATH : `npx grillhouse maj` l'installe.\n");
      }
      t.code = r.error ? 127 : (r.status ?? 128 + (constants.signals[r.signal] ?? 0));
      ecrire();
      return t.code;
    },
    code() {
      const rouges = taches.filter(t => t.code !== 0);
      if (rouges.length === 0) {
        return 0;
      }
      return rouges.every(t => t.code === A_REPASSER) ? A_REPASSER : 1;
    },
  };
}

const UV_RUN = ['run', '--locked'];

// Plays pytest in the run <p> for each `{ c, chemins }` of <choix>, `chemins` from the package's
// folder (empty: the whole package, the night left out), <options> given to pytest.
function jouerLesTests(p, choix, options) {
  for (const { c, chemins } of choix) {
    const selection = chemins.length ? chemins : [`--ignore-glob=${DE_NUIT}`];
    const cache = path.join(p.racine, CACHE_DE_PYTEST, path.relative(p.racine, c.dossier));
    const args = [...UV_RUN, '--group', GROUPE, 'pytest', '-o', `cache_dir=${cache}`];
    args.push(...p.junit(c.nom, c.dossier));
    p.jouer(p.prevoir(c.nom, c.dossier, 'pytest', true, [...args, ...selection, ...options]));
  }
}

// The packages the changes since the last green of <racine> touch; every package with <tout> or
// without a last green that counts. `{ choix, m }`, `m` the measure.
function depuisLeVert(racine, tous, tout, env) {
  const m = mesure(racine, { tout, dans: env.TMPDIR });
  process.stderr.write(`${m.ligne}\n`);
  const f = m.env[CHANGEMENTS];
  if (!f) {
    return { choix: tous, m };
  }
  const ch = JSON.parse(readFileSync(f, 'utf8'));
  const t = touchesDesFichiers(racine, [...ch.fichiers, ...ch.supprimes]);
  const nommes = new Set(t.touches.map(c => c.dossier));
  return { choix: tous.filter(c => nommes.has(c.dossier)), m };
}

// The packages the paths <chemins> choose in <racine>: `{ choix }`, or `{ refus }`.
function choisir(racine, tous, chemins) {
  const parDossier = new Map();
  const refus = [];
  for (const chemin of chemins) {
    const c = composantDans(tous, racine, chemin);
    if (!c) {
      refus.push(`${chemin} : hors de tout paquet Python (pyproject.toml)`);
      continue;
    }
    const rel = path.relative(c.dossier, path.resolve(racine, chemin)) || '.';
    const deja = parDossier.get(c.dossier) ?? { c, chemins: [] };
    deja.chemins.push(rel);
    parDossier.set(c.dossier, deja);
  }
  return refus.length ? { refus } : { choix: [...parDossier.values()] };
}

// The pass of `tester` in <racine>, its arguments <args>, under <env>.
function tester(racine, args, env) {
  const p = passe(racine, env);
  const tous = composants(racine);
  const chemins = args.filter(a => !a.startsWith('-'));
  const options = args.filter(a => a.startsWith('-') && a !== '--force');
  if (chemins.length) {
    const r = choisir(racine, tous, chemins);
    if (r.refus) {
      for (const l of r.refus) {
        process.stderr.write(`⛔ ${l}\n`);
      }
      return 2;
    }
    jouerLesTests(p, r.choix, options);
    return p.code();
  }
  let m = null;
  let choix = tous;
  if (env[DEPUIS_LE_VERT]) {
    ({ choix, m } = depuisLeVert(racine, tous, args.includes('--force'), env));
  }
  try {
    const avec = choix.filter(c => joueDesTests(racine, c)).map(c => ({ c, chemins: [] }));
    jouerLesTests(p, avec, options);
  } finally {
    m?.retirer();
  }
  return p.code();
}

// The pass of `verifier` in <racine>, under the lock of the machine: the typing and the tests of
// the packages the changes since the last green touch; green, it keeps the last green.
function verifier(racine, args, env) {
  const p = passe(racine, env);
  if (args.includes('--gardes')) {
    return gardes(racine, p);
  }
  const { choix, m } = depuisLeVert(racine, composants(racine), args.includes('--tout'), env);
  try {
    for (const c of choix) {
      typerLePaquet(p, c);
    }
    jouerLesTests(
      p,
      choix.filter(c => joueDesTests(racine, c)).map(c => ({ c, chemins: [] })),
      []
    );
    const code = p.code();
    if (code === 0 && m.etat) {
      garderLeVert(m.etat);
    }
    return code;
  } finally {
    m.retirer();
  }
}

// The typing of the package <c> in the run <p>: compileall, the folders of a dot left out.
const typerLePaquet = (p, c) =>
  p.jouer(
    p.prevoir(c.nom, c.dossier, 'compileall', false, [
      ...UV_RUN,
      'python',
      '-m',
      'compileall',
      '-q',
      '-x',
      String.raw`/\.`,
      '.',
    ])
  );

// The scripts of guards of the project, in the order they play: the frame's, then its own.
const SCRIPTS_DE_GARDES = ['grillhouse:gardes', 'gardes'];

// The pass of `verifier --gardes` in <racine>: each script of SCRIPTS_DE_GARDES the root
// package.json holds, a task of the root; no test.
function gardes(racine, p) {
  let scripts = {};
  try {
    scripts = JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    scripts = {};
  }
  for (const nom of SCRIPTS_DE_GARDES.filter(n => typeof scripts[n] === 'string')) {
    p.jouer(p.prevoir(RACINE, racine, nom, false, ['run', '--silent', nom], 'npm'));
  }
  return p.code();
}

// What the tools write at the root of the temporary directory, which the guard of the base
// tolerates and the base removes with the rest: Node's compile cache, which npm enables; the lock
// file uv takes on the environment of a project (`uv-<hash>.lock`, measured with uv 0.10.4).
const DES_OUTILS = n => n === 'node-compile-cache' || /^uv-[0-9a-f]+\.lock$/.test(n);

// Plays <jouer>(env) under the base of a pass of <genre> in the temporary directory of <env>,
// named in TMPDIR, TMP and TEMP: its code, 1 when the tests left something there, named.
function sousLaBase(genre, env, jouer) {
  const base = ouvrirBase(genre, { dans: env.TMPDIR || tmpdir() });
  const lacher = retirerALInterruption(base.fermer);
  try {
    const code = jouer({ ...env, ...base.env });
    const ligne = ligneDesRestes(base.restes().filter(n => !DES_OUTILS(n)));
    if (!ligne) {
      return code;
    }
    process.stderr.write(`${ligne}\n`);
    return code === 0 || code === A_REPASSER ? 1 : code;
  } finally {
    lacher();
    base.fermer();
  }
}

/**
 * Runs the command <nom> with <args> in the project at <racine>: its exit code.
 * @param {string} nom one of NOMS
 * @param {string[]} args its arguments
 * @param {{ racine?: string, env?: NodeJS.ProcessEnv }} [o]
 */
export function lancer(nom, args, { racine = process.cwd(), env = process.env } = {}) {
  if (nom === 'tester') {
    return sousLaBase('tests', env, e => tester(racine, args, e));
  }
  if (nom === 'tests-de-nuit') {
    return sousLaBase('tests', env, e => {
      const p = passe(racine, e);
      const choix = composants(racine)
        .map(c => ({
          c,
          chemins: fichiersDeTest(c.dossier)
            .filter(f => estDeNuit(path.basename(f)))
            .map(f => path.relative(c.dossier, f)),
        }))
        .filter(x => x.chemins.length);
      jouerLesTests(p, choix, []);
      return p.code();
    });
  }
  if (nom === 'verifier') {
    const dire = l => process.stdout.write(`${l}\n`);
    try {
      return sousLaBase('verification', env, envBase =>
        avecLaMachine(envMachine => verifier(racine, args, envMachine), {
          env: envBase,
          racine,
          dire,
        })
      );
    } catch (e) {
      if (!(e instanceof AttenteDeLaMachine)) {
        throw e;
      }
      dire(e.message);
      return e.code;
    }
  }
  if (nom === 'typer' || nom === 'preparer') {
    return sousLaBase('tests', env, e => {
      const p = passe(racine, e);
      for (const c of composants(racine)) {
        if (nom === 'typer') {
          typerLePaquet(p, c);
        } else {
          p.jouer(
            p.prevoir(c.nom, c.dossier, 'sync', false, ['sync', '--locked', '--group', GROUPE])
          );
        }
      }
      return p.code();
    });
  }
  process.stderr.write(`⛔ commande inconnue du module python : ${nom} (${NOMS.join(', ')})\n`);
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [nom, ...args] = process.argv.slice(2);
  try {
    process.exitCode = lancer(nom, args);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = 1;
  }
}
