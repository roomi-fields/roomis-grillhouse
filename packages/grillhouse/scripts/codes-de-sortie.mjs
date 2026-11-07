// The exit codes the frame's processes share, with no input nor output, as sysexits.h names them:
// a module a pure module (scripts/etapes.mjs, scripts/transitions.mjs) imports with no reading of
// the machine.
//
// - A_REPASSER, 75, is the exit code of « à repasser » (EX_TEMPFAIL of sysexits.h: try again
//   later), neither green nor red: a measure of time under load (scripts/mesure/pression.mjs), the
//   wait of the lock of the machine at its bound (scripts/verrou-de-machine.mjs), a stop of the
//   circuit that a gesture settles (scripts/etapes.mjs, ARRETS).
export const A_REPASSER = 75;
