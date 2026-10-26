import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declares, imports, lireLigne, verifier } from '../../scripts/consommateurs.mjs';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'consommateurs-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.resolve(__dirname, '../../scripts/consommateurs.mjs');

function repo(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(ESSAIS, 'consommateurs-'));
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

// grillhouse-wwr critère 2 (the owner's Q2, amended by the supervisor): one form only,
// `- \`consommateur\` : nom, nom`, for every bullet of the section. A bullet of prose (BPScript
// 990-corpus/docs/INTERFACE.md:274-289, at 0.24.5) gave « names » that are none, or was passed over.
describe('grillhouse-wwr critère 2 — a bullet of the section is a list of names', () => {
  it('reads the consumer and its names, each a JavaScript identifier or `*`', () => {
    expect(lireLigne('- `a` : duree, `$tempo_2`, *')).toEqual({
      consommateur: 'a',
      noms: ['duree', '$tempo_2', '*'],
    });
  });
  it('gives no name for a bullet whose piece after « : » is not a name', () => {
    const prose =
      '- `995-tools` : le script `src/empreinte-v2.mjs` importe la porte et lit `scenePaths`, `sceneText` et `compilerOptions`';
    expect(lireLigne(prose)).toEqual({ consommateur: null, noms: null });
    expect(lireLigne('- `a` : duree, le type Played')).toEqual({ consommateur: null, noms: null });
  });
  it('gives no name for a bullet without « : »', () => {
    expect(lireLigne('- Les bancs de `100-resolver` lisent `outer`.')).toEqual({
      consommateur: null,
      noms: null,
    });
  });
  it('is no line of a consumer for a paragraph', () => {
    expect(lireLigne('Aucun paquet de la v2.')).toBeNull();
  });
  it('declares gives no name for such a bullet', () => {
    const d = declares(
      '## Consommateurs\n\n- `a` : duree\n- `c` : le script lit `x`, `y` et `z`\n- Les bancs de `d` lisent `x`.'
    );
    expect([...d.keys()]).toEqual(['a']);
  });
  const fournisseur = (consommateurs: string) =>
    repo({
      'packages/b/package.json': '{"name":"@demo/b"}',
      'packages/b/docs/INTERFACE.md': INTERFACE_B(consommateurs),
      'packages/a/package.json': '{"name":"@demo/a"}',
      'packages/a/src/index.ts': "import { duree } from '@demo/b';",
      'packages/c/package.json': '{"name":"@demo/c"}',
    });
  const refus = (texte: string) => ({
    fichier: 'packages/b/docs/INTERFACE.md',
    regle: 'ligne-mal-formee',
    texte,
    message: `packages/b/docs/INTERFACE.md § Consommateurs : la ligne « ${texte} » n'est pas une liste de noms ; écrire la ligne en liste de noms : - \`consommateur\` : nom, nom.`,
  });
  it('the guard refuses a bullet of prose, with or without « : », naming the file and the line', () => {
    const avec = '- `c` : le script lit `duree` à l’exécution';
    const sans = '- Les bancs de `c` lisent `duree`.';
    expect(verifier(fournisseur(`## Consommateurs\n\n- \`a\` : duree\n${avec}\n${sans}`))).toEqual({
      refus: [refus(avec), refus(sans)],
    });
  });
  it('the guard admits a paragraph of the section, and reads none of the generated part', () => {
    const dir = fournisseur(
      [
        '## Consommateurs',
        '',
        'Aucun paquet de la v2.',
        '',
        '- `a` : duree',
        '',
        '<!-- généré: début -->',
        '### `duree`',
        '',
        '- `x` — un membre',
        '<!-- généré: fin -->',
      ].join('\n')
    );
    expect(verifier(dir)).toEqual({ refus: [] });
  });
});

describe('imports', () => {
  // grillhouse-wwr critère 1, as knip reads `const { a, b } = await import('x')`: BPScript 995-tools
  // (0.24.5) declared the names it reads so, and the guard refused them as unused.
  it('critère 1 — names what a literal dynamic import destructures, as a static import', () => {
    const src = [
      "const { a, b: c } = await import('@demo/p');",
      'const {',
      '  x,',
      '  y = 1,',
      "} = await import('../q/x');",
      "let { r } = require('@demo/r');",
      "const { s, ...reste } = await import('@demo/s');",
      "const n = await import('@demo/n');",
      "const { default: X, d } = await import('@demo/d');",
    ].join('\n');
    expect(imports(src)).toEqual([
      { spec: '@demo/p', noms: ['a', 'b'] },
      { spec: '../q/x', noms: ['x', 'y'] },
      { spec: '@demo/r', noms: ['r'] },
      { spec: '@demo/s', noms: ['s', '*'] },
      { spec: '@demo/n', noms: ['*'] },
      // `default`, as `import X from 'p'`, is `*`.
      { spec: '@demo/d', noms: ['*', 'd'] },
    ]);
  });
  it('critère 1 — the guard counts a destructured dynamic import as a use of its names', () => {
    const dir = repo({
      'packages/b/package.json': '{"name":"@demo/b"}',
      'packages/b/docs/INTERFACE.md': INTERFACE_B('## Consommateurs\n\n- `a` : duree, tempo'),
      'packages/a/package.json': '{"name":"@demo/a"}',
      'packages/a/src/index.mjs': "const { duree, tempo } = await import('@demo/b');",
    });
    expect(verifier(dir)).toEqual({ refus: [] });
  });
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

// A link of shared test material (an import of `<package>/test-fixtures`, from a test or from the
// material itself) is no production use: the check neither refuses nor reports it (grillhouse-3uv.67.1).
describe('a link of shared test material', () => {
  const paquet = (nom: string, matiere: boolean) =>
    JSON.stringify({
      name: nom,
      version: '1.0.0',
      exports: matiere
        ? { '.': './src/index.ts', './test-fixtures': './test/fixture.ts' }
        : { '.': './src/index.ts' },
    });
  it('is neither refused nor reported by the check of the interfaces', () => {
    const dir = repo({
      'packages/b/package.json': paquet('@e/b', true),
      'packages/b/src/index.ts': 'export const b = 1;\n',
      'packages/b/test/fixture.ts': 'export const exemple = 1;\n',
      'packages/b/docs/INTERFACE.md': '# b\n\nB.\n\n## Consommateurs\n',
      'packages/a/package.json': paquet('@e/a', true),
      'packages/a/src/index.ts': 'export const a = 1;\n',
      'packages/a/test/a.spec.ts': "import { exemple } from '@e/b/test-fixtures';\n",
      'packages/a/test/fixture.ts': "export * from '@e/b/test-fixtures';\n",
    });
    expect(verifier(dir)).toEqual({ refus: [] });
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
    expect(verifier(dir)).toEqual({ refus: [] });
  });
  it('refuses a use the provider does not declare', () => {
    const dir = repo({ ...base, 'packages/b/docs/INTERFACE.md': INTERFACE_B('') });
    expect(verifier(dir).refus).toEqual([
      {
        fichier: 'packages/b/docs/INTERFACE.md',
        regle: 'usage-non-declare',
        message: 'a utilise « duree » de b, que packages/b/docs/INTERFACE.md ne déclare pas.',
      },
    ]);
  });
  it('refuses a use of a provider without interface', () => {
    expect(verifier(repo(base)).refus).toHaveLength(1);
  });
  // grillhouse-5m1.2 critère 1, as ESLint's no-unused-vars refuses a name nothing uses: BPScript
  // 320.3.2.1 saw « LEVEL_TYPES » for 020-loader only reported, and its second review caught it.
  it('critère 1 — refuses a declared name that no code of the consumer uses', () => {
    const dir = repo({
      ...base,
      'packages/b/docs/INTERFACE.md': INTERFACE_B('## Consommateurs\n\n- `a` : duree, tempo'),
    });
    expect(verifier(dir)).toEqual({
      refus: [
        {
          fichier: 'packages/b/docs/INTERFACE.md',
          regle: 'declare-non-utilise',
          consommateur: 'a',
          nom: 'tempo',
          message:
            "packages/b/docs/INTERFACE.md déclare « tempo » pour a, qu'aucun code de a n'utilise.",
        },
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
    expect(verifier(dir)).toEqual({ refus: [] });
  });
});

describe('the command', () => {
  it('exits 1 on a refusal and names the supervisor’s arbitrage', () => {
    const dir = repo({
      'packages/b/package.json': '{"name":"@demo/b"}',
      'packages/a/src/index.ts': "import { duree } from '@demo/b';",
    });
    const r = spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/arbitrage du superviseur/);
  });
  const perime = {
    'packages/b/package.json': '{"name":"@demo/b"}',
    'packages/b/docs/INTERFACE.md': INTERFACE_B('## Consommateurs\n\n- `a` : duree, tempo'),
    'packages/a/package.json': '{"name":"@demo/a"}',
    'packages/a/src/index.ts': "import { duree } from '@demo/b';",
  };
  it('critère 1 — exits 1 on a declared name the consumer no longer uses, and says how to lift it', () => {
    const r = spawnSync('node', [SCRIPT], { cwd: repo(perime), encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain(
      "⛔ packages/b/docs/INTERFACE.md déclare « tempo » pour a, qu'aucun code de a n'utilise."
    );
    expect(r.stderr).toMatch(/sort de sa ligne/);
    expect(r.stderr).not.toMatch(/⚠️/);
    // In a ticket, the name leaves its line: the debt is inscribed once, at the passage of the rule
    // (the migration of 0.24.4), never offered by the guard.
    expect(r.stderr).not.toMatch(/dette/);
  });
  it('critère 1 — passes the same name inscribed in the debt of the project', () => {
    const dette = {
      consommateurs: {
        'packages/b/docs/INTERFACE.md': { 'declare-non-utilise': { count: 1 } },
      },
    };
    const dir = repo({ ...perime, 'grillhouse-dette.json': JSON.stringify(dette) });
    const r = spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
  });
  it('exits 0 on a repository without components', () => {
    expect(spawnSync('node', [SCRIPT], { cwd: repo({}), encoding: 'utf8' }).status).toBe(0);
  });
});

// grillhouse-3uv.56 critère 20 (replaces critère 7, supervisor's decision): a component is known by
// its name. Two directories of the same name under packages/ and src/ are refused by the check of
// the consumers, which names both paths (the reference: npm workspaces, Nx and Cargo refuse two
// projects of the same name).
describe('grillhouse-3uv.56 critère 20 — two components of the same name are refused', () => {
  const lancer = (dir: string) => spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
  it('critère 20: packages/a and src/a are refused, exit 1, both paths named', () => {
    const dir = repo({
      'packages/a/package.json': '{"name":"@demo/a"}',
      'packages/a/src/index.ts': 'export const a = 1;\n',
      'src/a/index.ts': 'export const a = 2;\n',
    });
    const r = lancer(dir);
    expect(r.status, r.stderr).toBe(1);
    const ligne = r.stderr.split('\n').find(l => l.includes('packages/a') && l.includes('src/a'));
    expect(ligne, r.stderr).toBeDefined();
  });
  it('critère 20: another name (parser), among components that are otherwise in order, is refused the same way', () => {
    const dir = repo({
      'packages/parser/package.json': '{"name":"@demo/parser"}',
      'packages/parser/src/index.ts': 'export const p = 1;\n',
      'src/parser/index.ts': 'export const p = 2;\n',
      'src/b/index.ts': 'export const duree = 1;\n',
      'src/c/index.ts': "import { duree } from '../b';\nexport const c = duree;\n",
      'src/b/docs/INTERFACE.md': INTERFACE_B('## Consommateurs\n\n- `c` : duree\n'),
    });
    const r = lancer(dir);
    expect(r.status, r.stderr).toBe(1);
    const ligne = r.stderr
      .split('\n')
      .find(l => l.includes('packages/parser') && l.includes('src/parser'));
    expect(ligne, r.stderr).toBeDefined();
    expect(
      verifier(dir).refus.some(
        l => l.message.includes('packages/parser') && l.message.includes('src/parser')
      )
    ).toBe(true);
  });
  // Arbitrage of the regulator (comment « cas relevés par le testwriter »): a name listed in
  // docs/agents/hors-cadre.txt is not a component, and packages/A and src/a bear two names.
  it('critère 20: two directories of a name listed in hors-cadre.txt, under packages/ and src/, are not refused', () => {
    const dir = repo({
      'docs/agents/hors-cadre.txt': 'outils\n',
      'packages/outils/package.json': '{"name":"@demo/outils"}',
      'packages/outils/src/index.ts': 'export const o = 1;\n',
      'src/outils/index.ts': 'export const o = 2;\n',
    });
    const r = lancer(dir);
    expect(r.status, r.stderr).toBe(0);
    expect(verifier(dir).refus).toEqual([]);
  });
  it('critère 20: packages/A and src/a, names that differ by case, are not refused', () => {
    const dir = repo({
      'packages/A/package.json': '{"name":"@demo/A"}',
      'packages/A/src/index.ts': 'export const a = 1;\n',
      'src/a/index.ts': 'export const a = 2;\n',
    });
    const r = lancer(dir);
    expect(r.status, r.stderr).toBe(0);
    expect(verifier(dir).refus).toEqual([]);
  });
});

// Witness: BPScript (320.2.4.5.1), whose `npm run verifier` played the guards beside the tests:
// Vite wrote then removed `vitest.config.ts.timestamp-<n>-<hash>.mjs` beside a configuration, the
// check listed it, read it once it was gone, and stopped on ENOENT: the final pass was red without
// a fault. A dangling link is a file listed that no longer exists when it is read.
describe('a file that vanishes while the check walks the repository', () => {
  const lancer = (dir: string) => spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
  const declare = {
    'packages/b/package.json': '{"name":"@demo/b"}',
    'packages/b/src/index.ts': 'export const duree = 1;\n',
    'packages/b/docs/INTERFACE.md': INTERFACE_B('## Consommateurs\n\n- `a` : duree'),
    'packages/a/package.json': '{"name":"@demo/a"}',
    'packages/a/src/index.ts': "import { duree } from '@demo/b';\n",
  };
  it('gives its verdict when a file listed is gone before it is read', () => {
    const dir = repo(declare);
    symlinkSync(path.join(dir, 'absent.ts'), path.join(dir, 'packages/a/src/disparu.ts'));
    const r = lancer(dir);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).not.toContain('ENOENT');
    expect(verifier(dir)).toEqual({ refus: [] });
  });
  it('still refuses a use the provider does not declare beside a file gone', () => {
    const dir = repo({
      ...declare,
      'packages/a/src/cache.ts': "import { cache } from '@demo/b';\n",
    });
    symlinkSync(path.join(dir, 'absent.ts'), path.join(dir, 'packages/a/src/disparu.ts'));
    const r = lancer(dir);
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain('a utilise « cache » de b');
  });
  it("does not read Vite's temporary file beside a configuration of Vitest", () => {
    const dir = repo({
      ...declare,
      'packages/a/src/vitest.config.ts.timestamp-1712345678901-4f2a9c.mjs':
        "import { cache } from '@demo/b';\n",
    });
    const r = lancer(dir);
    expect(r.status, r.stderr).toBe(0);
    expect(verifier(dir).refus).toEqual([]);
  });
});
