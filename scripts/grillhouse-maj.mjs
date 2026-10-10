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
// - `.claude/settings.json`: the frame's hooks, plugins and marketplaces are added; a hook the
//   previous version installed and the new one dropped is removed; the project's own settings stay.
// - `package.json`, when there is one: the frame's npm scripts (`tableau`, `grillhouse:maj`).
// - `.claude/grillhouse/empreintes.json` records the source's commit, each file's SHA-256 and the
//   hooks installed. `--ecarts` compares the files with it: a frame file modified or missing in a
//   project is drift, which goes back to Grillhouse as a proposal.
// - The source: --source, else GRILLHOUSE_SOURCE, else Grillhouse's repository on GitHub, kept in
//   ~/.cache/grillhouse/roomis-grillhouse and moved to its last commit.
import { execFileSync } from 'node:child_process';
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
import { pathToFileURL } from 'node:url';

export const DEPOT = 'https://github.com/roomi-fields/roomis-grillhouse.git';
const LISTE = '.claude/grillhouse/fichiers.txt';
const EMPREINTES = '.claude/grillhouse/empreintes.json';
const SCRIPTS = {
  tableau: 'node scripts/tableau.mjs --texte',
  'grillhouse:maj': 'node scripts/grillhouse-maj.mjs',
};

const empreinte = f => createHash('sha256').update(readFileSync(f)).digest('hex');
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

// The project's settings with the frame's added and the dropped frame hooks removed.
export function fusionnerReglages(projet, cadre, anciens = []) {
  const s = structuredClone(projet);
  const neufs = new Set(crochets(cadre).map(cle));
  const retires = new Set(anciens.filter(k => !neufs.has(k)));
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
  s.enabledPlugins = { ...(s.enabledPlugins ?? {}), ...(cadre.enabledPlugins ?? {}) };
  s.extraKnownMarketplaces = {
    ...(s.extraKnownMarketplaces ?? {}),
    ...(cadre.extraKnownMarketplaces ?? {}),
  };
  return { reglages: s, installes: [...neufs] };
}

// Brings the project at `projet` to the frame at `source`. Returns what changed.
export function mettreAJour(projet, source, version) {
  const { garder, retirer } = lireListe(readFileSync(path.join(source, LISTE), 'utf8'));
  const avant = lireJson(path.join(projet, EMPREINTES), { fichiers: {}, crochets: [] });
  const fichiers = fichiersDuCadre(source, garder);
  const bilan = { copies: [], retires: [] };
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
  const { reglages, installes } = fusionnerReglages(
    lireJson(fichierReglages, {}),
    cadre,
    avant.crochets ?? []
  );
  mkdirSync(path.dirname(fichierReglages), { recursive: true });
  writeFileSync(fichierReglages, `${JSON.stringify(reglages, null, 2)}\n`);
  const pkg = path.join(projet, 'package.json');
  if (existsSync(pkg)) {
    const p = lireJson(pkg, {});
    p.scripts = { ...(p.scripts ?? {}), ...SCRIPTS };
    writeFileSync(pkg, `${JSON.stringify(p, null, 2)}\n`);
  }
  mkdirSync(path.dirname(path.join(projet, EMPREINTES)), { recursive: true });
  writeFileSync(
    path.join(projet, EMPREINTES),
    `${JSON.stringify({ version, fichiers: empreintes, crochets: installes }, null, 2)}\n`
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
}
