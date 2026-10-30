#!/usr/bin/env node
// The build of an agent's copy before its session, the command `construire` of the module
// typescript (scripts/jointure.d.ts), which the launcher (scripts/enveloppe/lancer.sh) runs in the
// prepared copy, through its mounts: the session finds built what it reads out of its plan.
//
//   node construire.mjs --echec <fichier> <plan>     from the root of the copy
//
// - <plan> is the session's plan, the paths of the packages it writes, in the form of the
//   envelope's variable (`lireLaListe` of the core's services, `packages/a:packages/b`).
// - As Bazel builds the dependencies of a target before the target: for a plan whose every path
//   is a package of the frame, their providers are built first (the builds their builds wait for,
//   read in Turborepo's graph, `turbo run build --filter=<paquet>… --dry=json`), and a failure
//   stops the launch; then the traces of other packages their tests wait for
//   (`grillhouse.traces`, read in Turborepo's plan of their tests, `turbo run test:unit
//   --filter=<paquet>… --dry=json`), which the envelope shows read-only, and a failure stops the
//   launch. A task of either step that waits, directly or not, for a task of a package of the plan
//   (`attendentLePlan` of ./turbo-des-paquets.mjs) is not played there: as with Bazel's
//   --keep_going, a package of the plan stays a target of the plan even as another's provider
//   (BPScript's 990-corpus, the shared test material, which the trace of 060-encoder waits for),
//   and goes with the plan. Then the packages, the traces of the plan or that wait for it, and what
//   their tests read (`turbo run build <those traces> --filter=<paquet>...…
//   --continue=dependencies-successful`), whose failure does not stop the launch: each task whose
//   dependencies succeed goes to its end, so what their tests read without depending on them is
//   built whole. Their consumers are not built.
// - Any other plan, the whole repository (`.`) included, or a path that is no package of the frame
//   (BPScript's libraries/), reads the graph of the whole copy dry (`turbo run build --dry=json`),
//   whose failure (Turborepo absent, its configuration refused) stops the launch, then builds the
//   copy whole as far as it builds (`turbo run build --continue=dependencies-successful`), whose
//   failure does not stop the launch either.
// - A build that fails without stopping the launch writes in <fichier> the line that says which
//   build failed and what was built, then its output, which the launcher puts in the session's
//   instruction (« La construction échoue »): repairing it is the session's work. Its output goes
//   to the standard output too.
// - The exit code: 0 when the launch goes on, a build failure included; 1 for a step that stops it;
//   2 for a malformed call.
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { paquets } from '../../paquets.mjs';
import { lireLaListe } from '../../services-du-noyau.mjs';
import { SCRIPT_DES_TESTS } from './script-des-tests.mjs';
import { attendentLePlan, tracesDuPlan } from './turbo-des-paquets.mjs';

const TURBO = ['--no-install', 'turbo'];
const ENTIERE =
  "La construction de la copie entière échoue ; ce qui n'attend pas la construction en échec est construit.";
const DU_PLAN =
  "La construction des paquets de ton plan échoue ; leurs fournisseurs et ce que leurs tests lisent sans dépendre d'eux sont construits.";

class Arret extends Error {}

// Turborepo with <args> in <racine>, its output on this process's; throws Arret on a failure.
function turbo(racine, args) {
  const r = spawnSync('npx', [...TURBO, ...args], { cwd: racine, stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Arret(`turbo ${args.join(' ')}`);
  }
}

// Turborepo's plan of <args> in <racine>, parsed; throws Arret on a failure.
function plan(racine, args) {
  const r = spawnSync('npx', [...TURBO, ...args, '--dry=json'], {
    cwd: racine,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (r.status !== 0) {
    throw new Arret(`turbo ${args.join(' ')} --dry=json`);
  }
  return JSON.parse(r.stdout);
}

// The build <args> in <racine>, its output in <echec> then on this process's: when it fails,
// <echec> holds <ligne> then that output, and the warning <alerte> follows it.
function construireJusquOuIlConstruit(racine, args, echec, ligne, alerte) {
  const fd = openSync(echec, 'w');
  let r;
  try {
    r = spawnSync('npx', [...TURBO, ...args], { cwd: racine, stdio: ['ignore', fd, fd] });
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
 * Builds the copy at <racine> for the plan <liste>, the failure of a build that does not stop the
 * launch written in <echec>: the exit code (see the header).
 * @param {string} racine the root of the copy
 * @param {string} liste the plan, in the form of the envelope's variable
 * @param {string} echec the file of a build that fails
 */
export function construire(racine, liste, echec) {
  writeFileSync(echec, '');
  const tous = paquets(racine).filter(p => !p.hors);
  const noms = lireLaListe(liste).map(
    d => tous.find(p => p.dossier === path.normalize(d).replace(/\/$/, ''))?.pkg.name ?? null
  );
  try {
    if (noms.length === 0 || !noms.every(Boolean)) {
      plan(racine, ['run', 'build']);
      construireJusquOuIlConstruit(
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
    const graphe = plan(racine, ['run', 'build', ...cibles]);
    const avecLePlan = attendentLePlan(graphe, noms);
    const fournisseurs = graphe.tasks
      .map(t => t.taskId)
      .filter(id => !avecLePlan.has(id))
      .sort();
    if (fournisseurs.length) {
      turbo(racine, ['run', ...fournisseurs]);
    }
    // The traces their tests wait for: another package's trace that waits for no package of the
    // plan is produced here, a failure stopping the launch, as a provider's; a trace of the plan,
    // or one that waits for it, is produced with the plan below.
    const tests = plan(racine, ['run', SCRIPT_DES_TESTS, ...cibles]);
    const attend = attendentLePlan(tests, noms);
    const autres = tracesDuPlan(tests, t => !attend.has(t.taskId));
    if (autres.length) {
      turbo(racine, ['run', ...autres]);
    }
    const avec = tracesDuPlan(tests, t => attend.has(t.taskId));
    construireJusquOuIlConstruit(
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--echec');
  const echec = i >= 0 ? args[i + 1] : undefined;
  const reste = i >= 0 ? [...args.slice(0, i), ...args.slice(i + 2)] : args;
  if (!echec || reste.length !== 1) {
    process.stderr.write('usage: construire.mjs --echec <fichier> <plan>\n');
    process.exitCode = 2;
  } else {
    process.exitCode = construire(process.cwd(), reste[0], echec);
  }
}
