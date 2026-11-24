// The exit codes the frame's processes share, with no input nor output, as sysexits.h names them:
// a module a pure module (scripts/etapes.mjs, scripts/transitions.mjs) imports with no reading of
// the machine.
//
// - A_REPASSER, 75, is the exit code of « à repasser » (EX_TEMPFAIL of sysexits.h: try again
//   later), neither green nor red: a measure of time under load (scripts/mesure/pression.mjs), the
//   wait for the part of the machine at its bound (scripts/places-de-la-machine.mjs), a stop of the
//   circuit that a gesture settles (scripts/etapes.mjs, ARRETS; circuit.md §5.5).
export const A_REPASSER = 75;

/**
 * The file a pass cut by the watch of its memory (scripts/garde-de-la-memoire.mjs) leaves in its
 * results directory, its reason inside: its 75 is no wait of the machine, and counts as a replay.
 */
export const MEMOIRE_COUPEE = 'memoire-coupee.txt';
