// The queue of a project has one path, the final pass of main (src/temporal/file/deroule.ts): the
// former path (the CI of the candidate's branch read by a child workflow, then the workflows of
// main read after the push) is retired with its activities and its acts. The workflow retires its
// patch by `deprecatePatch('passe-finale-de-main')`, never reads `patched`, and the replay of the
// histories in flight is played by tests/temporal/file.rejeu.spec.ts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { jouerLActe } from '../../scripts/faits-du-circuit.mjs';
import * as activites from '../../src/temporal/file/activites.js';

const DEROULE = path.resolve(__dirname, '../../src/temporal/file/deroule.ts');
const DEROULES = path.resolve(__dirname, '../../src/temporal/deroules.ts');
const CONTRAT = path.resolve(__dirname, '../../src/temporal/file/contrat.ts');

// The code of a source without its comments, which may tell the history of the path.
const code = (fichier: string) =>
  readFileSync(fichier, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('le déroulé de la file ne garde que la passe finale', () => {
  it('retires the patch of the final pass without reading it', () => {
    const src = code(DEROULE);
    expect(src).toMatch(/deprecatePatch\(\s*'passe-finale-de-main'\s*\)/);
    expect(src).not.toMatch(/\bpatched\s*\(/);
  });

  it('has no child workflow of the CI of a commit, published or started', () => {
    expect(code(DEROULE)).not.toMatch(/ciDuCommit|executeChild/);
    expect(code(DEROULES)).not.toMatch(/ciDuCommit/);
  });

  it('reads neither the CI of the branch nor the workflows of main after the push', () => {
    const src = code(DEROULE);
    for (const retire of [
      'conclureLaCI',
      'lireLesPassagesDeLaCI',
      'inscrireLesFluxDeMain',
      'relireLesFluxDeMain',
    ]) {
      expect(src, retire).not.toContain(retire);
    }
  });
});

describe('les activités et les actes de l’ancien chemin sont retirés', () => {
  it('publishes no activity of the former path', () => {
    const noms = Object.keys(activites);
    for (const ancien of [
      'lireLesPassagesDeLaCI',
      'conclureLaCI',
      'inscrireLesFluxDeMain',
      'relireLesFluxDeMain',
    ]) {
      expect(noms, ancien).not.toContain(ancien);
    }
    expect(noms).toContain('jugerLeCandidat');
  });

  it('declares none of the types of the former path in the contract', () => {
    const src = code(CONTRAT);
    for (const ancien of [
      'EntreeDeLaCI',
      'VerdictDeLaCI',
      'LectureDesPassages',
      'lireLesPassagesDeLaCI',
      'conclureLaCI',
      'inscrireLesFluxDeMain',
      'relireLesFluxDeMain',
    ]) {
      expect(src, ancien).not.toContain(ancien);
    }
  });

  it.each(['passages', 'conclure', 'inscrire-flux-de-main', 'relire-flux-de-main'])(
    'the circuit does not know the act %s any more',
    async acte => {
      await expect(jouerLActe(acte, { racine: '/depot/essai' })).rejects.toThrow(/acte inconnu/);
    }
  );
});
