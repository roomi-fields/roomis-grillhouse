// A package born of a direct ticket: its title names a path of the repository that does not exist
// yet. The departure (scripts/depart-du-ticket.mjs, `ticketAuLancement`) keeps it in the plan
// (circuit.md §3.4). A test of size medium: a trial git repository with a base commit.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { ticketAuLancement } from '../../scripts/depart-du-ticket.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'depart-chemin-neuf-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

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
