// The stand-in of a slow server of trial (./essai.spec.ts): `node relais-lent.mjs <cible> <the
// arguments of temporal server start-dev>`. It listens at once on the port of its arguments
// (`--port`) and forwards each connection to the port <cible> of the loopback, where the real
// server starts later; a connection that finds no server there is closed.
import { connect, createServer } from 'node:net';

const [cible, ...args] = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]);

createServer(entree => {
  const sortie = connect(Number(cible), '127.0.0.1');
  sortie.once('error', () => entree.destroy());
  entree.once('error', () => sortie.destroy());
  entree.pipe(sortie).pipe(entree);
}).listen(port, '127.0.0.1');
