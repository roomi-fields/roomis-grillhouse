#!/usr/bin/env node
// A line of a `## Consommateurs` section that a lot changes enters with its settled arbitrage at the
// ticket: each dependency between components is decided before it is written, as a code owner
// approves a change to the files it owns.
//
//   npx grillhouse consommateurs-arbitres   run from the repository root (a guard of grillhouse:gardes)
//
// - It judges the copy it runs in, on the branch `agent/<ticket>`: for each component the guards
//   judge (`aVerifier` of scripts/interfaces-contre-code.mjs; in an envelope,
//   `GRILLHOUSE_ENVELOPPE`, the components of its plan), each list line (`- …`) of the
//   `## Consommateurs` section of its `docs/INTERFACE.md` in the working tree that the section of
//   HEAD does not hold is a changed line (an interface absent from HEAD: all its lines). Out of a
//   branch `agent/…` (main, the detached copy of the integration, the CI, the night), there is no
//   lot: nothing is judged.
// - With a changed line, the comments of the ticket are read (`bd comments <ticket> --json`, run
//   from the main tree, the parent of git's common directory). A changed line passes when an
//   arbitrage that is settled (`arbitrageTranche`: a « ## Arbitrage… » comment, or the regulator's,
//   that the circuit writes from its sheet, `estArbitrage`) names its consumer, the first
//   name between backquotes of the line, found as it is in the comment's text. Without a changed
//   line, bd is not called.
// - A changed line no arbitrage settles passes too when the section « Architecture » of the
//   ticket's description (`bd show <ticket> --json`, from its heading `## Architecture` to the
//   next heading of its level or above) names its consumer and each name the line declares, word
//   for word (`nommeParLArchitecture`): the ticket fixed them before the lot. The description is
//   read only for such a line; a description that cannot be read refuses, as the comments do.
// - A refusal names `<INTERFACE.md> § Consommateurs` and the line; a refusal inscribed in the
//   project's debt (`grillhouse-dette.json`, see `dette.mjs`) passes, keyed by the interface and
//   `consommateur-sans-arbitrage`. Comments that cannot be read refuse, never inscribed.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { trancher } from './dette.mjs';
import { aVerifier } from './interfaces-contre-code.mjs';

const REGLE = 'consommateur-sans-arbitrage';

// The regulator's arbitrage as the circuit writes it at the ticket, from the `arbitrage` of its
// sheet (scripts/circuit.mjs): `Circuit · <composant> · regulateur : arbitrage — <texte>`.
const DU_REGULATEUR = /^Circuit · [^\n]* · regulateur : arbitrage — /;

// True when the text <text> of a comment is an arbitrage: a « ## Arbitrage… » comment, or the
// regulator's, as the circuit writes it.
export const estArbitrage = text =>
  /^\s*## Arbitrage\b/.test(String(text ?? '')) || DU_REGULATEUR.test(String(text ?? ''));

// True when the arbitrage <a> of <comments> (Beads' JSON, in their order) is settled: the
// regulator's (it settles only what the letter of a criterion, a written precedent or a rule of
// the frame settles), a line `### Verdict — tranché`, or a « ## Réponse du responsable » comment
// after it.
export function arbitrageTranche(comments, a) {
  const tranche = DU_REGULATEUR.test(a.text) || /^### Verdict\s*—\s*tranché/m.test(a.text);
  return (
    tranche ||
    comments
      .slice(comments.indexOf(a) + 1)
      .some(c => /^\s*## Réponse du responsable\b/.test(c.text))
  );
}

// The list lines of the section `## Consommateurs` of <texte>, trimmed.
function lignesConsommateurs(texte) {
  const out = [];
  let dedans = false;
  for (const l of texte.split('\n')) {
    if (/^##\s/.test(l)) dedans = /^##\s+Consommateurs\s*$/.test(l);
    else if (dedans && /^\s*-\s+\S/.test(l)) out.push(l.trim());
  }
  return out;
}

// The section « Architecture » of the ticket's description <description>: its lines from its
// heading (`## Architecture`) to the next heading of its level or above, or '' without one.
function sectionArchitecture(description) {
  const out = [];
  let niveau = 0;
  for (const l of String(description ?? '').split('\n')) {
    const titre = /^(#{1,6})\s+(.*)$/.exec(l);
    if (niveau && titre && titre[1].length <= niveau) break;
    if (niveau) out.push(l);
    else if (titre && /^Architecture\b/.test(titre[2].trim())) niveau = titre[1].length;
  }
  return out.join('\n');
}

// Whether the text <texte> names the consumer and each name of the `## Consommateurs` line
// <ligne> (``- `<consommateur>` : <nom>, <nom>``), word for word: each one whole, with no
// character of a name (a letter, a digit, `_`, `$`, `-`) beside it; `*`, a namespace, between
// backquotes.
function nommeParLArchitecture(texte, ligne) {
  const m = /^[-*]\s+`?([^`:\s]+)`?\s*:\s*(.+)$/.exec(ligne);
  if (!m) return false;
  const noms = m[2]
    .split(',')
    .map(s => s.replace(/`/g, '').trim())
    .filter(Boolean);
  const echappe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nomme = nom =>
    nom === '*'
      ? texte.includes('`*`')
      : new RegExp(`(?<![\\w$-])${echappe(nom)}(?![\\w$-])`).test(texte);
  return [m[1], ...noms].every(nomme);
}

const git = (racine, ...a) => spawnSync('git', ['-C', racine, ...a], { encoding: 'utf8' });

// The ticket of the copy at <racine>: <ticket> of its branch `agent/<ticket>`, or null.
function ticketDeLaCopie(racine) {
  const r = git(racine, 'rev-parse', '--abbrev-ref', 'HEAD');
  const m = r.status === 0 ? /^agent\/(.+)$/.exec(r.stdout.trim()) : null;
  return m ? m[1] : null;
}

// The findings of the copy <racine> under <env>, in the debt's form (`dette.mjs`).
export function verifier(racine, env = process.env) {
  const ticket = ticketDeLaCopie(racine);
  if (!ticket) return [];
  const changees = [];
  for (const c of aVerifier(racine, env)) {
    const iface = path.join(c.dir, 'docs', 'INTERFACE.md');
    if (!existsSync(iface)) continue;
    const rel = path.relative(racine, iface);
    const head = git(racine, 'show', `HEAD:${rel}`);
    const avant = new Set(head.status === 0 ? lignesConsommateurs(head.stdout) : []);
    for (const ligne of lignesConsommateurs(readFileSync(iface, 'utf8'))) {
      if (!avant.has(ligne)) changees.push({ rel, ligne });
    }
  }
  if (changees.length === 0) return [];
  const commun = git(racine, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  const principal = path.dirname(commun.stdout.trim());
  const r = spawnSync('bd', ['comments', ticket, '--json'], {
    cwd: principal,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  let comments;
  try {
    if (r.status !== 0) throw new Error(r.stderr || r.error?.message || `code ${r.status}`);
    comments = (JSON.parse(r.stdout || '[]') ?? []).map(x => ({ text: String(x.text ?? '') }));
  } catch (e) {
    return [
      {
        message: `Les commentaires du ticket ${ticket} ne se lisent pas (bd comments ${ticket} --json) : ${String(e.message ?? e).trim()} ; les lignes Consommateurs changées ne se jugent pas.`,
      },
    ];
  }
  const arbitrages = comments.filter(a => estArbitrage(a.text) && arbitrageTranche(comments, a));
  const consommateurDe = ligne => /`([^`]+)`/.exec(ligne)?.[1] ?? ligne.replace(/^-\s+/, '');
  const restantes = changees.filter(
    ({ ligne }) => !arbitrages.some(a => a.text.includes(consommateurDe(ligne)))
  );
  if (restantes.length === 0) return [];
  // The lines no arbitrage settles: the section « Architecture » of the ticket.
  const show = spawnSync('bd', ['show', ticket, '--json'], {
    cwd: principal,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  let architecture;
  try {
    if (show.status !== 0) {
      throw new Error(show.stderr || show.error?.message || `code ${show.status}`);
    }
    architecture = sectionArchitecture(JSON.parse(show.stdout || '[]')?.[0]?.description);
  } catch (e) {
    return [
      {
        message: `Le ticket ${ticket} ne se lit pas (bd show ${ticket} --json) : ${String(e.message ?? e).trim()} ; les lignes Consommateurs changées ne se jugent pas.`,
      },
    ];
  }
  const constats = [];
  for (const { rel, ligne } of restantes) {
    if (nommeParLArchitecture(architecture, ligne)) continue;
    const consommateur = consommateurDe(ligne);
    constats.push({
      fichier: rel,
      regle: REGLE,
      message: `${rel} § Consommateurs : la ligne « ${ligne} » change sans arbitrage tranché au ticket ${ticket} qui nomme \`${consommateur}\`, ni section « Architecture » du ticket qui nomme ce consommateur et chaque nom de la ligne ; une dépendance entre composants se décide avant de s'écrire : un commentaire « ## Arbitrage » tranché au ticket qui nomme ce consommateur, ou l'Architecture du ticket qui la fixe.`,
    });
  }
  return constats;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  const { refus, lignes } = trancher(racine, 'consommateurs-arbitres', verifier(racine));
  for (const r of refus) process.stderr.write(`⛔ ${r.message}\n`);
  for (const l of lignes) process.stderr.write(`${l}\n`);
  process.exitCode = refus.length ? 1 : 0;
}
