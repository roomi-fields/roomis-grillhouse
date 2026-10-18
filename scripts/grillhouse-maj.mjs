#!/usr/bin/env node
// The frame's update: brings a project's frame files to a Grillhouse version, and says how far a
// project has drifted from the version it installed.
//
//   node scripts/grillhouse-maj.mjs [--source <Grillhouse checkout>]   update (npm run grillhouse:maj)
//   node scripts/grillhouse-maj.mjs --ecarts                           the drift, one line, or nothing
//
// - The frame's files are listed in `.claude/grillhouse/fichiers.txt` of the source: each copied as
//   it is; a file the previous version installed and the new one no longer lists is removed, as is
//   each « - <path> » line. A project's own files under a frame directory stay.
// - `.claude/settings.json`: the frame's hooks, plugins, marketplaces and status line are added;
//   one the previous version installed and the new one dropped is removed; the project's own
//   settings stay. The file is written only when its JSON value changes (the same value under
//   another layout stays as it is), and the keys keep the file's order, the frame's new ones after.
// - `package.json`, when there is one: the frame's npm scripts (`tableau`, `grillhouse:maj`), and
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
//   dependency-cruiser, jsonc-parser, knip, Turborepo) are added to the project's
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
//   which a package of the frame holds a `test:vitest` script, the update adds `scripts/vitest-config` to the
//   `workspaces` (or to `workspaces.packages`) when they do not select it yet, and declares the
//   package (`"*"`, the version of the workspace) in the `devDependencies` of each such package,
//   a declaration it holds kept; a package out of the frame is not touched. The directory is added to the workspaces rather than placed
//   under `packages/`: every directory there is a component of the project, which the frame's
//   checks read, and the frame's files keep one address, the same in every project. The report
//   names what it wrote, `npm install`, which links the package, and the import each package's
//   Vitest configuration writes (`import base from '@grillhouse/vitest-config'`): the update writes
//   no Vitest configuration. A project without `workspaces` imports the file by its path
//   (`./scripts/vitest-config/base.mjs`), from the one package that holds it.
// - The update's own script: a project's copy runs the source's scripts/grillhouse-maj.mjs in its
//   place (`--source` the same source), and the frame's modules it calls (crochets.mjs, greffons.mjs,
//   paquets.mjs) are loaded only then, beside the script that does the update: a former
//   version that wrote the new script over itself leaves the former modules beside it, which the
//   new script never reads. So one pass ends with the new script's work. The script and these
//   modules use Node alone: the source is a checkout that installs no dependency.
// - The git hooks: both of the frame (commit-msg « a closed ticket refuses a second commit, a reopened ticket takes its corrections », pre-push night branch
//   guard) are placed by scripts/crochets.mjs, the mechanism scripts/setup.sh also calls, in the
//   hooks folder git reads for the project (`core.hooksPath`, else the default one; the
//   configuration stays). A hook of the project keeps its lines, which still run.
// - The plugins: after the files, the command line installs the plugins the project's settings
//   declare, for the project, by scripts/greffons.mjs (the mechanism scripts/setup.sh also calls;
//   `mettreAJour` itself never calls claude). A plugin that cannot be installed has its line naming
//   the command to type; the update has finished its files, and the exit code is non-zero.
// - The generated files: after the files, each generator of the frame is run in the project for the
//   file it writes when the project holds that file (`node scripts/frontieres.mjs --ecrire` for
//   `.dependency-cruiser.cjs`, `node scripts/index-interfaces.mjs` for
//   `docs/agents/index-des-interfaces.md`), and `node scripts/turbo-des-paquets.mjs --ecrire`
//   always (the `turbo.json` of each package of a repository with `workspaces`, whose build waits
//   for its runtime dependencies only, and of which a package out of the frame plays no task; the
//   `dependsOn` of the guard tasks of the root's turbo.json, which wait for the builds; it reads
//   with jsonc-parser, which `npm install` brings), so that the frame's checks accept them; a generator
//   that fails has its line, which says to run it after `npm install` (the frame's tools), and the
//   exit code is non-zero. `interfaces-contre-code.mjs` is not
//   run: it writes after a build.
// - An option other than `--source <path>` and `--ecarts` is refused: the usage is shown (the
//   exit code is non-zero) and nothing is updated, `--help` included.
// - `.claude/grillhouse/empreintes.json` records the source's commit, each file's SHA-256 and the
//   hooks, plugins and marketplaces installed. `--ecarts` compares the files with it: a frame file modified or missing in a
//   project is drift, which goes back to Grillhouse as a proposal.
// - The version of the frame: one for the frame and its mod, in `.claude/grillhouse/VERSION` of
//   the source, a frame file the project receives (its directory is in the list), so each project
//   knows the version it has. The report names it with the source's commit (« Cadre 0.16.0
//   (commit abc1234) : … »); a source without one is named « sans version ».
// - The source: --source, else GRILLHOUSE_SOURCE, else Grillhouse's repository on GitHub, kept in
//   ~/.cache/grillhouse/roomis-grillhouse and moved to the last commit of its default branch
//   (`git pull --ff-only`, after a first shallow clone): the update installs that commit, whatever
//   its version, never a tag chosen.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEPOT = 'https://github.com/roomi-fields/roomis-grillhouse.git';
const LISTE = '.claude/grillhouse/fichiers.txt';
const EMPREINTES = '.claude/grillhouse/empreintes.json';
const VERSION = '.claude/grillhouse/VERSION';
const SCRIPTS = {
  tableau: 'node scripts/tableau.mjs --texte',
  'grillhouse:maj': 'node scripts/grillhouse-maj.mjs',
};

// The frame's tools: their names are the frame's, their versions are read in the source.
const OUTILS_DU_CADRE = [
  '@microsoft/api-extractor',
  '@microsoft/api-extractor-model',
  '@microsoft/tsdoc-config',
  'dependency-cruiser',
  'jsonc-parser',
  'knip',
  'turbo',
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
const CONFIG_VITEST = 'scripts/vitest-config';

const empreinte = f => createHash('sha256').update(readFileSync(f)).digest('hex');
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

// The list's paths to install and to remove.
export function lireListe(texte) {
  const garder = [];
  const retirer = [];
  for (const l of texte.split('\n').map(x => x.trim())) {
    if (!l || l.startsWith('#')) {
      continue;
    }
    if (l.startsWith('- ')) {
      retirer.push(l.slice(2).trim());
    } else {
      garder.push(l);
    }
  }
  return { garder, retirer };
}

// Every file the list covers in the source, as paths relative to it.
export function fichiersDuCadre(source, garder) {
  const out = [];
  const parcourir = rel => {
    const abs = path.join(source, rel);
    if (!existsSync(abs)) {
      return;
    }
    if (statSync(abs).isDirectory()) {
      for (const n of readdirSync(abs).sort()) {
        parcourir(path.join(rel, n));
      }
    } else {
      out.push(rel);
    }
  };
  for (const g of garder) {
    parcourir(g.replace(/\/$/, ''));
  }
  return [...new Set(out)].filter(f => f !== EMPREINTES);
}

// The hooks of a settings file, as « event matcher command » keys.
const crochets = s =>
  Object.entries(s.hooks ?? {}).flatMap(([ev, groupes]) =>
    groupes.flatMap(g =>
      (g.hooks ?? []).map(h => ({ ev, matcher: g.matcher ?? '', command: h.command }))
    )
  );
const cle = h => `${h.ev}\u0000${h.matcher}\u0000${h.command}`;

// The project's settings with the frame's added (hooks, plugins, marketplaces, the status line),
// and what the previous version installed (`avant`) and this one dropped removed.
export function fusionnerReglages(projet, cadre, avant = {}) {
  const s = structuredClone(projet);
  const neufs = new Set(crochets(cadre).map(cle));
  const retires = new Set((avant.crochets ?? []).filter(k => !neufs.has(k)));
  s.hooks ??= {};
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = s.hooks[ev]
      .map(g => ({
        ...g,
        hooks: (g.hooks ?? []).filter(
          h => !retires.has(cle({ ev, matcher: g.matcher ?? '', command: h.command }))
        ),
      }))
      .filter(g => g.hooks.length > 0);
    if (s.hooks[ev].length === 0) {
      delete s.hooks[ev];
    }
  }
  const presents = new Set(crochets(s).map(cle));
  for (const h of crochets(cadre)) {
    if (presents.has(cle(h))) {
      continue;
    }
    const groupes = (s.hooks[h.ev] ??= []);
    let g = groupes.find(x => (x.matcher ?? '') === h.matcher);
    if (!g) {
      g = h.matcher ? { matcher: h.matcher, hooks: [] } : { hooks: [] };
      groupes.push(g);
    }
    g.hooks.push({ type: 'command', command: h.command });
  }
  const plugins = Object.keys(cadre.enabledPlugins ?? {});
  const marches = Object.keys(cadre.extraKnownMarketplaces ?? {});
  const sans = (objet, garder, anciens = []) =>
    Object.fromEntries(
      Object.entries(objet ?? {}).filter(([k]) => garder.includes(k) || !anciens.includes(k))
    );
  s.enabledPlugins = {
    ...sans(s.enabledPlugins, plugins, avant.plugins),
    ...(cadre.enabledPlugins ?? {}),
  };
  s.extraKnownMarketplaces = {
    ...sans(s.extraKnownMarketplaces, marches, avant.marches),
    ...(cadre.extraKnownMarketplaces ?? {}),
  };
  // The status line is the frame's: set from it, removed when the frame no longer sets it.
  if (cadre.statusLine) {
    s.statusLine = cadre.statusLine;
  } else if (avant.ligneEtat) {
    delete s.statusLine;
  }
  const ligneEtat = Boolean(cadre.statusLine);
  return { reglages: s, installes: { crochets: [...neufs], plugins, marches, ligneEtat } };
}

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
export function mettreAJour(projet, source, version) {
  const { garder, retirer } = lireListe(readFileSync(path.join(source, LISTE), 'utf8'));
  const avant = lireJson(path.join(projet, EMPREINTES), { fichiers: {}, crochets: [] });
  const fichiers = fichiersDuCadre(source, garder);
  const bilan = {
    copies: [],
    retires: [],
    dependances: [],
    test: null,
    vitest: null,
    turbo: null,
    configVitest: null,
    gardes: null,
  };
  const empreintes = {};
  for (const f of fichiers) {
    const dst = path.join(projet, f);
    const e = empreinte(path.join(source, f));
    if (!existsSync(dst) || empreinte(dst) !== e) {
      mkdirSync(path.dirname(dst), { recursive: true });
      copyFileSync(path.join(source, f), dst);
      bilan.copies.push(f);
    }
    empreintes[f] = e;
  }
  const garde = new Set(fichiers);
  for (const f of [...Object.keys(avant.fichiers).filter(x => !garde.has(x)), ...retirer]) {
    const p = path.join(projet, f);
    if (existsSync(p)) {
      rmSync(p, { recursive: true, force: true });
      bilan.retires.push(f);
    }
  }
  const fichierReglages = path.join(projet, '.claude/settings.json');
  const cadre = lireJson(path.join(source, '.claude/settings.json'), {});
  const presents = existsSync(fichierReglages) ? lireJson(fichierReglages, null) : null;
  const { reglages, installes } = fusionnerReglages(presents ?? {}, cadre, avant);
  if (!isDeepStrictEqual(presents, reglages)) {
    mkdirSync(path.dirname(fichierReglages), { recursive: true });
    writeFileSync(fichierReglages, `${JSON.stringify(reglages, null, 2)}\n`);
  }
  const pkg = path.join(projet, 'package.json');
  if (existsSync(pkg)) {
    const p = lireJson(pkg, {});
    const pkgSource = lireJson(path.join(source, 'package.json'), {});
    const gardes = pkgSource.scripts?.['grillhouse:gardes'];
    p.scripts = { ...(p.scripts ?? {}), ...SCRIPTS };
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
  mkdirSync(path.dirname(path.join(projet, EMPREINTES)), { recursive: true });
  writeFileSync(
    path.join(projet, EMPREINTES),
    `${JSON.stringify({ version, fichiers: empreintes, ...installes }, null, 2)}\n`
  );
  return bilan;
}

// The project's drift from the version it installed: frame files modified or missing.
export function ecarts(projet) {
  const e = lireJson(path.join(projet, EMPREINTES), null);
  if (!e) {
    return null;
  }
  const modifies = [];
  const absents = [];
  for (const [f, h] of Object.entries(e.fichiers)) {
    const p = path.join(projet, f);
    if (!existsSync(p)) {
      absents.push(f);
    } else if (empreinte(p) !== h) {
      modifies.push(f);
    }
  }
  return { version: e.version, modifies, absents };
}

// The frame's generators and the file each writes: run in the project after the copy. A
// generator without `sortie` (the `turbo.json` of each package, none without `workspaces`) runs
// in every project that holds its script.
const GENERATEURS = [
  { script: 'scripts/frontieres.mjs', args: ['--ecrire'], sortie: '.dependency-cruiser.cjs' },
  {
    script: 'scripts/index-interfaces.mjs',
    args: [],
    sortie: 'docs/agents/index-des-interfaces.md',
  },
  { script: 'scripts/turbo-des-paquets.mjs', args: ['--ecrire'], sortie: null },
];

// Runs each generator whose script and output the project holds; returns the lines of failure.
export function regenerer(projet) {
  const lignes = [];
  for (const g of GENERATEURS) {
    if (
      !existsSync(path.join(projet, g.script)) ||
      (g.sortie !== null && !existsSync(path.join(projet, g.sortie)))
    ) {
      continue;
    }
    const r = spawnSync(process.execPath, [g.script, ...g.args], { cwd: projet, encoding: 'utf8' });
    if (r.status !== 0) {
      lignes.push(
        `${g.sortie ?? g.script} : \`node ${[g.script, ...g.args].join(' ')}\` échoue ; lance-le après \`npm install\`, qui installe les outils du cadre. ${(r.stderr ?? '').trim()}`.trim()
      );
    }
  }
  return lignes;
}

const USAGE =
  'Usage : node scripts/grillhouse-maj.mjs [--source <dossier Grillhouse>]   met le cadre à jour\n' +
  "        node scripts/grillhouse-maj.mjs --ecarts                         dit l'écart du cadre\n";

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

// The version of the frame at <racine>: its `.claude/grillhouse/VERSION`, one line, which the
// project receives with the frame's files; « sans version » for a source that holds none.
function versionDuCadre(racine) {
  const f = path.join(racine, VERSION);
  return existsSync(f) ? readFileSync(f, 'utf8').trim() : 'sans version';
}

const ENTREE = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
const projetCourant = process.cwd();
let src = null;
let version = 'inconnue';
// The exit code of a command that ends before the update: a usage refused, the gaps, the update
// handed over to the source's script. Null while the update is still to do.
let fin = null;
if (ENTREE) {
  const args = process.argv.slice(2);
  const valide = args.every(
    (a, k) => a === '--ecarts' || a === '--source' || args[k - 1] === '--source'
  );
  if (!valide || args.at(-1) === '--source') {
    process.stderr.write(USAGE);
    fin = 2;
  } else if (process.argv.includes('--ecarts')) {
    const e = ecarts(projetCourant);
    if (e && (e.modifies.length || e.absents.length)) {
      const n = [
        e.modifies.length && `${e.modifies.length} modifié(s)`,
        e.absents.length && `${e.absents.length} absent(s)`,
      ]
        .filter(Boolean)
        .join(', ');
      process.stdout.write(
        `Le cadre diffère de sa version ${e.version.slice(0, 7)} : ${n} (${[...e.modifies, ...e.absents].slice(0, 5).join(', ')}). Un écart se propose à Grillhouse ; \`npm run grillhouse:maj\` remet le cadre.\n`
      );
    }
    fin = 0;
  } else {
    const i = process.argv.indexOf('--source');
    src = source(i > 0 ? process.argv[i + 1] : undefined);
    try {
      version = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
      version = 'inconnue';
    }
    const neuf = path.join(src, 'scripts/grillhouse-maj.mjs');
    if (existsSync(neuf) && realpathSync(neuf) !== realpathSync(fileURLToPath(import.meta.url))) {
      // The source's script does the update, the source's modules beside it.
      const r = spawnSync(process.execPath, [neuf, '--source', src], { stdio: 'inherit' });
      fin = r.status ?? 1;
    }
  }
}
if (fin !== null) process.exitCode = fin;

// The frame's modules the update calls, loaded once the script running is the one that does the
// update: a project's copy of this script, which a former version may have written over itself,
// hands over to the source's before reading the former modules beside it, and never reads them.
let poserCrochets, installerGreffons, paquets;
if (fin === null) {
  ({ poserCrochets } = await import('./crochets.mjs'));
  ({ installerGreffons } = await import('./greffons.mjs'));
  ({ paquets } = await import('./paquets.mjs'));
}

if (ENTREE && fin === null) {
  const projet = projetCourant;
  const b = mettreAJour(projet, src, version);
  process.stdout.write(
    `Cadre ${versionDuCadre(src)} (commit ${version.slice(0, 7)}) : ${b.copies.length} fichier(s) copié(s), ${b.retires.length} retiré(s).\n`
  );
  for (const f of b.copies) {
    process.stdout.write(`  + ${f}\n`);
  }
  for (const f of b.retires) {
    process.stdout.write(`  - ${f}\n`);
  }
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
