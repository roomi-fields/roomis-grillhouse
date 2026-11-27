// A package born of a direct ticket: its title names a path of the repository that does not exist
// yet. The departure (scripts/depart-du-ticket.mjs, `ticketAuLancement`) keeps it in the plan, and
// the write lock (scripts/verrous/verrou.mjs, `horsDuPlan`) opens that path alone (circuit.md
// §3.4). A test of size medium: a trial git repository with a base commit.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { ticketAuLancement } from '../../scripts/depart-du-ticket.mjs';
import { horsDuPlan } from '../../scripts/verrous/verrou.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'depart-chemin-neuf-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const SCRATCH = '/scratch';

// A repository of one package `a`, a folder `scripts` at its root, all committed.
function depot() {
  const repo = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const ecrire = (rel: string, texte: string) => {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    writeFileSync(path.join(repo, rel), texte);
  };
  ecrire(
    'package.json',
    JSON.stringify({ name: 'racine', private: true, workspaces: ['packages/*'] })
  );
  declarerLesLangages(repo);
  ecrire('packages/a/package.json', JSON.stringify({ name: 'a' }));
  ecrire('scripts/outil.mjs', '\n');
  const git = (...a: string[]) => {
    const r = spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
    if (r.status !== 0) {
      throw new Error(r.stderr);
    }
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'essai@example.com');
  git('config', 'user.name', 'essai');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  return repo;
}
const repo = depot();
const depart = (composants: string, labels: string[]) =>
  ticketAuLancement(repo, 'demo-1', {
    bd: () => ({
      status: 0,
      stdout: JSON.stringify([
        {
          title: `demo-1 — Un paquet — ${composants}`,
          description: '## Architecture\n\nx',
          labels,
        },
      ]),
      stderr: '',
    }),
  }).plan;

describe('le départ d’un ticket direct', () => {
  it.each([['direct'], ['direct', 'circuit']])(
    'garde au plan, tel quel, un chemin du dépôt qui n’existe pas encore (étiquettes %s)',
    (...labels) => {
      expect(depart('packages/neuf, a', labels)).toEqual(['packages/neuf', 'packages/a']);
    }
  );

  it('retire la barre finale d’un chemin neuf', () => {
    expect(depart('packages/neuf/', ['direct'])).toEqual(['packages/neuf']);
  });

  it.each([
    ['un nom inconnu sans barre', 'neuf'],
    ['un nom de portée npm', '@essai/neuf'],
    ['un chemin qui sort du dépôt', '../dehors/neuf'],
    ['un chemin qui y sort par détour', 'packages/../../dehors'],
  ])('refuse %s', (_nom, composant) => {
    expect(() => depart(composant, ['direct'])).toThrow(/ne nomme ni un paquet/);
  });

  it.each([['circuit'], []])(
    'refuse le chemin absent d’un circuit long ou court (%s)',
    (...labels) => {
      expect(() => depart('packages/neuf', labels.filter(Boolean))).toThrow(
        /ne nomme ni un paquet/
      );
    }
  );
});

const juge = (rel: string, plan: string, role = 'direct') =>
  horsDuPlan(
    {
      tool_name: 'Write',
      tool_input: { file_path: path.join(repo, rel), content: 'x\n' },
      cwd: repo,
    },
    { tmp: SCRATCH, env: { GRILLHOUSE_ENVELOPPE: plan }, role }
  );

describe('un chemin neuf du plan n’ouvre en écriture que lui-même', () => {
  it.each(['direct', 'developpeur', 'testwriter'])('laisse écrire sous lui (%s)', role => {
    expect(juge('packages/neuf/package.json', 'packages/neuf', role)).toBeNull();
    expect(juge('packages/neuf/src/index.ts', 'packages/neuf', role)).toBeNull();
  });

  it.each(['README.md', 'packages/a/src/x.ts', 'scripts/outil.mjs', 'packages/neufs/x.ts'])(
    'arrête sur %s',
    rel => {
      expect(juge(rel, 'packages/neuf')).not.toBeNull();
    }
  );

  it('le reste une fois le dossier créé dans la copie, que le commit de base ne tient pas', () => {
    mkdirSync(path.join(repo, 'outils/neuf'), { recursive: true });
    expect(juge('outils/neuf/x.mjs', 'outils/neuf')).toBeNull();
    expect(juge('README.md', 'outils/neuf')?.racine).toBe(true);
  });

  it('laisse écrire dans un autre composant du plan', () => {
    expect(juge('packages/a/src/x.ts', 'packages/neuf' + path.delimiter + 'packages/a')).toBeNull();
    expect(juge('README.md', 'packages/neuf' + path.delimiter + 'packages/a')?.racine).toBe(true);
  });

  it.each([
    ['le titre la nomme', '.'],
    ['un chemin existant que la règle donne à la racine', 'scripts'],
  ])('ouvre la racine quand %s', (_nom, existant) => {
    expect(juge('README.md', 'packages/neuf' + path.delimiter + existant)).toBeNull();
  });
});
