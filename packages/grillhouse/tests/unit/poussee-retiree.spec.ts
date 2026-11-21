// The key `grillhouse.poussee` is retired from the frame (the trunk-based development of Google and
// Chromium: one branch receives every lot). One reading, scripts/poussee-retiree.mjs, serves the
// queue, the night and the pre-push hook: it says only « key retired », with the gesture (remove
// the key), whatever the value of the key. The pre-push hook keeps its one refusal of a tree no
// pass judged, and no longer refuses « only the night pushes ». Small tests, in the process.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as nuit from '../../scripts/branche-de-nuit.mjs';

const MODULE = '../../scripts/poussee-retiree.mjs';
type Lecture = { pousseeRetiree: (pkg: unknown) => string | null };
const lecture = async (): Promise<Lecture> => (await import(/* @vite-ignore */ MODULE)) as Lecture;

const { refus } = nuit as unknown as {
  refus: (
    remote: string,
    refs: { sha: string; distante: string }[],
    pkg: unknown,
    env?: Record<string, string>
  ) => string[];
};

const VALEURS: [string, unknown][] = [
  ['two branches', { commit: 'travail', nuit: 'main' }],
  ['only a night branch', { nuit: 'main' }],
  ['only a commit branch', { commit: 'main' }],
  ['an empty object', {}],
  ['null', null],
  ['a string', 'main'],
  ['an array', ['main']],
  ['a blank night branch', { nuit: '  ' }],
];

describe('the key grillhouse.poussee is refused by its name, whatever its value', () => {
  it.each(VALEURS)('names the key and the gesture (remove it) for %s', async (_nom, valeur) => {
    const { pousseeRetiree } = await lecture();
    const ligne = pousseeRetiree({ name: 'demo', grillhouse: { poussee: valeur } });
    expect(ligne).toContain('grillhouse.poussee');
    expect(ligne).toMatch(/retire/i);
  });

  it('says nothing for a project without the key, or without grillhouse, or without a package.json', async () => {
    const { pousseeRetiree } = await lecture();
    expect(pousseeRetiree({ name: 'demo' })).toBeNull();
    expect(pousseeRetiree({ grillhouse: { circuits: 2 } })).toBeNull();
    expect(pousseeRetiree({ grillhouse: null })).toBeNull();
    expect(pousseeRetiree(null)).toBeNull();
  });

  it('does not take another key of grillhouse for the retired one', async () => {
    const { pousseeRetiree } = await lecture();
    expect(pousseeRetiree({ grillhouse: { poussees: {}, nuit: 'main' } })).toBeNull();
  });

  it('replaces the module that read the two branches', () => {
    const scripts = path.resolve(__dirname, '../../scripts');
    expect(existsSync(path.join(scripts, 'poussee-cles.mjs'))).toBe(false);
  });
});

describe('the pre-push hook keeps its one refusal of an unjudged tree to main', () => {
  const NUIT = [{ sha: 'a'.repeat(40), distante: 'refs/heads/main' }];

  it('refuses a push of a project that carries the key, by its name and the gesture', () => {
    for (const [, valeur] of VALEURS) {
      const lignes = refus('origin', NUIT, { grillhouse: { poussee: valeur } });
      expect(lignes).toHaveLength(1);
      expect(lignes[0]).toContain('grillhouse.poussee');
      expect(lignes[0]).toMatch(/retire/i);
    }
  });

  it('no longer says that only the night pushes a branch', () => {
    const lignes = refus('origin', NUIT, { grillhouse: { poussee: { nuit: 'main' } } });
    expect(lignes.join('\n')).not.toMatch(/seule la nuit/i);
    expect(lignes.join('\n')).not.toContain('valeur invalide');
  });
});
