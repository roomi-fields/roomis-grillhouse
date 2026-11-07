// The delays of the sizes of test, in ms, on the model of Bazel's test-encyclopedia: small, medium,
// large. A module of its own, with no import: the configurations of Vitest (./base.mjs,
// ../vitest.nuit.config.mjs) are bundled by Vite and read only these numbers, while the
// classification that deduces a file's size (./delais.mjs) reads the guard of the sizes, a script.

/** The delay of each size, in ms (Bazel: small 60 s, medium 300 s, large 900 s). */
export const DELAIS_MS = { petit: 60000, moyen: 300000, grand: 900000 };

/** The delay of a night test, in ms: the large delay. */
export const DELAI_NUIT_MS = DELAIS_MS.grand;

/** The delay of a size as a line writes it: « petit, 60 s ». */
export const libelleDuDelai = taille => `${taille}, ${DELAIS_MS[taille] / 1000} s`;
