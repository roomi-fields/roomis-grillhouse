// A reference the frame generates itself and writes in full (the index of the interfaces, the
// turbo.json of the packages: `fichiersEngendres` of the module of the language, its `entiers`) is
// not merged when a copy moves onto main, as a generated file the project declares
// (`grillhouse.engendres`): the copy takes main's version, then the frame's command writes it again
// on the work applied (scripts/enveloppe/travail-de-la-copie.mjs). Witness: BPScript, 2026-11-22,
// bp-mono-vbwf.320.18 and 320.8.8, « UU docs/agents/index-des-interfaces.md » at the advance of
// the copy, the stop « lancement », then a session stopped « hors-plan » on that file.
//
// Each case plays the real git in a repository of trial. The first cases give the references of the
// frame (`duCadre`), their trial repository having no language; the last ones read the frame's own
// list, in a project of TypeScript whose index of the interfaces main and the copy both changed,
// and in a repository without language, whose fault is said.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as travail from '../../scripts/enveloppe/travail-de-la-copie.mjs';
import * as activites from '../../scripts/activites.mjs';
import { depotDeReferences } from './references-essai.js';

interface Rendu {
  ok: boolean;
  message: string;
  conflits?: string[];
}
const avancer = travail.avancer as unknown as (copie: string, cible: string, o?: object) => Rendu;
const reporter = travail.reporter as unknown as (copie: string, o: object) => Rendu;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'references-du-cadre-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};
const lignes = (deuxieme: string) => `l1\n${deuxieme}\nl3\nl4\nl5\nl6\nl7\n`;
const LISTE = `import fs from 'node:fs';
fs.writeFileSync('liste.txt', fs.readdirSync('src').sort().join('\\n') + '\\n');
`;
// The reference of the frame: liste.txt, the list of the folder src, written in full by its command.
const reference = (commande = 'node liste.mjs') => ({
  nom: 'la liste',
  commande,
  fichiers: ['liste.txt'],
  lit: ['src/**'],
  gardes: ['liste'],
  entiers: ['liste.txt'],
});

// The repository of trial, liste.txt committed, and the copy of demo-1 at its HEAD; no key
// `grillhouse.engendres`.
function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  writeFileSync(path.join(racine, 'a.txt'), lignes('l2'));
  writeFileSync(path.join(racine, '.gitignore'), '.claude/worktrees/\n');
  writeFileSync(path.join(racine, 'liste.mjs'), LISTE);
  mkdirSync(path.join(racine, 'src'));
  writeFileSync(path.join(racine, 'src/a.txt'), 'a\n');
  writeFileSync(path.join(racine, 'liste.txt'), 'a.txt\n');
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'base');
  const copie = path.join(racine, '.claude/worktrees/demo-1');
  git(racine, 'worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
  const lire = (f: string) => readFileSync(path.join(copie, f), 'utf8');
  const ecrire = (f: string, c: string) => writeFileSync(path.join(copie, f), c);
  // Main gains the source b, and its list.
  const ajouterSurMain = () => {
    writeFileSync(path.join(racine, 'src/b.txt'), 'b\n');
    writeFileSync(path.join(racine, 'liste.txt'), 'a.txt\nb.txt\n');
    git(racine, 'add', '-A');
    git(racine, 'commit', '-qm', 'main b');
    return git(racine, 'rev-parse', 'HEAD');
  };
  // The copy gains the source c, and its list.
  const ajouterDansLaCopie = () => {
    ecrire('src/c.txt', 'c\n');
    git(copie, 'add', 'src/c.txt');
    ecrire('liste.txt', 'a.txt\nc.txt\n');
  };
  return { racine, copie, lire, ecrire, ajouterSurMain, ajouterDansLaCopie };
}

describe('une référence que le cadre engendre en entier n’est pas fusionnée à l’avance d’une copie', () => {
  it('main’s version is taken and the frame’s command played on the work: no conflict, both sources listed', () => {
    const d = depot();
    d.ajouterDansLaCopie();
    const main = d.ajouterSurMain();
    const r = avancer(d.copie, main, { duCadre: () => [reference()] });
    expect(r, r.message).toEqual({ ok: true, message: '' });
    expect(git(d.copie, 'rev-parse', 'HEAD')).toBe(main);
    expect(d.lire('liste.txt')).toBe('a.txt\nb.txt\nc.txt\n');
    expect(git(d.copie, 'diff', '--name-only', '--diff-filter=U')).toBe('');
    expect(git(d.copie, 'diff', '--cached', '--name-only')).toBe('');
  });

  it('a generator of the frame that ends on another code than 0 does not refuse the advance', () => {
    const d = depot();
    d.ajouterDansLaCopie();
    const main = d.ajouterSurMain();
    const r = avancer(d.copie, main, { duCadre: () => [reference('node liste.mjs; exit 1')] });
    expect(r, r.message).toEqual({ ok: true, message: '' });
    expect(d.lire('liste.txt')).toBe('a.txt\nb.txt\nc.txt\n');
  });

  it('beside a real conflict, the reference keeps main’s version and is not named in conflict', () => {
    const d = depot();
    d.ajouterDansLaCopie();
    d.ecrire('a.txt', lignes('COPIE'));
    writeFileSync(path.join(d.racine, 'a.txt'), lignes('MAIN'));
    git(d.racine, 'commit', '-qam', 'main a');
    const main = d.ajouterSurMain();
    const r = avancer(d.copie, main, { duCadre: () => [reference()] });
    expect(r.ok).toBe(false);
    expect(r.conflits).toEqual(['a.txt']);
    expect(d.lire('liste.txt')).toBe('a.txt\nb.txt\n');
  });

  it('the lot of a branch sent back comes back the same way', () => {
    const d = depot();
    const base = git(d.racine, 'rev-parse', 'HEAD');
    d.ajouterDansLaCopie();
    git(d.copie, 'add', '-A');
    git(d.copie, 'commit', '-qm', 'lot');
    const pointe = git(d.copie, 'rev-parse', 'HEAD');
    const main = d.ajouterSurMain();
    git(d.copie, 'reset', '-q', '--hard', main);
    const r = reporter(d.copie, { base, pointe, duCadre: () => [reference()] });
    expect(r.ok, r.message).toBe(true);
    expect(d.lire('liste.txt')).toBe('a.txt\nb.txt\nc.txt\n');
    expect(git(d.copie, 'diff', '--name-only', '--diff-filter=U')).toBe('');
    expect(existsSync(path.join(d.copie, 'src/c.txt'))).toBe(true);
  });

  it('a reference a generated file of the project already writes is the project’s alone', () => {
    const d = depot();
    writeFileSync(
      path.join(d.racine, 'package.json'),
      JSON.stringify({
        name: 'essai',
        grillhouse: {
          engendres: {
            liste: { commande: 'node liste.mjs', fichiers: ['liste.txt'], lit: ['src/**'] },
          },
        },
      })
    );
    git(d.racine, 'add', '-A');
    git(d.racine, 'commit', '-qm', 'cle');
    git(d.copie, 'merge', '-q', '--ff-only', 'main');
    d.ajouterDansLaCopie();
    const main = d.ajouterSurMain();
    // The frame's command would fail for real (127): it is not played, the project's is.
    const r = avancer(d.copie, main, { duCadre: () => [reference('commande-absente-du-cadre')] });
    expect(r, r.message).toEqual({ ok: true, message: '' });
    expect(d.lire('liste.txt')).toBe('a.txt\nb.txt\nc.txt\n');
  });
});

const INDEX = 'docs/agents/index-des-interfaces.md';

// A project of TypeScript of two packages, each its interface, the index of the interfaces
// committed, and the copy of demo-1 at its HEAD.
function projet() {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  const poser = (dossier: string, f: string, texte: string) => {
    mkdirSync(path.dirname(path.join(dossier, f)), { recursive: true });
    writeFileSync(path.join(dossier, f), texte);
  };
  const interfaceDe = (nom: string, phrase: string) => `# ${nom}\n\n${phrase}\n`;
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  poser(racine, '.gitignore', '.claude/worktrees/\n');
  poser(
    racine,
    'package.json',
    JSON.stringify({ name: 'p', private: true, workspaces: ['packages/*'] })
  );
  poser(racine, 'docs/ARCHITECTURE.md', architecture({ moteur: 'typescript', site: 'typescript' }));
  for (const nom of ['moteur', 'site']) {
    poser(racine, `packages/${nom}/package.json`, JSON.stringify({ name: nom }));
    poser(racine, `packages/${nom}/docs/INTERFACE.md`, interfaceDe(nom, 'La base.'));
  }
  poser(racine, INDEX, '# Index des interfaces\n\nla base\n');
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'base');
  const copie = path.join(racine, '.claude/worktrees/demo-1');
  git(racine, 'worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
  // One side changes the interface of <nom>, and the index with it.
  const changer = (dossier: string, nom: string, phrase: string) => {
    poser(dossier, `packages/${nom}/docs/INTERFACE.md`, interfaceDe(nom, phrase));
    poser(dossier, INDEX, `# Index des interfaces\n\n${phrase}\n`);
  };
  return { racine, copie, changer };
}

describe('la liste du cadre, sans référence donnée', () => {
  it('the index of the interfaces main and the copy both changed is generated again, without conflict', () => {
    const p = projet();
    p.changer(p.copie, 'site', 'Le catalogue de la copie.');
    p.changer(p.racine, 'moteur', 'Le son de main.');
    git(p.racine, 'commit', '-qam', 'main moteur');
    const main = git(p.racine, 'rev-parse', 'HEAD');
    const dit: string[] = [];
    const r = avancer(p.copie, main, { dire: (s: string) => dit.push(s) });
    expect(r, r.message).toEqual({ ok: true, message: '' });
    expect(dit).toEqual([]);
    expect(git(p.copie, 'rev-parse', 'HEAD')).toBe(main);
    expect(git(p.copie, 'diff', '--name-only', '--diff-filter=U')).toBe('');
    const index = readFileSync(path.join(p.copie, INDEX), 'utf8');
    expect(index).not.toMatch(/^(<{7}|>{7}) /m);
    expect(index).toContain('Le son de main. (`packages/moteur/docs/INTERFACE.md`)');
    expect(index).toContain('Le catalogue de la copie. (`packages/site/docs/INTERFACE.md`)');
  });

  it('the turbo.json of a package main and the copy both changed is generated again, without conflict', () => {
    const p = projet();
    const SIEN = 'packages/site/turbo.json';
    const poser = (dossier: string, tache: string) =>
      writeFileSync(
        path.join(dossier, SIEN),
        `${JSON.stringify({ extends: ['//'], tasks: { [tache]: {} } })}\n`
      );
    writeFileSync(
      path.join(p.racine, 'turbo.json'),
      `${JSON.stringify({ tasks: { build: {} } })}\n`
    );
    poser(p.racine, 'base');
    git(p.racine, 'add', '-A');
    git(p.racine, 'commit', '-qm', 'turbo');
    git(p.copie, 'merge', '-q', '--ff-only', 'main');
    poser(p.copie, 'copie');
    poser(p.racine, 'main');
    git(p.racine, 'commit', '-qam', 'main turbo');
    const main = git(p.racine, 'rev-parse', 'HEAD');
    const dit: string[] = [];
    const r = avancer(p.copie, main, { dire: (s: string) => dit.push(s) });
    expect(r, r.message).toEqual({ ok: true, message: '' });
    expect(dit).toEqual([]);
    expect(git(p.copie, 'diff', '--name-only', '--diff-filter=U')).toBe('');
    const sien = readFileSync(path.join(p.copie, SIEN), 'utf8');
    expect(sien).not.toMatch(/^(<{7}|>{7}) /m);
    // The generator's own text: neither side's task survives.
    expect(sien.startsWith('// Généré')).toBe(true);
    expect(sien).not.toContain('"copie"');
    expect(sien).not.toContain('"main"');
  });

  it('lists, for a project of TypeScript, the frame’s references with what each reads and writes in full', () => {
    const lesReferences = activites.lesReferences as (
      ctx: object
    ) => { nom: string; fichiers: string[]; lit: string[]; entiers: string[]; cadre: boolean }[];
    const duCadre = lesReferences(depotDeReferences(ESSAIS, [])).filter(r => r.cadre);
    expect(duCadre.map(r => r.nom)).toEqual([
      "l'index des interfaces",
      'les turbo.json des paquets',
      "les rapports d'API",
      'le verrou des dépendances',
      'la dette des gardes',
    ]);
    const [index, turbo, api, verrou, dette] = duCadre;
    // The npm lock: written in full from the package.json of the root and of the packages, by
    // npm without the registry's audit, and judged by the guard of the lock.
    expect(verrou).toMatchObject({
      fichiers: ['package-lock.json'],
      entiers: ['package-lock.json'],
      commande: 'npm install --package-lock-only --no-audit --no-fund',
      gardes: ['verrou-des-dependances'],
    });
    expect(verrou!.lit).toEqual(expect.arrayContaining(['package.json', '**/package.json']));
    // The index reads the interfaces whose generated part the API reports write.
    expect(index!.lit).toContain('**/docs/INTERFACE.md');
    expect(api!.fichiers).toContain('docs/INTERFACE.md');
    expect(index!.entiers).toEqual(['docs/agents/index-des-interfaces.md']);
    expect(turbo!.entiers).toEqual(['*/**/turbo.json']);
    expect(api!.entiers).toEqual([]);
    expect(dette!.fichiers).toEqual(['grillhouse-dette.json']);
  });

  it('a copy that declares no language is advanced, its references merged, and the fault is said', () => {
    const d = depot();
    d.ecrire('a.txt', lignes('COPIE'));
    const main = d.ajouterSurMain();
    const dit: string[] = [];
    const r = avancer(d.copie, main, { dire: (s: string) => dit.push(s) });
    expect(r, r.message).toEqual({ ok: true, message: '' });
    expect(d.lire('a.txt')).toBe(lignes('COPIE'));
    expect(dit).toHaveLength(1);
    expect(dit[0]).toContain(`⚠ Les références du cadre ne se lisent pas dans la copie ${d.copie}`);
    expect(dit[0]).toContain('ne déclare aucun langage');
  });
});
