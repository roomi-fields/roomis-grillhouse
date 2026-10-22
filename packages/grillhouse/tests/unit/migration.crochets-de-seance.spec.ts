import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { migrer, version } from '../../scripts/migrations/0.23.0-crochets-de-seance.mjs';

// grillhouse-3uv.84.4 critère 6: a migration removes from the project's settings the frame's
// session hooks, which the frame's plugin carries since 84.2; critère 3: replayable without effect.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-crochets-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const crochet = (command: string, matcher?: string) => ({
  ...(matcher ? { matcher } : {}),
  hooks: [{ type: 'command', command }],
});
// The frame's session hooks, as the settings of a project held them before 84.2.
const ANCIENS = {
  SessionStart: [crochet('bash "$CLAUDE_PROJECT_DIR/scripts/session-start.sh"')],
  UserPromptSubmit: [crochet('bash "$CLAUDE_PROJECT_DIR/scripts/structure-guard.sh"')],
  PreToolUse: [
    crochet('node "$CLAUDE_PROJECT_DIR/scripts/verrous/ticket-du-sous-agent.mjs"', 'Agent|Task'),
  ],
  SubagentStop: [crochet('node "$CLAUDE_PROJECT_DIR/scripts/registre.mjs"')],
  SessionEnd: [crochet('node "$CLAUDE_PROJECT_DIR/scripts/registre.mjs"')],
};

function projet(reglages: Record<string, unknown> | null) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  if (reglages) {
    mkdirSync(path.join(p, '.claude'));
    writeFileSync(path.join(p, '.claude/settings.json'), `${JSON.stringify(reglages, null, 2)}\n`);
  }
  return p;
}
const lire = (p: string) => readFileSync(path.join(p, '.claude/settings.json'), 'utf8');

describe('migration 0.23.0 — the frame’s session hooks leave the project’s settings', () => {
  it('is the migration of 0.23.0', () => {
    expect(version).toBe('0.23.0');
  });

  it('removes the frame’s five hooks, the key hooks with them, the other keys kept in their order', () => {
    const p = projet({
      model: 'opus',
      hooks: ANCIENS,
      statusLine: { type: 'command', command: 'x' },
    });
    const lignes = migrer(p);
    expect(lignes).toHaveLength(5);
    expect(Object.keys(JSON.parse(lire(p)) as object)).toEqual(['model', 'statusLine']);
  });

  it('keeps a hook of the project’s own, in its group and its event', () => {
    const mien = crochet('node outils/mon-garde.mjs', 'Bash');
    const p = projet({
      hooks: {
        ...ANCIENS,
        PreToolUse: [...ANCIENS.PreToolUse, mien],
        SessionStart: [
          {
            hooks: [...ANCIENS.SessionStart[0].hooks, { type: 'command', command: 'echo bonjour' }],
          },
        ],
      },
    });
    migrer(p);
    expect((JSON.parse(lire(p)) as { hooks: unknown }).hooks).toEqual({
      PreToolUse: [mien],
      SessionStart: [{ hooks: [{ type: 'command', command: 'echo bonjour' }] }],
    });
  });

  it('a second pass changes no byte and reports nothing', () => {
    const p = projet({ model: 'opus', hooks: { ...ANCIENS, Stop: [crochet('echo fin')] } });
    migrer(p);
    const premier = lire(p);
    expect(migrer(p)).toEqual([]);
    expect(lire(p)).toBe(premier);
  });

  it('settings without the frame’s hooks are not written', () => {
    const texte =
      '{"model":"opus","hooks":{"Stop":[{"hooks":[{"type":"command","command":"x"}]}]}}';
    const p = projet(null);
    mkdirSync(path.join(p, '.claude'));
    writeFileSync(path.join(p, '.claude/settings.json'), texte);
    expect(migrer(p)).toEqual([]);
    expect(lire(p)).toBe(texte);
  });

  it('a project without settings is left without', () => {
    const p = projet(null);
    expect(migrer(p)).toEqual([]);
    expect(existsSync(path.join(p, '.claude/settings.json'))).toBe(false);
  });
});
