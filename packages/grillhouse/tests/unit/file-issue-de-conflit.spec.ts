// The issue the queue gives the circuit for a branch that does not replay on main carries
// `conflit`, the field the circuit reads to name the answer that serves; no other exit does.
// Witness: grillhouse-3uv.111 (2026-11-20), reopened on a conflict whose question named no reason.
import { describe, expect, it } from 'vitest';
import { direLIssue } from '../../scripts/integration/file.mjs';

type Effet = { genre: string; texte?: string };

// The tools of the queue as stand-ins: Beads and the output kept, the comment an effect rendered.
function outils() {
  const appels: string[][] = [];
  const rendus: Effet[] = [];
  const o = {
    principale: 'main',
    rendus,
    bd: (...a: string[]) => {
      appels.push(a);
      return { status: 0, stdout: '', stderr: '' };
    },
    dire: () => {},
  };
  return { o, appels, rendus };
}

const ENTREE = { ticket: 'demo-1', branche: 'agent/demo-1' };

describe('l’issue de la file pour une branche qui sort', () => {
  it('porte conflit pour une branche qui ne se replace pas sur main', () => {
    const { o, appels, rendus } = outils();
    const issue = direLIssue(o, ENTREE, {
      conflit: true,
      sortie: ['elle ne se replace pas sur main.', 'Fichiers en conflit :\n  src/a.ts'],
    });
    expect(issue).toMatchObject({ etat: 'rouvert', conflit: true });
    expect(issue.raison).toContain('src/a.ts');
    expect(appels).toContainEqual([
      'update',
      'demo-1',
      '--status',
      'open',
      '--remove-label',
      'en-file',
    ]);
    expect(rendus.map(e => e.genre)).toEqual(['commentaire']);
  });

  it('ne le porte pas pour une autre sortie', () => {
    const { o } = outils();
    const issue = direLIssue(o, ENTREE, { sortie: ["la branche n'existe plus.", ''] });
    expect(issue.etat).toBe('rouvert');
    expect(issue).not.toHaveProperty('conflit');
  });
});
