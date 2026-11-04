#!/usr/bin/env node
// The build of an agent's copy before its session, the command `construire` of the module
// typescript (scripts/jointure.d.ts), which the launcher (scripts/enveloppe/lancer.sh) runs in the
// prepared copy, through its mounts: the session finds built what it reads out of its plan.
//
//   node construire.mjs --echec <fichier> <plan>     from the root of the copy
//
// - The launcher is the core's, one for every language (`construireDepuisLesArguments` of
//   scripts/taches-du-graphe.mjs): the plan and its providers by `turbo run build
//   --filter=<paquet>…`, the whole copy for a plan with a path that is no package of the graph.
//   This module gives it Turborepo, the task runner of the graph.
// - The exit code: 0 when the launch goes on, a build failure included; 1 for a step that stops it;
//   2 for a malformed call.
import { pathToFileURL } from 'node:url';
import { construireDepuisLesArguments } from '../../services-du-noyau.mjs';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = construireDepuisLesArguments('turbo', process.argv.slice(2));
}
