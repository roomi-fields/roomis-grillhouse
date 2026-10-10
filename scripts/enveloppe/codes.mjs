#!/usr/bin/env node
// The exit codes of the envelope and its launcher, named once. `enveloppe.mjs` and the tests
// import them; `lancer.sh` reads them through `node codes.mjs`, which prints them as `NAME=value`.
import { pathToFileURL } from 'node:url';

// A malformed call: wrong arguments, unknown role, instruction missing or without its ticket.
export const CODE_USAGE = 2;
// A launch the envelope refuses, or that bwrap cannot build.
export const CODE_REFUS = 3;
// An agent copy the launcher cannot prepare: created, moved forward, installed or built.
export const CODE_COPIE = 4;

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  for (const [nom, valeur] of Object.entries({ CODE_USAGE, CODE_REFUS, CODE_COPIE })) {
    console.log(`${nom}=${valeur}`);
  }
}
