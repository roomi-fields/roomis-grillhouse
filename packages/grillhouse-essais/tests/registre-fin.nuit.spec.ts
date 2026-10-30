// Ticket grillhouse-3uv.72: the end of a long session writes its line to the register
// (scripts/registre.mjs). The chain, played at night: the hook in a git repository of trial and its
// copy, where it reads the project of the session. The hook itself is the day's
// (packages/grillhouse/tests/unit/registre-fin.spec.ts).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { CADRE } from './cadre.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'registre-fin-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.join(CADRE, 'scripts/registre.mjs');
const l = (o: object) => JSON.stringify(o);
const T0 = Date.parse('2026-10-10T06:00:00Z');
const quand = (ms: number) => new Date(T0 + ms).toISOString();

// The register's lines, as written.
const lignes = (registre: string) =>
  existsSync(registre)
    ? readFileSync(registre, 'utf8')
        .split('\n')
        .filter(x => x.trim())
    : [];
// The register once it holds `n` lines, within `timeout` milliseconds.
const attendre = (registre: string, n: number, timeout = 20_000) =>
  vi.waitFor(
    () => {
      expect(lignes(registre).length).toBeGreaterThanOrEqual(n);
    },
    { timeout, interval: 100 }
  );
// The first line of the register, read.
const premiere = (registre: string): unknown => JSON.parse(lignes(registre)[0] ?? 'null');

// A transcript of `n` assistant events after the ticket's prompt, each a message of its own.
const temoin = (n: number, pad = 'é'.repeat(2_000)) => {
  const out = [
    l({ type: 'user', timestamp: quand(0), message: { content: 'TON TICKET : demo-9.1 — x' } }),
  ];
  for (let i = 0; i < n; i++) {
    out.push(
      l({
        type: 'assistant',
        timestamp: quand(i),
        message: {
          id: `m${i}`,
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [{ type: 'text', text: pad }],
        },
      })
    );
  }
  return `${out.join('\n')}\n`;
};

const dossier = () => mkdtempSync(path.join(ESSAIS, 'cas-'));
const session = (d: string, id: string, texte: string) => {
  const f = path.join(d, `${id}.jsonl`);
  writeFileSync(f, texte);
  return {
    input: { hook_event_name: 'SessionEnd', transcript_path: f, session_id: id, cwd: d },
    f,
  };
};

// grillhouse-3uv.89, L2 (found by L8): a session of a role is written under its project, the main
// tree, whatever directory its shell stands in when it ends. Witness: BPScript 320.3, the session
// of 995-tools at 13:40 written under `<copie>/packages/990-corpus/test/scenes`: in the envelope,
// that directory is a mount of its own, where git stops looking for the repository (« Arrêt à la
// limite du système de fichiers »). GIT_CEILING_DIRECTORIES stops git the same way at the copy.
describe('3uv.89 L2 — the project of a session whose shell stands where git finds no repository', () => {
  it('is the main tree of the copy the session opened in (CLAUDE_PROJECT_DIR), not its last directory', async () => {
    const d = dossier();
    const principal = path.join(d, 'depot');
    mkdirSync(principal);
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', principal, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('init', '-q');
    git('commit', '-q', '--allow-empty', '-m', 'init');
    const copie = path.join(principal, '.claude/worktrees/demo-3');
    git('worktree', 'add', '-q', '-b', 'agent/demo-3', copie);
    const sous = path.join(copie, 'packages/a/test');
    mkdirSync(sous, { recursive: true });
    const { input } = session(d, 's12', temoin(5));
    const registre = path.join(d, 'registre.jsonl');
    const r = spawnSync('node', [SCRIPT], {
      input: l({ ...input, cwd: sous }),
      env: {
        ...process.env,
        GRILLHOUSE_REGISTRE: registre,
        CLAUDE_PROJECT_DIR: copie,
        GIT_CEILING_DIRECTORIES: copie,
      },
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
    await attendre(registre, 1);
    expect(premiere(registre)).toMatchObject({ agent: 's12', projet: principal });
  }, 30_000);
});
