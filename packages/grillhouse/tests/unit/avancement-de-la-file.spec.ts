// The replay of a ticket's branch by the queue (scripts/faits-du-circuit.mjs, the act `avancer`)
// writes the progress of its pass in the working directory of the ticket, where the board reads it
// while the circuit waits for the queue (scripts/avancement.mjs `avecLAvancementDuTravail`), as
// each automatic pass of the circuit does: its directory is named to the pass and its children by
// GRILLHOUSE_AVANCEMENT, and leaves with the pass.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { avancementDuTravail, avecLAvancementDuTravail } from '../../scripts/avancement.mjs';
import { AVANCEMENT } from '../../scripts/mesure/avancement.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'avancement-de-la-file-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

describe('the progress of the replay of the queue goes to the working directory of the ticket', () => {
  it('while the pass runs, the board reads its progress there, named by GRILLHOUSE_AVANCEMENT; after it, none', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
    const travail = path.join(racine, '.claude', 'worktrees', 'demo-1.travail');
    mkdirSync(travail, { recursive: true });
    const avant = process.env[AVANCEMENT];
    const vu = avecLAvancementDuTravail(travail, { racine, genre: 'file' }, () => ({
      dossier: process.env[AVANCEMENT] ?? null,
      lu: avancementDuTravail(travail),
    }));
    expect(vu.dossier && path.dirname(vu.dossier)).toBe(travail);
    expect(vu.lu).not.toBeNull();
    expect(avancementDuTravail(travail)).toBeNull();
    expect(process.env[AVANCEMENT]).toBe(avant);
  });

  it('a lot entered on main keeps its progress up to its closure; one left out of the queue keeps none', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
    const travail = path.join(racine, '.claude', 'worktrees', 'demo-3.travail');
    mkdirSync(travail, { recursive: true });
    const garder = (lu: { entre?: object }) => Boolean(lu.entre);
    avecLAvancementDuTravail(travail, { racine, genre: 'file', garder }, () => ({}));
    expect(avancementDuTravail(travail)).toBeNull();
    avecLAvancementDuTravail(travail, { racine, genre: 'file', garder }, () => ({
      entre: { commit: 'abc' },
    }));
    expect(avancementDuTravail(travail)).not.toBeNull();
  });

  it('the directory a pass left (killed, or a lot kept that goes through the queue again) goes before the next one opens', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
    const travail = path.join(racine, '.claude', 'worktrees', 'demo-4.travail');
    mkdirSync(travail, { recursive: true });
    const garder = () => true;
    const premier = avecLAvancementDuTravail(travail, { racine, genre: 'file', garder }, d => d);
    const second = avecLAvancementDuTravail(travail, { racine, genre: 'file', garder }, d => d);
    expect(premier).not.toBe(second);
    expect(readdirSync(travail).filter(n => n.startsWith('avancement-'))).toEqual([
      path.basename(second!),
    ]);
  });

  it('the pass receives its directory, the one GRILLHOUSE_AVANCEMENT names', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
    const travail = path.join(racine, '.claude', 'worktrees', 'demo-5.travail');
    mkdirSync(travail, { recursive: true });
    const vu = avecLAvancementDuTravail(travail, { racine, genre: null }, d => ({
      donne: d,
      nomme: process.env[AVANCEMENT],
    }));
    expect(vu.donne).toBe(vu.nomme);
  });

  it('a pass whose copy goes before its end keeps its total in its repository: the integration', () => {
    // The integration removes the ticket's copy (scripts/integration/integrer.mjs, step 8) before
    // its pass ends: the total goes to the repository its opening named.
    const depot = mkdtempSync(path.join(ESSAIS, 'depot-'));
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', depot, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
        encoding: 'utf8',
      });
    git('init', '-q', '-b', 'main');
    git('commit', '-q', '--allow-empty', '-m', 'debut');
    const copie = path.join(depot, '.claude', 'worktrees', 'demo-6');
    git('worktree', 'add', '-q', '--detach', copie);
    const travail = `${copie}.travail`;
    mkdirSync(travail, { recursive: true });
    avecLAvancementDuTravail(travail, { racine: copie, genre: 'integration' }, dossier => {
      mkdirSync(path.join(dossier!, 'taches'), { recursive: true });
      writeFileSync(
        path.join(dossier!, 'taches', 't.json'),
        JSON.stringify({ faits: 4, prevus: 4, a: Date.now() })
      );
      git('worktree', 'remove', '--force', copie);
    });
    const totaux = JSON.parse(
      readFileSync(path.join(depot, '.git', 'grillhouse', 'avancement.json'), 'utf8')
    ) as { passes: Record<string, number> };
    expect(totaux.passes).toEqual({ integration: 4 });
  });

  it('without the working directory of the ticket, the pass runs without a progress', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
    const travail = path.join(racine, '.claude', 'worktrees', 'demo-2.travail');
    const avant = process.env[AVANCEMENT];
    const dossier = avecLAvancementDuTravail(
      travail,
      { racine, genre: 'file' },
      () => process.env[AVANCEMENT]
    );
    expect(dossier).toBe(avant);
  });
});
