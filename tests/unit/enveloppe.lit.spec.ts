// grillhouse-3uv.89, L5 — the envelope of a component shows, read-only, what its tests declare they
// read (`grillhouse.lit` of its package.json, and the `lit` of each trace it declares), as Bazel
// gives a test the `data` it declares. Witness: BPScript 320.3, where the tests of 995-tools read
// `packages/900-driver/test` and `packages/000-forms/src/tables.ts`, which its envelope hid: 43 reds
// due to the envelope, 12 sessions, 55 min.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { cheminsLus, plan } from '../../scripts/enveloppe/enveloppe.mjs';
import { SCRIPT, enveloppeEssai } from './enveloppe-essai.js';

const ESSAIS_TEMP = mkdtempSync(path.join(tmpdir(), 'enveloppe-lit-'));
afterAll(() => rmSync(ESSAIS_TEMP, { recursive: true, force: true }));

// A disk described as { path: entries } for directories, a set of existing paths, and the paths
// each package's tests declare they read.
function fakeDisk(
  dirs: Record<string, { name: string; dir: boolean }[]>,
  files: string[],
  lus: Record<string, string[]> = {}
) {
  const exists = new Set([...Object.keys(dirs), ...files]);
  return {
    lister: (d: string) => dirs[d] ?? [],
    existe: (p: string) => exists.has(p),
    liens: () => [],
    publies: () => [],
    lus: (d: string) => lus[d] ?? [],
  };
}
const pairs = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));

const freres = {
  '/wt/packages': [
    { name: 'a', dir: true },
    { name: 'b', dir: true },
    { name: 'c', dir: true },
    { name: 'm', dir: true },
  ],
  '/wt/packages/a': [],
};
const presents = [
  '/wt/packages/b/package.json',
  '/wt/packages/b/test',
  '/wt/packages/b/src',
  '/wt/packages/c/package.json',
  '/wt/packages/c/src/tables.ts',
  '/wt/packages/m/donnees',
  '/wt/spec',
];
const montages = (lus: string[], role = 'developpeur') =>
  plan(
    {
      trees: ['/main', '/wt'],
      copie: '/wt',
      composant: 'packages/a',
      role,
      matieres: ['packages/m'],
    },
    fakeDisk(freres, presents, { '/wt/packages/a': lus })
  ).args;

describe('grillhouse-3uv.89 — l’enveloppe et ce que les tests du composant déclarent lire', () => {
  it('montre en lecture seule chaque chemin déclaré qu’un composant voisin porte, dossier ou fichier', () => {
    const args = montages(['packages/b/test', 'packages/c/src/tables.ts']);
    const ro = pairs(args, '--ro-bind');
    expect(ro).toContain('/wt/packages/b/test');
    expect(ro).toContain('/wt/packages/c/src/tables.ts');
    expect(ro).not.toContain('/wt/packages/b/src');
    // Mounted before the emptied directories are sealed.
    expect(args.indexOf('/wt/packages/b/test')).toBeLessThan(args.lastIndexOf('--remount-ro'));
  });

  it('ne monte aucun chemin déclaré que le disque n’a pas', () => {
    const ro = pairs(montages(['packages/b/absent']), '--ro-bind');
    expect(ro).not.toContain('/wt/packages/b/absent');
  });

  it('ne monte rien de plus pour un chemin déjà visible : la racine, le composant lui-même, un chemin hors de la copie', () => {
    const sans = montages([]);
    const avec = montages(['spec', 'packages/a/test', '../dehors']);
    expect(avec).toEqual(sans);
  });

  it('laisse la matière de test partagée à son montage : le testwriter l’écrit toujours', () => {
    const sans = montages([], 'testwriter');
    const avec = montages(['packages/m/donnees'], 'testwriter');
    expect(avec).toEqual(sans);
    expect(pairs(avec, '--bind')).toContain('/wt/packages/m');
  });
});

describe('grillhouse-3uv.89 — cheminsLus : ce que le package.json d’un paquet déclare que ses tests lisent', () => {
  const dir = mkdtempSync(path.join(ESSAIS_TEMP, 'paquet-'));
  const manifeste = (o: unknown) =>
    writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(o)}\n`);

  it('rend son grillhouse.lit et le lit de chacune de ses traces, chacun depuis la racine', () => {
    manifeste({
      name: 'a',
      grillhouse: {
        lit: ['packages/b/test', 'spec'],
        traces: { 'trace:x': { lit: ['packages/c/donnees'], ecrit: 'packages/a/trace/x' } },
      },
    });
    expect(cheminsLus(dir)).toEqual(['packages/b/test', 'spec', 'packages/c/donnees']);
  });

  it('ne rend rien sans déclaration, ni sans package.json', () => {
    manifeste({ name: 'a' });
    expect(cheminsLus(dir)).toEqual([]);
    expect(cheminsLus(path.join(dir, 'absent'))).toEqual([]);
  });
});

// The real envelope replaces /tmp with an empty directory: its repositories live outside it, in a
// trial directory of this run alone.
const ESSAIS = racineSousLaMaison('grillhouse-essais-enveloppe-lit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe.runIf(canWrap)('grillhouse-3uv.89 — l’enveloppe sur le disque et grillhouse.lit', () => {
  const { essai } = enveloppeEssai(ESSAIS);
  const repo = essai('enveloppe-');
  const ecrire = (f: string, t: string) => {
    mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
    writeFileSync(path.join(repo, f), t);
  };
  ecrire(
    'packages/a/package.json',
    JSON.stringify({
      name: 'a',
      grillhouse: { lit: ['packages/b/test', 'packages/b/src/tables.ts'] },
    })
  );
  ecrire('packages/a/src/a.ts', 'a');
  ecrire('packages/b/package.json', JSON.stringify({ name: 'b' }));
  ecrire('packages/b/src/b.ts', 'secret');
  ecrire('packages/b/src/tables.ts', 'tables');
  ecrire('packages/b/test/capture.mjs', 'capture');
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

  const run = (shell: string) =>
    spawnSync('node', [SCRIPT, copie, 'packages/a', 'developpeur', '--', 'bash', '-c', shell], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home },
    });

  it('montre le dossier qu’ils déclarent lire, en lecture seule, et cache le reste du voisin', () => {
    const r = run('cat packages/b/test/capture.mjs');
    expect(r.stdout, r.stderr).toBe('capture');
    expect(run('touch packages/b/test/x').status).not.toBe(0);
    expect(run('cat packages/b/src/b.ts').status).not.toBe(0);
  });

  it('montre en lecture seule un fichier de code qu’ils déclarent lire, le reste de son dossier caché', () => {
    const r = run('cat packages/b/src/tables.ts');
    expect(r.stdout, r.stderr).toBe('tables');
    expect(run('echo x > packages/b/src/tables.ts').status).not.toBe(0);
    expect(run('cat packages/b/src/b.ts').status).not.toBe(0);
  });
});
