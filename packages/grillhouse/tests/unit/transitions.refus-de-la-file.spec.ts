// The stop of a ticket the queue reopens says why in its first line, the fact of the question
// gone up to the supervisor.
// Witness: grillhouse-3uv.111 (2026-11-20): its branch left the queue on a conflict with main, the
// question read « La file rouvre le ticket. » alone, and `--reprendre` sent the same branch back.
import { describe, expect, it } from 'vitest';
import { refusDeLaFile } from '../../scripts/transitions.mjs';

const SORTIE =
  '## Sortie de la file\n\nLa branche agent/t-1 ne peut pas entrer sur main : elle ne se replace pas sur main.\nFichiers en conflit :\nsrc/client.ts\n\nLa branche reste en place ; la relance du ticket remet son lot en travail local sur main.';

describe('le refus de la file dit pourquoi le ticket est rouvert', () => {
  it('porte en première ligne la raison d’une branche sortie de la file, et nomme la réponse qui sert', () => {
    const { motif, question } = refusDeLaFile({ raison: SORTIE, conflit: true });
    expect(motif.split('\n')[0]).toBe(
      'La file rouvre le ticket : La branche agent/t-1 ne peut pas entrer sur main : elle ne se replace pas sur main.'
    );
    expect(motif).toContain('src/client.ts');
    expect(question).toContain('--depuis developpeur');
  });

  it('porte en première ligne la CI rouge et son adresse, sans question à elle', () => {
    const { motif, question } = refusDeLaFile({
      raison: 'La CI de abc1234 sur agent/t-1 est rouge : https://exemple.test/runs/1',
    });
    expect(motif.split('\n')[0]).toBe(
      'La file rouvre le ticket : La CI de abc1234 sur agent/t-1 est rouge : https://exemple.test/runs/1'
    );
    expect(question).toBeNull();
  });

  it('une branche écartée, sans rien à replacer, n’a pas de question à elle', () => {
    const { question } = refusDeLaFile({
      raison:
        '## Sortie de la file\n\nLa branche agent/t-1 n’a rien en avance sur main : elle n’entre pas, et le ticket reste ouvert.',
    });
    expect(question).toBeNull();
  });

  it('sans raison, garde le fait nu', () => {
    expect(refusDeLaFile().motif.split('\n')[0]).toBe('La file rouvre le ticket.');
  });
});
