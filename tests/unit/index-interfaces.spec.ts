import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { entrees, index, interfaces } from '../../scripts/index-interfaces.mjs';

const SCRIPT = path.resolve(__dirname, '../../scripts/index-interfaces.mjs');

const INTERFACE_B = [
  '# b — l’interface',
  '',
  'Le composant b rend les durées. Il ne lit rien du disque.',
  '',
  '## durée(objet)',
  '',
  'Rend la durée d’un objet en battements. Refuse un objet sans tempo.',
  '',
  '### Les fautes',
  '',
  '- Un objet sans tempo produit la faute B1.',
  '',
  '## Le garde',
  '',
  '| colonne | x |',
].join('\n');

function repo(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'index-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

describe('entrees', () => {
  const lines = entrees('packages/b/docs/INTERFACE.md', INTERFACE_B);

  it('gives the component its title and first sentence', () => {
    expect(lines[0]).toBe('## b — b — l’interface');
    expect(lines[2]).toBe('Le composant b rend les durées. (`packages/b/docs/INTERFACE.md`)');
  });
  it('gives each provided element its first sentence', () => {
    expect(lines).toContain('- **durée(objet)** — Rend la durée d’un objet en battements.');
  });
  it('indents a sub-section under its element', () => {
    expect(lines).toContain('  - **Les fautes** — Un objet sans tempo produit la faute B1.');
  });
  it('keeps a heading whose body is only a table', () => {
    expect(lines).toContain('- **Le garde**');
  });
});

describe('entrees and code blocks', () => {
  it('takes no heading from inside a code block', () => {
    const text = [
      '# c',
      '',
      'C rend x.',
      '',
      '```ts',
      '## pas un titre',
      '```',
      '',
      '  ~~~',
      '### non plus',
      '  ~~~',
      '',
      '## vrai',
      '',
      'Oui.',
    ].join('\n');
    const lines = entrees('packages/c/docs/INTERFACE.md', text);
    expect(lines.filter(l => l.startsWith('-') || l.startsWith('  -'))).toEqual([
      '- **vrai** — Oui.',
    ]);
  });
});

describe('interfaces', () => {
  it('finds the interfaces of packages, of modules and of the root, in order', () => {
    const dir = repo({
      'packages/b/docs/INTERFACE.md': '# b',
      'packages/a/docs/INTERFACE.md': '# a',
      'packages/c/docs/CADRE.md': '# c',
      'src/parser/docs/INTERFACE.md': '# p',
      'docs/INTERFACE.md': '# racine',
    });
    expect(interfaces(dir)).toEqual([
      'docs/INTERFACE.md',
      'packages/a/docs/INTERFACE.md',
      'packages/b/docs/INTERFACE.md',
      'src/parser/docs/INTERFACE.md',
    ]);
  });
});

describe('the command', () => {
  const dir = repo({ 'packages/b/docs/INTERFACE.md': INTERFACE_B, 'docs/agents/.keep': '' });
  const run = (...args: string[]) =>
    spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });

  it('refuses an index that is missing or out of date', () => {
    const r = run('--verifier');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/pas à jour/);
  });
  it('writes the index, which then passes the check', () => {
    expect(run().status).toBe(0);
    expect(run('--verifier').status).toBe(0);
  });
  it('refuses again once an interface changes', () => {
    writeFileSync(
      path.join(dir, 'packages/b/docs/INTERFACE.md'),
      INTERFACE_B + '\n## nouveau\n\nX.'
    );
    expect(run('--verifier').status).toBe(1);
  });
  it('writes what index() returns', () => {
    run();
    expect(index(dir)).toContain('- **nouveau** — X.');
  });
});
