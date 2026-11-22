// The standard output of the preparation of a copy is its data: the list of the shared submodules
// its pose fixes, which the launcher reads (`partages=$(… preparer …)` of
// scripts/enveloppe/lancer.sh) and gives to every mount. The output of the command of a generated
// file (`grillhouse.engendres`) the advance plays again is a message: it goes to the log of the
// preparation (the file descriptor `sortie` of `preparer`, `dire` of `avancer` and of `reporter`),
// never to the standard output. Witness: BPScript, 2026-11-22, bp-mono-vbwf.320.6.2.3, its lock file
// declared a generated file (« npm install --package-lock-only --ignore-scripts »): the output of
// npm entered the list, and the mount refused it on « usage: sous-modules.sh … ».
//
// Each case plays the real git in a repository of trial, and reads what the process writes on its
// standard output.
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { avancer, preparer, reporter } from '../../scripts/enveloppe/travail-de-la-copie.mjs';
import { regenerer } from '../../scripts/engendres.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'sortie-de-la-regeneration-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};

const LISTE = `import fs from 'node:fs';
fs.writeFileSync('liste.txt', fs.readdirSync('src').sort().join('\\n') + '\\n');
`;
// What the command of the generated file says, as npm says « added 1 package »: a line on its
// standard output, another on its error output.
const DIT = 'added 1 package in 2s';
const AVERTIT = 'npm warn deprecated';
const COMMANDE = `echo "${DIT}"; echo "${AVERTIT}" >&2; node liste.mjs`;

// The repository of trial: liste.txt, the list of the folder src, a generated file the project
// declares, written by COMMANDE; the copy of demo-1 at its HEAD.
function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  writeFileSync(path.join(racine, '.gitignore'), '.claude/worktrees/\n');
  writeFileSync(
    path.join(racine, 'package.json'),
    JSON.stringify({
      name: 'essai',
      grillhouse: {
        engendres: { liste: { commande: COMMANDE, fichiers: ['liste.txt'], lit: ['src/**'] } },
      },
    })
  );
  writeFileSync(path.join(racine, 'liste.mjs'), LISTE);
  mkdirSync(path.join(racine, 'src'));
  writeFileSync(path.join(racine, 'src/a.txt'), 'a\n');
  writeFileSync(path.join(racine, 'liste.txt'), 'a.txt\n');
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'base');
  const copie = path.join(racine, '.claude/worktrees/demo-1');
  git(racine, 'worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
  // An installation in place: the preparation installs nothing.
  mkdirSync(path.join(copie, 'node_modules'));
  const lire = (f: string) => readFileSync(path.join(copie, f), 'utf8');
  // The copy gains the source c, and its list.
  const ajouterDansLaCopie = () => {
    writeFileSync(path.join(copie, 'src/c.txt'), 'c\n');
    git(copie, 'add', 'src/c.txt');
    writeFileSync(path.join(copie, 'liste.txt'), 'a.txt\nc.txt\n');
  };
  // Main gains the source b, and its list.
  const ajouterSurMain = () => {
    writeFileSync(path.join(racine, 'src/b.txt'), 'b\n');
    writeFileSync(path.join(racine, 'liste.txt'), 'a.txt\nb.txt\n');
    git(racine, 'add', '-A');
    git(racine, 'commit', '-qm', 'main b');
    return git(racine, 'rev-parse', 'HEAD');
  };
  return { racine, copie, lire, ajouterDansLaCopie, ajouterSurMain };
}

// What the process writes on its standard output while <jouer> plays, and what <jouer> returns.
function sortieStandardDe<R>(jouer: () => R) {
  const ecrits: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((morceau: string | Uint8Array) => {
    ecrits.push(String(morceau));
    return true;
  }) as never);
  try {
    return { rendu: jouer(), ecrit: ecrits.join('') };
  } finally {
    vi.restoreAllMocks();
  }
}

describe('the output of a command played again at the advance of a copy goes to the log, not to the list of the shared submodules', () => {
  it('preparer writes the output of the command on its descriptor « sortie », none of it on the standard output nor in the list', () => {
    const d = depot();
    d.ajouterDansLaCopie();
    const main = d.ajouterSurMain();
    const journal = path.join(d.racine, 'journal.log');
    const fd = openSync(journal, 'a');
    let joue;
    try {
      joue = sortieStandardDe(() => preparer(d.copie, main, { sortie: fd }));
    } finally {
      closeSync(fd);
    }
    expect(joue.rendu, joue.rendu.message).toEqual({ ok: true, message: '', partages: '' });
    // The command played: both sources listed.
    expect(d.lire('liste.txt')).toBe('a.txt\nb.txt\nc.txt\n');
    expect(joue.ecrit).toBe('');
    const ecritAuJournal = readFileSync(journal, 'utf8');
    expect(ecritAuJournal).toContain(DIT);
    expect(ecritAuJournal).toContain(AVERTIT);
  });

  it('avancer gives the output of the command to « dire », none of it on the standard output', () => {
    const d = depot();
    d.ajouterDansLaCopie();
    const main = d.ajouterSurMain();
    const dits: string[] = [];
    const joue = sortieStandardDe(() => avancer(d.copie, main, { dire: t => void dits.push(t) }));
    expect(joue.rendu, joue.rendu.message).toEqual({ ok: true, message: '' });
    expect(d.lire('liste.txt')).toBe('a.txt\nb.txt\nc.txt\n');
    expect(joue.ecrit).toBe('');
    expect(dits.join('')).toContain(DIT);
    expect(dits.join('')).toContain(AVERTIT);
  });

  it('reporter gives the output of the command to « dire », none of it on the standard output', () => {
    const d = depot();
    const base = git(d.racine, 'rev-parse', 'HEAD');
    d.ajouterDansLaCopie();
    git(d.copie, 'add', '-A');
    git(d.copie, 'commit', '-qm', 'lot');
    const pointe = git(d.copie, 'rev-parse', 'HEAD');
    const main = d.ajouterSurMain();
    git(d.copie, 'reset', '-q', '--hard', main);
    const dits: string[] = [];
    const joue = sortieStandardDe(() =>
      reporter(d.copie, { base, pointe, dire: t => void dits.push(t) })
    );
    expect(joue.rendu.ok, joue.rendu.message).toBe(true);
    expect(d.lire('liste.txt')).toBe('a.txt\nb.txt\nc.txt\n');
    expect(joue.ecrit).toBe('');
    expect(dits.join('')).toContain(DIT);
  });
});

describe('regenerer called without « ecrire », as the integration and the queue call it', () => {
  it('writes the output of a command that passes on the standard output', () => {
    const resultat = (stdout: string) =>
      ({ status: 0, stdout, stderr: '', signal: null, error: undefined }) as never;
    const joue = sortieStandardDe(() =>
      regenerer({
        refs: [{ nom: 'liste', commande: 'node liste.mjs', fichiers: ['liste.txt'] }],
        lancer: () => resultat(`${DIT}\n`),
        dansCopie: () => resultat(''),
      })
    );
    expect(joue.rendu).toBeNull();
    expect(joue.ecrit).toBe(`${DIT}\n`);
  });
});
