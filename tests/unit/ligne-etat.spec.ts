import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  commandePersonnelle,
  composer,
  largeurVisible,
  sansCouleur,
} from '../../scripts/ligne-etat/ligne-etat.mjs';

const SCRIPT = path.resolve('scripts/ligne-etat/ligne-etat.mjs');

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
    const d = mkdtempSync(path.join(tmpdir(), 'ligne-'));
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

describe('the status line command', () => {
  const projet = () => {
    const d = mkdtempSync(path.join(tmpdir(), 'ligne-projet-'));
    execFileSync('git', ['init', '-q', d]);
    writeFileSync(path.join(d, '.git/grillhouse-etat.txt'), '▶ 2 en cours\n');
    return d;
  };
  const lancer = (home: string, dir: string) =>
    execFileSync('node', [SCRIPT], {
      input: JSON.stringify({ model: { display_name: 'Opus 5.5' } }),
      env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: dir, COLUMNS: '60' },
      encoding: 'utf8',
    });
  it("puts the person's own line on the left and the chantier on the right", () => {
    const home = mkdtempSync(path.join(tmpdir(), 'ligne-maison-'));
    mkdirSync(path.join(home, '.claude'));
    writeFileSync(
      path.join(home, '.claude/settings.json'),
      JSON.stringify({ statusLine: { type: 'command', command: 'cat >/dev/null; echo ma ligne' } })
    );
    expect(sansCouleur(lancer(home, projet()))).toMatch(/^ma ligne +▶ 2 en cours\n$/);
  });
  it('puts the default line on the left for a person without one', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'ligne-maison-'));
    expect(sansCouleur(lancer(home, projet()))).toMatch(/^Opus 5\.5 +▶ 2 en cours\n$/);
  });
});
