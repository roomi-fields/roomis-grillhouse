import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chantier, type Chantier } from './integration-essai.js';
import { LONG } from './file-integration-essai.js';
import { enProcessus, valeursDe } from './cadre.js';

const { CODE_COPIE } = valeursDe('scripts/enveloppe/codes.mjs', ['CODE_COPIE']) as {
  CODE_COPIE: number;
};
const lireEntrees = enProcessus<{ fichier: string; branche: string; ticket: string }[]>(
  'scripts/integration/file-attente.mjs',
  'lireEntrees'
);

// The integration queue (scripts/integration/file.mjs, grillhouse-3uv.63): a copy still in place,
// a ticket sent back and relaunched, a branch with nothing ahead of main.
// The queue's interface is told in file-integration.nuit.spec.ts; the trial harness is
// ./integration-essai.ts, and the matter these files share ./file-integration-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-integration-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// grillhouse-3uv.63 critères 15 et 16: the queue and a branch whose copy is still in place; an
// entry carries one ticket.
describe('grillhouse-3uv.63 — a copy still in place, one ticket per entry', () => {
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
    'an entry of the queue carries the branch and its one ticket',
    () => {
      const m = chantier(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const entrees = lireEntrees(m.repo) as { fichier: string }[];
      expect(entrees).toEqual([
        { fichier: expect.any(String) as string, branche: 'agent/demo-1', ticket: 'demo-1' },
      ]);
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
