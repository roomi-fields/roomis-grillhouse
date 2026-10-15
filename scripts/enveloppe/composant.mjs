// The component of the envelope a command runs in. The envelope names it to every command of its
// session, in the variable `GRILLHOUSE_ENVELOPPE`: the component's path inside the copy
// (`packages/a`, or `src/parser` in a one-package project). As in a sandbox of Bazel, the
// neighbours arrive built and read-only: a command of the frame that reads it builds and writes
// that component only, and reads the neighbours by their published form.
//
// This module uses Node alone, as the modules of scripts/paquets.mjs.
export const VARIABLE = 'GRILLHOUSE_ENVELOPPE';

// The component of the envelope named in <env>, or null outside an envelope.
export const composantDeLEnveloppe = (env = process.env) => env[VARIABLE] || null;
