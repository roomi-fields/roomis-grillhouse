// The status line reads the file the follower writes (scripts/ligne-etat/ligne-etat.mjs) and does
// not measure; a measure older than 10 minutes shows nothing, not a stale state.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { etatDuFichier } from '../../scripts/ligne-etat/ligne-etat.mjs';

type Suiveur = typeof import('../../scripts/suiveur.mjs');

// Read at the load so that a module not yet written fails each test, not the file.
const { mesurerUneFois, PEREMPTION } = (await import(
  /* @vite-ignore */ '../../scripts/suiveur.mjs'
).catch(() => ({}))) as Suiveur;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ligne-etat-fichier-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const dossier = () => mkdtempSync(path.join(ESSAIS, 'commun-'));

describe('etatDuFichier', () => {
  it('gives the text the follower wrote, while its measure is recent', async () => {
    const commun = dossier();
    await mesurerUneFois('/depot', {
      commun,
      mesure: () => Promise.resolve({ etat: '🌙 1 · ⏳ 2 · Grillhouse', lignes: [] }),
      maintenant: 10_000,
    });
    expect(etatDuFichier(commun, 10_000 + 1_000)).toBe('🌙 1 · ⏳ 2 · Grillhouse');
  });
  it('gives nothing when the measure is older than 10 minutes', async () => {
    const commun = dossier();
    await mesurerUneFois('/depot', {
      commun,
      mesure: () => Promise.resolve({ etat: 'périmé', lignes: [] }),
      maintenant: 10_000,
    });
    expect(etatDuFichier(commun, 10_000 + PEREMPTION + 1)).toBe('');
  });
  it('gives nothing without a file or with a file it cannot read', () => {
    const commun = dossier();
    expect(etatDuFichier(commun, 1)).toBe('');
    writeFileSync(path.join(commun, 'grillhouse-etat.txt'), 'texte brut\n');
    expect(etatDuFichier(commun, 1)).toBe('');
  });
});
