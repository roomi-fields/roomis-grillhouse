// grillhouse-3uv.92.4 — in the envelope of a component that is a package, the agent writes its own
// package and nothing else of the copy: the rest is read-only. The chain, played at night: bwrap
// itself, in a repository of trial; the plan of the envelope is the day's
// (packages/grillhouse/tests/unit/enveloppe.paquet.spec.ts).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  canWrap,
  enveloppeEssai,
  declarerLesLangages,
  racineSousLaMaison,
} from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { enProcessus } from './cadre.js';
import { SCRIPT } from './enveloppe-essai.js';

// The working directory of a session, read in a process of its own.
const dossierDeTravail = enProcessus<string>('scripts/enveloppe/enveloppe.mjs', 'dossierDeTravail');

// The real envelope replaces /tmp with an empty directory: its repositories live outside it, in a
// trial directory of this run alone.
const ESSAIS = racineSousLaMaison('grillhouse-essais-enveloppe-paquet-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe.runIf(canWrap)('grillhouse-3uv.92.4 — l’enveloppe d’un paquet sur le disque', () => {
  const { essai } = enveloppeEssai(ESSAIS);
  const repo = essai('enveloppe-');
  const ecrire = (f: string, t: string) => {
    mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
    writeFileSync(path.join(repo, f), t);
  };
  ecrire('package.json', JSON.stringify({ name: 'essai', workspaces: ['packages/*'] }));
  declarerLesLangages(repo);
  ecrire('packages/a/package.json', JSON.stringify({ name: 'a' }));
  ecrire('packages/a/src/a.ts', 'a');
  ecrire(
    'packages/m/package.json',
    JSON.stringify({ name: 'm', exports: { './test-fixtures': './index.js' } })
  );
  ecrire('packages/m/index.js', 'm');
  ecrire('libraries/alphabets.bpsl', 'alphabets');
  ecrire('spec/langage.md', 'spec');
  mkdirSync(path.join(repo, '.beads'));
  writeFileSync(path.join(repo, '.beads/config.yaml'), '');
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'init');
  const copie = path.join(repo, '.claude/worktrees/demo-1');
  git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie);
  const home = essai('home-');
  mkdirSync(path.join(home, '.claude/projects'), { recursive: true });
  writeFileSync(path.join(home, '.claude/settings.json'), '{}');

  const run = (shell: string, role = 'developpeur') =>
    spawnSync('node', [SCRIPT, copie, 'packages/a', role, '--', 'bash', '-c', shell], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, LC_ALL: 'C' },
    });

  it('critère 2 — une écriture hors du paquet échoue, et l’agent lit pourquoi : libraries, spec, la racine', () => {
    for (const f of ['libraries/alphabets.bpsl', 'spec/neuf.md', 'racine.txt']) {
      const r = run(`echo x >> ${f}`);
      expect(r.status, f).not.toBe(0);
      expect(r.stderr, f).toContain('Read-only file system');
    }
    expect(readFileSync(path.join(copie, 'libraries/alphabets.bpsl'), 'utf8')).toBe('alphabets');
    expect(existsSync(path.join(copie, 'spec/neuf.md'))).toBe(false);
    expect(existsSync(path.join(copie, 'racine.txt'))).toBe(false);
  });

  it('critère 1 — l’agent écrit son paquet, ses fichiers temporaires et la base des tickets', () => {
    const r = run(
      'touch packages/a/src/neuf.ts && touch "$TMPDIR/x" && touch ' + `${repo}/.beads/x`
    );
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(path.join(copie, 'packages/a/src/neuf.ts'))).toBe(true);
    expect(existsSync(path.join(dossierDeTravail(copie), 'x'))).toBe(true);
  });

  it('critère 1 — le testwriter écrit la matière de test partagée, et rien d’autre hors de son paquet', () => {
    expect(run('touch packages/m/neuf.js', 'testwriter').status).toBe(0);
    expect(run('touch libraries/neuf.bpsl', 'testwriter').status).not.toBe(0);
    expect(run('touch packages/m/autre.js').status).not.toBe(0);
  });

  it('grillhouse-3uv.95.3 — les dossiers de la racine hors des paquets se lisent, et ne s’écrivent pas', () => {
    const r = run('cat spec/langage.md libraries/alphabets.bpsl');
    expect(r.stdout, r.stderr).toBe('specalphabets');
    expect(run('touch libraries/neuf.bpsl').status).not.toBe(0);
  });
});
