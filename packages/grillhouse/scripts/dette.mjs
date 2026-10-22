// The known debt of the guards: the findings a project carries when it adopts the frame, written
// and frozen in one file at its root, on the model of ESLint's bulk suppressions
// (`eslint-suppressions.json`, `--suppress-all`, `--prune-suppressions`) and of betterer.
//
// The file `grillhouse-dette.json` holds, for each guard, each file and each rule, the count of
// findings inscribed:
//
//   {
//     "code-mort": { "src/a.ts": { "exports": { "count": 2 } } },
//     "consommateurs": { "packages/b/docs/INTERFACE.md": { "usage-non-declare": { "count": 1 } } }
//   }
//
// A finding is `{ fichier, regle, message }`, and its `ligne` when the guard knows it: its key is
// the guard, the file and the rule (never a line number), its message what the guard prints. A finding without `fichier` or `regle` is never
// inscribed: the guard refuses it every time (a generated file out of date, a measure that failed).
//
// - A guard passes when, for every key, the findings are no more than the inscribed count. A key
//   whose count goes beyond refuses with all its findings, as ESLint reports them all, and a line
//   naming the key, its count and the inscribed one.
// - A key inscribed above what the guard finds is reported, without refusing, so it gets pruned.
// - `GRILLHOUSE_DETTE=inscrire` writes the guard's whole section from what it finds (its debt of
//   today); `GRILLHOUSE_DETTE=elaguer` lowers each inscribed count to what the guard finds and
//   drops the keys at zero, never raising a count nor adding a key. Each guard then judges against
//   the file it wrote. The npm scripts `grillhouse:dette:inscrire` and `grillhouse:dette:elaguer`
//   run every guard so.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ecrireSarif } from './resultats.mjs';

export const FICHIER = 'grillhouse-dette.json';
// The environment variable that names the mode of a run: `inscrire` or `elaguer`.
export const MODE = 'GRILLHOUSE_DETTE';
const MODES = new Set(['inscrire', 'elaguer']);

const inscriptible = c => Boolean(c.fichier && c.regle);

// The findings counted per file and rule: Map fichier → Map regle → count.
function compter(constats) {
  const out = new Map();
  for (const c of constats.filter(inscriptible)) {
    if (!out.has(c.fichier)) out.set(c.fichier, new Map());
    const parRegle = out.get(c.fichier);
    parRegle.set(c.regle, (parRegle.get(c.regle) ?? 0) + 1);
  }
  return out;
}

// The section of a guard as written in the file, its keys sorted: { fichier: { regle: { count } } }.
function section(comptes) {
  const out = {};
  for (const fichier of [...comptes.keys()].sort()) {
    const regles = comptes.get(fichier);
    out[fichier] = {};
    for (const regle of [...regles.keys()].sort()) {
      out[fichier][regle] = { count: regles.get(regle) };
    }
  }
  return out;
}

// The debt written at <racine>: {} without the file. Throws, naming the file, when it is not JSON.
export function lire(racine) {
  const f = path.join(racine, FICHIER);
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    throw new Error(`${FICHIER} n'est pas un JSON lisible : ${e.message}`);
  }
}

// <dette> with the section of <garde> replaced by what <constats> count; the guard leaves the file
// when it finds nothing.
export function inscrire(dette, garde, constats) {
  const reste = { ...dette };
  delete reste[garde];
  const comptes = compter(constats);
  return comptes.size ? { ...reste, [garde]: section(comptes) } : reste;
}

// <dette> with each count of <garde> lowered to what <constats> count, the keys at zero dropped;
// a count never rises and no key is added.
export function elaguer(dette, garde, constats) {
  const { [garde]: ancienne = {}, ...reste } = dette;
  const comptes = compter(constats);
  const garde2 = new Map();
  for (const [fichier, regles] of Object.entries(ancienne)) {
    for (const [regle, { count }] of Object.entries(regles)) {
      const n = Math.min(count, comptes.get(fichier)?.get(regle) ?? 0);
      if (n === 0) continue;
      if (!garde2.has(fichier)) garde2.set(fichier, new Map());
      garde2.get(fichier).set(regle, n);
    }
  }
  return garde2.size ? { ...reste, [garde]: section(garde2) } : reste;
}

// <constats> of <garde> judged against <dette>: `refus` the findings the guard refuses (those
// without key, and every finding of a key beyond its count), `depasses` the keys beyond a non-zero
// count, `corriges` the keys inscribed above what is found, `tus` the number of findings the debt
// covers.
export function juger(dette, garde, constats) {
  const inscrite = dette[garde] ?? {};
  const comptes = compter(constats);
  const permis = (fichier, regle) => inscrite[fichier]?.[regle]?.count ?? 0;
  const refus = constats.filter(
    c => !inscriptible(c) || comptes.get(c.fichier).get(c.regle) > permis(c.fichier, c.regle)
  );
  const depasses = [];
  for (const [fichier, regles] of comptes) {
    for (const [regle, trouve] of regles) {
      const inscrit = permis(fichier, regle);
      if (inscrit > 0 && trouve > inscrit) depasses.push({ fichier, regle, trouve, inscrit });
    }
  }
  const corriges = [];
  for (const [fichier, regles] of Object.entries(inscrite)) {
    for (const [regle, { count }] of Object.entries(regles)) {
      const trouve = comptes.get(fichier)?.get(regle) ?? 0;
      if (trouve < count) corriges.push({ fichier, regle, trouve, inscrit: count });
    }
  }
  return { refus, depasses, corriges, tus: constats.length - refus.length };
}

// Runs the debt of <garde> at <racine> on its <constats>, in the mode <mode> (the environment's
// `GRILLHOUSE_DETTE` by default): writes the file in mode `inscrire` or `elaguer`, then judges.
// Returns `refus`, the findings to print as refusals, and `lignes`, the lines to print after them
// (the keys beyond their count, the keys to prune, what the run wrote). An unknown mode, or a file
// that is not JSON, refuses every finding, behind a refusal that says why. The refusals are the
// guard's findings in SARIF too, under the results directory <env> names (scripts/resultats.mjs),
// each with its file, its line when the guard gives one, and its rule.
export function trancher(racine, garde, constats, mode = process.env[MODE] || undefined, env) {
  const { refus, lignes } = juge(racine, garde, constats, mode);
  ecrireSarif({ garde, constats: refus, racine, env: env ?? process.env });
  return { refus, lignes };
}

function juge(racine, garde, constats, mode) {
  let avant;
  try {
    if (mode !== undefined && !MODES.has(mode)) {
      throw new Error(`${MODE}=${mode} : les modes sont « inscrire » et « elaguer ».`);
    }
    avant = lire(racine);
  } catch (e) {
    return { refus: [{ message: e.message }, ...constats], lignes: [] };
  }
  let dette = avant;
  const lignes = [];
  if (mode) {
    dette =
      mode === 'inscrire' ? inscrire(avant, garde, constats) : elaguer(avant, garde, constats);
    const f = path.join(racine, FICHIER);
    if (JSON.stringify(dette) !== JSON.stringify(avant)) {
      const triee = Object.fromEntries(
        Object.keys(dette)
          .sort()
          .map(g => [g, dette[g]])
      );
      writeFileSync(f, `${JSON.stringify(triee, null, 2)}\n`);
      lignes.push(
        `📝 ${FICHIER} : la dette de ${garde} est ${mode === 'inscrire' ? 'inscrite' : 'élaguée'}.`
      );
    }
  }
  const { refus, depasses, corriges, tus } = juger(dette, garde, constats);
  for (const d of depasses) {
    lignes.push(
      `⛔ ${garde} : ${d.fichier} · ${d.regle} — ${d.trouve} constat(s) pour ${d.inscrit} inscrit(s) dans ${FICHIER} : un constat est neuf.`
    );
  }
  for (const c of corriges) {
    lignes.push(
      `⚠️  ${garde} : ${c.fichier} · ${c.regle} — ${c.trouve} constat(s) pour ${c.inscrit} inscrit(s) dans ${FICHIER} : npm run grillhouse:dette:elaguer retire ce qui est corrigé.`
    );
  }
  if (tus > 0)
    lignes.push(`ℹ️  ${garde} : ${tus} constat(s) connu(s), inscrit(s) dans ${FICHIER}.`);
  return { refus, lignes };
}
