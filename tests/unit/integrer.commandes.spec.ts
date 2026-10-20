import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  chantier,
  chantierDependances,
  construireParLiens,
  INTEGRER_SCRIPT,
  suitesParLiens,
} from './integration-essai.js';

// The integration of a ticket's lot (scripts/integration/integrer.mjs,
// tests/unit/integrer.spec.ts): the commands of the project in its copy, which leave its index up
// to date (grillhouse-3uv.73), install a changed manifest and are judged by their status
// (grillhouse-3uv.56).
// The trial harness: ./integration-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'integrer-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// grillhouse-3uv.73: every command of the project in the copy of the replay passes through
// `lancer` (scripts/integration/rejeu.mjs), which leaves the index of the copy up to date after it,
// green or red, as git's own scripts refresh before they judge (`git update-index -q --refresh`,
// require_clean_work_tree). The trial build (./integration-essai.ts, `construireParLiens`), which
// `npm run verifier` plays before the guards and the tests as Turborepo does, and the trial suites of
// critère 8 (`suitesParLiens`) hard-link tracked files: the link changes their ctime after the
// copy wrote its index, and `git commit` or `git apply --index` would then take them for modified.
describe('grillhouse-3uv.73 — every command of the project leaves the index of its copy up to date', () => {
  const LONG_73 = 120_000;
  const COPIE = (repo: string) => path.join(repo, '.claude/worktrees/integration');
  // The files of the integration copy whose stat no longer matches its index, without refreshing it.
  const perimes = (repo: string) =>
    execFileSync('git', ['-C', COPIE(repo), 'diff-files', '--name-only'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
  const fichiersDe = (m: ReturnType<typeof chantier>, ref: string) =>
    m.git('ls-tree', '-r', '--name-only', ref).trim().split('\n');
  // The integration of <id> under the C locale: git's own words are read in English.
  const integrerC = (m: ReturnType<typeof chantier>, id: string) =>
    spawnSync('node', [INTEGRER_SCRIPT, ...m.argsIntegrer(id)], {
      cwd: m.repo,
      encoding: 'utf8',
      env: { ...m.env, LC_ALL: 'C', LANG: 'C' },
    });

  it(
    'critère 1: a lot that deletes a tracked file the build of the base hard-linked is committed',
    () => {
      const m = chantier(ESSAIS);
      const builds = construireParLiens(m);
      m.ticket('demo-1', { 'src/a/donnees.txt': null });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/✓ commit/);
      expect(builds()).toContain('lien');
      expect(fichiersDe(m, 'agent/demo-1')).not.toContain('src/a/donnees.txt');
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
    },
    LONG_73
  );
  it(
    'critère 1: a lot that deletes a hard-linked file of the shared test material (the tests lot) and a hard-linked file of code is committed',
    () => {
      const m = chantier(ESSAIS);
      construireParLiens(m);
      m.ticket('demo-1', { 'src/a/tests/fixture.txt': null, 'src/a/donnees.txt': null });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const restants = fichiersDe(m, 'agent/demo-1');
      expect(restants).not.toContain('src/a/tests/fixture.txt');
      expect(restants).not.toContain('src/a/donnees.txt');
    },
    LONG_73
  );
  it(
    'critère 2: a lot that modifies a tracked file the build of the base hard-linked is committed',
    () => {
      const m = chantier(ESSAIS);
      construireParLiens(m);
      m.ticket('demo-1', { 'src/a/donnees.txt': 'un\nDEUX\ntrois\n' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.git('show', 'agent/demo-1:src/a/donnees.txt')).toBe('un\nDEUX\ntrois\n');
    },
    LONG_73
  );
  it(
    'critère 2: a lot that modifies a hard-linked file of the tests lot and one of the code lot is committed',
    () => {
      const m = chantier(ESSAIS);
      construireParLiens(m);
      m.ticket('demo-1', {
        'src/a/tests/fixture.txt': 'f1\nF2\n',
        'src/a/donnees.txt': 'UN\ndeux\ntrois\n',
      });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.git('show', 'agent/demo-1:src/a/tests/fixture.txt')).toBe('f1\nF2\n');
      expect(m.git('show', 'agent/demo-1:src/a/donnees.txt')).toBe('UN\ndeux\ntrois\n');
    },
    LONG_73
  );
  it(
    'critère 5: a red build of the lot, in npm run verifier, refreshes the index of its copy before the refusal',
    () => {
      const m = chantier(ESSAIS);
      const builds = construireParLiens(m);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n', CONSTRUCTION_ROUGE: '' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/⛔ Les tests refusent le lot/);
      expect(builds()).toEqual(['lien']);
      expect(perimes(m.repo)).toEqual([]);
    },
    LONG_73
  );
  it(
    'critère 6: a lot that does not apply on HEAD to a hard-linked file is refused with the message of a lot that does not apply, git naming the conflict',
    () => {
      const m = chantier(ESSAIS);
      construireParLiens(m);
      m.ticket('demo-1', { 'src/a/donnees.txt': 'un\nDEUX\ntrois\n' });
      m.poser({ 'src/a/donnees.txt': 'un\nAUTRE\ntrois\n' }, 'main bouge');
      const branche = m.sha('agent/demo-1');
      const r = integrerC(m, 'demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/⛔ Le lot \S+code\.patch ne s'applique pas :\n/);
      expect(r.stdout).toMatch(/conflict/i);
      expect(r.stdout).not.toMatch(/does not match index/);
      expect(r.stdout).toMatch(/Le lot retourne à son agent/);
      expect(m.sha('agent/demo-1')).toBe(branche);
    },
    LONG_73
  );
  it(
    'critère 6: a lot that does not apply on HEAD to a file the build did not link is refused with the same message',
    () => {
      const m = chantier(ESSAIS);
      construireParLiens(m);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.poser({ 'src/a/index.ts': 'export const a = 2;\n' }, 'main bouge');
      const r = integrerC(m, 'demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/⛔ Le lot \S+code\.patch ne s'applique pas :\n/);
      expect(r.stdout).toMatch(/conflict/i);
    },
    LONG_73
  );
  it(
    'critère 8: a lot that deletes a tracked file the tests (not the build) hard-link is committed',
    () => {
      const m = chantier(ESSAIS);
      const liens = suitesParLiens(m);
      m.ticket('demo-1', { 'src/a/donnees.txt': null });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toMatch(/✓ commit/);
      expect(liens()).toContain('lien');
      expect(fichiersDe(m, 'agent/demo-1')).not.toContain('src/a/donnees.txt');
      expect(m.sujets('agent/demo-1')[0]).toBe('feat: lot (demo-1)');
    },
    LONG_73
  );
  it(
    'critère 8: a lot that modifies a tracked file the tests (not the build) hard-link is committed',
    () => {
      const m = chantier(ESSAIS);
      const liens = suitesParLiens(m);
      m.ticket('demo-1', { 'src/a/donnees.txt': 'un\nDEUX\ntrois\n' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(liens()).toContain('lien');
      expect(m.git('show', 'agent/demo-1:src/a/donnees.txt')).toBe('un\nDEUX\ntrois\n');
    },
    LONG_73
  );
  it(
    'critère 8: a lot that deletes a hard-linked file of the tests lot and modifies a hard-linked file of code is committed',
    () => {
      const m = chantier(ESSAIS);
      suitesParLiens(m);
      m.ticket('demo-1', {
        'src/a/tests/fixture.txt': null,
        'src/a/donnees.txt': 'UN\ndeux\ntrois\n',
      });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(fichiersDe(m, 'agent/demo-1')).not.toContain('src/a/tests/fixture.txt');
      expect(m.git('show', 'agent/demo-1:src/a/donnees.txt')).toBe('UN\ndeux\ntrois\n');
    },
    LONG_73
  );
  it(
    'critère 5: red tests of the lot that hard-link tracked files leave the index of the copy up to date before the refusal',
    () => {
      const m = chantier(ESSAIS);
      const liens = suitesParLiens(m);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n', ROUGES_FORCES: 'a > t\n' });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/⛔ Les tests refusent le lot/);
      expect(liens()).toHaveLength(1);
      expect(perimes(m.repo)).toEqual([]);
    },
    LONG_73
  );
  it('critère 4: the refresh lives in `lancer` of rejeu.mjs, after the command, and nowhere else in scripts/integration/', () => {
    const dossier = path.resolve(__dirname, '../../scripts/integration');
    // The code of a script, its comments removed: the texts may name the refresh (critère 7).
    const code = (f: string) =>
      readFileSync(path.join(dossier, f), 'utf8')
        .replace(/\/\*[^]*?\*\//g, '')
        .split('\n')
        .map(l => l.replace(/(^|\s)\/\/.*$/, ''));
    const RAFRAICHIT = /update-index|['"`]--refresh['"`]/;
    const porteurs = execFileSync('ls', [dossier], { encoding: 'utf8' })
      .split('\n')
      .filter(f => /\.[cm]?js$/.test(f))
      .filter(f => code(f).some(l => RAFRAICHIT.test(l)));
    expect(porteurs).toEqual(['rejeu.mjs']);
    const lignes = code('rejeu.mjs');
    const debut = lignes.findIndex(l => /\b(const|let|function)\s+lancer\b/.test(l));
    expect(debut).toBeGreaterThanOrEqual(0);
    const retrait = /^\s*/.exec(lignes[debut])![0].length;
    let fin = debut + 1;
    while (
      fin < lignes.length &&
      (lignes[fin].trim() === '' ||
        /^\s*/.exec(lignes[fin])![0].length > retrait ||
        /^\s*[)}\]]/.test(lignes[fin]))
    ) {
      fin++;
    }
    const corps = lignes.slice(debut, fin);
    const dans = corps.filter(l => RAFRAICHIT.test(l));
    const partout = lignes.filter(l => RAFRAICHIT.test(l));
    expect(dans.length).toBeGreaterThan(0);
    expect(partout).toEqual(dans);
    // After the command: the refresh follows the call that runs it.
    const commande = corps.findIndex(l => /\bspawnSync\s*\(/.test(l));
    expect(commande).toBeGreaterThanOrEqual(0);
    expect(corps.findIndex(l => RAFRAICHIT.test(l))).toBeGreaterThan(commande);
  });
});

// grillhouse-3uv.56 critère 12: a lot that changes a manifest (package.json) without changing
// package-lock.json passes through the installation of the replay copy as a changed lock file does:
// the continuous integration (actions/setup-node) runs `npm ci` at every pass, which refuses a
// lock file in disagreement with its manifest.
describe('grillhouse-3uv.56 critère 12 — a changed manifest is installed as a changed lock file', () => {
  const D = 180_000;
  it(
    'critère 12: a lot whose package.json adds a workspace the unchanged lock file lacks is refused',
    () => {
      const m = chantierDependances(ESSAIS);
      const neuf = m.fichiers({ ...m.initial, espaces: { ...m.initial.espaces, 'src/d': 'd' } });
      m.ticket('demo-1', {
        'package.json': neuf['package.json'],
        'src/d/package.json': neuf['src/d/package.json'],
      });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toContain("⛔ Les dépendances de la copie ne s'installent pas.");
    },
    D
  );
  it(
    'critère 12: a lot whose package.json changes the version of an external dependency, the lock file unchanged, is refused',
    () => {
      const m = chantierDependances(ESSAIS);
      const neuf = m.fichiers({ ...m.initial, externe: '2.0.0' });
      m.ticket('demo-1', { 'package.json': neuf['package.json'] });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toContain("⛔ Les dépendances de la copie ne s'installent pas.");
    },
    D
  );
  it(
    'critère 12: a lot whose workspace manifest adds an external dependency the unchanged lock file lacks is refused',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', {
        'src/a/package.json': JSON.stringify(
          {
            name: 'a',
            version: '1.0.0',
            dependencies: { 'ext-lib': 'file:../../vendor/ext-lib-2.0.0.tgz' },
          },
          null,
          2
        ),
      });
      const r = m.integrer('demo-1');
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toContain("⛔ Les dépendances de la copie ne s'installent pas.");
    },
    D
  );
  it(
    'critère 12: a lot whose package.json changes in agreement with the unchanged lock file runs npm ci, and is committed',
    () => {
      const m = chantierDependances(ESSAIS);
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      m.poserMarque('integration');
      const pkg = JSON.parse(m.fichiers(m.initial)['package.json']!) as { description?: string };
      pkg.description = 'un essai';
      m.ticket('demo-2', { 'package.json': JSON.stringify(pkg, null, 2) });
      const r = m.integrer('demo-2');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets('agent/demo-2')[0]).toBe('feat: lot (demo-2)');
      expect(m.marquee('integration')).toBe(false);
    },
    D
  );
  // Arbitrage of the regulator (comment « suite au RENDU du relecteur »): the fingerprint reads every
  // package.json git tracks, whatever pattern of the root's `workspaces` declares it. Each form of
  // pattern npm reads: `**` for zero folders or more, a brace list, `?` for one character.
  for (const motifs of [['packages/**/*'], ['packages/{p1,q1}'], ['packages/p?', 'packages/q?']]) {
    it(
      `critère 12: a workspace declared by ${motifs.join(', ')} whose manifest adds an external dependency the unchanged lock file lacks is refused`,
      () => {
        const m = chantierDependances(ESSAIS, {
          espaces: { 'packages/p1': 'p1', 'packages/q1': 'q1' },
          motifs,
        });
        m.ticket('demo-1', {
          'packages/p1/package.json': JSON.stringify(
            {
              name: 'p1',
              version: '1.0.0',
              dependencies: { 'ext-lib': 'file:../../vendor/ext-lib-2.0.0.tgz' },
            },
            null,
            2
          ),
        });
        const r = m.integrer('demo-1');
        expect(r.status, r.stdout + r.stderr).toBe(1);
        expect(r.stdout).toContain("⛔ Les dépendances de la copie ne s'installent pas.");
      },
      D
    );
  }
});

// grillhouse-3uv.56 critère 11: a failed installation comes up in one form, the refusals of the
// replay module: guards that fail in `npm run verifier` while writing the text of an installation refusal
// are red tests, not an installation that fails.
describe('grillhouse-3uv.56 critère 11 — the integration judges npm run verifier by its status', () => {
  it('critère 11: red guards writing the text of an installation refusal refuse the lot as red tests', () => {
    const m = chantier(ESSAIS);
    m.poser(
      {
        'gardes.mjs': `import fs from 'node:fs';\nprocess.stderr.write("Les dépendances de la copie ne s'installent pas.\\n");\nprocess.exit(fs.existsSync('GARDE_ROUGE') ? 1 : 0);\n`,
      },
      'gardes bavardes'
    );
    m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n', GARDE_ROUGE: '' });
    const r = m.integrer('demo-1');
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain('⛔ Les tests refusent le lot');
    expect(r.stdout).not.toContain("⛔ Les dépendances de la copie ne s'installent pas.");
  }, 120_000);
});
