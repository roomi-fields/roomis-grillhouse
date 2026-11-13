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
    '.beads/config.yaml': 'issue-prefix: "demo"\n',
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

// grillhouse-bf5.2: the resumption of the integration of a lot already on main finishes the ticket
// without calling the integrator, and the copy goes with its working directory.
describe('la reprise de l’intégration d’un lot déjà sur main finit le ticket', () => {
  const reprendre = integrer as (ctx: object) => {
    code: number;
    sortie: string;
    deja?: boolean;
    enFile?: boolean;
    nom?: string;
  };

  // A trial project with a copy of demo-1 (a real worktree the removal names) and its working
  // directory beside it. <surMain> commits the lot on main and sets the branch there; <sale> leaves
  // an untracked file the removal refuses; <labels> the ticket's labels.
  function avecCopie({ surMain = false, sale = false, labels = [] as string[] } = {}) {
    const base = projet();
    const { racine } = base;
    if (surMain) {
      writeFileSync(path.join(racine, 'packages/outil/lot.txt'), 'lot\n');
      git(racine, 'add', '-A');
      git(racine, 'commit', '-q', '-m', 'feat(outil): le lot (demo-1)');
    }
    git(racine, 'branch', 'agent/demo-1');
    const copie = path.join(racine, '.claude', 'worktrees', 'demo-1');
    git(racine, 'worktree', 'add', '-q', copie, 'agent/demo-1');
    const travail = `${copie}.travail`;
    mkdirSync(travail, { recursive: true });
    if (sale) {
      writeFileSync(path.join(copie, 'intrus.txt'), 'intrus\n');
    }
    const bd = (...a: string[]) => ({
      status: 0,
      stdout: a[0] === 'show' ? JSON.stringify([{ id: 'demo-1', labels }]) : '',
      stderr: '',
    });
    return { ...base, copie, travail, bd };
  }

  it('un lot sur main sans étiquette en-file : l’intégrateur n’est pas appelé, le journal dit que le commit est déjà sur main', () => {
    const ctx = avecCopie({ surMain: true });
    const avant = git(ctx.racine, 'rev-list', '--all', '--count');
    const r = reprendre(ctx);
    expect(r).toMatchObject({ code: 0, deja: true });
    expect(r.enFile).toBeUndefined();
    expect(r.sortie).toContain('déjà sur main');
    expect(readFileSync(ctx.journal, 'utf8')).toContain('déjà sur main');
    expect(git(ctx.racine, 'rev-list', '--all', '--count')).toBe(avant);
  });

  it('un lot sur main avec l’étiquette en-file : l’intégrateur n’est pas appelé, le journal dit que le commit est déjà sur main', () => {
    const ctx = avecCopie({ surMain: true, labels: ['en-file'] });
    const r = reprendre(ctx);
    expect(r).toMatchObject({ code: 0, deja: true });
    expect(r.sortie).toContain('déjà sur main');
  });

  it('retire la copie avec son dossier de travail, comme l’intégrateur après un commit', () => {
    const ctx = avecCopie({ surMain: true });
    reprendre(ctx);
    expect(existsSync(ctx.copie)).toBe(false);
    expect(existsSync(ctx.travail)).toBe(false);
  });

  it('une copie qui ne se retire pas arrête sous le nom copie-gardee, la copie gardée', () => {
    const ctx = avecCopie({ surMain: true, sale: true, labels: ['en-file'] });
    const r = reprendre(ctx);
    expect(r).toMatchObject({ code: 1, nom: 'copie-gardee' });
    expect(existsSync(ctx.copie)).toBe(true);
  });

  it('une clé issue-prefix absente arrête la reprise par le message de prefixe, code 1, distinct de lot-absent', () => {
    const ctx = avecCopie({ surMain: true });
    writeFileSync(path.join(ctx.racine, '.beads/config.yaml'), '# issue-prefix: ""\n');
    const r = reprendre(ctx);
    expect(r.code).toBe(1);
    expect(r.sortie).toContain(".beads/config.yaml n'a pas la clé `issue-prefix`");
    expect(r.sortie).not.toContain('lot-absent');
    expect(r.nom).not.toBe('lot-absent');
    expect(existsSync(ctx.copie)).toBe(true);
  });

  it('un lot ni sur main ni dans la copie arrête sous le nom lot-absent, avec sa pièce', () => {
    const ctx = avecCopie();
    const r = reprendre(ctx);
    expect(r).toMatchObject({ code: 1, nom: 'lot-absent' });
    expect(r.sortie).toContain('lot-absent');
    expect(existsSync(ctx.copie)).toBe(true);
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
