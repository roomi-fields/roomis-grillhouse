// `grillhouse circuit <ticket> --recommencer` : l'appel (src/temporal/circuit/appel.ts, la lecture de
// la ligne de commande que lit commande.ts), le refus d'un circuit qui tourne
// (`recommencerLeCircuit`, src/temporal/circuit/client.ts) et le refus du lancement frais après
// `--arreter`, qui nomme `--recommencer`. Un test petit : aucun serveur Temporal, un client dont
// seul `describe` répond.
import type { Client } from '@temporalio/client';
import { describe, expect, it, vi } from 'vitest';
import { ReponseRefusee, recommencerLeCircuit } from '../../src/temporal/circuit/client.js';

// Le module de l'appel se charge à l'usage : sans lui, chaque test rougit, le fichier se charge.
const appel = () => import('../../src/temporal/circuit/appel.js');

describe('la lecture de l’appel avec --recommencer', () => {
  it('reads --recommencer alone on a ticket', async () => {
    const { lireLAppel } = await appel();
    expect(lireLAppel(['essai-1', '--recommencer'])).toMatchObject({
      ticket: 'essai-1',
      recommencer: true,
      reprendre: false,
      depuis: null,
      etendre: null,
      arreter: false,
    });
  });

  it('is off without the option', async () => {
    const { lireLAppel } = await appel();
    expect(lireLAppel(['essai-1'])).toMatchObject({ recommencer: false });
    expect(lireLAppel(['essai-1', '--reprendre'])).toMatchObject({ recommencer: false });
  });

  it('refuses --recommencer combined with --reprendre, --depuis, --etendre or --arreter (usage)', async () => {
    const { Usage, lireLAppel } = await appel();
    for (const autre of [
      ['--reprendre'],
      ['--depuis', 'testwriter', '--contexte', 'x'],
      ['--etendre', 'packages/a'],
      ['--arreter'],
    ]) {
      expect(() => lireLAppel(['essai-1', '--recommencer', ...autre]), autre.join(' ')).toThrow(
        Usage
      );
      expect(() => lireLAppel(['essai-1', ...autre, '--recommencer']), autre.join(' ')).toThrow(
        Usage
      );
    }
  });

  it('says in the usage that --recommencer goes alone', async () => {
    const { lireLAppel } = await appel();
    expect(() => lireLAppel(['essai-1', '--recommencer', '--arreter'])).toThrow(/--recommencer/);
  });
});

describe('le lancement frais refusé après --arreter', () => {
  it('names --recommencer among the ways to reopen, with --reprendre and --depuis', async () => {
    const { refusDuLancementApresArret } = await appel();
    const m = refusDuLancementApresArret('essai-1');
    expect(m).toContain('essai-1');
    expect(m).toContain('--recommencer');
    expect(m).toContain('--reprendre');
    expect(m).toContain('--depuis');
  });
});

describe('recommencerLeCircuit', () => {
  const client = (statut: string | null) =>
    ({
      workflow: {
        getHandle: () => ({
          describe: async () => {
            if (statut === null) {
              const { WorkflowNotFoundError } = await import('@temporalio/client');
              throw new WorkflowNotFoundError('absent', 'id', undefined);
            }
            return { status: { name: statut } };
          },
        }),
      },
    }) as unknown as Client;

  it('refuses a circuit that runs, by its name, and removes nothing', async () => {
    const retirer = vi.fn(() => '/depot/.claude/worktrees/essai-1');
    await expect(
      recommencerLeCircuit(client('RUNNING'), '/depot', 'essai-1', retirer)
    ).rejects.toThrow(ReponseRefusee);
    await expect(
      recommencerLeCircuit(client('RUNNING'), '/depot', 'essai-1', retirer)
    ).rejects.toThrow(/essai-1/);
    expect(retirer).not.toHaveBeenCalled();
  });

  it('removes the copy of a stopped circuit and says the copy removed', async () => {
    const retirer = vi.fn(() => '/depot/.claude/worktrees/essai-1');
    const ligne = await recommencerLeCircuit(client('COMPLETED'), '/depot', 'essai-1', retirer);
    expect(retirer).toHaveBeenCalledTimes(1);
    expect(ligne).toContain('/depot/.claude/worktrees/essai-1');
  });

  it('removes the copy of a ticket the server no longer holds', async () => {
    const retirer = vi.fn(() => '/depot/.claude/worktrees/essai-1');
    const ligne = await recommencerLeCircuit(client(null), '/depot', 'essai-1', retirer);
    expect(retirer).toHaveBeenCalledTimes(1);
    expect(ligne).toContain('/depot/.claude/worktrees/essai-1');
  });
});
