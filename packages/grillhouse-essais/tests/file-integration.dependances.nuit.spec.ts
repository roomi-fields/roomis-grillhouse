// @poste: l'enveloppe bwrap, un serveur Temporal
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chantierDependances, serveurDeLaFileDIntegration } from './integration-essai.js';

// The integration queue (scripts/integration/file.mjs): the dependencies of its copy, which follow
// its lock file (grillhouse-3uv.74).
// The queue's interface is told in file-integration.nuit.spec.ts; the trial harness is
// ./integration-essai.ts, and the matter these files share ./file-integration-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-integration-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
serveurDeLaFileDIntegration(ESSAIS);

// grillhouse-3uv.74: the dependencies of the queue's copy follow its lock file of the moment: the
// branch replaced on main is installed there, through the one function of the replay
// (scripts/integration/rejeu.mjs), before the commands that regenerate its files; what the copy's
// node_modules holds is what its install put there (./integration-essai.ts, `installes`); npm runs
// offline. A branch that
// changes the lock file waits in the queue in the place of its integration (`enFile`), so the
// queue alone replays it.
describe('grillhouse-3uv.74 — the dependencies of the queue copy follow its lock file', () => {
  const D = 180_000;
  it(
    'a branch that adds a workspace, replaced on a main that moved, is installed in the copy of the queue, and enters',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket(
        'demo-2',
        m.fichiers({ ...m.initial, espaces: { ...m.initial.espaces, 'src/d': 'd' } })
      );
      m.livrer('demo-1');
      m.enFile('demo-2');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets().slice(0, 2)).toEqual(['feat: lot (demo-2)', 'feat: lot (demo-1)']);
      expect(m.bd('demo-2').status).toBe('closed');
      expect(m.installes('file').d).toBe('1.0.0');
    },
    D
  );
  it(
    'a branch that changes an external dependency, replaced on a main that moved, is installed at its version',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', m.fichiers({ ...m.initial, externe: '2.0.0' }));
      m.livrer('demo-1');
      m.enFile('demo-2');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()[0]).toBe('feat: lot (demo-2)');
      expect(m.installes('file')['ext-lib']).toBe('2.0.0');
    },
    D
  );
  it(
    'after a branch replaced that changed the lock file and left the queue on a red CI, the next replay installs again the dependencies of main',
    () => {
      const m = chantierDependances(ESSAIS);
      // The CI of the project, read by the fake gh: red for demo-2, green after.
      const ci = (conclusion: string) =>
        writeFileSync(
          path.join(m.bin, 'gh.json'),
          JSON.stringify({
            runs: [{ databaseId: 41, status: 'completed', conclusion }],
            vues: [{ status: 'completed', conclusion, jobs: [] }],
          })
        );
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', m.fichiers({ ...m.initial, externe: '2.0.0' }));
      m.livrer('demo-1');
      ci('success');
      expect(m.file().status).toBe(0);
      expect(m.sujets()[0]).toBe('feat: lot (demo-1)');
      m.enFile('demo-2');
      ci('failure');
      expect(m.file().status).toBe(0);
      expect(m.bd('demo-2').status).toBe('open');
      expect(m.sujets()[0]).toBe('feat: lot (demo-1)');
      expect(m.installes('file')['ext-lib']).toBe('2.0.0');
      m.poserMarque('file');
      ci('success');
      m.ticket('demo-3', { 'src/b/index.ts': 'export const b = 3;\n' });
      m.livrer('demo-3');
      m.poser({ 'src/c/index.ts': 'export const c = 4;\n' }, 'main bouge');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()[0]).toBe('feat: lot (demo-3)');
      expect(m.marquee('file')).toBe(false);
      expect(m.installes('file')['ext-lib']).toBe('1.0.0');
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
    "critère 11: a branch whose installation fails once replaced on a main that moved leaves the queue, its ticket reopened with « Les dépendances de la copie ne s'installent pas. »",
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', m.introuvable());
      m.livrer('demo-1');
      m.enFile('demo-2');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toContain('✗ agent/demo-2 sort de la file');
      expect(m.sujets()[0]).toBe('feat: lot (demo-1)');
      const t = m.bd('demo-2');
      expect(t.status).toBe('open');
      expect(t.labels).not.toContain('en-file');
      expect(t.comments.at(-1)!.text).toContain("Les dépendances de la copie ne s'installent pas.");
      expect(m.file().stdout).not.toContain('agent/demo-2');
    },
    D
  );
});
