// The command of the removal of the finished copies (./copies-finies.mjs), which the night runs
// once its steps are played (scripts/nuit.sh):
//
//   node scripts/retirer-les-copies-finies.mjs [<copie finie de jouer>…]   from the main tree
//
// - The circuits that hold their copy are what the Temporal server says (./circuits-du-serveur.mjs,
//   one call, 5 s at most): each that has not ended (it runs, or waits an answer or a place), and
//   each ended without its issue, which waits the supervisor's answer; a server that does not
//   answer, a client not built or any other fault of that reading leaves them unread (null), and
//   the removal of ./copies-finies.mjs then keeps each copy beside its `.travail`.
// - The removal lives in ./copies-finies.mjs, which imports nothing of the built `dist/`: the lock
//   of the machine (./verrou-de-machine.mjs) and the base configuration of the tests import it,
//   and a project of trial holds the frame's scripts without `dist/`.
import { circuitsDuServeur } from './circuits-du-serveur.mjs';
import { retirerLesCopiesDuDepot } from './copies-finies.mjs';

const racine = process.cwd();
let tenus = null;
try {
  tenus = new Set(
    (await circuitsDuServeur(racine)).filter(c => c.fin === null || c.question).map(c => c.ticket)
  );
} catch {
  tenus = null;
}
const lignes = retirerLesCopiesDuDepot(racine, process.argv.slice(2), tenus);
if (lignes.length) {
  process.stdout.write(`${lignes.join('\n')}\n`);
}
