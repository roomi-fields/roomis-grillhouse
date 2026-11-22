// Les réponses du superviseur à un circuit que le serveur ne tient plus, ou qui ne tourne pas
// (src/temporal/circuit/client.ts : `reprendreLeCircuit`, `etendreLeCircuit`, `reprendreDepuis`,
// `arreterLeCircuit`) : refusées par leur nom (`ReponseRefusee`), la commande qui rouvre dite ;
// seul `--depuis` rouvre un circuit purgé du serveur. Un test petit : aucun serveur Temporal, un
// client dont seuls `describe`, `result`, `signal` et `start` répondent.
import { WorkflowNotFoundError, type Client } from '@temporalio/client';
import { describe, expect, it, vi } from 'vitest';
import {
  ReponseRefusee,
  arreterLeCircuit,
  etendreLeCircuit,
  reprendreDepuis,
  reprendreLeCircuit,
} from '../../src/temporal/circuit/client.js';
import { ARRETER } from '../../src/temporal/circuit/contrat.js';

const RACINE = '/depot';

/** Un client dont le circuit du ticket est dans l'état <statut> (null : le serveur ne le tient plus). */
function serveur(statut: string | null, resultat: unknown = null) {
  const start = vi.fn(() => Promise.resolve({}));
  const signal = vi.fn(() => Promise.resolve(undefined));
  const executeUpdate = vi.fn(() => Promise.resolve('ok'));
  const injoignable = () => new WorkflowNotFoundError('absent', 'id', undefined);
  const handle = {
    workflowId: 'circuit:/depot:demo-1',
    describe: () =>
      statut === null
        ? Promise.reject(injoignable())
        : Promise.resolve({ status: { name: statut }, taskQueue: 'file', memo: {} }),
    result: () => Promise.resolve(resultat),
    signal,
    executeUpdate,
    fetchHistory: () => Promise.resolve({ events: [] }),
  };
  const client = {
    workflow: { getHandle: () => handle, start },
  } as unknown as Client;
  return { client, start, signal, executeUpdate };
}

describe('un circuit que le serveur ne tient plus', () => {
  it('--reprendre est refusé par son nom, et seul --depuis le rouvre', async () => {
    const { client, start } = serveur(null);
    const refus = reprendreLeCircuit(client, RACINE, 'demo-1');
    await expect(refus).rejects.toBeInstanceOf(ReponseRefusee);
    await expect(refus).rejects.toThrow('le serveur ne tient plus le circuit de demo-1');
    await expect(refus).rejects.toThrow('--depuis <testwriter|developpeur> --contexte <texte>');
    expect(start).not.toHaveBeenCalled();
  });

  it('--etendre est refusé de même, rien n’est démarré', async () => {
    const { client, start } = serveur(null);
    await expect(etendreLeCircuit(client, RACINE, 'demo-1', ['000-forms'])).rejects.toThrow(
      'le serveur ne tient plus le circuit de demo-1'
    );
    expect(start).not.toHaveBeenCalled();
  });

  it('--depuis le rouvre : un déroulé neuf, sans état d’arrêt, à l’étape nommée', async () => {
    const { client, start } = serveur(null);
    await reprendreDepuis(client, RACINE, 'demo-1', 'developpeur', 'Reprends le code.', {
      file: 'file-du-projet',
    });
    expect(start).toHaveBeenCalledTimes(1);
    const [, options] = start.mock.calls[0] as unknown as [
      unknown,
      { taskQueue: string; args: { reprise: object; etatDArret: unknown; ticket: string }[] },
    ];
    expect(options.taskQueue).toBe('file-du-projet');
    expect(options.args[0]).toMatchObject({
      ticket: 'demo-1',
      reprise: { genre: 'depuis', role: 'developpeur', contexte: 'Reprends le code.' },
    });
    expect(options.args[0]!.etatDArret ?? null).toBeNull();
  });
});

describe('--arreter', () => {
  it('sur un ticket que le serveur ne tient pas : refusé par son nom, aucun circuit ne tourne', async () => {
    const { client, signal } = serveur(null);
    const refus = arreterLeCircuit(client, RACINE, 'demo-1');
    await expect(refus).rejects.toBeInstanceOf(ReponseRefusee);
    await expect(refus).rejects.toThrow('--arreter : aucun circuit ne tourne sur demo-1.');
    expect(signal).not.toHaveBeenCalled();
  });

  it('sur un circuit fini sans issue d’intégration : aucun circuit ne tourne', async () => {
    const { client } = serveur('COMPLETED', { raison: 'arrete' });
    await expect(arreterLeCircuit(client, RACINE, 'demo-1')).rejects.toThrow(
      '--arreter : aucun circuit ne tourne sur demo-1.'
    );
  });

  it('sur un circuit dont le lot est intégré : le lot est dit intégré', async () => {
    const { client, signal } = serveur('COMPLETED', { raison: 'integre' });
    await expect(arreterLeCircuit(client, RACINE, 'demo-1')).rejects.toThrow(
      '--arreter : le lot de demo-1 est intégré.'
    );
    expect(signal).not.toHaveBeenCalled();
  });

  it('sur un circuit qui tourne : le signal d’arrêt part avec son motif', async () => {
    const { client, signal } = serveur('RUNNING');
    await arreterLeCircuit(client, RACINE, 'demo-1', 'Le ticket change de plan.');
    expect(signal).toHaveBeenCalledWith(ARRETER, 'Le ticket change de plan.');
  });
});
