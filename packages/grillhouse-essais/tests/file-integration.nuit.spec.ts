// @poste: l'enveloppe bwrap, un serveur Temporal
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chantier, serveurDeLaFileDIntegration } from './integration-essai.js';
import { LONG } from './file-integration-essai.js';
import { RACINE } from './cadre.js';

// grillhouse-3uv.63: the integration commits a ticket's lot on its branch agent/<ticket>, and a
// queue brings the branches onto main, one at a time, in their order of arrival (a merge queue:
// GitHub merge queue, bors, Gerrit's submit).
//
// The queue is the workflow of the queue of the project (`file:<racine>`,
// src/temporal/file/deroule.ts), played on a server of trial: each ticket the integration
// committed enters it as its circuit sends it, one at a time, in their order of arrival, and the
// harness waits for the issue of each (`file` of ./integration-essai.ts).
//
// This file: the queue brings the branches onto main, and the texts say it. A copy still in place, a ticket sent back and an empty branch: file-integration.renvois; the
// dependencies of the queue copy: file-integration.dependances; the status of the tests and the
// CI: file-integration.ci.
// The trial harness: ./integration-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-integration-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
serveurDeLaFileDIntegration(ESSAIS);
const lire = (rel: string) => readFileSync(path.join(RACINE, rel), 'utf8');

describe('grillhouse-3uv.63 — the queue brings the branches onto main', () => {
  it(
    'critère 3: a lone branch whose base is main enters by fast-forward, replaying nothing',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      const commit = m.sha('agent/demo-1');
      const avant = { suites: m.suites(), gardes: m.gardes() };
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sha('main')).toBe(commit);
      expect(m.sujets()).toEqual(['feat: lot (demo-1)', 'base']);
      expect({ suites: m.suites(), gardes: m.gardes() }).toEqual(avant);
    },
    LONG
  );
  it(
    'critère 3: the branches enter in their order of arrival, not in the order of their names',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.ticket('demo-3', { 'src/c/index.ts': 'export const c = 3;\n' });
      m.livrer('demo-2');
      m.livrer('demo-3');
      m.livrer('demo-1');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()).toEqual([
        'feat: lot (demo-1)',
        'feat: lot (demo-3)',
        'feat: lot (demo-2)',
        'base',
      ]);
    },
    LONG
  );
  it(
    'critère 4: a branch whose base main left is replaced on main, its `npm run verifier` (guards and suites) replayed there, and enters on green',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      const avant = { suites: m.suites(), gardes: m.gardes() };
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()).toEqual(['feat: lot (demo-2)', 'feat: lot (demo-1)', 'base']);
      // demo-2 sits on demo-1, with both lots in main's tree.
      expect(m.git('show', 'main:src/a/index.ts')).toBe('export const a = 1;\n');
      expect(m.git('show', 'main:src/b/index.ts')).toBe('export const b = 2;\n');
      // Replayed during the queue: one `npm run verifier`, its guards and its suites, without argument.
      expect(m.suites().slice(avant.suites.length)).toBe('[]');
      expect(m.gardes().slice(avant.gardes.length)).toBe('g');
    },
    LONG
  );
  it(
    'critère 5: a branch that does not replace on main leaves the queue, its ticket reopened with the files in conflict, and the queue goes on',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/a/index.ts': 'export const a = 2;\n' });
      m.ticket('demo-3', { 'src/c/index.ts': 'export const c = 3;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      m.livrer('demo-3');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()).toEqual(['feat: lot (demo-3)', 'feat: lot (demo-1)', 'base']);
      expect(m.git('show', 'main:src/a/index.ts')).toBe('export const a = 1;\n');
      const t = m.bd('demo-2');
      expect(t.status).toBe('open');
      expect(t.labels).not.toContain('en-file');
      expect(t.comments.at(-1).text).toContain('src/a/index.ts');
      expect(m.bd('demo-3').status).toBe('closed');
    },
    LONG
  );
  // Witness: BPScript (si61.8, 2026-10-20), the queue wrote under git's user, the author of the
  // supervisor and of the owner.
  it(
    'the queue writes at the ticket under its own author, `file`',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/a/index.ts': 'export const a = 2;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const c = m.bd('demo-2').comments.at(-1);
      expect(c?.text).toMatch(/^## Sortie de la file/);
      expect(c?.author).toBe('file');
    },
    LONG
  );
  it(
    'critère 5: a branch whose `npm run verifier` is red once replaced leaves the queue, its ticket reopened with the output of its tests, and the queue goes on',
    () => {
      const m = chantier(ESSAIS);
      // Each lot alone is green; both together fail src/b/ab.spec.ts > ensemble.
      m.poser(
        {
          'REGLES.json': JSON.stringify([
            { si: ['src/a/A', 'src/b/B'], rouge: 'src/b/ab.spec.ts > ensemble' },
          ]),
        },
        'regles'
      );
      m.ticket('demo-1', { 'src/a/A': 'a\n' });
      m.ticket('demo-2', { 'src/b/B': 'b\n' });
      m.ticket('demo-3', { 'src/c/index.ts': 'export const c = 3;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      m.livrer('demo-3');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()).toEqual(['feat: lot (demo-3)', 'feat: lot (demo-1)', 'regles', 'base']);
      const t = m.bd('demo-2');
      expect(t.status).toBe('open');
      expect(t.labels).not.toContain('en-file');
      expect(t.comments.at(-1).text).toContain(
        'ses tests sont rouges une fois la branche replacée.'
      );
      expect(t.comments.at(-1).text).toContain('✗ src/b/ab.spec.ts > ensemble');
      expect(m.bd('demo-3').status).toBe('closed');
    },
    LONG
  );
  // « À repasser » (75: the wait for the lock of the machine, or for room in the temporary
  // directory, reached its bound, scripts/verrou-de-machine.mjs): neither green nor red. The branch stays in the queue,
  // its tickets written to, neither reopened nor closed, and the next queue takes it again.
  it(
    'a branch whose `npm run verifier` is à repasser (75) once replaced stays in the queue, and the next queue takes it',
    () => {
      const m = chantier(ESSAIS);
      const suites = (code: number) =>
        `import fs from 'node:fs';\nfs.appendFileSync(process.env.PRINCIPAL + '.suites', '[]');\nprocess.exit(fs.existsSync('src/a/A') && fs.existsSync('src/b/B') ? ${code} : 0);\n`;
      m.poser({ 'suites.mjs': suites(75) }, 'repasser');
      m.ticket('demo-1', { 'src/a/A': 'a\n' });
      m.ticket('demo-2', { 'src/b/B': 'b\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()).toEqual(['feat: lot (demo-1)', 'repasser', 'base']);
      const t = m.bd('demo-2');
      expect(t.status).not.toBe('open');
      expect(t.status).not.toBe('closed');
      expect(t.labels).toContain('en-file');
      expect(t.comments.at(-1).text).toContain('à repasser');
      m.poser({ 'suites.mjs': suites(0) }, 'au repos');
      const r2 = m.file();
      expect(r2.status, r2.stdout + r2.stderr).toBe(0);
      expect(m.sujets()[0]).toBe('feat: lot (demo-2)');
      expect(m.bd('demo-2').status).toBe('closed');
    },
    LONG
  );
  it(
    'critère 5: a branch whose guards refuse once replaced (its `npm run verifier` red) leaves the queue, its ticket reopened',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      m.poser({ GARDE_ROUGE: '' }, 'garde rouge');
      const avant = m.suites();
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()[0]).toBe('garde rouge');
      expect(m.bd('demo-2').status).toBe('open');
      expect(m.bd('demo-2').labels).not.toContain('en-file');
      // The guards come first in `npm run verifier`: red, they stop it before the suites.
      expect(m.suites()).toBe(avant);
    },
    LONG
  );
  it(
    'critère 6: at its entry on main, the ticket closes « intégré : <commit> » and its branch is deleted',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      expect(m.file().status).toBe(0);
      const sur = (sujet: string) =>
        m
          .git('log', '--format=%H %s', 'main')
          .split('\n')
          .find(l => l.endsWith(sujet))!
          .split(' ')[0];
      for (const [id, sujet] of [
        ['demo-1', 'feat: lot (demo-1)'],
        ['demo-2', 'feat: lot (demo-2)'],
      ]) {
        const t = m.bd(id);
        expect(t.status).toBe('closed');
        expect(t.close_reason).toMatch(/^intégré : [0-9a-f]{7,40}\b/);
        const court = t.close_reason.match(/^intégré : ([0-9a-f]+)/)[1];
        expect(sur(sujet).startsWith(court)).toBe(true);
        expect(m.existe(`refs/heads/agent/${id}`)).toBe(false);
      }
    },
    LONG
  );
  // grillhouse-3uv.94: the working directory of a ticket's circuit (`<copie>.travail`) lives as
  // long as the ticket, as the workspace of a pipeline, cleaned at the end of the pipeline.
  it(
    'grillhouse-3uv.94 critère 3: the integration removes the copy and keeps the working directory of the ticket; the queue removes it at the closure, and a ticket sent back keeps its own',
    () => {
      const m = chantier(ESSAIS);
      const travail = (id: string, copie: string) => {
        const t = `${copie}.travail`;
        mkdirSync(t);
        writeFileSync(path.join(t, 'consigne-1.md'), `TON TICKET : ${id}\n`);
        return t;
      };
      const t1 = travail(
        'demo-1',
        m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' })
      );
      const t2 = travail(
        'demo-2',
        m.ticket('demo-2', { 'src/a/index.ts': 'export const a = 2;\n' })
      );
      m.livrer('demo-1');
      m.livrer('demo-2');
      expect(existsSync(t1)).toBe(true);
      expect(existsSync(t2)).toBe(true);
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.bd('demo-1').status).toBe('closed');
      expect(existsSync(t1)).toBe(false);
      expect(m.bd('demo-2').status).toBe('open');
      expect(readFileSync(path.join(t2, 'consigne-1.md'), 'utf8')).toBe('TON TICKET : demo-2\n');
    },
    LONG
  );
  it(
    'critère 7: after each entry the queue pushes main to origin main, without the key',
    () => {
      const m = chantier(ESSAIS);
      const trace = path.join(m.bin, 'poussees');
      writeFileSync(
        path.join(m.distant, 'hooks', 'pre-receive'),
        `#!/bin/sh\nwhile read a n r; do echo "$n $r" >> ${trace}; done\n`,
        { mode: 0o755 }
      );
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      expect(m.file().status).toBe(0);
      expect(m.distantSha('main')).toBe(m.sha('main'));
      const poussees = readFileSync(trace, 'utf8').trim().split('\n');
      expect(poussees).toEqual([
        `${m.sha('main~1')} refs/heads/main`,
        `${m.sha('main')} refs/heads/main`,
      ]);
    },
    LONG
  );
  it(
    'critère 7: the queue pushes main to the branch grillhouse.poussee.commit names',
    () => {
      const m = chantier(ESSAIS, { grillhouse: { poussee: { commit: 'travail' } } });
      const base = m.distantSha('main');
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      expect(m.file().status).toBe(0);
      expect(m.distantSha('travail')).toBe(m.sha('main'));
      expect(m.distantSha('main')).toBe(base);
    },
    LONG
  );
  it(
    'critère 7: a refused push is written to the ticket and does not stop the queue',
    () => {
      const m = chantier(ESSAIS);
      writeFileSync(
        path.join(m.distant, 'hooks', 'pre-receive'),
        '#!/bin/sh\necho "poussée refusée par le dépôt distant" >&2\nexit 1\n',
        { mode: 0o755 }
      );
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()).toEqual(['feat: lot (demo-2)', 'feat: lot (demo-1)', 'base']);
      for (const id of ['demo-1', 'demo-2']) {
        expect(m.bd(id).status).toBe('closed');
        expect(
          m
            .bd(id)
            .comments.map((c: { text: string }) => c.text)
            .join('\n')
        ).toMatch(/pouss/i);
      }
    },
    LONG
  );
  it('an empty queue exits 0 and leaves main as it is', () => {
    const m = chantier(ESSAIS);
    const r = m.file();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(m.sujets()).toEqual(['base']);
  });
});

// grillhouse-3uv.63 critères 11 et 12: the old way disappears, and the texts say the new one.
describe('grillhouse-3uv.63 — the old way is gone, the texts say the new one', () => {
  it('critère 11: no script nor skill keeps the refusal « une intégration tourne déjà » or « main a bougé »', () => {
    for (const f of [
      'packages/grillhouse/scripts/integration/integrer.mjs',
      'packages/grillhouse/scripts/nuit.sh',
      'mods/grillhouse/skills/pitmaster/SKILL.md',
    ]) {
      const texte = lire(f);
      expect(texte, f).not.toMatch(/Une intégration tourne/);
      expect(texte, f).not.toMatch(/main a bougé pendant l'intégration/);
    }
  });
  it('critère 12: STRUCTURE.md lists the queue next to the integration', () => {
    expect(lire('STRUCTURE.md')).toMatch(/file\.mjs/);
  });
  it('critère 12: the circuit, which launches the queue, and the supervisor name the queue', () => {
    for (const f of [
      'packages/grillhouse/scripts/circuit.mjs',
      'mods/grillhouse/skills/pitmaster/SKILL.md',
    ]) {
      expect(lire(f), f).toMatch(/file\.mjs|en-file/);
    }
  });
});
