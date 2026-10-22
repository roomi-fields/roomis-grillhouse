import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// grillhouse-3uv.56 critère 8: scripts/ticket.sh titles a ticket by stripping the whole prefix of
// the project (`bd config get issue_prefix`), not the text before the first dash: with the prefix
// bp-mono, the title of bp-mono-vbwf.322.6.6.12 starts with « vbwf.322.6.6.12 — ».
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'titre-des-tickets-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../../../..');
const SCRIPT = path.join(DEPOT, 'packages/grillhouse/scripts/ticket.sh');

// The script run against a Beads that answers <prefixe> to the prefix and <id> to the creation;
// returns the title it writes.
function titre(prefixe: string, id: string, composants = 'le component') {
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  const appels = path.join(bin, 'appels');
  writeFileSync(
    path.join(bin, 'bd'),
    [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> ${appels}`,
      'case "$1 $2 $3" in',
      `  "config get issue_prefix") case "$*" in *--json*) echo '{"key":"issue_prefix","value":"${prefixe}"}';; *) echo ${prefixe};; esac;;`,
      'esac',
      `case "$1" in create) echo ${id};; esac`,
      '',
    ].join('\n'),
    { mode: 0o755 }
  );
  const r = spawnSync('bash', [SCRIPT, 'parent-x', 'le subject', composants, 'le body'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  expect(r.status, r.stderr).toBe(0);
  const update = readFileSync(appels, 'utf8')
    .split('\n')
    .find(l => l.startsWith(`update ${id} --title `));
  expect(update, readFileSync(appels, 'utf8')).toBeDefined();
  return (update ?? '').slice(`update ${id} --title `.length);
}

describe('grillhouse-3uv.56 critère 8 — the title strips the whole prefix of the project', () => {
  it('critère 8: with the prefix bp-mono, the title of bp-mono-vbwf.322.6.6.12 starts with « vbwf.322.6.6.12 — »', () => {
    expect(titre('bp-mono', 'bp-mono-vbwf.322.6.6.12')).toBe(
      'vbwf.322.6.6.12 — le subject — le component'
    );
  });
  it('critère 8: a prefix of two dashes (mon-beau-projet) is stripped whole', () => {
    expect(titre('mon-beau-projet', 'mon-beau-projet-320.2.1')).toBe(
      '320.2.1 — le subject — le component'
    );
  });
  it('critère 8: a prefix without dash (demo) gives the number alone, as today', () => {
    expect(titre('demo', 'demo-320.2.1')).toBe('320.2.1 — le subject — le component');
  });
});

describe('a ticket names its components, the provider first', () => {
  it('the components given as « a, b » end the title as they are, in their order', () => {
    expect(titre('demo', 'demo-320.5.2', '020-loader, 050-emitter')).toBe(
      '320.5.2 — le subject — 020-loader, 050-emitter'
    );
  });
});
