// The CI of main, read after the lots entered, as Google's TAP plays the whole suite after the
// submit, by batches of changes, and a red looks for its culprit among the lots entered since the
// last green. A lot enters main on its final pass (scripts/integration/file.mjs); the CI plays on
// main on an hourly schedule, and this module reads it:
//
// - `lireLaCiDeMain`: the latest finished pass of each workflow of the branch (`gh run list`),
//   green when every one succeeded, red as soon as one failed (any conclusion but `success`,
//   `cancelled` and `skipped`: a cancelled pass is replaced by a later one, the one before it
//   decides, and a skipped pass judged nothing, as the flow that alerts on a red one, which skips
//   itself on a green), and not
//   read, never silence, when gh fails, does not start, answers garbage or no pass at all.
// - `lotsDepuisLeVert`: the lots of the circuit between the last green and the tip, by git alone
//   (the commits whose subject ends with « (<ticket>) »), no state kept.
// - `alerteDeLaCiDeMain` and `ligneDeLaCiDeMain`: what is told to the supervisor and shown on the
//   board; a green gives no alert, it clears.
// - `ouvrirLeDefautDeMain`: the defect ticket a red opens under `a-valider`, for the owner, which
//   names the red pass and the candidate lots; the search of the culprit is that ticket, which the
//   supervisor launches in the circuit. A lot already closed stays closed.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { git, sortie } from './etat-du-depot.mjs';
import { lacherVerrou, prendreVerrou } from './verrou-de-fichier.mjs';

const COURT = 7;
const court = sha => String(sha).slice(0, COURT);
const uneLigne = t => String(t).replace(/\s+/g, ' ').trim();

/**
 * The CI of the branch <branche> (main by default) read with <o.gh> in <o.racine>: `{ etat: 'verte',
 * commit, passage }`, `{ etat: 'rouge', flux, passage, commit, vert }` (the workflow, its red pass,
 * the commit of that pass and the commit of the last green pass of the same workflow, null when it
 * never succeeded) or `{ etat: 'non-lue', raison }`.
 */
export function lireLaCiDeMain(o, { branche = 'main' } = {}) {
  const r = o.gh([
    'run',
    'list',
    '--branch',
    branche,
    '--limit',
    '100',
    '--json',
    'databaseId,status,conclusion,workflowName,headSha',
  ]);
  if (r.error) {
    return { etat: 'non-lue', raison: `gh ne se lance pas (${r.error.code ?? r.error.message}).` };
  }
  if (r.status !== 0) {
    return { etat: 'non-lue', raison: `gh run list refuse :\n${`${r.stderr}${r.stdout}`.trim()}` };
  }
  let passages;
  try {
    passages = JSON.parse(r.stdout || '[]');
  } catch {
    return {
      etat: 'non-lue',
      raison: `gh run list rend une sortie illisible :\n${r.stdout.trim()}`,
    };
  }
  const finis = (Array.isArray(passages) ? passages : [])
    .filter(
      p =>
        p?.databaseId &&
        p.workflowName &&
        p.status === 'completed' &&
        p.conclusion !== 'cancelled' &&
        p.conclusion !== 'skipped'
    )
    .sort((a, b) => b.databaseId - a.databaseId);
  if (finis.length === 0) {
    return { etat: 'non-lue', raison: `aucun passage fini de la CI sur ${branche}.` };
  }
  const derniers = [...new Set(finis.map(p => p.workflowName))].map(nom =>
    finis.find(p => p.workflowName === nom)
  );
  const rouge = derniers.find(p => p.conclusion !== 'success');
  if (rouge) {
    const vert = finis.find(p => p.workflowName === rouge.workflowName && p.conclusion === 'success');
    return {
      etat: 'rouge',
      flux: rouge.workflowName,
      passage: String(rouge.databaseId),
      commit: rouge.headSha,
      vert: vert?.headSha ?? null,
    };
  }
  const tete = derniers[0];
  return { etat: 'verte', commit: tete.headSha, passage: String(tete.databaseId) };
}

// The ticket a subject « … (<ticket>) » of the circuit's commits ends with, null otherwise.
const TICKET = /\(([A-Za-z0-9]+-[A-Za-z0-9.]+)\)\s*$/;

/**
 * The lots of the circuit entered on main since the last green <vert> up to <pointe>, oldest first:
 * `{ commit, ticket, titre }`, read by git in <racine>. Empty at the last green itself, without a
 * last green, or when it is no ancestor of the tip (a history rewritten) or unknown.
 */
export function lotsDepuisLeVert(racine, { vert, pointe }) {
  if (!vert || vert === pointe) {
    return [];
  }
  if (git(racine, ['merge-base', '--is-ancestor', vert, pointe]).status !== 0) {
    return [];
  }
  const l = sortie(racine, ['log', '--reverse', '--format=%H%x09%s', `${vert}..${pointe}`]);
  if (!l) {
    return [];
  }
  return l
    .split('\n')
    .map(ligne => {
      const [commit, ...reste] = ligne.split('\t');
      const titre = reste.join('\t');
      const ticket = TICKET.exec(titre)?.[1];
      return ticket ? { commit, ticket, titre } : null;
    })
    .filter(Boolean);
}

/**
 * What a reading tells the supervisor: `{ genre, cle, texte }`, null for a green (the alert clears).
 * A red names the workflow, its pass, its commit and each lot <lots> entered since the last green,
 * then its defect ticket <defaut> (`ouvrirLeDefautDeMain`): the ticket by its number, a ticket open
 * with no number read, or the fault that kept it from opening (its own key, so that the alert with
 * the ticket is given in its turn); a CI not read is the alert « CI de main non lue ».
 */
export function alerteDeLaCiDeMain(lecture, lots, defaut) {
  if (lecture.etat === 'verte') {
    return null;
  }
  if (lecture.etat === 'non-lue') {
    return {
      genre: 'non-lue',
      cle: 'non-lue',
      texte: `CI de main non lue : ${uneLigne(lecture.raison)} Main n'est pas jugé tant que la CI ne se lit pas ; la file continue.`,
    };
  }
  const depuis = lecture.vert
    ? lots.length
      ? `Lots entrés depuis le dernier vert (${court(lecture.vert)}) : ${lots.map(l => l.ticket).join(', ')}.`
      : `aucun lot du circuit entré depuis le dernier vert (${court(lecture.vert)}).`
    : 'aucun vert connu pour ce flux : les lots entrés ne se nomment pas.';
  const sans = Boolean(defaut?.faute);
  const defautDit = !defaut
    ? ''
    : sans
      ? ` Le ticket de défaut n'a pas pu s'ouvrir : ${uneLigne(defaut.faute)} Chaque relevé retente.`
      : defaut.ticket
        ? ` La recherche du coupable est le ticket de défaut ${defaut.ticket}, ouvert pour le responsable.`
        : ` Un ticket de défaut est ouvert pour le responsable (son numéro ne s'est pas lu).`;
  return {
    genre: 'rouge',
    cle: sans ? `rouge ${lecture.passage} sans ticket` : `rouge ${lecture.passage}`,
    texte: `CI de main rouge : ${lecture.flux}, passage ${lecture.passage} (commit ${court(lecture.commit)}). ${depuis} La file continue d'avancer main.${defautDit}`,
  };
}

/** The line of the board: the last green, the red with its workflow, pass and last green, or the CI not read. */
export function ligneDeLaCiDeMain(lecture) {
  if (lecture.etat === 'verte') {
    return `CI de main verte (${court(lecture.commit)})`;
  }
  if (lecture.etat === 'non-lue') {
    return `CI de main non lue : ${uneLigne(lecture.raison)}`;
  }
  return `CI de main rouge : ${lecture.flux}, passage ${lecture.passage}, dernier vert ${lecture.vert ? court(lecture.vert) : 'aucun vert'}`;
}

const A_VALIDER = 'a-valider';
const titreDuDefaut = l => `CI de main rouge — ${l.flux}, passage ${l.passage}`;

/**
 * The defect ticket a red <lecture> opens under `a-valider` with the tools <o> (`bd` of the
 * project): its title names the workflow and the red pass, its description the commit and each
 * candidate lot <lots>. One ticket per pass, closed or not: a pass that already has its ticket opens
 * none. The queue and the supervisor's reading both open it through this function, and the search
 * of a doublon and the creation are played under a file lock of the project <o.racine>, so that
 * two openings at once make one ticket. A green or a CI not read opens none (the alert says it, no
 * defect is proven). `{ ouvert, ticket, faute? }`: `ticket` is the number of the ticket created
 * (read on the output of the creation) or already holding the pass, null when none is readable; a
 * creation Beads refuses is a fault named.
 */
export function ouvrirLeDefautDeMain(o, lecture, lots) {
  if (lecture.etat !== 'rouge') {
    return { ouvert: false, ticket: null };
  }
  const verrou = path.join(o.racine, '.claude', 'worktrees', 'ci-de-main-defaut.verrou');
  try {
    mkdirSync(path.dirname(verrou), { recursive: true });
  } catch {
    // the lock is then taken without its directory and fails: the creation goes on unlocked
  }
  let pris = false;
  try {
    pris = prendreVerrou(verrou, { attendre: true });
  } catch {
    // a lock that cannot be taken costs the race guard, not the ticket
  }
  try {
    return ouvrirSousVerrou(o, lecture, lots);
  } finally {
    if (pris) {
      lacherVerrou(verrou);
    }
  }
}

function ouvrirSousVerrou(o, lecture, lots) {
  const titre = titreDuDefaut(lecture);
  const existants = o.bd('list', '--all', '--label', A_VALIDER, '--limit', '0', '--json');
  if (existants.status === 0) {
    try {
      const l = JSON.parse(existants.stdout || '[]');
      const deja = (Array.isArray(l) ? l : []).find(t => t?.title === titre);
      if (deja) {
        return { ouvert: false, ticket: deja.id ?? null, doublon: deja.id };
      }
    } catch {
      // A list that does not read opens the ticket: a doublon is the lesser fault.
    }
  }
  const candidats = lots.length
    ? lots.map(l => `- ${l.ticket} (${court(l.commit)}) : ${l.titre}`).join('\n')
    : "- aucun lot du circuit entré depuis le dernier vert (ou aucun vert connu).";
  const description = [
    `Le flux ${lecture.flux} de la CI de main est rouge : passage ${lecture.passage}, commit ${court(lecture.commit)}${lecture.vert ? `, dernier vert ${court(lecture.vert)}` : ', aucun vert connu'}.`,
    '',
    'Lots candidats (entrés sur main depuis le dernier vert) :',
    candidats,
    '',
    'La recherche du coupable est ce ticket, que le superviseur lance dans le circuit. Un lot fautif déjà fermé reste fermé : son correctif ou son retrait est un ticket neuf. Ce défaut reste ouvert tant que ce ticket n’est pas fermé.',
  ].join('\n');
  const r = o.bd(
    'create',
    titre,
    '--type',
    'bug',
    '--labels',
    A_VALIDER,
    '--description',
    description,
    '--silent'
  );
  if (r.status !== 0) {
    return {
      ouvert: false,
      ticket: null,
      faute: `bd create refuse : ${uneLigne(`${r.stderr ?? ''}${r.stdout ?? ''}`)}`,
    };
  }
  const numero = /^([A-Za-z0-9]+-[A-Za-z0-9.]+)$/.exec(String(r.stdout ?? '').trim())?.[1];
  return { ouvert: true, ticket: numero ?? null };
}

// `bd` run in the project at <racine>, found on the PATH as the project's own.
export const bdDans =
  racine =>
  (...args) =>
    spawnSync('bd', args, { cwd: racine, env: process.env, encoding: 'utf8', timeout: 60_000 });

// The GitHub CLI run in the main tree <racine>.
export const ghDans =
  racine =>
  (args, options = {}) =>
    spawnSync('gh', args, {
      cwd: racine,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30_000,
      ...options,
    });

// How long a reading of the CI of main stays as read, for the board and the greffon, which ask
// again and again: the CI plays hourly, GitHub need not be asked at each refresh.
const VALIDITE_DE_LA_LECTURE = 5 * 60_000;

/**
 * The CI of main of the project at <racine> as the board and the supervisor read it, kept for five
 * minutes in `.claude/worktrees/ci-de-main-lue.json`; null for a project with no CI to read (no
 * workflow in its main tree, no remote `origin`), which shows and says nothing.
 */
export function ciDeMainGardee(
  racine,
  { maintenant = Date.now(), gh = ghDans(racine), validite = VALIDITE_DE_LA_LECTURE } = {}
) {
  if (!existsSync(path.join(racine, '.github', 'workflows')) || !sortie(racine, ['remote', 'get-url', 'origin'])) {
    return null;
  }
  const f = path.join(racine, '.claude', 'worktrees', 'ci-de-main-lue.json');
  try {
    const lu = JSON.parse(readFileSync(f, 'utf8'));
    if (lu?.lecture && maintenant - lu.a < validite) {
      return lu.lecture;
    }
  } catch {
    // none yet, or unreadable: read again
  }
  const lecture = lireLaCiDeMain({ racine, gh });
  try {
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, `${JSON.stringify({ a: maintenant, lecture })}\n`);
  } catch {
    // not kept: the next reading asks again
  }
  return lecture;
}

/**
 * The alert of a <lecture> of the CI of the project at <racine>, its lots named by git up to the
 * tip of its main tree: `{ genre, cle, texte }`, null for a green.
 */
export function alerteDuProjet(racine, lecture, defaut) {
  return alerteDeLaCiDeMain(lecture, lotsDuProjet(racine, lecture), defaut);
}

/** The lots entered since the last green of a red <lecture>, up to the tip of the tree at <racine>. */
export function lotsDuProjet(racine, lecture) {
  if (lecture.etat !== 'rouge') {
    return [];
  }
  const pointe = sortie(racine, ['rev-parse', 'HEAD']);
  return pointe ? lotsDepuisLeVert(racine, { vert: lecture.vert, pointe }) : [];
}

/**
 * The CI of main read for the supervisor at <racine>, its defect ticket opened by the same function
 * as the queue's (`ouvrirLeDefautDeMain`, in this project, with its own Beads): the alert, null for
 * a green, undefined for a project with no CI to read. Only the supervisor's reading calls it, the
 * board reads `ciDeMainGardee` alone.
 */
export function lireEtOuvrirLeDefautDeMain(racine, { gh } = {}) {
  const lecture = ciDeMainGardee(racine, gh ? { gh } : {});
  if (!lecture) {
    return undefined;
  }
  const defaut =
    lecture.etat === 'rouge'
      ? ouvrirLeDefautDeMain({ racine, bd: bdDans(racine) }, lecture, lotsDuProjet(racine, lecture))
      : undefined;
  return alerteDuProjet(racine, lecture, defaut);
}
