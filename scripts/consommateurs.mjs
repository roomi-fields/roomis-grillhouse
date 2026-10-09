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
// side-effect import.
//
//   node scripts/consommateurs.mjs        run from the repository root
//
// Components are the directories under `packages/` (reached by their package name or a relative
// path) and under `src/` (reached by a relative path). Test files, `dist/`, `docs/` and
// `node_modules/` are not production code and are not read.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|svelte|vue)$/;
const TEST_DIR = new Set(['test', 'tests', '__tests__']);
const isTest = name => /\.(test|spec)\.[cm]?[jt]sx?$/.test(name);
const SKIP = new Set(['node_modules', 'dist', 'docs']);

// The components of the repository at <racine>: [{ nom, dir, paquet }], `paquet` its package name.
export function composants(racine) {
  const found = [];
  for (const parent of ['packages', 'src']) {
    const base = path.join(racine, parent);
    if (!existsSync(base)) continue;
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const dir = path.join(base, e.name);
      const pj = path.join(dir, 'package.json');
      const paquet = existsSync(pj) ? (JSON.parse(readFileSync(pj, 'utf8')).name ?? null) : null;
      found.push({ nom: e.name, dir, paquet });
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

// The production source files under <dir>.
function fichiers(dir) {
  const out = [];
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (SKIP.has(e.name) || TEST_DIR.has(e.name) || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (SOURCE.test(e.name) && !isTest(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
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
      for (const { spec, noms } of imports(readFileSync(f, 'utf8'))) {
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

// The refusals (uses no interface declares) and the reports (declared uses no code makes).
export function verifier(racine) {
  const tous = composants(racine);
  const reel = utilise(racine, tous);
  const refus = [];
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
          refus.push(`${consommateur} utilise « ${n} » de ${p.nom}, que ${rel} ne déclare pas.`);
      }
    }
    for (const [consommateur, noms] of declare) {
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
  const { refus, signaux } = verifier(process.cwd());
  for (const s of signaux) process.stderr.write(`⚠️  ${s}\n`);
  if (refus.length) {
    for (const r of refus) process.stderr.write(`⛔ ${r}\n`);
    process.stderr.write(
      "Une consommation nouvelle passe par l'arbitre, puis entre dans la section « Consommateurs » de l'interface du fournisseur.\n"
    );
    process.exit(1);
  }
}
