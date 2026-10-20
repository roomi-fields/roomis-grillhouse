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
// - Its sources: the register of finished agents (`~/.claude/grillhouse/registre.jsonl`,
//   GRILLHOUSE_REGISTRE replaces it), each agent's latest line on the ticket (its project the main
//   tree, or a folder of it), its turns, its tokens,
//   its cache reads and its cost, and the lines of the role `circuit` of the steps the circuit
//   leads itself; the lines `Circuit · <composant> · <étape> : …` of the ticket (`bd comments
//   --json`, each with its time); the circuit's state, `.claude/worktrees/<ticket>.circuit.json`,
//   for where the circuit ended. Every agent declares nothing: the bilan measures.
// - The steps and the roles are those of scripts/etapes.mjs. Only the circuit's roles count: an
//   exploration, before the circuit, is out of it.
// - The window: from the first turn of a session or a step to the last line of the circuit or the
//   last turn; its length is the wall time.
// - Each turn of a session and each step finds its line at the ticket: a step, the line of its
//   step and component written during it; a session, the first line of its role's step written
//   after its turn, before the next turn of any other. A step `controles` whose line gives the
//   outcome of `npm run verifier`, or a stop of the final pass, is the final pass.
// - The categories, each instant once:
//   - travail resté au lot: a session that delivered, the reviewer's included;
//   - relance sans effet: a developer whose line says « arrêt sans-livraison » or « reprise sans
//     changement »; a tester whose next proof finds the lot of the proof before it (the same counts
//     of reds, greens of the lot, broken files and greens of HEAD), after a refused proof, or no
//     file of the lot (reds that exist already or of a build alone, no green of the lot); that
//     proof; checks that play the same red again on a component none of its agents delivered to
//     since its checks before (the final pass: none of any component's since the final pass before);
//   - régulateur: a session of the arbitrage, out of the wait;
//   - attente humaine: from a question of the regulator (`· regulateur : MONTE`) to the next line
//     at the ticket that is not the circuit's, or to the next turn, the first of the two;
//   - étapes automatiques: the other steps the circuit leads, the final passes among them;
//   - rejeu d'étapes déjà vertes: the same, on a lot unchanged since green: checks green again,
//     a tester run again on a proven lot, its proof;
//   - entre deux étapes: the rest of the window.
//   What is lost is the wall time out of the work and the automatic steps.
// - The bilan counts the sessions by role, the steps by their titles, the stops by kind (the
//   lines `arrêt <nom> —`), the regulator's questions, the tokens, the cache reads and the cost
//   (a session without a cost counts 0); a session's tokens go to its turns by their time.
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
  ETAPES,
  etapeDuCircuit,
  etapeDuRole,
  nomDuRole,
  REGULATEUR,
} from './etapes.mjs';

// The role of a register line that a step of the circuit writes, and the author of its lines.
const CIRCUIT = 'circuit';
const PREFIXE = 'Circuit · ';
// A comment's time is given to the second.
const JEU = 2000;
// The line of a final pass: its command, or its stop.
const FINALE =
  /^(?:verts|rouge|à repasser) : (?:\d+ rouge\(s\) — )?npm run verifier\b|^arrêt \S+ — (?:La passe finale|Contrôles de la passe finale|Aucun composant du ticket)/;
const MINUTE = 60_000;

// The categories, in the order the text lists them, with their names.
const CATEGORIES = [
  ['travail', 'travail resté au lot'],
  ['sansEffet', 'relance sans effet'],
  ['regulateur', 'régulateur'],
  ['attente', 'attente humaine'],
  ['automatique', 'étapes automatiques'],
  ['rejeu', "rejeu d'étapes déjà vertes"],
  ['intervalles', 'entre deux étapes'],
];
// The categories of the time kept: the rest is lost.
const GARDE = new Set(['travail', 'automatique']);
// The roles of the circuit, by the steps they work at: every step but the exploration.
const ROLES = new Set(ETAPES.filter(e => e.numero > 1).flatMap(e => e.qui));

// The lines of the circuit at the ticket: `{ t, composant, etape, texte }`, in their order.
function lignesDuCircuit(commentaires) {
  const out = [];
  for (const c of commentaires) {
    const m = /^Circuit · (.+?) · ([^\s:]+) : ([\s\S]*)$/.exec(String(c.text ?? ''));
    const t = Date.parse(c.created_at ?? '');
    if (m && !Number.isNaN(t) && m[2] !== 'bilan') {
      out.push({ t, composant: m[1], etape: m[2], texte: m[3] });
    }
  }
  return out.sort((x, y) => x.t - y.t);
}

// The counts a proof's line gives, its outcome, and whether its lot holds no file: null for a line
// that is no proof's summary.
function lirePreuve(texte) {
  const m =
    /^(\d+) rouge\(s\), (\d+) vert\(s\) justifié\(s\), (\d+) vert\(s\) sans vert attendu, (\d+) fichier\(s\) qui ne se charge\(nt\) pas, (\d+) test\(s\) vert\(s\) que HEAD/.exec(
      texte
    );
  if (!m) return null;
  const [rouges, justifies, sans, casses, head] = m.slice(1).map(Number);
  const section = /\n\nRouges \(\d+\) :\n((?:- .*\n?)*)/.exec(texte)?.[1] ?? '';
  const duLot = section
    .split('\n')
    .filter(l => l.startsWith('- '))
    .filter(l => !/^- (?:rouge existant :|construction de )/.test(l)).length;
  return {
    signature: [rouges, justifies + sans, casses, head].join(','),
    ok: /; (?:au développeur|aucun rouge)/.test(texte),
    vide: duLot + justifies + sans + casses === 0,
  };
}

// The outcome of a check's line: green, « à repasser », or red.
const issue = texte =>
  /^verts\b/.test(texte)
    ? 'vert'
    : /^(?:à repasser|arrêt a-repasser)\b/.test(texte)
      ? 'a-repasser'
      : 'rouge';

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

// The bilan of <ticket> from the register's lines <lignes> (of its project), the comments of the
// ticket <commentaires> (`{ author, text, created_at }`) and the circuit's state <etat> (or null).
export function bilan({ ticket, lignes, commentaires, etat = null, maintenant = Date.now() }) {
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
  const circuit = lignesDuCircuit(commentaires);
  const debut = Math.min(...segments.map(s => s.d), Infinity);
  const fin = Math.max(...segments.map(s => s.f), ...circuit.map(c => c.t), -Infinity);
  const mur = Number.isFinite(debut) && fin > debut ? fin - debut : 0;

  // Each segment and its line at the ticket.
  for (const s of segments) {
    if (s.role === CIRCUIT) {
      s.ligne =
        circuit.findLast(
          c =>
            c.etape === s.etape &&
            c.composant === s.composant &&
            c.t >= s.d - JEU &&
            c.t <= s.f + JEU
        ) ?? null;
      s.finale = s.etape === 'controles' && FINALE.test(s.ligne?.texte.split('\n')[0] ?? '');
    } else {
      const nom = etapeDuRole(s.role)?.etat ?? s.role;
      const suivant = segments.find(x => x.d >= s.f && x.l !== s.l)?.d ?? Infinity;
      s.ligne =
        circuit.find(c => c.etape === nom && c.t >= s.f - JEU && c.t <= suivant + JEU) ?? null;
      s.composant = s.ligne?.composant ?? null;
    }
  }
  const etapes = segments.filter(s => s.role === CIRCUIT);
  const preuves = etapes.filter(s => s.etape === 'preuve');
  for (const p of preuves) p.preuve = lirePreuve(p.ligne?.texte ?? '');
  // A proof and the category it gives the tester before it: the lot unchanged since the proof
  // before, or none.
  const avantLa = p => preuves.findLast(x => x.composant === p.composant && x.f <= p.d);
  const parLaPreuve = p => {
    const avant = avantLa(p);
    if (!p.preuve) return null;
    if (avant?.preuve && avant.preuve.signature === p.preuve.signature) {
      return avant.preuve.ok ? 'rejeu' : 'sansEffet';
    }
    return null;
  };

  // The sessions first: the checks read what they delivered.
  for (const s of segments.filter(x => x.role !== CIRCUIT)) {
    const texte = s.ligne?.texte ?? '';
    if (etapeDuRole(s.role) === ARBITRAGE) s.categorie = 'regulateur';
    else if (s.role === 'developpeur') {
      s.categorie = /^arrêt sans-livraison|reprise sans changement/.test(texte)
        ? 'sansEffet'
        : 'travail';
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
      const i = issue(s.ligne?.texte ?? '');
      s.categorie =
        change || !avant.ligne || issue(avant.ligne.texte) !== i
          ? 'automatique'
          : i === 'vert'
            ? 'rejeu'
            : 'sansEffet';
    } else s.categorie = 'automatique';
  }

  // The waits for the supervisor: from each question of the regulator to the answer.
  const attentes = [];
  let questions = 0;
  for (const q of circuit.filter(c => c.etape === REGULATEUR && /^MONTE\b/.test(c.texte))) {
    questions++;
    const reponse = commentaires
      .map(c => ({ c, t: Date.parse(c.created_at ?? '') }))
      .filter(({ c, t }) => t > q.t && !String(c.text ?? '').startsWith(PREFIXE))
      .reduce((m, { t }) => Math.min(m, t), Infinity);
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
  for (const role of ETAPES.flatMap(e => e.qui)) {
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
  for (const c of circuit) {
    const m = /^arrêt (\S+) —/.exec(c.texte);
    if (m) arrets[m[1]] = (arrets[m[1]] ?? 0) + 1;
  }
  const finales = etapes.filter(s => s.finale);
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
  const paye = new Set(['travail', 'sansEffet', 'regulateur']);
  const lignes = CATEGORIES.map(([k, nom]) => {
    const c = b.categories[k];
    const plus =
      k === 'automatique'
        ? `, dont passes finales ${minutes(c.dontFinales)} min`
        : k === 'attente' && b.questions
          ? ` (${b.questions} question${b.questions > 1 ? 's' : ''})`
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

// The bilan of <ticket> computed from the main tree <racine>: its register, its comments, its
// circuit's state.
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
  const commentaires = JSON.parse(r.stdout || '[]') ?? [];
  const f = path.join(dossier(racine), `${ticket}.circuit.json`);
  let etat = null;
  try {
    etat = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  } catch {
    etat = null;
  }
  return bilan({ ticket, lignes, commentaires, etat });
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
