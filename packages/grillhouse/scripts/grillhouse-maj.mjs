#!/usr/bin/env node
// The frame's update: brings what the frame writes in a project to a Grillhouse version.
//
//   npx grillhouse maj [--source <Grillhouse checkout>]   update (npm run grillhouse:maj)
//
// - The frame copies no file into a project: its scripts are the package's
//   (@roomi-fields/grillhouse, `npx grillhouse <sous-commande>`), its skills, agents, hooks of
//   Claude Code and common charter the plugin's (grillhouse@roomi-fields), which Claude Code updates
//   by its marketplace. The update never writes `.claude/settings.json`.
// - `package.json`, when there is one: the frame's npm scripts (`tableau`, `grillhouse:maj`), its
//   `prepare` beginning with `grillhouse hooks` (the frame's git hooks at each `npm install`, as
//   Husky's `prepare`; a `prepare` of the project's own follows it, `grillhouse hooks && …`), and
//   `grillhouse:gardes` (scripts/gardes-du-cadre.mjs, the frame's controls), `grillhouse:dette:inscrire` and
//   `grillhouse:dette:elaguer` (the known debt of the guards, scripts/dette.mjs), and `api` (`npm run api`, which writes
//   the API reports and the generated part of each `docs/INTERFACE.md`), each read as it is in the
//   source's `package.json` (a source without one writes none). Turborepo plays `grillhouse:gardes`
//   and the project's own guards, the root script `gardes`, after the build, beside the tests
//   (`turbo.json`, `npm run verifier`): the frame's former wiring goes, a `pretest` that is the
//   frame's call (`npm run --silent grillhouse:gardes`) removed or taken off the head of a longer
//   one (`… && <its pretest>`, the rest kept; a `pretest` of the project's own stays). An
//   `integration:gardes`, the script the former integration played, loses each head that is a
//   former frame command (that call, `npm run --silent pretest`,
//   `node scripts/integration/gardes.mjs`); what remains is the project's own guards, which move to
//   `gardes` when the project has none (the report says so), else stay where nothing plays them
//   (the report names both); nothing remaining, the script goes.
// - `turbo.json` is the project's own file, as every repository run by Turborepo writes its own. A
//   project with a `package.json` and no `turbo.json` receives the frame's template of its form,
//   read in the source: `templates/turbo/paquets.json` when its `package.json` declares
//   `workspaces` (the tasks of each package, and the root's guards, `//#grillhouse:gardes` and
//   `//#gardes`; the tests live in the packages, the root has no `test:vitest`; the `build` of each
//   package is set by its own generated `turbo.json`, below), else
//   `templates/turbo/sans-paquets.json` (`build`, then the guards and the tests beside each other).
//   A `turbo.json` present is never written again by the update; only the generator of the
//   packages' turbo.json (below) writes in it the `dependsOn` of the guard tasks, and adds one it
//   lacks.
// - The frame's tools (API Extractor and its model, the TSDoc configuration reader,
//   dependency-cruiser, jsonc-parser, knip, Turborepo, yaml) are added to the project's
//   `devDependencies` at the version the source's `devDependencies` give; a tool the project
//   already declares in `dependencies`, `devDependencies` or `optionalDependencies` keeps its
//   declaration, one a previous version added stays, and `devDependencies` are written sorted by
//   name. The report names each tool added and `npm install`, which installs them. A project
//   without `packageManager` receives the source's (Turborepo requires it), and a `.gitignore`
//   that does not ignore `.turbo/` (Turborepo's runs and cache) receives the line.
// - A project that runs Vitest (its `test` script names it, or `vitest` is in the `dependencies` or
//   `devDependencies` of its root `package.json` or of one of its packages, the workspaces as npm
//   maps them, read by `paquets` of scripts/paquets.mjs, the frame's one list of the
//   packages: a package a negation takes out is none, and a package out of the frame
//   (`docs/agents/hors-cadre.txt`), which Turborepo never tests, counts for nothing) has its root scripts
//   `test`, `test:vitest`, `test:forcer` and `verifier` become the source's (`npm test`, the tests
//   as Turborepo's tasks with its cache; `npm run test:forcer`, the same played for real;
//   `npm run verifier`, scripts/verifier.mjs, the guards and the tests beside each other, which the
//   integration, the queue, the continuous integration and the night play); the report says so, when the
//   Vitest of the project's root (`npx --no-install vitest`, the one `test:vitest` calls) satisfies
//   the range the source's package.json declares for `vitest`. Where the root resolves no Vitest or
//   another version, the project's scripts stay (the frame's included) and the report names the
//   version found and the range required. A `test` that runs anything else stays. The scripts of
//   the packages of a monorepo are not written.
// - The frame's base configuration of Vitest is a package, @grillhouse/vitest-config
//   (scripts/vitest-config/, a frame directory), that each package of a repository of packages
//   imports by its name, as the examples of Turborepo reach @repo/eslint-config: a package is
//   reached by its name, never by a relative path out of it. In a project with `workspaces` of
//   which a package of the frame holds a `test:vitest` script, the update adds
//   `packages/grillhouse/scripts/vitest-config` to the
//   `workspaces` (or to `workspaces.packages`) when they do not select it yet, and declares the
//   package (`"*"`, the version of the workspace) in the `devDependencies` of each such package,
//   a declaration it holds kept; a package out of the frame is not touched. The directory is added to the workspaces where the
//   frame's package holds it, never directly under `packages/`: every directory there is a
//   component of the project, which the frame's checks read, and the frame's files keep one
//   address, the same in every project. The report
//   names what it wrote, `npm install`, which links the package, and the import each package's
//   Vitest configuration writes (`import base from '@grillhouse/vitest-config'`): the update writes
//   no Vitest configuration. A project without `workspaces` imports the file by its path
//   (`./packages/grillhouse/scripts/vitest-config/base.mjs`), from the one package that holds it.
// - The update's own script: the package's runs the source's
//   packages/grillhouse/scripts/grillhouse-maj.mjs in its place (`--source` the same source), and
//   the frame's modules it calls (crochets.mjs, greffons.mjs, paquets.mjs) are loaded only then,
//   beside the script that does the update. So one pass ends with the source's work. The script and
//   these modules use Node alone: the source is a checkout that installs no dependency.
// - The git hooks: both of the frame (commit-msg « a closed ticket refuses a second commit, a reopened ticket takes its corrections », pre-push night branch
//   guard) are placed by scripts/crochets.mjs, the mechanism `grillhouse hooks` (the project's
//   `prepare`) also runs, in the hooks folder git reads for the project (`core.hooksPath`, else the
//   default one; the configuration stays). A hook of the project keeps its lines, which still run;
//   the frame's lines of a former version give way to the current ones.
// - The plugins: after the files, the command line installs the plugins the project's settings
//   declare, for the project, by scripts/greffons.mjs (the mechanism scripts/setup.sh also calls;
//   `mettreAJour` itself never calls claude). A plugin that cannot be installed has its line naming
//   the command to type; the update has finished its files, and the exit code is non-zero.
// - The generated files: after the package.json, each generator of the frame is run in the project
//   by the project's command (`node_modules/.bin/grillhouse`, its installed package) for the file
//   it writes when the project holds that file (`grillhouse frontieres --ecrire` for
//   `.dependency-cruiser.cjs`, `grillhouse index-interfaces` for
//   `docs/agents/index-des-interfaces.md`), and `grillhouse turbo-des-paquets --ecrire`
//   in a repository with `workspaces` (the `turbo.json` of each of its packages, whose build waits
//   for its runtime dependencies only, and of which a package out of the frame plays no task; the
//   `dependsOn` of the guard tasks of the root's turbo.json, which wait for the builds; it reads
//   with jsonc-parser, which `npm install` brings), so that the frame's checks accept them; a generator
//   that fails, or a project without its command, has its line, which says to run it after
//   `npm install` (the frame's package and tools), and the exit code is non-zero. `interfaces-contre-code.mjs` is not
//   run: it writes after a build.
// - An option other than `--source <path>` is refused: the usage is shown (the exit code is
//   non-zero) and nothing is updated, `--help` included.
// - The version of the frame: one for the package and its mod, the `version` of the source's
//   `packages/grillhouse/package.json`. The report names it with the source's commit (« Cadre
//   0.16.0 (commit abc1234). »); a source without it is named « sans version ».
// - The source: --source, else GRILLHOUSE_SOURCE, else Grillhouse's repository on GitHub, kept in
//   ~/.cache/grillhouse/roomis-grillhouse and moved to the last commit of its default branch
//   (`git pull --ff-only`, after a first shallow clone): the update installs that commit, whatever
//   its version, never a tag chosen.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEPOT = 'https://github.com/roomi-fields/roomis-grillhouse.git';
const PAQUET = 'packages/grillhouse/package.json';
const SCRIPTS = {
  tableau: 'grillhouse tableau --texte',
  'grillhouse:maj': 'grillhouse maj',
};
// The command of the project's `prepare` that places the frame's git hooks (Husky's model).
const PREPARE = 'grillhouse hooks';

// The frame's tools: their names are the frame's, their versions are read in the source.
const OUTILS_DU_CADRE = [
  '@microsoft/api-extractor',
  '@microsoft/api-extractor-model',
  '@microsoft/tsdoc-config',
  'dependency-cruiser',
  'jsonc-parser',
  'knip',
  'turbo',
  'yaml',
];
// The root scripts of the tests, written together from the source.
const SCRIPTS_DES_TESTS = ['test', 'test:vitest', 'test:forcer', 'verifier'];
const CHAMPS_INSTALLES = ['dependencies', 'devDependencies', 'optionalDependencies'];

// The frame's former wiring of the guards: the call its `pretest` held, and the commands its
// `integration:gardes` held.
const APPEL_GARDES = 'npm run --silent grillhouse:gardes';
const ANCIENS_GARDES_D_INTEGRATION = [
  APPEL_GARDES,
  'npm run --silent pretest',
  'node scripts/integration/gardes.mjs',
];
// The root script of the project's own guards, which `npm run verifier` plays (turbo.json), and
// the one the former integration played.
const GARDES_DU_PROJET = 'gardes';
const ANCIEN_GARDES_DU_PROJET = 'integration:gardes';
// The line of `.gitignore` that keeps Turborepo's folder out of git.
const TURBO_IGNORE = '.turbo/';
// The frame's templates of `turbo.json`, one per form of repository, read in the source.
const TURBO_PAQUETS = 'templates/turbo/paquets.json';
const TURBO_SANS_PAQUETS = 'templates/turbo/sans-paquets.json';
// The directory of the frame's configuration package of Vitest, a frame directory.
const CONFIG_VITEST = 'packages/grillhouse/scripts/vitest-config';

// Whether `vitest` is declared in the dependencies of the package.json <p> (read at <dossier>) or of
// one of its packages of the frame (`paquets`: the workspaces as npm maps them, a package out of
// the frame left out, which Turborepo never tests).
const declareVitest = (dossier, p) => {
  const a = pkg => Boolean(pkg?.dependencies?.vitest ?? pkg?.devDependencies?.vitest);
  return a(p) || paquets(dossier).some(({ pkg, hors }) => !hors && a(pkg));
};
// The version of the Vitest the project's root resolves, as `test:vitest` calls it
// (`npx --no-install vitest --version`); null when it answers none.
const vitestDeLaRacine = projet => {
  const r = spawnSync('npx', ['--no-install', 'vitest', '--version'], {
    cwd: projet,
    encoding: 'utf8',
  });
  return r.status === 0 ? (/vitest\/(\d+\.\d+\.\d+\S*)/.exec(r.stdout)?.[1] ?? null) : null;
};
// The `semver` library, resolved from the project (the update runs there), else from this script.
const semverDuProjet = projet => {
  try {
    const require = createRequire(path.join(projet, 'package.json'));
    return require('semver');
  } catch {
    const require = createRequire(import.meta.url);
    return require('semver');
  }
};
const lireJson = (f, defaut) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return defaut;
  }
};

// Adds `.turbo/` to the `.gitignore` of the project at <projet> when no line ignores it.
function ignorerTurbo(projet) {
  const f = path.join(projet, '.gitignore');
  const texte = existsSync(f) ? readFileSync(f, 'utf8') : '';
  const lignes = texte.split('\n').map(l => l.trim());
  if (lignes.some(l => l === '.turbo' || l === TURBO_IGNORE || l === '/.turbo' || l === '/.turbo/'))
    return;
  const fin = texte === '' || texte.endsWith('\n') ? '' : '\n';
  writeFileSync(f, `${texte}${fin}${TURBO_IGNORE}\n`);
}

// Writes the `turbo.json` of the project at <projet>, when it has a package.json and no turbo.json,
// from the source's template of its form (`workspaces` declared: a repository of packages).
// Returns the template written, or null.
function poserTurbo(projet, source) {
  const f = path.join(projet, 'turbo.json');
  const pkg = path.join(projet, 'package.json');
  if (existsSync(f) || !existsSync(pkg)) return null;
  const gabarit = lireJson(pkg, {}).workspaces !== undefined ? TURBO_PAQUETS : TURBO_SANS_PAQUETS;
  if (!existsSync(path.join(source, gabarit))) return null;
  copyFileSync(path.join(source, gabarit), f);
  return gabarit;
}

// Makes the frame's configuration package of Vitest a workspace of the project of packages at
// <projet>, whose root package.json <p> it changes, and declares the package, by its name read in
// the source, in the devDependencies of each package of the frame whose scripts hold
// `test:vitest`, a declaration the package holds kept; a package out of the frame is not touched. Returns { espace, nom, paquets } (espace: the directory added
// to the workspaces, or null; paquets: the packages that received the declaration), or null when
// nothing changes.
function poserConfigVitest(projet, source, p) {
  const nom = lireJson(path.join(source, CONFIG_VITEST, 'package.json'), {}).name;
  if (p.workspaces === undefined || typeof nom !== 'string') return null;
  const tous = paquets(projet);
  const testes = tous.filter(
    ({ dossier, pkg, hors }) =>
      !hors && dossier !== CONFIG_VITEST && typeof pkg.scripts?.['test:vitest'] === 'string'
  );
  if (testes.length === 0) return null;
  let espace = null;
  if (!tous.some(({ dossier }) => dossier === CONFIG_VITEST)) {
    if (Array.isArray(p.workspaces)) {
      p.workspaces = [...p.workspaces, CONFIG_VITEST];
    } else {
      p.workspaces = {
        ...p.workspaces,
        packages: [...(p.workspaces.packages ?? []), CONFIG_VITEST],
      };
    }
    espace = CONFIG_VITEST;
  }
  const declarants = [];
  for (const { dossier, pkg } of testes) {
    if (CHAMPS_INSTALLES.some(c => pkg[c]?.[nom] !== undefined)) continue;
    pkg.devDependencies = Object.fromEntries(
      Object.entries({ ...(pkg.devDependencies ?? {}), [nom]: '*' }).sort(([a], [b]) =>
        a.localeCompare(b, 'en')
      )
    );
    writeFileSync(path.join(projet, dossier, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
    declarants.push(dossier);
  }
  return espace !== null || declarants.length > 0 ? { espace, nom, paquets: declarants } : null;
}

// Brings the project at `projet` to the frame at `source`. Returns what changed.
export function mettreAJour(projet, source) {
  const bilan = {
    dependances: [],
    test: null,
    vitest: null,
    turbo: null,
    configVitest: null,
    gardes: null,
  };
  const pkg = path.join(projet, 'package.json');
  if (existsSync(pkg)) {
    const p = lireJson(pkg, {});
    const pkgSource = lireJson(path.join(source, 'package.json'), {});
    const gardes = pkgSource.scripts?.['grillhouse:gardes'];
    p.scripts = { ...(p.scripts ?? {}), ...SCRIPTS };
    // The project's `prepare`, which npm runs at its install, places the frame's git hooks first.
    const prepare = typeof p.scripts.prepare === 'string' ? p.scripts.prepare.trim() : '';
    if (!prepare.split(/\s*&&\s*/).includes(PREPARE)) {
      p.scripts.prepare = prepare === '' ? PREPARE : `${PREPARE} && ${prepare}`;
    }
    if (typeof pkgSource.scripts?.api === 'string') {
      p.scripts.api = pkgSource.scripts.api;
    }
    // The frame's tests (Turborepo's tasks) replace a project's own test that runs Vitest.
    const testDuCadre = pkgSource.scripts?.test;
    const testDuProjet = p.scripts.test;
    const vitestExige = pkgSource.devDependencies?.vitest ?? pkgSource.dependencies?.vitest;
    const lanceVitest =
      typeof testDuCadre === 'string' &&
      typeof testDuProjet === 'string' &&
      (testDuProjet === testDuCadre || /\bvitest\b/.test(testDuProjet) || declareVitest(projet, p));
    if (lanceVitest) {
      // The root must resolve the Vitest the frame requires (`test:vitest` calls it).
      const trouvee = typeof vitestExige === 'string' ? vitestDeLaRacine(projet) : null;
      const convient =
        typeof vitestExige !== 'string' ||
        (trouvee !== null && semverDuProjet(projet).satisfies(trouvee, vitestExige));
      if (!convient) {
        bilan.vitest = { trouvee, exigee: vitestExige };
      } else {
        if (testDuProjet !== testDuCadre)
          bilan.test = { ancien: testDuProjet, nouveau: testDuCadre };
        for (const nom of SCRIPTS_DES_TESTS) {
          const script = pkgSource.scripts?.[nom];
          if (typeof script !== 'string') continue;
          // A repository of packages keeps its tests in its packages, as Turborepo does: its root
          // gets no `test:vitest`, and the frame's own leaves.
          if (p.workspaces !== undefined && nom === 'test:vitest') {
            if (p.scripts[nom] === script) delete p.scripts[nom];
            continue;
          }
          p.scripts[nom] = script;
        }
      }
    }
    for (const nom of OUTILS_DU_CADRE) {
      const version = pkgSource.devDependencies?.[nom];
      if (typeof version === 'string' && !CHAMPS_INSTALLES.some(c => p[c]?.[nom] !== undefined)) {
        p.devDependencies = { ...(p.devDependencies ?? {}), [nom]: version };
        bilan.dependances.push(nom);
      }
    }
    if (p.devDependencies) {
      p.devDependencies = Object.fromEntries(
        Object.entries(p.devDependencies).sort(([a], [b]) => a.localeCompare(b, 'en'))
      );
    }
    if (typeof pkgSource.packageManager === 'string' && typeof p.packageManager !== 'string') {
      p.packageManager = pkgSource.packageManager;
    }
    if (typeof gardes === 'string') p.scripts['grillhouse:gardes'] = gardes;
    // The commands of the known debt of the guards (scripts/dette.mjs) are the frame's.
    for (const nom of ['grillhouse:dette:inscrire', 'grillhouse:dette:elaguer']) {
      const script = pkgSource.scripts?.[nom];
      if (typeof script === 'string') p.scripts[nom] = script;
    }
    // The frame's former wiring of the guards goes: Turborepo plays them (`npm run verifier`).
    const pretest = typeof p.scripts.pretest === 'string' ? p.scripts.pretest.trim() : null;
    if (pretest === APPEL_GARDES) {
      delete p.scripts.pretest;
    } else if (pretest?.startsWith(`${APPEL_GARDES} && `)) {
      p.scripts.pretest = pretest.slice(APPEL_GARDES.length + 4);
    }
    // The project's own guards, which the former integration played, move to `gardes`.
    if (typeof p.scripts[ANCIEN_GARDES_DU_PROJET] === 'string') {
      let reste = p.scripts[ANCIEN_GARDES_DU_PROJET].trim();
      for (
        let tete;
        (tete = ANCIENS_GARDES_D_INTEGRATION.find(
          c => reste === c || reste.startsWith(`${c} && `)
        ));
      ) {
        reste = reste.slice(tete.length).replace(/^ && /, '');
      }
      if (reste === '') {
        delete p.scripts[ANCIEN_GARDES_DU_PROJET];
      } else if (typeof p.scripts[GARDES_DU_PROJET] !== 'string') {
        delete p.scripts[ANCIEN_GARDES_DU_PROJET];
        p.scripts[GARDES_DU_PROJET] = reste;
        bilan.gardes = { deplace: true };
      } else {
        bilan.gardes = { deplace: false };
      }
    }
    bilan.configVitest = poserConfigVitest(projet, source, p);
    writeFileSync(pkg, `${JSON.stringify(p, null, 2)}\n`);
  }
  bilan.turbo = poserTurbo(projet, source);
  ignorerTurbo(projet);
  poserCrochets(projet);
  return bilan;
}

// The frame's generators, subcommands of the project's command, and the file each writes: run in
// the project after its package.json. A generator without `sortie` (the `turbo.json` of each
// package) runs in every project whose package.json declares `workspaces`.
const GENERATEURS = [
  { commande: 'frontieres', args: ['--ecrire'], sortie: '.dependency-cruiser.cjs' },
  { commande: 'index-interfaces', args: [], sortie: 'docs/agents/index-des-interfaces.md' },
  { commande: 'turbo-des-paquets', args: ['--ecrire'], sortie: null },
];

// Runs each generator whose output the project holds; returns the lines of failure.
export function regenerer(projet) {
  const lignes = [];
  const grillhouse = path.join(projet, 'node_modules', '.bin', 'grillhouse');
  const aPaquets = lireJson(path.join(projet, 'package.json'), {})?.workspaces !== undefined;
  for (const g of GENERATEURS) {
    if (g.sortie === null ? !aPaquets : !existsSync(path.join(projet, g.sortie))) {
      continue;
    }
    const r = spawnSync(grillhouse, [g.commande, ...g.args], { cwd: projet, encoding: 'utf8' });
    if (r.status !== 0) {
      lignes.push(
        `${g.sortie ?? g.commande} : \`npx grillhouse ${[g.commande, ...g.args].join(' ')}\` échoue ; lance-le après \`npm install\`, qui installe les outils du cadre. ${(r.stderr ?? '').trim()}`.trim()
      );
    }
  }
  return lignes;
}

const USAGE = 'Usage : npx grillhouse maj [--source <dossier Grillhouse>]   met le cadre à jour\n';

// The source checkout: the one named, else Grillhouse's repository, cloned or moved forward.
function source(arg) {
  const nommee = arg ?? process.env.GRILLHOUSE_SOURCE;
  if (nommee) {
    return path.resolve(nommee);
  }
  const cache = path.join(os.homedir(), '.cache', 'grillhouse', 'roomis-grillhouse');
  if (existsSync(path.join(cache, '.git'))) {
    execFileSync('git', ['-C', cache, 'pull', '-q', '--ff-only'], { stdio: 'inherit' });
  } else {
    mkdirSync(path.dirname(cache), { recursive: true });
    execFileSync('git', ['clone', '-q', '--depth', '1', DEPOT, cache], { stdio: 'inherit' });
  }
  return cache;
}

// The version of the frame at <racine>: the `version` of its package's package.json; « sans
// version » for a source that holds none.
function versionDuCadre(racine) {
  try {
    const v = JSON.parse(readFileSync(path.join(racine, PAQUET), 'utf8')).version;
    return typeof v === 'string' && v !== '' ? v : 'sans version';
  } catch {
    return 'sans version';
  }
}

const ENTREE = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
const projetCourant = process.cwd();
let src = null;
let version = 'inconnue';
// The exit code of a command that ends before the update: a usage refused, the update handed over
// to the source's script. Null while the update is still to do.
let fin = null;
if (ENTREE) {
  const args = process.argv.slice(2);
  const valide = args.every((a, k) => a === '--source' || args[k - 1] === '--source');
  if (!valide || args.at(-1) === '--source') {
    process.stderr.write(USAGE);
    fin = 2;
  } else {
    const i = process.argv.indexOf('--source');
    src = source(i > 0 ? process.argv[i + 1] : undefined);
    try {
      version = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
      version = 'inconnue';
    }
    const neuf = path.join(src, 'packages/grillhouse/scripts/grillhouse-maj.mjs');
    if (existsSync(neuf) && realpathSync(neuf) !== realpathSync(fileURLToPath(import.meta.url))) {
      // The source's script does the update, the source's modules beside it.
      const r = spawnSync(process.execPath, [neuf, '--source', src], { stdio: 'inherit' });
      fin = r.status ?? 1;
    }
  }
}
if (fin !== null) process.exitCode = fin;

// The frame's modules the update calls, loaded once the script running is the one that does the
// update: the package's script hands over to the source's before reading the modules beside it.
let poserCrochets, installerGreffons, paquets;
if (fin === null) {
  ({ poserCrochets } = await import('./crochets.mjs'));
  ({ installerGreffons } = await import('./greffons.mjs'));
  ({ paquets } = await import('./paquets.mjs'));
}

if (ENTREE && fin === null) {
  const projet = projetCourant;
  const b = mettreAJour(projet, src);
  process.stdout.write(`Cadre ${versionDuCadre(src)} (commit ${version.slice(0, 7)}).\n`);
  if (b.dependances.length > 0) {
    process.stdout.write(
      `Dépendances de développement ajoutées : ${b.dependances.join(', ')}. \`npm install\` les installe.\n`
    );
  }
  if (b.configVitest) {
    const { espace, nom, paquets: declarants } = b.configVitest;
    const faits = [
      espace && `${espace} ajouté aux workspaces`,
      declarants.length > 0 &&
        `${nom} déclaré dans les devDependencies de ${declarants.join(', ')}`,
    ].filter(Boolean);
    process.stdout.write(
      `Configuration de base de Vitest : ${faits.join(' ; ')}. \`npm install\` relie le paquet. La configuration Vitest de chaque paquet l'importe par son nom : \`import base from '${nom}'\`.\n`
    );
  }
  if (b.turbo) {
    process.stdout.write(
      `turbo.json écrit depuis le gabarit du cadre ${b.turbo} ; il est au projet, la mise à jour n'y touche plus.\n`
    );
  }
  if (b.gardes?.deplace) {
    process.stdout.write(
      `Gardes du projet : le script integration:gardes devient gardes, que \`npm run verifier\` joue après la construction (turbo.json).\n`
    );
  } else if (b.gardes) {
    process.stdout.write(
      `Gardes du projet : integration:gardes et gardes coexistent ; rien ne joue plus integration:gardes, \`npm run verifier\` joue gardes. Verse l'un dans l'autre.\n`
    );
  }
  if (b.vitest) {
    process.stdout.write(
      `Vitest : la racine résout ${b.vitest.trouvee ?? 'aucune version'}, le cadre exige ${b.vitest.exigee} ; le script test du projet reste tel quel.\n`
    );
  }
  if (b.test) {
    process.stdout.write(
      `Script test : \`${b.test.ancien}\` remplacé par le test du cadre \`${b.test.nouveau}\` (Turborepo : construction, puis tests ; une tâche dont rien n'a bougé est relue de son cache ; \`npm run verifier\` joue les gardes et les tests).\n`
    );
  }
  for (const l of [...regenerer(projet), ...installerGreffons(projet)]) {
    process.stderr.write(`${l}\n`);
    process.exitCode = 1;
  }
}
