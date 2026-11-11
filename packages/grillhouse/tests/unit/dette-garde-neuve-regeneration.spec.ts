import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import { FICHIER } from '../../scripts/dette.mjs';

// The regeneration of the debt writes to the ticket each inscription of a guard the lot adds. A
// medium test: git alone mounts the trial repository.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dette-regeneration-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const A_INSCRIRE = 'a-inscrire';
const NOTES = [
  { garde: 'neuve', fichier: 'a.ts', regle: 'r', trouve: 2, genre: A_INSCRIRE },
  { garde: 'neuve', fichier: 'b.ts', regle: 's', trouve: 1, genre: A_INSCRIRE },
  { garde: 'ancienne', fichier: 'x.ts', regle: 'r', trouve: 1, genre: 'a-elaguer' },
  { garde: 'ancienne', fichier: 'neuf.ts', regle: 'r', trouve: 3 },
];

const dossier = (prefixe: string) => mkdtempSync(path.join(ESSAIS, prefixe));
const git = (dir: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};

describe('la régénération de la dette des gardes', () => {
  it('writes to the ticket each inscription of a new guard: guard, file, rule, count', () => {
    const racine = dossier('projet-');
    for (const [rel, texte] of Object.entries({
      'package.json': JSON.stringify({ name: 'essai', workspaces: ['packages/*'] }),
      'docs/ARCHITECTURE.md': architecture(),
      'packages/outil/package.json': JSON.stringify({ name: '@essai/outil' }),
      'packages/outil/a.txt': 'a\n',
    })) {
      mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
      writeFileSync(path.join(racine, rel), texte);
    }
    git(racine, 'init', '-q', '-b', 'main');
    git(racine, 'config', 'user.email', 'essai@example.com');
    git(racine, 'config', 'user.name', 'essai');
    git(racine, 'add', '-A');
    git(racine, 'commit', '-q', '-m', 'base');
    const tmp = dossier('tmp-');
    const ctx = {
      racine,
      copie: racine,
      ticket: 'demo-1',
      paquets: ['packages/outil'],
      tmp,
      journal: path.join(tmp, 'journal'),
      fiches: path.join(tmp, 'fiches.jsonl'),
      base: { dossier: tmp },
    };
    const { lot } = (activites.leLotGarde as (x: object) => { lot: object })(ctx);
    const regenerer = activites.regenerer as (
      x: object,
      e: { noms: string[]; notes: object[]; avant: object }
    ) => { texte: string; fichiers: string[] };
    const r = regenerer(ctx, { noms: ['la dette des gardes'], notes: NOTES, avant: lot });
    expect(r.fichiers).toEqual([FICHIER]);
    expect(r.texte).toMatch(/neuve[^\n]*a\.ts[^\n]*\br\b[^\n]*\b2\b/);
    expect(r.texte).toMatch(/neuve[^\n]*b\.ts[^\n]*\bs\b[^\n]*\b1\b/);
    // Its witness: a guard of main lowered is no inscription.
    expect(r.texte).not.toMatch(/inscri[^\n]*ancienne/);
  });
});
