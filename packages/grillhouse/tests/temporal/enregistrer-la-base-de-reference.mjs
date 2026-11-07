#!/usr/bin/env node
// The recording of the database file of reference (base-de-reference/temporal.db), which
// base-de-reference.spec.ts reads under the current server: run once by the pinned program, the
// file committed, and kept as it is at the next raise of the pin, so that the test then reads a
// file of the version before.
//
//   TEMPORAL=<programme> node tests/temporal/enregistrer-la-base-de-reference.mjs <fichier>
//
// - It starts the development server of TEMPORAL on a free port with <fichier> as its database,
//   the frame's search attributes registered, and the sonde's worker (dist/temporal/travailleur.js,
//   built), sets the retention of the namespace `default` to a century (start-dev gives it 24 h,
//   which purged the file's closed workflow one day after its recording), plays the workflow
//   `sonde-reference` (ticket `reference`, two steps, the wait for the signal FINIR, the signal
//   sent), then stops the worker and the server by SIGTERM, so that the file is whole. <fichier>
//   must not exist.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  ATTRIBUTS_DE_RECHERCHE,
  lireLeDeroule,
  ouvrirLeClient,
} from '../../dist/temporal/client.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const TRAVAILLEUR = path.resolve(ICI, '../../dist/temporal/travailleur.js');
const [fichier] = process.argv.slice(2);
const programme = process.env.TEMPORAL;
if (!fichier || existsSync(fichier) || !programme) {
  process.stderr.write(
    'Usage : TEMPORAL=<programme> enregistrer-la-base-de-reference.mjs <fichier neuf>\n'
  );
  process.exit(2);
}

const pause = ms => new Promise(r => setTimeout(r, ms));
const port = await new Promise(ok => {
  const s = createServer().listen(0, '127.0.0.1', () => {
    const p = s.address().port;
    s.close(() => ok(p));
  });
});
const args = ['server', 'start-dev', '--headless', '--ip', '127.0.0.1', '--port', String(port)];
args.push('--db-filename', path.resolve(fichier), '--log-level', 'warn');
for (const [k, t] of Object.entries(ATTRIBUTS_DE_RECHERCHE)) {
  args.push('--search-attribute', `${k}=${t}`);
}
const serveur = spawn(programme, args, { stdio: 'inherit' });
for (;;) {
  const ok = await new Promise(r => {
    const s = connect(port, '127.0.0.1');
    s.once('connect', () => (s.destroy(), r(true)));
    s.once('error', () => r(false));
  });
  if (ok) {
    break;
  }
  await pause(200);
}
const adresse = `127.0.0.1:${port}`;
const travailleur = spawn(process.execPath, [TRAVAILLEUR, '--file', 'reference'], {
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, TEMPORAL_ADDRESS: adresse },
});
await new Promise(ok =>
  createInterface({ input: travailleur.stdout }).on('line', l => l.startsWith('prêt') && ok())
);
const { client, fermer } = ouvrirLeClient({ adresse });
const fin = p => new Promise(ok => (p.once('exit', ok), p.kill('SIGTERM')));
// The namespace answers once the frontend serves: until then (UNAVAILABLE, gRPC code 14, within
// 30 s), the call is tried again; any other refusal of the retention is named, and stops here.
const SIECLE = 100 * 365 * 86_400;
const INDISPONIBLE = 14;
const limite = Date.now() + 30_000;
for (;;) {
  const refus = await client.connection.workflowService
    .updateNamespace({
      namespace: 'default',
      config: { workflowExecutionRetentionTtl: { seconds: SIECLE } },
    })
    .then(() => null)
    .catch(e => e);
  if (!refus) {
    break;
  }
  if (refus.code !== INDISPONIBLE || Date.now() > limite) {
    process.stderr.write(`La rétention d'un siècle de default est refusée : ${refus.message}\n`);
    await fermer();
    await fin(travailleur);
    await fin(serveur);
    process.exit(1);
  }
  await pause(200);
}
const h = await client.workflow.start('sonde', {
  workflowId: 'sonde-reference',
  taskQueue: 'reference',
  args: [{ ticket: 'reference', etapes: 2, pauseMs: 50, attendreLeSignal: true }],
  memo: { ticket: 'reference' },
});
while ((await lireLeDeroule(client, 'sonde-reference')).etape !== 'attente') {
  await pause(200);
}
await h.signal('finir');
process.stdout.write(`${JSON.stringify(await h.result())}\n`);
await fermer();
await fin(travailleur);
await fin(serveur);
