import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { declares, imports, verifier } from '../../scripts/consommateurs.mjs';

const SCRIPT = path.resolve(__dirname, '../../scripts/consommateurs.mjs');

function repo(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'consommateurs-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

const INTERFACE_B = (consommateurs: string) =>
  ['# b', '', 'B rend les durées.', '', '## duree', '', 'Rend une durée.', '', consommateurs].join(
    '\n'
  );

describe('declares', () => {
  it('reads each consumer with its elements, only inside the section', () => {
    const d = declares(
      [
        '## duree',
        '',
        '- `x` : faux',
        '',
        '## Consommateurs',
        '',
        '- `a` : duree, `tempo`',
        '* c : *',
        '',
        '## Fin',
        '- `y` : faux',
      ].join('\n')
    );
    expect([...d.keys()]).toEqual(['a', 'c']);
    expect(d.get('a')).toEqual(new Set(['duree', 'tempo']));
    expect(d.get('c')).toEqual(new Set(['*']));
  });
});

describe('imports', () => {
  it('names what each import takes', () => {
    const src = [
      "import { duree, type Tempo as T } from '@demo/b';",
      "import def, { x } from '../b/x';",
      "import * as ns from '@demo/b/sub';",
      "export * from '@demo/c';",
      "export { y } from '@demo/c';",
      "import '@demo/d';",
      "const e = await import('@demo/e');",
      "const f = require('@demo/f');",
    ].join('\n');
    expect(imports(src)).toEqual([
      { spec: '@demo/b', noms: ['duree', 'Tempo'] },
      { spec: '../b/x', noms: ['x', '*'] },
      { spec: '@demo/b/sub', noms: ['*'] },
      { spec: '@demo/c', noms: ['*'] },
      { spec: '@demo/c', noms: ['y'] },
      { spec: '@demo/d', noms: ['*'] },
      { spec: '@demo/e', noms: ['*'] },
      { spec: '@demo/f', noms: ['*'] },
    ]);
  });
  it('does not run from one statement into the next', () => {
    expect(imports("export const k = 1;\nimport { a } from '@demo/b';")).toEqual([
      { spec: '@demo/b', noms: ['a'] },
    ]);
  });
});

describe('verifier', () => {
  const base = {
    'packages/b/package.json': '{"name":"@demo/b"}',
    'packages/a/package.json': '{"name":"@demo/a"}',
    'packages/a/src/index.ts': "import { duree } from '@demo/b';",
    'packages/a/src/index.spec.ts': "import { cache } from '@demo/b';",
    'packages/a/tests/x.ts': "import { cache } from '@demo/b';",
  };

  it('passes a use the provider declares', () => {
    const dir = repo({
      ...base,
      'packages/b/docs/INTERFACE.md': INTERFACE_B('## Consommateurs\n\n- `a` : duree'),
    });
    expect(verifier(dir)).toEqual({ refus: [], signaux: [] });
  });
  it('refuses a use the provider does not declare', () => {
    const dir = repo({ ...base, 'packages/b/docs/INTERFACE.md': INTERFACE_B('') });
    expect(verifier(dir).refus).toEqual([
      'a utilise « duree » de b, que packages/b/docs/INTERFACE.md ne déclare pas.',
    ]);
  });
  it('refuses a use of a provider without interface', () => {
    expect(verifier(repo(base)).refus).toHaveLength(1);
  });
  it('reports a declared use that no code makes, without refusing', () => {
    const dir = repo({
      ...base,
      'packages/b/docs/INTERFACE.md': INTERFACE_B('## Consommateurs\n\n- `a` : duree, tempo'),
    });
    expect(verifier(dir)).toEqual({
      refus: [],
      signaux: [
        "packages/b/docs/INTERFACE.md déclare « tempo » pour a, qu'aucun code de a n'utilise.",
      ],
    });
  });
  it('follows a relative path between the modules of src', () => {
    const dir = repo({
      'src/parser/index.ts': "import { jeton } from '../lexer/jetons';",
      'src/lexer/jetons.ts': 'export const jeton = 1;',
      'src/lexer/docs/INTERFACE.md': '# lexer\n\nL.\n\n## Consommateurs\n\n- `parser` : jeton',
      'src/index.ts': "import { jeton } from './lexer/jetons';",
    });
    expect(verifier(dir).refus).toEqual([]);
  });
  it('reads the script of a Svelte or Vue component', () => {
    const dir = repo({
      'src/vue/A.svelte':
        '<script lang="ts">\n  import { jeton } from \'../lexer/jetons\';\n</script>',
      'src/vue/B.vue': "<script setup>\nimport { position } from '../lexer/jetons';\n</script>",
      'src/lexer/jetons.ts': '',
    });
    expect(verifier(dir).refus).toHaveLength(2);
  });
  it('does not take a use inside one component for a consumer', () => {
    const dir = repo({ 'src/lexer/a.ts': "import { b } from './b';", 'src/lexer/b.ts': '' });
    expect(verifier(dir)).toEqual({ refus: [], signaux: [] });
  });
});

describe('the command', () => {
  it('exits 1 on a refusal and names the arbitre', () => {
    const dir = repo({
      'packages/b/package.json': '{"name":"@demo/b"}',
      'packages/a/src/index.ts': "import { duree } from '@demo/b';",
    });
    const r = spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/arbitre/);
  });
  it('exits 0 on a repository without components', () => {
    expect(spawnSync('node', [SCRIPT], { cwd: repo({}), encoding: 'utf8' }).status).toBe(0);
  });
});
