#!/usr/bin/env node
// The frame's update: brings what the frame writes in a project to the version of the package
// installed, as `npx @turbo/codemod migrate` brings a repository to the version of Turborepo.
//   npx grillhouse maj    update (npm run grillhouse:maj), after `npm install` of the version wanted
// The mechanism is installation.md §5.2 (the migrations, §5.4), under
// packages/grillhouse/docs/architecture/. The update reads the package's own scripts and template
// (scripts/cadre.mjs, `miseAJour.gabarit` of each declared language), never the network. Any
// argument is refused, `--help` included: the usage is shown, the exit code is non-zero, nothing
// is updated. The frame copies no other file into a project.
//
// In order:
// - The languages (`declarerLesLangages`): the column « Langage » of docs/ARCHITECTURE.md
//   (scripts/langages.mjs); migration 0.27.0 writes a former declaration there, before every
//   other. No package.json, no language declared, or a declaration the migration leaves to the
//   project: refused on the error stream, exit code 1. A project of several languages receives
//   the share of each, in the order of the declaration (`langagesDe`).
// - The migrations (scripts/migrations.mjs): each one newer than `grillhouse.version` (none
//   recorded, all), in the order of their versions; the report names each that changed something.
//   An `aFaire` goes on the error stream with its command, exit code non-zero, the version stays
//   so that the next update plays it again; the `restes` are reported last, « reste au projet »,
//   with no effect on the exit code nor on the version.
// - The workflows (scripts/workflows-du-cadre.mjs): `ci.yml` and `nuit.yml` carrying the frame's
//   mark on their first line are rewritten when they differ; a missing one is written once the
//   project holds one; a workflow without the mark is the project's.
// - `.claude/settings.json`, when it exists: the marketplace `roomi-fields`
//   (`roomi-fields/claude-plugins`) and `grillhouse@roomi-fields` enabled, each added after the
//   keys held; `statusLine` becomes `LIGNE_ETAT` (`refreshInterval` 10) when absent or naming
//   `ligne-etat`, a status line of the project's own stays.
// - `package.json`: the scripts `tableau`, `grillhouse:maj`, `grillhouse:gardes`,
//   `grillhouse:dette:inscrire`, `grillhouse:dette:elaguer` and `api`, each read in the template's
//   (none written when it has none), and `prepare` beginning with `grillhouse hooks` (the project's
//   own `prepare` follows, `&&`). The former wiring goes: a `pretest` that is `npm run --silent
//   grillhouse:gardes`, alone or at the head of a longer one; an `integration:gardes` loses each
//   head that is a former frame command, the rest moving to `gardes` when the project has none.
//   The language's share (`miseAJour.appliquer`; typescript, cargo: scripts/langages/*/mise-a-jour.mjs)
//   comes first; its `aFaire` goes on the error stream, exit code 1, the verification not played.
// - The tools of the declared language (`outils`), and none other, added to `devDependencies` at
//   the template's version unless the project declares them in one of the three dependency fields,
//   `devDependencies` sorted by name; `packageManager` from the template when the project has none.
// - The `.gitignore`: `<nom>/` for each of IGNORES_DU_CADRE and each `ignorer` of the languages
//   not yet ignored. The `.gitattributes` line `CHANGELOG.md merge=grillhouse-changelog` (scripts/fusion-du-changelog.mjs)
//   and the git hooks (scripts/crochets.mjs: `commit-msg`, `pre-push`, in `core.hooksPath` or the
//   default folder; the project's own lines stay, the frame's former ones give way).
// - The generators of the declared language (`miseAJour.generateurs`) and the generator of the
//   graph, which every project has (`generateursDe`, scripts/langages.mjs), run by the project's
//   `node_modules/.bin/grillhouse` for each file the project holds (all, in a project `init`
//   creates); a failing one, or a missing command, has its line saying to run it after `npm install`.
// - The binaries of the language (`binaires`; cargo: nextest, cargo-deny): installed when missing
//   or at another version by `miseAJour.installation`; one that fails has its line, exit code non-zero.
//   `npx grillhouse binaires` plays the same alone (scripts/binaires.mjs).
// - The plugins (scripts/greffons.mjs): installed for the project, the frame's mod brought to the
//   package's version; a failure has its line naming the command, exit code non-zero.
// - The group: `grillhouse.groupe` of the main tree (`groupeDe`) sets each other project as a Beads
//   `external_projects.<name>`, the ones set left alone; a group badly declared is refused first.
//
// The report names first the frame's version and, in `LIGNE_DU_CADRE`, the command that installs
// another one (npm never brings the next minor of a 0.x). Last, `npm run verifier` is played from
// the root, unless files are left to finish, there is no `verifier` script, or `npm install` is
// asked first; its green keeps the last green (scripts/dernier-vert.mjs). The last line says the
// outcome: green; red, its code; 75, « à repasser ».
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CADRE, VERSION } from './cadre.mjs';
import { installerBinaires } from './binaires.mjs';
import { poserCrochets } from './crochets.mjs';
import { SORTE_DE_LA_MONTEE } from './places-de-la-machine.mjs';
import { ATTRIBUT } from './fusion-du-changelog.mjs';
import { fluxSansEntree } from './flux-des-paquets.mjs';
import { installerGreffons } from './greffons.mjs';
import { groupeDe, projetsExternes } from './groupe-cles.mjs';
import { migrer, restesAuProjet } from './migrations.mjs';
import { arbrePrincipal } from './outils-cles.mjs';
import { generateursDe, langageDe, langagesDe } from './langages.mjs';
import * as langagesDansLArchitecture from './migrations/0.27.0-langages-dans-l-architecture.mjs';
import { CONFIG_BEADS, ecrireLePrefixe, prefixe, prefixeDuStore } from './prefixe-des-tickets.mjs';
import { paquets } from './paquets.mjs';
import {
  NOM_MACHINE_VIERGE,
  poserLesWorkflows,
  poseraLaMachineVierge,
  WORKFLOWS,
} from './workflows-du-cadre.mjs';

const SCRIPTS = {
  tableau: 'grillhouse tableau --texte',
  'grillhouse:maj': 'grillhouse maj',
};
// The command of the project's `prepare` that places the frame's git hooks (Husky's model).
const PREPARE = 'grillhouse hooks';

/** The frame's status line, as the settings of a project run it. */
export const LIGNE_ETAT = '"$CLAUDE_PROJECT_DIR/node_modules/.bin/grillhouse" ligne-etat';
// Seconds between two redraws of the status line: at rest a session sends no event (`refreshInterval`
// of Claude Code's `statusLine`).
const REDESSIN_LIGNE_ETAT = 10;

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

/**
 * The directories the frame itself writes in a project, which its `.gitignore` ignores: the copies
 * of the tickets, and the runs and cache of Turborepo (`.turbo`), the tool every language of the
 * frame plays its tasks by, written whatever the project's language. The template's
 * `.gitignore` lists none of them, nor what the tools of its language write: the update lays both,
 * in a new project as in an existing one.
 */
export const IGNORES_DU_CADRE = ['.claude/worktrees', '.turbo'];

// Adds to the `.gitignore` of the project at <projet> each directory the frame writes
// (IGNORES_DU_CADRE) and each its language's tools write (`ignorer` of its module), as `<nom>/`,
// when no line ignores it (`<nom>`, `<nom>/`, `/<nom>`, `/<nom>/`); its own lines stay.
function ignorer(projet) {
  const f = path.join(projet, '.gitignore');
  let texte = existsSync(f) ? readFileSync(f, 'utf8') : '';
  const avant = texte;
  for (const nom of [...IGNORES_DU_CADRE, ...langageDe(projet).ignorer]) {
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
  const voulue = { type: 'command', command: LIGNE_ETAT, refreshInterval: REDESSIN_LIGNE_ETAT };
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
 * Declares the languages of the project at <projet> in its architecture: plays the migration of
 * 0.27.0, which writes there the declaration of a former version of the frame, then reads them
 * (`langagesDe`). Returns what the migration did, `{ version, nom, lignes, aFaire }`, null when it
 * did nothing. Throws, named, when the project has no package.json, when the migration leaves its
 * declaration to it, or when it declares no language: the update guesses none.
 */
export function declarerLesLangages(projet) {
  if (!existsSync(path.join(projet, 'package.json'))) {
    throw new Error(`${projet} n'a pas de package.json ; la mise à jour du cadre s'y joue.`);
  }
  const tout = langagesDansLArchitecture.migrer(projet);
  const aFaire = tout.filter(l => typeof l !== 'string').map(l => l.aFaire);
  if (aFaire.length) {
    throw new Error(aFaire.join(' ; '));
  }
  langagesDe(projet);
  const lignes = tout.filter(l => typeof l === 'string');
  return lignes.length
    ? {
        version: langagesDansLArchitecture.version,
        nom: langagesDansLArchitecture.nom,
        lignes,
        aFaire,
      }
    : null;
}

/** The version of the frame the project at <projet> recorded (`grillhouse.version`), or null. */
export function versionDuProjet(projet) {
  const v = lireJson(path.join(projet, 'package.json'), {})?.grillhouse?.version;
  return typeof v === 'string' ? v : null;
}

// Beads run in <cwd>, as `bd(args, cwd)` gives it: { status, stdout, stderr }.
const jouerBd = (args, cwd) =>
  spawnSync('bd', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

// The `external_projects` of the Beads of <projet>: the other projects of its <groupe>, each by its
// name and its path relative to the main tree of <projet> (`projetsExternes`), which a copy shares
// with it; those it sets, by name (none when already set).
function poserLesProjetsExternes(projet, groupe, bd) {
  if (groupe === null) {
    return [];
  }
  const poses = [];
  for (const [nom, chemin] of Object.entries(projetsExternes(groupe, arbrePrincipal(projet)))) {
    const cle = `external_projects.${nom}`;
    const lu = bd(['config', 'get', cle], projet);
    if (lu.status === 0 && `${lu.stdout ?? ''}`.trim() === chemin) {
      continue;
    }
    const r = bd(['config', 'set', cle, chemin], projet);
    if (r.status !== 0) {
      throw new Error(
        `⛔ bd config set ${cle} a échoué : ${`${r.stderr ?? ''}`.trim() || `code ${r.status}`}`
      );
    }
    poses.push(nom);
  }
  return poses;
}

// Whether the `.beads/config.yaml` of <projet> holds an active key `issue-prefix`.
function cleActive(projet) {
  try {
    prefixe(projet);
    return true;
  } catch {
    return false;
  }
}

/**
 * Brings the project at `projet` to the frame's files at `source` (CADRE, scripts/cadre.mjs; a
 * trial's own in the tests); <inscrite> is the version it records (the package's; null records
 * none, the project keeping its own). Returns what changed.
 */
export function mettreAJour(projet, source, { inscrite = VERSION, bd = jouerBd } = {}) {
  // The group the project declares, read in its main tree (`groupeDe`), refused by its key before
  // any work.
  const groupe = groupeDe(projet);
  const bilan = {
    projetsExternes: [],
    dependances: [],
    gardes: null,
    ligneEtat: false,
    greffon: false,
    workflows: [],
    fluxSansEntree: [],
    fluxDeclares: {},
    duLangage: { lignes: [], aFaire: [], installer: false, sansVerifier: null },
  };
  const pkg = path.join(projet, 'package.json');
  if (existsSync(pkg)) {
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
    // The workflow « machine vierge » that the update poses is declared with every package of the
    // project's graph; an entry already declared stays as it is.
    const fichierVierge = `${WORKFLOWS}/${NOM_MACHINE_VIERGE}`;
    if (
      p.grillhouse?.flux?.[fichierVierge] === undefined &&
      poseraLaMachineVierge(projet, source)
    ) {
      const noms = [...new Set(paquets(projet).map(q => q.pkg.name))].sort();
      p.grillhouse = {
        ...(p.grillhouse ?? {}),
        flux: { ...(p.grillhouse?.flux ?? {}), [fichierVierge]: noms },
      };
    }
    writeFileSync(pkg, `${JSON.stringify(p, null, 2)}\n`);
    // The flows of the CI without entry in `grillhouse.flux` (the guard's read), with the entries
    // already declared, which the command of the report keeps.
    bilan.fluxSansEntree = fluxSansEntree(projet);
    bilan.fluxDeclares = bilan.fluxSansEntree.length > 0 ? (p.grillhouse?.flux ?? {}) : {};
    ignorer(projet);
  }
  bilan.ligneEtat = reglerLigneEtat(projet);
  bilan.greffon = declarerGreffon(projet);
  poserCrochets(projet);
  attribuer(projet);
  bilan.workflows = poserLesWorkflows(projet, source);
  bilan.projetsExternes = poserLesProjetsExternes(projet, groupe, bd);
  // The key `issue-prefix`, when no active one exists: the store's value, never a guess.
  if (existsSync(path.join(projet, CONFIG_BEADS)) && !cleActive(projet)) {
    const valeur = prefixeDuStore(projet, bd);
    bilan.prefixe = valeur === '' ? { manque: true } : { pose: ecrireLePrefixe(projet, valeur) };
  }
  return bilan;
}

/**
 * Runs each generator of the languages of the project (`miseAJour.generateurs` of each module,
 * and the generator of the graph, `generateursDe`, each once) whose output the project holds (every one with `tous`, for a project `grillhouse init` creates;
 * every one of the module <langage>, for the first package of a language `grillhouse paquet` creates);
 * returns the lines of failure.
 */
export function regenerer(projet, { tous = false, langage = null } = {}) {
  const lignes = [];
  const grillhouse = path.join(projet, 'node_modules', '.bin', 'grillhouse');
  const aPaquets = lireJson(path.join(projet, 'package.json'), {})?.workspaces !== undefined;
  const vus = new Set();
  for (const { g, m } of generateursDe(langagesDe(projet))) {
    const cle = JSON.stringify([g.commande, ...g.args]);
    const absente =
      g.sortie !== null && !tous && m.nom !== langage && !existsSync(path.join(projet, g.sortie));
    if (vus.has(cle) || (g.sortie === null ? !aPaquets : absente)) {
      continue;
    }
    vus.add(cle);
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
  if (b.projetsExternes?.length > 0) {
    lignes.push(
      `Projets externes de Beads : ${b.projetsExternes.join(', ')} posé(s) depuis grillhouse.groupe.`
    );
  }
  if (b.prefixe?.pose) {
    lignes.push(
      `Préfixe des tickets : ${CONFIG_BEADS} pose \`${b.prefixe.pose}\`, la valeur du store de Beads.`
    );
  }
  if (b.workflows?.length > 0) {
    lignes.push(
      `Workflows du cadre : ${b.workflows.join(', ')} écrit(s) depuis le gabarit ; leur machine est la variable RUNNER du dépôt sur GitHub (ubuntu-latest sans elle), que la mise à jour ne touche pas.`
    );
  }
  if (b.fluxSansEntree?.length > 0) {
    // The whole object: the declared entries as they are, each missing flow with a name the graph
    // does not know, so the guard stays red until the project names the package the flow exercises.
    const objet = { ...b.fluxDeclares };
    for (const f of b.fluxSansEntree) {
      objet[f] = ['<paquet>'];
    }
    const json = JSON.stringify(objet).replaceAll("'", "'\\''");
    lignes.push(
      `Flux de la CI sans entrée dans grillhouse.flux : ${b.fluxSansEntree.join(', ')}. Déclare les paquets que chacun exerce : \`npm pkg set --json grillhouse.flux='${json}'\`, puis remplace chaque <paquet> par le nom du paquet que le flux exerce (la garde flux-des-paquets reste rouge d'ici là).`
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
export const aInstaller = b => b.dependances.length > 0 || b.duLangage.installer;

// The project's verification, the last step of the update (see the header): `{ code, ligne,
// erreur }`, the code of `npm run verifier` (null when it is not played), the line of the report,
// and whether it goes on the error stream. <sansVerifier>: the language's line on a project
// without script `verifier`.
export function verifier(projet, { fichiersAFinir, installer, sansVerifier }) {
  const VERT_INTACT = 'le dernier vert reste où il était';
  // The verification left to the supervisor, under the closed machine too.
  const POSTE_FERME = ` Machine fermée : \`GRILLHOUSE_VERIFICATION_SORTE=${SORTE_DE_LA_MONTEE} npm run verifier\`.`;
  if (fichiersAFinir) {
    return {
      code: null,
      erreur: true,
      ligne: `Vérification non jouée : la mise à jour laisse à faire ci-dessus ; ${VERT_INTACT}. Fais-le, puis \`npm run verifier\`.${POSTE_FERME}`,
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
      ligne: `Vérification non jouée : \`npm install\` d’abord, qui installe ce que la mise à jour déclare, puis \`npm run verifier\` ; ${VERT_INTACT}.${POSTE_FERME}`,
    };
  }
  // The update is a gesture of the maintenance window of the machine closed by the supervisor
  // (`grillhouse machine fermer`): its pass is of the sort « Montée », which the closure does not refuse.
  const r = spawnSync('npm', ['run', 'verifier'], {
    cwd: projet,
    stdio: 'inherit',
    env: { ...process.env, GRILLHOUSE_VERIFICATION_SORTE: SORTE_DE_LA_MONTEE },
  });
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
      ligne: `Vérification : \`npm run verifier\` à repasser (code 75) ; ni vert ni rouge, ${VERT_INTACT}. Relance \`npm run verifier\` plus tard.${POSTE_FERME}`,
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
    // The languages first: the migrations of the declared languages play with the core's.
    let premiere;
    try {
      premiere = declarerLesLangages(projet);
    } catch (e) {
      process.stderr.write(`⛔ ${e.message.replace(/^⛔ /, '')}\n`);
      process.exitCode = 1;
    }
    if (premiere !== undefined) {
      mettreAJourLeProjet(projet, premiere);
    }
  }
}

// The update of the project at <projet>, its languages declared (declarerLesLangages), <premiere>
// what the migration of its languages did, null for nothing.
function mettreAJourLeProjet(projet, premiere) {
  const depuis = versionDuProjet(projet);
  const migrations = [...(premiere ? [premiere] : []), ...migrer(projet, depuis)];
  const resteAFaire = migrations.some(m => m.aFaire.length > 0);
  const b = mettreAJour(projet, CADRE, resteAFaire ? { inscrite: null } : {});
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
  if (b.prefixe?.manque) {
    process.stderr.write(
      `Préfixe des tickets : le store de Beads n'en donne aucun ; pose \`issue-prefix: "<préfixe des tickets du projet>"\` dans ${CONFIG_BEADS}, le préfixe étant celui que le projet choisit.\n`
    );
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
