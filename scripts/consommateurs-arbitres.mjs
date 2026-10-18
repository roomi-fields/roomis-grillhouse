#!/usr/bin/env node
// A line of a `## Consommateurs` section that a lot changes enters with its settled arbitrage at the
// ticket: each dependency between components is decided before it is written, as a code owner
// approves a change to the files it owns.
//
//   node scripts/consommateurs-arbitres.mjs   run from the repository root (a guard of grillhouse:gardes)
//
// - It judges the copy it runs in, on the branch `agent/<ticket>`: for each component the guards
//   judge (`aVerifier` of scripts/interfaces-contre-code.mjs; in the envelope of a component,
//   `GRILLHOUSE_ENVELOPPE`, that component alone), each list line (`- …`) of the `## Consommateurs`
//   section of its `docs/INTERFACE.md` in the working tree that the section of HEAD does not hold
//   is a changed line (an interface absent from HEAD: all its lines). Out of a branch `agent/…`
//   (main, the detached copy of the integration, the CI, the night), there is no lot: nothing is
//   judged.
// - With a changed line, the comments of the ticket are read (`bd comments <ticket> --json`, run
//   from the main tree, the parent of git's common directory). A changed line passes when an
//   « ## Arbitrage… » comment that is settled (`arbitrageTranche`) names its consumer, the first
//   name between backquotes of the line, found as it is in the comment's text. Without a changed
//   line, bd is not called.
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

// True when the « ## Arbitrage » comment <a> of <comments> (Beads' JSON, in their order) is
// settled: the chef de chantier's arbitrage (he writes one only for what the letter of a
// criterion, a written precedent or a rule of the frame settles), a line `### Verdict — tranché`,
// or a « ## Réponse du responsable » comment after it.
export function arbitrageTranche(comments, a) {
  const tranche =
    /^\s*## Arbitrage du chef de chantier\b/.test(a.text) ||
    /^### Verdict\s*—\s*tranché/m.test(a.text);
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
  const arbitrages = comments.filter(
    a => /^\s*## Arbitrage\b/.test(a.text) && arbitrageTranche(comments, a)
  );
  const constats = [];
  for (const { rel, ligne } of changees) {
    const consommateur = /`([^`]+)`/.exec(ligne)?.[1] ?? ligne.replace(/^-\s+/, '');
    if (arbitrages.some(a => a.text.includes(consommateur))) continue;
    constats.push({
      fichier: rel,
      regle: REGLE,
      message: `${rel} § Consommateurs : la ligne « ${ligne} » change sans arbitrage tranché au ticket ${ticket} qui nomme \`${consommateur}\` ; une dépendance entre composants se décide avant de s'écrire : un commentaire « ## Arbitrage » tranché au ticket, qui nomme ce consommateur.`,
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
