// grillhouse-3uv.67: an unchanged build is not done again. The frame's one entry point that builds
// (scripts/integration/constructions.mjs) keeps the dist/ of each component that has a build under
// the fingerprint of the content of its inputs, and restores it instead of building again while
// that fingerprint stays the same (the task cache of Turborepo, the tree per fingerprint of Nx).
// The interface these tests fix is written at the head of ./constructions-essai.ts. A build « not
// done again » is read from the trial's builds, each of which appends its name to a file outside
// the repository, never from a message.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { ouvrirTraces } from '../../scripts/integration/traces.mjs';
import {
  arbre,
  arbreExact,
  CONSTRUITS,
  depot,
  fichiersLiens,
  fichiersPaquets,
  fichiersUnique,
  horsGit,
  POINT_D_ENTREE,
  rendreLisible,
  type Depot,
} from './constructions-essai.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'constructions-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 60_000;
const HEX = /^[0-9a-f]{64}$/;

const vert = (r: { status: number | null; stdout: string; stderr: string }) =>
  expect(r.status, r.stdout + r.stderr).toBe(0);

// The bound of a loop trial: a script of its own, preloaded in every node the passage starts, that
// counts in <repo>.passages each run of the entry point and ends red at once from the third, so a
// loop stops by itself and leaves no process behind. Returns the environment that preloads it.
function borne(repo: string): Record<string, string> {
  const script = `${repo}.borne.mjs`;
  writeFileSync(
    script,
    `import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
if (path.basename(process.argv[1] ?? '') === 'constructions.mjs') {
  const compte = ${JSON.stringify(`${repo}.passages`)};
  appendFileSync(compte, 'x\\n');
  if (readFileSync(compte, 'utf8').length > 4) process.exit(1);
}
`
  );
  return { NODE_OPTIONS: `--import=${pathToFileURL(script).href}` };
}
// The runs of the entry point a bounded trial counted: one, or two when the call the root build
// makes is the one refused; a loop reaches the bound, three.
const passages = (repo: string) =>
  existsSync(`${repo}.passages`) ? readFileSync(`${repo}.passages`, 'utf8').length / 2 : 0;
// A packages project whose first passage, green, built every package once.
function paquets(): Depot {
  const d = depot(ESSAIS, fichiersPaquets());
  vert(d.passage());
  return d;
}
// A project without packages whose first passage, green, built it once.
function unique(): Depot {
  const d = depot(ESSAIS, fichiersUnique());
  vert(d.passage());
  return d;
}

describe('critère 16 — one entry point builds, also run from the command line', () => {
  it('critère 16: the entry point is scripts/integration/constructions.mjs', () => {
    expect(existsSync(POINT_D_ENTREE)).toBe(true);
  });
  it(
    'critère 16: run from the root of a packages project, it builds each package once, then, nothing changed, none',
    () => {
      const d = depot(ESSAIS, fichiersPaquets());
      const premiers = d.buildsDe(() => vert(d.passage()));
      expect([...premiers].sort()).toEqual(['a', 'b', 'c', 'e', 'f']);
      expect(d.buildsDe(() => vert(d.passage()))).toEqual([]);
    },
    LONG
  );
  it(
    "critère 16: the root's build script of a packages project calls it: npm run build builds through the store",
    () => {
      const d = depot(ESSAIS, fichiersPaquets('node scripts/integration/constructions.mjs'));
      const lancer = () =>
        spawnSync('npm', ['run', '--silent', 'build'], {
          cwd: d.repo,
          encoding: 'utf8',
          env: { ...process.env, PRINCIPAL: d.repo, FORCER: '' },
        });
      const premiers = d.buildsDe(() => vert(lancer()));
      expect([...premiers].sort()).toEqual(['a', 'b', 'c', 'e', 'f']);
      expect(d.buildsDe(() => vert(lancer()))).toEqual([]);
    },
    LONG
  );
});

describe('critère 9 — a component has a build when its package.json has a build script; its output is its dist/', () => {
  it(
    'critère 9: a package without a build script is not built and its dist/ is left as it is',
    () => {
      const d = depot(ESSAIS, fichiersPaquets());
      d.ecrire('packages/d/dist/garde.txt', 'à moi\n');
      const avant = arbre(path.join(d.repo, 'packages/d/dist'));
      const faits = d.buildsDe(() => vert(d.passage()));
      expect(faits).not.toContain('d');
      expect(arbre(path.join(d.repo, 'packages/d/dist'))).toEqual(avant);
      expect(existsSync(d.entree('packages/d'))).toBe(false);
    },
    LONG
  );
  it(
    'critère 9: a component under src/ whose package.json has a build is built like a package',
    () => {
      const d = paquets();
      expect(d.builds()).toContain('f');
      expect(arbre(d.entree('src/f'))).toEqual(arbre(path.join(d.repo, 'src/f/dist')));
    },
    LONG
  );
});

describe('critère 10 — in a project where a component has a build, each is built in the order of the consumptions, never the root', () => {
  it(
    'critère 10: a provider is built before its consumers (a, then b, then c), and the root build never runs',
    () => {
      const d = paquets();
      const ordre = d.builds();
      expect(ordre.indexOf('a')).toBeLessThan(ordre.indexOf('b'));
      expect(ordre.indexOf('b')).toBeLessThan(ordre.indexOf('c'));
      expect(ordre).not.toContain('racine');
    },
    LONG
  );
  it(
    'critère 10: the devDependencies are not in the graph: packages/a lists @e/c there, and a change of c does not build a again',
    () => {
      const d = paquets();
      d.commiter({
        'packages/c/src/index.ts': "import { b } from '@e/b';\nexport const c = b + 2;\n",
      });
      const faits = d.buildsDe(() => vert(d.passage()));
      expect(faits).toEqual(['c']);
    },
    LONG
  );
  it(
    'critère 10: a project whose packages have no build at all runs the root build as the single build',
    () => {
      const f = fichiersPaquets();
      for (const p of ['a', 'b', 'c', 'e']) {
        f[`packages/${p}/package.json`] = JSON.stringify({ name: `@e/${p}`, version: '1.0.0' });
      }
      f['src/f/package.json'] = JSON.stringify({ name: '@e/f', version: '1.0.0' });
      const d = depot(ESSAIS, f);
      expect(d.buildsDe(() => vert(d.passage()))).toEqual(['racine']);
    },
    LONG
  );
});

describe('critère 1 — each build is stored under the fingerprint of its inputs', () => {
  it(
    "critère 1: after a passage, each package's dist/ lies in the store under its fingerprint, as a tree equal to it",
    () => {
      const d = paquets();
      for (const comp of CONSTRUITS) {
        const e = d.entree(comp);
        expect(path.basename(e)).toMatch(HEX);
        expect(arbre(e), comp).toEqual(arbre(path.join(d.repo, comp, 'dist')));
      }
    },
    LONG
  );
  it(
    "critère 1: a change in a package's own sources builds it again, and its consumers",
    () => {
      const d = paquets();
      d.commiter({
        'packages/b/src/index.ts': "import { a } from '@e/a';\nexport const b = a + 2;\n",
      });
      expect(d.buildsDe(() => vert(d.passage()))).toEqual(['b', 'c']);
    },
    LONG
  );
  it(
    'critère 1: a change in a provider reached transitively (a, through b) builds c again',
    () => {
      const d = paquets();
      d.commiter({ 'packages/a/src/index.ts': 'export const a = 2;\n' });
      expect(d.buildsDe(() => vert(d.passage()))).toEqual(['a', 'b', 'c']);
      expect(d.builds()).not.toContain('racine');
    },
    LONG
  );
  it(
    'critère 1: a change of the lock file builds every package again',
    () => {
      const d = paquets();
      d.commiter({ 'package-lock.json': '{"lockfileVersion":3,"x":1}\n' });
      expect([...d.buildsDe(() => vert(d.passage()))].sort()).toEqual(['a', 'b', 'c', 'e', 'f']);
    },
    LONG
  );
  it(
    'critère 1: a change under a declared path (grillhouse.lusParLesSuites) builds every package again',
    () => {
      const d = paquets();
      d.commiter({ 'outils/config.json': '{"v":2}\n' });
      expect([...d.buildsDe(() => vert(d.passage()))].sort()).toEqual(['a', 'b', 'c', 'e', 'f']);
    },
    LONG
  );
  it(
    'critère 1: a change in a package that no other consumes (e), or outside every package and every declared path, builds only e',
    () => {
      const d = paquets();
      d.commiter({ 'packages/e/src/index.ts': 'export const e = 6;\n', 'autre/notes.txt': 'n2\n' });
      expect(d.buildsDe(() => vert(d.passage()))).toEqual(['e']);
    },
    LONG
  );
});

describe('critère 2 — a build whose fingerprint is in the store is not done again: its output is restored as it was', () => {
  it(
    'critère 2: a new copy on the same commit builds nothing and gets every dist/ as it was built, modes included',
    () => {
      const d = paquets();
      const c = d.copie();
      expect(d.buildsDe(() => vert(d.passage(c)))).toEqual([]);
      for (const comp of CONSTRUITS) {
        expect(arbre(path.join(c, comp, 'dist')), comp).toEqual(
          arbre(path.join(d.repo, comp, 'dist'))
        );
      }
      expect(statSync(path.join(c, 'packages/a/dist/bin/run.sh')).mode & 0o777).toBe(0o755);
    },
    LONG
  );
  it(
    'critère 2: a source rewritten with the same content, a new date on it, builds nothing',
    () => {
      const d = paquets();
      d.ecrire('packages/a/src/index.ts', 'export const a = 1;\n');
      const demain = new Date(Date.now() + 86_400_000);
      utimesSync(path.join(d.repo, 'packages/a/src/index.ts'), demain, demain);
      expect(d.buildsDe(() => vert(d.passage()))).toEqual([]);
    },
    LONG
  );
  it(
    'critère 2: a copy whose dist/ was removed gets it back from the store without building',
    () => {
      const d = paquets();
      const avant = arbre(path.join(d.repo, 'packages/c/dist'));
      rmSync(path.join(d.repo, 'packages/c/dist'), { recursive: true });
      expect(d.buildsDe(() => vert(d.passage()))).toEqual([]);
      expect(arbre(path.join(d.repo, 'packages/c/dist'))).toEqual(avant);
    },
    LONG
  );
});

describe('critère 3 — only the packages whose fingerprint is not in the store are built, in order; a project without packages follows the same rule', () => {
  it(
    'critère 3: back on a content already built, after a change, nothing is built',
    () => {
      const d = paquets();
      const base = d.git('rev-parse', 'HEAD').trim();
      d.commiter({
        'packages/b/src/index.ts': "import { a } from '@e/a';\nexport const b = a + 2;\n",
      });
      vert(d.passage());
      d.git('checkout', '-q', '--detach', base);
      expect(d.buildsDe(() => vert(d.passage()))).toEqual([]);
      expect(arbre(path.join(d.repo, 'packages/c/dist'))).toEqual(arbre(d.entree('packages/c')));
    },
    LONG
  );
  it(
    'critère 3: a project without packages builds its root once, then, nothing changed, not again',
    () => {
      const d = unique();
      expect(d.builds()).toEqual(['racine']);
      const c = d.copie();
      expect(d.buildsDe(() => vert(d.passage(c)))).toEqual([]);
      expect(arbre(path.join(c, 'dist'))).toEqual(arbre(path.join(d.repo, 'dist')));
    },
    LONG
  );
  it(
    'critère 3: a project with no build at all builds nothing and the passage is green',
    () => {
      const f = fichiersUnique();
      f['package.json'] = JSON.stringify({ name: 'essai', private: true });
      const d = depot(ESSAIS, f);
      expect(d.buildsDe(() => vert(d.passage()))).toEqual([]);
      expect(d.entrees()).toEqual([]);
    },
    LONG
  );
});

describe('critère 11 — without any component that has a build, the root build is the single build; its fingerprint takes every file git lists', () => {
  it(
    'critère 11: its output is the dist/ of the root, stored under the fingerprint of the root',
    () => {
      const d = unique();
      expect(arbre(d.entree(''))).toEqual(arbre(path.join(d.repo, 'dist')));
      expect(arbre(path.join(d.repo, 'dist'))).toHaveProperty(['index.js']);
    },
    LONG
  );
  it(
    'critère 11: a change of a file outside every component (src/index.ts) builds again',
    () => {
      const d = unique();
      d.commiter({ 'src/index.ts': 'export const index = 1;\n' });
      expect(d.buildsDe(() => vert(d.passage()))).toEqual(['racine']);
    },
    LONG
  );
  it(
    'critère 11: an untracked file that git does not ignore builds again; a change of an ignored file does not',
    () => {
      const d = unique();
      d.ecrire('node_modules/x/index.js', 'x\n');
      d.ecrire('dist/autre.js', 'ignoré\n');
      expect(d.buildsDe(() => vert(d.passage()))).toEqual([]);
      d.ecrire('notes.txt', 'non suivi\n');
      expect(d.buildsDe(() => vert(d.passage()))).toEqual(['racine']);
    },
    LONG
  );
  it(
    'critère 11: a change of the lock file builds again',
    () => {
      const d = unique();
      d.commiter({ 'package-lock.json': '{"lockfileVersion":3,"x":1}\n' });
      expect(d.buildsDe(() => vert(d.passage()))).toEqual(['racine']);
    },
    LONG
  );
});

describe('critère 15 — the fingerprint of a build is computed in traces.mjs on the inputs of the full suite, under a label of its own', () => {
  it(
    'critère 15: a build and the full suite of the same component never share a fingerprint',
    () => {
      const d = depot(ESSAIS, fichiersPaquets());
      const t = ouvrirTraces(d.repo);
      for (const comp of CONSTRUITS) {
        const e = d.empreinte(comp);
        expect(e).toMatch(HEX);
        expect(e).not.toBe(t.statutComposant(comp).empreinte);
      }
      const u = depot(ESSAIS, fichiersUnique());
      expect(u.empreinte('')).not.toBe(ouvrirTraces(u.repo).statutRacine().empreinte);
    },
    LONG
  );
  it(
    'critère 15: the fingerprint of a component follows its files, its closure, the lock file and the declared paths, and nothing else',
    () => {
      const d = depot(ESSAIS, fichiersPaquets());
      const avant = Object.fromEntries(CONSTRUITS.map(c => [c, d.empreinte(c)]));
      d.ecrire('packages/a/src/autre.ts', 'export const x = 1;\n');
      const apresA = Object.fromEntries(CONSTRUITS.map(c => [c, d.empreinte(c)]));
      for (const c of ['packages/a', 'packages/b', 'packages/c']) {
        expect(apresA[c], c).not.toBe(avant[c]);
      }
      for (const c of ['packages/e', 'src/f']) {
        expect(apresA[c], c).toBe(avant[c]);
      }
      d.ecrire('autre/notes.txt', 'n2\n');
      expect(d.empreinte('packages/e')).toBe(avant['packages/e']);
      d.ecrire('outils/config.json', '{"v":9}\n');
      expect(d.empreinte('packages/e')).not.toBe(avant['packages/e']);
    },
    LONG
  );
  it(
    "critère 15: the root's fingerprint takes src/index.ts, outside every component",
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      const avant = d.empreinte('');
      d.ecrire('src/index.ts', 'export const index = 2;\n');
      expect(d.empreinte('')).not.toBe(avant);
    },
    LONG
  );
});

describe('critère 4 — the base and the lot each read the build of their own content, beside each other', () => {
  it(
    "critère 4: in one copy, the base's build is restored, the lot's is built beside it, and neither overwrites the other",
    () => {
      const d = paquets();
      const base = d.git('rev-parse', 'HEAD').trim();
      const entreeBase = d.entree('packages/c');
      const photoBase = arbre(entreeBase);
      d.git('checkout', '-q', '-b', 'agent/lot');
      d.commiter({ 'packages/b/src/neuf.ts': 'export const neuf = 1;\n' });
      const c = d.copie(base);
      expect(d.buildsDe(() => vert(d.passage(c)))).toEqual([]);
      d.gitDans(c, 'checkout', '-q', '--detach', 'agent/lot');
      expect(d.buildsDe(() => vert(d.passage(c)))).toEqual(['b', 'c']);
      expect(arbre(entreeBase)).toEqual(photoBase);
      expect(arbre(d.entree('packages/b', c))).toEqual(arbre(path.join(c, 'packages/b/dist')));
      expect(arbre(path.join(c, 'packages/b/dist'))).toHaveProperty(['neuf.js']);
    },
    LONG
  );
});

describe('critère 5 — a build that fails stores nothing; an unreadable output in the store is built again', () => {
  it(
    'critère 5: a red build makes the passage fail, stores nothing, and the next passage builds it again',
    () => {
      const d = depot(ESSAIS, fichiersPaquets());
      const r = d.passage(d.repo, { CASSE: 'e' });
      expect(r.status).not.toBe(0);
      expect(existsSync(d.entree('packages/e'))).toBe(false);
      expect(d.buildsDe(() => vert(d.passage()))).toContain('e');
    },
    LONG
  );
  it(
    'critère 5: a red root build in a project without packages stores nothing',
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      expect(d.passage(d.repo, { CASSE: 'racine' }).status).not.toBe(0);
      expect(d.entrees()).toEqual([]);
      expect(d.buildsDe(() => vert(d.passage()))).toEqual(['racine']);
    },
    LONG
  );
  it(
    'critère 5: an entry that cannot be read is built again, and the passage is green',
    () => {
      const d = paquets();
      const e = d.entree('packages/e');
      chmodSync(e, 0o000);
      try {
        const c = d.copie();
        expect(d.buildsDe(() => vert(d.passage(c)))).toEqual(['e']);
        expect(arbre(path.join(c, 'packages/e/dist'))).toHaveProperty(['index.js']);
      } finally {
        chmodSync(e, 0o755);
      }
    },
    LONG
  );
});

describe('critère 12 — a green build that leaves no dist/ stores nothing, and says so in one line', () => {
  it(
    'critère 12: a package built green without a dist/ stores nothing, a line names it, and it is built again next time',
    () => {
      const d = depot(ESSAIS, fichiersPaquets());
      const r = d.passage(d.repo, { SANS_DIST: 'e' });
      vert(r);
      expect(existsSync(d.entree('packages/e'))).toBe(false);
      const lignes = (r.stdout + r.stderr)
        .split('\n')
        .filter(l => l.includes('packages/e') && l.includes('dist'));
      expect(lignes.length).toBe(1);
      expect(d.buildsDe(() => vert(d.passage()))).toEqual(['e']);
    },
    LONG
  );
  it(
    'critère 12: a root build green without a dist/ stores nothing, and a line says so',
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      const r = d.passage(d.repo, { SANS_DIST: 'racine' });
      vert(r);
      expect(d.entrees()).toEqual([]);
      expect((r.stdout + r.stderr).split('\n').filter(l => l.includes('dist')).length).toBe(1);
    },
    LONG
  );
});

describe('critère 13 — a build is stored as a copied tree, written aside then renamed; no link ties the store to a copy', () => {
  it(
    'critère 13: after passages, the store holds only entries named by a fingerprint: no temporary folder is left',
    () => {
      const d = paquets();
      d.commiter({ 'packages/a/src/index.ts': 'export const a = 3;\n' });
      vert(d.passage());
      expect(d.entrees().length).toBeGreaterThan(0);
      for (const n of d.entrees()) {
        expect(n).toMatch(HEX);
      }
    },
    LONG
  );
  it(
    'critère 13: no hard link: the restored files and the entries are files of their own, and a write in a copy changes no entry',
    () => {
      const d = paquets();
      const c = d.copie();
      vert(d.passage(c));
      const e = d.entree('packages/a', c);
      const photoE = arbre(e);
      for (const f of ['index.js', 'bin/run.sh']) {
        expect(statSync(path.join(c, 'packages/a/dist', f)).nlink, f).toBe(1);
        expect(statSync(path.join(e, f)).nlink, f).toBe(1);
      }
      d.ecrire('packages/a/dist/index.js', 'réécrit en place\n', c);
      d.ecrire('packages/a/dist/index.js', 'réécrit en place\n', d.repo);
      expect(arbre(e)).toEqual(photoE);
    },
    LONG
  );
  it(
    'critère 13: two passages on the same content at once both end green, with one entry and nothing left aside',
    async () => {
      const d = depot(ESSAIS, fichiersUnique());
      const c1 = d.copie();
      const c2 = d.copie();
      const [r1, r2] = await Promise.all([
        d.passageEnFond(c1, { LENT: '800' }),
        d.passageEnFond(c2, { LENT: '800' }),
      ]);
      expect(r1.status, r1.sortie).toBe(0);
      expect(r2.status, r2.sortie).toBe(0);
      expect(d.entrees()).toEqual([d.empreinte('', c1)]);
      expect(arbre(d.entree('', c1))).toEqual(arbre(path.join(c1, 'dist')));
    },
    LONG
  );
  it(
    'critère 13: an entry already there counts as stored: a build of a fingerprint whose entry cannot be read ends green',
    () => {
      const d = unique();
      const e = d.entree('');
      chmodSync(e, 0o000);
      try {
        const c = d.copie();
        const r = d.passage(c);
        vert(r);
        expect(arbre(path.join(c, 'dist'))).toHaveProperty(['index.js']);
      } finally {
        chmodSync(e, 0o755);
      }
    },
    LONG
  );
});

describe('critère 14 — a restoration empties the dist/ first; a build absent from the store starts from an empty dist/', () => {
  it(
    'critère 14: a stale file in a dist/ before the restoration is gone after it',
    () => {
      const d = paquets();
      const c = d.copie();
      d.ecrire('packages/c/dist/perime.js', 'vieux\n', c);
      expect(d.buildsDe(() => vert(d.passage(c)))).toEqual([]);
      expect(arbre(path.join(c, 'packages/c/dist'))).toEqual(arbre(d.entree('packages/c', c)));
    },
    LONG
  );
  it(
    'critère 14: a build absent from the store starts from an empty dist/: the base built in the same copy leaves nothing in the build of the lot',
    () => {
      const d = depot(ESSAIS, fichiersPaquets());
      d.commiter({ 'packages/e/src/vieux.ts': 'export const vieux = 1;\n' });
      vert(d.passage());
      expect(existsSync(path.join(d.repo, 'packages/e/dist/vieux.js'))).toBe(true);
      d.git('rm', '-q', 'packages/e/src/vieux.ts');
      d.git('commit', '-q', '-m', 'retire vieux');
      expect(d.buildsDe(() => vert(d.passage()))).toEqual(['e']);
      expect(existsSync(path.join(d.repo, 'packages/e/dist/vieux.js'))).toBe(false);
      expect(arbre(d.entree('packages/e'))).not.toHaveProperty(['vieux.js']);
    },
    LONG
  );
  it(
    'critère 14: the same in a project without packages: a file gone from src/ is gone from the stored dist/',
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      d.commiter({ 'src/vieux.ts': 'export const vieux = 1;\n' });
      vert(d.passage());
      d.git('rm', '-q', 'src/vieux.ts');
      d.git('commit', '-q', '-m', 'retire vieux');
      vert(d.passage());
      expect(existsSync(path.join(d.repo, 'dist/vieux.js'))).toBe(false);
      expect(arbre(d.entree(''))).not.toHaveProperty(['vieux.js']);
    },
    LONG
  );
  it(
    'critère 14: an entry gone from the store is built again',
    () => {
      const d = paquets();
      rmSync(d.entree('packages/e'), { recursive: true });
      const c = d.copie();
      expect(d.buildsDe(() => vert(d.passage(c)))).toEqual(['e']);
    },
    LONG
  );
});

describe('critère 7 — FORCER=1 builds everything without reading the store, and writes again what it builds', () => {
  it(
    'critère 7: under FORCER=1 every package is built again, though the store holds them',
    () => {
      const d = paquets();
      const faits = d.buildsDe(() => vert(d.passage(d.repo, { FORCER: '1' })));
      expect([...faits].sort()).toEqual(['a', 'b', 'c', 'e', 'f']);
    },
    LONG
  );
  it(
    'critère 7: under FORCER=1 an entry is written again: a file foreign to the build leaves the entry',
    () => {
      const d = unique();
      const e = d.entree('');
      d.ecrire('etranger.js', 'pas de la construction\n', e);
      const faits = d.buildsDe(() => vert(d.passage(d.repo, { FORCER: '1' })));
      expect(faits).toEqual(['racine']);
      expect(arbre(e)).toEqual(arbre(path.join(d.repo, 'dist')));
      for (const n of d.entrees()) {
        expect(n).toMatch(HEX);
      }
    },
    LONG
  );
});

describe('critère 19 — a red build stops the passage: no package is built after it, and the passage fails', () => {
  for (const [casse, absents] of [
    ['a', ['b', 'c']],
    ['b', ['c']],
    ['e', []],
  ] as const) {
    it(
      `critère 19: with ${casse} red, the passage fails, ${casse} is the last build${absents.length ? `, and ${absents.join(', ')} are not built` : ''}`,
      () => {
        const d = depot(ESSAIS, fichiersPaquets());
        let r: ReturnType<Depot['passage']> | undefined;
        const faits = d.buildsDe(() => (r = d.passage(d.repo, { CASSE: casse })));
        expect(r!.status, r!.stdout + r!.stderr).not.toBe(0);
        expect(faits.at(-1), faits.join(' ')).toBe(casse);
        expect(faits.filter(n => n === casse)).toEqual([casse]);
        for (const n of absents) {
          expect(faits).not.toContain(n);
        }
      },
      LONG
    );
  }
});

describe('critère 21 — an unreadable entry already in the store is replaced by the build done again, as under FORCER=1', () => {
  // The entry of <comp> made unreadable by <abimer>, then a passage in a new copy: it builds <nom>
  // once, the entry reads again, with no right given back, as that copy's dist/, and a passage in
  // another new copy builds nothing; no name but a fingerprint is left in the store.
  function remplacee(d: Depot, comp: string, nom: string, abimer: (e: string) => void) {
    const e = d.entree(comp);
    abimer(e);
    try {
      const c = d.copie();
      expect(d.buildsDe(() => vert(d.passage(c)))).toEqual([nom]);
      expect(arbre(e)).toEqual(arbre(path.join(c, comp, 'dist')));
      const c2 = d.copie();
      expect(d.buildsDe(() => vert(d.passage(c2)))).toEqual([]);
      expect(arbre(path.join(c2, comp, 'dist'))).toEqual(arbre(path.join(c, comp, 'dist')));
      for (const n of d.entrees()) {
        expect(n).toMatch(HEX);
      }
    } finally {
      rendreLisible(d.magasin);
    }
  }
  it(
    'critère 21: an entry whose folder cannot be read (no rights) is replaced, and not built again at the next passage',
    () => {
      remplacee(unique(), '', 'racine', e => chmodSync(e, 0o000));
    },
    LONG
  );
  it(
    'critère 21: a package entry that a file stands for, not a folder, is replaced by the tree of its build',
    () => {
      remplacee(paquets(), 'packages/e', 'e', e => {
        rmSync(e, { recursive: true });
        writeFileSync(e, 'pas un arbre\n');
      });
    },
    LONG
  );
  it(
    'critère 21: an entry with a folder deep inside that cannot be read (bin/) is built again, then replaced',
    () => {
      remplacee(paquets(), 'packages/a', 'a', e => chmodSync(path.join(e, 'bin'), 0o000));
    },
    LONG
  );
});

describe('critère 24 — outside git no store; a root build that calls the entry point is refused; links and empty folders restored as they are', () => {
  it(
    'critère 24: outside any git repository, each passage builds, green, and nothing is kept',
    () => {
      const h = horsGit(ESSAIS, fichiersUnique());
      vert(h.passage());
      vert(h.passage());
      expect(h.builds()).toEqual(['racine', 'racine']);
      expect(arbre(path.join(h.racine, 'dist'))).toHaveProperty(['index.js']);
    },
    LONG
  );
  it(
    'critère 24: outside git, a packages project builds each package at each passage',
    () => {
      const h = horsGit(ESSAIS, fichiersPaquets());
      vert(h.passage());
      vert(h.passage());
      expect([...h.builds()].sort()).toEqual(['a', 'a', 'b', 'b', 'c', 'c', 'e', 'e', 'f', 'f']);
    },
    LONG
  );
  it(
    'critère 24: in a project without packages whose root build calls the entry point, the passage is refused in one line, without looping',
    () => {
      const f = fichiersUnique();
      f['package.json'] = JSON.stringify(
        {
          name: 'essai',
          private: true,
          scripts: { build: 'node scripts/integration/constructions.mjs' },
        },
        null,
        2
      );
      const d = depot(ESSAIS, f);
      const r = spawnSync('node', [POINT_D_ENTREE], {
        cwd: d.repo,
        encoding: 'utf8',
        env: { ...process.env, PRINCIPAL: d.repo, FORCER: '', ...borne(d.repo) },
        timeout: 20_000,
      });
      expect(r.error, 'le passage boucle jusqu’au délai').toBeUndefined();
      expect(r.signal).toBeNull();
      expect(passages(d.repo), 'le passage boucle jusqu’à la borne').toBeLessThan(3);
      expect(r.status).not.toBe(0);
      const lignes = (r.stdout + r.stderr).split('\n').filter(l => l.trim() !== '');
      expect(lignes, r.stdout + r.stderr).toHaveLength(1);
      expect(d.entrees()).toEqual([]);
    },
    LONG
  );
  it(
    'critère 24: the same refusal, in one line, through npm run build, which ends instead of looping',
    () => {
      const f = fichiersUnique();
      f['package.json'] = JSON.stringify(
        {
          name: 'essai',
          private: true,
          scripts: { build: 'node scripts/integration/constructions.mjs' },
        },
        null,
        2
      );
      const d = depot(ESSAIS, f);
      const r = spawnSync('npm', ['run', '--silent', 'build'], {
        cwd: d.repo,
        encoding: 'utf8',
        env: { ...process.env, PRINCIPAL: d.repo, FORCER: '', ...borne(d.repo) },
        timeout: 20_000,
      });
      expect(r.error, 'npm run build boucle jusqu’au délai').toBeUndefined();
      expect(passages(d.repo), 'npm run build boucle jusqu’à la borne').toBeLessThan(3);
      expect(r.status).not.toBe(0);
      const lignes = (r.stdout + r.stderr).split('\n').filter(l => l.trim() !== '');
      expect(lignes, r.stdout + r.stderr).toHaveLength(1);
    },
    LONG
  );
  it(
    'critère 24: a root build that calls the entry point through another script (a script of its own, through an npm script) is refused in one line by the call it makes, without looping',
    () => {
      const f = fichiersUnique();
      f['package.json'] = JSON.stringify(
        {
          name: 'essai',
          private: true,
          scripts: {
            build: 'node outils/construire.mjs',
            construire: 'npm run --silent relais',
            relais: 'node scripts/integration/constructions.mjs',
          },
        },
        null,
        2
      );
      // The project's own build script: it counts its runs in <PRINCIPAL>.rappels, calls the entry
      // point through `npm run construire`, keeps that call's output in <PRINCIPAL>.rappel and
      // ends with its code. From its third run it ends red at once, so a loop stops by itself.
      f['outils/construire.mjs'] =
        `import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const compte = process.env.PRINCIPAL + '.rappels';
appendFileSync(compte, 'x\\n');
if (readFileSync(compte, 'utf8').length > 4) process.exit(1);
const r = spawnSync('npm', ['run', '--silent', 'construire'], { encoding: 'utf8' });
writeFileSync(process.env.PRINCIPAL + '.rappel', (r.stdout ?? '') + (r.stderr ?? ''));
process.exit(r.status ?? 1);
`;
      const d = depot(ESSAIS, f);
      const r = spawnSync('node', [POINT_D_ENTREE], {
        cwd: d.repo,
        encoding: 'utf8',
        env: { ...process.env, PRINCIPAL: d.repo, FORCER: '' },
        timeout: 20_000,
      });
      expect(r.error, 'le passage boucle jusqu’au délai').toBeUndefined();
      expect(r.signal).toBeNull();
      expect(r.status, r.stdout + r.stderr).not.toBe(0);
      expect(readFileSync(`${d.repo}.rappels`, 'utf8')).toBe('x\n');
      const rappel = readFileSync(`${d.repo}.rappel`, 'utf8');
      const lignes = rappel.split('\n').filter(l => l.trim() !== '');
      expect(lignes, rappel).toHaveLength(1);
      expect(d.entrees()).toEqual([]);
    },
    LONG
  );
  it(
    'critère 24: an output with links and empty folders is stored and restored as it is: each link a link to the same relative target, each empty folder there',
    () => {
      const d = depot(ESSAIS, fichiersLiens());
      vert(d.passage());
      const construit = arbreExact(path.join(d.repo, 'dist'));
      expect(construit).toMatchObject({
        'lien.js': 'lien:index.js',
        outils: 'lien:bin',
        'vide/': 'dossier',
        'profond/vide/': 'dossier',
      });
      expect(arbreExact(d.entree(''))).toEqual(construit);
      const c = d.copie();
      expect(d.buildsDe(() => vert(d.passage(c)))).toEqual([]);
      expect(arbreExact(path.join(c, 'dist'))).toEqual(construit);
      expect(lstatSync(path.join(c, 'dist/lien.js')).isSymbolicLink()).toBe(true);
    },
    LONG
  );
});
