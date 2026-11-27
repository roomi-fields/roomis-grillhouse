#!/usr/bin/env node
// The judged main guard (packages/grillhouse/docs/architecture/entree.md §3.1 « Garde de main »,
// §3.3, §5.1): a push to origin of the branch main carries only a commit whose tree a
// final pass of the circuit, or the verification of the rescue way, judged green
// (scripts/arbres-juges.mjs), as bors and the merge queues enter only a tree already judged
// (`refusSurMain`), in every project. Run by the pre-push hook of the frame with git's arguments
// (remote name, remote URL) and, on the standard input, the lines
// « <local ref> <local sha> <remote ref> <remote sha> » git writes.
//
// - Only the remote `origin` is watched. Main is the one branch that receives the lots; the queue
//   pushes such a commit, and the CI of main plays after, by batches. No CI of a ticket's branch is
//   asked.
// - A project whose package.json carries the retired key `grillhouse.poussee` is refused by its
//   name (scripts/poussee-retiree.mjs), whatever its value.
// - Exit 0 lets the push go on; exit 1 refuses it, the reason on the standard error.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { commitEstJuge } from './arbres-juges.mjs';
import { ecartsDuDossier } from './etat-du-depot.mjs';
import { pousseeRetiree } from './poussee-retiree.mjs';

// A sha of zeros: the deletion of the remote branch.
const SUPPRESSION = /^0+$/;

/**
 * The refusals for a push to `remote` of `refs` to main: each commit <jugee(sha)> does not say
 * judged by a final pass or a verification is refused, named.
 * @param {string} remote
 * @param {{ sha: string, distante: string }[]} refs
 * @param {{ jugee: (sha: string) => boolean }} o
 * @returns {string[]}
 */
export function refusSurMain(remote, refs, { jugee, tete, ecarts }) {
  if (remote !== 'origin') {
    return [];
  }
  return refs
    .filter(r => r.distante === 'refs/heads/main' && !SUPPRESSION.test(r.sha))
    .filter(r => !jugee(r.sha))
    .map(r => {
      const base = `⛔ ${r.sha.slice(0, 8)} n'est jugé vert par aucune passe finale ni vérification de lot : main n'avance que sur un arbre jugé. Joue \`npm run verifier\` sur ce commit (vérification de la voie de secours), ou laisse la file du circuit jouer sa passe finale.`;
      const fichiers = tete === r.sha && ecarts ? ecarts() : [];
      return fichiers.length
        ? `${base} Le dossier diffère du commit par : ${fichiers.join(', ')} (commite-les ou restaure-les).`
        : base;
    });
}

// The refusals for a push to `remote` of `refs` given the package.json object `pkg`: the retired
// key `grillhouse.poussee` refuses it by its name; an empty list lets the push go on.
export function refus(remote, refs, pkg) {
  const ligne = remote === 'origin' ? pousseeRetiree(pkg) : null;
  return ligne ? [`⛔ ${ligne}`] : [];
}

// The pushed refs of git's standard input.
export function lireRefs(texte) {
  return texte
    .split('\n')
    .filter(l => l.trim())
    .map(l => {
      const [locale, sha, distante] = l.trim().split(/\s+/);
      return { locale, sha, distante };
    });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const fichier = path.join(racine, 'package.json');
  const pkg = existsSync(fichier) ? JSON.parse(readFileSync(fichier, 'utf8')) : null;
  const refs = lireRefs(readFileSync(0, 'utf8'));
  const lignes = [
    ...refus(process.argv[2], refs, pkg),
    ...refusSurMain(process.argv[2], refs, {
      jugee: sha => commitEstJuge(racine, sha),
      tete: execFileSync('git', ['-C', racine, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      ecarts: () => ecartsDuDossier(racine),
    }),
  ];
  for (const l of lignes) {
    process.stderr.write(`${l}\n`);
  }
  process.exitCode = lignes.length ? 1 : 0;
}
