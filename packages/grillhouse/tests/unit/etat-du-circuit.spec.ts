// grillhouse-3uv.92.7, critère 2: the regulator reads the circuit's state by a command of reading
// of the circuit (scripts/etat-du-circuit.mjs), as `kubectl describe` or `gh run view` give a
// bounded view in place of a raw file: its step, its component, its stop, its last reds and its
// files, under the limit of Read; its instruction names it. Witness: BPScript 320.4, a state of
// 33 k tokens past the 25 k of Read, Read refused 10 times, python3 13 times, two MONTE on
// suppositions.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BORNE } from '../../scripts/etat-du-circuit.mjs';
import { optionsDuRole } from '../../scripts/droits.mjs';

const RACINE = path.resolve(__dirname, '../../../..');
const SCRIPT = path.join(RACINE, 'packages/grillhouse/scripts/etat-du-circuit.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'etat-du-circuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The limit of Read, 25 000 tokens, at its lowest count of characters per token.
const LIMITE_DE_READ = 25_000 * 2;

// A ticket's copy beside its state, its log and two proofs; the copy changes one file. The report
// of the stop is long, as a final pass's: 3 000 lines of detail, then its reds.
function essai() {
  const worktrees = path.join(ESSAIS, '.claude/worktrees');
  const copie = path.join(worktrees, 'demo-1');
  mkdirSync(path.join(copie, 'packages/forms/src'), { recursive: true });
  const git = (...a: string[]) => spawnSync('git', ['-C', copie, ...a], { encoding: 'utf8' });
  git('init', '-q');
  writeFileSync(path.join(copie, 'packages/forms/src/index.mjs'), 'export const a = 1;\n');
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base');
  writeFileSync(path.join(copie, 'packages/forms/src/index.mjs'), 'export const a = 2;\n');
  const detail = Array.from(
    { length: 3000 },
    (_, i) => `  at ligne ${i} du détail d'une commande, ${'x'.repeat(60)}`
  );
  const rouges = Array.from(
    { length: 30 },
    (_, i) => `- packages/forms : test/mesure.test.mjs › critère ${i} — attendu ${i}`
  );
  const etat = path.join(worktrees, 'demo-1.circuit.json');
  writeFileSync(
    etat,
    JSON.stringify(
      {
        etape: 'developpeur',
        composant: 'packages/forms',
        tentative: 2,
        code: 14,
        raison: 'controles',
        rapport: [
          'Contrôles de packages/forms : rouge.',
          ...detail,
          'Tes rouges (30) :',
          ...rouges,
        ].join('\n'),
        composants: ['packages/forms', 'packages/binder'],
        atteints: ['packages/forms'],
        renvois: null,
        journal: path.join(worktrees, 'demo-1.log'),
      },
      null,
      2
    )
  );
  writeFileSync(path.join(worktrees, 'demo-1.log'), 'journal\n');
  writeFileSync(path.join(worktrees, 'demo-1.preuve-1.md'), 'preuve 1\n');
  writeFileSync(path.join(worktrees, 'demo-1.preuve-2.md'), 'preuve 2\n');
  return { etat, worktrees };
}

describe('critère 2 — the regulator reads the state by a command of the circuit', () => {
  it('prints a bounded summary: step, component, stop, last reds and files, under the limit of Read', () => {
    const { etat, worktrees } = essai();
    expect(readFileSync(etat, 'utf8').length).toBeGreaterThan(LIMITE_DE_READ);
    const r = spawnSync('node', [SCRIPT, etat], { cwd: RACINE, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.length).toBeLessThanOrEqual(BORNE);
    expect(BORNE).toBeLessThan(LIMITE_DE_READ);
    expect(r.stdout).toContain('2.3 Code');
    expect(r.stdout).toContain('packages/forms');
    expect(r.stdout).toMatch(/controles \(code 14\)/);
    // The last reds, the last one whole.
    expect(r.stdout).toContain('test/mesure.test.mjs › critère 29 — attendu 29');
    // Its files: the log, the proofs, and what the copy changes.
    expect(r.stdout).toContain(path.join(worktrees, 'demo-1.log'));
    expect(r.stdout).toContain(path.join(worktrees, 'demo-1.preuve-2.md'));
    expect(r.stdout).toContain('packages/forms/src/index.mjs');
  });

  it('an unreadable state is said, exit 1', () => {
    const r = spawnSync('node', [SCRIPT, path.join(ESSAIS, 'absent.circuit.json')], {
      encoding: 'utf8',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/absent\.circuit\.json/);
  });

  it("the regulator's instruction names the command on its state, its skill names it, and its rights hold it in place of the read of the raw file", () => {
    const consigne = readFileSync(
      path.join(RACINE, '.claude/skills/pitmaster/references/consigne-agent.md'),
      'utf8'
    );
    const gabarit = /## Régulateur, sur un arrêt[\s\S]*?```text\n([\s\S]*?)```/.exec(consigne)?.[1];
    expect(gabarit).toContain('`npx grillhouse etat-du-circuit {{etat}}`');
    const competence = readFileSync(
      path.join(RACINE, '.claude/skills/regulateur/SKILL.md'),
      'utf8'
    );
    expect(competence).toContain('`npx grillhouse etat-du-circuit <etat>`');
    const a = optionsDuRole('regulateur', {
      racine: RACINE,
      copie: RACINE,
      ticket: 'demo-1',
      journal: '/depot/.claude/worktrees/demo-1.log',
      preuves: '/depot/.claude/worktrees/demo-1.preuve-*.md',
    });
    const { allow } = (
      JSON.parse(a[a.indexOf('--settings') + 1]) as { permissions: { allow: string[] } }
    ).permissions;
    expect(allow).toContain('Bash(npx grillhouse etat-du-circuit *)');
    expect(allow.filter(r => r.includes('.circuit.json'))).toEqual([]);
  });
});
