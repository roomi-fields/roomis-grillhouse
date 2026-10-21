#!/usr/bin/env node
// The bilan of a ticket: its figures first, as a blameless post-mortem of Google SRE opens, measured
// as BuildBuddy measures a build from its events, its wall time a lead time of DORA. The circuit
// (scripts/circuit.mjs) writes it at the ticket at each of its ends; the board shows its key
// figures on the ticket's card.
//
//   node scripts/bilan.mjs <ticket> [--garder]
//
// prints the bilan of <ticket>, read from the main tree of the current directory; `--garder` keeps
// it too, as the circuit does, so the next ticket's bilan compares itself with it.
//
// - Its sources are structured results, never a text (tests/unit/circuit-sans-texte-libre.spec.ts):
//   the register of finished agents (`~/.claude/grillhouse/registre.jsonl`, GRILLHOUSE_REGISTRE
//   replaces it), each agent's latest line on the ticket (its project the main tree, or a folder
//   of it), its turns, its tokens, its cache reads and its cost, and the lines of the role
//   `circuit` of the steps the circuit leads itself; the results the circuit keeps,
//   `.claude/worktrees/<ticket>.fiches.jsonl`, each with its time: the sheet of each session (`{
//   role, composant, fiche }`), the outcome of each proof (`resultat`: `ok`, its counts, `vide`)
//   and of each check (`resultat`: `issue` vert, rouge or a-repasser, `finale`), each stop
//   (`arret`, its name, `finale`), each developpeur resumed who changed nothing (`inchange`), the
//   end of each questioning (`questionnement`: its `objet`, plan or decision, its `tours`, whether
//   it changed the proposal, `change`, and its `issue`, AUCUNE, DÉSACCORD or MONTE); the
//   authors and times of the ticket's comments (`bd comments --json`), never their text; the
//   circuit's state, `.claude/worktrees/<ticket>.circuit.json`, for where the circuit ended. Every
//   agent declares nothing: the bilan measures.
// - The steps and the roles are those of scripts/etapes.mjs. Only the circuit's roles count: an
//   exploration, before the circuit, is out of it.
// - The window: from the first turn of a session or a step to the last result of the circuit or
//   the last turn; its length is the wall time.
// - Each turn of a session and each step finds its result: a step, the last outcome or stop of
//   its step and component kept during it; a session, the first sheet of its role kept after its
//   turn, before the next turn of any other, which names its component. A step `controles` whose
//   outcome or stop is the final pass's (`finale`) is the final pass.
// - The categories, each instant once:
//   - travail resté au lot: a session that delivered, the reviewer's included;
//   - relance sans effet: a developer whose session the circuit follows with a stop
//     « sans-livraison » or a resumption that changed nothing (`inchange`); a tester whose next
//     proof finds the lot of the proof before it (the same counts of reds, greens of the lot,
//     broken files and greens of HEAD), after a refused proof, or no file of the lot (`vide`:
//     reds that exist already or of a build alone, no green of the lot); that proof; checks that
//     play the same red again on a component none of its agents delivered to since its checks
//     before (the final pass: none of any component's since the final pass before);
//   - régulateur: a session of the arbitrage, out of the wait, the author's answers to the
//     questionneur among them;
//   - questionnement: a session of the questionneur (kept: a look that did not write the
//     proposal, as a review);
//   - attente humaine: from a question of the regulator (its sheet's `decision` MONTE) to the next
//     comment at the ticket whose author is not the circuit, or to the next turn, the first of
//     the two;
//   - étapes automatiques: the other steps the circuit leads, the final passes among them;
//   - rejeu d'étapes déjà vertes: the same, on a lot unchanged since green: checks green again,
//     a tester run again on a proven lot, its proof;
//   - entre deux étapes: the rest of the window.
//   What is lost is the wall time out of the work and the automatic steps.
// - The bilan counts the sessions by role, the steps by their titles, the stops by kind (`arret`),
//   the regulator's questions, the rounds of questioning, the proposals they changed and those
//   they sent up to the supervisor, the tokens, the cache reads and the cost (a session without a cost
//   counts 0); a session's tokens go to its turns by their time.
// - It is kept in the main tree, `.claude/worktrees/<ticket>.bilan.json`, and compares itself with
//   the latest bilan kept for another ticket of the project, or with nothing: no figure of
//   another project is written here.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ARBITRAGE,
  etapeDuCircuit,
  etapeDuRole,
  juge,
  nomDuRole,
  QUESTIONNEUR,
  REGULATEUR,
  SUITE,
} from './etapes.mjs';

// The role of a register line that a step of the circuit writes, of its results, and the author
// of its comments.
const CIRCUIT = 'circuit';
// The gap allowed between a result and the turn or step it closes; a comment's time is given to
// the second.
const JEU = 2000;
const MINUTE = 60_000;

// The categories, in the order the text lists them, with their names.
const CATEGORIES = [
  ['travail', 'travail resté au lot'],
  ['sansEffet', 'relance sans effet'],
  ['regulateur', 'régulateur'],
  ['questionnement', 'questionnement'],
  ['attente', 'attente humaine'],
  ['automatique', 'étapes automatiques'],
  ['rejeu', "rejeu d'étapes déjà vertes"],
  ['intervalles', 'entre deux étapes'],
];
// The categories of the time kept: the rest is lost.
const GARDE = new Set(['travail', 'automatique', 'questionnement']);
// The roles of the circuit, by the steps they work at: every step but the exploration, and the
// arbitrage.
const ROLES = new Set([...SUITE, ARBITRAGE].filter(e => e.numero !== '0').flatMap(e => e.qui));

// The results the circuit kept, `{ t, …entrée }`, in their order; an entry without a time counts
// nothing.
function resultats(entrees) {
  return entrees
    .map(e => ({ ...e, t: Date.parse(e.date ?? '') }))
    .filter(e => !Number.isNaN(e.t))
    .sort((x, y) => x.t - y.t);
}

// The signature of a proof's outcome <r>: the counts of its reds, greens of the lot, broken files
// and greens of HEAD.
const signature = r => [r.rouges, r.justifies + r.sans, r.casses, r.anciens].join(',');

// The outcome of a step's result <e>: green, « à repasser », or red; a stop is red, save « à
// repasser ».
const issue = e =>
  e.arret ? (e.arret === 'a-repasser' ? 'a-repasser' : 'rouge') : (e.resultat?.issue ?? 'rouge');

// The length of the union of the intervals <l>.
function longueur(l) {
  let total = 0;
  let fin = -Infinity;
  for (const [d, f] of [...l].sort((x, y) => x[0] - y[0])) {
    if (f <= fin) continue;
    total += f - Math.max(d, fin);
    fin = f;
  }
  return total;
}
// The length of the interval [d, f] shared with the intervals <l>.
const commun = ([d, f], l) =>
  longueur(l.map(([a, b]) => [Math.max(a, d), Math.min(b, f)]).filter(([a, b]) => b > a));

// The bilan of <ticket> from the register's lines <lignes> (of its project), the results the
// circuit kept <entrees> (`<ticket>.fiches.jsonl`), the comments of the ticket <commentaires>
// (`{ author, created_at }`, their text never read) and the circuit's state <etat> (or null).
export function bilan({
  ticket,
  lignes,
  entrees = [],
  commentaires = [],
  etat = null,
  maintenant = Date.now(),
}) {
  // Each agent's latest line on the ticket: it holds all its turns.
  const derniere = new Map();
  for (const l of lignes) {
    if (l.ticket !== ticket || (l.role !== CIRCUIT && !ROLES.has(l.role))) continue;
    const avant = derniere.get(l.agent);
    if (!avant || Date.parse(l.fin) > Date.parse(avant.fin)) derniere.set(l.agent, l);
  }
  const agents = [...derniere.values()];
  // One segment per turn of a session, one per step.
  const segments = agents
    .flatMap(l =>
      (l.tours ?? [[Date.parse(l.debut), Date.parse(l.fin)]]).map(([d, f]) => ({
        l,
        d,
        f,
        role: l.role,
        etape: l.role === CIRCUIT ? l.etape : null,
        composant: l.role === CIRCUIT ? l.composant : null,
      }))
    )
    .filter(s => s.f > s.d)
    .sort((x, y) => x.d - y.d);
  const gardes = resultats(entrees);
  const debut = Math.min(...segments.map(s => s.d), Infinity);
  const fin = Math.max(...segments.map(s => s.f), ...gardes.map(e => e.t), -Infinity);
  const mur = Number.isFinite(debut) && fin > debut ? fin - debut : 0;

  // Each segment and its result: a step's outcome or stop, a session's sheet.
  const duCircuit = gardes.filter(e => e.role === CIRCUIT);
  for (const s of segments) {
    if (s.role === CIRCUIT) {
      s.entree =
        duCircuit.findLast(
          e =>
            (e.resultat || e.arret) &&
            e.etape === s.etape &&
            e.composant === s.composant &&
            e.t >= s.d - JEU &&
            e.t <= s.f + JEU
        ) ?? null;
      s.finale = s.etape === 'controles' && Boolean(s.entree?.resultat?.finale ?? s.entree?.finale);
    } else {
      s.suivant = segments.find(x => x.d >= s.f && x.l !== s.l)?.d ?? Infinity;
      s.entree =
        gardes.find(e => e.role === s.role && e.t >= s.f - JEU && e.t <= s.suivant + JEU) ?? null;
      s.composant = s.entree?.composant ?? null;
    }
  }
  const etapes = segments.filter(s => s.role === CIRCUIT);
  const preuves = etapes.filter(s => s.etape === 'preuve');
  for (const p of preuves) p.preuve = p.entree?.resultat ?? null;
  // A proof and the category it gives the tester before it: the lot unchanged since the proof
  // before, or none.
  const avantLa = p => preuves.findLast(x => x.composant === p.composant && x.f <= p.d);
  const parLaPreuve = p => {
    const avant = avantLa(p);
    if (!p.preuve) return null;
    if (avant?.preuve && signature(avant.preuve) === signature(p.preuve)) {
      return avant.preuve.ok ? 'rejeu' : 'sansEffet';
    }
    return null;
  };
  // Whether the circuit followed the developer's session <s> with a stop « sans-livraison » or a
  // resumption that changed nothing.
  const sansLivraison = s =>
    duCircuit.some(
      e =>
        e.etape === 'developpeur' &&
        e.composant === s.composant &&
        (e.arret === 'sans-livraison' || e.inchange) &&
        e.t >= s.f - JEU &&
        e.t <= s.suivant + JEU
    );

  // The sessions first: the checks read what they delivered.
  for (const s of segments.filter(x => x.role !== CIRCUIT)) {
    if (s.role === QUESTIONNEUR) s.categorie = 'questionnement';
    else if (juge(s.role)) s.categorie = 'regulateur';
    else if (s.role === 'developpeur') {
      s.categorie = sansLivraison(s) ? 'sansEffet' : 'travail';
    } else if (s.role === 'testeur') {
      const p = preuves.find(x => x.composant === s.composant && x.d >= s.f - JEU);
      s.categorie = p ? (parLaPreuve(p) ?? (p.preuve?.vide ? 'sansEffet' : 'travail')) : 'travail';
    } else s.categorie = 'travail';
  }
  // A session that changed a component's lot.
  const livre = s =>
    s.role !== CIRCUIT && s.categorie === 'travail' && etapeDuRole(s.role)?.parComposant;
  for (const s of etapes) {
    if (s.etape === 'preuve') {
      s.categorie = parLaPreuve(s) ?? 'automatique';
    } else if (s.etape === 'controles') {
      const memes = x => x.etape === 'controles' && x.finale === s.finale;
      const avant = etapes.findLast(
        x => memes(x) && x.f <= s.d && (s.finale || x.composant === s.composant)
      );
      const change =
        !avant ||
        segments.some(
          x =>
            livre(x) &&
            x.d >= avant.f - JEU &&
            x.f <= s.d + JEU &&
            (s.finale || x.composant === s.composant)
        );
      const i = s.entree ? issue(s.entree) : 'rouge';
      s.categorie =
        change || !avant.entree || issue(avant.entree) !== i
          ? 'automatique'
          : i === 'vert'
            ? 'rejeu'
            : 'sansEffet';
    } else s.categorie = 'automatique';
  }

  // The waits for the supervisor: from each question of the regulator to the answer.
  const attentes = [];
  let questions = 0;
  for (const q of gardes.filter(e => e.role === REGULATEUR && e.fiche?.decision === 'MONTE')) {
    questions++;
    const reponse = commentaires
      .filter(c => c.author !== CIRCUIT)
      .map(c => Date.parse(c.created_at ?? ''))
      .filter(t => t > q.t)
      .reduce((m, t) => Math.min(m, t), Infinity);
    const tour = segments.find(s => s.d > q.t)?.d ?? Infinity;
    const f = Math.min(reponse, tour, fin);
    if (f > q.t) attentes.push([q.t, f]);
  }

  const vide = () => ({ ms: 0, n: 0, jetons: 0, cache: 0, cout: 0 });
  const categories = Object.fromEntries(CATEGORIES.map(([k]) => [k, vide()]));
  categories.automatique.dontFinales = 0;
  categories.attente = { ...vide(), ms: longueur(attentes), n: attentes.length };
  const fenetre = s => [Math.max(s.d, debut), Math.min(s.f, fin)];
  for (const s of segments) {
    const [d, f] = fenetre(s);
    if (f <= d) continue;
    const ms = f - d - commun([d, f], attentes);
    const c = categories[s.categorie];
    c.ms += ms;
    c.n++;
    if (s.categorie === 'automatique' && s.finale) c.dontFinales += ms;
    if (s.role !== CIRCUIT) {
      // The tokens of a session go to its turns by their time.
      const tout = (s.l.tours ?? [[s.d, s.f]]).reduce((m, [a, b]) => m + b - a, 0) || 1;
      const part = (s.f - s.d) / tout;
      c.jetons += (s.l.jetons ?? 0) * part;
      c.cache += (s.l.cache ?? 0) * part;
      c.cout += (s.l.cout ?? 0) * part;
    }
  }
  categories.intervalles.ms = Math.max(
    0,
    mur - longueur([...segments.map(fenetre).filter(([d, f]) => f > d), ...attentes])
  );
  for (const c of Object.values(categories)) {
    c.jetons = Math.round(c.jetons);
    c.cache = Math.round(c.cache);
  }

  const sessions = agents.filter(l => l.role !== CIRCUIT);
  const parRole = {};
  for (const role of new Set([...SUITE, ARBITRAGE].flatMap(e => e.qui))) {
    const n = sessions.filter(l => l.role === role).length;
    if (n) parRole[role] = n;
  }
  const parEtape = {};
  for (const s of etapes) {
    const e = etapeDuCircuit({ etape: s.etape, finale: s.finale });
    const titre = e?.titre ?? s.etape;
    parEtape[titre] = (parEtape[titre] ?? 0) + 1;
  }
  const arrets = {};
  for (const e of duCircuit.filter(x => x.arret)) arrets[e.arret] = (arrets[e.arret] ?? 0) + 1;
  const finales = etapes.filter(s => s.finale);
  // The ends of the questionings: their rounds, the proposals they changed, those sent up.
  const fins = duCircuit.map(e => e.questionnement).filter(Boolean);
  const questionnement = {
    tours: fins.reduce((m, q) => m + (q.tours ?? 0), 0),
    changees: fins.filter(q => q.change).length,
    montees: fins.filter(q => q.issue !== 'AUCUNE').length,
  };
  const somme = k => sessions.reduce((m, l) => m + (l[k] ?? 0), 0);
  return {
    ticket,
    calcule: new Date(maintenant).toISOString(),
    debut: mur ? new Date(debut).toISOString() : null,
    fin: mur ? new Date(fin).toISOString() : null,
    mur,
    statut: statutDe(etat),
    perdu: CATEGORIES.filter(([k]) => !GARDE.has(k)).reduce((m, [k]) => m + categories[k].ms, 0),
    categories,
    passesFinales: { n: finales.length, ms: finales.reduce((m, s) => m + s.f - s.d, 0) },
    seances: { total: sessions.length, parRole },
    etapes: parEtape,
    arrets,
    questions,
    questionnement,
    jetons: somme('jetons'),
    cache: somme('cache'),
    cout: somme('cout'),
  };
}

// Where the circuit of the state <etat> ended, in words.
function statutDe(etat) {
  if (etat?.etape === 'integre') return 'intégré';
  if (etat?.raison) return `arrêt ${etat.raison}${etat.code != null ? ` (${etat.code})` : ''}`;
  return 'en cours';
}

const minutes = ms => Math.round(ms / MINUTE);
const pourcent = (x, sur) => (sur ? Math.round((100 * x) / sur) : 0);
const dollars = x => (x ?? 0).toFixed(2).replace('.', ',');
const millions = x => ((x ?? 0) / 1e6).toFixed(2).replace('.', ',');

// The key figures of the bilan <b> in one sentence, as the ticket's card shows them.
export const enBref = b =>
  `Bilan : ${minutes(b.mur)} min, ${pourcent(b.perdu, b.mur)} % perdus, ${b.seances.total} séances, ${dollars(b.cout)} $.`;

// The text of the bilan <b> at the ticket, short and in figures, compared with the bilan
// <avant> (another ticket's, or null).
export function texteDuBilan(b, avant) {
  const roles = Object.entries(b.seances.parRole)
    .map(([r, n]) => `${n} ${nomDuRole(r)}`)
    .join(', ');
  const tete = `${b.statut} en ${minutes(b.mur)} min ; ${minutes(b.perdu)} min perdues (${pourcent(b.perdu, b.mur)} %) ; ${b.seances.total} séances${roles ? ` (${roles})` : ''} ; ${dollars(b.cout)} $ ; ${millions(b.jetons)} M jetons, ${millions(b.cache)} M lus du cache.`;
  const paye = new Set(['travail', 'sansEffet', 'regulateur', 'questionnement']);
  const q = b.questionnement ?? { tours: 0, changees: 0 };
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  const lignes = CATEGORIES.map(([k, nom]) => {
    const c = b.categories[k];
    const plus =
      k === 'automatique'
        ? `, dont passes finales ${minutes(c.dontFinales)} min`
        : k === 'attente' && b.questions
          ? ` (${b.questions} question${b.questions > 1 ? 's' : ''})`
          : k === 'questionnement'
            ? `, ${dollars(c.cout)} $ (${pluriel(q.tours, 'tour')}, ${pluriel(q.changees, 'décision')} ${q.changees > 1 ? 'changées' : 'changée'})`
            : paye.has(k)
              ? `, ${dollars(c.cout)} $`
              : '';
    return `- ${nom} : ${minutes(c.ms)} min${plus}`;
  });
  const arrets = Object.entries(b.arrets)
    .sort((x, y) => y[1] - x[1])
    .map(([nom, n]) => `${n} ${nom}`)
    .join(', ');
  const base = avant
    ? `Face au bilan de ${avant.ticket} : mur ${minutes(avant.mur)} → ${minutes(b.mur)} min, perte ${pourcent(avant.perdu, avant.mur)} → ${pourcent(b.perdu, b.mur)} %, séances ${avant.seances.total} → ${b.seances.total}, coût ${dollars(avant.cout)} → ${dollars(b.cout)} $.`
    : "Aucun bilan d'avant dans ce projet : pas de base.";
  return [
    tete,
    ...lignes,
    b.passesFinales.n
      ? `Passes finales : ${b.passesFinales.n}, ${minutes(b.passesFinales.ms)} min.`
      : 'Passes finales : 0.',
    `Arrêts : ${arrets || 'aucun'}.`,
    base,
  ].join('\n');
}

const dossier = racine => path.join(racine, '.claude', 'worktrees');
const SUFFIXE = '.bilan.json';

// Keeps the bilan <b> in the main tree <racine>.
export function garder(racine, b) {
  const f = path.join(dossier(racine), `${b.ticket}${SUFFIXE}`);
  const provisoire = `${f}.${process.pid}`;
  writeFileSync(provisoire, `${JSON.stringify(b, null, 2)}\n`);
  renameSync(provisoire, f);
}

// The bilans kept in the main tree <racine>, by ticket; a file that does not parse is left out.
export function bilansGardes(racine) {
  const d = dossier(racine);
  const out = {};
  if (!existsSync(d)) return out;
  for (const n of readdirSync(d).filter(x => x.endsWith(SUFFIXE))) {
    try {
      const b = JSON.parse(readFileSync(path.join(d, n), 'utf8'));
      if (b?.ticket) out[b.ticket] = b;
    } catch {
      // A torn bilan counts nothing.
    }
  }
  return out;
}

// The latest bilan kept for another ticket than <ticket>, or null.
export function precedent(racine, ticket) {
  return (
    Object.values(bilansGardes(racine))
      .filter(b => b.ticket !== ticket)
      .sort((x, y) => Date.parse(y.calcule ?? 0) - Date.parse(x.calcule ?? 0))[0] ?? null
  );
}

// The lines of the register <texte> of the project at <racine>: its project the main tree, or a
// folder of it, which a session run in that folder may name; a torn line counts nothing.
export function lignesDuProjet(texte, racine) {
  return texte.split('\n').flatMap(x => {
    try {
      const p = String(JSON.parse(x)?.projet ?? '');
      return p === racine || p.startsWith(`${racine}${path.sep}`) ? [JSON.parse(x)] : [];
    } catch {
      return [];
    }
  });
}

// The bilan of <ticket> computed from the main tree <racine>: its register, the results its
// circuit kept, the authors and times of its comments, its circuit's state.
function calculer(racine, ticket) {
  const registre =
    process.env.GRILLHOUSE_REGISTRE ??
    path.join(os.homedir(), '.claude', 'grillhouse', 'registre.jsonl');
  const lignes = lignesDuProjet(existsSync(registre) ? readFileSync(registre, 'utf8') : '', racine);
  const r = spawnSync('bd', ['comments', ticket, '--json'], {
    cwd: racine,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`commentaires de ${ticket} illisibles : ${r.stderr ?? ''}`.trim());
  }
  // Of each comment, its author and its time alone.
  const commentaires = (JSON.parse(r.stdout || '[]') ?? []).map(c => ({
    author: c.author,
    created_at: c.created_at,
  }));
  const fiches = path.join(dossier(racine), `${ticket}.fiches.jsonl`);
  const entrees = (existsSync(fiches) ? readFileSync(fiches, 'utf8') : '')
    .split('\n')
    .flatMap(l => {
      try {
        return l ? [JSON.parse(l)] : [];
      } catch {
        return [];
      }
    });
  const f = path.join(dossier(racine), `${ticket}.circuit.json`);
  let etat = null;
  try {
    etat = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  } catch {
    etat = null;
  }
  return bilan({ ticket, lignes, entrees, commentaires, etat });
}

// The bilan of <ticket> computed, kept in the main tree <racine>, and its text, compared with the
// bilan before it: what the circuit writes at the ticket.
export function ecrireLeBilan(racine, ticket) {
  const b = calculer(racine, ticket);
  const avant = precedent(racine, ticket);
  garder(racine, b);
  return texteDuBilan(b, avant);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [ticket, ...options] = process.argv.slice(2);
  if (!ticket || ticket.startsWith('-')) {
    process.stderr.write('usage: bilan.mjs <ticket> [--garder]\n');
    process.exitCode = 2;
  } else {
    const commun = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8',
    });
    const racine = commun.status === 0 ? path.dirname(commun.stdout.trim()) : process.cwd();
    const b = calculer(racine, ticket);
    process.stdout.write(`${texteDuBilan(b, precedent(racine, ticket))}\n`);
    if (options.includes('--garder')) garder(racine, b);
  }
}
