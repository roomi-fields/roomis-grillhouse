// grillhouse-tkv — two lots that each add an entry under the same heading of the CHANGELOG both
// enter main. The frame's merge driver of the CHANGELOG (scripts/fusion-du-changelog.mjs), as
// gnulib's git-merge-changelog: `.gitattributes` names it for CHANGELOG.md, the repository's
// configuration runs it, and every three-way path of git takes it (the integration's
// `git apply --3way --index`, the relaunch's `git apply --3way`, the copy's
// `git merge --ff-only --autostash`). A conflict made of additions alone keeps both, the main's
// first; any other conflict stays a conflict. The update (`grillhouse maj`) and the template bring
// it to each project, and Grillhouse holds it too. Medium tests: git runs in repositories of trial.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ATTRIBUT, PILOTE, poserLePilote } from '../../scripts/fusion-du-changelog.mjs';
import { poserCrochets } from '../../scripts/crochets.mjs';
import { mettreAJour } from '../../scripts/grillhouse-maj.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'fusion-du-changelog-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../../../..');
const COMMANDE = path.join(DEPOT, 'packages/grillhouse/bin/grillhouse.mjs');

const git = (racine: string, ...a: string[]) =>
  spawnSync('git', ['-C', racine, '-c', 'user.email=e@example.com', '-c', 'user.name=e', ...a], {
    encoding: 'utf8',
  });
const ok = (racine: string, ...a: string[]) => {
  const r = git(racine, ...a);
  if (r.status !== 0) {
    throw new Error(`git ${a.join(' ')} : ${r.stderr}`);
  }
  return r.stdout;
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const ecrire = (racine: string, f: string, t: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), t);
};

const changelog = (...entrees: string[]) =>
  `# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n${entrees.map(e => `- ${e}\n`).join('')}\n## [0.1.0] - 2026-10-01\n\n- First.\n`;
const BASE = 'An entry already there.';
const A = '**The main’s entry** (t-a): its words, kept as they are.';
const B = '**The lot’s entry** (t-b): its words, kept as they are.';

// A repository of trial whose project holds the frame's command (node_modules/.bin/grillhouse) and
// the driver, as `grillhouse maj` leaves it: main holds A under the heading, and <lot> is the
// patch of B from the base, as the circuit builds it from the ticket's copy.
function depot(entreesDuLot: string[], entreesDeMain: string[]) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  ok(racine, 'init', '-q', '-b', 'main');
  ecrire(racine, '.gitignore', 'node_modules\n');
  mkdirSync(path.join(racine, 'node_modules/.bin'), { recursive: true });
  symlinkSync(COMMANDE, path.join(racine, 'node_modules/.bin/grillhouse'));
  ecrire(racine, '.gitattributes', `${ATTRIBUT}\n`);
  ecrire(racine, 'CHANGELOG.md', changelog(BASE));
  ok(racine, 'add', '-A');
  ok(racine, 'commit', '-q', '-m', 'base');
  poserLePilote(racine);
  ecrire(racine, 'CHANGELOG.md', changelog(...entreesDuLot));
  const lot = path.join(racine, '..', `${path.basename(racine)}.patch`);
  writeFileSync(lot, ok(racine, 'diff'));
  ok(racine, 'checkout', '-q', '--', 'CHANGELOG.md');
  ecrire(racine, 'CHANGELOG.md', changelog(...entreesDeMain));
  ok(racine, 'commit', '-q', '-a', '-m', 'main');
  return { racine, lot };
}

const marques = (t: string) => /^(<{7}|={7}|>{7})/m.test(t);

describe('grillhouse-tkv, critère 1 — deux ajouts sous le même titre entrent tous deux', () => {
  it('the integration’s apply (--3way --index) keeps both entries word for word, main’s first', () => {
    const { racine, lot } = depot([B, BASE], [A, BASE]);
    const r = git(racine, 'apply', '--3way', '--index', lot);
    expect(r.status, r.stderr).toBe(0);
    expect(ok(racine, 'ls-files', '-u')).toBe('');
    expect(lire(racine, 'CHANGELOG.md')).toBe(changelog(A, B, BASE));
  });

  it('the relaunch’s apply (--3way) keeps both, nothing left unmerged', () => {
    const { racine, lot } = depot([B, BASE], [A, BASE]);
    const r = git(racine, 'apply', '--3way', lot);
    expect(r.status, r.stderr).toBe(0);
    expect(ok(racine, 'ls-files', '-u')).toBe('');
    expect(lire(racine, 'CHANGELOG.md')).toBe(changelog(A, B, BASE));
  });

  it('the copy brought to main (merge --ff-only --autostash) keeps its entry and main’s', () => {
    const { racine, lot } = depot([B, BASE], [A, BASE]);
    ok(racine, 'checkout', '-q', '-b', 'copie', 'HEAD~1');
    ok(racine, 'apply', lot);
    const r = git(racine, 'merge', '-q', '--ff-only', '--autostash', 'main');
    expect(r.status, r.stderr).toBe(0);
    expect(ok(racine, 'diff', '--name-only', '--diff-filter=U')).toBe('');
    expect(lire(racine, 'CHANGELOG.md')).toBe(changelog(A, B, BASE));
  });

  it('several entries on each side are all kept, each block as its side wrote it', () => {
    const B2 = '**A second entry of the lot** (t-b).';
    const A2 = '**A second entry of main** (t-a2).';
    const { racine, lot } = depot([B, B2, BASE], [A, A2, BASE]);
    expect(git(racine, 'apply', '--3way', '--index', lot).status).toBe(0);
    expect(lire(racine, 'CHANGELOG.md')).toBe(changelog(A, A2, B, B2, BASE));
  });
});

describe('grillhouse-tkv, critère 2 — un autre conflit du CHANGELOG arrête toujours', () => {
  it('one line changed on both sides stays a conflict, both versions marked', () => {
    const { racine, lot } = depot([`${BASE} Changed by the lot.`], [`${BASE} Changed on main.`]);
    const r = git(racine, 'apply', '--3way', '--index', lot);
    expect(r.status).not.toBe(0);
    expect(ok(racine, 'ls-files', '-u')).toContain('CHANGELOG.md');
    const texte = lire(racine, 'CHANGELOG.md');
    expect(marques(texte)).toBe(true);
    expect(texte).toContain(`${BASE} Changed by the lot.`);
    expect(texte).toContain(`${BASE} Changed on main.`);
  });

  it('an addition beside a line the other side changes stays a conflict', () => {
    const { racine, lot } = depot([B], [`${BASE} Changed on main.`]);
    const r = git(racine, 'apply', '--3way', '--index', lot);
    expect(r.status).not.toBe(0);
    expect(ok(racine, 'ls-files', '-u')).toContain('CHANGELOG.md');
    expect(marques(lire(racine, 'CHANGELOG.md'))).toBe(true);
  });

  it('without the frame’s command, git’s own merge marks the conflict of additions', () => {
    const { racine, lot } = depot([B, BASE], [A, BASE]);
    rmSync(path.join(racine, 'node_modules'), { recursive: true, force: true });
    const r = git(racine, 'apply', '--3way', lot);
    expect(r.status).not.toBe(0);
    const texte = lire(racine, 'CHANGELOG.md');
    expect(marques(texte)).toBe(true);
    expect(texte).toContain(A);
    expect(texte).toContain(B);
  });
});

describe('grillhouse-tkv, critère 3 — le gabarit, la mise à jour et Grillhouse portent le pilote', () => {
  const projet = (fichiers: Record<string, string>) => {
    const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
    ecrire(racine, 'package.json', '{ "name": "p" }\n');
    ecrire(racine, 'tsconfig.json', '{}\n');
    for (const [f, t] of Object.entries(fichiers)) {
      ecrire(racine, f, t);
    }
    ok(racine, 'init', '-q', '-b', 'main');
    return racine;
  };

  it('maj writes the attribute in a project without .gitattributes, and the driver in its git', () => {
    const racine = projet({});
    mettreAJour(racine, DEPOT);
    expect(lire(racine, '.gitattributes')).toBe(`${ATTRIBUT}\n`);
    const pilote = ok(racine, 'config', '--local', `merge.${PILOTE}.driver`).trim();
    expect(pilote).toContain(path.join(racine, 'node_modules/.bin/grillhouse'));
    expect(pilote).toContain('fusion-du-changelog %O %A %B');
  });

  it('maj adds the attribute after the project’s own lines, once', () => {
    const racine = projet({ '.gitattributes': '*.png binary' });
    mettreAJour(racine, DEPOT);
    mettreAJour(racine, DEPOT);
    expect(lire(racine, '.gitattributes')).toBe(`*.png binary\n${ATTRIBUT}\n`);
  });

  it('the driver written from a copy names the main tree’s command, the same', () => {
    const racine = projet({});
    ecrire(racine, 'README.md', 'p\n');
    ok(racine, 'add', '-A');
    ok(racine, 'commit', '-q', '-m', 'p');
    const copie = path.join(ESSAIS, `${path.basename(racine)}-copie`);
    ok(racine, 'worktree', 'add', '-q', copie);
    poserLePilote(copie);
    expect(ok(racine, 'config', '--local', `merge.${PILOTE}.driver`)).toContain(
      path.join(racine, 'node_modules/.bin/grillhouse')
    );
  });

  it('the template of a project and Grillhouse hold the attribute; their prepare places the driver', () => {
    expect(lire(DEPOT, 'templates/projet/.gitattributes')).toContain(`${ATTRIBUT}\n`);
    expect(lire(DEPOT, '.gitattributes')).toContain(`${ATTRIBUT}\n`);
    for (const f of [
      'package.json',
      'templates/projet/package.json',
      'templates/cargo/package.json',
    ]) {
      const prepare = (JSON.parse(lire(DEPOT, f)) as { scripts: Record<string, string> }).scripts
        .prepare;
      expect(prepare.split(/\s*&&\s*/), f).toContain('grillhouse hooks');
    }
  });

  it('the hooks’ placing (grillhouse hooks, the prepare of each install) places the driver', () => {
    const racine = projet({});
    poserCrochets(racine);
    expect(ok(racine, 'config', '--local', `merge.${PILOTE}.driver`)).toContain(
      'fusion-du-changelog'
    );
  });
});
