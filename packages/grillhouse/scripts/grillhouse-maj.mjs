#!/usr/bin/env node
// The frame's update: brings what the frame writes in a project to the version of the package
// installed, as `npx @turbo/codemod migrate` brings a repository to the version of Turborepo.
//
//   npx grillhouse maj    update (npm run grillhouse:maj), after `npm install` of the version wanted
//
// - The versions pass by npm: the project installs the version of @roomi-fields/grillhouse it wants
//   (`npm install -D @roomi-fields/grillhouse@<version>`), then the update brings the project to it.
//   What the update reads of the frame is the package's own (scripts/cadre.mjs): the template of a
//   project of the declared language (`miseAJour.gabarit` of its module: `templates/projet/` for
//   typescript, `templates/cargo/` for cargo), whose package.json gives the frame's scripts and
//   the versions of the tools. Any argument is refused: the usage is shown (the exit code is
//   non-zero) and nothing is updated, `--help` included.
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
//   template's `package.json` (a template without one writes none). `npm run verifier` plays
//   `grillhouse:gardes` and the project's own guards, the root script `gardes`, beside the tests:
//   the frame's former wiring goes, a `pretest` that is the
//   frame's call (`npm run --silent grillhouse:gardes`) removed or taken off the head of a longer
//   one (`… && <its pretest>`, the rest kept; a `pretest` of the project's own stays). An
//   `integration:gardes`, the script the former integration played, loses each head that is a
//   former frame command (that call, `npm run --silent pretest`,
//   `node scripts/integration/gardes.mjs`); what remains is the project's own guards, which move to
//   `gardes` when the project has none (the report says so), else stay where nothing plays them
//   (the report names both); nothing remaining, the script goes.
// - The share of the declared language (`miseAJour.appliquer` of its module, as each plugin of Nx
//   brings its `init` generator): what its tools ask of the project, in its package.json and its
//   other files, and the lines of the report; the core writes the package.json after. Typescript
//   (scripts/langages/typescript/mise-a-jour.mjs): the frame's test scripts in a project that runs
//   its tests, the frame's package declared where the code or the tests read it, the typing of
//   each package, the project's first configuration of its task runner. Cargo
//   (scripts/langages/cargo/mise-a-jour.mjs): the files of its template a project lacks, and its
//   test scripts. What the share leaves to the project (`aFaire`: for cargo, a Cargo.lock that git
//   does not track) is written on the error stream, the exit code 1, and the verification is not
//   played.
// - A project of several languages (scripts/langages.mjs, `langagesDe`) receives the share of each,
//   in the order of the declaration: its template's tools, its share of the update, its binaries,
//   its generators (each once) and what its tools write; the frame's scripts of a template come
//   from the first template that has each.
// - The languages first (`declarerLangages`): a project that declares none (`grillhouse.langages`
//   of its package.json) receives the languages the modules of the frame find in it
//   (`langagesTrouves` of scripts/langages.mjs: typescript, a tsconfig.json at its root or in a
//   package of the frame; cargo, a Cargo.toml at its root; the refusal names
//   each one's sign, `signe` of its module), and the report says
//   so; a declaration it holds stays. A directory
//   without package.json, or a project where no module finds its language, is refused, named on
//   the error stream, the exit code 1, nothing written: the frame invents no declaration, and the
//   migrations of the declared language play with the core's. No import of the project is
//   rewritten.
// - The tools of the declared language (the `outils` of its module: what it runs as commands and
//   what its scripts import), and none other, are added to the project's `devDependencies` at the
//   version the template's `devDependencies` give; a tool the project already declares in
//   `dependencies`, `devDependencies` or `optionalDependencies` keeps its declaration, one a
//   previous version added stays, and `devDependencies` are written sorted by name. The report
//   names each tool added and `npm install`, which installs them. A project without
//   `packageManager` receives the template's.
// - What the tools of the declared language write in a project (`ignorer` of its module:
//   typescript's `.turbo`, cargo's `target`): a `.gitignore` that does not ignore one receives its
//   line, `<nom>/`.
// - The binaries of the declared language (`binaires` of its module: cargo's nextest and
//   cargo-deny), after the files: the command line runs the commands of its module
//   (`miseAJour.installation`), which list what is installed and install each one missing or at
//   another version (cargo's: `cargo install --list`, then `cargo binstall --no-confirm --locked
//   <nom>@<version>`, cargo-binstall installed by cargo first when it lacks), as `npm install`
//   brings what is installed to what is declared; the report
//   names each one installed. One that cannot be installed has its line, the error stream of its
//   command naming the command to type, and the exit code is non-zero. A language without
//   binaries runs nothing.
// - The git hooks: both of the frame (commit-msg « a closed ticket refuses a second commit, a reopened ticket takes its corrections », pre-push night branch
//   guard) are placed by scripts/crochets.mjs, the mechanism `grillhouse hooks` (the project's
//   `prepare`) also runs, in the hooks folder git reads for the project (`core.hooksPath`, else the
//   default one; the configuration stays). A hook of the project keeps its lines, which still run;
//   the frame's lines of a former version give way to the current ones.
// - The merge driver of the CHANGELOG (scripts/fusion-du-changelog.mjs): a `.gitattributes`
//   without the line `CHANGELOG.md merge=grillhouse-changelog` receives it, after its own lines,
//   and the driver's command is written in the repository's configuration with the hooks
//   (scripts/crochets.mjs): two lots that each add an entry under the same heading both enter main.
// - The plugins: after the files, the command line installs the plugins the project's settings
//   declare, for the project, by scripts/greffons.mjs (the mechanism `grillhouse init` also calls;
//   `mettreAJour` itself never calls claude), and brings the frame's mod to the package's version,
//   as `npm install` brings what is installed to what is declared. A plugin that cannot be
//   installed, or a mod left at another version, has its line naming the command to type; the
//   update has finished its files, and the exit code is non-zero.
// - The generated files: after the package.json, each generator of the declared language
//   (`miseAJour.generateurs` of its module) is run in the project by the project's command
//   (`node_modules/.bin/grillhouse`, its installed package) for the file it writes when the project
//   holds that file (every one of them for a project `grillhouse init` creates), and a generator
//   without file in a repository with `workspaces`, so that the frame's checks accept them; a
//   generator that fails, or a project without its command, has its line, which says to run it
//   after `npm install` (the frame's package and tools), and the exit code is non-zero.
// - The report names first the version of the frame, the package's, and the command that installs
//   another before the update (`LIGNE_DU_CADRE`): npm reads a range `^0.25.5` as `>=0.25.5
//   <0.26.0` (node-semver, caret ranges), so `npm install` never brings the next minor of a 0.x
//   (grillhouse-qmk, OSC Bridge at 0.25.5 under ^0.25.5).
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
//   non-zero), when the project has no `verifier` script (the line of the language's share says
//   why), or when the report asks for `npm install` first (a tool or the frame's package newly
//   declared).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CADRE, VERSION } from './cadre.mjs';
import { poserCrochets } from './crochets.mjs';
import { ATTRIBUT } from './fusion-du-changelog.mjs';
import { installerGreffons } from './greffons.mjs';
import { migrer, restesAuProjet } from './migrations.mjs';
import {
  LANGAGES,
  langage,
  langageDe,
  langagesDe,
  langagesDeclares,
  langagesTrouves,
} from './langages.mjs';

const SCRIPTS = {
  tableau: 'grillhouse tableau --texte',
  'grillhouse:maj': 'grillhouse maj',
};
// The command of the project's `prepare` that places the frame's git hooks (Husky's model).
const PREPARE = 'grillhouse hooks';

/** The frame's status line, as the settings of a project run it. */
export const LIGNE_ETAT = '"$CLAUDE_PROJECT_DIR/node_modules/.bin/grillhouse" ligne-etat';

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

const lireJson = (f, defaut) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return defaut;
  }
};

// Adds to the `.gitignore` of the project at <projet> each directory its language's tools write
// (`ignorer` of its module: `<nom>/`), when no line ignores it (`<nom>`, `<nom>/`, `/<nom>`,
// `/<nom>/`); its own lines stay.
function ignorer(projet) {
  const f = path.join(projet, '.gitignore');
  let texte = existsSync(f) ? readFileSync(f, 'utf8') : '';
  const avant = texte;
  for (const nom of langageDe(projet).ignorer) {
    const lignes = texte.split('\n').map(l => l.trim());
    if ([nom, `${nom}/`, `/${nom}`, `/${nom}/`].some(l => lignes.includes(l))) {
      continue;
    }
    const fin = texte === '' || texte.endsWith('\n') ? '' : '\n';
    texte = `${texte}${fin}${nom}/\n`;
  }
  if (texte !== avant) {
    writeFileSync(f, texte);
  }
}

// Adds to the `.gitattributes` of the project at <projet> the line that gives its CHANGELOG to the
// frame's merge driver (ATTRIBUT, scripts/fusion-du-changelog.mjs), when no line is it; its own
// lines stay.
function attribuer(projet) {
  const f = path.join(projet, '.gitattributes');
  const texte = existsSync(f) ? readFileSync(f, 'utf8') : '';
  if (texte.split('\n').some(l => l.trim() === ATTRIBUT)) {
    return;
  }
  const fin = texte === '' || texte.endsWith('\n') ? '' : '\n';
  writeFileSync(f, `${texte}${fin}${ATTRIBUT}\n`);
}

// <deps> written sorted by name, as npm writes them.
const trie = deps =>
  Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b, 'en')));

// Writes the frame's status line in the settings of the project at <projet>, when they exist and
// hold none or the frame's (see the header); their other keys keep their order. Returns whether
// they changed.
function reglerLigneEtat(projet) {
  const f = path.join(projet, '.claude', 'settings.json');
  if (!existsSync(f)) {
    return false;
  }
  const reglages = JSON.parse(readFileSync(f, 'utf8'));
  const actuelle = reglages.statusLine;
  const commande = typeof actuelle?.command === 'string' ? actuelle.command : '';
  if (actuelle !== undefined && !commande.includes('ligne-etat')) {
    return false;
  }
  const voulue = { type: 'command', command: LIGNE_ETAT };
  if (JSON.stringify(actuelle) === JSON.stringify(voulue)) {
    return false;
  }
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
  if (!existsSync(f)) {
    return false;
  }
  const avant = readFileSync(f, 'utf8');
  const reglages = JSON.parse(avant);
  reglages.extraKnownMarketplaces = {
    ...(reglages.extraKnownMarketplaces ?? {}),
    [MARCHE_DU_CADRE]: { source: SOURCE_DU_MARCHE },
  };
  reglages.enabledPlugins = { ...(reglages.enabledPlugins ?? {}), [GREFFON_DU_CADRE]: true };
  if (JSON.stringify(reglages) === JSON.stringify(JSON.parse(avant))) {
    return false;
  }
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
  if (declares.length > 0) {
    return { langages: declares, ecrits: false };
  }
  const trouves = langagesTrouves(projet);
  if (trouves.length === 0) {
    const signes = Object.keys(LANGAGES)
      .map(n => `${n} : ${langage(n).signe}`)
      .join(' ; ');
    throw new Error(
      `aucun langage du cadre trouvé dans ${projet} (${signes}) ; déclare-le dans grillhouse.langages de ${fichier} (les langages du cadre : ${Object.keys(LANGAGES).join(', ')}), puis relance \`npx grillhouse maj\`.`
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
    gardes: null,
    ligneEtat: false,
    greffon: false,
    duLangage: { lignes: [], aFaire: [], installer: false, sansVerifier: null },
  };
  const pkg = path.join(projet, 'package.json');
  if (existsSync(pkg)) {
    bilan.langages = declarerLangages(projet);
    const modules = langagesDe(projet);
    const p = lireJson(pkg, {});
    if (inscrite !== null) {
      p.grillhouse = { ...(p.grillhouse ?? {}), version: inscrite };
    }
    // The template of each declared language, where the frame's scripts and tools are read; the
    // frame's scripts from the first that has each.
    const gabarits = modules.map(m => ({
      module: m,
      pkgSource: lireJson(path.join(source, m.miseAJour.gabarit, 'package.json'), {}),
    }));
    const duGabarit = lire => gabarits.map(g => lire(g.pkgSource)).find(v => v !== undefined);
    const gardes = duGabarit(g => g.scripts?.['grillhouse:gardes']);
    p.scripts = { ...(p.scripts ?? {}), ...SCRIPTS };
    // The project's `prepare`, which npm runs at its install, places the frame's git hooks first.
    const prepare = typeof p.scripts.prepare === 'string' ? p.scripts.prepare.trim() : '';
    if (!prepare.split(/\s*&&\s*/).includes(PREPARE)) {
      p.scripts.prepare = prepare === '' ? PREPARE : `${PREPARE} && ${prepare}`;
    }
    const api = duGabarit(g => (typeof g.scripts?.api === 'string' ? g.scripts.api : undefined));
    if (api !== undefined) {
      p.scripts.api = api;
    }
    // The tools of the declared languages alone (each module's `outils`), at its template's
    // versions.
    for (const { module, pkgSource } of gabarits) {
      for (const nom of module.outils) {
        const version = pkgSource.devDependencies?.[nom];
        if (typeof version === 'string' && !CHAMPS_INSTALLES.some(c => p[c]?.[nom] !== undefined)) {
          p.devDependencies = { ...(p.devDependencies ?? {}), [nom]: version };
          bilan.dependances.push(nom);
        }
      }
    }
    if (p.devDependencies) {
      p.devDependencies = trie(p.devDependencies);
    }
    const gestionnaire = duGabarit(g =>
      typeof g.packageManager === 'string' ? g.packageManager : undefined
    );
    if (gestionnaire !== undefined && typeof p.packageManager !== 'string') {
      p.packageManager = gestionnaire;
    }
    if (typeof gardes === 'string') {
      p.scripts['grillhouse:gardes'] = gardes;
    }
    // The commands of the known debt of the guards (scripts/dette.mjs) are the frame's.
    for (const nom of ['grillhouse:dette:inscrire', 'grillhouse:dette:elaguer']) {
      const script = duGabarit(g => g.scripts?.[nom]);
      if (typeof script === 'string') {
        p.scripts[nom] = script;
      }
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
    // The share of each declared language (its module's `miseAJour`), in <p> and in its files, in
    // the order of the declaration: the lines joined, `installer` when one asks it, the first line
    // that says why the project has no script `verifier`.
    for (const { module, pkgSource } of gabarits) {
      const part = module.miseAJour.appliquer(projet, {
        p,
        modele: pkgSource,
        source,
        version: VERSION,
      });
      Object.assign(bilan, part.bilan);
      bilan.duLangage = {
        lignes: [...bilan.duLangage.lignes, ...part.lignes],
        aFaire: [...bilan.duLangage.aFaire, ...part.aFaire],
        installer: bilan.duLangage.installer || part.installer,
        sansVerifier: bilan.duLangage.sansVerifier ?? part.sansVerifier,
      };
    }
    writeFileSync(pkg, `${JSON.stringify(p, null, 2)}\n`);
    ignorer(projet);
  }
  bilan.ligneEtat = reglerLigneEtat(projet);
  bilan.greffon = declarerGreffon(projet);
  poserCrochets(projet);
  attribuer(projet);
  return bilan;
}

/**
 * Installs on the machine each binary of the languages of the project at <projet> (`binaires` of
 * its module) that its installation does not list at its version, by the commands its module
 * describes (`miseAJour.installation`: `liste`, then `installer` for each one missing), each run by
 * Node, as `npm install` brings what is installed to what is declared; a language without
 * binaries runs nothing. Returns `{ installes, lignes }`: each binary installed
 * (`<nom>@<version>`), and the line of each failure, the error stream of its command, which names
 * the command to type.
 */
export function installerBinaires(projet) {
  const installes = [];
  const lignes = [];
  for (const m of langagesDe(projet)) {
    const r = installerLesBinairesDe(projet, m);
    installes.push(...r.installes);
    lignes.push(...r.lignes);
  }
  return { installes, lignes };
}

// The binaries of the module <langage> installed in the project at <projet> (`installerBinaires`).
function installerLesBinairesDe(projet, langage) {
  const voulus = Object.entries(langage.binaires);
  const installation = langage.miseAJour.installation;
  if (voulus.length === 0 || installation === null) {
    return { installes: [], lignes: [] };
  }
  const lancer = c =>
    spawnSync(process.execPath, [c.script, ...c.args], { cwd: projet, encoding: 'utf8' });
  const cause = r => (r.error ? r.error.message : (r.stderr ?? '').trim() || `code ${r.status}`);
  const liste = lancer(installation.liste);
  let presents;
  try {
    if (liste.error || liste.status !== 0) {
      throw new Error(cause(liste));
    }
    presents = JSON.parse(liste.stdout);
  } catch (e) {
    return {
      installes: [],
      lignes: [`Binaires : la liste des binaires installés échoue. ${e.message}`],
    };
  }
  const installes = [];
  const lignes = [];
  for (const [nom, version] of voulus) {
    if (presents[nom] === version) {
      continue;
    }
    const r = lancer(installation.installer(nom, version));
    if (!r.error && r.status === 0) {
      installes.push(`${nom}@${version}`);
    } else {
      lignes.push(`Binaire ${nom}@${version} : ${cause(r)}`);
    }
  }
  return { installes, lignes };
}

/**
 * Runs each generator of the languages of the project (`miseAJour.generateurs` of each module,
 * each once) whose output the project holds (every one with `tous`, for a project `grillhouse init` creates);
 * returns the lines of failure.
 */
export function regenerer(projet, { tous = false } = {}) {
  const lignes = [];
  const grillhouse = path.join(projet, 'node_modules', '.bin', 'grillhouse');
  const aPaquets = lireJson(path.join(projet, 'package.json'), {})?.workspaces !== undefined;
  const vus = new Set();
  for (const g of langagesDe(projet).flatMap(m => m.miseAJour.generateurs)) {
    const cle = JSON.stringify([g.commande, ...g.args]);
    if (vus.has(cle)) {
      continue;
    }
    vus.add(cle);
    const absente = g.sortie !== null && !tous && !existsSync(path.join(projet, g.sortie));
    if (g.sortie === null ? !aPaquets : absente) {
      continue;
    }
    if (g.sortie !== null) {
      mkdirSync(path.dirname(path.join(projet, g.sortie)), { recursive: true });
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

/** The report of an update, from the bilan <b> of `mettreAJour`: one line per change. */
export function rapport(b) {
  const lignes = [];
  if (b.langages?.ecrits) {
    lignes.push(
      `Langages : grillhouse.langages déclare ${b.langages.langages.join(', ')}, trouvé dans le dépôt ; le cadre sert le projet par ${b.langages.langages.length > 1 ? 'ces langages' : 'ce langage'}.`
    );
  }
  if (b.dependances.length > 0) {
    lignes.push(
      `Dépendances de développement ajoutées : ${b.dependances.join(', ')}. \`npm install\` les installe.`
    );
  }
  lignes.push(...(b.duLangage?.lignes ?? []));
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
      `Gardes du projet : le script integration:gardes devient gardes, que \`npm run verifier\` joue à côté des tests.`
    );
  } else if (b.gardes) {
    lignes.push(
      `Gardes du projet : integration:gardes et gardes coexistent ; rien ne joue plus integration:gardes, \`npm run verifier\` joue gardes. Verse l'un dans l'autre.`
    );
  }
  return lignes.map(l => `${l}\n`).join('');
}

// Whether the bilan <b> of `mettreAJour` asks for `npm install` (a tool or what the language's
// share declares), which the verification needs first.
const aInstaller = b => b.dependances.length > 0 || b.duLangage.installer;

// The project's verification, the last step of the update (see the header): `{ code, ligne,
// erreur }`, the code of `npm run verifier` (null when it is not played), the line of the report,
// and whether it goes on the error stream. <sansVerifier>: the language's line on a project
// without script `verifier`.
function verifier(projet, { fichiersAFinir, installer, sansVerifier }) {
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
        sansVerifier ?? 'Écris-le pour ses tests.'
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

/** The first line of the report: the version installed, and the command that installs another. */
export const LIGNE_DU_CADRE = `Cadre ${VERSION}, la version installée ; une autre s'installe d'abord par \`npm install -D @roomi-fields/grillhouse@<version>\` (une plage ^0.x n'admet pas la mineure suivante).`;

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
    if (langages !== null) {
      mettreAJourLeProjet(projet, langages);
    }
  }
}

// The update of the project at <projet>, its languages <langages> declared (declarerLangages).
function mettreAJourLeProjet(projet, langages) {
  const depuis = versionDuProjet(projet);
  const migrations = migrer(projet, depuis);
  const resteAFaire = migrations.some(m => m.aFaire.length > 0);
  const b = { ...mettreAJour(projet, CADRE, resteAFaire ? { inscrite: null } : {}), langages };
  process.stdout.write(`${LIGNE_DU_CADRE}\n`);
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
  // What the language leaves to the project comes first, before any of its tools runs.
  const duLangage = b.duLangage.aFaire;
  for (const l of duLangage) {
    process.stderr.write(`${l}\n`);
    process.exitCode = 1;
  }
  const binaires = installerBinaires(projet);
  if (binaires.installes.length > 0) {
    process.stdout.write(`Binaires installés : ${binaires.installes.join(', ')}.\n`);
  }
  const echecsDesGeneres = regenerer(projet);
  for (const l of [...binaires.lignes, ...echecsDesGeneres, ...installerGreffons(projet)]) {
    process.stderr.write(`${l}\n`);
    process.exitCode = 1;
  }
  for (const { version, nom, lignes } of restesAuProjet(projet, depuis)) {
    process.stdout.write(
      `Migration ${version} (${nom}), reste au projet :\n${lignes.map(l => `- ${l}\n`).join('')}`
    );
  }
  const v = verifier(projet, {
    fichiersAFinir: resteAFaire || duLangage.length > 0 || echecsDesGeneres.length > 0,
    installer: aInstaller(b),
    sansVerifier: b.duLangage.sansVerifier,
  });
  (v.erreur ? process.stderr : process.stdout).write(`${v.ligne}\n`);
  if (v.code !== null && !process.exitCode) {
    process.exitCode = v.code;
  }
}
