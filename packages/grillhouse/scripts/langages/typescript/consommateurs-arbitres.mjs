#!/usr/bin/env node
// A line of a `## Consommateurs` section that a lot changes enters with its settled arbitrage at the
// ticket: each dependency between components is decided before it is written, as a code owner
// approves a change to the files it owns.
//
//   npx grillhouse consommateurs-arbitres   run from the repository root (a guard of grillhouse:gardes)
//
// - It judges the copy it runs in, on the branch `agent/<ticket>`: for each component the guards
//   judge (`aVerifier` of scripts/langages/typescript/interfaces-contre-code.mjs; in an envelope,
//   `GRILLHOUSE_ENVELOPPE`, the components of its plan), each list line (`- …`) of the
//   `## Consommateurs` section of its `docs/INTERFACE.md` in the working tree that the section of
//   HEAD does not hold is a changed line (an interface absent from HEAD: all its lines). The
//   section is read out of the generated part (between the marks of
//   scripts/langages/typescript/interfaces-contre-code.mjs): a bullet of an element's entry is no consumer. Out of a
//   branch `agent/…` (main, the detached copy of the integration, the CI, the night), there is no
//   lot: nothing is judged.
// - With a changed line, the comments of the ticket are read (`bd comments <ticket> --json`, run
//   from the main tree, the parent of git's common directory). A changed line passes when an
//   arbitrage of the supervisor that is settled (`arbitrageTranche`: a « ## Arbitrage… » comment,
//   `estArbitrage`, its verdict « tranché » or the owner's answer after it) names its consumer, the first
//   name between backquotes of the line, found as it is in the comment's text. Without a changed
//   line, bd is not called.
// - A changed line no arbitrage settles passes too when the ticket's plan (`bd show <ticket>
//   --json`: its title, and the sections « Architecture » and « Noms publiés » of its description,
//   each from its heading to the next heading of its level or above; never the rest of the
//   description, where a question or a criterion can name what the ticket keeps out) names its
//   consumer and each name the lot adds to the line, word for word (`nonNommes`): the names HEAD's
//   section already gives that consumer were settled before. The plan fixed them before the lot,
//   as a code owner's approval covers what it reviewed. The plan is read only for such a line; one
//   that cannot be read refuses, as the comments do.
// - A refusal names `<INTERFACE.md> § Consommateurs`, the line and the names the plan misses; a
//   refusal inscribed in the project's debt (`grillhouse-dette.json`, see `dette.mjs`) passes,
//   keyed by the interface and `consommateur-sans-arbitrage`. Comments that cannot be read refuse,
//   never inscribed.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lireLigne } from './consommateurs.mjs';
import { trancher } from '../../dette.mjs';
import { arbitrageTranche, estArbitrage } from '../../services-du-noyau.mjs';
import { aVerifier, marques } from './interfaces-contre-code.mjs';

const REGLE = 'consommateur-sans-arbitrage';

// The list lines of the section `## Consommateurs` of <texte>, trimmed, read out of its generated
// part (`marques`, scripts/langages/typescript/interfaces-contre-code.mjs): a bullet the generator writes there (a
// parameter, a member, a fault) is never a consumer.
function lignesConsommateurs(texte) {
  const m = marques(texte);
  const ecrites =
    m.etat === 'ok' ? [...m.lignes.slice(0, m.debut), ...m.lignes.slice(m.fin + 1)] : m.lignes;
  const out = [];
  let dedans = false;
  for (const l of ecrites) {
    if (/^##\s/.test(l)) dedans = /^##\s+Consommateurs\s*$/.test(l);
    else if (dedans && /^\s*-\s+\S/.test(l)) out.push(l.trim());
  }
  return out;
}

// The section of the ticket's description <description> whose heading's text <titre> matches:
// its lines from its heading to the next heading of its level or above, or '' without one.
function section(description, titre) {
  const out = [];
  let niveau = 0;
  for (const l of String(description ?? '').split('\n')) {
    const t = /^(#{1,6})\s+(.*)$/.exec(l);
    if (niveau && t && t[1].length <= niveau) break;
    if (niveau) out.push(l);
    else if (t && titre.test(t[2].trim())) niveau = t[1].length;
  }
  return out.join('\n');
}

// The names of <noms> the text <texte> does not name word for word: each one whole, with no
// character of a name (a letter, a digit, `_`, `$`, `-`) beside it; `*`, a namespace, between
// backquotes.
function nonNommes(texte, noms) {
  const echappe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nomme = nom =>
    nom === '*'
      ? texte.includes('`*`')
      : new RegExp(`(?<![\\w$-])${echappe(nom)}(?![\\w$-])`).test(texte);
  return noms.filter(n => !nomme(n));
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
    const lignesAvant = head.status === 0 ? lignesConsommateurs(head.stdout) : [];
    const avant = new Set(lignesAvant);
    // The names each consumer of HEAD's section reads (`lireLigne` of scripts/langages/typescript/consommateurs.mjs,
    // the one reading of such a line: a line that is no list of names gives none).
    const nomsAvant = new Map();
    for (const l of lignesAvant.map(lireLigne).filter(l => l?.noms)) {
      nomsAvant.set(l.consommateur, new Set([...(nomsAvant.get(l.consommateur) ?? []), ...l.noms]));
    }
    for (const ligne of lignesConsommateurs(readFileSync(iface, 'utf8'))) {
      if (avant.has(ligne)) continue;
      const l = lireLigne(ligne);
      const lue = l?.noms ? l : null;
      const deja = lue && nomsAvant.get(lue.consommateur);
      const ajoutes = lue ? lue.noms.filter(n => !deja?.has(n)) : null;
      changees.push({ rel, ligne, lue, ajoutes });
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
  // The lines no arbitrage settles: the ticket's plan, its title and its sections « Architecture »
  // and « Noms publiés ».
  const show = spawnSync('bd', ['show', ticket, '--json'], {
    cwd: principal,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  let plan;
  try {
    if (show.status !== 0) {
      throw new Error(show.stderr || show.error?.message || `code ${show.status}`);
    }
    const t = JSON.parse(show.stdout || '[]')?.[0];
    plan = [
      t?.title ?? '',
      section(t?.description, /^Architecture\b/),
      section(t?.description, /^Noms publiés\b/),
    ].join('\n');
  } catch (e) {
    return [
      {
        message: `Le ticket ${ticket} ne se lit pas (bd show ${ticket} --json) : ${String(e.message ?? e).trim()} ; les lignes Consommateurs changées ne se jugent pas.`,
      },
    ];
  }
  const constats = [];
  for (const { rel, ligne, lue, ajoutes } of restantes) {
    const manquants = lue ? nonNommes(plan, [lue.consommateur, ...ajoutes]) : null;
    if (manquants?.length === 0) continue;
    const consommateur = consommateurDe(ligne);
    const dit = manquants
      ? ` ; le plan ne nomme pas ${manquants.map(n => `\`${n}\``).join(', ')}`
      : '';
    constats.push({
      fichier: rel,
      regle: REGLE,
      message: `${rel} § Consommateurs : la ligne « ${ligne} » change sans arbitrage tranché au ticket ${ticket} qui nomme \`${consommateur}\`, ni plan du ticket (son titre, sa section « Architecture », sa section « Noms publiés ») qui nomme ce consommateur et chaque nom que le lot ajoute à la ligne${dit} ; une dépendance entre composants se décide avant de s'écrire : un commentaire « ## Arbitrage » tranché au ticket qui nomme ce consommateur, ou le plan du ticket qui la fixe.`,
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
