// What a role session leaves of its output stream (claude's `--output-format stream-json`), read
// by both launchers once claude ends (scripts/seances.mjs out of the envelope,
// scripts/enveloppe/lancer.sh in it). A message of the stream is a line that holds a JSON object
// with a `type`. The result of the session is the line `type: result` alone: its sheet, the refusal
// of the API key and the usage limit are read there. The ticket's log takes that line and, as they
// are, the lines that are no message; the other messages stay in the transcript of the session.
// Without a result, the log takes after them the text of the last `assistant` message, where a
// usage limit said there is read at its end; the result of a tool, which may quote such a limit,
// never enters it. Architecture: docs/architecture/machine.md (§3.2).
//
//   node sortie-de-seance.mjs <flux> <résultat>
//
// writes the result of the stream read in the file <flux> into <résultat> (empty without one), and
// the lines of the log on its standard output.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// The message the line holds, or null for a line that is none.
function messageDe(ligne) {
  try {
    const m = JSON.parse(ligne);
    return typeof m?.type === 'string' ? m : null;
  } catch {
    return null;
  }
}

const texteDe = message =>
  (Array.isArray(message.message?.content) ? message.message.content : [])
    .filter(bloc => bloc.type === 'text')
    .map(bloc => bloc.text)
    .join('\n');

/**
 * The stream `flux` sorted: `resultat`, its line `type: result` (the last one), empty without one;
 * `journal`, the lines the ticket's log takes.
 */
export function trierLeFlux(flux) {
  const lignes = flux.split('\n');
  if (lignes.at(-1) === '') {
    lignes.pop();
  }
  const journal = [];
  let resultat = '';
  let dernier = null;
  for (const ligne of lignes) {
    const message = messageDe(ligne);
    if (message?.type === 'result') {
      resultat = ligne;
    }
    if (message?.type === 'assistant') {
      dernier = message;
    }
    if (!message || message.type === 'result') {
      journal.push(ligne);
    }
  }
  const dit = !resultat && dernier ? texteDe(dernier) : '';
  if (dit) {
    journal.push(dit);
  }
  return { resultat, journal };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [flux, fichier] = process.argv.slice(2);
  const { resultat, journal } = trierLeFlux(readFileSync(flux, 'utf8'));
  writeFileSync(fichier, resultat ? `${resultat}\n` : '');
  process.stdout.write(journal.map(l => `${l}\n`).join(''));
}
