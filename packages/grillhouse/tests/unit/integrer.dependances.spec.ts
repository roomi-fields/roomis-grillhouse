import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { chantierDependances } from './integration-essai.js';

// The integration of a ticket's lot (scripts/integration/integrer.mjs,
// tests/unit/integrer.spec.ts): the dependencies of its copy follow its lock file
// (grillhouse-3uv.74).
// The trial harness: ./integration-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'integrer-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// grillhouse-3uv.74: the dependencies of the integration copy follow its lock file of the moment.
// One function of the replay (scripts/integration/rejeu.mjs) compares the lock file with the key
// of node_modules, runs `npm ci` when they differ and writes the key again; it runs at the opening
// and once the lot is applied, before `npm run verifier` (the build, the guards, the tests), which reads
// the dependencies. The trial project's build, guards and tests read the dependencies
// (./integration-essai.ts, `chantierDependances`); npm runs offline.
describe('grillhouse-3uv.74 — the dependencies of the integration copy follow its lock file', () => {
  const D = 180_000;
  it(
    'critère 1: a lot that adds a workspace is committed: its tests find the new package by its name',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket(
        'demo-1',
        m.fichiers({ ...m.initial, espaces: { ...m.initial.espaces, 'src/d': 'd' } })
      );
      const avant = m.lectures().length;
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
      const lues = m.lectures().slice(avant);
      expect(lues.map(l => l.qui)).toContain('suites');
      for (const l of lues) {
        expect(l.presents.d, l.qui).toBe('1.0.0');
      }
    },
    D
  );
  it(
    'critère 1: a lot that adds a workspace under another name than its directory is installed under its name',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket(
        'demo-1',
        m.fichiers({
          ...m.initial,
          espaces: { ...m.initial.espaces, 'src/outils': '@essai/outils' },
        })
      );
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.lectures().at(-1)!.presents['@essai']).toBeDefined();
    },
    D
  );
  it(
    'critère 3: a lot that changes an external dependency in the lock file is installed before its guards and tests',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', m.fichiers({ ...m.initial, externe: '2.0.0' }));
      const avant = m.lectures().length;
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const lues = m.lectures().slice(avant);
      expect(lues.map(l => l.qui).sort()).toEqual(['gardes', 'suites']);
      expect(lues.map(l => l.presents['ext-lib'])).toEqual(['2.0.0', '2.0.0']);
    },
    D
  );
  it(
    'critère 4: a lot that does not change the lock file does not run npm ci again: the key holds',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      m.poserMarque('integration');
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.livrer('demo-2');
      expect(m.marquee('integration')).toBe(true);
    },
    D
  );
  it(
    'critère 5: after a lot that changed the lock file, the next integration installs again and tests with the dependencies of HEAD and its lot',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket(
        'demo-1',
        m.fichiers({ espaces: { ...m.initial.espaces, 'src/d': 'd' }, externe: '2.0.0' })
      );
      m.livrer('demo-1');
      m.poserMarque('integration');
      m.ticket('demo-2', { 'src/a/index.ts': 'export const a = 1;\n' });
      const avant = m.lectures().length;
      m.livrer('demo-2');
      expect(m.marquee('integration')).toBe(false);
      const lues = m.lectures().slice(avant);
      expect(lues.length).toBeGreaterThan(0);
      for (const l of lues) {
        expect(l.presents.d, l.qui).toBeUndefined();
        expect(l.presents['ext-lib'], l.qui).toBe('1.0.0');
      }
    },
    D
  );
  it(
    'critère 5: after a lot whose installation failed, the next integration installs again and tests with the dependencies of HEAD and its lot',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', m.introuvable());
      expect(m.integrer('demo-1').status).toBe(1);
      m.ticket('demo-2', { 'src/a/index.ts': 'export const a = 1;\n' });
      const avant = m.lectures().length;
      const r = m.integrer('demo-2');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const lues = m.lectures().slice(avant);
      expect(lues.map(l => l.qui)).toContain('suites');
      for (const l of lues) {
        expect(l.presents, l.qui).toMatchObject({ a: '1.0.0', b: '1.0.0', 'ext-lib': '1.0.0' });
      }
    },
    D
  );
  it(
    "critère 6: an installation that fails after the lot is applied refuses the lot with « Les dépendances de la copie ne s'installent pas. », without running npm run verifier",
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', m.introuvable());
      const avant = m.appelsSuites();
      const r = m.integrer('demo-1');
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("⛔ Les dépendances de la copie ne s'installent pas.");
      expect(m.appelsSuites() - avant).toBe(0);
      expect(m.existe('agent/demo-1') && m.sujets('agent/demo-1')[0]).not.toBe(
        'feat: lot (demo-1)'
      );
    },
    D
  );
  it(
    'critère 6: a lot whose lock file disagrees with its package.json is refused the same way, without running npm run verifier',
    () => {
      const m = chantierDependances(ESSAIS);
      // package.json names the workspace src/d, which the lock file (ext-lib 2.0.0) lacks.
      const neuf = m.fichiers({ ...m.initial, espaces: { ...m.initial.espaces, 'src/d': 'd' } });
      const verrou = m.fichiers({ ...m.initial, externe: '2.0.0' });
      m.ticket('demo-1', {
        'package.json': neuf['package.json'],
        'src/d/package.json': neuf['src/d/package.json'],
        'package-lock.json': verrou['package-lock.json'],
      });
      const avant = m.appelsSuites();
      const r = m.integrer('demo-1');
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("⛔ Les dépendances de la copie ne s'installent pas.");
      expect(m.appelsSuites() - avant).toBe(0);
    },
    D
  );
  it(
    'critère 9: a build that reads a new package of the lot finds it installed: the installation comes before the build',
    () => {
      const m = chantierDependances(ESSAIS, { construction: true });
      m.ticket(
        'demo-1',
        m.fichiers({ ...m.initial, espaces: { ...m.initial.espaces, 'src/d': 'd' } })
      );
      const avant = m.lectures().length;
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
      const lues = m.lectures().slice(avant);
      expect(lues[0].qui).toBe('construction');
      expect(lues.map(l => l.qui)).toContain('suites');
      for (const l of lues) {
        expect(l.presents.d, l.qui).toBe('1.0.0');
      }
    },
    D
  );
  it(
    'critère 10: a lot that removes a workspace is committed: its tests no longer find that package',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', {
        ...m.fichiers({ ...m.initial, espaces: { 'src/a': 'a' } }),
        'src/b/package.json': null,
      });
      const avant = m.lectures().length;
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
      const lues = m.lectures().slice(avant);
      expect(lues.map(l => l.qui).sort()).toEqual(['gardes', 'suites']);
      for (const l of lues) {
        expect(Object.keys(l.presents).sort(), l.qui).toEqual(['a', 'ext-lib']);
      }
    },
    D
  );
});

// grillhouse-3uv.74 critère 7, kept by a reading of the source without its comments: the key of
// node_modules (`.integration-lock`) and `npm ci` live in one function of the replay; neither the
// integration nor the queue reads the key or runs npm ci.
describe('grillhouse-3uv.74 critère 7 — one function compares the lock file and installs', () => {
  const dossier = path.resolve(__dirname, '../../scripts/integration');
  // The string literals of <f> (comments are not literals), each with its innermost function.
  const litteraux = (f: string) => {
    const source = ts.createSourceFile(
      f,
      readFileSync(path.join(dossier, f), 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const out: { texte: string; fonction: ts.Node | null }[] = [];
    const visiter = (n: ts.Node) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n)) {
        let p: ts.Node | undefined = n.parent;
        while (p && !ts.isFunctionLike(p)) {
          p = p.parent;
        }
        out.push({ texte: n.text, fonction: p ?? null });
      }
      n.forEachChild(visiter);
    };
    visiter(source);
    return out;
  };
  const CLE = /\.integration-lock/;
  const CI = (t: string) => t === 'ci' || /\bnpm ci\b/.test(t);
  it('critère 7: neither integrer.mjs nor file.mjs reads the key or runs npm ci', () => {
    for (const f of ['integrer.mjs', 'file.mjs']) {
      const l = litteraux(f);
      expect(l.filter(x => CLE.test(x.texte) || CI(x.texte)).map(x => `${f}: ${x.texte}`)).toEqual(
        []
      );
    }
  });
  it('critère 7: in rejeu.mjs, the key and npm ci are named once each, in the same function', () => {
    const l = litteraux('rejeu.mjs');
    const cles = l.filter(x => CLE.test(x.texte));
    const cis = l.filter(x => CI(x.texte));
    expect(cles).toHaveLength(1);
    expect(cis).toHaveLength(1);
    expect(cles[0].fonction).not.toBeNull();
    expect(cis[0].fonction).toBe(cles[0].fonction);
  });
  it('critère 7: no other script of the integration reads the key or runs npm ci', () => {
    const autres = execFileSync('ls', [dossier], { encoding: 'utf8' })
      .split('\n')
      .filter(f => /\.[cm]?js$/.test(f) && f !== 'rejeu.mjs');
    const porteurs = autres.filter(f => litteraux(f).some(x => CLE.test(x.texte) || CI(x.texte)));
    expect(porteurs).toEqual([]);
  });
});
