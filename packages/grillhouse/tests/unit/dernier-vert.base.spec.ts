// A pass measured against a base given (`verifier --base <commit>`, scripts/dernier-vert.mjs): the
// CI of a lot measures against the parent of main, as `turbo --affected` and `TURBO_SCM_BASE` take
// a base. The base changes the tree of comparison and nothing else: the changes go to Vitest as
// those of the last green, and the pass never keeps a green of its own.
//
// Each case plays the real git in a repository of trial: a first commit (a.txt, b.txt, c.txt), a
// second that changes a.txt.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { garderLeVert, mesure } from '../../scripts/dernier-vert.mjs';
import { restreindre } from '../../scripts/langages/typescript/vitest-config/changements.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dernier-vert-base-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};

// The repository of trial and the two commits of its main.
function depot() {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(r, 'init', '-q', '-b', 'main');
  git(r, 'config', 'user.email', 'essai@example.com');
  git(r, 'config', 'user.name', 'essai');
  for (const f of ['a.txt', 'b.txt', 'c.txt']) {
    writeFileSync(path.join(r, f), `${f}\n`);
  }
  git(r, 'add', '-A');
  git(r, 'commit', '-q', '-m', 'premier');
  const premier = git(r, 'rev-parse', 'HEAD');
  writeFileSync(path.join(r, 'a.txt'), 'a.txt changé\n');
  git(r, 'commit', '-q', '-am', 'second');
  return { r, premier, second: git(r, 'rev-parse', 'HEAD') };
}

type Mesure = {
  ligne: string;
  env: Record<string, string>;
  etat: unknown;
  retirer: () => void;
};
type Changements = { racine: string; fichiers: string[]; supprimes: string[] };

// What a pass in <dossier> measures with the options <options>: the line, the changes (null for a
// complete pass) and the state it would keep as a green.
function mesurer(dossier: string, options: Record<string, unknown>) {
  const m = mesure(dossier, options) as Mesure;
  const f = m.env.GRILLHOUSE_CHANGEMENTS;
  const ch = f ? (JSON.parse(readFileSync(f, 'utf8')) as Changements) : null;
  m.retirer();
  return {
    ligne: m.ligne,
    etat: m.etat,
    changements: ch,
    fichiers: ch ? [...ch.fichiers, ...ch.supprimes].sort() : null,
  };
}

describe('a pass measured against a base given', () => {
  it('measures the files that differ between the tree of the base and the working tree', () => {
    const { r, premier } = depot();
    writeFileSync(path.join(r, 'b.txt'), 'b.txt changé\n');
    const m = mesurer(r, { base: premier });
    expect(m.fichiers).toEqual(['a.txt', 'b.txt']);
  });

  it('measures a file removed since the base as a removal', () => {
    const { r, premier } = depot();
    rmSync(path.join(r, 'c.txt'));
    const m = mesurer(r, { base: premier });
    expect(m.changements?.supprimes).toEqual(['c.txt']);
  });

  it('writes the changes in the shape of the last green, for Vitest', () => {
    const { r, premier } = depot();
    const m = mesurer(r, { base: premier });
    expect(Object.keys(m.changements ?? {}).sort()).toEqual(['fichiers', 'racine', 'supprimes']);
  });

  it('names the base by its abbreviated commit and the number of files changed on the line', () => {
    const { r, premier } = depot();
    writeFileSync(path.join(r, 'b.txt'), 'b.txt changé\n');
    const { ligne } = mesurer(r, { base: premier });
    expect(ligne.startsWith('↳')).toBe(true);
    expect(ligne).toContain(premier.slice(0, 7));
    expect(ligne).toMatch(/\b2 fichier\(s\)/);
    expect(ligne).not.toMatch(/dernier vert/);
  });

  it('counts no file changed when the working tree is the tree of the base', () => {
    const { r, second } = depot();
    const m = mesurer(r, { base: second });
    expect(m.fichiers).toEqual([]);
    expect(m.ligne).toMatch(/\b0 fichier\(s\)/);
  });

  it('takes precedence over the last green kept: the pass does not read it', () => {
    const { r, premier } = depot();
    const vert = mesure(r) as Mesure;
    vert.retirer();
    garderLeVert(vert.etat);
    const m = mesurer(r, { base: premier });
    expect(m.fichiers).toEqual(['a.txt']);
    expect(m.ligne).not.toMatch(/dernier vert/);
  });

  it('keeps no green: the state to keep is none', () => {
    const { r, premier } = depot();
    const m = mesurer(r, { base: premier });
    expect(m.etat ?? null).toBeNull();
  });

  it('leaves no last green behind when it follows a pass without a green', () => {
    const { r, premier } = depot();
    mesurer(r, { base: premier });
    const verts = path.join(r, '.git', 'grillhouse', 'dernier-vert');
    expect(existsSync(verts)).toBe(false);
  });

  it('leaves to Vitest the whole package when a change lies outside its graph', () => {
    const { r, premier } = depot();
    const m = mesurer(r, { base: premier });
    const lignes: string[] = [];
    restreindre({}, m.changements?.racine, m.changements, [], (l: string) => lignes.push(l));
    expect(lignes.join('\n')).toMatch(/tous ses tests/);
  });
});

describe('a base that gives the complete pass', () => {
  it('a base that is not an ancestor of HEAD plays the complete pass and says why', () => {
    const { r } = depot();
    git(r, 'checkout', '-q', '-b', 'autre', 'HEAD~1');
    writeFileSync(path.join(r, 'b.txt'), 'autre\n');
    git(r, 'commit', '-q', '-am', 'autre');
    const autre = git(r, 'rev-parse', 'HEAD');
    git(r, 'checkout', '-q', 'main');
    const m = mesurer(r, { base: autre });
    expect(m.fichiers).toBeNull();
    expect(m.ligne).toMatch(/^↳ passe complète : .*ancêtre/);
  });

  it('a base the repository does not hold plays the complete pass and says why', () => {
    const { r } = depot();
    const m = mesurer(r, { base: 'a'.repeat(40) });
    expect(m.fichiers).toBeNull();
    expect(m.ligne).toMatch(/^↳ passe complète : /);
    expect(m.ligne).toMatch(/base/);
  });

  it('the zeros of a first push play the complete pass and say why', () => {
    const { r } = depot();
    const m = mesurer(r, { base: '0'.repeat(40) });
    expect(m.fichiers).toBeNull();
    expect(m.ligne).toMatch(/^↳ passe complète : /);
    expect(m.ligne).toMatch(/base/);
  });

  it('a base that is badly formed plays the complete pass and says why', () => {
    const { r } = depot();
    const m = mesurer(r, { base: 'pas un commit; rm -rf' });
    expect(m.fichiers).toBeNull();
    expect(m.ligne).toMatch(/^↳ passe complète : /);
    expect(m.ligne).toMatch(/base/);
  });

  it('a base without a value plays the complete pass and says why', () => {
    const { r } = depot();
    const m = mesurer(r, { base: '' });
    expect(m.fichiers).toBeNull();
    expect(m.ligne).toMatch(/^↳ passe complète : /);
    expect(m.ligne).toMatch(/base/);
  });

  it('--tout ignores the base: the complete pass, asked', () => {
    const { r, premier } = depot();
    const m = mesurer(r, { base: premier, tout: true });
    expect(m.fichiers).toBeNull();
    expect(m.ligne).toMatch(/passe complète : demandée/);
  });
});

// The circuit measures its passes against the base of its lot, targeted: the changes carry the
// mark `cible`, by which each package plays the tests related to them, never whole for a file a
// test reads by its path (./langages/typescript/changements.spec.ts).
describe('a measure targeted against the base of a lot', () => {
  it('marks its changes as targeted', () => {
    const { r, premier } = depot();
    const m = mesurer(r, { lot: premier });
    expect(m.fichiers).toEqual(['a.txt']);
    expect(m.changements).toMatchObject({ cible: true });
  });

  it('names the base of the lot on its line', () => {
    const { r, premier } = depot();
    const { ligne } = mesurer(r, { lot: premier });
    expect(ligne).toMatch(/^↳ depuis la base du lot /);
    expect(ligne).toContain(premier.slice(0, 7));
  });

  it('keeps no green', () => {
    const { r, premier } = depot();
    const m = mesurer(r, { lot: premier });
    expect(m.etat ?? null).toBeNull();
  });
});
