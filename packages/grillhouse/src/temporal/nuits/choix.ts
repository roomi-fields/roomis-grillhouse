// The choice of the nights of the machine (grillhouse-4nr.13): which projects of the register play
// their night, as Jenkins builds nothing without a change and Turborepo replays from its cache a
// task whose inputs did not move. The activities of the nights (./activites.ts) call it.
//
// - The projects are those the register of the machine names (`projet` of each line,
//   scripts/registre.mjs), in the order of their paths: a project enters at its first session
//   noted, no line written by hand.
// - A project is left out, its reason written, when its root no longer exists, or when no night is
//   wired there: no command of the frame (`node_modules/.bin/grillhouse`), no script `verifier` in
//   its package.json (which the night plays), or no commit.
// - A project is skipped when its top (HEAD of its main tree, which the night plays) is the commit
//   of its last green night, the marker that the green night alone writes
//   (`<git common dir>/nuit/dernier-vert`, scripts/nuit.sh), apart from the last green that the
//   day's passes write too (scripts/dernier-vert.mjs): a project integrated green in the day plays
//   its night tests and its benches. A project without a marker, or whose marker no longer reads as
//   a commit of the repository, plays.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ChoixDesNuits, Saut } from './contrat.js';

const SHA = /^[0-9a-f]{40,64}$/;

// git in <racine>: its output trimmed, or null when it fails.
function git(racine: string, ...args: string[]): string | null {
  const r = spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** The projects the register text <texte> names, each once, in the order of their paths. */
export function projetsDuRegistre(texte: string): string[] {
  const projets = new Set<string>();
  for (const l of texte.split('\n')) {
    try {
      const p = (JSON.parse(l) as { projet?: unknown } | null)?.projet;
      if (typeof p === 'string' && path.isAbsolute(p)) {
        projets.add(p);
      }
    } catch {
      // A torn line names nothing.
    }
  }
  return [...projets].sort();
}

/** Why the project at <racine> plays no night (its root gone, no night wired), or null. */
export function ecartDuProjet(racine: string): string | null {
  if (!existsSync(racine)) {
    return 'sa racine n’existe plus';
  }
  if (!existsSync(path.join(racine, 'node_modules/.bin/grillhouse'))) {
    return 'aucune nuit branchée : node_modules/.bin/grillhouse manque';
  }
  let scripts: Record<string, unknown> = {};
  try {
    scripts =
      (
        JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8')) as {
          scripts?: Record<string, unknown>;
        }
      ).scripts ?? {};
  } catch {
    return 'aucune nuit branchée : son package.json ne se lit pas';
  }
  if (typeof scripts.verifier !== 'string') {
    return 'aucune nuit branchée : son package.json n’a pas de script verifier';
  }
  if (!git(racine, 'rev-parse', '--verify', '-q', 'HEAD^{commit}')) {
    return 'aucune nuit branchée : pas de dépôt git, ou aucun commit';
  }
  return null;
}

/** The marker of the last green night of the repository at <racine>, or null out of git. */
export function marqueurDeLaNuit(racine: string): string | null {
  const commun = git(racine, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  return commun ? path.join(commun, 'nuit', 'dernier-vert') : null;
}

/**
 * The skip of the project at <racine> when its top is the commit of its last green night; else
 * null: it plays (its top moved, or no marker that reads as a commit of the repository).
 */
export function sautDuProjet(racine: string): Saut | null {
  const sommet = git(racine, 'rev-parse', '--verify', '-q', 'HEAD^{commit}');
  const marqueur = marqueurDeLaNuit(racine);
  if (!sommet || !marqueur) {
    return null;
  }
  let reference: string;
  try {
    reference = readFileSync(marqueur, 'utf8').trim();
  } catch {
    return null;
  }
  if (!SHA.test(reference) || git(racine, 'cat-file', '-e', `${reference}^{commit}`) === null) {
    return null;
  }
  return reference === sommet
    ? {
        racine,
        raison: `son sommet ${sommet.slice(0, 7)} est celui de sa dernière nuit verte : rien n’a bougé`,
        sommet,
        reference,
      }
    : null;
}

/** The choice of a scheduled night among <projets>: left out, skipped, or played, in their order. */
export function choisir(projets: string[]): ChoixDesNuits {
  const choix: ChoixDesNuits = { jouer: [], sautes: [], ecartes: [] };
  for (const racine of projets) {
    const raison = ecartDuProjet(racine);
    if (raison) {
      choix.ecartes.push({ racine, raison });
      continue;
    }
    const saut = sautDuProjet(racine);
    if (saut) {
      choix.sautes.push(saut);
    } else {
      choix.jouer.push(racine);
    }
  }
  return choix;
}
