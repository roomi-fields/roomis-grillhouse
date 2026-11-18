// The status line that the frame sets redraws on a clock (`refreshInterval`, Claude Code's
// `statusLine` setting): at rest, a session sends no event, and the line keeps its last value.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as maj from '../../scripts/grillhouse-maj.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ligne-etat-reglage-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const REGLAGES = '.claude/settings.json';
const BARRE = { type: 'command', command: maj.LIGNE_ETAT, refreshInterval: 10 };

type Reglages = { statusLine?: { command: string } & Record<string, unknown> } & Record<
  string,
  unknown
>;
const lireJson = (racine: string, f: string): Reglages =>
  JSON.parse(readFileSync(path.join(racine, f), 'utf8')) as Reglages;

// A project whose settings hold <reglages>.
function projetAvec(reglages: Record<string, unknown>): string {
  const p = mkdtempSync(path.join(ESSAIS, 'p-'));
  writeFileSync(path.join(p, 'package.json'), `${JSON.stringify({ name: 'p' }, null, 2)}\n`);
  declarerLesLangages(p);
  mkdirSync(path.join(p, '.claude'), { recursive: true });
  writeFileSync(path.join(p, REGLAGES), `${JSON.stringify(reglages, null, 2)}\n`);
  return p;
}
const barreApresMaj = (p: string) => {
  maj.mettreAJour(p, DEPOT);
  return lireJson(p, REGLAGES).statusLine;
};

describe('the frame’s status line redraws every 10 seconds', () => {
  it('the template of a project sets the frame’s status line, refreshInterval 10 included', () => {
    const { statusLine } = lireJson(DEPOT, 'templates/projet/.claude/settings.json');
    expect(statusLine).toEqual(BARRE);
    expect(statusLine?.command).toContain('ligne-etat');
  });

  it('Grillhouse’s own settings carry refreshInterval 10 on the frame’s status line', () => {
    expect(lireJson(DEPOT, REGLAGES).statusLine).toEqual(BARRE);
  });

  it('settings without a status line receive the frame’s, refreshInterval 10 included', () => {
    expect(barreApresMaj(projetAvec({ model: 'opus' }))).toEqual(BARRE);
  });

  it('a frame status line that holds the command but no refreshInterval receives it', () => {
    const p = projetAvec({ statusLine: { type: 'command', command: maj.LIGNE_ETAT } });
    expect(barreApresMaj(p)).toEqual(BARRE);
  });

  it('a frame status line of a former form (its script by its path) is rewritten whole', () => {
    const p = projetAvec({
      statusLine: {
        type: 'command',
        command: 'node "$CLAUDE_PROJECT_DIR/scripts/ligne-etat/ligne-etat.mjs"',
      },
    });
    expect(barreApresMaj(p)).toEqual(BARRE);
  });

  it('a frame status line with another refreshInterval is set back to 10', () => {
    const p = projetAvec({
      statusLine: { type: 'command', command: maj.LIGNE_ETAT, refreshInterval: 30 },
    });
    expect(barreApresMaj(p)).toEqual(BARRE);
  });

  it('a key of the frame’s status line that the frame does not know is removed', () => {
    const p = projetAvec({
      statusLine: { type: 'command', command: maj.LIGNE_ETAT, padding: 2, refreshInterval: 10 },
    });
    expect(barreApresMaj(p)).toEqual(BARRE);
  });

  it('a status line of the project’s own stays whole, with or without a refreshInterval', () => {
    for (const propre of [
      { type: 'command', command: 'bash ~/ma-ligne.sh' },
      { type: 'command', command: 'bash ~/ma-ligne.sh', refreshInterval: 60, padding: 1 },
    ]) {
      const p = projetAvec({ statusLine: propre });
      expect(barreApresMaj(p)).toEqual(propre);
    }
  });

  it('the other keys of the settings keep their order', () => {
    const p = projetAvec({
      model: 'opus',
      statusLine: { type: 'command', command: maj.LIGNE_ETAT },
      permissions: { allow: [] },
    });
    maj.mettreAJour(p, DEPOT);
    const cles = Object.keys(lireJson(p, REGLAGES));
    expect(cles.slice(0, 3)).toEqual(['model', 'statusLine', 'permissions']);
  });

  it('a replayed update rewrites nothing', () => {
    for (const depart of [{ model: 'opus' }, { statusLine: { type: 'command', command: 'x' } }]) {
      const p = projetAvec(depart);
      maj.mettreAJour(p, DEPOT);
      const premier = readFileSync(path.join(p, REGLAGES), 'utf8');
      maj.mettreAJour(p, DEPOT);
      expect(readFileSync(path.join(p, REGLAGES), 'utf8')).toBe(premier);
    }
  });
});
