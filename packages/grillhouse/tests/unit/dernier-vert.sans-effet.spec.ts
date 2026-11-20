// A pass measured against a last green or a base of a lot classes without effect (`sansEffet`, a
// field of the file of the changes beside `fichiers`) a file of code present in both trees whose
// isolated transpilation (fixed options, comments removed) is identical, and a document; a file
// added or removed, or whose transpilation fails, is never one. The complete pass sends none.
// A change of the executable output (a value, a string, a value import, the body of a `const
// enum`, a decorator) stays a change.
//
// Each case plays the real git in a repository of trial.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { garderLeVert, mesure } from '../../scripts/dernier-vert.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dernier-vert-sans-effet-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};

// The files of the first commit of the repository of trial.
const DEPART: Record<string, string> = {
  'src/valeur.ts': 'export const deux = 2;\n',
  'src/commente.ts': '// avant\nexport const un = 1;\n',
  'src/types.ts': 'export interface A { x: number }\nexport type T = string;\n',
  'src/importe.ts': "import type { A } from './types';\nexport const v: A = { x: 1 };\n",
  'src/enum.ts': 'export const enum E { A = 1 }\nexport const e = E.A;\n',
  'src/decore.ts': 'declare const dec: any;\n@dec\nexport class C {}\n',
  'src/chaine.ts': "export const s = 'avant';\n",
  'src/vue.tsx': 'export const V = () => <div>{1}</div>;\n',
  'src/a.js': 'export const a = 1;\n',
  'src/b.mjs': 'export const b = 1;\n',
  'src/c.cjs': 'module.exports = 1;\n',
  'src/d.jsx': 'export const D = () => <p />;\n',
  'src/e.mts': 'export const e = 1;\n',
  'src/f.cts': 'export const f = 1;\n',
  'docs/guide.md': '# Guide\n',
  'docs/page.mdx': '# Page\n',
  'src/donnees.json': '{ "a": 1 }\n',
  'src/retire.ts': '// seul commentaire\n',
};

// The repository of trial with its first commit; <changements> rewrite files in the working tree.
function depot() {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(r, 'init', '-q', '-b', 'main');
  git(r, 'config', 'user.email', 'essai@example.com');
  git(r, 'config', 'user.name', 'essai');
  for (const [f, t] of Object.entries(DEPART)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  git(r, 'add', '-A');
  git(r, 'commit', '-q', '-m', 'premier');
  const premier = git(r, 'rev-parse', 'HEAD');
  return {
    r,
    premier,
    ecrire: (f: string, t: string) => {
      mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
      writeFileSync(path.join(r, f), t);
    },
  };
}

type Mesure = { ligne: string; env: Record<string, string>; etat: unknown; retirer: () => void };
type Changements = {
  fichiers: string[];
  supprimes: string[];
  sansEffet?: string[];
  cible?: boolean;
};

function mesurer(dossier: string, options: Record<string, unknown>) {
  const m = mesure(dossier, options) as Mesure;
  const f = m.env.GRILLHOUSE_CHANGEMENTS;
  const ch = f ? (JSON.parse(readFileSync(f, 'utf8')) as Changements) : null;
  m.retirer();
  return {
    ligne: m.ligne,
    changements: ch,
    fichiers: ch?.fichiers.sort() ?? null,
    sansEffet: ch ? (ch.sansEffet ?? []).sort() : null,
  };
}

describe('a file changed without effect on the output', () => {
  it('a comment changed is without effect, and no change of the package', () => {
    const { r, premier, ecrire } = depot();
    ecrire('src/commente.ts', '// après, bien plus long\nexport const un = 1; // et en fin\n');
    const m = mesurer(r, { base: premier });
    expect(m.sansEffet).toEqual(['src/commente.ts']);
    expect(m.fichiers).toEqual([]);
  });

  it('a type, an interface and an import type changed are without effect', () => {
    const { r, premier, ecrire } = depot();
    ecrire(
      'src/types.ts',
      'export interface A { x: number; y: string }\nexport type T = number;\n'
    );
    ecrire(
      'src/importe.ts',
      "import type { A, T } from './types';\nexport const v: A = { x: 1 };\n"
    );
    const m = mesurer(r, { base: premier });
    expect(m.sansEffet).toEqual(['src/importe.ts', 'src/types.ts']);
    expect(m.fichiers).toEqual([]);
  });

  it('a comment in each extension of code is without effect', () => {
    const { r, premier, ecrire } = depot();
    const fichiers = [
      'src/a.js',
      'src/b.mjs',
      'src/c.cjs',
      'src/d.jsx',
      'src/e.mts',
      'src/f.cts',
      'src/vue.tsx',
    ];
    for (const f of fichiers) {
      ecrire(f, `// commentaire\n${DEPART[f]}`);
    }
    const m = mesurer(r, { base: premier });
    expect(m.sansEffet).toEqual([...fichiers].sort());
    expect(m.fichiers).toEqual([]);
  });

  it('a document is without effect', () => {
    const { r, premier, ecrire } = depot();
    ecrire('docs/guide.md', '# Guide, réécrit\n');
    ecrire('docs/page.mdx', '# Page, réécrite\n');
    const m = mesurer(r, { base: premier });
    expect(m.sansEffet).toEqual(['docs/guide.md', 'docs/page.mdx']);
    expect(m.fichiers).toEqual([]);
  });

  it('is classed the same against the last green as against a base', () => {
    const { r, ecrire } = depot();
    const vert = mesure(r) as Mesure;
    vert.retirer();
    garderLeVert(vert.etat);
    ecrire('src/commente.ts', '// autre\nexport const un = 1;\n');
    ecrire('src/valeur.ts', 'export const deux = 3;\n');
    const m = mesurer(r, {});
    expect(m.sansEffet).toEqual(['src/commente.ts']);
    expect(m.fichiers).toEqual(['src/valeur.ts']);
  });

  it('is classed in a targeted measure against the base of a lot, the mark kept', () => {
    const { r, premier, ecrire } = depot();
    ecrire('src/commente.ts', '// autre\nexport const un = 1;\n');
    const m = mesurer(r, { lot: premier });
    expect(m.sansEffet).toEqual(['src/commente.ts']);
    expect(m.changements).toMatchObject({ cible: true });
  });
});

describe('a file changed in its output stays a change', () => {
  it('an exported value, a string, a value import and a decorator stay changes', () => {
    const { r, premier, ecrire } = depot();
    ecrire('src/valeur.ts', 'export const deux = 3;\n');
    ecrire('src/chaine.ts', "export const s = 'après';\n");
    ecrire('src/importe.ts', "import { A } from './types';\nexport const v: A = { x: 1 };\n");
    ecrire('src/decore.ts', 'declare const dec: any;\n@dec()\nexport class C {}\n');
    const m = mesurer(r, { base: premier });
    expect(m.fichiers).toEqual([
      'src/chaine.ts',
      'src/decore.ts',
      'src/importe.ts',
      'src/valeur.ts',
    ]);
    expect(m.sansEffet).toEqual([]);
  });

  it('the body of a const enum changed stays a change', () => {
    const { r, premier, ecrire } = depot();
    ecrire('src/enum.ts', 'export const enum E { A = 2 }\nexport const e = E.A;\n');
    const m = mesurer(r, { base: premier });
    expect(m.fichiers).toEqual(['src/enum.ts']);
    expect(m.sansEffet).toEqual([]);
  });

  it('a value changed beside a comment changed in the same file stays a change', () => {
    const { r, premier, ecrire } = depot();
    ecrire('src/commente.ts', '// après\nexport const un = 2;\n');
    const m = mesurer(r, { base: premier });
    expect(m.fichiers).toEqual(['src/commente.ts']);
    expect(m.sansEffet).toEqual([]);
  });

  it('a file of data changed stays a change', () => {
    const { r, premier, ecrire } = depot();
    ecrire('src/donnees.json', '{ "a": 2 }\n');
    const m = mesurer(r, { base: premier });
    expect(m.fichiers).toEqual(['src/donnees.json']);
    expect(m.sansEffet).toEqual([]);
  });
});

describe('a file never without effect when in doubt', () => {
  it('a file added stays a change, even a comment alone', () => {
    const { r, premier, ecrire } = depot();
    ecrire('src/neuf.ts', '// rien\n');
    ecrire('docs/neuf.md', '# Neuf\n');
    const m = mesurer(r, { base: premier });
    expect(m.fichiers).toEqual(['docs/neuf.md', 'src/neuf.ts']);
    expect(m.sansEffet).toEqual([]);
  });

  it('a file removed stays a removal, even a comment alone', () => {
    const { r, premier } = depot();
    rmSync(path.join(r, 'src/retire.ts'));
    rmSync(path.join(r, 'docs/guide.md'));
    const m = mesurer(r, { base: premier });
    expect(m.changements?.supprimes.sort()).toEqual(['docs/guide.md', 'src/retire.ts']);
    expect(m.sansEffet).toEqual([]);
  });

  it('a file whose transpilation fails stays a change', () => {
    const { r, premier, ecrire } = depot();
    ecrire('src/commente.ts', '// après\nexport const un = = 1;\n');
    const m = mesurer(r, { base: premier });
    expect(m.fichiers).toEqual(['src/commente.ts']);
    expect(m.sansEffet).toEqual([]);
  });
});

describe('the complete pass', () => {
  it('sends no file without effect and no changes at all: it plays everything', () => {
    const { r, premier, ecrire } = depot();
    ecrire('src/commente.ts', '// autre\nexport const un = 1;\n');
    const m = mesurer(r, { base: premier, tout: true });
    expect(m.changements).toBeNull();
    expect(m.ligne).toMatch(/passe complète : demandée/);
  });

  it('a pass with no last green sends no file without effect', () => {
    const { r, ecrire } = depot();
    ecrire('src/commente.ts', '// autre\nexport const un = 1;\n');
    const m = mesurer(r, {});
    expect(m.changements).toBeNull();
    expect(m.ligne).toMatch(/^↳ passe complète : /);
  });
});
