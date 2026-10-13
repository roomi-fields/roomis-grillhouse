import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// grillhouse-3uv.56 critère 8: the recipe of a ticket's title (docs/agents/issue-tracker.md,
// « Numéros et titres ») strips the whole prefix of the project (`bd config get issue_prefix`),
// not the text before the first dash: with the prefix bp-mono, the title of
// bp-mono-vbwf.322.6.6.12 starts with « vbwf.322.6.6.12 — ». The skills that write a title
// (explorateur, developpeur) carry the same recipe.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'titre-des-tickets-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../..');
const DOC = path.join(DEPOT, 'docs/agents/issue-tracker.md');
const COMPETENCES = ['.claude/skills/explorateur/SKILL.md', '.claude/skills/developpeur/SKILL.md'];

// The bash block of « Numéros et titres », its placeholders (<subject>, <mother>…) filled in.
const recette = () => {
  const section = readFileSync(DOC, 'utf8').split('## Numéros et titres')[1] ?? '';
  const bloc = /```bash\n([\s\S]*?)```/.exec(section)?.[1] ?? '';
  expect(bloc).toMatch(/--title/);
  return bloc.replace(/<mother>/g, 'parent-x').replace(/<(\w+)>/g, (_m, w: string) => `le ${w}`);
};

// The recipe run against a Beads that answers <prefixe> to the prefix and <id> to the creation;
// returns the title it writes.
function titre(prefixe: string, id: string) {
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
  const r = spawnSync('bash', ['-c', recette()], {
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
  it('critère 8: the skills explorateur and developpeur write the number by the same recipe as the document', () => {
    const numero = (texte: string) => /--title "(.*?) — /.exec(texte)?.[1];
    const reference = numero(readFileSync(DOC, 'utf8'));
    expect(reference).toBeDefined();
    for (const c of COMPETENCES) {
      expect(numero(readFileSync(path.join(DEPOT, c), 'utf8')), c).toBe(reference);
    }
  });
});
