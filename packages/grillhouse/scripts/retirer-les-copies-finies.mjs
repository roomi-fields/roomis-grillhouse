// The command of the removal of the finished copies (./copies-finies.mjs), which the night runs
// once its steps are played (scripts/nuit.sh):
//
//   node scripts/retirer-les-copies-finies.mjs [<copie finie de jouer>…]   from the main tree
//
// - The circuits that run are what the Temporal server says (./circuits-du-serveur.mjs, one call,
//   5 s at most); a server that does not answer, a client not built or any other fault of that
//   reading leaves them unread (null), as the removal of ./copies-finies.mjs takes them.
// - The removal lives in ./copies-finies.mjs, which imports nothing of the built `dist/`: the lock
//   of the machine (./verrou-de-machine.mjs) and the base configuration of the tests import it,
//   and a project of trial holds the frame's scripts without `dist/`.
import { circuitsDuServeur } from './circuits-du-serveur.mjs';
import { retirerLesCopiesDuDepot } from './copies-finies.mjs';

const racine = process.cwd();
let vivants = null;
try {
  vivants = new Set((await circuitsDuServeur(racine)).filter(c => c.vivant).map(c => c.ticket));
} catch {
  vivants = null;
}
const lignes = retirerLesCopiesDuDepot(racine, process.argv.slice(2), vivants);
if (lignes.length) {
  process.stdout.write(`${lignes.join('\n')}\n`);
}
