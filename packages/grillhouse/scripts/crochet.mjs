#!/usr/bin/env node
// One git hook of the frame at work: the guard of the hook <nom> (`CROCHETS` of
// scripts/crochets.mjs), run with git's arguments and standard input, its exit code the hook's.
//
//   npx grillhouse hook <nom> [git's arguments…]
//
// - The guard runs in this process, as if Node had been given its path, as `grillhouse` runs a
//   subcommand (bin/grillhouse.mjs).
// - A name that is not a hook of the frame is refused, named on the error stream; exit code 2.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CROCHETS } from './crochets.mjs';

const [nom, ...args] = process.argv.slice(2);
if (nom === undefined || !Object.hasOwn(CROCHETS, nom)) {
  process.stderr.write(
    `⛔ crochet inconnu : ${nom ?? '(aucun)'} ; crochets du cadre : ${Object.keys(CROCHETS).join(', ')}\n`
  );
  process.exitCode = 2;
} else {
  const garde = path.join(path.dirname(fileURLToPath(import.meta.url)), CROCHETS[nom].garde);
  process.argv = [process.argv[0], garde, ...args];
  await import(pathToFileURL(garde).href);
}
