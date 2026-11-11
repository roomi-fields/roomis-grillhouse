// From 0.33.0 the queue enters a lot on main only once the CI of its branch `agent/<ticket>`
// judged it green (grillhouse-44b.12.5): the CI of the project runs on a push to `agent/**`.
//
// - The workflows of `.github/workflows/` that run on a push to the branch main is pushed to, and
//   list the branches of their push, gain `agent/**` (scripts/ci-des-branches.mjs).
// - A project whose CI already runs on a push to `agent/**` is left, nothing said: a second pass
//   changes nothing.
// - A project without such a workflow is left; `restes` says the gesture, which the update
//   reports without failing, as the opening of a session names it under « Manque ».
import {
  ajouterLesBranchesDeTicket,
  BRANCHES_DE_TICKET,
  ecouteLesBranchesDeTicket,
  GESTE,
} from '../ci-des-branches.mjs';

export const version = '0.33.0';
export const nom = 'ci des branches de ticket';

/** Adds `agent/**` to the push of the CI of the lots; returns what it did. */
export function migrer(projet) {
  return ajouterLesBranchesDeTicket(projet).map(
    f =>
      `${f} : '${BRANCHES_DE_TICKET}' ajoutée aux branches de son push, que la file pousse et dont la CI juge chaque lot`
  );
}

/** What stays to the project: the gesture, while no workflow runs on a push to `agent/**`. */
export function restes(projet) {
  return ecouteLesBranchesDeTicket(projet) ? [] : [GESTE];
}
