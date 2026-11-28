// The standard input of a role session, which both launchers compose here (scripts/seances.mjs
// out of the envelope, scripts/enveloppe/lancer.sh in it), as claude reads it under
// `--input-format stream-json`: the `initialize` request, whose `skills` bound the skills the
// session lists and may load by the tool Skill, then the whole instruction as one message of the
// user, one line of JSON each. No setting of `--settings` takes a skill of a plugin out of that
// list; the field `skills` is in the protocol of the Agent SDK, absent from `claude --help`, and
// the night holds it (packages/grillhouse-essais/tests/competences-de-seance.nuit.spec.ts).
// Architecture: docs/architecture/machine.md (§3.2).
//
//   node entree-de-seance.mjs <rôle> < <consigne>
//
// writes the input of a session of <rôle> that carries the instruction, with the skills of the role
// (`competencesDuRole` of scripts/droits.mjs).
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { competencesDuRole } from './droits.mjs';

/** The input of a session that lists the skills `competences` and receives `consigne`. */
export function entreeDeSeance({ competences, consigne }) {
  const messages = [
    {
      type: 'control_request',
      request_id: randomUUID(),
      request: { subtype: 'initialize', skills: competences },
    },
    { type: 'user', message: { role: 'user', content: consigne }, parent_tool_use_id: null },
  ];
  return messages.map(m => `${JSON.stringify(m)}\n`).join('');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const competences = competencesDuRole(process.argv[2]);
  process.stdout.write(entreeDeSeance({ competences, consigne: readFileSync(0, 'utf8') }));
}
