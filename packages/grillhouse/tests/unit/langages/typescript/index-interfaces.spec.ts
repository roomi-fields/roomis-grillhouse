import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  entrees,
  index,
  interfaces,
  publie,
} from '../../../../scripts/langages/typescript/index-interfaces.mjs';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'index-interfaces-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.resolve(
  __dirname,
  '../../../../scripts/langages/typescript/index-interfaces.mjs'
);

const DEBUT = '<!-- généré: début -->';
const FIN = '<!-- généré: fin -->';

// An interface whose elements live in its generated part, between the two marks, in the format
// npm run api writes: one `### \`nom\`` entry per export, its summary, its signature in a code
// block, then its parameters, return, faults and members (grillhouse-3uv.64, critère 26).
const INTERFACE_B = [
  '# b — l’interface',
  '',
  'Le composant b rend les durées. Il ne lit rien du disque.',
  '',
  DEBUT,
  '',
  '### `duree`',
  '',
  'Rend la durée d’un objet en battements. Refuse un objet sans tempo.',
  '',
  '```ts',
  'export declare function duree(objet: Objet): number;',
  '```',
  '',
  '**Paramètres**',
  '',
  '- `objet` — L’objet lu.',
  '',
  '**Retour** — La durée.',
  '',
  '**Fautes**',
  '',
  '- `B_SANS_TEMPO`',
  '',
  '### `Objet`',
  '',
  'Un objet lu. Il porte son tempo.',
  '',
  '```ts',
  'export interface Objet',
  '```',
  '',
  '**Membres**',
  '',
  '- `tempo: number` — Le tempo de l’objet.',
  '',
  '### `garde`',
  '',
  '```ts',
  'export declare function garde(): void;',
  '```',
  '',
  FIN,
].join('\n');

function repo(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(ESSAIS, 'index-'));
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
    expect(lines).toContain('- **`duree`** — Rend la durée d’un objet en battements.');
    expect(lines).toContain('- **`Objet`** — Un objet lu.');
  });
  it('critère 26 : gives each entry of the generated part a line of the first rank, not indented', () => {
    const elements = lines.filter(l => /^\s*- \*\*/.test(l));
    expect(elements.map(l => /^- \*\*(`\w+`)\*\*/.exec(l)?.[1])).toEqual([
      '`duree`',
      '`Objet`',
      '`garde`',
    ]);
    expect(lines.filter(l => /^\s+-/.test(l))).toEqual([]);
  });
  it('keeps an entry without summary, its body being only its signature', () => {
    expect(lines).toContain('- **`garde`**');
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
    const racine = path.resolve(__dirname, '../../../../../..');
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
      DEBUT,
      '',
      '### `vrai`',
      '',
      'Oui.',
      '',
      '```ts',
      '### pas un titre',
      '```',
      '',
      '  ~~~',
      '### non plus',
      '  ~~~',
      '',
      FIN,
    ].join('\n');
    const lines = entrees('packages/c/docs/INTERFACE.md', text);
    expect(lines.filter(l => l.startsWith('-') || l.startsWith('  -'))).toEqual([
      '- **`vrai`** — Oui.',
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
      INTERFACE_B.replace(FIN, '### `nouveau`\n\nX.\n\n' + FIN)
    );
    expect(run('--verifier').status).toBe(1);
  });
  it('writes what index() returns', () => {
    run();
    expect(index(dir)).toContain('- **`nouveau`** — X.');
  });
});

// Critère 6 : the index of the interfaces is built from the generated part; critère 16 : the root
// interface needs no marks, and the index takes from it the component line and its consumers, and
// no element line outside a generated part (grillhouse-3uv.64).
describe('entrees and the generated part (grillhouse-3uv.64)', () => {
  const elements = (lines: string[]) =>
    lines.filter(
      l => (l.startsWith('-') || l.startsWith('  -')) && !l.includes('**Consommateurs**')
    );

  it('critère 6 : the hand-written headings around the generated part give no element line', () => {
    const text = [
      '# e',
      '',
      'E rend des durées.',
      '',
      '## Vue d’ensemble',
      '',
      'Tout passe par duree.',
      '',
      '### Le détail',
      '',
      'Rien de plus.',
      '',
      DEBUT,
      '',
      '### `duree`',
      '',
      'Rend la durée.',
      '',
      '```ts',
      'export declare function duree(x: number): number;',
      '```',
      '',
      FIN,
      '',
      '## Les fautes',
      '',
      '- `E_VIDE` : un objet vide.',
    ].join('\n');
    expect(elements(entrees('packages/e/docs/INTERFACE.md', text))).toEqual([
      '- **`duree`** — Rend la durée.',
    ]);
  });
  it('critère 6 : the consumers of the hand-written part keep their line', () => {
    const text = `# e\n\nE.\n\n${DEBUT}\n\n### \`duree\`\n\nRend.\n\n${FIN}\n\n## Consommateurs\n\n- \`a\` : duree\n`;
    expect(entrees('packages/e/docs/INTERFACE.md', text)).toContain(
      '- **Consommateurs** — a (duree)'
    );
  });
  it('critère 6 : an interface without a generated part gives its component line and no element', () => {
    const lines = entrees(
      'packages/e/docs/INTERFACE.md',
      '# e\n\nE rend x.\n\n## `duree`\n\nRend.\n'
    );
    expect(lines[0]).toBe('## e');
    expect(elements(lines)).toEqual([]);
  });
  it('critère 16 : the root interface without marks gives its line and its consumers, no element', () => {
    const text = [
      '# Le projet',
      '',
      'Le projet rend des durées. Il a deux composants.',
      '',
      '## Les composants',
      '',
      'Deux.',
      '',
      '### Le premier',
      '',
      'Un.',
      '',
      '## Consommateurs',
      '',
      '- `a` : duree, tempo',
    ].join('\n');
    const lines = entrees('docs/INTERFACE.md', text);
    expect(lines[0]).toBe('## (racine) — Le projet');
    expect(lines[2]).toBe('Le projet rend des durées. (`docs/INTERFACE.md`)');
    expect(lines).toContain('- **Consommateurs** — a (duree, tempo)');
    expect(elements(lines)).toEqual([]);
  });
  it('critère 16 : the root interface with marks gives the lines of its generated part only', () => {
    const text = [
      '# Le projet',
      '',
      'Le projet rend des durées.',
      '',
      '## Les composants',
      '',
      'Deux.',
      '',
      DEBUT,
      '',
      '### `tempo`',
      '',
      'Rend le tempo du projet.',
      '',
      '```ts',
      'export declare function tempo(): number;',
      '```',
      '',
      FIN,
      '',
      '## Consommateurs',
      '',
      '- `a` : tempo',
    ].join('\n');
    const lines = entrees('docs/INTERFACE.md', text);
    expect(lines[0]).toBe('## (racine) — Le projet');
    expect(lines).toContain('- **Consommateurs** — a (tempo)');
    expect(elements(lines)).toEqual(['- **`tempo`** — Rend le tempo du projet.']);
  });
});

// What the components before publish: the launcher writes, in the instruction of the role agent,
// for each provider of its component, the provider's line, the names of the elements declared for
// it, and the address of the rubric « Rend » of its `docs/CADRE.md`. The providers are the
// components whose `## Consommateurs` section names it.
describe('publie: what the providers of a component publish', () => {
  const dir = repo({
    'packages/b/docs/INTERFACE.md': `${INTERFACE_B}\n\n## Consommateurs\n\n- \`a\` : duree\n`,
    // The rubric under its numbered title, as the redacteur's frame writes it; a heading inside a
    // code block belongs to the rubric.
    'packages/b/docs/CADRE.md': [
      '# b — rendre les durées',
      '',
      '## 2. Reçoit',
      '',
      '- **R2.** Les objets lus.',
      '',
      '## 3. Rend',
      '',
      '- **R3.** La durée de chaque objet, en battements, que `a` reçoit.',
      '',
      '```md',
      '## pas une rubrique',
      '```',
      '',
      '### Les fautes rendues',
      '',
      '- **R4.** `B_SANS_TEMPO`.',
      '',
      '## 4. Connaît',
      '',
      '- **R5.** Le tempo.',
      '',
    ].join('\n'),
    'packages/c/docs/INTERFACE.md': '# c\n\nC rend des tempos.\n\n## Consommateurs\n\n- `a` : *\n',
    'packages/f/docs/INTERFACE.md':
      '# f\n\nF rend des notes.\n\n## Consommateurs\n\n- `a` : note\n',
    'packages/f/docs/CADRE.md':
      '# f — rendre des notes\n\n## 1. Rôle\n\n- **R1.** F rend des notes.\n',
    'packages/d/docs/INTERFACE.md': '# d\n\nD ne rend rien.\n\n## Consommateurs\n\n- `e` : x\n',
    'packages/a/src/a.ts': 'a',
    'src/seul/index.ts': 's',
  });

  it('gives each provider its line, the names declared for the component, and the address of its rubric « Rend »', () => {
    expect(publie(dir, 'packages/a')).toBe(
      [
        "## Ce que les composants d'avant publient",
        '',
        '`a` dépend de ces composants, et n’utilise d’eux que les éléments déclarés pour lui. Tous les éléments d’un composant, chacun avec sa phrase, sont dans `docs/agents/index-des-interfaces.md` ; un élément se lit en entier dans l’interface de son composant, à `<interface> § <son nom>`.',
        '',
        '### b — l’interface',
        '',
        'Le composant b rend les durées. (`packages/b/docs/INTERFACE.md`)',
        'Déclaré pour `a` : duree.',
        'Son cadre rend : `packages/b/docs/CADRE.md` § 3. Rend.',
        '',
        '### c',
        '',
        'C rend des tempos. (`packages/c/docs/INTERFACE.md`)',
        'Déclaré pour `a` : `*`, un import de tout le composant, sans élément nommé : ses éléments sont dans `docs/agents/index-des-interfaces.md`.',
        'Son interface n’a pas de part générée : elle dit elle-même ce qu’elle publie.',
        'Son cadre manque : `packages/c/docs/CADRE.md` n’existe pas.',
        '',
        '### f',
        '',
        'F rend des notes. (`packages/f/docs/INTERFACE.md`)',
        'Déclaré pour `a` : note.',
        'Son interface n’a pas de part générée : elle dit elle-même ce qu’elle publie.',
        'Son cadre n’a pas de rubrique « Rend » (`packages/f/docs/CADRE.md`).',
      ].join('\n')
    );
  });
  it('says in one line that a component no interface names as consumer depends on none', () => {
    expect(publie(dir, 'packages/b')).toBe(
      [
        "## Ce que les composants d'avant publient",
        '',
        '`b` ne dépend d’aucun composant : aucune section « Consommateurs » ne le nomme.',
      ].join('\n')
    );
    expect(publie(dir, 'src/seul')).toContain('`seul` ne dépend d’aucun composant');
  });
  // grillhouse-3uv.95.6: a plan of several packages, one part per package, its providers under it.
  it('gives a plan of several packages one part per package, the providers of each under it', () => {
    const l = publie(dir, 'packages/a:packages/b').split('\n');
    expect(l[0]).toBe("## Ce que les composants d'avant publient");
    expect(l.filter(x => x.startsWith('## '))).toHaveLength(1);
    const a = l.indexOf('### Pour `a`');
    const b = l.indexOf('### Pour `b`');
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(l.slice(a, b)).toContain('#### b — l’interface');
    expect(l.slice(a, b)).toContain('Déclaré pour `a` : duree.');
    expect(l.slice(b)).toContain(
      '`b` ne dépend d’aucun composant : aucune section « Consommateurs » ne le nomme.'
    );
    // One package alone keeps its section as it was.
    expect(publie(dir, 'packages/a')).not.toContain('### Pour');
  });
  it('points a copy of the whole repository to the index of the interfaces', () => {
    expect(publie(dir, '.')).toBe(
      [
        "## Ce que les composants d'avant publient",
        '',
        'Ta copie montre tout le dépôt : `docs/agents/index-des-interfaces.md` porte ce que publie chaque composant.',
      ].join('\n')
    );
  });
  it('prints the section by the command run from the repository root, and writes nothing', () => {
    const r = spawnSync('node', [SCRIPT, '--publie', 'packages/a'], { cwd: dir, encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe(`${publie(dir, 'packages/a')}\n`);
    expect(existsSync(path.join(dir, 'docs/agents/index-des-interfaces.md'))).toBe(false);
  });
  // Witness: BPScript, a section of 149 340 bytes read through a pipe stopped at 65 536, the
  // size of a pipe's buffer: the rest of the write was still queued when the script exited.
  it('prints a section larger than a pipe holds whole, through a pipe', () => {
    const noms = Array.from({ length: 6000 }, (_, k) => `element_du_gros_composant_${k}`);
    const elements = noms.map(n => `### \`${n}\`\n\nRend un élément du gros composant.\n`);
    const gros = repo({
      'packages/g/docs/INTERFACE.md': `# g\n\nG rend beaucoup.\n\n${DEBUT}\n\n${elements.join('\n')}\n${FIN}\n\n## Consommateurs\n\n- \`h\` : ${noms.join(', ')}\n`,
      'packages/h/src/h.ts': 'h',
    });
    const attendu = `${publie(gros, 'packages/h')}\n`;
    expect(Buffer.byteLength(attendu)).toBeGreaterThan(128 * 1024);
    const r = spawnSync('node', [SCRIPT, '--publie', 'packages/h'], {
      cwd: gros,
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 16 * 1024 * 1024,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(Buffer.byteLength(r.stdout)).toBe(Buffer.byteLength(attendu));
    expect(r.stdout).toBe(attendu);
  });
  it('refuses the command without its component', () => {
    const r = spawnSync('node', [SCRIPT, '--publie'], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage/);
  });
});

// Witness: BPScript, a section of 127 KB per session, 149 KB at most: an element without summary
// took its members as its role (« `Acknowledgement` — **Membres** `readonly accepted: boolean` … »).
// The section is an index, as the index of a Rust documentation: one line per element, its name,
// its role in one sentence of its summary, its address; its members, its parameters, its return
// and its faults are read at the address.
describe('publie and entrees: an element gives its summary, never its members', () => {
  const INTERFACE_M = [
    '# m',
    '',
    'M rend des notes.',
    '',
    DEBUT,
    '',
    '### `Accuse`',
    '',
    '```ts',
    'export interface Accuse',
    '```',
    '',
    '**Membres**',
    '',
    '- `readonly accepte: boolean`',
    '- `readonly faute?: Faute` — La faute du refus.',
    '',
    '### `lier`',
    '',
    'Lie deux notes',
    '',
    '```ts',
    'export declare function lier(a: Note, b: Note): Note;',
    '```',
    '',
    '**Paramètres**',
    '',
    '- `a` — La première note.',
    '',
    '**Retour** — La note liée.',
    '',
    '### `Note`',
    '',
    'Une note jouée, sur deux lignes',
    'de son résumé. Elle porte sa hauteur.',
    '',
    '```ts',
    'export interface Note',
    '```',
    '',
    '**Membres**',
    '',
    '- `hauteur: number` — La hauteur de la note.',
    '',
    FIN,
    '',
    '## Consommateurs',
    '',
    '- `n` : lier',
    '',
  ].join('\n');
  const dir = repo({ 'packages/m/docs/INTERFACE.md': INTERFACE_M, 'packages/n/src/n.ts': 'n' });

  it('gives the section the names declared for the component, no member', () => {
    const section = publie(dir, 'packages/n');
    expect(section).toContain('Déclaré pour `n` : lier.');
    expect(section).not.toMatch(/Membres|Paramètres|Retour|accepte|hauteur|première/);
  });
  it('gives the index of the interfaces the same lines', () => {
    const lignes = entrees('packages/m/docs/INTERFACE.md', INTERFACE_M);
    expect(lignes.filter(l => l.startsWith('- **`'))).toEqual([
      '- **`Accuse`**',
      '- **`lier`** — Lie deux notes',
      '- **`Note`** — Une note jouée, sur deux lignes de son résumé.',
    ]);
  });
});

// Witness: BPScript, 2026-10-20: the section weighed 36 to 46 KB as soon as a component had
// providers (64 % of the instructions of vbwf.320.2.4.5.1, 89 % of those of si61.8); for
// 030-binder it listed 692 elements of 000-forms, 94 of them declared for it. A component uses only
// the elements its provider declares for it (scripts/langages/typescript/consommateurs.mjs refuses the rest). The
// section is the first level of a progressive disclosure, as the skills of Claude Code, llms.txt
// or Aider's repository map: the provider's line and the names declared for the component; the
// index of the interfaces holds every element with its sentence (level 2), the interface the
// section of each (level 3).
describe('publie: the names declared for the component, the rest at its address', () => {
  const NOMS = [
    'accord',
    'basse',
    'cadence',
    'dominante',
    'echelle',
    'fugue',
    'gamme',
    'harmonie',
    'intervalle',
    'justesse',
  ];
  const DECLARES = ['cadence', 'gamme', 'justesse'];
  const INTERFACE_P = [
    '# p',
    '',
    'P rend la théorie musicale. Il ne lit rien du disque.',
    '',
    DEBUT,
    '',
    ...NOMS.flatMap(n => [
      `### \`${n}\``,
      '',
      `Rend la valeur ${n.toUpperCase()} d’un morceau.`,
      '',
    ]),
    FIN,
    '',
    '## Consommateurs',
    '',
    `- \`q\` : ${DECLARES.join(', ')}`,
    '- `r` : *, basse',
    '',
  ].join('\n');
  const dir = repo({
    'packages/p/docs/INTERFACE.md': INTERFACE_P,
    'packages/q/src/q.ts': 'q',
    'packages/r/src/r.ts': 'r',
  });

  it('gives the provider its line from the index, then the 3 names declared for the component', () => {
    const lignes = publie(dir, 'packages/q').split('\n');
    expect(lignes).toContain('### p');
    expect(lignes).toContain('P rend la théorie musicale. (`packages/p/docs/INTERFACE.md`)');
    expect(lignes).toContain('Déclaré pour `q` : cadence, gamme, justesse.');
  });
  it('names none of the 7 elements not declared for it, nor any element sentence', () => {
    const section = publie(dir, 'packages/q');
    for (const n of NOMS.filter(n => !DECLARES.includes(n))) {
      expect(section).not.toMatch(new RegExp(`\\b${n}\\b`));
    }
    expect(section).not.toMatch(/Rend la valeur/);
  });
  it('points to every element at level 2, the index, and to its section at level 3, the interface', () => {
    const section = publie(dir, 'packages/q');
    expect(section).toContain(
      'Tous les éléments d’un composant, chacun avec sa phrase, sont dans `docs/agents/index-des-interfaces.md`'
    );
    expect(section).toContain(
      'un élément se lit en entier dans l’interface de son composant, à `<interface> § <son nom>`'
    );
  });
  it('gives a declaration of `*` beside names its names, and says the rest is in the index', () => {
    expect(publie(dir, 'packages/r').split('\n')).toContain(
      'Déclaré pour `r` : basse, et `*`, un import de tout le composant : ses éléments sont dans `docs/agents/index-des-interfaces.md`.'
    );
  });
  it('keeps every element with its sentence in the index of the interfaces', () => {
    const lignes = index(dir).split('\n');
    for (const n of NOMS) {
      expect(lignes).toContain(`- **\`${n}\`** — Rend la valeur ${n.toUpperCase()} d’un morceau.`);
    }
  });
});
