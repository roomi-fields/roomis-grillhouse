// The reading of the `grillhouse.poussee` keys of a package.json, shared by the night
// (scripts/nuit.sh), the pre-push guard (scripts/branche-de-nuit.mjs) and the queue
// (scripts/integration/file.mjs): the keys are read as written. `grillhouse.poussee` is absent,
// null or an object; `grillhouse.poussee.nuit` and `grillhouse.poussee.commit` are absent, null or
// a non-blank string.

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

// The branch the queue pushes main to: `grillhouse.poussee.commit`, `main` without the key (or with
// null). Returns { commit, faute }: `faute` is the faulty value as JSON, and `commit` null, when the
// key is not a non-blank string.
export function lireCommit(pkg) {
  const p = pkg?.grillhouse?.poussee;
  if (p === undefined || p === null) {
    return { commit: 'main', faute: null };
  }
  if (typeof p !== 'object' || Array.isArray(p)) {
    return { commit: null, faute: JSON.stringify(p) };
  }
  const c = p.commit;
  if (c === undefined || c === null) {
    return { commit: 'main', faute: null };
  }
  if (typeof c !== 'string' || !c.trim()) {
    return { commit: null, faute: JSON.stringify(c) };
  }
  return { commit: c, faute: null };
}
