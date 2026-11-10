#!/usr/bin/env node
// The subcommand `grillhouse journal [--depuis <ISO>] [--jusqu-a <ISO>] [--ticket <id>]`: the
// chronology of the journal of states of the project (scripts/journal-des-etats.mjs), its lines in
// the order of their timestamps, and, after each launch or end of a circuit of the queue, the set
// of the tickets at work against the ceiling of the circuits (`grillhouse.circuits`): one ticket at
// work when the ceiling allows two shows at once. Bounds are ISO 8601 with the local offset,
// included; a line unreadable is left out; no journal or no line in the range is said, exit 0.
// Exit 2 for an option unknown or a date unreadable.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { reglageDesCircuits } from './circuits-cles.mjs';
import { dossierDuJournal, ensemblesEnTravail, lireLeJournal } from './journal-des-etats.mjs';

const USAGE = 'usage : grillhouse journal [--depuis <ISO>] [--jusqu-a <ISO>] [--ticket <id>]\n';
const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}:\d{2}|Z)?)?$/;

// The options of <argv>, `{ depuis, jusquA, ticket }`, or `{ faute }`.
function options(argv) {
  const cles = { '--depuis': 'depuis', '--jusqu-a': 'jusquA', '--ticket': 'ticket' };
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    const cle = cles[argv[i]];
    if (!cle) {
      return { faute: `option inconnue : ${argv[i]}` };
    }
    const v = argv[i + 1];
    if (v === undefined) {
      return { faute: `${argv[i]} attend une valeur` };
    }
    if (cle !== 'ticket' && (!ISO.test(v) || Number.isNaN(Date.parse(v)))) {
      return { faute: `${argv[i]} : « ${v} » n'est pas une date ISO 8601` };
    }
    o[cle] = v;
  }
  return o;
}

// The ceiling of the circuits of the project at <racine>: its key, 1 when absent.
function plafond(racine) {
  const f = path.join(racine, 'package.json');
  try {
    return reglageDesCircuits(existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}).max ?? 1;
  } catch {
    return 1;
  }
}

const heure = ts => ts.slice(11);

const ligneDe = l =>
  [
    l.ts,
    String(l.genre ?? '').padEnd(7),
    l.ticket ?? '-',
    l.etape ?? '-',
    ...(l.boucle === null || l.boucle === undefined ? [] : [`boucle ${l.boucle}`]),
    ...(l.place ? [`place ${l.place}`] : []),
    ...(l.raison ? [`— ${l.raison}`] : []),
  ].join(' ');

/**
 * The subcommand: writes the chronology through <out>, its faults through <err>; the exit code.
 * @param {string[]} argv
 * @param {{ racine?: string, out?: (t: string) => void, err?: (t: string) => void }} [contexte]
 * @returns {number}
 */
export function journal(
  argv,
  {
    racine = process.cwd(),
    out = t => process.stdout.write(`${t}\n`),
    err = t => process.stderr.write(`${t}\n`),
  } = {}
) {
  const o = options(argv);
  if (o.faute) {
    err(`⛔ grillhouse journal : ${o.faute}\n${USAGE.trimEnd()}`);
    return 2;
  }
  let dossier = null;
  try {
    dossier = dossierDuJournal(racine);
  } catch {
    // no git project: no journal
  }
  if (!dossier || !existsSync(dossier)) {
    out('Aucun journal pour ce projet.');
    return 0;
  }
  // The sets are rebuilt from the start of the journal up to the end of the range, so that a range
  // that starts mid-work knows who was already at work.
  const jusqua = o.jusquA === undefined ? {} : { jusquA: o.jusquA };
  const toutes = lireLeJournal(racine, jusqua).lignes;
  const depuis = o.depuis === undefined ? -Infinity : Date.parse(o.depuis);
  const affichees = toutes.filter(
    l => Date.parse(l.ts) >= depuis && (o.ticket === undefined || l.ticket === o.ticket)
  );
  if (affichees.length === 0) {
    out('Aucune ligne dans la plage.');
    return 0;
  }
  const max = plafond(racine);
  const parInstant = new Map(ensemblesEnTravail(toutes).map(e => [e.ts, e.enTravail]));
  for (const l of affichees) {
    out(ligneDe(l));
    const ensemble = l.genre === 'file' ? parInstant.get(l.ts) : undefined;
    if (ensemble) {
      out(
        `  ${heure(l.ts)} en travail ${ensemble.length}/${max}${ensemble.length ? ` : ${ensemble.join(', ')}` : ''}`
      );
    }
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = journal(process.argv.slice(2));
}
