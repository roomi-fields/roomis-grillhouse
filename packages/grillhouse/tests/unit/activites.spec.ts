// The activities of the circuit (scripts/activites.mjs, grillhouse-4nr.4), as Temporal runs the
// activities of a workflow: each receives its inputs and returns its outcome, none reading nor
// writing the circuit's memory; the regeneration starts by restoring the copy it kept before it,
// so that an attempt played again after one cut short starts from the same copy; an integration
// played again on a lot already committed (its ticket labelled `en-file`) makes no second commit.
// Each case plays the real git in a repository of trial.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'activites-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Lot {
  commit: string;
  arbre: string;
}
const leLotGarde = activites.leLotGarde as (ctx: object) => { lot: Lot | null };
const regenerer = activites.regenerer as (
  ctx: object,
  entree: { noms: string[]; avant?: Lot | null }
) => { texte: string; fichiers: string[] };
const integrer = activites.integrer as (ctx: object) => {
  code: number;
  sortie: string;
  deja?: boolean;
};

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};

// A project of trial in TypeScript, committed on main, and the context of the circuit of
// demo-1 on it: the run's paths, no memory.
function projet() {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
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
  const tmp = mkdtempSync(path.join(ESSAIS, 'tmp-'));
  return {
    racine,
    copie: racine,
    ticket: 'demo-1',
    paquets: ['packages/outil'],
    tmp,
    journal: path.join(tmp, 'journal'),
    fiches: path.join(tmp, 'fiches.jsonl'),
    base: { dossier: tmp },
  };
}

describe('la régénération commence par restaurer la copie d’avant', () => {
  it('a copy a cut attempt left changed is restored to the lot kept, then regenerated', () => {
    const ctx = projet();
    const { lot } = leLotGarde(ctx);
    expect(lot).not.toBeNull();
    // An attempt cut short: a file changed and a file written that the lot kept does not hold.
    writeFileSync(path.join(ctx.copie, 'packages/outil/a.txt'), 'changé\n');
    writeFileSync(path.join(ctx.copie, 'packages/outil/reste.txt'), 'reste\n');
    const r = regenerer(ctx, { noms: [], avant: lot });
    expect(readFileSync(path.join(ctx.copie, 'packages/outil/a.txt'), 'utf8')).toBe('a\n');
    expect(existsSync(path.join(ctx.copie, 'packages/outil/reste.txt'))).toBe(false);
    expect(r.fichiers).toEqual([]);
  });

  it('a copy that is the lot kept is left as it is', () => {
    const ctx = projet();
    writeFileSync(path.join(ctx.copie, 'packages/outil/neuf.txt'), 'neuf\n');
    const { lot } = leLotGarde(ctx);
    regenerer(ctx, { noms: [], avant: lot });
    expect(readFileSync(path.join(ctx.copie, 'packages/outil/neuf.txt'), 'utf8')).toBe('neuf\n');
  });
});

describe('un rejeu de l’intégration sur un lot déjà commité ne fait pas de second commit', () => {
  it('the ticket labelled en-file: no script, no commit, the integration green', () => {
    // Beads shows the ticket with the label the integration puts on a lot it committed.
    const bd = (...a: string[]) => ({
      status: 0,
      stdout: a[0] === 'show' ? JSON.stringify([{ id: 'demo-1', labels: ['en-file'] }]) : '',
      stderr: '',
    });
    const ctx = { ...projet(), bd };
    const avant = git(ctx.racine, 'rev-list', '--all', '--count');
    const r = integrer(ctx);
    expect(r).toMatchObject({ code: 0, deja: true });
    expect(r.sortie).toContain('déjà commité');
    expect(git(ctx.racine, 'rev-list', '--all', '--count')).toBe(avant);
  });
});

describe('aucune activité ne partage d’état de ctx', () => {
  // The activities and every module of the frame they call, followed by their imports
  // (scripts/seances.mjs, the sessions, among them).
  const modules = new Set<string>();
  const pile = [path.resolve(__dirname, '../../scripts/activites.mjs')];
  while (pile.length) {
    const f = pile.pop() as string;
    if (modules.has(f)) {
      continue;
    }
    modules.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(/from '(\.[^']+\.mjs)'/g)) {
      pile.push(path.resolve(path.dirname(f), m[1]));
    }
  }
  const code = [...modules]
    .map(f => readFileSync(f, 'utf8'))
    .join('\n')
    .split('\n')
    .filter(l => !l.trimStart().startsWith('//'))
    .join('\n');

  it('follows the modules an activity calls, the sessions among them', () => {
    expect([...modules].map(f => path.basename(f))).toContain('seances.mjs');
  });

  it('no activity writes a field of the context', () => {
    expect(code.match(/\bctx\.\w+\s*(=(?!=)|\+\+|--)/g) ?? []).toEqual([]);
  });

  it('no activity reads the memory of the circuit, which its caller gives', () => {
    const memoire =
      /\bctx\.(constats|verifie|refus|regeneration|regenereSur|aRegenerer|controlesRouges|renvoiAuTestwriter|rienALivrer|reprise|mesureDeLaPreuve|numero|courant)\b/g;
    expect(code.match(memoire) ?? []).toEqual([]);
  });

  it('the guard sees a write of the context', () => {
    expect('ctx.constats = [];'.match(/\bctx\.\w+\s*(=(?!=)|\+\+|--)/g)).not.toBeNull();
  });
});
