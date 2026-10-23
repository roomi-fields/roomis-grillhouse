#!/usr/bin/env node
// The consumers of the interfaces: each component's `docs/INTERFACE.md` declares, in its
// `## Consommateurs` section, which components use which of its elements:
//
//   ## Consommateurs
//
//   - `a` : duree, tempo
//   - `c` : *
//
// This check reads what the production code of every component imports from every other, and
// refuses (exit 1) a use that the provider's interface does not declare. A declared use that no
// code makes is reported, without refusing. `*` stands for a namespace, default, re-export-all or
// side-effect import. A refusal inscribed in the project's debt (`grillhouse-dette.json`, see
// `dette.mjs`) passes, keyed by the provider's interface and `usage-non-declare` (`homonyme` for
// two components of one name, keyed by the first path).
//
//   npx grillhouse consommateurs        run from the repository root
//
// Components are the directories under `packages/` (reached by their package name or a relative
// path) and under `src/` (reached by a relative path), except those listed out of the frame in
// `docs/agents/hors-cadre.txt`: neither read nor checked, as provider or as consumer. Every check
// of the frame enumerates the components through `composants`. In a repository of packages, such a
// package stays a workspace, and Turborepo plays none of its tasks (scripts/turbo-des-paquets.mjs
// writes its configuration). For the check of the uses, test files,
// `dist/`, `docs/` and `node_modules/` are not production code and are not read; nor are Vite's
// temporary files, and a file gone between the walk and its read is passed over (`parcourir`).
// The identity of a component is its name: two directories of the same name, one under `packages/`
// and one under `src/`, are refused, both paths named (the way npm workspaces, Nx and Cargo refuse
// two projects of one name). Names differing by case are two names.
//
// A project's guard imports `matieres` by the package's entry
// `@roomi-fields/grillhouse/consommateurs`, its types in ./consommateurs.d.ts (docs/ARCHITECTURE.md,
// the package's named entries).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { trancher } from './dette.mjs';
import { horsCadre } from './paquets.mjs';

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|svelte|vue)$/;
const TEST_DIR = new Set(['test', 'tests', '__tests__']);
// The name of a test file: `x.test.ts`, `x.spec.mjs`…
export const NOM_DE_TEST = /\.(test|spec)\.[cm]?[jt]sx?$/;
const isTest = name => NOM_DE_TEST.test(name);
const SKIP = new Set(['node_modules', 'dist', 'docs']);

// Every directory under `packages/` and `src/` of the repository at <racine>: [{ nom, dir }].
function tousDossiers(racine) {
  const found = [];
  for (const parent of ['packages', 'src']) {
    const base = path.join(racine, parent);
    if (!existsSync(base)) continue;
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (e.isDirectory()) found.push({ nom: e.name, dir: path.join(base, e.name) });
    }
  }
  return found;
}

// The component directories of the repository at <racine>: [{ nom, dir }], each directory under
// `packages/` and `src/` that `docs/agents/hors-cadre.txt` does not list.
function dossiers(racine) {
  const hors = horsCadre(racine);
  return tousDossiers(racine).filter(d => !hors.has(d.nom));
}

// The names of `docs/agents/hors-cadre.txt` that no directory under `packages/` or `src/` bears,
// in the order of the list.
export function horsCadreInconnus(racine) {
  const presents = new Set(tousDossiers(racine).map(d => d.nom));
  return [...horsCadre(racine)].filter(nom => !presents.has(nom));
}

// The components of the repository at <racine>: [{ nom, dir, paquet }], `paquet` its package name.
// Throws when a package.json is unreadable.
export function composants(racine) {
  return dossiers(racine).map(({ nom, dir }) => {
    const pj = path.join(dir, 'package.json');
    const paquet = existsSync(pj) ? (JSON.parse(readFileSync(pj, 'utf8')).name ?? null) : null;
    return { nom, dir, paquet };
  });
}

// The subpath export by which a component publishes the shared test material.
const EXPORT_MATIERE = './test-fixtures';

// The components of <racine> whose `package.json` exports `./test-fixtures`, in any form of its
// value, a package out of the frame never one: the packages of the shared test material,
// [{ nom, dir, paquet }] as `composants` gives.
// A component whose `package.json` is unreadable is not a package of the material.
export function matieres(racine) {
  const found = [];
  for (const { nom, dir } of dossiers(racine)) {
    const pj = path.join(dir, 'package.json');
    if (!existsSync(pj)) continue;
    let paquet;
    try {
      paquet = JSON.parse(readFileSync(pj, 'utf8'));
    } catch {
      continue;
    }
    const { exports } = paquet ?? {};
    if (exports !== null && typeof exports === 'object' && EXPORT_MATIERE in exports) {
      found.push({ nom, dir, paquet: paquet.name ?? null });
    }
  }
  return found;
}

// The declared consumers of an interface text: Map consumer → Set of element names.
export function declares(texte) {
  const out = new Map();
  let dedans = false;
  for (const l of texte.split('\n')) {
    if (/^#{1,6} /.test(l)) {
      dedans = /^## Consommateurs\s*$/.test(l);
      continue;
    }
    const m = dedans && /^[-*]\s+`?([^`:\s]+)`?\s*:\s*(.+)$/.exec(l.trim());
    if (!m) continue;
    const noms = m[2]
      .split(',')
      .map(s => s.replace(/`/g, '').trim())
      .filter(Boolean);
    out.set(m[1], new Set(noms));
  }
  return out;
}

// The imports of a source text: [{ spec, noms }].
export function imports(source) {
  const out = [];
  // A static clause holds only names, braces, commas, `*`, `as` and `type`: it never crosses a
  // `;`, a quote, a parenthesis or an `=`, so it never runs from one statement into the next.
  const re =
    /^\s*(?:import|export)\s+(?:type\s+)?([^;'"()=]*?)\s*from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\b(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/gm;
  for (const m of source.matchAll(re)) {
    if (m[3] || m[4]) {
      out.push({ spec: m[3] ?? m[4], noms: ['*'] });
      continue;
    }
    const clause = m[1];
    const noms = [];
    const braces = /\{([^}]*)\}/.exec(clause);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const nom = part
          .replace(/^\s*type\s+/, '')
          .split(/\s+as\s+/)[0]
          .trim();
        if (nom) noms.push(nom);
      }
    }
    if (
      clause
        .replace(/\{[^}]*\}/, '')
        .replace(/,/g, '')
        .trim()
    )
      noms.push('*');
    out.push({ spec: m[2], noms });
  }
  return out;
}

// The temporary file Vite writes beside a configuration it bundles, then removes
// (`vitest.config.ts.timestamp-<n>-<hash>.mjs`).
const TEMPORAIRE_DE_VITE = /\.timestamp-[^/\\]*\.mjs$/;

// <f> read by <lire>, or <absent> when it no longer exists (ENOENT).
function siPresent(lire, f, absent) {
  try {
    return lire(f);
  } catch (e) {
    if (e?.code === 'ENOENT') return absent;
    throw e;
  }
}

// The files under <chemin> (a directory, or a file), each its absolute path: an entry below it
// whose path <sauter> keeps out is neither entered nor listed, and Vite's temporary files are
// never listed. The guards of the frame walk the repository while other processes write in it
// (`npm run verifier` plays them beside the tests): a file or a directory gone before the walk
// reaches it is passed over. The walk of every guard of the frame.
export function parcourir(chemin, sauter = () => false) {
  const out = [];
  const walk = (p, dossier) => {
    if (!dossier) {
      if (!TEMPORAIRE_DE_VITE.test(p)) out.push(p);
      return;
    }
    for (const e of siPresent(d => readdirSync(d, { withFileTypes: true }), p, [])) {
      const q = path.join(p, e.name);
      if (!sauter(q)) walk(q, e.isDirectory());
    }
  };
  const racine = siPresent(statSync, chemin, null);
  if (racine) walk(chemin, racine.isDirectory());
  return out;
}

// The text of the file <f> a walk listed, or null when it is gone since.
export const lireSiPresent = f => siPresent(x => readFileSync(x, 'utf8'), f, null);

// The production source files under <dir>: test folders and test files left out.
function fichiers(dir) {
  const nom = p => path.basename(p);
  return parcourir(
    dir,
    p => SKIP.has(nom(p)) || nom(p).startsWith('.') || TEST_DIR.has(nom(p))
  ).filter(p => SOURCE.test(nom(p)) && !isTest(nom(p)));
}

// The component an import specifier reaches from <fichier>, other than <soi>, or null.
function fournisseur(spec, fichier, tous, soi) {
  if (spec.startsWith('.')) {
    const cible = path.resolve(path.dirname(fichier), spec);
    return (
      tous.find(c => c !== soi && (cible === c.dir || cible.startsWith(c.dir + path.sep))) ?? null
    );
  }
  return (
    tous.find(
      c => c !== soi && c.paquet && (spec === c.paquet || spec.startsWith(c.paquet + '/'))
    ) ?? null
  );
}

// What each component really uses of the others: Map provider → Map consumer → Set of names.
export function utilise(racine, tous = composants(racine)) {
  const out = new Map();
  for (const c of tous) {
    for (const f of fichiers(c.dir)) {
      for (const { spec, noms } of imports(lireSiPresent(f) ?? '')) {
        const p = fournisseur(spec, f, tous, c);
        if (!p) continue;
        if (!out.has(p.nom)) out.set(p.nom, new Map());
        const parConsommateur = out.get(p.nom);
        if (!parConsommateur.has(c.nom)) parConsommateur.set(c.nom, new Set());
        for (const n of noms) parConsommateur.get(c.nom).add(n);
      }
    }
  }
  return out;
}

// The refusals of the components that share a name: one finding per name, both paths.
function homonymes(racine) {
  const parNom = new Map();
  for (const { nom, dir } of dossiers(racine)) {
    parNom.set(nom, [...(parNom.get(nom) ?? []), path.relative(racine, dir)]);
  }
  return [...parNom]
    .filter(([, dirs]) => dirs.length > 1)
    .map(([nom, dirs]) => ({
      fichier: dirs[0],
      regle: 'homonyme',
      message: `${nom} : ${dirs.join(' et ')} portent le même nom de composant.`,
    }));
}

// The refusals (uses no interface declares), as findings `{ fichier, regle, message }` the debt
// (`dette.mjs`) judges, and the reports (declared uses no code makes). A declared consumer out of
// the frame is passed over: its code is not read.
export function verifier(racine) {
  const tous = composants(racine);
  const hors = horsCadre(racine);
  const reel = utilise(racine, tous);
  const refus = homonymes(racine);
  const signaux = [];
  for (const p of tous) {
    const iface = path.join(p.dir, 'docs', 'INTERFACE.md');
    const rel = path.relative(racine, iface);
    const declare = existsSync(iface) ? declares(readFileSync(iface, 'utf8')) : new Map();
    const utilises = reel.get(p.nom) ?? new Map();
    for (const [consommateur, noms] of utilises) {
      const permis = declare.get(consommateur) ?? new Set();
      for (const n of noms) {
        if (!permis.has(n))
          refus.push({
            fichier: rel,
            regle: 'usage-non-declare',
            message: `${consommateur} utilise « ${n} » de ${p.nom}, que ${rel} ne déclare pas.`,
          });
      }
    }
    for (const [consommateur, noms] of declare) {
      if (hors.has(consommateur)) continue;
      const faits = utilises.get(consommateur) ?? new Set();
      for (const n of noms) {
        if (!faits.has(n))
          signaux.push(
            `${rel} déclare « ${n} » pour ${consommateur}, qu'aucun code de ${consommateur} n'utilise.`
          );
      }
    }
  }
  return { refus, signaux };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  const verdict = verifier(racine);
  const { refus, lignes } = trancher(racine, 'consommateurs', verdict.refus);
  for (const s of verdict.signaux) process.stderr.write(`⚠️  ${s}\n`);
  for (const r of refus) process.stderr.write(`⛔ ${r.message}\n`);
  for (const l of lignes) process.stderr.write(`${l}\n`);
  if (refus.length) {
    process.stderr.write(
      "Une consommation nouvelle se décide (la section « Architecture » du ticket qui la nomme, sinon l'arbitrage du superviseur), puis entre dans la section « Consommateurs » de l'interface du fournisseur.\n"
    );
    process.exitCode = 1;
  }
}
