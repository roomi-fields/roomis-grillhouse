// The status line (scripts/ligne-etat/ligne-etat.mjs): the person's own line on the left, the
// chantier on the right. The chain, played at night: the command itself, the person's own command
// run by its shell and the state read in the git directory of a repository of trial. How it
// composes the line is the day's (packages/grillhouse/tests/unit/ligne-etat.spec.ts).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { CADRE } from './cadre.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ligne-etat-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.join(CADRE, 'scripts/ligne-etat/ligne-etat.mjs');

describe('the status line command', () => {
  const projet = () => {
    const d = mkdtempSync(path.join(ESSAIS, 'ligne-projet-'));
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
    const home = mkdtempSync(path.join(ESSAIS, 'ligne-maison-'));
    mkdirSync(path.join(home, '.claude'));
    writeFileSync(
      path.join(home, '.claude/settings.json'),
      JSON.stringify({ statusLine: { type: 'command', command: 'cat >/dev/null; echo ma ligne' } })
    );
    expect(stripVTControlCharacters(lancer(home, projet()))).toMatch(/^ma ligne +▶ 2 en cours\n$/);
  });
  it('puts the default line on the left for a person without one', () => {
    const home = mkdtempSync(path.join(ESSAIS, 'ligne-maison-'));
    expect(stripVTControlCharacters(lancer(home, projet()))).toMatch(/^Opus 5\.5 +▶ 2 en cours\n$/);
  });
});
