import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTestFile, refusal } from '../../scripts/verrous/verrou.mjs';

const SCRIPT = path.resolve(__dirname, '../../scripts/verrous/verrou.mjs');
const ROOT = '/repo';
const SCRATCH = '/scratch';

// A session whose sub-agent was launched with `prompt`, as Claude Code lays it on disk.
function session(prompt: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'verrou-'));
  mkdirSync(path.join(dir, 's1', 'subagents'), { recursive: true });
  const first = { type: 'user', message: { role: 'user', content: prompt } };
  writeFileSync(path.join(dir, 's1', 'subagents', 'agent-a1.jsonl'), JSON.stringify(first) + '\n');
  return { transcript_path: path.join(dir, 's1.jsonl'), agent_id: 'a1', cwd: ROOT };
}

function write(file: string, extra: object = {}) {
  return { tool_name: 'Write', tool_input: { file_path: file, content: 'x' }, cwd: ROOT, ...extra };
}

const options = (description: string | null) => ({ tmp: SCRATCH, describe: () => description });

describe('isTestFile', () => {
  it.each([
    'tests/unit/a.ts',
    'src/__tests__/a.ts',
    'packages/x/test/a.js',
    'src/a.test.ts',
    'src/a.spec.mjs',
    'src/A.test.tsx',
  ])('%s is a test file', f => expect(isTestFile(f)).toBe(true));

  it.each(['src/a.ts', 'src/testing.ts', 'src/contest/a.ts', 'docs/tests.md'])(
    '%s is not a test file',
    f => expect(isTestFile(f)).toBe(false)
  );
});

describe('testeur', () => {
  it('writes a test file', () => {
    expect(refusal('testeur', write('/repo/tests/a.spec.ts'), options(null))).toBeNull();
  });
  it('writes in the scratchpad', () => {
    expect(refusal('testeur', write('/scratch/s/lot.patch'), options(null))).toBeNull();
  });
  it('does not write code', () => {
    expect(refusal('testeur', write('/repo/src/a.ts'), options(null))).toMatch(
      /seulement des fichiers de test/
    );
  });
  it('does not edit code', () => {
    const edit = { tool_name: 'Edit', tool_input: { file_path: '/repo/src/a.ts' }, cwd: ROOT };
    expect(refusal('testeur', edit, options(null))).toMatch(/seulement des fichiers de test/);
  });
  it('lets other tools through', () => {
    const read = { tool_name: 'Read', tool_input: { file_path: '/repo/src/a.ts' }, cwd: ROOT };
    expect(refusal('testeur', read, options(null))).toBeNull();
  });
});

describe('developpeur', () => {
  const ready = session('Tu es un agent.\n\nTON TICKET : demo-12 — un sujet.');
  const withArchitecture = options('## Architecture\n- Modèle mûr : X\n\n## Travail\n1. Y');

  it('writes code when its ticket has its Architecture section', () => {
    expect(refusal('developpeur', write('/repo/src/a.ts', ready), withArchitecture)).toBeNull();
  });
  it('does not write a test file', () => {
    expect(refusal('developpeur', write('/repo/tests/a.spec.ts', ready), withArchitecture)).toMatch(
      /appartiennent au testeur/
    );
  });
  it('does not write code while its ticket lacks the Architecture section', () => {
    expect(
      refusal('developpeur', write('/repo/src/a.ts', ready), options('## Travail\n1. Y'))
    ).toMatch(/section « ## Architecture »/);
  });
  it('does not take an Architecture word in the text for the section', () => {
    expect(
      refusal(
        'developpeur',
        write('/repo/src/a.ts', ready),
        options('Voir ## Architecture plus tard')
      )
    ).toMatch(/section « ## Architecture »/);
  });
  it('does not write code when its ticket is unreadable', () => {
    expect(refusal('developpeur', write('/repo/src/a.ts', ready), options(null))).toMatch(
      /illisible/
    );
  });
  it('does not write code without a ticket in its launch prompt', () => {
    const lost = session('Tu es un agent sans ticket.');
    expect(refusal('developpeur', write('/repo/src/a.ts', lost), withArchitecture)).toMatch(
      /introuvable/
    );
  });
  it('writes in the scratchpad without a ticket', () => {
    const lost = session('Tu es un agent sans ticket.');
    expect(refusal('developpeur', write('/scratch/s/lot.patch', lost), options(null))).toBeNull();
  });
});

describe('an unknown role', () => {
  it('writes nothing', () => {
    expect(refusal('cuisinier', write('/repo/src/a.ts'), options(null))).toMatch(/Rôle inconnu/);
  });
});

describe('the hook command', () => {
  const run = (role: string, input: object) =>
    spawnSync('node', [SCRIPT, role], { input: JSON.stringify(input), encoding: 'utf8' });

  it('refuses with exit code 2 and its reason on stderr', () => {
    const r = run('testeur', write('/repo/src/a.ts'));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/seulement des fichiers de test/);
  });
  it('allows with exit code 0', () => {
    const r = run('testeur', write('/repo/tests/a.spec.ts'));
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });
});
