#!/usr/bin/env node
// The CI of a project's ticket branches: the queue enters a lot on main only once the CI of its
// branch `agent/<ticket>` judged it green (scripts/integration/file.mjs), so the project's CI must
// run on a push to `agent/**`, as bors needs a status on its staging branch.
//
//   node ci-des-branches.mjs --absente <project>   prints one line when no workflow of the project
//                                                  runs on a push to a ticket's branch
//
// - Whether a workflow runs on a push to a ticket's branch is the queue's own reading of the
//   workflows (`fluxDeLaBranche` of scripts/integration/file.mjs), here on the working tree's
//   `.github/workflows/*.yml` and `*.yaml`, for the branch `agent/ticket`.
// - `ajouterLesBranchesDeTicket` adds `agent/**` to the `on.push.branches` list of each workflow
//   that runs on a push to the branch main is pushed to (`grillhouse.poussee.commit`, `main` by
//   default), the CI of the lots, its comments and its layout kept (the library yaml's document);
//   a project already listening, or none to judge, is left as it is, `GESTE` the line left to it.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDocument } from 'yaml';
import { fluxDeLaBranche } from './integration/file.mjs';
import { lireCommit } from './poussee-cles.mjs';

/** The pattern of the ticket branches the queue pushes. */
export const BRANCHES_DE_TICKET = 'agent/**';
// A branch of a ticket, which the pattern matches.
const TEMOIN = 'agent/ticket';
const DOSSIER = '.github/workflows';
/** The gesture left to a project none of whose workflows runs on a push to `agent/**`. */
export const GESTE = `aucun flux de ${DOSSIER} ne se lance sur un push vers les branches de ticket : la file n'entre un lot sur main qu'une fois la CI de sa branche verte ; ajoute '${BRANCHES_DE_TICKET}' aux branches du push du flux de la CI du projet.`;

// The workflows of the working tree of <racine>: `{ chemin, texte }`.
function lesFlux(racine) {
  const dossier = path.join(racine, DOSSIER);
  if (!existsSync(dossier)) {
    return [];
  }
  return readdirSync(dossier)
    .filter(n => /\.ya?ml$/.test(n))
    .sort()
    .map(n => ({ chemin: `${DOSSIER}/${n}`, texte: readFileSync(path.join(dossier, n), 'utf8') }));
}

/** Whether a workflow of the project at <racine> runs on a push to a ticket's branch. */
export function ecouteLesBranchesDeTicket(racine) {
  return fluxDeLaBranche(lesFlux(racine), TEMOIN).length > 0;
}

// The branch main is pushed to, from the package.json of <racine>; `main` without it.
function principale(racine) {
  const f = path.join(racine, 'package.json');
  try {
    return lireCommit(JSON.parse(readFileSync(f, 'utf8'))).commit ?? 'main';
  } catch {
    return 'main';
  }
}

/**
 * `agent/**` added to the push of the CI of the lots of the project at <racine>: the workflows
 * written, none when the project already listens or has no workflow that runs on a push to main
 * with a list of branches to add it to. A workflow filtered on paths (a documentation published
 * when its sources change) is no CI of the lots, and is left.
 */
export function ajouterLesBranchesDeTicket(racine) {
  const flux = lesFlux(racine);
  if (fluxDeLaBranche(flux, TEMOIN).length > 0) {
    return [];
  }
  const surMain = new Set(fluxDeLaBranche(flux, principale(racine)));
  const ajoutes = [];
  for (const { chemin, texte } of flux.filter(f => surMain.has(f.chemin))) {
    const doc = parseDocument(texte);
    const branches = doc.getIn(['on', 'push', 'branches'], true);
    const chemins = ['paths', 'paths-ignore'].some(c => doc.hasIn(['on', 'push', c]));
    if (chemins || !branches || typeof branches.add !== 'function') {
      continue;
    }
    branches.add(doc.createNode(BRANCHES_DE_TICKET));
    writeFileSync(path.join(racine, chemin), doc.toString());
    ajoutes.push(chemin);
  }
  return ajoutes;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [option, racine] = process.argv.slice(2);
  if (option !== '--absente' || !racine) {
    process.stderr.write('usage: ci-des-branches.mjs --absente <projet>\n');
    process.exitCode = 2;
  } else if (!ecouteLesBranchesDeTicket(racine)) {
    process.stdout.write(`${BRANCHES_DE_TICKET}\n`);
  }
}
