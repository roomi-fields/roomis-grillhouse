// The message of the judged main guard (scripts/branche-de-nuit.mjs, `refusSurMain`) when it
// refuses the commit pushed and that commit is HEAD of the copy where the hook plays: it adds the
// files where the tree of the folder differs from the tree of the commit, so the one who is
// refused sees what to commit or restore. The readings are injected: `tete` (HEAD of the copy) and
// `ecarts()` (the files in difference, the excluded files left out).
import { describe, expect, it } from 'vitest';
import { refusSurMain } from '../../scripts/branche-de-nuit.mjs';

type Lectures = { jugee: (sha: string) => boolean; tete?: string; ecarts?: () => string[] };
const refuser = refusSurMain as unknown as (
  remote: string,
  refs: { sha: string; distante: string }[],
  o: Lectures
) => string[];

const NEUF = 'b'.repeat(40);
const AUTRE = 'c'.repeat(40);
const main = (sha: string) => ({ sha, distante: 'refs/heads/main' });
const injuge = () => false;

describe('the refusal of a push to main names the files of the folder that differ from the commit', () => {
  it('lists each file in difference when the commit pushed is HEAD of the copy', () => {
    const lignes = refuser('origin', [main(NEUF)], {
      jugee: injuge,
      tete: NEUF,
      ecarts: () => ['packages/x/src/a.ts', 'package.json'],
    });
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain(NEUF.slice(0, 8));
    expect(lignes[0]).toContain('packages/x/src/a.ts');
    expect(lignes[0]).toContain('package.json');
  });

  it('keeps its message unchanged when the folder does not differ from the commit', () => {
    const sans = refuser('origin', [main(NEUF)], { jugee: injuge });
    const vide = refuser('origin', [main(NEUF)], { jugee: injuge, tete: NEUF, ecarts: () => [] });
    expect(vide).toEqual(sans);
  });

  it('keeps its message unchanged when the commit pushed is not HEAD of the copy', () => {
    const sans = refuser('origin', [main(NEUF)], { jugee: injuge });
    const ailleurs = refuser('origin', [main(NEUF)], {
      jugee: injuge,
      tete: AUTRE,
      ecarts: () => ['packages/x/src/a.ts'],
    });
    expect(ailleurs).toEqual(sans);
  });

  it('adds the list to the commit that is HEAD only, of a push of several commits', () => {
    const lignes = refuser('origin', [main(NEUF), main(AUTRE)], {
      jugee: injuge,
      tete: NEUF,
      ecarts: () => ['a.ts'],
    });
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toContain('a.ts');
    expect(lignes[1]).not.toContain('a.ts');
  });

  it('reads no difference for a commit judged green', () => {
    let lu = false;
    const lignes = refuser('origin', [main(NEUF)], {
      jugee: () => true,
      tete: NEUF,
      ecarts: () => {
        lu = true;
        return ['a.ts'];
      },
    });
    expect(lignes).toEqual([]);
    expect(lu).toBe(false);
  });
});
