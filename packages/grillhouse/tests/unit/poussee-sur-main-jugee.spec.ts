// The judged main of the pre-push hook (scripts/branche-de-nuit.mjs, `refusSurMain`): a push to
// origin of the branch main carries only a commit that a final pass of the circuit or the
// verification of a lot of the direct way judged green; any other is refused. The hook reads no
// key: main is the one branch that receives the lots.
import { describe, expect, it } from 'vitest';
import * as nuit from '../../scripts/branche-de-nuit.mjs';

const { refusSurMain } = nuit as unknown as {
  refusSurMain: (
    remote: string,
    refs: { sha: string; distante: string }[],
    o: { jugee: (sha: string) => boolean }
  ) => string[];
};

const JUGE = 'a'.repeat(40);
const NEUF = 'b'.repeat(40);
const jugee = (sha: string) => sha === JUGE;
const vers = (distante: string, sha: string) => ({ sha, distante });

describe('a push to main carries only a commit a final pass or a verification judged', () => {
  it('refuses a commit no pass judged, named, and lets a judged one go', () => {
    const lignes = refusSurMain('origin', [vers('refs/heads/main', NEUF)], { jugee });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain(NEUF.slice(0, 8));
    expect(lignes[0]).toContain('passe finale');
    expect(lignes[0]).not.toContain('agent/<ticket>');
    expect(refusSurMain('origin', [vers('refs/heads/main', JUGE)], { jugee })).toEqual([]);
  });

  it('asks nothing of the CI of a branch of a ticket: the judgement is the pass’s alone', () => {
    const lignes = refusSurMain('origin', [vers('refs/heads/main', NEUF)], { jugee });
    expect(lignes.join('\n')).not.toMatch(/CI d'aucune branche|attends sa CI/);
  });

  it('watches main alone, whatever the project’s package.json says', () => {
    expect(refusSurMain('origin', [vers('refs/heads/develop', NEUF)], { jugee })).toEqual([]);
    expect(refusSurMain('origin', [vers('refs/heads/travail', NEUF)], { jugee })).toEqual([]);
    expect(refusSurMain('origin', [vers('refs/heads/main', NEUF)], { jugee })).toHaveLength(1);
  });

  it('lets a ticket branch and another remote go', () => {
    expect(refusSurMain('origin', [vers('refs/heads/agent/x-1', NEUF)], { jugee })).toEqual([]);
    expect(refusSurMain('miroir', [vers('refs/heads/main', NEUF)], { jugee })).toEqual([]);
  });

  it('leaves the deletion of the branch to the server', () => {
    expect(refusSurMain('origin', [vers('refs/heads/main', '0'.repeat(40))], { jugee })).toEqual(
      []
    );
  });

  it('names each unjudged commit of a push of several refs', () => {
    const lignes = refusSurMain(
      'origin',
      [vers('refs/heads/main', NEUF), vers('refs/heads/main', 'c'.repeat(40))],
      { jugee }
    );
    expect(lignes).toHaveLength(2);
  });
});

describe('the hook no longer reads the CI of a branch', () => {
  it('publishes neither the reading of the runs nor the judgement by them', () => {
    expect(Object.keys(nuit)).not.toContain('jugeeDansLesRuns');
    expect(Object.keys(nuit)).not.toContain('jugeeParGh');
  });
});
