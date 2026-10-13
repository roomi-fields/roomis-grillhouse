#!/usr/bin/env node
// The launcher of the tests of a project tested by Vitest: the `test` script of package.json, so
// `npm test`. Its call is one of:
//   npm test                          every test file of the day;
//   npm test -- <fichier de test>…    these test files alone;
//   npm test -- <dossier>…            the scope of each directory (a component's: `src/parser`): the
//                                     test files under it, and the test files outside every
//                                     component whose imports reach it; the test files under another
//                                     component are not in it, even when they import it;
//   npm test -- --racine              the test files outside every component;
//   npm test -- --tous                every test file of the day, as `npm test` does.
// The test files of the day are those Vitest lists for the project's configuration, without the time
// budget benches (`*.budget.test.*`, `*.budget.spec.*`) and the night tests (`*.nuit.test.*`,
// `*.nuit.spec.*`): their measures move with the day's load, or they are too long for the day; the
// night (`scripts/nuit.sh`) plays them (scripts/vitest.nuit.config.mjs). A named file that is not a
// test file of the day plays nothing. Any call of another form is ambiguous and is refused: exit 2.
//
// The launcher keeps, for each test file it plays, the verdict of Vitest (exit code, failing tests
// by name) and its whole output, under the fingerprint of what the file reads
// (scripts/integration/traces.mjs: its content, the closure of its imports, the paths the project
// declares read by its suites, the configuration of Vitest, the lock file). A file whose
// fingerprint has a trace is not played: its kept output shows under the line « relu, code
// inchangé depuis <date> », and its exit code and failing tests count as if it had run, red
// included (the task cache of Turborepo and Nx, at the grain of a Bazel test target). The files to
// play go in one call of Vitest, each reported apart (scripts/integration/rapporteur-vitest.mjs).
// FORCER=1 reads no trace, plays the files of the call and writes their traces again. A file ended
// by a signal, or that Vitest leaves unnamed (a setup that fails), writes no trace; a call that
// fails without any failing test writes none. Outside a git repository there is no store and every
// file plays.
//
// The tests run in an environment the fingerprint can vouch for: the launch's own variables
// (FORCER, ROUGES) and the ones npm sets for its call (npm_command, npm_lifecycle_*, npm_config_*)
// are not passed on (the strict environment of Turborepo); the other variables pass.
//
// `--a-jouer`, with any of the calls above, plays nothing and prints nothing: the exit code is 0
// when at least one file of the call would play, 7 when every file has its trace (the replay builds
// the project only then), 2 for a refused call. The environment: ROUGES names a file that receives
// the full name of each failing test, one per line. The exit code is 1 when a test fails, else
// Vitest's.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dossierNu, ouvrirTraces, posix } from './traces.mjs';

const RAPPORTEUR = fileURLToPath(new URL('./rapporteur-vitest.mjs', import.meta.url));
const HORS_DU_JOUR = ['budget', 'nuit'];
const racine = process.cwd();
const TOUT_GARDE = 7;

const refuser = lignes => {
  process.stderr.write(`${lignes.join('\n')}\n`);
  process.exit(2);
};
const USAGE =
  'usage: npm test [-- --tous | --racine | <fichier de test>… | <dossier>…] (un drapeau seul)';

const sonde = process.argv.includes('--a-jouer');
const args = process.argv.slice(2).filter(a => a !== '--a-jouer');
const drapeaux = args.filter(a => a.startsWith('--'));
if (
  drapeaux.some(d => d !== '--tous' && d !== '--racine') ||
  (drapeaux.length > 0 && args.length > 1)
) {
  refuser([USAGE]);
}

// The named files and directories, relative to the root.
const fichiersNommes = [];
const dossiersNommes = [];
for (const a of args.filter(x => !x.startsWith('--'))) {
  const abs = path.resolve(racine, a);
  const rel = posix(path.relative(racine, abs));
  if (existsSync(abs) && statSync(abs).isDirectory()) dossiersNommes.push(dossierNu(rel));
  else fichiersNommes.push(rel);
}

const exclusions = HORS_DU_JOUR.map(c => `--exclude=**/*.${c}.{test,spec}.?(c|m)[jt]s?(x)`);

// The test files of the day, relative to the root: what Vitest lists for the project's
// configuration.
function fichiersDuJour() {
  const r = spawnSync('npx', ['--no-install', 'vitest', 'list', '--filesOnly', ...exclusions], {
    cwd: racine,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  return r.stdout
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '' && existsSync(path.resolve(racine, l)))
    .map(l => posix(path.relative(racine, path.resolve(racine, l))))
    .sort();
}

const jour = fichiersDuJour();
// A named file plays when it is a test file of the day; any other is not in the selection.
const nommesDuJour = fichiersNommes.filter(f => jour.includes(f));

const traces = ouvrirTraces(racine, { extra: dossiersNommes });
const { proprietaire } = traces;
const toutLeJour = args.length === 0 || drapeaux.length > 0;
// The importers of a directory are found in the imports of every test file of the day.
const analyses = await traces.analyserTests(
  toutLeJour || dossiersNommes.length > 0 ? jour : nommesDuJour
);
const choisis = new Set(nommesDuJour);
for (const d of dossiersNommes) {
  for (const f of jour) {
    if (proprietaire(f) === d || (proprietaire(f) === '' && analyses.get(f)?.dirs.has(d))) {
      choisis.add(f);
    }
  }
}
const selection = !toutLeJour
  ? jour.filter(f => choisis.has(f))
  : args[0] === '--racine'
    ? jour.filter(f => proprietaire(f) === '')
    : jour;

const forcer = process.env.FORCER === '1';
// The environment of the tests: the process's, without the launch's variables and npm's.
const environnementDesTests = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !/^(FORCER|ROUGES|npm_command|npm_lifecycle_.*|npm_config_.*)$/.test(k)
    )
  );
const rougesTotal = [];
const noter = noms => {
  for (const n of noms) if (!rougesTotal.includes(n)) rougesTotal.push(n);
};

// The files with a trace are read again, the others are to play.
const relus = new Set();
for (const f of selection) {
  const trace = forcer ? null : traces.lire(analyses.get(f).empreinte);
  if (!trace) continue;
  relus.add(f);
  if (sonde) continue;
  process.stdout.write(`relu, code inchangé depuis ${trace.quand ?? '?'} : ${f}\n${trace.sortie}`);
  noter(trace.rouges);
}
const ajouer = selection.filter(f => !relus.has(f));

if (sonde) process.exit(ajouer.length > 0 ? 0 : TOUT_GARDE);
let sortie = rougesTotal.length > 0 ? 1 : 0;
if (ajouer.length > 0) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'tests-'));
  const rapport = path.join(tmp, 'rapport.jsonl');
  writeFileSync(rapport, '');
  const r = spawnSync(
    'npx',
    [
      '--no-install',
      'vitest',
      'run',
      ...ajouer.map(f => path.resolve(racine, f)),
      `--reporter=${RAPPORTEUR}`,
      ...exclusions,
    ],
    {
      cwd: racine,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...environnementDesTests(), RAPPORT_VITEST: rapport },
    }
  );
  const interrompu = r.status === null || r.status > 128;
  const rapportes = new Map(
    readFileSync(rapport, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l))
      .map(x => [x.fichier, x])
  );
  rmSync(tmp, { recursive: true, force: true });
  const rouges = [...rapportes.values()].flatMap(x => x.rouges);
  noter(rouges);
  // A call that fails without any failing test is unexplained: none of its files is vouched for.
  const inexplique = !interrompu && r.status !== 0 && rouges.length === 0;
  if (!inexplique) {
    for (const f of ajouer) {
      const x = rapportes.get(f);
      if (x) {
        traces.ecrire(analyses.get(f).empreinte, {
          code: x.rouges.length > 0 ? 1 : 0,
          rouges: x.rouges,
          sortie: x.sortie,
        });
      }
    }
  }
  sortie = interrompu ? 1 : rougesTotal.length > 0 ? 1 : (r.status ?? 1);
}
if (selection.length === 0) process.stdout.write('aucun fichier de test à jouer\n');
else {
  process.stdout.write(
    `\nTest Files  ${selection.length} (${relus.size} relu${relus.size > 1 ? 's' : ''}, ${ajouer.length} joué${ajouer.length > 1 ? 's' : ''})\n`
  );
}
if (process.env.ROUGES) {
  writeFileSync(process.env.ROUGES, rougesTotal.map(n => `${n}\n`).join(''));
}
process.exit(sortie);
