#!/usr/bin/env node
// The night branch guard: refuses a push to origin that reaches the branch named by
// `grillhouse.poussee.nuit`, unless the night makes the push. Run by the pre-push hook of the
// frame with git's arguments (remote name, remote URL) and, on the standard input, the lines
// « <local ref> <local sha> <remote ref> <remote sha> » git writes.
//
// - Only the remote `origin` is watched, the one the night pushes to. A push of several refs one
//   of which reaches the branch, and the deletion of that remote branch, are refused whole.
// - The key is read as written in the package.json at the root of the working tree the push starts
//   from; without the key (or null) nothing is refused. An invalid value (see
//   scripts/poussee-cles.mjs) refuses the push, with a line that cites the key.
// - The night makes itself known by GRILLHOUSE_NUIT=1, which scripts/nuit.sh sets for its push
//   alone. It is a mark, not a secret: a human who sets it is trusted.
// - Exit 0 lets the push go on; exit 1 refuses it, the reason on the standard error.
//
// The judged main: in a project whose CI runs on the ticket branches (`agent/**`,
// scripts/ci-des-branches.mjs), a push to origin of the branch main is pushed to
// (`grillhouse.poussee.commit`, `main` by default) carries only a commit a run of the CI concluded
// green on a ticket branch, as bors and the merge queues enter only a tree already judged
// (`refusSurMain`). The queue pushes such a commit; any other change goes by its ticket branch
// first. The ruleset of the repository on GitHub holds the same rule on the server; a reading of
// the runs that fails lets the push go, the server judging it.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ecouteLesBranchesDeTicket } from './ci-des-branches.mjs';
import { lireCommit, lirePoussee } from './poussee-cles.mjs';

// A sha of zeros: the deletion of the remote branch.
const SUPPRESSION = /^0+$/;

/**
 * The refusals for a push to `remote` of `refs` to the branch `principale` of a project that
 * `ecoute` the ticket branches: each commit <jugee(sha)> does not say judged green on a ticket
 * branch is refused, named.
 * @param {string} remote
 * @param {{ sha: string, distante: string }[]} refs
 * @param {{ principale: string | null, ecoute: boolean, jugee: (sha: string) => boolean }} o
 * @returns {string[]}
 */
export function refusSurMain(remote, refs, { principale, ecoute, jugee }) {
  if (remote !== 'origin' || !ecoute || !principale) {
    return [];
  }
  return refs
    .filter(r => r.distante === `refs/heads/${principale}` && !SUPPRESSION.test(r.sha))
    .filter(r => !jugee(r.sha))
    .map(
      r =>
        `⛔ ${r.sha.slice(0, 8)} n'est jugé vert par la CI d'aucune branche de ticket : main n'avance que sur un arbre jugé. Pousse d'abord sur agent/<ticket>, attends sa CI verte, puis avance main sur ce commit.`
    );
}

/**
 * Whether one of the runs <runs> of a commit (`gh run list --json headBranch,conclusion`)
 * concluded green on a ticket branch. The conclusion is read run by run: the status filter of
 * GitHub's API lags its runs by minutes (grillhouse-do5e).
 * @param {{ headBranch?: string, conclusion?: string }[]} runs
 */
export const jugeeDansLesRuns = runs =>
  runs.some(x => x.conclusion === 'success' && String(x.headBranch).startsWith('agent/'));

// Whether a run of the CI concluded green on the commit <sha> on a ticket branch, read by gh in
// <racine>; true when gh does not answer (the server's ruleset judges then).
function jugeeParGh(racine, sha) {
  const r = spawnSync('gh', ['run', 'list', '--commit', sha, '--json', 'headBranch,conclusion'], {
    cwd: racine,
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (r.status !== 0) {
    return true;
  }
  try {
    return jugeeDansLesRuns(JSON.parse(r.stdout || '[]'));
  } catch {
    return true;
  }
}

// The refusals for a push to `remote` of `refs` (the lines git writes) given the package.json
// object `pkg`; an empty list lets the push go on.
export function refus(remote, refs, pkg, env = process.env) {
  if (remote !== 'origin' || env.GRILLHOUSE_NUIT === '1' || !pkg) {
    return [];
  }
  const { nuit, fautes } = lirePoussee(pkg);
  if (fautes.length) {
    return fautes.map(
      f => `⛔ La clé ${f.cle} vaut ${f.valeur} : valeur invalide, la poussée est refusée.`
    );
  }
  if (nuit && refs.some(r => r.distante === `refs/heads/${nuit}`)) {
    return [`⛔ Seule la nuit pousse origin/${nuit} (grillhouse.poussee.nuit), après son vert.`];
  }
  return [];
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
      principale: pkg ? lireCommit(pkg).commit : null,
      ecoute: ecouteLesBranchesDeTicket(racine),
      jugee: sha => jugeeParGh(racine, sha),
    }),
  ];
  for (const l of lignes) {
    process.stderr.write(`${l}\n`);
  }
  process.exitCode = lignes.length ? 1 : 0;
}
