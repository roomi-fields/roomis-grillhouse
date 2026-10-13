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
//   `grillhouse:gardes`, the list of the frame's controls, and `api` (`npm run api`, which writes
//   the API reports and the generated part of each `docs/INTERFACE.md`), each read as it is in the source's `package.json` (a source without one
//   writes none). The project's `pretest` calls it: a project without a pretest receives
//   `npm run --silent grillhouse:gardes`, one whose pretest does not call it receives it at the
//   head (`… && <its pretest>`), one that calls it stays. A source without `grillhouse:gardes`
//   writes neither it nor a pretest. An `integration:gardes` left at the frame's old wiring
//   (`npm run --silent pretest`) receives the source's command; a wiring of the project's own stays.
// - The controls' tools (API Extractor and its model, the TSDoc configuration reader,
//   dependency-cruiser, knip) are added to the project's
//   `devDependencies` at the version the source's `devDependencies` give; a tool the project
//   already declares in `dependencies`, `devDependencies` or `optionalDependencies` keeps its
//   declaration, one a previous version added stays, and `devDependencies` are written sorted by
//   name. The report names each tool added and `npm install`, which installs them.
// - A project that runs Vitest (its `test` script names it, or `vitest` is in the `dependencies` or
//   `devDependencies` of its root `package.json` or of one of its workspaces) has its `test` script
//   become the source's `test` (the launcher with its cache, scripts/integration/suites-vitest.mjs);
//   the report says so. A `test` that runs anything
//   else stays.
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
//   `docs/agents/index-des-interfaces.md`), so that the frame's checks accept them; a generator
//   that fails has its line, and the exit code is non-zero. `interfaces-contre-code.mjs` is not
//   run: it writes after a build.
// - An option other than `--source <path>` and `--ecarts` is refused: the usage is shown (the
//   exit code is non-zero) and nothing is updated, `--help` included.
// - `.claude/grillhouse/empreintes.json` records the source's commit, each file's SHA-256 and the
//   hooks, plugins and marketplaces installed. `--ecarts` compares the files with it: a frame file modified or missing in a
//   project is drift, which goes back to Grillhouse as a proposal.
// - The source: --source, else GRILLHOUSE_SOURCE, else Grillhouse's repository on GitHub, kept in
//   ~/.cache/grillhouse/roomis-grillhouse and moved to its last commit.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { poserCrochets } from './crochets.mjs';
import { installerGreffons } from './greffons.mjs';

export const DEPOT = 'https://github.com/roomi-fields/roomis-grillhouse.git';
const LISTE = '.claude/grillhouse/fichiers.txt';
const EMPREINTES = '.claude/grillhouse/empreintes.json';
const SCRIPTS = {
  tableau: 'node scripts/tableau.mjs --texte',
  'grillhouse:maj': 'node scripts/grillhouse-maj.mjs',
};

// The controls' tools: their names are the frame's, their versions are read in the source.
const OUTILS_DES_CONTROLES = [
  '@microsoft/api-extractor',
  '@microsoft/api-extractor-model',
  '@microsoft/tsdoc-config',
  'dependency-cruiser',
  'knip',
];
const CHAMPS_INSTALLES = ['dependencies', 'devDependencies', 'optionalDependencies'];

const APPELLE =
  /(?:^|[\s;&|(])npm\s+run(?:-script)?(?:\s+-{1,2}[\w-]+(?:=\S+)?)*\s+grillhouse:gardes(?=$|[\s;&|)])/;
const APPEL_GARDES = 'npm run --silent grillhouse:gardes';
const ANCIEN_CABLAGE_DES_GARDES = 'npm run --silent pretest';

const empreinte = f => createHash('sha256').update(readFileSync(f)).digest('hex');
// Whether `vitest` is declared in the dependencies of the package.json <p> (read at <dossier>) or of
// one of its workspaces (the entries of `workspaces`, or of `workspaces.packages`; a trailing `/*`
// lists the folders under it).
const declareVitest = (dossier, p) => {
  const a = pkg => Boolean(pkg?.dependencies?.vitest ?? pkg?.devDependencies?.vitest);
  if (a(p)) return true;
  const ws = Array.isArray(p?.workspaces) ? p.workspaces : (p?.workspaces?.packages ?? []);
  return ws.some(w => {
    const motif = String(w).replace(/\/$/, '');
    const base = motif.endsWith('/*') ? motif.slice(0, -2) : null;
    let dossiers = [motif];
    if (base !== null) {
      try {
        dossiers = readdirSync(path.join(dossier, base)).map(d => `${base}/${d}`);
      } catch {
        dossiers = [];
      }
    }
    return dossiers.some(d => a(lireJson(path.join(dossier, d, 'package.json'), null)));
  });
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

// Brings the project at `projet` to the frame at `source`. Returns what changed.
export function mettreAJour(projet, source, version) {
  const { garder, retirer } = lireListe(readFileSync(path.join(source, LISTE), 'utf8'));
  const avant = lireJson(path.join(projet, EMPREINTES), { fichiers: {}, crochets: [] });
  const fichiers = fichiersDuCadre(source, garder);
  const bilan = { copies: [], retires: [], dependances: [], test: null };
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
    // The frame's test (the launcher with its cache) replaces a project's own test that runs Vitest.
    const testDuCadre = pkgSource.scripts?.test;
    const testDuProjet = p.scripts.test;
    if (
      typeof testDuCadre === 'string' &&
      typeof testDuProjet === 'string' &&
      testDuProjet !== testDuCadre &&
      (/\bvitest\b/.test(testDuProjet) || declareVitest(projet, p))
    ) {
      p.scripts.test = testDuCadre;
      bilan.test = { ancien: testDuProjet, nouveau: testDuCadre };
    }
    for (const nom of OUTILS_DES_CONTROLES) {
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
    if (typeof gardes === 'string') {
      p.scripts['grillhouse:gardes'] = gardes;
      const pretest = typeof p.scripts.pretest === 'string' ? p.scripts.pretest.trim() : '';
      if (!pretest) {
        p.scripts.pretest = APPEL_GARDES;
      } else if (!APPELLE.test(pretest)) {
        p.scripts.pretest = `${APPEL_GARDES} && ${p.scripts.pretest}`;
      }
    }
    // The guards of an integration: the frame's old wiring (`npm run --silent pretest`, which builds
    // again) becomes the source's command; a wiring of the project's own stays.
    const gardesIntegration = pkgSource.scripts?.['integration:gardes'];
    if (
      typeof gardesIntegration === 'string' &&
      p.scripts['integration:gardes']?.trim() === ANCIEN_CABLAGE_DES_GARDES
    ) {
      p.scripts['integration:gardes'] = gardesIntegration;
    }
    writeFileSync(pkg, `${JSON.stringify(p, null, 2)}\n`);
  }
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

// The frame's generators and the file each writes: run in the project after the copy.
const GENERATEURS = [
  { script: 'scripts/frontieres.mjs', args: ['--ecrire'], sortie: '.dependency-cruiser.cjs' },
  {
    script: 'scripts/index-interfaces.mjs',
    args: [],
    sortie: 'docs/agents/index-des-interfaces.md',
  },
];

// Runs each generator whose script and output the project holds; returns the lines of failure.
export function regenerer(projet) {
  const lignes = [];
  for (const g of GENERATEURS) {
    if (!existsSync(path.join(projet, g.script)) || !existsSync(path.join(projet, g.sortie))) {
      continue;
    }
    const r = spawnSync(process.execPath, [g.script, ...g.args], { cwd: projet, encoding: 'utf8' });
    if (r.status !== 0) {
      lignes.push(
        `${g.sortie} : \`node ${[g.script, ...g.args].join(' ')}\` échoue ; lance-le. ${(r.stderr ?? '').trim()}`.trim()
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const projet = process.cwd();
  const args = process.argv.slice(2);
  const valide = args.every(
    (a, k) => a === '--ecarts' || a === '--source' || args[k - 1] === '--source'
  );
  if (!valide || args.at(-1) === '--source') {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  if (process.argv.includes('--ecarts')) {
    const e = ecarts(projet);
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
    process.exit(0);
  }
  const i = process.argv.indexOf('--source');
  const src = source(i > 0 ? process.argv[i + 1] : undefined);
  let version = 'inconnue';
  try {
    version = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    version = 'inconnue';
  }
  const b = mettreAJour(projet, src, version);
  process.stdout.write(
    `Cadre à la version ${version.slice(0, 7)} : ${b.copies.length} fichier(s) copié(s), ${b.retires.length} retiré(s).\n`
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
  if (b.test) {
    process.stdout.write(
      `Script test : \`${b.test.ancien}\` remplacé par le test du cadre \`${b.test.nouveau}\` (relit les fichiers de test dont rien n'a bougé).\n`
    );
  }
  for (const l of [...regenerer(projet), ...installerGreffons(projet)]) {
    process.stderr.write(`${l}\n`);
    process.exitCode = 1;
  }
}
