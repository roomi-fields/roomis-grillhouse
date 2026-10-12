#!/usr/bin/env node
// The suites of an integration for a project tested by Vitest: `integration:suites` in
// package.json. Its call is one of:
//   --tous                     every suite: the suite of each component, then the root suite;
//   <dossier de composant>…    the suites of these components (`packages/a src/parser`), then the
//                              root suite (its share the components change);
//   --racine                   the root suite alone;
//   --tests <fichier>…         these test files alone, under no trace.
// Any other call, a call without argument, or `--tous` with directories, is ambiguous: refused,
// exit 2, nothing runs. It writes the full name of each failing test, one per line, to the file
// named by ROUGES. Its exit code is Vitest's (the first non-zero of the suites). Two categories do
// not run here, in any call: a time budget bench (`*.budget.test.*`, `*.budget.spec.*`), whose
// measures the day's load moves, and a night test (`*.nuit.test.*`, `*.nuit.spec.*`), too long for
// the day. The night (`scripts/nuit.sh`) plays both: the bench in `npm test`, the night test after
// it (scripts/vitest.nuit.config.mjs).
//
// A suite is the suite of a component (the tests that cover its files, its own tests included: the
// verdict keeps the tests under its directory), or the root suite (the test files outside every
// component, every file of the test folders counted). The command keeps the verdict of each suite
// (exit code and failing tests by name) under the fingerprint of what produces it, and does not
// replay a suite whose fingerprint has a trace, red included (the task cache of Turborepo and Nx);
// the fingerprints, the traces and what each suite owes are in scripts/integration/traces.mjs.
// FORCER=1 reads no trace, plays every suite whole and writes its trace again. A suite ended by a
// signal writes none. A component's call plays `vitest related` on its files, without the other
// components' files; the test files outside every component it played credit the root suite,
// which plays only the others it owes.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dossierNu, ouvrirTraces, posix } from './traces.mjs';

const HORS_DU_JOUR = ['budget', 'nuit'];
const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|svelte|vue)$/;
const BUDGET_OU_NUIT = new RegExp(`\\.(${HORS_DU_JOUR.join('|')})\\.(test|spec)\\.`);
const racine = process.cwd();

const usage = () => {
  process.stderr.write(
    'usage: suites-vitest.mjs --tous | --racine | --tests <fichier>… | <dossier de composant>… (--tous seul, ou une liste non vide de dossiers)\n'
  );
  process.exit(2);
};
const args = process.argv.slice(2);
const drapeaux = args.filter(a => a.startsWith('--'));
if (args.length === 0) usage();
if (drapeaux.length > 0) {
  const seul = args.length === 1 && (args[0] === '--tous' || args[0] === '--racine');
  const tests = args[0] === '--tests' && args.length > 1 && drapeaux.length === 1;
  if (!seul && !tests) usage();
}
const demandes = drapeaux.length === 0 ? args.map(dossierNu) : [];
const traces = ouvrirTraces(racine, { forcer: process.env.FORCER === '1', extra: demandes });
const { dossiers, proprietaire } = traces;

// The code files under <dir> (relative to the root), out of node_modules, dist, docs and dot folders.
function fichiersDeCode(dir) {
  if (!existsSync(path.join(racine, dir))) return [];
  const out = [];
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', 'dist', 'docs'].includes(e.name) || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (CODE.test(e.name) && !BUDGET_OU_NUIT.test(e.name)) out.push(posix(p));
    }
  };
  walk(dir);
  return out;
}

const exclusions = (...motifs) => [
  ...HORS_DU_JOUR.map(c => `--exclude=**/*.${c}.{test,spec}.?(c|m)[jt]s?(x)`),
  ...motifs.map(m => `--exclude=${m}`),
];

const tmp = mkdtempSync(path.join(tmpdir(), 'suites-'));
let appels = 0;
// One call of Vitest: { interrompu } when a signal ended it, else { status, resultats } with, for
// each test file reported, its path, its failing tests by name and its duration in seconds (null
// when unmeasured).
function vitest(argsVitest) {
  const rapport = path.join(tmp, `rapport-${++appels}.json`);
  const r = spawnSync(
    'npx',
    ['vitest', ...argsVitest, '--reporter=json', `--outputFile=${rapport}`],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  );
  if (r.status === null || r.status > 128) return { interrompu: true };
  const resultats = [];
  if (existsSync(rapport)) {
    const { testResults = [] } = JSON.parse(readFileSync(rapport, 'utf8'));
    for (const f of testResults) {
      const rel = posix(path.relative(racine, f.name));
      const tests = f.assertionResults ?? [];
      const rouges = tests.filter(t => t.status === 'failed').map(t => `${rel} > ${t.fullName}`);
      // A file that fails without any failing test (a collect error) is named by itself.
      if (f.status === 'failed' && rouges.length === 0) rouges.push(rel);
      const duree =
        typeof f.startTime === 'number' && typeof f.endTime === 'number'
          ? Math.round((f.endTime - f.startTime) / 100) / 10
          : null;
      resultats.push({ rel, rouges, duree });
    }
  }
  return { status: r.status, resultats };
}
const echecs = resultats => resultats.flatMap(r => r.rouges);
// The exit code of a call for the files it is judged on: red tests there, or a call that fails
// without any red test anywhere.
const codeDe = (appel, siens) =>
  echecs(siens).length > 0
    ? 1
    : appel.status !== 0 && echecs(appel.resultats).length === 0
      ? appel.status
      : 0;

// The suite of the component <dir>, without the files <ecartes>: { code, rouges, resultats, siens }
// (`resultats` every file Vitest reported, `siens` those under <dir>), or { interrompu }.
function jouerComposant(dir, ecartes) {
  const fichiers = fichiersDeCode(dir);
  if (fichiers.length === 0) return { code: 0, rouges: [], resultats: [], siens: [] };
  const autres = dossiers.filter(d => d !== dir).map(d => `**/${d}/**`);
  const appel = vitest([
    'related',
    '--run',
    '--passWithNoTests',
    ...fichiers,
    ...exclusions(...autres, ...ecartes.map(f => `**/${f}`)),
  ]);
  if (appel.interrompu) return appel;
  const siens = appel.resultats.filter(r => proprietaire(r.rel) === dir);
  return { code: codeDe(appel, siens), rouges: echecs(siens), resultats: appel.resultats, siens };
}

// One component's verdict, from its trace or from a run: { code, rouges, resultats, siens }.
function suiteComposant(dir) {
  const { gardee, jeu, ecartes, empreinte, nomDernier } = traces.statutComposant(dir);
  if (gardee) {
    console.log(`↺ ${dir} : inchangé depuis sa dernière suite, non rejoué`);
    return { code: gardee.code, rouges: gardee.rouges, resultats: [] };
  }
  if (jeu === 'rapide')
    console.log(`↻ ${dir} : jeu rapide, sans ${ecartes.length} fichier(s) lent(s)`);
  const r = jouerComposant(dir, ecartes);
  if (r.interrompu) return r;
  if (jeu === 'rapide') {
    traces.ecrire(`r-${empreinte}`, { code: r.code, rouges: r.rouges, jeu });
    return r;
  }
  traces.ecrire(`t-${empreinte}`, { code: r.code, rouges: r.rouges, jeu });
  const durees = {};
  for (const f of r.siens) if (f.duree !== null) durees[f.rel] = f.duree;
  traces.ecrire(nomDernier, {
    propre: traces.propre.get(dir) ?? '',
    racine: traces.empreinteRacine,
    code: r.code,
    durees,
  });
  return r;
}

// The root suite: the test files outside every component. <credits> maps the root test files the
// components' calls already played to their failing tests, and `composant:<dir>` to [] for each
// component whose call ran. { code, rouges, resultats } or { interrompu }.
function suiteRacine(credits) {
  if (traces.fichiersDeTest.length === 0) return { code: 0, rouges: [], resultats: [] };
  const { gardee, partielle, changes, dernier, empreinte } = traces.statutRacine();
  if (gardee) {
    console.log('↺ suite de la racine : inchangée depuis sa dernière suite, non rejouée');
    return { code: gardee.code, rouges: gardee.rouges, resultats: [] };
  }
  const hors = dossiers.map(d => `**/${d}/**`);
  let rouges;
  let code;
  let sansNom = false;
  if (partielle) {
    console.log(`↻ suite de la racine : ses tests qui atteignent ${changes.join(', ')}`);
    const vus = new Map(credits);
    let appelCode = 0;
    const fichiers = changes.filter(d => !vus.has(`composant:${d}`)).flatMap(fichiersDeCode);
    if (fichiers.length > 0) {
      const appel = vitest([
        'related',
        '--run',
        '--passWithNoTests',
        ...fichiers,
        ...exclusions(...hors),
      ]);
      if (appel.interrompu) return appel;
      for (const r of appel.resultats) vus.set(r.rel, r.rouges);
      appelCode = codeDe(appel, appel.resultats);
    }
    const joues = [...vus.keys()].filter(k => !k.startsWith('composant:'));
    const gardes = dernier.rouges.filter(n => !joues.includes(n.split(' > ')[0]));
    rouges = [...new Set([...gardes, ...joues.flatMap(k => vus.get(k))])];
    // A failure of the last run that named no test stays: the partial replay cannot clear it.
    sansNom = dernier.sansNom === true;
    code = rouges.length > 0 ? 1 : sansNom ? dernier.code : appelCode;
  } else {
    console.log('↻ suite de la racine : tous ses tests');
    const appel = vitest(['run', '--passWithNoTests', ...exclusions(...hors)]);
    if (appel.interrompu) return appel;
    rouges = echecs(appel.resultats);
    code = codeDe(appel, appel.resultats);
    sansNom = code !== 0 && rouges.length === 0;
  }
  traces.ecrire(`t-${empreinte}`, { code, rouges, jeu: 'racine' });
  traces.ecrire('racine-dernier', {
    code,
    rouges,
    sansNom,
    racine: traces.empreinteRacine,
    tests: traces.empreinteDesTests,
    composants: Object.fromEntries(traces.propre),
  });
  return { code, rouges, resultats: [] };
}

const rougesTotal = [];
let sortie = 0;
let interrompu = false;
const accueillir = r => {
  if (r.interrompu) {
    interrompu = true;
    return;
  }
  for (const n of r.rouges) if (!rougesTotal.includes(n)) rougesTotal.push(n);
  if (r.code !== 0 && sortie === 0) sortie = r.code;
};

if (args[0] === '--tests') {
  const appel = vitest(['run', '--passWithNoTests', ...args.slice(1), ...exclusions()]);
  if (appel.interrompu) interrompu = true;
  else accueillir({ code: codeDe(appel, appel.resultats), rouges: echecs(appel.resultats) });
} else {
  const dirs = args[0] === '--tous' ? dossiers : args[0] === '--racine' ? [] : demandes;
  const credits = new Map();
  for (const d of dirs) {
    const r = suiteComposant(d);
    accueillir(r);
    if (r.interrompu) continue;
    for (const f of r.resultats) {
      if (proprietaire(f.rel) === '' && !credits.has(f.rel)) credits.set(f.rel, f.rouges);
    }
    // A component whose call ran credits the root suite with its share of the tests.
    if (r.siens) credits.set(`composant:${d}`, []);
  }
  accueillir(suiteRacine(credits));
}
if (process.env.ROUGES) writeFileSync(process.env.ROUGES, rougesTotal.map(n => `${n}\n`).join(''));
rmSync(tmp, { recursive: true, force: true });
process.exit(interrompu ? 1 : sortie);
