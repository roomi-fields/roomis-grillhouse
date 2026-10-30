// grillhouse-4id, critères 2 and 3, on the circuit (scripts/circuit.mjs): every pass it plays (the
// proof, the checks, the final pass, a command of a reference) runs in the environment of a pass,
// with the tools of the project (`grillhouse.outils`) whatever its launcher holds; a faulty key
// stops the run at its launch, « lancement », before any session, the fault named. The run of the
// circuit itself on a faulty key is the night's (packages/grillhouse-essais/tests/outils.nuit.spec.ts).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ARRETS, environnementDeLaPasse, outilsAuLancement } from '../../scripts/circuit.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-outils-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A project of trial <nom> whose package.json declares <outils>.
function projet(nom: string, outils: unknown): string {
  const dir = path.join(ESSAIS, nom);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: nom, grillhouse: { outils } })
  );
  return dir;
}

describe('critère 2 — the environment of a pass of the circuit', () => {
  it('holds the tools of the project, even when the launcher does not, the key winning', () => {
    const ctx = { outils: { X_OUTIL: '/h/.cache/outil' } };
    expect(environnementDeLaPasse(ctx, { PATH: '/bin' }, { R: '1' })).toEqual({
      PATH: '/bin',
      X_OUTIL: '/h/.cache/outil',
      R: '1',
    });
    expect(environnementDeLaPasse(ctx, { PATH: '/bin', X_OUTIL: '/ailleurs' })).toEqual({
      PATH: '/bin',
      X_OUTIL: '/h/.cache/outil',
    });
  });
  it('is the launcher’s without tools', () => {
    expect(environnementDeLaPasse({ outils: {} }, { PATH: '/bin' })).toEqual({ PATH: '/bin' });
  });
});

describe('critère 3 — the launch reads the key, and a faulty key is the stop « lancement »', () => {
  it('gives the tools of a valid key, which the passes then play with', () => {
    const outil = path.join(ESSAIS, 'outil');
    mkdirSync(outil, { recursive: true });
    expect(outilsAuLancement(projet('valide', { X_OUTIL: outil }))).toEqual({
      outils: { X_OUTIL: outil },
    });
  });
  it('gives the stop « lancement », code 10, its report, piece and question naming the fault', () => {
    const { arret, outils } = outilsAuLancement(projet('fautive', { X_OUTIL: '~' }));
    expect(outils).toBeUndefined();
    expect(arret).toMatchObject({ code: ARRETS.lancement, nom: 'lancement' });
    expect(ARRETS.lancement).toBe(10);
    for (const t of [arret?.rapport, arret?.piece, arret?.question]) {
      expect(t).toContain('grillhouse.outils.X_OUTIL');
    }
  });
});
