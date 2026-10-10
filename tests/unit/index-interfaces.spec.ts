import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
    expect(lines[0]).toBe('## b — l’interface');
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

// The component line takes the title as it is when the title already begins with the component's
// name — the exact folder name, ending the title or followed by a space; otherwise it prefixes that
// name (grillhouse-3uv.28).
describe('entrees and a title already prefixed', () => {
  const tete = (rel: string, titre: string) => entrees(rel, `# ${titre}\n\nX.\n`)[0];

  it.each([
    ['packages/b/docs/INTERFACE.md', 'b — l’interface'],
    ['packages/b/docs/INTERFACE.md', 'b - l’interface'],
    ['packages/b/docs/INTERFACE.md', 'b : l’interface'],
    ['packages/b/docs/INTERFACE.md', 'b l’interface'],
    ['packages/000-forms/docs/INTERFACE.md', '000-forms — l’interface'],
    ['src/parser/docs/INTERFACE.md', 'parser — l’interface du module'],
  ])('critère 1 : %s titled « %s » gives the title without an added prefix', (rel, titre) => {
    expect(tete(rel, titre)).toBe(`## ${titre}`);
  });

  it.each([
    ['packages/b/docs/INTERFACE.md', 'b', 'L’interface de b'],
    ['packages/b/docs/INTERFACE.md', 'b', 'l’interface'],
    ['packages/000-forms/docs/INTERFACE.md', '000-forms', 'Les formes — l’interface'],
    ['src/parser/docs/INTERFACE.md', 'parser', 'Le module de lecture'],
    ['packages/a.b/docs/INTERFACE.md', 'a.b', 'axb — l’interface'],
  ])('critère 2 : %s titled « %s » keeps « ## <composant> — <titre> »', (rel, nom, titre) => {
    expect(tete(rel, titre)).toBe(`## ${nom} — ${titre}`);
  });

  it.each([
    ['forms', 'formsets — l’interface'],
    ['forms', 'formsets'],
    ['b', 'bases — l’interface'],
    ['parser', 'parsers : l’interface'],
  ])('critère 3 : %s before « %s » is the start of a word, not a prefix', (nom, titre) => {
    expect(tete(`packages/${nom}/docs/INTERFACE.md`, titre)).toBe(`## ${nom} — ${titre}`);
  });

  it.each([['Interface du projet'], ['racine — l’interface'], ['L’interface racine']])(
    'critère 4 : the root interface titled « %s » keeps « ## (racine) — <titre> »',
    titre => {
      expect(tete('docs/INTERFACE.md', titre)).toBe(`## (racine) — ${titre}`);
    }
  );

  it('critère 4 : the root interface without a title keeps « ## (racine) — (racine) »', () => {
    expect(entrees('docs/INTERFACE.md', 'X.\n')[0]).toBe('## (racine) — (racine)');
  });

  it.each([
    ['packages/b/docs/INTERFACE.md', 'b'],
    ['packages/000-forms/docs/INTERFACE.md', '000-forms'],
    ['src/parser/docs/INTERFACE.md', 'parser'],
  ])('critère 6 : %s titled with its name alone gives « ## <composant> »', (rel, nom) => {
    expect(tete(rel, nom)).toBe(`## ${nom}`);
  });

  it.each([
    ['packages/b/docs/INTERFACE.md', 'b'],
    ['packages/000-forms/docs/INTERFACE.md', '000-forms'],
  ])('critère 6 : %s without a title gives « ## <composant> »', (rel, nom) => {
    expect(entrees(rel, 'X.\n')[0]).toBe(`## ${nom}`);
    expect(entrees(rel, '## Fourni\n\nY.\n')[0]).toBe(`## ${nom}`);
  });

  it.each([
    ['b', 'B — l’interface'],
    ['b', 'B'],
    ['forms', 'Forms — l’interface'],
    ['Forms', 'forms — l’interface'],
    ['parser', 'PARSER : l’interface'],
  ])('critère 7 : %s titled « %s » differs in case and keeps the prefix', (nom, titre) => {
    expect(tete(`packages/${nom}/docs/INTERFACE.md`, titre)).toBe(`## ${nom} — ${titre}`);
  });

  it.each([
    ['forms', 'forms-extra — l’interface'],
    ['forms', 'forms-extra'],
    ['b', 'b: l’interface'],
    ['b', 'b—l’interface'],
    ['b', 'b-l’interface'],
    ['parser', 'parser.js — l’interface'],
    ['000-forms', '000-forms: l’interface'],
  ])('critère 8 : %s before « %s » is followed by neither a space nor the end', (nom, titre) => {
    expect(tete(`packages/${nom}/docs/INTERFACE.md`, titre)).toBe(`## ${nom} — ${titre}`);
  });

  it.each([
    ['b', 'b - l’interface'],
    ['forms', 'forms extra'],
  ])('critère 8 : %s before « %s » followed by a space is a prefix', (nom, titre) => {
    expect(tete(`packages/${nom}/docs/INTERFACE.md`, titre)).toBe(`## ${titre}`);
  });

  it('critère 8 : b before « b<TAB>l’interface » followed by a tab is a prefix', () => {
    expect(tete('packages/b/docs/INTERFACE.md', 'b\tl’interface')).toBe('## b\tl’interface');
  });

  it('critère 1 : the whole index gives a prefixed title once', () => {
    const dir = repo({
      'packages/000-forms/docs/INTERFACE.md': '# 000-forms — l’interface\n\nF.\n',
      'packages/b/docs/INTERFACE.md': '# L’interface de b\n\nB.\n',
    });
    const texte = index(dir);
    expect(texte).toContain('## 000-forms — l’interface\n');
    expect(texte).not.toContain('000-forms — 000-forms');
    expect(texte).toContain('## b — L’interface de b\n');
  });

  it('critère 5 : the index of this repository regenerates unchanged and passes the check', () => {
    const racine = path.resolve(__dirname, '../..');
    expect(index(racine)).toBe(
      readFileSync(path.join(racine, 'docs/agents/index-des-interfaces.md'), 'utf8')
    );
    expect(spawnSync('node', [SCRIPT, '--verifier'], { cwd: racine }).status).toBe(0);
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

describe('entrees and consumers', () => {
  it('gives one line naming each consumer and what it uses', () => {
    const text =
      '# d\n\nD.\n\n## Consommateurs\n\n- `a` : duree, tempo\n- `c` : *\n- `e` : f\n- `g` : h\n- `i` : j\n- `k` : l\n- `m` : n\n';
    expect(entrees('packages/d/docs/INTERFACE.md', text)).toContain(
      '- **Consommateurs** — a (duree, tempo) ; c (*) ; e (f) ; g (h) ; i (j) ; k (l) ; m (n)'
    );
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
