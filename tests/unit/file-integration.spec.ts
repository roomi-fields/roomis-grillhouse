import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  chantier,
  chantierDependances,
  construireParLiens,
  FILE,
  poserLies,
  INTEGRER_SCRIPT,
  type Chantier,
} from './integration-essai.js';
import { CODE_COPIE } from '../../scripts/enveloppe/codes.mjs';

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

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-integration-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 120_000;
const RACINE = path.resolve(__dirname, '../..');
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

// grillhouse-3uv.63 critères 15, 16 et 19: the queue and a branch whose copy is still in place,
// and an integration of several tickets.
describe('grillhouse-3uv.63 — a copy still in place, several tickets in one branch', () => {
  const commentaires = (m: Chantier, id: string) =>
    m
      .bd(id)
      .comments.map(c => c.text)
      .join('\n');
  it(
    'critère 15 et 16: a locked copy keeps its branch in the queue; at its entry the queue writes the branch it cannot delete, closes the ticket and goes on',
    () => {
      const m = chantier(ESSAIS);
      const copie = m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.git('worktree', 'lock', '--reason', 'en cours', copie);
      m.integrer('demo-1');
      m.livrer('demo-2');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()).toEqual(['feat: lot (demo-2)', 'feat: lot (demo-1)', 'base']);
      const t = m.bd('demo-1');
      expect(t.status).toBe('closed');
      expect(t.close_reason).toMatch(/^intégré : [0-9a-f]{7,40}\b/);
      expect(commentaires(m, 'demo-1')).toMatch(/agent\/demo-1/);
      expect(m.existe('refs/heads/agent/demo-1')).toBe(true);
      expect(m.bd('demo-2').status).toBe('closed');
      expect(m.existe('refs/heads/agent/demo-2')).toBe(false);
    },
    LONG
  );
  it(
    'critère 16: a branch replaced on main whose copy was made again: the queue writes it to the ticket, closes it and goes on',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.ticket('demo-3', { 'src/c/index.ts': 'export const c = 3;\n' });
      m.livrer('demo-2');
      m.livrer('demo-1');
      m.livrer('demo-3');
      // demo-1's copy is made again on its branch after its integration, as by a relaunch.
      m.git('worktree', 'add', '-q', m.copieDe('demo-1'), 'agent/demo-1');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()).toEqual([
        'feat: lot (demo-3)',
        'feat: lot (demo-1)',
        'feat: lot (demo-2)',
        'base',
      ]);
      expect(m.bd('demo-1').status).toBe('closed');
      expect(m.bd('demo-1').close_reason).toMatch(/^intégré : /);
      expect(commentaires(m, 'demo-1')).toMatch(/agent\/demo-1/);
      expect(m.bd('demo-3').status).toBe('closed');
    },
    LONG
  );
  it(
    'critère 19: a branch carrying several tickets enters once, and every ticket named closes « intégré : »',
    () => {
      const m = chantier(ESSAIS);
      m.ticket(
        'demo-1',
        { 'src/a/index.ts': 'export const a = 1;\n' },
        'feat: lot (demo-1, demo-2)'
      );
      m.inscrire('demo-2');
      m.livrer('demo-1', '--ticket', 'demo-2');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()).toEqual(['feat: lot (demo-1, demo-2)', 'base']);
      for (const id of ['demo-1', 'demo-2']) {
        expect(m.bd(id).status, id).toBe('closed');
        expect(m.bd(id).close_reason, id).toMatch(/^intégré : [0-9a-f]{7,40}\b/);
      }
      expect(m.existe('refs/heads/agent/demo-1')).toBe(false);
    },
    LONG
  );
  // grillhouse-3uv.63 critère 20: a branch of several tickets leaving the queue sends back every
  // ticket named, each losing en-file and reopened with the comment of critère 5.
  const renvoiCommun = (m: Chantier, raison: string) => {
    for (const id of ['demo-1', 'demo-2']) {
      const t = m.bd(id);
      expect(t.status, id).toBe('open');
      expect(t.labels, id).not.toContain('en-file');
      expect(t.comments.at(-1)!.text, id).toContain(raison);
    }
  };
  it(
    'critère 20: a branch of several tickets that does not replace on main: every ticket named loses en-file and reopens naming the files in conflict',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-0', { 'src/a/index.ts': 'export const a = 5;\n' });
      m.ticket(
        'demo-1',
        { 'src/a/index.ts': 'export const a = 1;\n' },
        'feat: lot (demo-1, demo-2)'
      );
      m.inscrire('demo-2');
      m.ticket('demo-3', { 'src/c/index.ts': 'export const c = 3;\n' });
      m.livrer('demo-0');
      m.livrer('demo-1', '--ticket', 'demo-2');
      m.livrer('demo-3');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()).toEqual(['feat: lot (demo-3)', 'feat: lot (demo-0)', 'base']);
      renvoiCommun(m, 'src/a/index.ts');
      expect(m.existe('refs/heads/agent/demo-1')).toBe(true);
      expect(m.bd('demo-3').status).toBe('closed');
    },
    LONG
  );
  it(
    'critère 20: a branch of several tickets whose `npm run verifier` is red once replaced: every ticket named loses en-file and reopens with the output of its tests',
    () => {
      const m = chantier(ESSAIS);
      m.poser(
        {
          'REGLES.json': JSON.stringify([
            { si: ['src/a/A', 'src/b/B'], rouge: 'src/b/ab.spec.ts > ensemble' },
          ]),
        },
        'regles'
      );
      m.ticket('demo-0', { 'src/a/A': 'a\n' });
      m.ticket('demo-1', { 'src/b/B': 'b\n' }, 'feat: lot (demo-1, demo-2)');
      m.inscrire('demo-2');
      m.livrer('demo-0');
      m.livrer('demo-1', '--ticket', 'demo-2');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()).toEqual(['feat: lot (demo-0)', 'regles', 'base']);
      renvoiCommun(m, 'src/b/ab.spec.ts > ensemble');
    },
    LONG
  );
});

// grillhouse-3uv.63 critère 18: a branch out of the queue stays in place; at the relaunch of its
// ticket, the launcher (scripts/enveloppe/lancer.sh) makes the copy again on main, puts the
// branch's lot back there as local work (conflicts marked) and brings the branch back to main;
// the reintegration makes the ticket's one commit again, and no agent commits.
describe('grillhouse-3uv.63 — a ticket sent back by the queue, relaunched', () => {
  // demo-1 enters main; demo-2, made from the same base, touches the same line of src/a and a
  // file of src/b: the queue sends it back on a conflict.
  const conflit = () => {
    const m = chantier(ESSAIS);
    m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
    m.ticket('demo-2', {
      'src/a/index.ts': 'export const a = 2;\n',
      'src/b/index.ts': 'export const b = 2;\n',
      'src/b/neuf.ts': 'export const n = 2;\n',
    });
    m.livrer('demo-1');
    m.livrer('demo-2');
    return m;
  };
  it(
    'critère 18: a branch out of the queue stays in place, its commit on it',
    () => {
      const m = conflit();
      expect(m.file().status).toBe(0);
      expect(m.bd('demo-2').status).toBe('open');
      expect(m.existe('refs/heads/agent/demo-2')).toBe(true);
      expect(m.sujets('agent/demo-2')[0]).toBe('feat: lot (demo-2)');
      expect(m.git('show', 'agent/demo-2:src/b/neuf.ts')).toBe('export const n = 2;\n');
    },
    LONG
  );

  // The state the queue leaves, made by the test (critère 5): demo-2's lot committed on its
  // branch over the base, its copy removed, its ticket open; main moved on with <surMain>.
  const renvoye = (lot: Record<string, string>, surMain: Record<string, string>) => {
    const m = chantier(ESSAIS);
    m.ticket('demo-2', lot);
    m.renvoyer('demo-2');
    m.poser(surMain, 'main avance');
    return m;
  };
  const verifierRelance = (m: Chantier) => {
    const copie = m.copieDe('demo-2');
    const r = m.lancer('demo-2');
    expect(
      r.status,
      r.stdout + r.stderr + (existsSync(`${copie}.log`) ? readFileSync(`${copie}.log`, 'utf8') : '')
    ).not.toBe(CODE_COPIE);
    expect(existsSync(copie)).toBe(true);
    // The copy is on agent/demo-2, brought back to main: no commit of the ticket is left on it.
    expect(m.gitDans(copie, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('agent/demo-2');
    expect(m.sha('agent/demo-2')).toBe(m.sha('main'));
    expect(m.gitDans(copie, 'rev-parse', 'HEAD').trim()).toBe(m.sha('main'));
    // The agent's session starts in that copy.
    expect(m.sessions()).toContain(copie);
    return copie;
  };
  it(
    'critère 18: relaunched after a conflict, the copy is made again on main, the branch brought back to main, the lot as local work with its conflicts marked',
    () => {
      const m = renvoye(
        {
          'src/a/index.ts': 'export const a = 2;\n',
          'src/b/index.ts': 'export const b = 2;\n',
          'src/b/neuf.ts': 'export const n = 2;\n',
        },
        { 'src/a/index.ts': 'export const a = 1;\n' }
      );
      const copie = verifierRelance(m);
      const a = readFileSync(path.join(copie, 'src/a/index.ts'), 'utf8');
      expect(a).toMatch(/^<<<<<<< /m);
      expect(a).toMatch(/^=======$/m);
      expect(a).toMatch(/^>>>>>>> /m);
      expect(a).toContain('export const a = 1;');
      expect(a).toContain('export const a = 2;');
      // The rest of the lot is there, as local work.
      expect(readFileSync(path.join(copie, 'src/b/index.ts'), 'utf8')).toBe(
        'export const b = 2;\n'
      );
      expect(readFileSync(path.join(copie, 'src/b/neuf.ts'), 'utf8')).toBe('export const n = 2;\n');
    },
    LONG
  );
  it(
    'critère 18: relaunched after a new failure (no conflict), the lot comes back whole as local work, nothing marked',
    () => {
      const m = renvoye(
        { 'src/b/index.ts': 'export const b = 2;\n', 'src/b/neuf.ts': 'export const n = 2;\n' },
        { 'src/a/index.ts': 'export const a = 1;\n' }
      );
      const copie = verifierRelance(m);
      expect(readFileSync(path.join(copie, 'src/b/index.ts'), 'utf8')).toBe(
        'export const b = 2;\n'
      );
      expect(readFileSync(path.join(copie, 'src/b/neuf.ts'), 'utf8')).toBe('export const n = 2;\n');
      expect(readFileSync(path.join(copie, 'src/a/index.ts'), 'utf8')).toBe(
        'export const a = 1;\n'
      );
      expect(m.gitDans(copie, 'diff', 'HEAD', '--', 'src/b/index.ts')).toMatch(
        /^\+export const b = 2;$/m
      );
    },
    LONG
  );
  it(
    'critère 18: a lot that deletes a file comes back with the file deleted',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-2', { 'src/c/index.ts': null, 'src/b/neuf.ts': 'export const n = 2;\n' });
      m.renvoyer('demo-2');
      m.poser({ 'src/a/index.ts': 'export const a = 1;\n' }, 'main avance');
      const copie = verifierRelance(m);
      expect(existsSync(path.join(copie, 'src/c/index.ts'))).toBe(false);
      expect(readFileSync(path.join(copie, 'src/b/neuf.ts'), 'utf8')).toBe('export const n = 2;\n');
    },
    LONG
  );
  it(
    'critère 18: the reintegration of the relaunched ticket leaves one commit of it on its branch, and it enters main once',
    () => {
      const m = conflit();
      expect(m.file().status).toBe(0);
      expect(m.bd('demo-2').status).toBe('open');
      const copie = m.copieDe('demo-2');
      expect(m.lancer('demo-2').status).not.toBe(CODE_COPIE);
      // The agents resolve the conflict and make their lot again, without committing.
      writeFileSync(path.join(copie, 'src/a/index.ts'), 'export const a = 12;\n');
      m.relots('demo-2', ['src/a/index.ts', 'src/b/index.ts', 'src/b/neuf.ts']);
      m.accepter('demo-2');
      const r = m.integrer('demo-2');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.git('rev-list', '--count', 'main..agent/demo-2').trim()).toBe('1');
      expect(m.sujets('agent/demo-2')[0]).toBe('feat: lot (demo-2)');
      expect(m.git('show', 'agent/demo-2:src/a/index.ts')).toBe('export const a = 12;\n');
      const f = m.file();
      expect(f.status, f.stdout + f.stderr).toBe(0);
      expect(m.sujets().filter(x => x.includes('(demo-2)'))).toEqual(['feat: lot (demo-2)']);
      expect(m.git('show', 'main:src/a/index.ts')).toBe('export const a = 12;\n');
      expect(m.bd('demo-2').status).toBe('closed');
    },
    LONG
  );

  // grillhouse-3uv.63 critère 21: the relaunch of a ticket whose branch exists without a copy and
  // without any commit ahead of main: the launcher makes the copy on that branch, brought back to
  // main, and the session starts.
  it(
    'critère 21: a branch at main, without a copy: the copy is made on it and the session starts',
    () => {
      const m = chantier(ESSAIS);
      m.inscrire('demo-2');
      m.git('branch', 'agent/demo-2');
      const copie = verifierRelance(m);
      expect(m.gitDans(copie, 'status', '--porcelain').trim()).toBe('');
    },
    LONG
  );
  it(
    'critère 21: a branch behind main, nothing ahead, without a copy: the branch is brought back to main, the copy made on it, the session starts',
    () => {
      const m = chantier(ESSAIS);
      m.inscrire('demo-2');
      m.git('branch', 'agent/demo-2');
      m.poser({ 'src/a/index.ts': 'export const a = 1;\n' }, 'main avance');
      const copie = verifierRelance(m);
      expect(readFileSync(path.join(copie, 'src/a/index.ts'), 'utf8')).toBe(
        'export const a = 1;\n'
      );
      expect(m.gitDans(copie, 'status', '--porcelain').trim()).toBe('');
    },
    LONG
  );
});

// grillhouse-3uv.63 critère 23: a branch in the queue with nothing ahead of main does not enter: the
// queue takes it out without closing its ticket, and writes it to the ticket. The launcher refuses
// to relaunch a ticket whose branch is still in the queue.
describe('grillhouse-3uv.63 — a branch with nothing ahead of main does not enter', () => {
  const commentaires = (m: Chantier, id: string) => m.bd(id).comments.map(c => c.text);
  it(
    'critère 23: a branch in the queue at main does not enter: its ticket is not closed, a comment says it, and the next branch enters',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      // demo-1's branch brought back to main while it waits: nothing ahead of main.
      m.git('branch', '-f', 'agent/demo-1', 'main');
      const avant = commentaires(m, 'demo-1').length;
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()).toEqual(['feat: lot (demo-2)', 'base']);
      const t = m.bd('demo-1');
      expect(t.status).not.toBe('closed');
      expect(t.close_reason ?? '').not.toMatch(/intégré/);
      expect(m.appels()).not.toMatch(/^close demo-1\b/m);
      const neufs = commentaires(m, 'demo-1').slice(avant);
      expect(neufs.join('\n')).toMatch(/agent\/demo-1/);
      expect(m.bd('demo-2').status).toBe('closed');
    },
    LONG
  );
  it(
    'critère 23: a branch in the queue behind main, nothing ahead, does not enter and its ticket is not closed',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      m.git('branch', '-f', 'agent/demo-1', 'main');
      m.poser({ 'src/c/index.ts': 'export const c = 9;\n' }, 'main avance');
      const tete = m.sha('main');
      const avant = commentaires(m, 'demo-1').length;
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sha('main')).toBe(tete);
      expect(m.bd('demo-1').status).not.toBe('closed');
      expect(commentaires(m, 'demo-1').slice(avant).join('\n')).toMatch(/agent\/demo-1/);
    },
    LONG
  );
  it(
    'critère 23: the branch taken out is out of the queue: the next queue writes nothing more about it',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      m.git('branch', '-f', 'agent/demo-1', 'main');
      expect(m.file().status).toBe(0);
      const apres = commentaires(m, 'demo-1').length;
      expect(apres).toBeGreaterThan(1);
      expect(m.file().status).toBe(0);
      expect(commentaires(m, 'demo-1').length).toBe(apres);
      expect(m.bd('demo-1').status).not.toBe('closed');
    },
    LONG
  );
  // The launcher's log of <id> (.claude/worktrees/<ticket>.log), empty when absent.
  const journalDe = (m: Chantier, id: string) => {
    const journal = `${m.copieDe(id)}.log`;
    return existsSync(journal) ? readFileSync(journal, 'utf8') : '';
  };
  it(
    'critère 23: the launcher refuses to relaunch a ticket whose branch is still in the queue: no copy, no session, the branch untouched, and it still enters',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      m.poser({ 'src/c/index.ts': 'export const c = 9;\n' }, 'main avance');
      const commit = m.sha('agent/demo-1');
      const r = m.lancer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(CODE_COPIE);
      expect(journalDe(m, 'demo-1')).toMatch(/file d'intégration/);
      expect(m.sessions()).toEqual([]);
      expect(existsSync(m.copieDe('demo-1'))).toBe(false);
      expect(m.sha('agent/demo-1')).toBe(commit);
      const f = m.file();
      expect(f.status, f.stdout + f.stderr).toBe(0);
      expect(m.sujets()[0]).toBe('feat: lot (demo-1)');
      expect(m.bd('demo-1').status).toBe('closed');
    },
    LONG
  );
  it(
    'critère 23: the launcher refuses too when the copy of the ticket in the queue is still in place (locked at its integration)',
    () => {
      const m = chantier(ESSAIS);
      const copie = m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.git('worktree', 'lock', '--reason', 'en cours', copie);
      expect(m.integrer('demo-1').status).toBe(0);
      expect(existsSync(copie)).toBe(true);
      const commit = m.sha('agent/demo-1');
      const r = m.lancer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(CODE_COPIE);
      expect(journalDe(m, 'demo-1')).toMatch(/file d'intégration/);
      expect(m.sessions()).toEqual([]);
      expect(m.sha('agent/demo-1')).toBe(commit);
    },
    LONG
  );
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
      'scripts/integration/integrer.mjs',
      'scripts/nuit.sh',
      '.claude/skills/integrateur/SKILL.md',
      '.claude/skills/chef-de-chantier/SKILL.md',
      '.claude/skills/pitmaster/SKILL.md',
    ]) {
      const texte = lire(f);
      expect(texte, f).not.toMatch(/Une intégration tourne/);
      expect(texte, f).not.toMatch(/main a bougé pendant l'intégration/);
    }
  });
  it('critère 11: the chef de chantier no longer pushes main', () => {
    const chef = lire('.claude/skills/chef-de-chantier/SKILL.md');
    expect(chef).not.toMatch(/git push origin main/);
  });
  it('critère 12: STRUCTURE.md lists the queue next to the integration', () => {
    expect(lire('STRUCTURE.md')).toMatch(/file\.mjs/);
  });
  it('critère 12: the integrateur skill says the commit on agent/<ticket> and launches the queue', () => {
    const s = lire('.claude/skills/integrateur/SKILL.md');
    expect(s).toMatch(/agent\/<ticket>/);
    expect(s).toMatch(/node scripts\/integration\/file\.mjs/);
    expect(s).toMatch(/en-file/);
  });
  it('critère 12: the chef de chantier and the supervisor name the queue', () => {
    for (const f of [
      '.claude/skills/chef-de-chantier/SKILL.md',
      '.claude/skills/pitmaster/SKILL.md',
    ]) {
      expect(lire(f), f).toMatch(/file\.mjs|en-file/);
    }
  });
});

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

// grillhouse-3uv.56 critères 11 and 21: a failed installation of the replay copy comes up in one
// form, the refusals of the replay module; the queue judges `npm run verifier`, the guards included, as
// integrer.mjs does, by its exit code. Guards that pass, whatever text they write, are green;
// guards that fail, whatever text they write, make the tests red.
const GARDES_BAVARDES = `import fs from 'node:fs';
fs.appendFileSync(process.env.PRINCIPAL + '.gardes', 'g');
process.stderr.write("Les dépendances de la copie ne s'installent pas.\\n");
process.exit(fs.existsSync('GARDE_ROUGE') ? 1 : 0);
`;
describe('grillhouse-3uv.56 critères 11 and 21 — the queue judges the tests by their status', () => {
  it(
    'critère 21: guards that pass (exit 0) while writing the text of an installation refusal let a replaced branch enter',
    () => {
      const m = chantier(ESSAIS);
      m.poser({ 'gardes.mjs': GARDES_BAVARDES }, 'gardes bavardes');
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      const gardes = m.gardes();
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.gardes().length).toBeGreaterThan(gardes.length);
      expect(m.sujets().slice(0, 2)).toEqual(['feat: lot (demo-2)', 'feat: lot (demo-1)']);
      expect(m.bd('demo-2').status).toBe('closed');
    },
    LONG
  );
  it(
    'critère 21: guards that fail while writing the text of an installation refusal take the branch out as red tests',
    () => {
      const m = chantier(ESSAIS);
      m.poser({ 'gardes.mjs': GARDES_BAVARDES }, 'gardes bavardes');
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.ticket('demo-2', { 'src/b/index.ts': 'export const b = 2;\n' });
      m.livrer('demo-1');
      m.livrer('demo-2');
      m.poser({ GARDE_ROUGE: '' }, 'garde rouge');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets()[0]).toBe('garde rouge');
      const t = m.bd('demo-2');
      expect(t.status).toBe('open');
      const refus = t.comments.at(-1)!.text;
      expect(refus).toContain('ses tests sont rouges une fois la branche replacée.');
      expect(refus).not.toContain("Le verrou de la branche replacée ne s'installe pas.");
    },
    LONG
  );
});
