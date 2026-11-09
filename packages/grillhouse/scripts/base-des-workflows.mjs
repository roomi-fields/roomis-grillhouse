// The base of a pass in the workflows: a workflow that plays `verifier` gives it a base
// (`--base <commit>`, scripts/dernier-vert.mjs) for a push alone. A pull request, the call of the
// workflow by the release (workflow_call), the nightly schedule and any run without a push event play
// the complete pass, as `turbo --affected` takes its base (`TURBO_SCM_BASE`) from a push event.
//
// The control reads the text of each workflow of `.github/workflows`: a step that plays `verifier`
// with a base names, in its condition or in its own line, the event `push`, and, when it reads
// `github.event.before`, that this commit is not empty (the zeros of a first push are no base).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const PUSH = /github\.event_name\s*==\s*'push'/;
const AVANT_NON_VIDE = /github\.event\.before\s*!=\s*''/;

// The faults of the base in the workflow of text <texte>, one line each; none when no step gives
// a base, or when each step that does is conditioned on a push.
export function erreursDeBase(texte) {
  let flux;
  try {
    flux = parse(texte);
  } catch (e) {
    return [`le workflow ne se lit pas : ${e.message}`];
  }
  const erreurs = [];
  for (const [nomDuJob, job] of Object.entries(flux?.jobs ?? {})) {
    for (const etape of job?.steps ?? []) {
      const run = String(etape.run ?? '');
      if (!/\bverifier\b/.test(run) || !/--base\b/.test(run)) {
        continue;
      }
      const t = `${job.if ?? ''}\n${etape.if ?? ''}\n${run}`;
      const nom = `${nomDuJob} : ${etape.name ?? run.trim()}`;
      if (!PUSH.test(t)) {
        erreurs.push(`${nom} : la base se donne pour un push seulement (github.event_name == 'push')`);
      } else if (/github\.event\.before/.test(t) && !AVANT_NON_VIDE.test(t)) {
        erreurs.push(`${nom} : la base github.event.before se donne non vide (!= '')`);
      }
    }
  }
  return erreurs;
}

// The faults of the base in each workflow of `.github/workflows` of the repository at <racine>,
// each line led by the file.
export function erreursDesWorkflows(racine) {
  const dossier = path.join(racine, '.github', 'workflows');
  if (!existsSync(dossier)) {
    return [];
  }
  return readdirSync(dossier)
    .filter(f => /\.ya?ml$/.test(f))
    .sort()
    .flatMap(f =>
      erreursDeBase(readFileSync(path.join(dossier, f), 'utf8')).map(e => `${f} : ${e}`)
    );
}
