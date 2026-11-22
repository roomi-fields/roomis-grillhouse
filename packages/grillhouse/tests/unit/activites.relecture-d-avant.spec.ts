// The review before (scripts/activites.mjs, `relectureDAvant`): the reviewer's last sheet and the lot
// it read, or null when the ticket has none, has no copy, or when the repository no longer holds the
// lot or its base (then the next review reads the whole lot). A test of size medium: the copy is a
// trial git repository.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'relecture-d-avant-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Entree {
  role: string;
  fiche: { verdict: string };
  lot?: { commit?: string; base?: string };
}
const relectureDAvant = activites.relectureDAvant as (ctx: object) => Entree | null;

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};

// A copy with two commits: the base and the lot.
function copie() {
  const d = mkdtempSync(path.join(ESSAIS, 'copie-'));
  git(d, 'init', '-q', '-b', 'main');
  git(d, 'config', 'user.email', 'essai@example.com');
  git(d, 'config', 'user.name', 'essai');
  writeFileSync(path.join(d, 'a.txt'), 'a\n');
  git(d, 'add', '-A');
  git(d, 'commit', '-q', '-m', 'base');
  const base = git(d, 'rev-parse', 'HEAD');
  writeFileSync(path.join(d, 'a.txt'), 'b\n');
  git(d, 'commit', '-qam', 'lot');
  return { d, base, lot: git(d, 'rev-parse', 'HEAD') };
}
const contexte = (d: string, ...entrees: object[]) => ({
  copie: d,
  fiches: path.join(d, 'absent.jsonl'),
  rendus: entrees.map(entree => ({ genre: 'fiche', entree })),
});
const revue = (verdict: string, lot?: object): Entree => ({
  role: 'relecteur',
  fiche: { verdict },
  ...(lot ? { lot } : {}),
});

describe('la relecture d’avant', () => {
  it('rend la dernière fiche du relecteur avec le lot qu’elle a lu, tant que le dépôt le tient', () => {
    const { d, base, lot } = copie();
    const e = relectureDAvant(
      contexte(d, revue('RENDU', { commit: base, base }), revue('RENDU', { commit: lot, base }))
    );
    expect(e?.lot).toEqual({ commit: lot, base });
  });

  it('ne rend rien avant toute relecture, ni pour une fiche sans lot gardé', () => {
    const { d } = copie();
    expect(relectureDAvant(contexte(d))).toBeNull();
    expect(relectureDAvant(contexte(d, revue('RENDU')))).toBeNull();
    expect(
      relectureDAvant(contexte(d, { role: 'developpeur', fiche: { verdict: 'x' } }))
    ).toBeNull();
  });

  it('ne rend rien sans copie', () => {
    const { d, base, lot } = copie();
    const ctx = {
      ...contexte(d, revue('RENDU', { commit: lot, base })),
      copie: path.join(d, 'sans'),
    };
    expect(relectureDAvant(ctx)).toBeNull();
  });

  it('ne rend rien quand le dépôt ne tient plus le lot : la relecture suivante lit le lot entier', () => {
    const { d, base } = copie();
    const inconnu = 'f'.repeat(40);
    expect(relectureDAvant(contexte(d, revue('RENDU', { commit: inconnu, base })))).toBeNull();
  });

  it('ne rend rien quand le dépôt ne tient plus la base du lot', () => {
    const { d, lot } = copie();
    const inconnu = 'e'.repeat(40);
    expect(relectureDAvant(contexte(d, revue('RENDU', { commit: lot, base: inconnu })))).toBeNull();
  });
});
