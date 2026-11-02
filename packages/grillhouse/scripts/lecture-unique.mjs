// The readings done once in a scope, as a build of Bazel reads each file once whatever the number
// of targets that ask it: inside `avecUneLecture`, a reading kept under its key (`luUneFois`) is
// done at its first call and given again after; out of any scope, it is done at each call. A
// scope is the time of one gesture of the core that asks a module many questions on a tree that
// does not move (the sweep of the siblings of HEAD's version, scripts/circuit.mjs); a module of
// language keeps there what it reads at a cost (cargo's metadata). A reading that throws is not
// kept. The scope lives on the process under a global symbol, so that every instance of this file
// shares it: the modules of language are loaded by `require` (./langages.mjs), which a test
// runner may load apart from the core's imports.

const PORTEE = Symbol.for('grillhouse.lecture-unique');

/** @returns {Map<string, unknown> | undefined} */
const portee = () => /** @type {any} */ (globalThis)[PORTEE];

/**
 * Runs <faire> in a scope of readings done once, and returns what it returns; inside a scope
 * already open, in that one.
 * @template T
 * @param {() => T} faire
 * @returns {T}
 */
export function avecUneLecture(faire) {
  if (portee()) {
    return faire();
  }
  /** @type {any} */ (globalThis)[PORTEE] = new Map();
  try {
    return faire();
  } finally {
    delete (/** @type {any} */ (globalThis)[PORTEE]);
  }
}

/**
 * What <lire> returns, read once under <cle> in the scope open, at each call out of any.
 * @template T
 * @param {string} cle
 * @param {() => T} lire
 * @returns {T}
 */
export function luUneFois(cle, lire) {
  const p = portee();
  if (!p) {
    return lire();
  }
  if (!p.has(cle)) {
    p.set(cle, lire());
  }
  return /** @type {T} */ (p.get(cle));
}
