#!/usr/bin/env node
// The commands of the module cargo, the demand `commandes` of the join (scripts/jointure.d.ts):
// each one this script with its name first, `{ script, args }`, described, never run, by
// `commandes`; run by `grillhouse <commande>` in the root of the workspace, its arguments after.
//
//   npx grillhouse tests [--force] [<chemin>…] [--<option>…]   tester
//   npx grillhouse verifier [--tout]                            verifier
//   node commandes.mjs typer                                    typer
//   npx grillhouse preparer                                     preparer
//   npx grillhouse clippy | frontieres | index-interfaces       each guard, its own script
//
// - Each guard of structure of the module (./clippy.mjs, ./frontieres.mjs, ./index-interfaces.mjs)
//   is a command by its name too, its own script, as the module typescript's: the line of a red
//   guard (`grillhouse <garde>`, scripts/gardes-du-cadre.mjs) names a command that exists.
// - `tester` plays the tests of each crate chosen, one crate after the other: `cargo nextest run
//   -p <crate> --no-fail-fast` for a crate that plays tests (./composants.mjs, `joueDesTests`),
//   then `cargo test --doc -p <crate>` for a crate whose library has doctests, which nextest does
//   not play. A path, written from the root, chooses the crate that holds it; the source of a test
//   target (`<crate>/tests/<nom>.rs`) plays that target alone (`--test <nom>`), without the
//   doctests. A path out of every crate, or in a crate without tests, is refused, named, and
//   nothing plays (code 2). Without a path, every crate plays, or, under the circuit's mark
//   (`GRILLHOUSE_DEPUIS_LE_VERT`), the crates the changes since the last green touch and their
//   dependents (./touches.mjs), every crate when no last green counts. `--force` changes nothing:
//   cargo keeps no result of a test to replay. Another option goes to nextest.
// - `verifier` plays the tests of the crates the changes since the last green touch and of their
//   dependents (every crate with `--tout`, or when no last green counts), as Turborepo's
//   `--filter=...[<commit>]`, then `cargo deny check`; green, it keeps the last green
//   (scripts/dernier-vert.mjs). It plays under the lock of the machine, one heavy measure at a
//   time (`avecLaMachine` of ./jointure, as the module typescript's verifier): a measure that
//   holds it makes it wait, and the bound of the wait reached, it stops at 75 without running
//   cargo.
// - `tester` and `verifier` play under a temporary directory of their pass, the module's guard of
//   the temporary directory, as the CI of osc-bridge (OB-ud1.3): a base (`ouvrirBase` of
//   ./jointure, genre `tests` or `verification`) in the temporary directory of the environment,
//   named in TMPDIR, TMP and TEMP to cargo, which nextest and the doctests inherit; removed at the
//   end of the pass, green, red or interrupted (SIGINT, SIGTERM, SIGHUP). What the tests left there
//   fails the pass (code 1), each name written on the error stream. A test makes its temporary
//   directory or file with the crate `tempfile` (`TempDir`, `NamedTempFile`), removed when dropped,
//   a failed test included, never a path built by hand under `std::env::temp_dir()`.
// - `typer`: `cargo check --all-targets`. `preparer`: `cargo fetch --locked`.
// - Nextest reads the frame's profile `grillhouse` (./nextest.toml, a tool's configuration under
//   the project's own, `--tool-config-file`), whose JUnit report lands at
//   `<target>/nextest/grillhouse/junit.xml`.
// - While the environment names a results directory (`GRILLHOUSE_RESULTATS`), the run writes
//   there what ./verdict.mjs reads: its tasks, each planned before it plays (`code` null until it
//   ran), and the JUnit report of each run of nextest. A task of the workspace is named after its
//   root, `//`, as Turborepo names the root's tasks.
// - The exit code: 0 when every task is green, 75 when the only reds are « à repasser », 1
//   otherwise; 2 for a path refused or a command unknown.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import { composantDans, crates, joueDesTests, metadonnees } from './composants.mjs';
import { touchesDesFichiers } from './touches.mjs';
import { JUNIT, TACHES } from './verdict.mjs';

const ICI = fileURLToPath(import.meta.url);
const NEXTEST = path.join(path.dirname(ICI), 'nextest.toml');
const PROFIL = 'grillhouse';
export const NOMS = ['tester', 'verifier', 'typer', 'preparer'];
const A_REPASSER = 75;
const RACINE = '//';

/** The guards of structure of the module, in the order they play: each its name, its script beside
 * this one, and its arguments as a guard. */
export const GARDES = [
  { nom: 'clippy', args: [] },
  { nom: 'frontieres', args: [] },
  { nom: 'index-interfaces', args: ['--verifier'] },
].map(g => ({ ...g, script: path.join(path.dirname(ICI), `${g.nom}.mjs`) }));

/** The commands of the module, each this script and its name, described; then each guard, its
 * script by its name, as `grillhouse <garde>` runs it and the line of a red guard names it. */
export const commandes = () =>
  Object.fromEntries([
    ...NOMS.map(n => [n, { script: ICI, args: [n] }]),
    ...GARDES.map(g => [g.nom, { script: g.script, args: [] }]),
  ]);

// The id of each test binary of nextest of <c>, its target's source: the library under the
// crate's name, the others as `<crate>::<nom>`, a binary, an example or a bench prefixed by kind.
function binaires(c) {
  return Object.fromEntries(
    c.cibles.map(t => {
      const kind = t.kind[0];
      if (kind === 'test') {
        return [`${c.composant.nom}::${t.name}`, t.src];
      }
      if (['bin', 'example', 'bench'].includes(kind)) {
        return [`${c.composant.nom}::${kind}/${t.name}`, t.src];
      }
      return [c.composant.nom, t.src];
    })
  );
}

// The run of the tasks of a command in <racine>: each planned, then played by cargo, written in
// the results directory <env> names.
function passe(racine, env) {
  const dossier = env[RESULTATS] || null;
  const id = `${Date.now()}-${process.pid}`;
  const taches = [];
  const cibles = {};
  const ecrire = () => {
    if (!dossier) {
      return;
    }
    mkdirSync(path.join(dossier, TACHES), { recursive: true });
    writeFileSync(
      path.join(dossier, TACHES, `${id}.json`),
      `${JSON.stringify({ taches, cibles }, null, 2)}\n`
    );
  };
  return {
    cibles,
    prevoir(paquet, dossierDuPaquet, script, tests, args) {
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
      return { t, args };
    },
    jouer({ t, args }, junit = null) {
      // A report of an earlier run is no report of this one, which may write none.
      if (junit) {
        rmSync(junit, { force: true });
      }
      const r = spawnSync('cargo', args, { cwd: racine, env, stdio: 'inherit' });
      t.code = r.error ? 127 : (r.status ?? 128 + (constants.signals[r.signal] ?? 0));
      if (junit && dossier && existsSync(junit)) {
        mkdirSync(path.join(dossier, JUNIT), { recursive: true });
        copyFileSync(junit, path.join(dossier, JUNIT, `${id}-${t.paquet}.xml`));
      }
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

// The crates the changes since the last green of <racine> touch, and their dependents; every crate
// with <tout> or without a last green that counts. `{ choix, m }`, `m` the measure.
function depuisLeVert(racine, tous, tout, env) {
  const m = mesure(racine, { tout, dans: env.TMPDIR });
  process.stderr.write(`${m.ligne}\n`);
  const f = m.env[CHANGEMENTS];
  if (!f) {
    return { choix: tous, m };
  }
  const ch = JSON.parse(readFileSync(f, 'utf8'));
  const t = touchesDesFichiers(racine, [...ch.fichiers, ...ch.supprimes]);
  const nommes = new Set([...t.touches, ...t.dependants].map(c => c.dossier));
  return { choix: tous.filter(c => nommes.has(c.composant.dossier)), m };
}

// Plans and plays the tests of the crates <choix> (each `{ c, cibles }`, `cibles` the test targets
// named, empty for the whole crate) in the run <p>.
function jouerLesTests(racine, p, choix, options) {
  const m = metadonnees(racine);
  const junit = path.join(m.target_directory, 'nextest', PROFIL, 'junit.xml');
  const prevues = [];
  for (const { c, cibles } of choix) {
    Object.assign(p.cibles, binaires(c));
    const d = c.composant.dossier;
    if (joueDesTests(racine, c.composant)) {
      const args = ['nextest', 'run', '--tool-config-file', `${PROFIL}:${NEXTEST}`];
      args.push('--profile', PROFIL, '--no-fail-fast', '-p', c.composant.nom);
      for (const n of cibles) {
        args.push('--test', n);
      }
      prevues.push([p.prevoir(c.composant.nom, d, 'nextest', true, [...args, ...options]), junit]);
    }
    const doctests = c.cibles.some(t => t.kind.includes('lib') && t.doctest !== false);
    if (cibles.length === 0 && doctests) {
      const args = ['test', '--doc', '-p', c.composant.nom];
      prevues.push([p.prevoir(c.composant.nom, d, 'doctest', true, args), null]);
    }
  }
  for (const [t, j] of prevues) {
    p.jouer(t, j);
  }
}

// The crates the paths <chemins> choose in <racine>: `{ choix }`, or `{ refus }` naming each path
// refused.
function choisir(racine, tous, chemins) {
  const parDossier = new Map();
  const refus = [];
  for (const chemin of chemins) {
    const abs = path.resolve(racine, chemin);
    const c = composantDans(
      tous.map(x => x.composant),
      racine,
      abs
    );
    const crate = c && tous.find(x => x.composant === c);
    if (!crate) {
      refus.push(`${chemin} : hors de tout crate`);
      continue;
    }
    if (!joueDesTests(racine, c)) {
      refus.push(`${chemin} : ${c.nom} n'a pas de dossier tests/`);
      continue;
    }
    const cible = crate.cibles.find(t => t.kind.includes('test') && t.src === abs);
    const deja = parDossier.get(c.dossier);
    if (!cible) {
      parDossier.set(c.dossier, { c: crate, cibles: [] });
    } else if (!deja) {
      parDossier.set(c.dossier, { c: crate, cibles: [cible.name] });
    } else if (deja.cibles.length) {
      deja.cibles.push(cible.name);
    }
  }
  if (refus.length) {
    return { refus };
  }
  return {
    choix: tous
      .filter(x => parDossier.has(x.composant.dossier))
      .map(x => parDossier.get(x.composant.dossier)),
  };
}

// The pass of `verifier` in <racine>, under the lock of the machine (<env> carries its mark): the
// tests of the crates the changes since the last green touch, then cargo deny; green, it keeps the
// last green.
function verifier(racine, args, env) {
  const p = passe(racine, env);
  const tous = crates(racine);
  const { choix, m } = depuisLeVert(racine, tous, args.includes('--tout'), env);
  try {
    jouerLesTests(
      racine,
      p,
      choix.map(c => ({ c, cibles: [] })),
      []
    );
    p.jouer(p.prevoir(RACINE, racine, 'deny', false, ['deny', 'check']));
    const code = p.code();
    if (code === 0 && m.etat) {
      garderLeVert(m.etat);
    }
    return code;
  } finally {
    m.retirer();
  }
}

// Plays <jouer>(env) under the base of a pass of <genre> in the temporary directory of <env>,
// named to cargo in TMPDIR, TMP and TEMP: its code, 1 when the tests left something there, named.
// The base goes at the end, or at an interruption.
function sousLaBase(genre, env, jouer) {
  const base = ouvrirBase(genre, { dans: env.TMPDIR || tmpdir() });
  const lacher = retirerALInterruption(base.fermer);
  try {
    const code = jouer({ ...env, ...base.env });
    const ligne = ligneDesRestes(base.restes());
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
 * Runs the command <nom> with <args> in the workspace at <racine>: its exit code.
 * @param {string} nom one of NOMS
 * @param {string[]} args its arguments
 * @param {{ racine?: string, env?: NodeJS.ProcessEnv }} [o]
 */
export function lancer(nom, args, { racine = process.cwd(), env = process.env } = {}) {
  const p = passe(racine, env);
  if (nom === 'typer') {
    p.jouer(p.prevoir(RACINE, racine, 'check', false, ['check', '--all-targets']));
    return p.code();
  }
  if (nom === 'preparer') {
    p.jouer(p.prevoir(RACINE, racine, 'fetch', false, ['fetch', '--locked']));
    return p.code();
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
  const tous = crates(racine);
  if (nom === 'tester') {
    return sousLaBase('tests', env, envBase => tester(racine, tous, args, envBase));
  }
  process.stderr.write(`⛔ commande inconnue du module cargo : ${nom} (${NOMS.join(', ')})\n`);
  return 2;
}

// The pass of `tester` in <racine>, the crates <tous>, its arguments <args>, under <env>.
function tester(racine, tous, args, env) {
  const p = passe(racine, env);
  const chemins = args.filter(a => !a.startsWith('-'));
  const options = args.filter(a => a.startsWith('-') && a !== '--force');
  let choix;
  let m = null;
  if (chemins.length) {
    const r = choisir(racine, tous, chemins);
    if (r.refus) {
      for (const l of r.refus) {
        process.stderr.write(`⛔ ${l}\n`);
      }
      return 2;
    }
    choix = r.choix;
  } else if (env[DEPUIS_LE_VERT]) {
    ({ choix, m } = depuisLeVert(racine, tous, args.includes('--force'), env));
    choix = choix.map(c => ({ c, cibles: [] }));
  } else {
    choix = tous.map(c => ({ c, cibles: [] }));
  }
  try {
    jouerLesTests(racine, p, choix, options);
  } finally {
    m?.retirer();
  }
  return p.code();
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
