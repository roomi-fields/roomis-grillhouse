#!/usr/bin/env node
// The hook of the agents' writes (PostToolUse of Write, Edit and MultiEdit, hooks.json): it applies
// the format and the lint's automatic fixes to the file just written, as an editor's
// format-on-save and lint-staged do, and gives the agent the findings nothing fixes.
//
//   npx grillhouse style-a-l-ecriture      reads the hook's input (JSON) on its standard input
//
// - The file written alone is touched. The package that holds it is the nearest `package.json`
//   above it (the project's root when none lies between); the package's `format:check` and `lint`
//   scripts say what the format and the lint cover (their patterns, from the package's folder),
//   and the configurations of Prettier and ESLint are found upward from the file, up to the root.
//   A file the patterns of its package do not name stays as it is; a package without a script has
//   no such control for its files.
// - The order is the one of lint-staged: ESLint's fixes, then Prettier, then the findings of
//   ESLint on the result. A finding (an ESLint error that no fix lifts, a file Prettier or ESLint
//   cannot read) is written as `<file>:<line>:<column> <rule> — <message>`, from the project's
//   root, in the `additionalContext` of the hook's output; it comes back at each write while it
//   stands, and nothing blocks.
// - It never fails on the tool: without Prettier or ESLint installed in the project, an input that
//   is no JSON, a file absent or out of the project, it exits 0 and writes nothing.
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// Node's glob matching is experimental and says so on the error stream; the hook writes none.
process.emitWarning = () => {};

// The flags of the two tools whose next argument is a value, not a pattern.
const AVEC_VALEUR = new Set([
  '--cache-location',
  '--config',
  '-c',
  '--ignore-path',
  '--log-level',
  '--ext',
  '--parser',
  '--resolve-plugins-relative-to',
  '--rulesdir',
  '--format',
  '-f',
  '--max-warnings',
  '--plugin',
  '--env',
  '--global',
  '--report-unused-disable-directives-severity',
]);

// The patterns and the extensions the script <script> names for the tool <outil> (`prettier` or
// `eslint`), or null when the script does not run it.
function motifsDuScript(script, outil) {
  if (typeof script !== 'string') return null;
  const mots = (script.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(m =>
    m.replace(/^(["'])(.*)\1$/, '$2')
  );
  const i = mots.findIndex(m => m === outil || m.endsWith(`/${outil}`));
  if (i < 0) return null;
  const motifs = [];
  const ext = [];
  for (let j = i + 1; j < mots.length; j++) {
    const m = mots[j];
    if (['&&', '||', ';', '|'].includes(m)) break;
    if (m === '--ext') ext.push(...String(mots[++j] ?? '').split(','));
    else if (m.startsWith('--ext=')) ext.push(...m.slice(6).split(','));
    else if (AVEC_VALEUR.has(m)) j++;
    else if (!m.startsWith('-')) motifs.push(m.replace(/^\.\//, ''));
  }
  return { motifs, ext: ext.filter(Boolean).map(e => (e.startsWith('.') ? e : `.${e}`)) };
}

// Whether the file <rel> (from the package's folder) is named by <motifs>: a pattern with a glob
// matches it as such, one without names the file or a folder that holds it (then <extension>
// decides, when given, which files of a folder count).
function couvre(rel, motifs, extension) {
  return motifs.some(m => {
    if (/[*?[\]{}]/.test(m)) return path.matchesGlob(rel, m);
    const net = m.replace(/\/+$/, '');
    if (net === '.' || net === '') return extension(rel);
    return rel === net || (rel.startsWith(`${net}/`) && extension(rel));
  });
}

// The package.json nearest above <fichier> in <projet>: its folder and its scripts, or null.
function paquetDe(projet, fichier) {
  let dossier = path.dirname(fichier);
  for (;;) {
    const pj = path.join(dossier, 'package.json');
    if (existsSync(pj)) {
      try {
        return { dossier, scripts: JSON.parse(readFileSync(pj, 'utf8')).scripts ?? {} };
      } catch {
        return null;
      }
    }
    if (dossier === projet || path.dirname(dossier) === dossier) return null;
    dossier = path.dirname(dossier);
  }
}

const ligneDe = (e, defaut = 1) => e?.loc?.start?.line ?? e?.loc?.line ?? e?.line ?? defaut;
const premiereLigne = t => String(t ?? '').split('\n')[0];

async function main() {
  let entree;
  try {
    entree = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return [];
  }
  if (!['Write', 'Edit', 'MultiEdit'].includes(entree?.tool_name)) return [];
  const brut = entree.tool_input?.file_path;
  if (typeof brut !== 'string') return [];
  const projet = realpathSync(process.env.CLAUDE_PROJECT_DIR || process.cwd());
  let fichier;
  try {
    fichier = realpathSync(path.resolve(projet, brut));
  } catch {
    return [];
  }
  if (!fichier.startsWith(`${projet}${path.sep}`)) return [];
  const paquet = paquetDe(projet, fichier);
  if (!paquet) return [];
  const rel = path.relative(paquet.dossier, fichier).split(path.sep).join('/');
  const depuisRacine = path.relative(projet, fichier).split(path.sep).join('/');

  const exigerDuProjet = createRequire(path.join(projet, 'package.json'));
  const charger = nom => {
    try {
      return exigerDuProjet(nom);
    } catch {
      return null;
    }
  };

  // What the scripts of the package cover.
  const formatage = motifsDuScript(paquet.scripts['format:check'], 'prettier');
  const lint = motifsDuScript(paquet.scripts.lint, 'eslint');
  const prettier = formatage ? charger('prettier') : null;
  const eslintModule = lint ? charger('eslint') : null;
  const ESLint = eslintModule?.ESLint;
  const constats = [];
  const dit = (ligne, colonne, regle, message) =>
    constats.push(`${depuisRacine}:${ligne}:${colonne} ${regle} — ${premiereLigne(message)}`);

  // 1. ESLint's fixes.
  let fatale = false;
  const lintCouvert =
    ESLint &&
    couvre(rel, lint.motifs, f => (lint.ext.length ? lint.ext : ['.js']).some(e => f.endsWith(e)));
  const eslint = fix => new ESLint({ cwd: paquet.dossier, fix });
  const juger = async fix => {
    const moteur = eslint(fix);
    if (await moteur.isPathIgnored(fichier)) return null;
    const [resultat] = await moteur.lintFiles([fichier]);
    if (fix) await ESLint.outputFixes([resultat]);
    return resultat;
  };
  let dernier = null;
  if (lintCouvert) {
    try {
      dernier = await juger(true);
    } catch (e) {
      dit(ligneDe(e), 1, 'eslint', e?.message);
      fatale = true;
    }
  }

  // 2. Prettier.
  let modifie = false;
  let erreurFormat = null;
  if (prettier) {
    const info = await prettier.getFileInfo(fichier, {
      ignorePath: path.join(projet, '.prettierignore'),
      resolveConfig: true,
    });
    const couvert =
      !info.ignored && info.inferredParser && couvre(rel, formatage.motifs, f => f.length > 0);
    if (couvert) {
      try {
        const texte = readFileSync(fichier, 'utf8');
        const config = (await prettier.resolveConfig(fichier, { editorconfig: true })) ?? {};
        const formate = await prettier.format(texte, { ...config, filepath: fichier });
        if (formate !== texte) {
          writeFileSync(fichier, formate);
          modifie = true;
        }
      } catch (e) {
        erreurFormat = e;
      }
    }
  }

  // 3. ESLint's findings on the result.
  if (lintCouvert && !fatale) {
    try {
      const resultat = modifie || !dernier ? await juger(false) : dernier;
      for (const m of resultat?.messages ?? []) {
        if (m.severity === 2) {
          dit(m.line ?? 1, m.column ?? 1, m.ruleId ?? 'erreur', m.message);
          if (m.fatal) fatale = true;
        }
      }
    } catch (e) {
      dit(ligneDe(e), 1, 'eslint', e?.message);
      fatale = true;
    }
  }
  if (erreurFormat && !fatale) {
    dit(
      ligneDe(erreurFormat),
      erreurFormat?.loc?.start?.column ?? 1,
      'prettier',
      erreurFormat.message
    );
  }
  return constats;
}

let constats = [];
try {
  constats = await main();
} catch {
  constats = [];
}
if (constats.length) {
  const texte = `Constats de style sur le fichier que tu viens d'écrire (rien ne les corrige seul ; corrige-les dans cette séance) :\n${constats.join('\n')}`;
  process.stdout.write(
    `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: texte } })}\n`
  );
}
