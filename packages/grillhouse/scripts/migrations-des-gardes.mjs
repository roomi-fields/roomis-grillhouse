#!/usr/bin/env node
// The guard of the migrations of the guards: a guard with a debt arrives with the migration that
// inscribes the existing debt of the projects (`trancher(projet, GARDE, constats, 'inscrire')`),
// as the codemods of `nx migrate` or the baselines of ESLint and Betterer; a project that updates
// then has no gesture to make by hand.
//
//   npx grillhouse migrations-des-gardes      (a guard of `grillhouse:gardes`)
//
// - A guard with a debt is a script under scripts/ or scripts/langages/*/ that imports `trancher`
//   of scripts/dette.mjs and calls it; its name is the second argument of the call, a literal or
//   the constant `GARDE` of the script. The definition of `trancher` itself is no guard.
// - A migration covers a guard when its text, under scripts/migrations/ or
//   scripts/langages/*/migrations/, imports the script of the guard by its resolved path and calls
//   `trancher(` with the same name (a literal, or the `GARDE` it imports from the script), and
//   when scripts/migrations.mjs or a scripts/langages/*/index.mjs imports that migration: it is
//   played.
// - The guard reads the texts and loads no module. Its findings (rule `garde-sans-migration`) are
//   counted against the debt (scripts/dette.mjs), so the guards without migration at its entry
//   are inscribed, frozen, and the entry of a guard that receives its migration is pruned.
// - It plays at the frame only: scripts installed under node_modules, or outside the root, are the
//   frame's, whose debt the frame holds; a project that updates sees none refused.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MODE, trancher } from './dette.mjs';

export const GARDE = 'migrations-des-gardes';
export const REGLE = 'garde-sans-migration';
export const SCRIPT = fileURLToPath(import.meta.url);

const DOSSIER = path.dirname(SCRIPT);
const MODELE = '0.30.0-tailles-des-outils-lourds.mjs';

const sousDossiers = dir =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => path.join(dir, e.name))
    : [];
const scriptsDe = dir =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isFile() && e.name.endsWith('.mjs'))
        .map(e => path.join(dir, e.name))
    : [];
// The text of <fichier> without its whole-line comments.
const texte = fichier =>
  readFileSync(fichier, 'utf8')
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l))
    .join('\n');

// The imports of <t> (the text of the file <de>): each { noms, chemin } with the path resolved.
function imports(t, de) {
  const out = [];
  const re = /import\s+(?:([^'"]*?)\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const m of t.matchAll(re)) {
    if (m[2].startsWith('.')) {
      out.push({ noms: m[1] ?? '', chemin: path.resolve(path.dirname(de), m[2]) });
    }
  }
  return out;
}
const importe = (t, de, cible) => imports(t, de).some(i => i.chemin === cible);

// The second argument of each call to `trancher(` in <t>: a literal name or the identifier GARDE.
function secondsArguments(t) {
  const out = [];
  const re = /\btrancher\(\s*[^,()]*(?:\([^()]*\))?[^,()]*,\s*(?:'([^']+)'|"([^"]+)"|(GARDE)\b)/g;
  for (const m of t.matchAll(re)) {
    out.push(m[3] ? { constante: true } : { nom: m[1] ?? m[2] });
  }
  return out;
}
const constanteGarde = t => /\bconst\s+GARDE\s*=\s*['"]([^'"]+)['"]/.exec(t)?.[1];

// The names of the guard <fichier> (text <t>), or [] when it is not a guard with a debt.
function nomsDeGarde(fichier, t) {
  if (!imports(t, fichier).some(i => /\btrancher\b/.test(i.noms) && /\/dette(\.mjs)?$/.test(i.chemin))) {
    return [];
  }
  const noms = new Set();
  for (const a of secondsArguments(t)) {
    const n = a.constante ? constanteGarde(t) : a.nom;
    if (n) {
      noms.add(n);
    }
  }
  return [...noms];
}

// True when the scripts at <scripts> belong to the repository at <racine>: under its root and not
// installed under node_modules. A project that installs the frame judges none of its scripts.
function chezLeCadre(racine, scripts) {
  const rel = path.relative(racine, scripts);
  return !rel.startsWith('..') && !path.isAbsolute(rel) && !rel.split(path.sep).includes('node_modules');
}

// The refusals of the repository at <racine>, its frame's scripts at <scripts>.
export function verifier(racine, scripts = DOSSIER) {
  if (!chezLeCadre(racine, scripts)) {
    return [];
  }
  const langages = sousDossiers(path.join(scripts, 'langages'));
  const gardes = [...scriptsDe(scripts), ...langages.flatMap(scriptsDe)].filter(
    f => path.basename(f) !== 'dette.mjs'
  );
  const dossiersDeMigrations = [
    path.join(scripts, 'migrations'),
    ...langages.map(l => path.join(l, 'migrations')),
  ];
  const indexs = [
    path.join(scripts, 'migrations.mjs'),
    ...langages.map(l => path.join(l, 'index.mjs')),
  ].filter(existsSync);
  const textesDesIndex = indexs.map(f => ({ f, t: texte(f) }));
  // The migrations played: imported by the index of the core or of a language.
  const jouees = dossiersDeMigrations
    .flatMap(scriptsDe)
    .filter(m => textesDesIndex.some(({ f, t }) => importe(t, f, m)))
    .map(m => ({ m, t: texte(m) }));
  const constats = [];
  for (const g of gardes) {
    const t = texte(g);
    const noms = nomsDeGarde(g, t);
    for (const nom of noms) {
      const couverte = jouees.some(({ m, t: tm }) => {
        const lien = imports(tm, m).find(i => i.chemin === g || i.chemin === g.replace(/\.mjs$/, ''));
        if (!lien) {
          return false;
        }
        return secondsArguments(tm).some(a =>
          a.constante ? /\bGARDE\b/.test(lien.noms) && nom === constanteGarde(t) : a.nom === nom
        );
      });
      if (!couverte) {
        const fichier = path.relative(racine, g).split(path.sep).join('/');
        constats.push({
          fichier,
          regle: REGLE,
          message: `${fichier} : la garde « ${nom} » a une dette sans migration qui l'inscrive chez les projets ; écris sa migration sur le patron de ${MODELE}, qui inscrit la dette existante des projets par trancher(projet, GARDE, constats, 'inscrire'), et déclare-la dans l'index de son langage (scripts/migrations.mjs pour le cœur).`,
        });
      }
    }
  }
  return constats;
}

// The report of the guard at <racine>: its lines and its exit code, the findings counted against
// the debt.
export function rapport(racine, env = process.env, scripts = DOSSIER) {
  const { refus, lignes } = trancher(
    racine,
    GARDE,
    verifier(racine, scripts),
    env[MODE] || undefined,
    env
  );
  return { lignes: [...refus.map(r => `⛔ ${r.message}`), ...lignes], code: refus.length ? 1 : 0 };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { lignes, code } = rapport(process.cwd());
  for (const l of lignes) {
    process.stderr.write(`${l}\n`);
  }
  process.exitCode = code;
}
