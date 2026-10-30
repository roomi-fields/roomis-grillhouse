import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  commandePersonnelle,
  composer,
  largeurVisible,
  sansCouleur,
} from '../../scripts/ligne-etat/ligne-etat.mjs';

// The status line (scripts/ligne-etat/ligne-etat.mjs): how it composes the line and reads the
// person's own command. The command itself, in a repository of trial, is the night's
// (packages/grillhouse-essais/tests/ligne-etat.nuit.spec.ts).

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ligne-etat-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe('composer', () => {
  it('aligns the right part on the width, two columns kept on each side', () => {
    const l = composer('\x1b[1;36mOpus\x1b[0m', '▶ 1 en cours', 40);
    expect(largeurVisible(l)).toBe(36);
    expect(sansCouleur(l)).toMatch(/^Opus +▶ 1 en cours$/);
  });
  it('keeps two spaces when the line is too narrow, and the right part on the first line', () => {
    const l = composer('une ligne longue\nseconde', 'état', 10);
    expect(sansCouleur(l)).toBe('une ligne longue  état\nseconde');
  });
  it('leaves the left part alone without a right part', () => {
    expect(composer('gauche', '', 80)).toBe('gauche');
  });
});

describe('commandePersonnelle', () => {
  const maison = (reglages: object | null) => {
    const d = mkdtempSync(path.join(ESSAIS, 'ligne-'));
    mkdirSync(path.join(d, '.claude'));
    if (reglages) {
      writeFileSync(path.join(d, '.claude/settings.json'), JSON.stringify(reglages));
    }
    return d;
  };
  it("reads the person's own command", () => {
    expect(
      commandePersonnelle(maison({ statusLine: { type: 'command', command: 'bash mine.sh' } }))
    ).toBe('bash mine.sh');
  });
  it('has none without settings, or when the settings name this line itself', () => {
    expect(commandePersonnelle(maison(null))).toBeNull();
    expect(
      commandePersonnelle(
        maison({ statusLine: { type: 'command', command: 'node x/ligne-etat/ligne-etat.mjs' } })
      )
    ).toBeNull();
  });
});
