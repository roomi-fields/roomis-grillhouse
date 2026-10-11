// The reading of the `grillhouse.poussee` keys of a package.json, shared by the night
// (scripts/nuit.sh) and the pre-push guard (scripts/branche-de-nuit.mjs): the keys are read as
// written. `grillhouse.poussee` is absent, null or an object; `grillhouse.poussee.nuit` is absent,
// null or a non-blank string.

// Returns { nuit, fautes }: `nuit` the night branch, or null when the key is absent or faulty;
// `fautes` one entry { cle, valeur } per faulty key, `valeur` as JSON.
export function lirePoussee(pkg) {
  const fautes = [];
  let nuit = null;
  const p = pkg?.grillhouse?.poussee;
  if (p !== undefined && p !== null) {
    if (typeof p !== 'object' || Array.isArray(p)) {
      fautes.push({ cle: 'grillhouse.poussee', valeur: JSON.stringify(p) });
    } else if (p.nuit !== undefined && p.nuit !== null) {
      if (typeof p.nuit !== 'string' || !p.nuit.trim()) {
        fautes.push({ cle: 'grillhouse.poussee.nuit', valeur: JSON.stringify(p.nuit) });
      } else {
        nuit = p.nuit;
      }
    }
  }
  return { nuit, fautes };
}
