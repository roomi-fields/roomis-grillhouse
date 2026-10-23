import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chantier, FILE, INTEGRER_SCRIPT, type Chantier } from './integration-essai.js';
import { LONG } from './file-integration-essai.js';

// grillhouse-3uv.63: the integration commits a ticket's lot on its branch agent/<ticket>, and a
// queue brings the branches onto main, one at a time, in their order of arrival (a merge queue:
// GitHub merge queue, bors, Gerrit's submit).
//
// The queue's interface, fixed by these tests:
//   node scripts/integration/file.mjs
// run from the main tree, without argument. It takes every branch waiting, one at a time, until
// none is left, then exits 0, whatever became of each branch (entered, or out of the queue with
// its ticket reopened). A queue launched while another runs exits 0 at once, refusing nothing:
// the running queue takes the branch. Any argument is a usage error: exit 2, the usage on stderr.
//
// This file: the queue brings the branches onto main, launched from a copy too, and the texts say
// it. A copy still in place, a ticket sent back and an empty branch: file-integration.renvois; the
// dependencies of the queue copy: file-integration.dependances; the status of the tests and the
// CI: file-integration.ci.
// The trial harness: ./integration-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-integration-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const RACINE = path.resolve(__dirname, '../../../..');
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
  // « À repasser » (75, scripts/verifier.mjs): neither green nor red. The branch stays in the queue,
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
  it(
    'critère 8: a queue launched while another runs refuses nothing, and the running queue takes the branch that arrived',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.livrer('demo-1');
      // During the push of demo-1's entry, demo-2 is integrated (its copy removed by the
      // integration, critère 15) and a second queue launched; the remote's hook does it once,
      // out of git's environment, and records the exit codes.
      const pendant = path.join(m.bin, 'pendant.mjs');
      const sorties = path.join(m.bin, 'sorties');
      writeFileSync(
        pendant,
        `import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
if (!existsSync(${JSON.stringify(sorties)})) {
  writeFileSync(${JSON.stringify(sorties)}, '');
  const env = ${JSON.stringify(m.env)};
  const lancer = a => spawnSync('node', a, { cwd: ${JSON.stringify(m.repo)}, env, encoding: 'utf8', timeout: 60000 });
  const i = lancer(${JSON.stringify([INTEGRER_SCRIPT, ...m.argsIntegrer('demo-2')])});
  const f = lancer([${JSON.stringify(FILE)}]);
  writeFileSync(${JSON.stringify(sorties)}, JSON.stringify({ integrer: i.status, file: f.status, sortie: i.stdout + i.stderr + f.stdout + f.stderr }));
}
`
      );
      writeFileSync(
        path.join(m.distant, 'hooks', 'pre-receive'),
        `#!/bin/sh\ncat > /dev/null\nenv -i PATH="$PATH" HOME="$HOME" node ${pendant}\nexit 0\n`,
        { mode: 0o755 }
      );
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const s = JSON.parse(readFileSync(sorties, 'utf8')) as {
        integrer: number;
        file: number;
        sortie: string;
      };
      expect(s.integrer, s.sortie).toBe(0);
      expect(s.file, s.sortie).toBe(0);
      expect(m.sujets()).toEqual(['feat: lot (demo-2)', 'feat: lot (demo-1)', 'base']);
      expect(m.bd('demo-2').status).toBe('closed');
      expect(m.distantSha('main')).toBe(m.sha('main'));
      expect(
        m
          .bd('demo-1')
          .comments.map((c: { text: string }) => c.text)
          .join('\n')
      ).not.toMatch(/pouss/i);
    },
    LONG
  );
  it('the queue takes no argument: exit 2, the usage on stderr', () => {
    const m = chantier(ESSAIS);
    const r = m.file('--ticket', 'demo-1');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage/i);
  });
  it('an empty queue exits 0 and leaves main as it is', () => {
    const m = chantier(ESSAIS);
    const r = m.file();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(m.sujets()).toEqual(['base']);
  });
});

// grillhouse-3uv.63 critère 24: the queue, launched from a copy, works on the main tree (found by
// git's common directory, as the launcher finds it).
describe('grillhouse-3uv.63 — the queue launched from a copy works on the main tree', () => {
  const fileDepuis = (m: Chantier, dir: string) =>
    spawnSync('node', [FILE], { cwd: dir, encoding: 'utf8', env: m.env, timeout: LONG });
  // A copy of another ticket, made as the launcher makes it, without local work.
  const autreCopie = (m: Chantier) => {
    const copie = m.copieDe('demo-9');
    m.git('worktree', 'add', '-q', '-b', 'agent/demo-9', copie, 'HEAD');
    return copie;
  };
  it(
    'critère 24: launched from a copy on agent/<ticket>, the queue moves main forward and leaves that branch where it is',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      const copie = autreCopie(m);
      m.livrer('demo-1');
      const commit = m.sha('agent/demo-1');
      const neuf = m.sha('agent/demo-9');
      const r = fileDepuis(m, copie);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sha('main')).toBe(commit);
      expect(m.sha('agent/demo-9')).toBe(neuf);
      expect(m.gitDans(copie, 'rev-parse', 'HEAD').trim()).toBe(neuf);
      expect(m.bd('demo-1').status).toBe('closed');
      expect(m.distantSha('main')).toBe(commit);
    },
    LONG
  );
  it(
    'critère 24: launched from a directory deep in a copy, with main moved: the branches are replaced on main, the copy and its branch untouched',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      const copie = autreCopie(m);
      m.livrer('demo-1');
      m.livrer('demo-2');
      const neuf = m.sha('agent/demo-9');
      const r = fileDepuis(m, path.join(copie, 'src/a'));
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()).toEqual(['feat: lot (demo-2)', 'feat: lot (demo-1)', 'base']);
      expect(m.sha('agent/demo-9')).toBe(neuf);
      expect(m.gitDans(copie, 'status', '--porcelain').trim()).toBe('');
      expect(existsSync(path.join(copie, '.claude/worktrees/file'))).toBe(false);
      expect(m.bd('demo-2').status).toBe('closed');
    },
    LONG
  );
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
