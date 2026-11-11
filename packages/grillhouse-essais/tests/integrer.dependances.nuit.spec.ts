// @poste: l'enveloppe bwrap, un serveur Temporal
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { chantierDependances } from './integration-essai.js';
import { CADRE } from './cadre.js';

// The integration of a ticket's lot (scripts/integration/integrer.mjs,
// integrer.nuit.spec.ts): the dependencies of its copy follow its lock file
// (grillhouse-3uv.74).
// The trial harness: ./integration-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'integrer-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// grillhouse-3uv.74: the dependencies of the integration copy follow its lock file of the moment.
// One function of the replay (scripts/integration/rejeu.mjs) compares the lock file with the key
// of node_modules, runs `npm ci` when they differ and writes the key again; it runs at the opening
// and once the lot is applied, before the commands that regenerate the lot's files. What the copy's
// node_modules holds after an integration is what its install put there (`installes`); npm runs
// offline (./integration-essai.ts, `chantierDependances`).
describe('grillhouse-3uv.74 — the dependencies of the integration copy follow its lock file', () => {
  const D = 180_000;
  it(
    'a lot that adds a workspace is committed, the new package installed in the copy by its name',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket(
        'demo-1',
        m.fichiers({ ...m.initial, espaces: { ...m.initial.espaces, 'src/d': 'd' } })
      );
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
      expect(m.installes('integration').d).toBe('1.0.0');
    },
    D
  );
  it(
    'a lot that adds a workspace under another name than its directory is installed under its name',
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
      expect(m.installes('integration')).toHaveProperty('@essai');
    },
    D
  );
  it(
    'a lot that changes an external dependency in the lock file is installed in the copy at its version',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', m.fichiers({ ...m.initial, externe: '2.0.0' }));
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.installes('integration')['ext-lib']).toBe('2.0.0');
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
    'after a lot that changed the lock file, the next integration installs again the dependencies of HEAD and its lot',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket(
        'demo-1',
        m.fichiers({ espaces: { ...m.initial.espaces, 'src/d': 'd' }, externe: '2.0.0' })
      );
      m.livrer('demo-1');
      m.poserMarque('integration');
      m.ticket('demo-2', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-2');
      expect(m.marquee('integration')).toBe(false);
      const installes = m.installes('integration');
      expect(installes.d).toBeUndefined();
      expect(installes['ext-lib']).toBe('1.0.0');
    },
    D
  );
  it(
    'after a lot whose installation failed, the next integration installs again the dependencies of HEAD and its lot',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', m.introuvable());
      expect(m.integrer('demo-1').status).toBe(1);
      m.ticket('demo-2', { 'src/a/index.ts': 'export const a = 1;\n' });
      const r = m.integrer('demo-2');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.installes('integration')).toMatchObject({
        a: '1.0.0',
        b: '1.0.0',
        'ext-lib': '1.0.0',
      });
    },
    D
  );
  it(
    "critère 6: an installation that fails after the lot is applied refuses the lot with « Les dépendances de la copie ne s'installent pas. »",
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', m.introuvable());
      const r = m.integrer('demo-1');
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("⛔ Les dépendances de la copie ne s'installent pas.");
      expect(m.existe('agent/demo-1') && m.sujets('agent/demo-1')[0]).not.toBe(
        'feat: lot (demo-1)'
      );
    },
    D
  );
  it(
    'critère 6: a lot whose lock file disagrees with its package.json is refused the same way',
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
      const r = m.integrer('demo-1');
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("⛔ Les dépendances de la copie ne s'installent pas.");
    },
    D
  );
  it(
    'a lot that removes a workspace is committed: the copy no longer holds that package',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', {
        ...m.fichiers({ ...m.initial, espaces: { 'src/a': 'a' } }),
        'src/b/package.json': null,
      });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
      expect(Object.keys(m.installes('integration')).sort()).toEqual(['a', 'ext-lib']);
    },
    D
  );
});

// grillhouse-3uv.74 critère 7, kept by a reading of the source without its comments: the key of
// node_modules (`.integration-lock`) and `npm ci` live in one function of the replay; neither the
// integration nor the queue reads the key or runs npm ci.
describe('grillhouse-3uv.74 critère 7 — one function compares the lock file and installs', () => {
  const dossier = path.join(CADRE, 'scripts/integration');
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
