// The versioning of the frame's workers (installation.md §2.6), what needs no server: the options
// the worker's module builds for a task queue and a version (`optionsDuTravailleur`), and the
// behaviour each workflow it serves declares itself. The routing is the server's, proven at night
// (./versionnage.nuit.spec.ts).
import { describe, expect, it, vi } from 'vitest';
import { espaceDeNoms } from '../../src/temporal/client.js';
import * as deroules from '../../src/temporal/deroules.js';
import * as travailleur from '../../src/temporal/travailleur.js';

describe('le travailleur s’enregistre dans le déploiement de sa file, sous la version de l’outil', () => {
  it.each([
    ['grillhouse-projet-essai', '1.2.3'],
    ['grillhouse-machine', '0.53.0'],
  ])('file %s, version %s', (file, version) => {
    const options = travailleur.optionsDuTravailleur(file, version);
    expect(options).toMatchObject({
      taskQueue: file,
      namespace: espaceDeNoms(),
      workerDeploymentOptions: {
        useWorkerVersioning: true,
        version: { deploymentName: file, buildId: version },
      },
    });
  });

  it('the options carry the frame’s workflows and the activities of each of them', () => {
    const options = travailleur.optionsDuTravailleur('grillhouse-machine', '1.2.3');
    expect('workflowsPath' in options && options.workflowsPath).toMatch(/deroules\.js$/);
    for (const acte of [
      'lancerLaSonde',
      'mesurerLaMachine',
      'ouvrirLeCircuit',
      'preparerLaBranche',
      'ticketsAPartir',
      'jouerLaNuit',
    ]) {
      expect(options.activities, acte).toHaveProperty(acte);
    }
  });

  it('importing the worker’s module starts no worker', async () => {
    vi.resetModules();
    const avant = process.exitCode;
    const ecrit = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await import('../../src/temporal/travailleur.js');
      await new Promise(r => setImmediate(r));
      expect(ecrit).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(avant);
    } finally {
      ecrit.mockRestore();
      process.exitCode = avant;
    }
  });
});

describe('chaque déroulé que le travailleur sert déclare lui-même son comportement de versionnage', () => {
  it('a circuit is pinned; the queues, the nights, the arbiter and the sonde auto-upgrade', () => {
    const declares = Object.fromEntries(
      Object.entries(deroules as Record<string, unknown>).map(([nom, deroule]) => [
        nom,
        (deroule as { workflowDefinitionOptions?: { versioningBehavior?: string } })
          .workflowDefinitionOptions?.versioningBehavior,
      ])
    );
    expect(declares).toEqual({
      circuitDuTicket: 'PINNED',
      fileDuProjet: 'AUTO_UPGRADE',
      ticketsDuProjet: 'AUTO_UPGRADE',
      nuitsDeLaMachine: 'AUTO_UPGRADE',
      nuitPlanifiee: 'AUTO_UPGRADE',
      placesDeLaMachine: 'AUTO_UPGRADE',
      sonde: 'AUTO_UPGRADE',
    });
  });
});
