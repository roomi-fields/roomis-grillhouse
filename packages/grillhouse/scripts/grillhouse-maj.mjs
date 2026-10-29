#!/usr/bin/env node
// The frame's update: brings what the frame writes in a project to the version of the package
// installed, as `npx @turbo/codemod migrate` brings a repository to the version of Turborepo.
//
//   npx grillhouse maj    update (npm run grillhouse:maj), after `npm install` of the version wanted
//
// - The versions pass by npm: the project installs the version of @roomi-fields/grillhouse it wants
//   (`npm install -D @roomi-fields/grillhouse@<version>`), then the update brings the project to it.
//   What the update reads of the frame is the package's own (scripts/cadre.mjs): the template of a
//   project (`templates/projet/package.json` for the frame's scripts and tools,
//   `templates/turbo/*.json` for a turbo.json). Any argument is refused: the usage is shown (the
//   exit code is non-zero) and nothing is updated, `--help` included.
// - The migrations first (scripts/migrations.mjs): each migration of the package newer than the
//   version the project recorded (`grillhouse.version` of its package.json; none recorded, every
//   migration), in the order of their versions; each is replayable without effect, and the report
//   names each one that changed something, with what it changed. What a migration leaves to the
//   project (a copy of the frame the project modified, scripts/migrations/0.23.2-copies-du-cadre.mjs)
//   is written on the error stream, with the command that does it, and the exit code is non-zero;
//   the project keeps the version it recorded, so that the next update plays that migration again.
//   Last, after the update and the regeneration, what stays to the project (`restes` of a
//   migration played, scripts/migrations.mjs: in 0.24.0, a file that still calls a former copy of
//   the frame; in 0.24.2, API Extractor still declared by the project) is reported on the standard output, « reste au projet », with no effect on the exit
//   code nor on the version recorded.
// - The frame copies no file into a project: its scripts are the package's, its skills, agents,
//   hooks of Claude Code, common charter and meta-frame the plugin's, which the package carries
//   (scripts/cadre.mjs): the frame arrives in one piece, at the version npm installs.
// - The frame's plugin is a setting of the project: in a project whose `.claude/settings.json`
//   exists, `extraKnownMarketplaces` declares the marketplace `roomi-fields` (GitHub,
//   `roomi-fields/claude-plugins`), which names the package npm as the plugin's source, and
//   `enabledPlugins` enables its plugin, `grillhouse@roomi-fields`, each added after the keys the
//   settings hold, which keep their order. What is a project's own (its charter, its settings, its
//   version of the package) lives in the project, never in what is published: the machine knows a
//   marketplace by its name, once for every project. A migration takes off the marketplace of the
//   project's own an earlier update wrote (scripts/migrations/0.23.0-marche-du-projet.mjs).
// - The status line is a setting of the project, as Husky writes the project's own configuration:
//   in a project whose `.claude/settings.json` exists, `statusLine` becomes the frame's
//   (`"$CLAUDE_PROJECT_DIR/node_modules/.bin/grillhouse" ligne-etat`) when it is absent or names
//   the frame's status line (`ligne-etat`, whatever its former form); a status line of the
//   project's own stays. The settings keep their other keys, in their order.
// - `package.json`, when there is one: the version of the frame it is brought to
//   (`grillhouse.version`, the package's version once no migration leaves anything to do), the
//   frame's npm scripts (`tableau`,
//   `grillhouse:maj`), its `prepare` beginning with `grillhouse hooks` (the frame's git hooks at
//   each `npm install`, as Husky's `prepare`; a `prepare` of the project's own follows it,
//   `grillhouse hooks && …`), and `grillhouse:gardes` (scripts/gardes-du-cadre.mjs, the frame's controls), `grillhouse:dette:inscrire` and
//   `grillhouse:dette:elaguer` (the known debt of the guards, scripts/dette.mjs), and `api` (`npm run api`, which writes
//   the API reports and the generated part of each `docs/INTERFACE.md`), each read as it is in the
//   template's `package.json` (a template without one writes none). Turborepo plays `grillhouse:gardes`
//   and the project's own guards, the root script `gardes`, after the build, beside the tests
//   (`turbo.json`, `npm run verifier`): the frame's former wiring goes, a `pretest` that is the
//   frame's call (`npm run --silent grillhouse:gardes`) removed or taken off the head of a longer
//   one (`… && <its pretest>`, the rest kept; a `pretest` of the project's own stays). An
//   `integration:gardes`, the script the former integration played, loses each head that is a
//   former frame command (that call, `npm run --silent pretest`,
//   `node scripts/integration/gardes.mjs`); what remains is the project's own guards, which move to
//   `gardes` when the project has none (the report says so), else stay where nothing plays them
//   (the report names both); nothing remaining, the script goes.
// - The typing: each package of TypeScript (a `tsconfig.json`) that has no `typecheck` script
//   receives the template's, `tsc -p tsconfig.json --noEmit` (its tsconfig.json types its sources
//   and its tests, nothing emitted, as the template's does; its tsconfig.build.json builds), as a
//   package of the examples of create-turbo types itself (`check-types`): each package of the frame
//   in a project with `workspaces` (a package out of the frame is not touched, the root's
//   `typecheck` stays the project's), the root in a project without. `npm run verifier` plays it,
//   the task `typecheck` of Turborepo, which the generator keeps in the root's turbo.json
//   (scripts/langages/typescript/turbo-des-paquets.mjs). The report names the packages that received it. Witness:
//   BPScript 320.21.4, whose type errors in test/ showed only at night.
// - `turbo.json` is the project's own file, as every repository run by Turborepo writes its own. A
//   project with a `package.json` and no `turbo.json` receives the frame's template of its form:
//   `templates/turbo/paquets.json` when its `package.json` declares
//   `workspaces` (the tasks of each package, and the root's guards, `//#grillhouse:gardes` and
//   `//#gardes`, and `typecheck`, after the build of each package and of its dependencies; the
//   tests live in the packages, the root has no `test:vitest`; the `build` of each package is set by its own
//   generated `turbo.json`, below), else `templates/turbo/sans-paquets.json` (`build`, then the
//   guards, the tests and `typecheck` beside each other).
//   A `turbo.json` present is never written again by the update; only the generator of the
//   packages' turbo.json (below) writes in it the `dependsOn` of the guard tasks, and adds one it
//   lacks, and the typing task.
// - The languages first (`declarerLangages`): a project that declares none (`grillhouse.langages`
//   of its package.json) receives the languages the modules of the frame find in it
//   (`langagesTrouves` of scripts/langages.mjs: typescript, a tsconfig.json at its root or in a
//   package of the frame), and the report says so; a declaration it holds stays. A directory
//   without package.json, or a project where no module finds its language, is refused, named on
//   the error stream, the exit code 1, nothing written: the frame invents no declaration, and the
//   migrations of the declared language play with the core's. No import of the project is
//   rewritten.
// - The tools of the declared language (the `outils` of its module: what it runs as commands,
//   Turborepo, knip, dependency-cruiser, and what its scripts import, API Extractor among them),
//   and none other, are added
//   to the project's `devDependencies` at the version the template's `devDependencies` give; a
//   tool the project already declares in `dependencies`, `devDependencies` or
//   `optionalDependencies` keeps its declaration, one a previous version added stays, and
//   `devDependencies` are written sorted by name. The report names each tool added and
//   `npm install`, which installs them. The project's `tsdoc.json` extends the package's TSDoc base
//   (`@roomi-fields/grillhouse/tsdoc-base.json`), which extends API Extractor's. A project without
//   `packageManager` receives the template's (Turborepo requires it), and a `.gitignore` that does
//   not ignore `.turbo/` (Turborepo's runs and cache) receives the line.
// - A project that runs Vitest (its `test` script names it, or `vitest` is in the `dependencies` or
//   `devDependencies` of its root `package.json` or of one of its packages, the workspaces as npm
//   maps them, read by `paquets` of scripts/paquets.mjs, the frame's one list of the
//   packages: a package a negation takes out is none, and a package out of the frame
//   (`docs/agents/hors-cadre.txt`), which Turborepo never tests, counts for nothing) has its root scripts
//   `test`, `test:vitest`, `test:forcer` and `verifier` become the template's (`npm test`, the tests
//   as Turborepo's tasks with its cache; `npm run test:forcer`, the same played for real;
//   `npm run verifier`, scripts/langages/typescript/verifier.mjs, the guards and the tests beside each other, which the
//   integration, the queue, the continuous integration and the night play); the report says so, when the
//   Vitest of the project's root (`npx --no-install vitest`, the one `test:vitest` calls) satisfies
//   the range the template's package.json declares for `vitest`. Where the root resolves no Vitest or
//   another version, the project's scripts stay (the frame's included) and the report names the
//   version found and the range required. A `test` that runs anything else stays. The scripts of
//   the packages of a monorepo are not written, but their `typecheck` (above).
// - The frame's base configuration of Vitest is the package's (`@roomi-fields/grillhouse/vitest-config`,
//   scripts/langages/typescript/vitest-config/), which each Vitest configuration imports by its name
//   (`import base from '@roomi-fields/grillhouse/vitest-config'`), as the examples of Turborepo
//   reach @repo/eslint-config: a package is reached by its name, never by a path into it. In a
//   project with `workspaces`, each package of the frame that holds a `test:vitest` script
//   declares the frame's package in its `devDependencies`, at the range the root declares (else
//   `^<version>` of the package), a declaration it holds kept; a package out of the frame is not
//   touched. The report names the packages that received it, `npm install`, which links it, and the
//   import; the update writes no Vitest configuration.
// - A package of the frame whose code imports the frame's package (a file of its `src/` out of the
//   tests, the files whose development dependencies the guard of the boundaries refuses,
//   scripts/langages/typescript/frontieres.mjs; its imports read by TypeScript's `preProcessFile`) declares it in its
//   `dependencies`, as npm puts there what the published code imports: a declaration in its
//   `devDependencies` moves there with its range, else the range the root declares (else
//   `^<version>`); this comes first, so that the declaration of the Vitest base above keeps it.
//   The report names the packages and `npm install`.
// - The git hooks: both of the frame (commit-msg « a closed ticket refuses a second commit, a reopened ticket takes its corrections », pre-push night branch
//   guard) are placed by scripts/crochets.mjs, the mechanism `grillhouse hooks` (the project's
//   `prepare`) also runs, in the hooks folder git reads for the project (`core.hooksPath`, else the
//   default one; the configuration stays). A hook of the project keeps its lines, which still run;
//   the frame's lines of a former version give way to the current ones.
// - The plugins: after the files, the command line installs the plugins the project's settings
//   declare, for the project, by scripts/greffons.mjs (the mechanism `grillhouse init` also calls;
//   `mettreAJour` itself never calls claude), and brings the frame's mod to the package's version,
//   as `npm install` brings what is installed to what is declared. A plugin that cannot be
//   installed, or a mod left at another version, has its line naming the command to type; the
//   update has finished its files, and the exit code is non-zero.
// - The generated files: after the package.json, each generator of the frame is run in the project
//   by the project's command (`node_modules/.bin/grillhouse`, its installed package) for the file
//   it writes when the project holds that file (`grillhouse frontieres --ecrire` for
//   `.dependency-cruiser.cjs`, `grillhouse index-interfaces` for
//   `docs/agents/index-des-interfaces.md`; every one of them for a project `grillhouse init`
//   creates), and `grillhouse turbo-des-paquets --ecrire`
//   in a repository with `workspaces` (the `turbo.json` of each of its packages, whose build waits
//   for its runtime dependencies only, and of which a package out of the frame plays no task; the
//   `dependsOn` of the guard tasks of the root's turbo.json, which wait for the builds), so that
//   the frame's checks accept them; a generator
//   that fails, or a project without its command, has its line, which says to run it after
//   `npm install` (the frame's package and tools), and the exit code is non-zero. `interfaces-contre-code.mjs` is not
//   run: it writes after a build.
// - The report names the version of the frame, « Cadre 0.23.0. », the package's.
// - Last, the update plays the project's verification, `npm run verifier`, from its root, its
//   output shown, as Nx affected moves its base to the last green commit of main: its green keeps
//   the last green (scripts/dernier-vert.mjs), HEAD and the tree of the working tree, the update's
//   changes included, so that once they are committed as they stand, a copy that starts from that
//   commit measures nothing changed (witness: BPScript 320.3.9, whose full pass measured 26 files
//   since main's last green, 11 from the updates 0.24.5 and 0.24.6 committed without one). The
//   update exits with its code (a failure before it, a plugin's, keeps 1), and the report's last
//   line says it: green, the last green kept; red, its code, the last green as it was; 75, « à
//   repasser ». It is not played, the line saying why, when the update leaves its files to finish
//   (a migration's `aFaire`, a generator that fails: on the error stream, the exit code already
//   non-zero), when the project has no `verifier` script, or when the report asks for
//   `npm install` first (a tool or the frame's package newly declared).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';
import { CADRE, VERSION } from './cadre.mjs';
import { poserCrochets } from './crochets.mjs';
import { installerGreffons } from './greffons.mjs';
import { migrer, restesAuProjet } from './migrations.mjs';
import { LANGAGES, langageDe, langagesDeclares, langagesTrouves } from './langages.mjs';
import { CODE, paquets, TYPAGE } from './paquets.mjs';
import { sources } from './sources.mjs';

const SCRIPTS = {
  tableau: 'grillhouse tableau --texte',
  'grillhouse:maj': 'grillhouse maj',
};
// The command of the project's `prepare` that places the frame's git hooks (Husky's model).
const PREPARE = 'grillhouse hooks';
// The template's package.json, where the frame's scripts and tools are read.
const GABARIT = 'templates/projet/package.json';
// The frame's package, as a project declares it, and its base configuration of Vitest.
const PAQUET_DU_CADRE = '@roomi-fields/grillhouse';
const CONFIG_VITEST = `${PAQUET_DU_CADRE}/vitest-config`;

/** The frame's status line, as the settings of a project run it. */
export const LIGNE_ETAT = '"$CLAUDE_PROJECT_DIR/node_modules/.bin/grillhouse" ligne-etat';

// The root scripts of the tests, written together from the template.
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

// <deps> written sorted by name, as npm writes them.
const trie = deps =>
  Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b, 'en')));
// The range at which the root package.json <p> declares the frame's package, or undefined.
const plageDeLaRacine = p =>
  CHAMPS_INSTALLES.map(c => p[c]?.[PAQUET_DU_CADRE]).find(v => v !== undefined);

// Whether the code of the package at <dossier> of <projet> imports the frame's package (an entry of
// it): a file of its `src/` (CODE of scripts/paquets.mjs) out of the tests (`estUnTest` of the
// module of the project's language, scripts/langages.mjs), its imports read by TypeScript
// (`preProcessFile`), a comment or a string importing nothing.
function codeImporteLeCadre(projet, dossier) {
  const ts = createRequire(import.meta.url)('typescript');
  return sources(path.join(projet, dossier))
    .map(f => `${dossier}/${f}`)
    .filter(f => new RegExp(CODE).test(f) && !langageDe(projet).estUnTest(f, projet)?.test)
    .some(f =>
      ts
        .preProcessFile(readFileSync(path.join(projet, f), 'utf8'), true, true)
        .importedFiles.some(
          ({ fileName: m }) => m === PAQUET_DU_CADRE || m.startsWith(`${PAQUET_DU_CADRE}/`)
        )
    );
}

// Declares the frame's package in the dependencies of each package of the frame of the project of
// packages at <projet> (root package.json <p>) whose code imports it (codeImporteLeCadre), as npm
// puts what the published code imports: a declaration in its devDependencies moves there with its
// range, else the range the root declares (else `^<version>` of the package); one already in its
// dependencies or optionalDependencies stays. Returns { nom, paquets } (paquets: the packages
// whose dependencies received it), or null when nothing changes.
function declarerDependanceDuCadre(projet, p) {
  if (p.workspaces === undefined) {
    return null;
  }
  const racine = plageDeLaRacine(p);
  const declarants = [];
  for (const { dossier, pkg, hors } of paquets(projet)) {
    const declare = ['dependencies', 'optionalDependencies'].some(
      c => pkg[c]?.[PAQUET_DU_CADRE] !== undefined
    );
    if (hors || declare || !codeImporteLeCadre(projet, dossier)) {
      continue;
    }
    const { [PAQUET_DU_CADRE]: dev, ...autres } = pkg.devDependencies ?? {};
    pkg.dependencies = trie({
      ...(pkg.dependencies ?? {}),
      [PAQUET_DU_CADRE]: dev ?? racine ?? `^${VERSION}`,
    });
    if (dev !== undefined) {
      pkg.devDependencies = autres;
    }
    writeFileSync(path.join(projet, dossier, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
    declarants.push(dossier);
  }
  return declarants.length > 0 ? { nom: PAQUET_DU_CADRE, paquets: declarants } : null;
}

// Declares the frame's package, whose base configuration of Vitest each Vitest configuration
// imports, in the devDependencies of each package of the frame of the project of packages at
// <projet> (root package.json <p>) whose scripts hold `test:vitest`, at the range the root declares
// (else `^<version>` of the package), a declaration the package holds kept; a package out of the
// frame is not touched. Returns { nom, paquets } (paquets: the packages that received the
// declaration), or null when nothing changes.
function poserConfigVitest(projet, p) {
  if (p.workspaces === undefined) return null;
  const testes = paquets(projet).filter(
    ({ pkg, hors }) => !hors && typeof pkg.scripts?.['test:vitest'] === 'string'
  );
  const racine = plageDeLaRacine(p);
  const declarants = [];
  for (const { dossier, pkg } of testes) {
    if (CHAMPS_INSTALLES.some(c => pkg[c]?.[PAQUET_DU_CADRE] !== undefined)) continue;
    pkg.devDependencies = trie({
      ...(pkg.devDependencies ?? {}),
      [PAQUET_DU_CADRE]: racine ?? `^${VERSION}`,
    });
    writeFileSync(path.join(projet, dossier, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
    declarants.push(dossier);
  }
  return declarants.length > 0 ? { nom: PAQUET_DU_CADRE, paquets: declarants } : null;
}

// Gives the typing script of the template, <script> (`tsc -p tsconfig.json --noEmit`: its
// tsconfig.json types its sources and its tests, nothing emitted), to each package of TypeScript
// (a `tsconfig.json`) of the project at <projet> (root package.json <p>) that has no `typecheck`:
// each package of the frame in a project of packages, written in its package.json (a package out
// of the frame is not touched, and the root's `typecheck` stays the project's); the root itself in
// a project without packages, set in <p>, which the caller writes. `npm run verifier` plays it, a
// task of Turborepo (scripts/langages/typescript/turbo-des-paquets.mjs). Returns { script, paquets } (paquets: each
// package's directory, `.` for the root), or null when nothing changes.
function poserTypage(projet, p, script) {
  if (typeof script !== 'string') return null;
  const types = dossier => existsSync(path.join(projet, dossier, 'tsconfig.json'));
  const sans = pkg => typeof pkg.scripts?.[TYPAGE] !== 'string';
  const declarants = [];
  if (p.workspaces === undefined) {
    if (types('.') && sans(p)) {
      p.scripts = { ...(p.scripts ?? {}), [TYPAGE]: script };
      declarants.push('.');
    }
  } else {
    for (const { dossier, pkg, hors } of paquets(projet)) {
      if (hors || !types(dossier) || !sans(pkg)) continue;
      pkg.scripts = { ...(pkg.scripts ?? {}), [TYPAGE]: script };
      writeFileSync(
        path.join(projet, dossier, 'package.json'),
        `${JSON.stringify(pkg, null, 2)}\n`
      );
      declarants.push(dossier);
    }
  }
  return declarants.length > 0 ? { script, paquets: declarants } : null;
}

// Writes the frame's status line in the settings of the project at <projet>, when they exist and
// hold none or the frame's (see the header); their other keys keep their order. Returns whether
// they changed.
function reglerLigneEtat(projet) {
  const f = path.join(projet, '.claude', 'settings.json');
  if (!existsSync(f)) return false;
  const reglages = JSON.parse(readFileSync(f, 'utf8'));
  const actuelle = reglages.statusLine;
  const commande = typeof actuelle?.command === 'string' ? actuelle.command : '';
  if (actuelle !== undefined && !commande.includes('ligne-etat')) return false;
  const voulue = { type: 'command', command: LIGNE_ETAT };
  if (JSON.stringify(actuelle) === JSON.stringify(voulue)) return false;
  reglages.statusLine = voulue;
  writeFileSync(f, `${JSON.stringify(reglages, null, 2)}\n`);
  return true;
}

/** The marketplace of the frame's plugin, its source, and the plugin's identifier. */
export const MARCHE_DU_CADRE = 'roomi-fields';
export const SOURCE_DU_MARCHE = { source: 'github', repo: 'roomi-fields/claude-plugins' };
export const GREFFON_DU_CADRE = `grillhouse@${MARCHE_DU_CADRE}`;

// Declares in the settings of the project at <projet>, when they exist, the marketplace roomi-fields
// and enables the frame's plugin (see the header); returns whether they changed.
function declarerGreffon(projet) {
  const f = path.join(projet, '.claude', 'settings.json');
  if (!existsSync(f)) return false;
  const avant = readFileSync(f, 'utf8');
  const reglages = JSON.parse(avant);
  reglages.extraKnownMarketplaces = {
    ...(reglages.extraKnownMarketplaces ?? {}),
    [MARCHE_DU_CADRE]: { source: SOURCE_DU_MARCHE },
  };
  reglages.enabledPlugins = { ...(reglages.enabledPlugins ?? {}), [GREFFON_DU_CADRE]: true };
  if (JSON.stringify(reglages) === JSON.stringify(JSON.parse(avant))) return false;
  writeFileSync(f, `${JSON.stringify(reglages, null, 2)}\n`);
  return true;
}

/**
 * Declares the languages of the project at <projet> (`grillhouse.langages` of its package.json)
 * from what the modules of the frame find in it (`langagesTrouves`, scripts/langages.mjs), when it
 * declares none; a declaration it holds stays. Returns `{ langages, ecrits }` (ecrits: whether the
 * update wrote them). Throws, writing nothing, when the project has no package.json or the modules
 * find no language of the frame in it: the update invents no declaration.
 */
export function declarerLangages(projet) {
  const fichier = path.join(projet, 'package.json');
  if (!existsSync(fichier)) {
    throw new Error(
      `${projet} n'a pas de package.json, où un projet déclare ses langages (grillhouse.langages) ; la mise à jour du cadre s'y joue.`
    );
  }
  const declares = langagesDeclares(projet);
  if (declares.length > 0) return { langages: declares, ecrits: false };
  const trouves = langagesTrouves(projet);
  if (trouves.length === 0) {
    throw new Error(
      `aucun langage du cadre trouvé dans ${projet} (typescript : un tsconfig.json à la racine ou dans un paquet) ; déclare-le dans grillhouse.langages de ${fichier} (les langages du cadre : ${Object.keys(LANGAGES).join(', ')}), puis relance \`npx grillhouse maj\`.`
    );
  }
  const p = lireJson(fichier, {});
  p.grillhouse = { ...(p.grillhouse ?? {}), langages: trouves };
  writeFileSync(fichier, `${JSON.stringify(p, null, 2)}\n`);
  return { langages: trouves, ecrits: true };
}

/** The version of the frame the project at <projet> recorded (`grillhouse.version`), or null. */
export function versionDuProjet(projet) {
  const v = lireJson(path.join(projet, 'package.json'), {})?.grillhouse?.version;
  return typeof v === 'string' ? v : null;
}

/**
 * Brings the project at `projet` to the frame's files at `source` (CADRE, scripts/cadre.mjs; a
 * trial's own in the tests); <inscrite> is the version it records (the package's; null records
 * none, the project keeping its own). Returns what changed.
 */
export function mettreAJour(projet, source, { inscrite = VERSION } = {}) {
  const bilan = {
    langages: null,
    dependances: [],
    test: null,
    vitest: null,
    turbo: null,
    configVitest: null,
    dependanceDuCadre: null,
    typage: null,
    gardes: null,
    ligneEtat: false,
    greffon: false,
  };
  const pkg = path.join(projet, 'package.json');
  if (existsSync(pkg)) {
    bilan.langages = declarerLangages(projet);
    const p = lireJson(pkg, {});
    if (inscrite !== null) p.grillhouse = { ...(p.grillhouse ?? {}), version: inscrite };
    const pkgSource = lireJson(path.join(source, GABARIT), {});
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
        (trouvee !== null && semver.satisfies(trouvee, vitestExige));
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
    // The tools of the declared language alone (its module's `outils`), at the template's versions.
    for (const nom of langageDe(projet).outils) {
      const version = pkgSource.devDependencies?.[nom];
      if (typeof version === 'string' && !CHAMPS_INSTALLES.some(c => p[c]?.[nom] !== undefined)) {
        p.devDependencies = { ...(p.devDependencies ?? {}), [nom]: version };
        bilan.dependances.push(nom);
      }
    }
    if (p.devDependencies) {
      p.devDependencies = trie(p.devDependencies);
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
    bilan.dependanceDuCadre = declarerDependanceDuCadre(projet, p);
    bilan.configVitest = poserConfigVitest(projet, p);
    bilan.typage = poserTypage(projet, p, pkgSource.scripts?.[TYPAGE]);
    writeFileSync(pkg, `${JSON.stringify(p, null, 2)}\n`);
  }
  bilan.turbo = poserTurbo(projet, source);
  bilan.ligneEtat = reglerLigneEtat(projet);
  bilan.greffon = declarerGreffon(projet);
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

/**
 * Runs each generator whose output the project holds (every one with `tous`, for a project
 * `grillhouse init` creates); returns the lines of failure.
 */
export function regenerer(projet, { tous = false } = {}) {
  const lignes = [];
  const grillhouse = path.join(projet, 'node_modules', '.bin', 'grillhouse');
  const aPaquets = lireJson(path.join(projet, 'package.json'), {})?.workspaces !== undefined;
  for (const g of GENERATEURS) {
    const absente = g.sortie !== null && !tous && !existsSync(path.join(projet, g.sortie));
    if (g.sortie === null ? !aPaquets : absente) {
      continue;
    }
    if (g.sortie !== null)
      mkdirSync(path.dirname(path.join(projet, g.sortie)), { recursive: true });
    const r = spawnSync(grillhouse, [g.commande, ...g.args], { cwd: projet, encoding: 'utf8' });
    if (r.status !== 0) {
      lignes.push(
        `${g.sortie ?? g.commande} : \`npx grillhouse ${[g.commande, ...g.args].join(' ')}\` échoue ; lance-le après \`npm install\`, qui installe les outils du cadre. ${(r.stderr ?? '').trim()}`.trim()
      );
    }
  }
  return lignes;
}

/** The report of an update, from the bilan <b> of `mettreAJour`: one line per change. */
export function rapport(b) {
  const lignes = [];
  if (b.langages?.ecrits) {
    lignes.push(
      `Langages : grillhouse.langages déclare ${b.langages.langages.join(', ')}, trouvé dans le dépôt ; le cadre sert le projet par ce langage.`
    );
  }
  if (b.dependances.length > 0) {
    lignes.push(
      `Dépendances de développement ajoutées : ${b.dependances.join(', ')}. \`npm install\` les installe.`
    );
  }
  if (b.configVitest) {
    const { nom, paquets: declarants } = b.configVitest;
    lignes.push(
      `Configuration de base de Vitest : ${nom} déclaré dans les devDependencies de ${declarants.join(', ')}. \`npm install\` relie le paquet. La configuration Vitest de chaque paquet l'importe par son nom : \`import base from '${CONFIG_VITEST}'\`.`
    );
  }
  if (b.dependanceDuCadre) {
    const { nom, paquets: declarants } = b.dependanceDuCadre;
    lignes.push(
      `Dépendance d'exécution : ${nom} déclaré dans les dependencies de ${declarants.join(', ')}, dont le code hors des tests importe une entrée du paquet. \`npm install\` relie le paquet.`
    );
  }
  if (b.typage) {
    lignes.push(
      `Typage : \`${b.typage.script}\` écrit dans ${b.typage.paquets.join(', ')} (le script typecheck, ses sources et ses tests, que son tsconfig.json inclut) ; \`npm run verifier\` le joue à côté des gardes et des tests.`
    );
  }
  if (b.turbo) {
    lignes.push(
      `turbo.json écrit depuis le gabarit du cadre ${b.turbo} ; il est au projet, la mise à jour n'y touche plus.`
    );
  }
  if (b.ligneEtat) {
    lignes.push(`Ligne d'état : .claude/settings.json lance \`grillhouse ligne-etat\`.`);
  }
  if (b.greffon) {
    lignes.push(
      `Greffon du cadre : .claude/settings.json déclare la place de marché ${MARCHE_DU_CADRE} (${SOURCE_DU_MARCHE.repo}) et active ${GREFFON_DU_CADRE}.`
    );
  }
  if (b.gardes?.deplace) {
    lignes.push(
      `Gardes du projet : le script integration:gardes devient gardes, que \`npm run verifier\` joue après la construction (turbo.json).`
    );
  } else if (b.gardes) {
    lignes.push(
      `Gardes du projet : integration:gardes et gardes coexistent ; rien ne joue plus integration:gardes, \`npm run verifier\` joue gardes. Verse l'un dans l'autre.`
    );
  }
  if (b.vitest) {
    lignes.push(
      `Vitest : la racine résout ${b.vitest.trouvee ?? 'aucune version'}, le cadre exige ${b.vitest.exigee} ; le script test du projet reste tel quel.`
    );
  }
  if (b.test) {
    lignes.push(
      `Script test : \`${b.test.ancien}\` remplacé par le test du cadre \`${b.test.nouveau}\` (Turborepo : construction, puis tests ; une tâche dont rien n'a bougé est relue de son cache ; \`npm run verifier\` joue les gardes et les tests).`
    );
  }
  return lignes.map(l => `${l}\n`).join('');
}

// Whether the bilan <b> of `mettreAJour` asks for `npm install` (a tool or the frame's package
// newly declared), which the verification needs first.
const aInstaller = b =>
  b.dependances.length > 0 || b.configVitest !== null || b.dependanceDuCadre !== null;

// The project's verification, the last step of the update (see the header): `{ code, ligne,
// erreur }`, the code of `npm run verifier` (null when it is not played), the line of the report,
// and whether it goes on the error stream.
function verifier(projet, { fichiersAFinir, installer, vitest }) {
  const VERT_INTACT = 'le dernier vert reste où il était';
  if (fichiersAFinir) {
    return {
      code: null,
      erreur: true,
      ligne: `Vérification non jouée : la mise à jour laisse à faire ci-dessus ; ${VERT_INTACT}. Fais-le, puis \`npm run verifier\`.`,
    };
  }
  if (typeof lireJson(path.join(projet, 'package.json'), {})?.scripts?.verifier !== 'string') {
    return {
      code: null,
      erreur: false,
      ligne: `Vérification non jouée : le projet n’a pas de script verifier ; aucun dernier vert n’est posé. ${
        vitest
          ? 'La ligne « Vitest : » ci-dessus dit pourquoi : installe à la racine le Vitest que le cadre exige, puis relance `npx grillhouse maj`, qui écrit le script.'
          : 'La mise à jour l’écrit dans un projet testé par Vitest ; sinon, écris-le pour ses tests.'
      }`,
    };
  }
  if (installer) {
    return {
      code: null,
      erreur: false,
      ligne: `Vérification non jouée : \`npm install\` d’abord, qui installe ce que la mise à jour déclare, puis \`npm run verifier\` ; ${VERT_INTACT}.`,
    };
  }
  const r = spawnSync('npm', ['run', 'verifier'], { cwd: projet, stdio: 'inherit' });
  const code = r.status ?? 1;
  if (code === 0) {
    return {
      code,
      erreur: false,
      ligne:
        'Vérification : `npm run verifier` vert ; il pose le dernier vert sur l’arbre que laisse la mise à jour. Commite ces changements tels quels : une copie partie de ce commit mesure contre ce vert.',
    };
  }
  if (code === 75) {
    return {
      code,
      erreur: true,
      ligne: `Vérification : \`npm run verifier\` à repasser (code 75) ; ni vert ni rouge, ${VERT_INTACT}. Relance \`npm run verifier\` plus tard.`,
    };
  }
  const cause = r.error ? ` (${r.error.message})` : '';
  return {
    code,
    erreur: true,
    ligne: `Vérification : \`npm run verifier\` rouge (code ${code})${cause} ; ${VERT_INTACT}. Ses rouges sont nommés ci-dessus (⛔).`,
  };
}

const USAGE =
  'Usage : npx grillhouse maj   met le projet à jour du paquet installé (npm install -D @roomi-fields/grillhouse@<version> d’abord)\n';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.length > 2) {
    process.stderr.write(USAGE);
    process.exitCode = 2;
  } else {
    const projet = process.cwd();
    // The languages first: the migrations of the declared language play with the core's.
    let langages = null;
    try {
      langages = declarerLangages(projet);
    } catch (e) {
      process.stderr.write(`⛔ ${e.message}\n`);
      process.exitCode = 1;
    }
    if (langages !== null) mettreAJourLeProjet(projet, langages);
  }
}

// The update of the project at <projet>, its languages <langages> declared (declarerLangages).
function mettreAJourLeProjet(projet, langages) {
  const depuis = versionDuProjet(projet);
  const migrations = migrer(projet, depuis);
  const resteAFaire = migrations.some(m => m.aFaire.length > 0);
  const b = { ...mettreAJour(projet, CADRE, resteAFaire ? { inscrite: null } : {}), langages };
  process.stdout.write(`Cadre ${VERSION}.\n`);
  for (const { version, nom, lignes, aFaire } of migrations) {
    process.stdout.write(
      `Migration ${version} (${nom}) :\n${lignes.map(l => `- ${l}\n`).join('')}`
    );
    if (aFaire.length > 0) {
      process.stderr.write(
        `Migration ${version} (${nom}), à faire :\n${aFaire.map(l => `- ${l}\n`).join('')}`
      );
      process.exitCode = 1;
    }
  }
  process.stdout.write(rapport(b));
  const echecsDesGeneres = regenerer(projet);
  for (const l of [...echecsDesGeneres, ...installerGreffons(projet)]) {
    process.stderr.write(`${l}\n`);
    process.exitCode = 1;
  }
  for (const { version, nom, lignes } of restesAuProjet(projet, depuis)) {
    process.stdout.write(
      `Migration ${version} (${nom}), reste au projet :\n${lignes.map(l => `- ${l}\n`).join('')}`
    );
  }
  const v = verifier(projet, {
    fichiersAFinir: resteAFaire || echecsDesGeneres.length > 0,
    installer: aInstaller(b),
    vitest: b.vitest,
  });
  (v.erreur ? process.stderr : process.stdout).write(`${v.ligne}\n`);
  if (v.code !== null && !process.exitCode) {
    process.exitCode = v.code;
  }
}
