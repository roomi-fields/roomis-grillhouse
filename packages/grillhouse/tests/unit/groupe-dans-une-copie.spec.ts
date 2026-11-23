// The key `grillhouse.groupe` is the project's: a command launched in a copy of work (a git
// worktree under `.claude/worktrees/`) reads it in the package.json of the main tree and resolves
// its relative paths from there, as git reads its configuration in the common directory.
// `grillhouse maj` (`mettreAJour`) and `grillhouse paquet` (`creerPaquet`) played from a copy
// reach their end, and the `external_projects` they set stay relative to the main tree. A faulty
// key is refused by `creerPaquet` before it writes anything: no skeleton is left on a refusal.
// Witness: SyntHub under 0.48.0, `npx grillhouse paquet packages/gardes` in a copy, its group
// declared by relative paths.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { mettreAJour } from '../../scripts/grillhouse-maj.mjs';
import { groupeDe } from '../../scripts/groupe-cles.mjs';
import { creerPaquet, Refus } from '../../scripts/paquet.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'groupe-dans-une-copie-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const TABLE = `# Architecture

| Composant | Responsabilité | Langage |
|---|---|---|
| \`packages/gardes\` | les gardes du projet | typescript |
`;

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// Every file under <racine>, from it, git's own left out.
const tous = (racine: string): string[] =>
  readdirSync(racine, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => path.relative(racine, path.join(e.parentPath, e.name)))
    .filter(f => f !== '.git' && !f.startsWith(`.git${path.sep}`))
    .sort();

// A project `synthhub` whose `grillhouse.groupe` is <groupe>, beside its neighbour `osc-bridge`,
// under a folder of its own: its root.
function projet(groupe: unknown): string {
  const dossier = mkdtempSync(path.join(ESSAIS, 'groupe-'));
  mkdirSync(path.join(dossier, 'osc-bridge'));
  const racine = path.join(dossier, 'synthhub');
  ecrire(
    racine,
    'package.json',
    `${JSON.stringify({ name: 'synthhub', private: true, workspaces: ['packages/*'], grillhouse: { groupe } }, null, 2)}\n`
  );
  ecrire(racine, 'docs/ARCHITECTURE.md', TABLE);
  return racine;
}

// The project of <groupe> as a git repository, and a copy of work of it: { racine, copie }.
function depotEtCopie(groupe: unknown): { racine: string; copie: string } {
  const racine = projet(groupe);
  const git = (...args: string[]) => {
    const r = spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
    if (r.status !== 0) {
      throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
    }
  };
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'un');
  const copie = path.join(racine, '.claude', 'worktrees', 'paquet-gardes');
  git('worktree', 'add', '-q', '--detach', copie);
  return { racine, copie };
}

// A stand-in Beads: the configuration set per working directory.
function beads() {
  const config = new Map<string, Map<string, string>>();
  const bd = (args: string[], cwd: string) => {
    const c = config.get(cwd) ?? config.set(cwd, new Map()).get(cwd)!;
    if (args[0] === 'config' && args[1] === 'set') {
      c.set(args[2]!, args[3]!);
      return { status: 0, stdout: '', stderr: '' };
    }
    if (args[0] === 'config' && args[1] === 'get') {
      return {
        status: 0,
        stdout: c.get(args[2]!) ?? `${args[2]} (not set in config.yaml)\n`,
        stderr: '',
      };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  return { bd, poses: (cwd: string) => Object.fromEntries(config.get(cwd) ?? []) };
}

const RELATIF = ['../osc-bridge', '../synthhub'];

describe('the group of the project is read in the main tree', () => {
  it('a relative group read from a copy resolves from the main tree', () => {
    const { racine, copie } = depotEtCopie(RELATIF);
    const groupe = groupeDe(copie);
    expect(groupe?.projets).toEqual([
      { nom: 'osc-bridge', chemin: path.join(path.dirname(racine), 'osc-bridge') },
      { nom: 'synthhub', chemin: racine },
    ]);
    expect(groupe).toEqual(groupeDe(racine));
  });

  it('the package.json of the copy is not the one read', () => {
    const { racine, copie } = depotEtCopie(RELATIF);
    ecrire(
      copie,
      'package.json',
      JSON.stringify({ name: 'c', grillhouse: { groupe: ['/absent'] } })
    );
    expect(groupeDe(copie)).toEqual(groupeDe(racine));
  });

  it('a project without the key, or without package.json, has no group', () => {
    const sans = mkdtempSync(path.join(ESSAIS, 'sans-'));
    expect(groupeDe(sans)).toBeNull();
    ecrire(sans, 'package.json', '{"name":"sans"}\n');
    expect(groupeDe(sans)).toBeNull();
  });

  it('a faulty key throws, each fault named by its key and its value', () => {
    const racine = projet(['../absent', '../synthhub']);
    expect(() => groupeDe(racine)).toThrow(/grillhouse\.groupe\[0\] vaut "\.\.\/absent"/);
  });
});

describe('the update played in a copy of work reaches its end', () => {
  it('grillhouse maj: the external projects are set, relative to the main tree', () => {
    const { copie } = depotEtCopie(RELATIF);
    const b = beads();
    const bilan = mettreAJour(copie, DEPOT, { bd: b.bd });
    expect(bilan.projetsExternes).toEqual(['osc-bridge']);
    expect(b.poses(copie)).toEqual({ 'external_projects.osc-bridge': '../osc-bridge' });
  });

  it('grillhouse paquet: the skeleton is written in the copy, the main tree untouched', () => {
    const { racine, copie } = depotEtCopie(RELATIF);
    const avant = tous(racine).filter(f => !f.startsWith('.claude'));
    const b = beads();
    const { ecrits } = creerPaquet(copie, 'packages/gardes', { executer: () => 0, bd: b.bd });
    expect(ecrits).toContain('packages/gardes/package.json');
    expect(tous(copie)).toContain('packages/gardes/package.json');
    expect(b.poses(copie)).toEqual({ 'external_projects.osc-bridge': '../osc-bridge' });
    expect(tous(racine).filter(f => !f.startsWith('.claude'))).toEqual(avant);
  });
});

describe('a package is refused on a faulty group before anything is written', () => {
  it.each([
    ['a path that does not exist', ['../absent', '../synthhub']],
    ['a duplicate', ['../synthhub', '../synthhub']],
    ['a key that is no list', 'osc-bridge'],
  ])('%s: a refusal that names grillhouse.groupe, no skeleton left', (_nom, groupe) => {
    const racine = projet(groupe);
    const avant = tous(racine);
    let commandes = 0;
    const b = beads();
    const creer = () =>
      creerPaquet(racine, 'packages/gardes', {
        executer: () => {
          commandes++;
          return 0;
        },
        bd: b.bd,
      });
    expect(creer).toThrow(Refus);
    expect(creer).toThrow(/grillhouse\.groupe/);
    expect(tous(racine)).toEqual(avant);
    expect(commandes).toBe(0);
  });

  it('the same project, its key corrected, receives its package', () => {
    const racine = projet(['../absent', '../synthhub']);
    const b = beads();
    expect(() => creerPaquet(racine, 'packages/gardes', { executer: () => 0, bd: b.bd })).toThrow(
      Refus
    );
    ecrire(
      racine,
      'package.json',
      `${JSON.stringify({ name: 'synthhub', private: true, workspaces: ['packages/*'], grillhouse: { groupe: RELATIF } }, null, 2)}\n`
    );
    const { ecrits } = creerPaquet(racine, 'packages/gardes', { executer: () => 0, bd: b.bd });
    expect(ecrits).toContain('packages/gardes/package.json');
  });
});
