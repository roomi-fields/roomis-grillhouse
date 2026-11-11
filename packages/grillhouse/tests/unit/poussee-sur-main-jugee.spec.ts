// The judged main of the pre-push guard (scripts/branche-de-nuit.mjs, `refusSurMain`): a push to
// origin of the branch main is pushed to carries only a commit the CI judged green on a ticket
// branch, in a project whose CI runs on the ticket branches.
import { describe, expect, it } from 'vitest';
import { refusSurMain } from '../../scripts/branche-de-nuit.mjs';

const JUGE = 'a'.repeat(40);
const NEUF = 'b'.repeat(40);
const jugee = (sha: string) => sha === JUGE;
const vers = (distante: string, sha: string) => ({ sha, distante });

describe('a push to main carries only a commit judged green on a ticket branch', () => {
  it('refuses a commit no ticket branch judged, named, and lets a judged one go', () => {
    const lignes = refusSurMain('origin', [vers('refs/heads/main', NEUF)], {
      principale: 'main',
      ecoute: true,
      jugee,
    });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain(NEUF.slice(0, 8));
    expect(lignes[0]).toContain('agent/<ticket>');
    expect(
      refusSurMain('origin', [vers('refs/heads/main', JUGE)], {
        principale: 'main',
        ecoute: true,
        jugee,
      })
    ).toEqual([]);
  });

  it('watches the branch of grillhouse.poussee.commit, not another', () => {
    const o = { principale: 'develop', ecoute: true, jugee };
    expect(refusSurMain('origin', [vers('refs/heads/main', NEUF)], o)).toEqual([]);
    expect(refusSurMain('origin', [vers('refs/heads/develop', NEUF)], o)).toHaveLength(1);
  });

  it('lets a ticket branch, another remote and a project without CI on ticket branches go', () => {
    const o = { principale: 'main', ecoute: true, jugee };
    expect(refusSurMain('origin', [vers('refs/heads/agent/x-1', NEUF)], o)).toEqual([]);
    expect(refusSurMain('miroir', [vers('refs/heads/main', NEUF)], o)).toEqual([]);
    expect(
      refusSurMain('origin', [vers('refs/heads/main', NEUF)], { ...o, ecoute: false })
    ).toEqual([]);
  });

  it('leaves the deletion of the branch to the server', () => {
    expect(
      refusSurMain('origin', [vers('refs/heads/main', '0'.repeat(40))], {
        principale: 'main',
        ecoute: true,
        jugee,
      })
    ).toEqual([]);
  });
});
