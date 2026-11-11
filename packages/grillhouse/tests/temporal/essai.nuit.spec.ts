// @poste: un serveur Temporal
// The development server of trial (./essai.ts, `demarrerLeServeur`) resolves once its frontend
// answers, not once its port accepts a connection: a server whose port opens before its frontend
// serves (« Frontend is not healthy yet » under load) would fail the first call of a test.
// Witness: tests/temporal/file.nuit.spec.ts red under load on 2026-11-04 (grillhouse-4nr.8).
// The stand-in of a slow server: a relay (./relais-lent.mjs) that opens the port at once and
// forwards each connection to the real server, which starts on another port only seconds later.
import { chmodSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Connection } from '@temporalio/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ATTRIBUTS_DE_RECHERCHE } from '../../src/temporal/client.js';
import { demarrerLeServeur, dossier, portLibre, programmeTemporal } from './essai.js';

const RELAIS = path.join(__dirname, 'relais-lent.mjs');

const arrets: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const a of arrets.splice(0)) {
    await a();
  }
});

// A program that starts the relay towards the port <cible>, with the arguments of the server.
function programmeLent(cible: number): string {
  const p = path.join(dossier('lent'), 'temporal-lent');
  writeFileSync(p, `#!/bin/sh\nexec "${process.execPath}" "${RELAIS}" ${cible} "$@"\n`);
  chmodSync(p, 0o755);
  return p;
}

describe('le serveur d’essai répond quand son démarrage rend la main', () => {
  it('a server whose port opens before its frontend serves: the first call answers', async () => {
    const cible = await portLibre();
    const port = await portLibre();
    const lent = demarrerLeServeur(
      programmeLent(cible),
      path.join(dossier('relais'), 'inutile.db'),
      port,
      ATTRIBUTS_DE_RECHERCHE
    );
    // The real server starts 3 s after its relay opened the port; the call below waits only for
    // the slow one.
    const vrai = new Promise(r => setTimeout(r, 3000)).then(() =>
      demarrerLeServeur(
        programmeTemporal(),
        path.join(dossier('vrai'), 'temporal.db'),
        cible,
        ATTRIBUTS_DE_RECHERCHE
      )
    );
    arrets.push(async () => (await vrai).tuer());
    const s = await lent;
    arrets.push(() => s.tuer());
    const c = await Connection.connect({ address: s.adresse, connectTimeout: 2000 });
    arrets.unshift(() => c.close());
    const r = await c.withDeadline(Date.now() + 2000, () =>
      c.workflowService.describeNamespace({ namespace: 'default' })
    );
    expect(r.namespaceInfo?.name).toBe('default');
  }, 120_000);
});
