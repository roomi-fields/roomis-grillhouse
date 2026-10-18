import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  chantier,
  chantierDependances,
  construireParLiens,
  poserLies,
} from './integration-essai.js';
import { LONG } from './file-integration-essai.js';

// The integration queue (scripts/integration/file.mjs): its copy after a build that hard-links
// tracked files (grillhouse-3uv.73), and its dependencies, which follow its lock file
// (grillhouse-3uv.74).
// The queue's interface is told in tests/unit/file-integration.spec.ts; the trial harness is
// ./integration-essai.ts, and the matter these files share ./file-integration-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-integration-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// grillhouse-3uv.73 critère 3: in the queue, the build that `npm run verifier` plays hard-links tracked
// files (./integration-essai.ts, `construireParLiens`), which leaves the index of the queue's copy
// stale; the branch still replaces, is replayed and enters. The build arrives on main after the
// branch's integration, so the queue alone builds with the links.
describe('grillhouse-3uv.73 — the queue after a build that hard-links tracked files', () => {
  it(
    'critère 3: a branch that deletes a file the build of main hard-links replaces on main, its tests replayed, and enters',
    () => {
      const m = chantier(ESSAIS);
      poserLies(m);
      m.ticket('demo-1', { 'src/a/donnees.txt': null });
      m.livrer('demo-1');
      const builds = construireParLiens(m);
      const avant = m.suites().length;
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).not.toMatch(/ne se replace pas/);
      expect(builds()).toContain('lien');
      expect(m.suites().length).toBeGreaterThan(avant);
      expect(m.sujets().slice(0, 2)).toEqual(['feat: lot (demo-1)', 'construction par liens']);
      expect(m.git('ls-tree', '-r', '--name-only', 'main')).not.toMatch(/src\/a\/donnees\.txt/);
      expect(m.bd('demo-1').status).toBe('closed');
    },
    LONG
  );
  it(
    'critère 3: a branch that modifies files the build of main hard-links, in its tests and its code, replaces on main and enters',
    () => {
      const m = chantier(ESSAIS);
      poserLies(m);
      m.ticket('demo-1', {
        'src/a/tests/fixture.txt': 'f1\nF2\n',
        'src/a/donnees.txt': 'un\nDEUX\ntrois\n',
      });
      m.livrer('demo-1');
      const builds = construireParLiens(m);
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).not.toMatch(/ne se replace pas/);
      expect(builds()).toContain('lien');
      expect(m.sujets().slice(0, 2)).toEqual(['feat: lot (demo-1)', 'construction par liens']);
      expect(m.git('show', 'main:src/a/donnees.txt')).toBe('un\nDEUX\ntrois\n');
      expect(m.git('show', 'main:src/a/tests/fixture.txt')).toBe('f1\nF2\n');
      expect(m.bd('demo-1').status).toBe('closed');
    },
    LONG
  );
});

// grillhouse-3uv.74: the dependencies of the queue's copy follow its lock file of the moment: the
// branch replaced on main is installed before its tests (`npm run verifier`: its guards, then its suites),
// through the one function of the replay (scripts/integration/rejeu.mjs). The trial project's suites and guards read the
// dependencies (./integration-essai.ts, `chantierDependances`); npm runs offline. A branch that
// changes the lock file waits in the queue in the place of its integration (`enFile`), so the
// queue alone replays it.
describe('grillhouse-3uv.74 — the dependencies of the queue copy follow its lock file', () => {
  const D = 180_000;
  it(
    'critère 2: a branch that adds a workspace, replaced on a main that moved, is installed before its tests, and enters',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket(
        'demo-2',
        m.fichiers({ ...m.initial, espaces: { ...m.initial.espaces, 'src/d': 'd' } })
      );
      m.livrer('demo-1');
      m.enFile('demo-2');
      const avant = m.lectures().length;
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets().slice(0, 2)).toEqual(['feat: lot (demo-2)', 'feat: lot (demo-1)']);
      expect(m.bd('demo-2').status).toBe('closed');
      const lues = m.lectures().slice(avant);
      expect(lues.map(l => [l.qui, l.presents.d])).toEqual([
        ['gardes', '1.0.0'],
        ['suites', '1.0.0'],
      ]);
    },
    D
  );
  it(
    'critère 2: a branch that changes an external dependency, replaced on a main that moved, is installed before its tests',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', m.fichiers({ ...m.initial, externe: '2.0.0' }));
      m.livrer('demo-1');
      m.enFile('demo-2');
      const avant = m.lectures().length;
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()[0]).toBe('feat: lot (demo-2)');
      const lues = m.lectures().slice(avant);
      expect(lues.map(l => [l.qui, l.presents['ext-lib']])).toEqual([
        ['gardes', '2.0.0'],
        ['suites', '2.0.0'],
      ]);
    },
    D
  );
  it(
    'critère 5: after a branch replaced that changed the lock file and left the queue, the next replay installs again and plays its tests with the dependencies of main',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', {
        ...m.fichiers({ ...m.initial, externe: '2.0.0' }),
        ROUGES_FORCES: 'rouge-2\n',
      });
      m.livrer('demo-1');
      m.enFile('demo-2');
      expect(m.file().status).toBe(0);
      expect(m.bd('demo-2').status).toBe('open');
      m.poserMarque('file');
      m.ticket('demo-3', { 'src/b/index.ts': 'export const b = 3;\n' });
      m.livrer('demo-3');
      m.poser({ 'src/c/index.ts': 'export const c = 4;\n' }, 'main bouge');
      const avant = m.lectures().length;
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()[0]).toBe('feat: lot (demo-3)');
      expect(m.marquee('file')).toBe(false);
      const lues = m.lectures().slice(avant);
      expect(lues.map(l => [l.qui, l.presents['ext-lib']])).toEqual([
        ['gardes', '1.0.0'],
        ['suites', '1.0.0'],
      ]);
    },
    D
  );
  it(
    'critère 4: a branch replaced on main that does not change the lock file does not run npm ci again: the key holds',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      expect(m.file().status).toBe(0);
      expect(m.sujets()[0]).toBe('feat: lot (demo-2)');
      m.poserMarque('file');
      m.ticket('demo-3', { 'src/c/index.ts': 'export const c = 3;\n' });
      m.livrer('demo-3');
      m.poser({ 'src/a/index.ts': 'export const a = 4;\n' }, 'main bouge');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()[0]).toBe('feat: lot (demo-3)');
      expect(m.marquee('file')).toBe(true);
    },
    D
  );
  it(
    "critère 11: a branch whose installation fails once replaced on a main that moved leaves the queue, its ticket reopened with « Les dépendances de la copie ne s'installent pas. », without running its suites",
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', m.introuvable());
      m.livrer('demo-1');
      m.enFile('demo-2');
      const avant = m.appelsSuites();
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toContain('✗ agent/demo-2 sort de la file');
      expect(m.sujets()[0]).toBe('feat: lot (demo-1)');
      const t = m.bd('demo-2');
      expect(t.status).toBe('open');
      expect(t.labels).not.toContain('en-file');
      expect(t.comments.at(-1)!.text).toContain("Les dépendances de la copie ne s'installent pas.");
      expect(m.appelsSuites() - avant).toBe(0);
      expect(m.file().stdout).not.toContain('agent/demo-2');
    },
    D
  );
});
