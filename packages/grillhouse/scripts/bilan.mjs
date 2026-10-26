#!/usr/bin/env node
// The bilan of a ticket: its figures first, as a blameless post-mortem of Google SRE opens, measured
// as BuildBuddy measures a build from its events, its wall time a lead time of DORA. The circuit
// (scripts/circuit.mjs) writes it at the ticket at each of its ends; the board shows its key
// figures on the ticket's card.
//
//   npx grillhouse bilan <ticket> [--garder]
//
// prints the bilan of <ticket>, read from the main tree of the current directory; `--garder` keeps
// it too, as the circuit does, so the next ticket's bilan names it as its base.
//
// - Its sources are structured results, never a text (tests/unit/circuit-sans-texte-libre.spec.ts):
//   the register of finished agents (`~/.claude/grillhouse/registre.jsonl`, GRILLHOUSE_REGISTRE
//   replaces it), each agent's latest line on the ticket (its project the main tree, or a folder
//   of it), its turns, its tokens, its cache reads and its cost, and the lines of the role
//   `circuit` of the steps the circuit leads itself; the results the circuit keeps,
//   `.claude/worktrees/<ticket>.fiches.jsonl`, each with its time: the launch of each session the
//   circuit opens or resumes (`lancement`: its role and its session id, the register line's
//   `agent`), the sheet of each session (`{ role, fiche }`), the outcome of each proof
//   (`resultat`: `ok`, its counts, `vide`) and of each check (`resultat`: `issue` vert, rouge or a-repasser, `finale`, its reds `rouges`), each
//   stop (`arret`, its name, `finale`, the outcome of the checks it stops), each developpeur session that changed no file of the plan (`inchange`), the
//   end of the questioning of the plan (`questionnement`: its `objet`, the questions the
//   questionneur asked, `questions`, whether an answer changed the plan, `change`, its `issue`,
//   AUCUNE, QUESTIONS or DÉSACCORD, and the questions left open, `ouvertes`), each end of a run on
//   a stop (`montee`: its code, its stop and the supervisor's session that ran it, `superviseur`);
//   the circuit's state, `.claude/worktrees/<ticket>.circuit.json`, for where the circuit ended;
//   the night the project declares in its package.json (`grillhouse.plageDeNuit`); the transcript
//   of each supervisor's session a stop names (`~/.claude/projects/<projet>/<séance>.jsonl`), of
//   which the origin and the time of each message, as ccusage measures from the transcripts. It
//   reads no comment of the ticket. Every agent declares nothing: the bilan measures.
// - The steps and the roles are those of scripts/etapes.mjs; a register line's role is read as the
//   board reads it (`roleDeLAgent`: bare, or scoped by the frame's plugin, `grillhouse:<rôle>`, as
//   the register writes it). Only the circuit's roles count, the
//   explorateur of the plan among them. Only the sessions the circuit launched count in
//   the window, the categories, the tokens and the cost; a session of a circuit's role on the
//   ticket the circuit did not launch, the supervisor's, counts apart (`seances.horsCircuit`: its
//   number, by role, its cost).
// - The window: from the first turn of a session or a step to the last result of the circuit or
//   the last turn; its length is the wall time.
// - Each turn of a session and each step finds its result: a step, the last outcome or stop of
//   its step kept during it, before the next step of its name; a session, the first sheet of its
//   role kept after its turn, before the next turn of any other. Every step is one for the whole ticket. A step `controles` whose
//   outcome or stop is the final pass's (`finale`) is the final pass.
// - The categories, each instant once:
//   - travail resté au lot: a session that delivered, the reviewer's included;
//   - relance sans effet: a developer whose session changed no file of the plan (`inchange`, which
//     the circuit measures), whatever stop follows it; a testwriter whose next
//     proof finds the lot of the proof before it (the same counts of reds, greens of the lot,
//     broken files and greens of HEAD), after a refused proof, or no file of the lot (`vide`:
//     reds that exist already or of a build alone, no green of the lot); that proof; checks that
//     play the same measure again (their outcome and their reds) with no delivery of the testwriter or the developpeur since the
//     checks of their kind before (the final pass: since the final pass before);
//   - questionnement: a session of the questionneur (kept: a look that did not write the plan, as
//     a review);
//   - attente du superviseur, attente du responsable, nuit: as the lead time of DORA separates the
//     wait for review from the work, each wait runs from an end of a run on a stop (`montee`) to
//     the first turn of a session or step after it, or the next result of the circuit, the first
//     of the two; it is the owner's when he wrote during it, a message of the person
//     (`origin.kind` « human ») in the supervisor's session the stop names; else the supervisor's;
//     but its part in the night: the hours of
//     `grillhouse.plageDeNuit` in the project's package.json (`{ debut, fin }`, in local time), from 23 h to 8 h without it;
//   - étapes automatiques: the other steps the circuit leads, but the final passes;
//   - passes finales: the final passes, but those without effect or replayed;
//   - rejeu d'étapes déjà vertes: the same, on a lot unchanged since green: checks green again,
//     a testwriter run again on a proven lot, its proof;
//   - entre deux étapes: the rest of the window.
//   What is lost is the wall time out of the work, the questioning, the automatic steps and the
//   final passes. The text gives the wall time and the wall time out of the night spent waiting
//   (« hors nuit d'attente »: a night at work stays in it), the time lost and the time lost out of
//   the waits.
// - The bilan counts the sessions by role, the steps by their titles, the stops by kind (`arret`),
//   the ends on a stop (the waits), the questions of the plan asked, the plans they changed and the
//   questions left open, the tokens, the cache reads and the cost (a session without a cost
//   counts 0); a session's tokens go to its turns by their time.
// - It is kept in the main tree, `.claude/worktrees/<ticket>.bilan.json`, and compares itself with
//   the latest other ticket of the project whose bilan is kept, its bilan computed again by this
//   version from its sources (`precedent`), or with nothing when they give none: no figure kept by
//   an earlier version, and none of another project, is written here.
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { pathToFileURL } from 'node:url';
import {
  AGENTS_DU_LOT,
  etapeDuCircuit,
  nomDuRole,
  QUESTIONNEUR,
  RESPONSABLE,
  roleDeLAgent,
  SUITE,
  SUPERVISEUR,
} from './etapes.mjs';

// The role of a register line that a step of the circuit writes, and of its results.
const CIRCUIT = 'circuit';
// The gap allowed between a result and the turn or step it closes.
const JEU = 2000;
const MINUTE = 60_000;

// The categories, in the order the text lists them, with their names.
const CATEGORIES = [
  ['travail', 'travail resté au lot'],
  ['sansEffet', 'relance sans effet'],
  ['questionnement', 'questionnement'],
  [SUPERVISEUR, 'attente du superviseur'],
  [RESPONSABLE, 'attente du responsable'],
  ['nuit', 'nuit'],
  ['automatique', 'étapes automatiques'],
  ['finales', 'passes finales'],
  ['rejeu', "rejeu d'étapes déjà vertes"],
  ['intervalles', 'entre deux étapes'],
];
// The categories of the time kept: the rest is lost.
const GARDE = new Set(['travail', 'automatique', 'finales', 'questionnement']);
// The categories of the waits: the rest of the time lost is lost out of them.
const ATTENTES = [SUPERVISEUR, RESPONSABLE, 'nuit'];
// The night when the project declares none: from 23 h to 8 h, in local time.
const NUIT = Object.freeze({ debut: 23, fin: 8 });

// The night the project at <racine> declares in its package.json (`grillhouse.plageDeNuit`, `{
// debut, fin }`, hours from 0 to 23 in local time, distinct; a night that crosses midnight has its
// start after its end), else NUIT.
export function plageDeNuit(racine) {
  let p = null;
  try {
    p = JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8'))?.grillhouse
      ?.plageDeNuit;
  } catch {
    p = null;
  }
  const heure = h => Number.isInteger(h) && h >= 0 && h <= 23;
  return heure(p?.debut) && heure(p?.fin) && p.debut !== p.fin
    ? { debut: p.debut, fin: p.fin }
    : NUIT;
}

// The parts of the interval [d, f] in the night <nuit>, each night from its start hour of a day to
// its end hour, of the next day when it crosses midnight, in local time.
function nuits([d, f], nuit) {
  const out = [];
  const jour = new Date(d);
  jour.setHours(0, 0, 0, 0);
  jour.setDate(jour.getDate() - 1);
  while (jour.getTime() < f) {
    const a = new Date(jour);
    a.setHours(nuit.debut);
    const b = new Date(jour);
    if (nuit.fin < nuit.debut) b.setDate(b.getDate() + 1);
    b.setHours(nuit.fin);
    const x = Math.max(a.getTime(), d);
    const y = Math.min(b.getTime(), f);
    if (y > x) out.push([x, y]);
    jour.setDate(jour.getDate() + 1);
  }
  return out;
}
// The roles of the circuit, by the steps they work at.
const ROLES = new Set(SUITE.flatMap(e => e.qui));

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

// What the checks of the result <e> measured: their outcome and their reds (`rouges`, each one's
// place and text), in any order; checks of the same measure played the same thing again.
const laMesure = e => [issue(e), ...[...(e.resultat?.rouges ?? [])].sort()].join('\n');

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
// circuit kept <entrees> (`<ticket>.fiches.jsonl`), the circuit's state <etat> (or null), the
// project's night <nuit> and the times of the owner's messages in the supervisor's sessions the
// stops name <duResponsable>.
export function bilan({
  ticket,
  lignes,
  entrees = [],
  etat = null,
  nuit = NUIT,
  duResponsable = [],
  maintenant = Date.now(),
}) {
  // The sessions the circuit launched, by their id.
  const lancees = new Set(
    entrees.filter(e => e.role === CIRCUIT && e.lancement).map(e => e.lancement.seance)
  );
  // Each agent's latest line on the ticket: it holds all its turns.
  const derniere = new Map();
  for (const x of lignes) {
    const l = { ...x, role: roleDeLAgent(x.role) };
    if (l.ticket !== ticket || (l.role !== CIRCUIT && !ROLES.has(l.role))) continue;
    const avant = derniere.get(l.agent);
    if (!avant || Date.parse(l.fin) > Date.parse(avant.fin)) derniere.set(l.agent, l);
  }
  const hors = [...derniere.values()].filter(l => l.role !== CIRCUIT && !lancees.has(l.agent));
  const agents = [...derniere.values()].filter(l => !hors.includes(l));
  // One segment per turn of a session, one per step.
  const segments = agents
    .flatMap(l =>
      (l.tours ?? [[Date.parse(l.debut), Date.parse(l.fin)]]).map(([d, f]) => ({
        l,
        d,
        f,
        role: l.role,
        etape: l.role === CIRCUIT ? l.etape : null,
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
      // The next step of the same name: its result is not this one's, even within the gap.
      const apres =
        segments.find(x => x.role === CIRCUIT && x.etape === s.etape && x.d > s.d)?.d ?? Infinity;
      s.entree =
        duCircuit.findLast(
          e =>
            (e.resultat || e.arret) &&
            e.etape === s.etape &&
            e.t >= s.d - JEU &&
            e.t <= s.f + JEU &&
            e.t <= apres
        ) ?? null;
      s.finale = s.etape === 'controles' && Boolean(s.entree?.resultat?.finale ?? s.entree?.finale);
    } else {
      s.suivant = segments.find(x => x.d >= s.f && x.l !== s.l)?.d ?? Infinity;
      s.entree =
        gardes.find(e => e.role === s.role && e.t >= s.f - JEU && e.t <= s.suivant + JEU) ?? null;
    }
  }
  const etapes = segments.filter(s => s.role === CIRCUIT);
  const preuves = etapes.filter(s => s.etape === 'preuve');
  for (const p of preuves) p.preuve = p.entree?.resultat ?? null;
  // A proof and the category it gives the testwriter before it: the lot unchanged since the proof
  // before, or none.
  const avantLa = p => preuves.findLast(x => x.f <= p.d);
  const parLaPreuve = p => {
    const avant = avantLa(p);
    if (!p.preuve) return null;
    if (avant?.preuve && signature(avant.preuve) === signature(p.preuve)) {
      return avant.preuve.ok ? 'rejeu' : 'sansEffet';
    }
    return null;
  };
  // Whether the circuit measured that the developer's session <s> changed no file of the plan.
  const inchangee = s =>
    duCircuit.some(
      e => e.etape === 'developpeur' && e.inchange && e.t >= s.f - JEU && e.t <= s.suivant + JEU
    );

  // The sessions first: the checks read what they delivered.
  for (const s of segments.filter(x => x.role !== CIRCUIT)) {
    if (s.role === QUESTIONNEUR) s.categorie = 'questionnement';
    else if (s.role === 'developpeur') {
      s.categorie = inchangee(s) ? 'sansEffet' : 'travail';
    } else if (s.role === 'testwriter') {
      const p = preuves.find(x => x.d >= s.f - JEU);
      s.categorie = p ? (parLaPreuve(p) ?? (p.preuve?.vide ? 'sansEffet' : 'travail')) : 'travail';
    } else s.categorie = 'travail';
  }
  // A session that changed the lot: the testwriter's or the developpeur's, that delivered.
  const livre = s => AGENTS_DU_LOT.includes(s.role) && s.categorie === 'travail';
  for (const s of etapes) {
    if (s.etape === 'preuve') {
      s.categorie = parLaPreuve(s) ?? 'automatique';
    } else if (s.etape === 'controles') {
      const memes = x => x.etape === 'controles' && x.finale === s.finale;
      const avant = etapes.findLast(x => memes(x) && x.f <= s.d);
      const change =
        !avant || segments.some(x => livre(x) && x.d >= avant.f - JEU && x.f <= s.d + JEU);
      const i = s.entree ? issue(s.entree) : 'rouge';
      // The same measure again: the same outcome, and the same reds when the checks kept them.
      const memeMesure =
        avant?.entree &&
        (s.entree ? laMesure(avant.entree) === laMesure(s.entree) : issue(avant.entree) === i);
      s.categorie =
        change || !memeMesure
          ? s.finale
            ? 'finales'
            : 'automatique'
          : i === 'vert'
            ? 'rejeu'
            : 'sansEffet';
    } else s.categorie = 'automatique';
  }

  // The waits: from each end of a run on a stop to the answer, the run after; the owner's when he
  // wrote during it, else the supervisor's.
  const lesAttentes = [];
  for (const e of duCircuit.filter(x => x.montee)) {
    const tour = segments.find(s => s.d > e.t)?.d ?? Infinity;
    const suivant = gardes.find(x => x.t > e.t)?.t ?? Infinity;
    const f = Math.min(tour, suivant, fin);
    const ecrit = duResponsable.some(t => t > e.t && t <= f);
    const qui = ecrit ? RESPONSABLE : SUPERVISEUR;
    if (f > e.t) lesAttentes.push({ i: [e.t, f], qui, nuit: nuits([e.t, f], nuit) });
  }
  const attentes = lesAttentes.map(a => a.i);

  const vide = () => ({ ms: 0, n: 0, jetons: 0, cache: 0, cout: 0 });
  const categories = Object.fromEntries(CATEGORIES.map(([k]) => [k, vide()]));
  for (const qui of [SUPERVISEUR, RESPONSABLE]) {
    const l = lesAttentes.filter(a => a.qui === qui);
    const ms = l.reduce((m, a) => m + a.i[1] - a.i[0] - longueur(a.nuit), 0);
    categories[qui] = { ...vide(), ms, n: l.length };
  }
  const laNuit = lesAttentes.filter(a => a.nuit.length);
  categories.nuit = { ...vide(), ms: longueur(laNuit.flatMap(a => a.nuit)), n: laNuit.length };
  const fenetre = s => [Math.max(s.d, debut), Math.min(s.f, fin)];
  for (const s of segments) {
    const [d, f] = fenetre(s);
    if (f <= d) continue;
    const ms = f - d - commun([d, f], attentes);
    const c = categories[s.categorie];
    c.ms += ms;
    c.n++;
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
  // The sessions <l> by role, in the order of the steps.
  const parRoleDe = l => {
    const out = {};
    for (const role of new Set(SUITE.flatMap(e => e.qui))) {
      const n = l.filter(x => x.role === role).length;
      if (n) out[role] = n;
    }
    return out;
  };
  const parEtape = {};
  for (const s of etapes) {
    const e = etapeDuCircuit({ etape: s.etape, finale: s.finale });
    const titre = e?.titre ?? s.etape;
    parEtape[titre] = (parEtape[titre] ?? 0) + 1;
  }
  const arrets = {};
  for (const e of duCircuit.filter(x => x.arret)) arrets[e.arret] = (arrets[e.arret] ?? 0) + 1;
  // The ends of the questionings of the plan: the questions asked, the plans an answer changed, the
  // questions left open.
  const fins = duCircuit.map(e => e.questionnement).filter(Boolean);
  const questionnement = {
    questions: fins.reduce((m, q) => m + (q.questions ?? 0), 0),
    changes: fins.filter(q => q.change).length,
    ouvertes: fins.reduce((m, q) => m + (q.ouvertes ?? 0), 0),
  };
  const somme = k => sessions.reduce((m, l) => m + (l[k] ?? 0), 0);
  const perdu = CATEGORIES.filter(([k]) => !GARDE.has(k)).reduce(
    (m, [k]) => m + categories[k].ms,
    0
  );
  return {
    ticket,
    calcule: new Date(maintenant).toISOString(),
    debut: mur ? new Date(debut).toISOString() : null,
    fin: mur ? new Date(fin).toISOString() : null,
    mur,
    murHorsNuit: mur - categories.nuit.ms,
    statut: statutDe(etat),
    perdu,
    perduHorsAttentes: perdu - ATTENTES.reduce((m, k) => m + categories[k].ms, 0),
    categories,
    seances: {
      total: sessions.length,
      parRole: parRoleDe(sessions),
      horsCircuit: {
        total: hors.length,
        parRole: parRoleDe(hors),
        cout: hors.reduce((m, l) => m + (l.cout ?? 0), 0),
      },
    },
    etapes: parEtape,
    arrets,
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
// <avant> (another ticket's, computed again, or null).
export function texteDuBilan(b, avant) {
  const lesRoles = parRole =>
    Object.entries(parRole)
      .map(([r, n]) => `${n} ${nomDuRole(r)}`)
      .join(', ');
  const roles = lesRoles(b.seances.parRole);
  const h = b.seances.horsCircuit;
  const horsCircuit = h.total
    ? ` ; ${h.total} séance${h.total > 1 ? 's' : ''} hors circuit, lancée${h.total > 1 ? 's' : ''} par le superviseur (${lesRoles(h.parRole)}), ${dollars(h.cout)} $`
    : '';
  const tete = `${b.statut} en ${minutes(b.mur)} min, ${minutes(b.murHorsNuit)} min hors nuit d'attente ; ${minutes(b.perdu)} min perdues (${pourcent(b.perdu, b.mur)} %), ${minutes(b.perduHorsAttentes)} min hors attentes ; ${b.seances.total} séances${roles ? ` (${roles})` : ''}${horsCircuit} ; ${dollars(b.cout)} $ ; ${millions(b.jetons)} M jetons, ${millions(b.cache)} M lus du cache.`;
  const paye = new Set(['travail', 'sansEffet', 'questionnement']);
  const q = b.questionnement;
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  const lignes = CATEGORIES.map(([k, nom]) => {
    const c = b.categories[k];
    const plus =
      (k === SUPERVISEUR || k === RESPONSABLE) && c.n
        ? ` (${pluriel(c.n, 'montée')})`
        : k === 'questionnement'
          ? `, ${dollars(c.cout)} $ (${pluriel(q.questions, 'question')}, ${pluriel(q.changes, 'plan')} ${q.changes > 1 ? 'changés' : 'changé'}, ${pluriel(q.ouvertes, 'question')} ${q.ouvertes > 1 ? 'ouvertes' : 'ouverte'})`
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
    ? `Face au bilan de ${avant.ticket}, recalculé : mur ${minutes(avant.mur)} → ${minutes(b.mur)} min, perte ${pourcent(avant.perdu, avant.mur)} → ${pourcent(b.perdu, b.mur)} %, séances ${avant.seances.total} → ${b.seances.total}, coût ${dollars(avant.cout)} → ${dollars(b.cout)} $.`
    : "Aucun bilan d'avant dans ce projet : pas de base.";
  return [tete, ...lignes, `Arrêts : ${arrets || 'aucun'}.`, base].join('\n');
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

// The base of the bilan of <ticket> in the main tree <racine>: the bilan of the latest other ticket
// whose bilan is kept, computed again by this version from its sources, as a bench of time remakes
// its base, never the figures kept by the version that wrote them; null when its sources give no
// bilan any more. The figures a base gives (wall time, loss, sessions, cost) hold whoever waited,
// the owner or the supervisor: the transcripts of its supervisor's sessions are not read.
export function precedent(racine, ticket) {
  const avant = Object.values(bilansGardes(racine))
    .filter(b => b.ticket !== ticket)
    .sort((x, y) => Date.parse(y.calcule ?? 0) - Date.parse(x.calcule ?? 0))[0];
  if (!avant) return null;
  const b = calculer(racine, avant.ticket, { responsable: false });
  return b.mur > 0 ? b : null;
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

// The times of the owner's messages in the transcript text <texte> of a supervisor's session: the
// messages Claude Code writes as the person's (`type` « user », `origin.kind` « human »); a
// notification, another agent's message, a tool's result and a torn line are not his.
export function messagesDuResponsable(texte) {
  const out = [];
  for (const l of texte.split('\n')) {
    // Only a line that names the person can be his message: the others are not parsed.
    if (!l.includes('"human"')) continue;
    try {
      const e = JSON.parse(l);
      const t = Date.parse(e.timestamp ?? '');
      if (e.type === 'user' && e.origin?.kind === 'human' && !Number.isNaN(t)) out.push(t);
    } catch {
      // A torn line holds no message.
    }
  }
  return out;
}

// The read unit of a transcript: a supervisor's session runs to hundreds of megabytes, never held
// whole.
const MORCEAU = 1_048_576;

// The times of the owner's messages in the transcript of the supervisor's session <seance>, in any
// project folder of ~/.claude/projects; none when no transcript holds it.
function messagesDeLaSeance(seance) {
  const projets = path.join(os.homedir(), '.claude', 'projects');
  const f = existsSync(projets)
    ? readdirSync(projets)
        .map(d => path.join(projets, d, `${seance}.jsonl`))
        .find(g => existsSync(g))
    : null;
  if (!f) return [];
  const out = [];
  const decodeur = new StringDecoder('utf8');
  const tampon = Buffer.alloc(MORCEAU);
  const fd = openSync(f, 'r');
  try {
    let reste = '';
    for (let n = readSync(fd, tampon); n > 0; n = readSync(fd, tampon)) {
      const texte = reste + decodeur.write(tampon.subarray(0, n));
      const fin = texte.lastIndexOf('\n') + 1;
      out.push(...messagesDuResponsable(texte.slice(0, fin)));
      reste = texte.slice(fin);
    }
    out.push(...messagesDuResponsable(reste + decodeur.end()));
  } finally {
    closeSync(fd);
  }
  return out;
}

// The bilan of <ticket> computed from the main tree <racine>: its register, the results its
// circuit kept, its circuit's state, and the owner's messages in the supervisor's sessions its
// stops name unless <responsable> is false.
function calculer(racine, ticket, { responsable = true } = {}) {
  const registre =
    process.env.GRILLHOUSE_REGISTRE ??
    path.join(os.homedir(), '.claude', 'grillhouse', 'registre.jsonl');
  const lignes = lignesDuProjet(existsSync(registre) ? readFileSync(registre, 'utf8') : '', racine);
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
  const seances = new Set(entrees.map(e => e.montee?.superviseur).filter(Boolean));
  return bilan({
    ticket,
    lignes,
    entrees,
    etat,
    nuit: plageDeNuit(racine),
    duResponsable: responsable ? [...seances].flatMap(s => messagesDeLaSeance(String(s))) : [],
  });
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
