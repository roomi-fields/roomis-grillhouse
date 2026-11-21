// The key `grillhouse.poussee` is retired from the frame: one branch, main, receives every lot (the
// trunk-based development of Google and Chromium). This one reading serves the queue
// (scripts/integration/file.mjs), the night (scripts/nuit.sh) and the pre-push guard
// (scripts/branche-de-nuit.mjs): whatever the value of the key (null, an object, a string), the
// project that carries it is refused by its name, with the gesture (remove the key).

/**
 * The refusal line of a package.json that carries `grillhouse.poussee`, or null without it.
 * @param {unknown} pkg
 * @returns {string | null}
 */
export function pousseeRetiree(pkg) {
  const grillhouse = pkg?.grillhouse;
  if (!grillhouse || typeof grillhouse !== 'object' || !Object.hasOwn(grillhouse, 'poussee')) {
    return null;
  }
  return 'La clé grillhouse.poussee est retirée du cadre : main reçoit seule chaque lot. Retire-la du package.json (npm pkg delete grillhouse.poussee).';
}
