// grillhouse-3uv.92.4 — in the envelope of a component that is a package, the agent writes its own
// package and nothing else of the copy: the rest is read-only, as a sandbox of Bazel or of Nix
// opens in writing only what the action declares. Witness: BPScript 320.4 (n° 13), where only
// `packages/` was emptied: `libraries/` and `spec/` stayed writable, the developer of 900-driver
// edited `libraries/alphabets.bpsl`, and the circuit saw « aucun changement de 900 ».
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { dossierDeTravail, plan } from '../../scripts/enveloppe/enveloppe.mjs';
import { SCRIPT, enveloppeEssai } from './enveloppe-essai.js';
import { LANGAGE } from './langage-essai.js';

// A disk that holds the paths <files>.
const fakeDisk = (files: string[]) => {
  const exists = new Set(files);
  return { existe: (p: string) => exists.has(p) };
};
const pairs = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));

const presents = [
  '/wt/.git',
  '/wt/.turbo',
  '/wt/libraries',
  '/wt/spec',
  '/wt/packages/a',
  '/main/.beads',
];
const paquets = [
  { dossier: 'packages/a', pkg: { name: 'a' } },
  { dossier: 'packages/b', pkg: { name: 'b' } },
  { dossier: 'packages/m', pkg: { name: 'm' } },
];
const montages = ({ composant = 'packages/a', role = 'developpeur', liste = paquets } = {}) =>
  plan(
    {
      trees: ['/main', '/wt'],
      copie: '/wt',
      paquets: [composant],
      role,
      matieres: ['packages/m'],
      paquetsDeLaCopie: liste,
    },
    fakeDisk(presents)
  ).args;

describe('grillhouse-3uv.92.4 — le plan de l’enveloppe d’un paquet', () => {
  it('critère 1 — monte la copie en lecture seule, puis le seul paquet du composant en écriture', () => {
    const args = montages();
    expect(pairs(args, '--ro-bind')).toContain('/wt');
    expect(pairs(args, '--bind')).not.toContain('/wt');
    expect(pairs(args, '--bind')).toContain('/wt/packages/a');
    expect(args.lastIndexOf('/wt/packages/a')).toBeGreaterThan(args.indexOf('/wt'));
  });

  it('critère 1 — n’ouvre en écriture aucun dossier de la racine hors des paquets : libraries, spec', () => {
    const ecrits = pairs(montages(), '--bind');
    for (const d of ['/wt/libraries', '/wt/spec']) {
      expect(ecrits).not.toContain(d);
    }
  });

  it('critère 1 — garde au testwriter la matière de test partagée en écriture, aux autres rôles en lecture', () => {
    expect(pairs(montages({ role: 'testwriter' }), '--bind')).toContain('/wt/packages/m');
    const dev = montages();
    expect(pairs(dev, '--bind')).not.toContain('/wt/packages/m');
    expect(pairs(dev, '--ro-bind')).toContain('/wt/packages/m');
  });

  it('critère 1 — garde en écriture la base des tickets et ce qu’un lancement de Turborepo écrit à la racine, propre à la séance', () => {
    const args = montages();
    expect(pairs(args, '--bind')).toContain('/main/.beads');
    expect(pairs(args, '--tmpfs')).toContain('/wt/.turbo');
    expect(args.lastIndexOf('/wt/.turbo')).toBeGreaterThan(args.indexOf('/wt'));
  });

  it('un composant qui n’est pas un paquet écrit le paquet qui le tient, la copie entière', () => {
    expect(pairs(montages({ composant: 'libraries' }), '--bind')).toContain('/wt');
    expect(pairs(montages({ liste: [] }), '--bind')).toContain('/wt');
  });
});

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
  ecrire(
    'package.json',
    JSON.stringify({ name: 'essai', workspaces: ['packages/*'], grillhouse: LANGAGE })
  );
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
