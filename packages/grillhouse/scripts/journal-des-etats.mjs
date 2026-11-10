// The journal of states of a project (grillhouse-4nr.20, docs/ARCHITECTURE.md « Le journal des
// états »): one dated JSONL line per change of state of the circuits, the queue and the places, a
// segment per local date under the common git directory (`<git-common-dir>/grillhouse-journal/
// <YYYY-MM-DD>.jsonl`, never versioned), read back as a chronology. As the log of a scheduler: a
// whole line in one append, no lock, no wait, so that it never delays what it traces.
//
// A line: `{ ts, genre, ticket, etape, boucle, place, raison }`, `genre` one of `circuit`, `file`,
// `places`; `ts` ISO 8601 with the local offset; `raison` empty for a normal transition, the name
// of the stop for a stop, the cause of the return for a loop, the message of the wait for a wait
// for a place.
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';

/** The age, in days, beyond which the cleaning removes a segment. */
export const AGE_MAX_JOURS = 14;
/** The total size, in bytes, beyond which the cleaning removes the oldest segments (50 Mo). */
export const TAILLE_MAX = 50 * 1024 * 1024;
// A line, its newline included, fits in this many bytes: an append of that size stays whole
// (POSIX `PIPE_BUF` order, the size git and journald hold their lines to).
const LIGNE_MAX = 4096;
const SEGMENT = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

const deux = n => String(n).padStart(2, '0');

/**
 * <date> in ISO 8601 with the local offset (`2026-11-09T10:00:00.250+01:00`).
 * @param {Date} [date]
 * @returns {string}
 */
export function heureLocale(date = new Date()) {
  const d = date;
  const decalage = -d.getTimezoneOffset();
  const signe = decalage < 0 ? '-' : '+';
  const h = Math.floor(Math.abs(decalage) / 60);
  const m = Math.abs(decalage) % 60;
  return (
    `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}` +
    `T${deux(d.getHours())}:${deux(d.getMinutes())}:${deux(d.getSeconds())}` +
    `.${String(d.getMilliseconds()).padStart(3, '0')}${signe}${deux(h)}:${deux(m)}`
  );
}

const communs = new Map();

/**
 * The directory of the journal of the project at <racine>: under its common git directory.
 * @param {string} racine
 * @returns {string}
 * @throws {Error} when <racine> is no git project
 */
export function dossierDuJournal(racine) {
  let commun = communs.get(racine);
  if (!commun) {
    commun = execFileSync(
      'git',
      ['-C', racine, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    communs.set(racine, commun);
  }
  return path.join(commun, 'grillhouse-journal');
}

// The line of <trace> with every field, the raison cut so that the whole line, newline included,
// fits under LIGNE_MAX bytes (by characters, never through one).
function ligneEntiere(trace, ts) {
  const champ = v => (v === undefined ? null : v);
  const ligne = {
    ts,
    genre: trace.genre,
    ticket: champ(trace.ticket),
    etape: champ(trace.etape),
    boucle: champ(trace.boucle),
    place: champ(trace.place),
    raison: trace.raison ?? '',
  };
  let raison = Array.from(String(ligne.raison));
  let texte = JSON.stringify(ligne);
  while (Buffer.byteLength(texte) + 1 > LIGNE_MAX && raison.length > 0) {
    const exces = Buffer.byteLength(texte) + 1 - LIGNE_MAX;
    raison = raison.slice(0, Math.max(0, raison.length - Math.max(1, Math.ceil(exces / 4))));
    texte = JSON.stringify({ ...ligne, raison: raison.join('') });
  }
  return `${texte}\n`;
}

let echecDit = false;

/**
 * The trace <trace> (`{ genre, ticket, etape, boucle, place, raison }`, `ts` when it already has
 * one) appended to the segment of its local date, in one write. A trace that cannot be written
 * (no project, a full disk) never throws: `{ ecrit: false }`, said once through <dire>.
 * @param {string} racine the project
 * @param {object} trace
 * @param {{ maintenant?: Date, dire?: (m: string) => void }} [options]
 * @returns {{ ecrit: boolean }}
 */
export function ecrireLaTrace(racine, trace, { maintenant, dire } = {}) {
  try {
    const ts = trace.ts ?? heureLocale(maintenant ?? new Date());
    const dossier = dossierDuJournal(racine);
    mkdirSync(dossier, { recursive: true });
    appendFileSync(path.join(dossier, `${ts.slice(0, 10)}.jsonl`), ligneEntiere(trace, ts), {
      flag: 'a',
    });
    return { ecrit: true };
  } catch (e) {
    return dit(e, dire);
  }
}

function dit(erreur, dire) {
  if (!echecDit) {
    echecDit = true;
    const m = `⚠️  journal des états non écrit : ${erreur?.message ?? erreur}`;
    (dire ?? (t => process.stderr.write(`${t}\n`)))(m);
  }
  return { ecrit: false };
}

/** The trace of a circuit of the queue launched (`lance`) or ended (`termine`). */
export function traceDeLaFile({ ticket, evenement }) {
  return { genre: 'file', ticket, etape: evenement, boucle: null, place: null, raison: '' };
}

/** The trace of a place taken (`prise`), given back (`rendue`) or waited for (`attente`). */
export function traceDesPlaces({ evenement, ticket = null, place = null, raison = '' }) {
  return { genre: 'places', ticket, etape: evenement, boucle: null, place, raison };
}

const instant = ts => Date.parse(ts);

/**
 * The lines of the journal of <racine> within the range, from every segment, in the order of their
 * timestamps (instants, the order of the lines for a tie); a line unreadable is left out.
 * @param {string} racine
 * @param {{ depuis?: string, jusquA?: string, ticket?: string }} [plage] ISO 8601, bounds included
 * @returns {{ lignes: object[] }}
 */
export function lireLeJournal(racine, { depuis, jusquA, ticket } = {}) {
  let dossier;
  try {
    dossier = dossierDuJournal(racine);
  } catch {
    return { lignes: [] };
  }
  if (!existsSync(dossier)) {
    return { lignes: [] };
  }
  const du = depuis === undefined ? -Infinity : instant(depuis);
  const au = jusquA === undefined ? Infinity : instant(jusquA);
  const lignes = [];
  for (const nom of readdirSync(dossier)
    .filter(n => SEGMENT.test(n))
    .sort()) {
    let brut;
    try {
      brut = readFileSync(path.join(dossier, nom), 'utf8');
    } catch {
      continue;
    }
    for (const l of brut.split('\n')) {
      let v;
      try {
        v = l ? JSON.parse(l) : null;
      } catch {
        continue;
      }
      if (!v || typeof v !== 'object' || Array.isArray(v) || Number.isNaN(instant(v.ts))) {
        continue;
      }
      const t = instant(v.ts);
      if (t >= du && t <= au && (ticket === undefined || v.ticket === ticket)) {
        lignes.push({ v, t });
      }
    }
  }
  return { lignes: lignes.sort((a, b) => a.t - b.t).map(x => x.v) };
}

const jourDe = nom =>
  Date.UTC(
    ...nom
      .slice(0, 10)
      .split('-')
      .map((n, i) => Number(n) - (i === 1 ? 1 : 0))
  );

/**
 * The cleaning: removes whole segments older than <ageMaxJours> days, then, past <tailleMax> bytes
 * in all, the oldest first, never the latest. It rewrites no segment, so a line written meanwhile
 * is not lost; it touches only the journal of <racine>.
 * @param {string} racine
 * @param {{ maintenant?: Date, ageMaxJours?: number, tailleMax?: number }} [options]
 * @returns {{ retires: string[] }}
 */
export function nettoyerLeJournal(
  racine,
  { maintenant = new Date(), ageMaxJours = AGE_MAX_JOURS, tailleMax = TAILLE_MAX } = {}
) {
  let dossier;
  try {
    dossier = dossierDuJournal(racine);
  } catch {
    return { retires: [] };
  }
  if (!existsSync(dossier)) {
    return { retires: [] };
  }
  const aujourdhui = jourDe(heureLocale(maintenant));
  const retires = [];
  const retirer = nom => {
    try {
      unlinkSync(path.join(dossier, nom));
    } catch {
      // already gone
    }
    retires.push(nom);
  };
  let restants = readdirSync(dossier)
    .filter(n => SEGMENT.test(n))
    .sort();
  for (const nom of restants.filter(n => (aujourdhui - jourDe(n)) / 86_400_000 > ageMaxJours)) {
    retirer(nom);
  }
  restants = restants.filter(n => !retires.includes(n));
  const tailles = new Map(restants.map(n => [n, statSync(path.join(dossier, n)).size]));
  let total = [...tailles.values()].reduce((a, b) => a + b, 0);
  for (const nom of restants.slice(0, -1)) {
    if (total <= tailleMax) {
      break;
    }
    retirer(nom);
    total -= tailles.get(nom);
  }
  return { retires };
}

/**
 * The set of tickets at work after each launch or end of a circuit of the queue (the lines `file`
 * `lance` and `termine`), in the order of the instants: `[{ ts, enTravail }]`, one entry per change.
 * @param {object[]} lignes
 * @returns {{ ts: string, enTravail: string[] }[]}
 */
export function ensemblesEnTravail(lignes) {
  const file = lignes
    .filter(l => l.genre === 'file' && (l.etape === 'lance' || l.etape === 'termine'))
    .map((l, i) => ({ l, i, t: instant(l.ts) }))
    .sort((a, b) => a.t - b.t || a.i - b.i);
  const en = new Set();
  const rendu = [];
  for (const { l } of file) {
    if (l.etape === 'lance') {
      if (en.has(l.ticket)) {
        continue;
      }
      en.add(l.ticket);
    } else if (!en.delete(l.ticket)) {
      continue;
    }
    rendu.push({ ts: l.ts, enTravail: [...en] });
  }
  return rendu;
}
