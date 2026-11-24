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
// - A debt comes down by the lot that resorbs it, on what the run measured: a guard that reads a
//   part of the repository says which files it read (`mesure`), and a run in the envelope of a
//   plan measures the files of the plan's packages alone, whatever its guard reads
//   (`mesureDuPlan`); the keys of the other files are neither judged corrected, nor noted, nor
//   pruned, nor written again. A pass out of any envelope (the final pass) measures them.
//
// A project's guard imports `trancher` by the package's entry `@roomi-fields/grillhouse/dette`,
// its types in ./dette.d.ts (docs/ARCHITECTURE.md, the package's named entries).
//
// The mechanism: docs/architecture/tests.md §2.6, §4.1 and §5.5.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { paquetsDeLEnveloppe } from './enveloppe/paquets-du-plan.mjs';
import { A_DEPLACER, A_ELAGUER, A_INSCRIRE, ecrireSarif } from './resultats.mjs';

// The environment variable that names the guards of the lot's base (main), a JSON list.
export const BASE = 'GRILLHOUSE_GARDES_DE_LA_BASE';

export const FICHIER = 'grillhouse-dette.json';
// The environment variable that names the mode of a run: `inscrire` or `elaguer`.
export const MODE = 'GRILLHOUSE_DETTE';
const MODES = new Set(['inscrire', 'elaguer']);

const inscriptible = c => Boolean(c.fichier && c.regle);

// The findings counted per file and rule: Map fichier → Map regle → count.
function compter(constats) {
  const out = new Map();
  for (const c of constats.filter(inscriptible)) {
    if (!out.has(c.fichier)) {
      out.set(c.fichier, new Map());
    }
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
  if (!existsSync(f)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    throw new Error(`${FICHIER} n'est pas un JSON lisible : ${e.message}`);
  }
}

// Every file is measured: the answer of a guard that reads the whole repository.
const TOUT = () => true;

/**
 * Whether a run at <racine> in <env> measures the file <fichier> (from the root) for the known
 * debt: every file out of an envelope; in the envelope of a plan (`GRILLHOUSE_ENVELOPPE`,
 * scripts/enveloppe/paquets-du-plan.mjs), a file under a path the plan names, every file when the
 * plan names the root. The copy of a plan holds what its packages need, not what the others do
 * (their builds, their shared test material): what a guard reads of them there is no measure of
 * their debt, as `eslint --prune-suppressions` prunes the files it linted only.
 * @param {string} racine
 * @param {Record<string, string | undefined>} [env]
 * @returns {(fichier: string) => boolean}
 */
export function mesureDuPlan(racine, env = process.env) {
  const plan = paquetsDeLEnveloppe(env);
  if (plan === null) {
    return TOUT;
  }
  const base = path.resolve(racine);
  const dossiers = plan.map(p => path.resolve(base, p));
  if (dossiers.includes(base)) {
    return TOUT;
  }
  return fichier => {
    const f = path.resolve(base, fichier);
    return dossiers.some(d => f === d || f.startsWith(d + path.sep));
  };
}

// The keys of the section <ancienne> of a guard, as counts, that a run did not measure (<mesure>,
// whether it read a file): a guard that reads a part of the repository (the components of a plan,
// in an envelope) knows nothing of the others, as a baseline of PHPStan is pruned of the files
// analysed only.
function nonMesurees(ancienne, mesure) {
  const out = new Map();
  for (const [fichier, regles] of Object.entries(ancienne)) {
    if (!mesure(fichier)) {
      out.set(fichier, new Map(Object.entries(regles).map(([regle, { count }]) => [regle, count])));
    }
  }
  return out;
}

// <dette> with the section of <garde> replaced by what <constats> count in the files the run
// measured (<mesure>), the keys of the others kept as they are, whatever the guard finds there;
// the guard leaves the file when nothing remains.
export function inscrire(dette, garde, constats, mesure = TOUT) {
  const { [garde]: ancienne = {}, ...reste } = dette;
  const mesures = constats.filter(c => !c.fichier || mesure(c.fichier));
  const comptes = new Map([...compter(mesures), ...nonMesurees(ancienne, mesure)]);
  return comptes.size ? { ...reste, [garde]: section(comptes) } : reste;
}

// <dette> with each count of <garde> lowered to what <constats> count, the keys at zero dropped;
// a count never rises and no key is added. The keys of the files the run did not measure
// (<mesure>) stay as they are.
export function elaguer(dette, garde, constats, mesure = TOUT) {
  const { [garde]: ancienne = {}, ...reste } = dette;
  const comptes = compter(constats);
  const garde2 = nonMesurees(ancienne, mesure);
  for (const [fichier, regles] of Object.entries(ancienne)) {
    if (!mesure(fichier)) {
      continue;
    }
    for (const [regle, { count }] of Object.entries(regles)) {
      const n = Math.min(count, comptes.get(fichier)?.get(regle) ?? 0);
      if (n === 0) {
        continue;
      }
      if (!garde2.has(fichier)) {
        garde2.set(fichier, new Map());
      }
      garde2.get(fichier).set(regle, n);
    }
  }
  return garde2.size ? { ...reste, [garde]: section(garde2) } : reste;
}

// <constats> of <garde> judged against <dette>: `refus` the findings the guard refuses (those
// without key, and every finding of a key beyond its count), `depasses` the keys beyond a non-zero
// count, `corriges` the keys inscribed above what is found, among the files the run measured
// (<mesure>), `tus` the number of findings the debt covers.
export function juger(dette, garde, constats, mesure = TOUT) {
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
      if (inscrit > 0 && trouve > inscrit) {
        depasses.push({ fichier, regle, trouve, inscrit });
      }
    }
  }
  const corriges = [];
  for (const [fichier, regles] of Object.entries(inscrite)) {
    if (!mesure(fichier)) {
      continue;
    }
    for (const [regle, { count }] of Object.entries(regles)) {
      const trouve = comptes.get(fichier)?.get(regle) ?? 0;
      if (trouve < count) {
        corriges.push({ fichier, regle, trouve, inscrit: count });
      }
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
// each with its file, its line when the guard gives one, and its rule; beside them, each key
// inscribed above what the guard finds is a note (`a-elaguer`, level `note`), no red, by which the
// circuit lowers the debt d'office at the final pass (scripts/circuit.mjs, 4.2). A guard that
// reads a part of the repository gives <mesure>, whether it read a file (from the root), and a run
// in the envelope of a plan measures the files of its packages alone (`mesureDuPlan`): the keys
// of the others are neither judged corrected, nor pruned, nor written again.
export function trancher(
  racine,
  garde,
  constats,
  mode = process.env[MODE] || undefined,
  env,
  mesure = TOUT
) {
  const lEnv = env ?? process.env;
  const duPlan = mesureDuPlan(racine, lEnv);
  const { refus, lignes, corriges } = juge(
    racine,
    garde,
    constats,
    mode,
    fichier => mesure(fichier) && duPlan(fichier)
  );
  const notes = corriges.map(c => ({
    fichier: c.fichier,
    regle: c.regle,
    niveau: 'note',
    genre: A_ELAGUER,
    trouve: c.trouve,
    message: `${c.trouve} constat(s) pour ${c.inscrit} inscrit(s) dans ${FICHIER} : la dette s'abaisse.`,
  }));
  ecrireSarif({
    garde,
    constats: [...refus, ...notes, ...aInscrire(racine, garde, refus, lEnv)],
    racine,
    env: lEnv,
  });
  return { refus, lignes };
}

// The guards of the lot's base (main), a JSON list of names the circuit gives the run; undefined
// without it (a project's run) or when it is not a list.
function gardesDeLaBase(env) {
  try {
    const l = JSON.parse(env[BASE] ?? 'null');
    return Array.isArray(l) ? l : undefined;
  } catch {
    return undefined;
  }
}

// Whether <script>, the one that runs a guard (`argv[1]`), is a file of the project that HEAD holds: a
// guard of the project (its script `gardes`, which imports `trancher`) is a guard of main though
// the circuit's list of names, read from the frame's guards, never names it. A script out of the
// project, or one HEAD does not hold, says nothing.
export function scriptDeLaBase(racine, script, env = process.env) {
  if (!script) {
    return false;
  }
  const rel = path.relative(path.resolve(racine), path.resolve(script));
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).includes('node_modules')) {
    return false;
  }
  return (
    spawnSync('git', ['-C', racine, 'cat-file', '-e', `HEAD:${rel.split(path.sep).join('/')}`], {
      env,
      stdio: 'ignore',
    }).status === 0
  );
}

// The notes « to inscribe » of <garde> when the base does not hold it: one per file and rule of
// its refusals, with its count. None for a guard of main (its name in the base's list, or its
// script in HEAD), nor without a base to compare with.
function aInscrire(racine, garde, refus, env) {
  const base = gardesDeLaBase(env);
  if (!base || base.includes(garde) || scriptDeLaBase(racine, process.argv[1], env)) {
    return [];
  }
  const out = [];
  for (const [fichier, regles] of compter(refus)) {
    for (const [regle, trouve] of regles) {
      out.push({
        fichier,
        regle,
        niveau: 'note',
        genre: A_INSCRIRE,
        trouve,
        message: `${trouve} constat(s) d'une garde que le lot ajoute : la dette de ${garde} s'inscrit dans ${FICHIER}.`,
      });
    }
  }
  return out;
}

// Writes <dette> at <racine>, its guards sorted.
function ecrire(racine, dette) {
  const triee = Object.fromEntries(
    Object.keys(dette)
      .sort()
      .map(g => [g, dette[g]])
  );
  writeFileSync(path.join(racine, FICHIER), `${JSON.stringify(triee, null, 2)}\n`);
}

// The files the working copy at <racine> renames or moves against HEAD, `{ nouveau: ancien }`, as
// git detects them (`-M`, half the content kept) on a throwaway index that holds the new files too:
// the lot as the circuit commits it. `{}` when git fails (not a repository, no commit).
export function renommesDuCommit(racine) {
  const dossier = mkdtempSync(path.join(tmpdir(), 'dette-index-'));
  try {
    const env = { ...process.env, GIT_INDEX_FILE: path.join(dossier, 'index') };
    const git = (...a) =>
      spawnSync('git', ['-C', racine, ...a], { encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024 });
    if (git('read-tree', 'HEAD').status !== 0 || git('add', '-A').status !== 0) {
      return {};
    }
    const r = git('diff', '--cached', '-M', '--name-status', '-z', 'HEAD');
    if (r.status !== 0) {
      return {};
    }
    const out = {};
    const t = r.stdout.split('\0');
    for (let i = 0; i < t.length; i++) {
      if (t[i].startsWith('R')) {
        out[t[i + 2]] = t[i + 1];
        i += 2;
      } else if (t[i]) {
        i += 1;
      }
    }
    return out;
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

// <dette> with the keys of each moved file (`{ nouveau: ancien }`) carried to its new path, in every
// guard: the debt of the former name is the new one's, added to what it already holds.
export function deplacer(dette, renommes) {
  for (const section of Object.values(dette)) {
    for (const [nouveau, ancien] of Object.entries(renommes)) {
      if (!section[ancien]) {
        continue;
      }
      const cible = (section[nouveau] ??= {});
      for (const [regle, { count }] of Object.entries(section[ancien])) {
        cible[regle] = { count: count + (cible[regle]?.count ?? 0) };
      }
      delete section[ancien];
    }
  }
  return dette;
}

// The debt at <racine> lowered by <notes>, each `{ garde, fichier, regle, trouve }` (the notes
// `a-elaguer` of a pass, scripts/resultats.mjs): each key named comes down to what its guard
// found, and leaves at zero; a count never rises, no key is added. Written when it changes;
// returns whether it did.
export function abaisser(racine, notes) {
  const avant = lire(racine);
  // The keys of the files the lot moves come first, so that the notes find them at their new path.
  const dette = deplacer(JSON.parse(JSON.stringify(avant)), renommesDuCommit(racine));
  for (const { garde, fichier, regle, trouve, genre } of notes) {
    if (genre === A_DEPLACER) {
      continue;
    }
    if (genre === A_INSCRIRE) {
      if (fichier && regle && Number.isInteger(trouve) && trouve > 0) {
        dette[garde] ??= {};
        dette[garde][fichier] ??= {};
        dette[garde][fichier][regle] = { count: trouve };
      }
      continue;
    }
    const parRegle = dette[garde]?.[fichier];
    const cle = parRegle?.[regle];
    if (!cle || !Number.isInteger(trouve) || trouve >= cle.count) {
      continue;
    }
    if (trouve > 0) {
      cle.count = trouve;
      continue;
    }
    delete parRegle[regle];
    if (!Object.keys(parRegle).length) {
      delete dette[garde][fichier];
    }
    if (!Object.keys(dette[garde]).length) {
      delete dette[garde];
    }
  }
  const change = JSON.stringify(dette) !== JSON.stringify(avant);
  if (change) {
    ecrire(racine, dette);
  }
  return change;
}

function juge(racine, garde, constats, mode, mesure) {
  let avant;
  try {
    if (mode !== undefined && !MODES.has(mode)) {
      throw new Error(`${MODE}=${mode} : les modes sont « inscrire » et « elaguer ».`);
    }
    avant = lire(racine);
  } catch (e) {
    return { refus: [{ message: e.message }, ...constats], lignes: [], corriges: [] };
  }
  let dette = avant;
  const lignes = [];
  if (mode) {
    dette =
      mode === 'inscrire'
        ? inscrire(avant, garde, constats, mesure)
        : elaguer(avant, garde, constats, mesure);
    if (JSON.stringify(dette) !== JSON.stringify(avant)) {
      ecrire(racine, dette);
      lignes.push(
        `📝 ${FICHIER} : la dette de ${garde} est ${mode === 'inscrire' ? 'inscrite' : 'élaguée'}.`
      );
    }
  }
  const { refus, depasses, corriges, tus } = juger(dette, garde, constats, mesure);
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
  if (tus > 0) {
    lignes.push(`ℹ️  ${garde} : ${tus} constat(s) connu(s), inscrit(s) dans ${FICHIER}.`);
  }
  return { refus, lignes, corriges };
}

// `node dette.mjs --abaisser <notes.json>`: the debt of the working directory lowered by the notes
// of a pass, a JSON list (abaisser), as `prettier --write` writes and judges nothing: 0 once
// written or left as it is, 1 only on a real failure (a file it cannot read).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [option, notes] = process.argv.slice(2);
  if (option !== '--abaisser' || !notes) {
    process.stderr.write('Usage : node dette.mjs --abaisser <notes.json>\n');
    process.exitCode = 2;
  } else {
    try {
      const fait = abaisser(process.cwd(), JSON.parse(readFileSync(notes, 'utf8')));
      process.stdout.write(
        `${fait ? `📝 ${FICHIER} : la dette est abaissée.` : `${FICHIER} : rien à abaisser.`}\n`
      );
    } catch (e) {
      process.stderr.write(`${e instanceof Error ? e.message : e}\n`);
      process.exitCode = 1;
    }
  }
}
