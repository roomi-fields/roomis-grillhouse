#!/usr/bin/env node
// The frame's plugins, installed for the project by one mechanism: `scripts/preparation.mjs` (the
// preparation of `grillhouse init`) and `scripts/grillhouse-maj.mjs` (update, its command line) both
// call it, and the session start
// asks it which are absent.
//
//   npx grillhouse greffons [<project>]            installs the declared plugins (the current directory by default)
//   npx grillhouse greffons --absents [<project>]  prints what the project lacks, one line each (see below)
//
// - The list is `enabledPlugins` of the project's `.claude/settings.json` (a plugin at `true`; one
//   at `false` or unlisted is left alone) and `extraKnownMarketplaces` for the marketplaces. A
//   missing file declares nothing (code 0); an unreadable one is a failure.
// - Installation: each marketplace of `extraKnownMarketplaces` unknown to `claude plugin
//   marketplace list --json` is added by `claude plugin marketplace add <source>` (the user's scope,
//   the project's settings stay untouched; the source is `repo` for github, `url` for git and url,
//   `path` for directory and file, any other type is a failure); then each declared plugin not
//   installed for the project is installed by `claude plugin install <id> --scope project`, run
//   from the project's root; last, the frame's mod installed for the project at a version behind
//   the package's (see `ecart` below) is updated by `claude plugin update <id> --scope <its
//   scope>`, from the project's root, and read again. `claude` rewrites `.claude/settings.json` in its own key order; once
//   the installs are done, the file holds the keys in the order it had before them (the keys
//   claude added after), and its exact text when the JSON value is the same.
// - A plugin is installed for the project when `claude plugin list --json` has an entry for it of
//   scope user, or of scope project or local whose `projectPath` is the project's root (both paths
//   resolved); the entry's state (enabled, errors) is not read.
// - A failure has its line on the error output, naming the plugin and the command that installs it
//   (a failed add: the marketplace's command, then the plugin's; a mod left at another version than
//   the package's, after its update or ahead of the package: both versions and the command of its
//   `ecart` line); the others are still tried and the code is 1. A state reading that fails installs nothing. Without `claude`, each plugin has its line.
// - `--absents` prints `claude` (the command is missing), `greffon <id>` per declared plugin not
//   installed for the project, or `lecture <reason>` when the state cannot be read; each claude
//   call stops after 5 s. It also prints `ecart <id> <mod's version> <package's version>
//   <command>` when the frame's mod (`grillhouse@…`), installed for the project, carries another
//   version than the package `@roomi-fields/grillhouse` this script belongs to: the package carries
//   the plugin, whose manifest receives the package's version when it is packed (scripts/cadre.mjs),
//   and the marketplace roomi-fields names the package, so a project's package and the plugin the
//   machine installed for it can drift apart. The entry read is the project's at scope local, else
//   project, else user; the command aligns the one behind (`claude plugin update <id> --scope <its
//   scope>`, or `npm install -D @roomi-fields/grillhouse@<mod's version>`). A version that is not
//   x.y.z (a plugin whose manifest carries none) and a script without its package's package.json
//   beside it compare nothing.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

const DELAI_LECTURE_MS = 5000;

// The path resolved through links, else normalised.
function resolu(p) {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

// Runs claude; `absent` is true when the command does not exist, `delai` when it was stopped.
function claude(args, options = {}) {
  const r = spawnSync('claude', args, { encoding: 'utf8', ...options });
  return {
    ok: r.status === 0 && !r.error,
    absent: r.error?.code === 'ENOENT',
    delai: r.error?.code === 'ETIMEDOUT',
    stdout: r.stdout ?? '',
  };
}

// The declaration of the project: `{ plugins: [id], marches: {name: {source}} }`, or `{ erreur }`.
function declaration(projet) {
  const f = path.join(projet, '.claude', 'settings.json');
  if (!existsSync(f)) {
    return { plugins: [], marches: {} };
  }
  try {
    const r = JSON.parse(readFileSync(f, 'utf8'));
    return {
      plugins: Object.entries(r.enabledPlugins ?? {})
        .filter(([, actif]) => actif === true)
        .map(([id]) => id),
      marches: r.extraKnownMarketplaces ?? {},
    };
  } catch {
    return { erreur: `.claude/settings.json illisible (${f})` };
  }
}

// The JSON array `claude <args> --json` answers, or `{ erreur, delai }`.
function lireListe(args, delai) {
  const r = claude([...args, '--json'], { timeout: delai });
  if (r.absent) {
    return { absent: true };
  }
  if (!r.ok) {
    return {
      erreur: `\`claude ${args.join(' ')} --json\` ${r.delai ? 'interrompu' : 'échoue'}`,
      delai: r.delai,
    };
  }
  try {
    const v = JSON.parse(r.stdout);
    if (Array.isArray(v)) {
      return { liste: v };
    }
  } catch {
    // unreadable, below
  }
  return { erreur: `\`claude ${args.join(' ')} --json\` rend un JSON illisible` };
}

// True when the entries hold the plugin for the project (scope user, or project/local at its root).
function installePourLeProjet(entrees, id, racine) {
  return entrees.some(
    e =>
      e.id === id &&
      (e.scope === 'user' ||
        ((e.scope === 'project' || e.scope === 'local') &&
          typeof e.projectPath === 'string' &&
          resolu(e.projectPath) === racine))
  );
}

// The source `marketplace add` receives for an entry of `extraKnownMarketplaces`, or null.
function sourceDuMarche(entree) {
  const s = entree?.source ?? {};
  const champ = { github: 'repo', git: 'url', url: 'url', directory: 'path', file: 'path' }[
    s.source
  ];
  return champ && typeof s[champ] === 'string' ? s[champ] : null;
}

// The value <nouveau> with the object keys of <ancien> first, in its order, the others after;
// applied at each depth (arrays and scalars are kept as they are).
function dansLOrdre(nouveau, ancien) {
  const objet = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!objet(nouveau) || !objet(ancien)) {
    return nouveau;
  }
  const cles = [
    ...Object.keys(ancien).filter(k => k in nouveau),
    ...Object.keys(nouveau).filter(k => !(k in ancien)),
  ];
  return Object.fromEntries(cles.map(k => [k, dansLOrdre(nouveau[k], ancien[k])]));
}

// Puts `.claude/settings.json` back in the key order (and text, for an equal value) it had in
// <avant>, the text read before the installs; a file that is gone or unreadable stays as it is.
function restaurerReglages(fichier, avant) {
  if (avant === null) {
    return;
  }
  try {
    const apres = readFileSync(fichier, 'utf8');
    if (apres === avant) {
      return;
    }
    const ancien = JSON.parse(avant);
    const range = dansLOrdre(JSON.parse(apres), ancien);
    writeFileSync(
      fichier,
      isDeepStrictEqual(range, ancien) ? avant : `${JSON.stringify(range, null, 2)}\n`
    );
  } catch {
    // unreadable: left as claude wrote it
  }
}

const commandeGreffon = id => `claude plugin install ${id} --scope project`;
const marcheDe = id => id.slice(id.indexOf('@') + 1);

/**
 * Installs the plugins the project declares, for the project. Returns the lines of failure
 * (empty when everything stands).
 */
export function installerGreffons(projet) {
  const fichier = path.join(resolu(projet), '.claude', 'settings.json');
  const avant = existsSync(fichier) ? readFileSync(fichier, 'utf8') : null;
  try {
    return installer(projet);
  } finally {
    restaurerReglages(fichier, avant);
  }
}

function installer(projet) {
  const racine = resolu(projet);
  const d = declaration(racine);
  if (d.erreur) {
    return [d.erreur];
  }
  if (d.plugins.length === 0 && Object.keys(d.marches).length === 0) {
    return [];
  }
  const lignes = [];
  const lecturePlugins = lireListe(['plugin', 'list'], undefined);
  if (lecturePlugins.absent) {
    return d.plugins.map(
      id =>
        `${id} : la commande claude manque ; installe-la, puis lance \`${commandeGreffon(id)}\`.`
    );
  }
  if (lecturePlugins.erreur) {
    return [`${lecturePlugins.erreur} : aucun greffon n'est installé.`];
  }
  const lectureMarches = lireListe(['plugin', 'marketplace', 'list'], undefined);
  if (lectureMarches.erreur) {
    return [`${lectureMarches.erreur} : aucun marketplace n'est ajouté, aucun greffon installé.`];
  }
  const connus = new Set(lectureMarches.liste.map(m => m.name));
  // marketplace name -> the line-part of its failed add (command or reason)
  const echecs = new Map();
  for (const [nom, entree] of Object.entries(d.marches)) {
    if (connus.has(nom)) {
      continue;
    }
    const src = sourceDuMarche(entree);
    if (src === null) {
      echecs.set(
        nom,
        `le marketplace ${nom} a une source (${entree?.source?.source}) que \`claude plugin marketplace add\` n'accepte pas`
      );
      lignes.push(`${echecs.get(nom)}.`);
    } else if (!claude(['plugin', 'marketplace', 'add', src], { cwd: racine }).ok) {
      echecs.set(nom, `\`claude plugin marketplace add ${src}\``);
      if (!d.plugins.some(id => marcheDe(id) === nom)) {
        lignes.push(`le marketplace ${nom} : l'ajout échoue, lance ${echecs.get(nom)}.`);
      }
    }
  }
  for (const id of d.plugins) {
    if (installePourLeProjet(lecturePlugins.liste, id, racine)) {
      continue;
    }
    const marche = marcheDe(id);
    if (echecs.has(marche)) {
      lignes.push(
        `${id} : le marketplace ${marche} manque (${echecs.get(marche)}), puis \`${commandeGreffon(id)}\`.`
      );
    } else if (!claude(['plugin', 'install', id, '--scope', 'project'], { cwd: racine }).ok) {
      lignes.push(`${id} : l'installation échoue ; lance \`${commandeGreffon(id)}\`.`);
    }
  }
  return [...lignes, ...aligner(racine, d.plugins)];
}

// Brings the frame's mod, installed for the project, to the package's version: behind it, the mod
// is updated at its scope from the project's root (`claude plugin update`, its source's latest),
// then read again. Returns the line of a mod that stays at another version, with the command that
// aligns it (`ecart`); none when the versions agree or compare nothing.
function aligner(racine, declares) {
  const lecture = lireListe(['plugin', 'list'], undefined);
  const avant = lecture.liste ? ecart(lecture.liste, declares, racine) : null;
  if (!avant) {
    return [];
  }
  let reste = avant;
  if (avant.derriere) {
    const r = claude(['plugin', 'update', avant.id, '--scope', avant.scope], { cwd: racine });
    const relue = r.ok ? lireListe(['plugin', 'list'], undefined) : {};
    reste = relue.liste ? ecart(relue.liste, declares, racine) : avant;
  }
  return reste
    ? [
        `${reste.id} : le greffon est en ${reste.greffon}, le paquet ${NOM_DU_PAQUET} en ${reste.paquet} ; lance \`${reste.commande}\`.`,
      ]
    : [];
}

/**
 * What the project lacks of its declared plugins: `claude`, `greffon <id>` or `lecture <reason>`
 * lines, and the `ecart …` line of a mod and a package of different versions. Reads only; each
 * claude call stops after 5 s.
 */
export function greffonsAbsents(projet) {
  const racine = resolu(projet);
  const d = declaration(racine);
  if (d.erreur) {
    return [`lecture ${d.erreur}`];
  }
  if (d.plugins.length === 0) {
    return [];
  }
  const lecture = lireListe(['plugin', 'list'], DELAI_LECTURE_MS);
  if (lecture.absent) {
    return ['claude'];
  }
  if (lecture.erreur) {
    return [`lecture ${lecture.erreur}`];
  }
  const absents = d.plugins.filter(id => !installePourLeProjet(lecture.liste, id, racine));
  const e = ecart(lecture.liste, d.plugins, racine);
  return [
    ...absents.map(id => `greffon ${id}`),
    ...(e ? [`ecart ${e.id} ${e.greffon} ${e.paquet} ${e.commande}`] : []),
  ];
}

// The frame's mod and its package: one version, the `version` of the package.json beside this
// script's directory (the package's, wherever it is installed), which the plugin's manifest
// receives when the package is packed.
const GREFFON_DU_CADRE = 'grillhouse';
const NOM_DU_PAQUET = '@roomi-fields/grillhouse';
const X_Y_Z = /^\d+\.\d+\.\d+$/;
function versionDuPaquet() {
  try {
    const p = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return p.name === NOM_DU_PAQUET && typeof p.version === 'string' ? p.version : null;
  } catch {
    return null;
  }
}

// The frame's mod, declared and installed for the project (its entry of scope local, else
// project, else user, as Claude Code applies them), when it carries another version than the
// package: `{ id, scope, greffon, paquet, derriere, commande }`, the command aligning the one
// behind (the mod's update at its scope, or the package's install at the mod's version); null
// otherwise.
function ecart(entrees, declares, racine) {
  const paquet = versionDuPaquet();
  const id = declares.find(x => x.slice(0, x.indexOf('@')) === GREFFON_DU_CADRE);
  if (!paquet || !id) {
    return null;
  }
  const pourLeProjet = entrees.filter(e => installePourLeProjet([e], id, racine));
  const entree = ['local', 'project', 'user']
    .map(s => pourLeProjet.find(e => e.scope === s))
    .find(Boolean);
  const greffon = entree?.version;
  if (typeof greffon !== 'string' || !X_Y_Z.test(greffon) || greffon === paquet) {
    return null;
  }
  const derriere = plusAncienne(greffon, paquet);
  const commande = derriere
    ? `claude plugin update ${id} --scope ${entree.scope}`
    : `npm install -D ${NOM_DU_PAQUET}@${greffon}`;
  return { id, scope: entree.scope, greffon, paquet, derriere, commande };
}

// True when version <a> comes before version <b> (x.y.z, numbers compared in order).
function plusAncienne(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) {
      return (x[i] ?? 0) < (y[i] ?? 0);
    }
  }
  return false;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolu(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const absents = args[0] === '--absents';
  const projet = path.resolve((absents ? args[1] : args[0]) ?? '.');
  if (absents) {
    const lignes = greffonsAbsents(projet);
    if (lignes.length > 0) {
      process.stdout.write(`${lignes.join('\n')}\n`);
    }
  } else {
    const lignes = installerGreffons(projet);
    for (const l of lignes) {
      process.stderr.write(`${l}\n`);
    }
    process.exitCode = lignes.length > 0 ? 1 : 0;
  }
}
