import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap } from '../machine.js';
import {
  git,
  LANCER,
  SCRIPTS,
  LONG,
  ecrituresFautives,
  Paquet,
  sousModulesEssai,
} from './sous-modules-essai.js';

// grillhouse-3uv.58.1: a shared submodule (grillhouse.partage) is read from the main repository,
// read-only, in each copy: its link, its status, its writes refused, its preparation, its
// declaration and its absence (critères 1 to 14). The preparation of the copies:
// tests/unit/sous-modules.spec.ts.
// The worlds of trial and the frame's scripts they run: ./sous-modules-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'sous-modules-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { ENV_SCRIPTS, mondePartage, pathSansBwrap, pathBwrapRefuse } = sousModulesEssai(ESSAIS);

const RETIRER = path.join(SCRIPTS, 'retirer-copie.sh');

describe('grillhouse-3uv.58.1 critères 1 et 7 — a shared submodule is read from the main repository', () => {
  it(
    'critère 7: the preparation of a fresh copy links each path of grillhouse.partage to the same path of the main repository, marked skip-worktree',
    () => {
      const m = mondePartage();
      const copie = m.copieFraiche('fraiche');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      expect(git(copie, 'ls-files', '-v', '--', 'vendor/natif')).toMatch(/^S vendor\/natif$/m);
      // What the copy reads is the main repository's submodule, its untracked file included.
      expect(existsSync(path.join(copie, 'vendor/natif/principal-non-suivi.txt'))).toBe(true);
    },
    LONG
  );
  it(
    'critère 1: a prepared copy reads the main repository’s submodule at its usual path, and its build sees it',
    () => {
      const m = mondePartage();
      // The main repository's submodule is checked out at v2; HEAD references v1.
      git(m.principalNatif, 'checkout', '-q', m.commits[1] ?? '');
      const copie = m.copieFraiche('demo-1');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      const b = m.construire(copie);
      expect(b.status, b.stderr).toBe(0);
      expect(m.vus()).toEqual(['v2']);
    },
    LONG
  );
  it(
    'critère 1: a reused integration copy whose submodule was set gets the link once main declares it shared',
    () => {
      const m = mondePartage({ partage: null });
      const copie = m.copieFraiche('integration');
      expect(m.poser(copie).status).toBe(0);
      expect(m.lit(copie)).toBe(false);
      expect(m.natifDe(copie)).toBe('v1');
      const pkgPath = path.join(m.repo, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Paquet;
      writeFileSync(pkgPath, JSON.stringify({ ...pkg, grillhouse: { partage: ['vendor/natif'] } }));
      git(m.repo, 'commit', '-qm', 'partage déclaré', '--', 'package.json');
      const r = m.avancerCommeLIntegration(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      expect(m.etat(copie).complet).toBe('');
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 2 — git status of the copy does not report the shared submodule', () => {
  it(
    'critère 2: git status of a prepared copy stays silent, even when the main repository’s submodule carries work',
    () => {
      const m = mondePartage();
      writeFileSync(path.join(m.principalNatif, 'natif.txt'), 'modifié dans le principal\n');
      const copie = m.copieFraiche('muette');
      expect(m.poser(copie).status).toBe(0);
      expect(m.lit(copie)).toBe(true);
      expect(m.etat(copie)).toEqual({ status: '', complet: '' });
      expect(git(copie, 'diff', '--stat')).toBe('');
    },
    LONG
  );
  it(
    'critère 2: the guard lets through a copy whose shared submodule is linked, and the reused copy builds again',
    () => {
      const m = mondePartage();
      const copie = m.copieFraiche('demo-1');
      expect(m.poser(copie).status).toBe(0);
      expect(m.lit(copie)).toBe(true);
      expect(m.construire(copie).status).toBe(0);
      const g = m.garder(copie);
      expect(g.status, g.stderr).toBe(0);
      // Reused as lancer.sh reuses the agent copy: the guard, the move onto HEAD, the preparation.
      const r = m.avancerCommeLAgent(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      const b = m.construire(copie);
      expect(b.status, b.stderr).toBe(0);
      expect(m.vus()).toEqual(['v1', 'v1']);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 3 — a write into a shared submodule from an agent copy fails', () => {
  // The agent's session is a script of the repository, run inside the real envelope: it reads the
  // shared submodule, then tries to write into it and into the copy.
  it.runIf(canWrap)(
    'critère 3: inside the envelope, the agent reads the shared submodule and its write into it fails; its write into the copy succeeds',
    () => {
      const m = mondePartage();
      writeFileSync(
        path.join(m.repo, 'agent.sh'),
        `#!/bin/sh
lu=$(cat vendor/natif/natif.txt 2>/dev/null || echo illisible)
if echo agent > vendor/natif/agent.txt 2>/dev/null; then s=ok; else s=refus; fi
if echo agent > copie-agent.txt 2>/dev/null; then c=ok; else c=refus; fi
echo "agent $s $c $lu" >> ecritures.log
`,
        { mode: 0o755 }
      );
      git(m.repo, 'add', 'agent.sh');
      git(m.repo, 'commit', '-qm', 'agent');
      const consigne = path.join(m.bin, 'consigne.txt');
      // A home of its own: the session state is read and written there, never in the real one.
      const maison = mkdtempSync(path.join(ESSAIS, 'maison-'));
      mkdirSync(path.join(maison, '.claude/projects'), { recursive: true });
      writeFileSync(path.join(maison, '.claude/settings.json'), '{}');
      writeFileSync(path.join(maison, '.claude.json'), '{}');
      const r = spawnSync('bash', [LANCER, 'demo-1', 'developpeur', 'packages/a', consigne], {
        cwd: m.repo,
        encoding: 'utf8',
        env: {
          ...ENV_SCRIPTS,
          HOME: maison,
          PATH: `${m.bin}:${process.env.PATH}`,
          CLAUDE_BIN: path.join(m.copies.agent, 'agent.sh'),
        },
      });
      expect(r.status, r.stderr + readFileSync(`${m.copies.agent}.log`, 'utf8')).toBe(0);
      expect(m.ecrituresDe(m.copies.agent)).toEqual(['agent refus ok v1']);
      expect(m.intrus()).toEqual([]);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 4 — a submodule not declared shared keeps the behaviour of 3uv.52', () => {
  it(
    'critère 4: with vendor/natif shared and vendor/autre not, the copy links vendor/natif and sets its own vendor/autre at the commit of HEAD',
    () => {
      const m = mondePartage({ autre: true });
      // The main repository's vendor/autre is moved to a2; HEAD references a1.
      git(path.join(m.repo, 'vendor/autre'), 'checkout', '-q', m.autreCommits[1] ?? '');
      const copie = m.copieFraiche('melange');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      const autre = path.join(copie, 'vendor/autre');
      expect(lstatSync(autre).isSymbolicLink()).toBe(false);
      expect(readFileSync(path.join(autre, 'autre.txt'), 'utf8')).toBe('a1\n');
      expect(git(autre, 'rev-parse', 'HEAD').trim()).toBe(m.autreCommits[0]);
      expect(git(path.join(m.repo, 'vendor/autre'), 'rev-parse', 'HEAD').trim()).toBe(
        m.autreCommits[1]
      );
      expect(m.etat(copie).complet).toBe('');
    },
    LONG
  );
  it(
    'critère 4: a copy whose shared submodule was linked sets its own submodule at the commit of HEAD once main no longer declares it shared',
    () => {
      const m = mondePartage();
      const copie = m.copieFraiche('demo-1');
      expect(m.poser(copie).status).toBe(0);
      expect(m.lit(copie)).toBe(true);
      git(m.principalNatif, 'checkout', '-q', m.commits[1] ?? '');
      const pkgPath = path.join(m.repo, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Paquet;
      delete pkg.grillhouse;
      writeFileSync(pkgPath, JSON.stringify(pkg));
      git(m.repo, 'commit', '-qm', 'partage retiré', '--', 'package.json');
      const r = m.avancerCommeLAgent(copie);
      expect(r.status, r.stderr).toBe(0);
      const sous = path.join(copie, 'vendor/natif');
      expect(lstatSync(sous).isSymbolicLink()).toBe(false);
      expect(m.natifDe(copie)).toBe('v1');
      expect(git(copie, 'ls-files', '-v', '--', 'vendor/natif')).toMatch(/^H vendor\/natif$/m);
      expect(m.etat(copie).complet).toBe('');
      // The main repository's submodule is left as it was.
      expect(git(m.principalNatif, 'rev-parse', 'HEAD').trim()).toBe(m.commits[1]);
      expect(existsSync(m.nonSuivi)).toBe(true);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 5 — removing a copy never touches the main repository’s submodule', () => {
  // The main repository's submodule as the supervisor sees it: its commit, its files, its state.
  const principal = (m: ReturnType<typeof mondePartage>) => ({
    commit: git(m.principalNatif, 'rev-parse', 'HEAD'),
    status: git(m.principalNatif, 'status', '--porcelain', '--untracked-files=all'),
    fichiers: readdirSync(m.principalNatif)
      .filter(f => f !== '.git')
      .sort()
      .map(f => `${f}=${readFileSync(path.join(m.principalNatif, f), 'utf8')}`),
  });
  for (const jetable of [false, true]) {
    it(
      `critère 5: retirer-copie.sh${jetable ? ' --jetable' : ''} removes a copy that links the shared submodule, and the main repository’s submodule stays intact`,
      () => {
        const m = mondePartage();
        const copie = m.copieFraiche('demo-1');
        expect(m.poser(copie).status).toBe(0);
        expect(m.lit(copie)).toBe(true);
        const avant = principal(m);
        const r = spawnSync('bash', [RETIRER, ...(jetable ? ['--jetable'] : []), copie], {
          cwd: m.repo,
          encoding: 'utf8',
          env: ENV_SCRIPTS,
        });
        expect(r.status, r.stderr).toBe(0);
        expect(existsSync(copie)).toBe(false);
        expect(principal(m)).toEqual(avant);
        expect(avant.fichiers).toContain('principal-non-suivi.txt=travail du principal\n');
      },
      LONG
    );
  }
});

describe('grillhouse-3uv.58.1 critère 8 — the integration and the night play the project’s commands with the shared submodule read-only', () => {
  it.runIf(canWrap)(
    'critère 8: in the integration, installation, build, tests and guards fail to write into the shared submodule and write into their copy',
    () => {
      const m = mondePartage({ ecritures: true });
      const r = m.integrer();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.lit(m.copies.integration)).toBe(true);
      const vues = m.ecrituresDe(m.copies.integration);
      for (const e of ['installation', 'construction', 'tests', 'gardes']) {
        expect(vues.filter(l => l.startsWith(`${e} `)).length, vues.join('\n')).toBeGreaterThan(0);
      }
      expect(ecrituresFautives(vues), vues.join('\n')).toEqual([]);
      expect(m.intrus()).toEqual([]);
    },
    LONG
  );
  it.runIf(canWrap)(
    'critère 8: in the night, installation, build, tests and the project’s night script fail to write into the shared submodule and write into their copy',
    () => {
      const m = mondePartage({ ecritures: true });
      const r = m.nuit();
      expect(r.status, m.journalNuit()).toBe(0);
      expect(m.lit(m.copies.nuit)).toBe(true);
      const vues = m.ecrituresDe(m.copies.nuit);
      for (const e of ['installation', 'construction', 'tests', 'nuit']) {
        expect(vues.filter(l => l.startsWith(`${e} `)).length, vues.join('\n')).toBeGreaterThan(0);
      }
      expect(ecrituresFautives(vues), vues.join('\n')).toEqual([]);
      expect(m.intrus()).toEqual([]);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 9 — the preparation never enters a shared submodule', () => {
  it(
    'critère 9: preparing a copy neither moves the main repository’s submodule nor removes its untracked file',
    () => {
      const m = mondePartage();
      git(m.principalNatif, 'checkout', '-q', m.commits[1] ?? '');
      const copie = m.copieFraiche('sans-entrer');
      expect(m.poser(copie).status).toBe(0);
      // A second preparation of the same copy, its link in place.
      expect(m.poser(copie).status).toBe(0);
      expect(git(m.principalNatif, 'rev-parse', 'HEAD').trim()).toBe(m.commits[1]);
      expect(existsSync(m.nonSuivi)).toBe(true);
      expect(m.natifDe(copie)).toBe('v2');
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 10 — when moving a copy forward changes the shared submodule’s commit, the next preparation puts the link back', () => {
  it(
    'critère 10: a reused agent copy, moved forward as lancer.sh moves it onto a commit that moves the shared submodule, links it again and git status stays silent',
    () => {
      const m = mondePartage();
      const copie = m.copieFraiche('demo-1');
      expect(m.poser(copie).status).toBe(0);
      expect(m.lit(copie)).toBe(true);
      m.avancerNatif();
      const r = m.avancerCommeLAgent(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      expect(m.etat(copie)).toEqual({ status: '', complet: '' });
      expect(m.construire(copie).status).toBe(0);
      expect(m.vus()).toEqual(['v2']);
    },
    LONG
  );
  it(
    'critère 10: a reused integration copy, put as the integration puts it on a commit that moves the shared submodule, links it again and git status stays silent',
    () => {
      const m = mondePartage();
      const copie = m.copieFraiche('integration');
      expect(m.poser(copie).status).toBe(0);
      expect(m.lit(copie)).toBe(true);
      m.avancerNatif();
      const r = m.avancerCommeLIntegration(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(m.lit(copie)).toBe(true);
      expect(m.etat(copie)).toEqual({ status: '', complet: '' });
      expect(m.construire(copie).status).toBe(0);
      expect(m.vus()).toEqual(['v2']);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 11 — a malformed grillhouse.partage, or a path that is not a submodule, stops the preparation', () => {
  // Each faulty declaration, and the part of its value the first line of the refusal cites (null:
  // the key alone is required, the value having no printable token of its own).
  const fautives: { cas: string; partage: unknown; cite: string | null }[] = [
    { cas: 'a string, not a list', partage: 'vendor/natif', cite: 'vendor/natif' },
    { cas: 'an object, not a list', partage: { chemin: 'vendor/natif' }, cite: 'vendor/natif' },
    { cas: 'an empty path', partage: [''], cite: null },
    { cas: 'an element that is not a string', partage: [42], cite: '42' },
    { cas: 'an absolute path', partage: ['/vendor/natif'], cite: '/vendor/natif' },
    { cas: 'a path that leaves the repository', partage: ['../dehors'], cite: '../dehors' },
    {
      cas: 'a path that leaves the repository through its middle',
      partage: ['vendor/../../dehors'],
      cite: 'vendor/../../dehors',
    },
    {
      cas: 'a tracked folder that is not a submodule',
      partage: ['packages/a'],
      cite: 'packages/a',
    },
    { cas: 'an unknown path', partage: ['vendor/inconnu'], cite: 'vendor/inconnu' },
    {
      cas: 'a valid path next to an unknown one',
      partage: ['vendor/natif', 'vendor/inconnu'],
      cite: 'vendor/inconnu',
    },
  ];
  for (const f of fautives) {
    it(
      `critère 11: ${f.cas} — the preparation refuses, exit 1, its first line cites grillhouse.partage, and nothing is set`,
      () => {
        const m = mondePartage({ partage: f.partage, autre: true });
        const copie = m.copieFraiche('mal-formee');
        const r = m.poser(copie);
        expect(r.status, r.stderr).toBe(1);
        const premiere = r.stderr.split('\n')[0] ?? '';
        expect(premiere).toContain('grillhouse.partage');
        if (f.cite !== null) {
          expect(premiere).toContain(f.cite);
        }
        // Nothing is set: neither the shared candidate nor the other submodule.
        const natif = path.join(copie, 'vendor/natif');
        expect(lstatSync(natif).isSymbolicLink()).toBe(false);
        expect(readdirSync(natif)).toEqual([]);
        expect(readdirSync(path.join(copie, 'vendor/autre'))).toEqual([]);
      },
      LONG
    );
  }
  for (const [cas, partage] of [
    ['an absent key', null],
    ['an empty list', []],
  ] as const) {
    it(
      `critère 11: ${cas} shares nothing — each submodule is set in the copy at the commit of HEAD`,
      () => {
        const m = mondePartage({ partage, autre: true });
        git(m.principalNatif, 'checkout', '-q', m.commits[1] ?? '');
        const copie = m.copieFraiche('rien-de-partage');
        const r = m.poser(copie);
        expect(r.status, r.stderr).toBe(0);
        expect(lstatSync(path.join(copie, 'vendor/natif')).isSymbolicLink()).toBe(false);
        expect(m.natifDe(copie)).toBe('v1');
        expect(readFileSync(path.join(copie, 'vendor/autre/autre.txt'), 'utf8')).toBe('a1\n');
      },
      LONG
    );
  }
});

describe('grillhouse-3uv.58.1 critère 12 — a shared submodule absent or not initialized in the main repository stops the preparation', () => {
  // The main repository's submodule not initialized (an empty folder, as after a clone without
  // --recurse-submodules), or its folder absent.
  const etats = {
    'not initialized': (dir: string) => {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir);
    },
    absent: (dir: string) => rmSync(dir, { recursive: true, force: true }),
  };
  for (const [cas, defaire] of Object.entries(etats)) {
    it(
      `critère 12: ${cas} in the main repository — the preparation refuses, exit 1, its first line names it, and never sets it in the copy`,
      () => {
        const m = mondePartage();
        const copie = m.copieFraiche('sans-principal');
        defaire(m.principalNatif);
        const r = m.poser(copie);
        expect(r.status, r.stderr).toBe(1);
        expect(r.stderr.split('\n')[0]).toContain('vendor/natif');
        // No fallback: the copy holds no submodule of its own at that path.
        const natif = path.join(copie, 'vendor/natif');
        expect(existsSync(path.join(natif, 'natif.txt'))).toBe(false);
        expect(existsSync(path.join(natif, '.git'))).toBe(false);
      },
      LONG
    );
  }
  it(
    'critère 12: the integration refuses the lot, naming the shared submodule, and no command of the project runs',
    () => {
      const m = mondePartage();
      etats['not initialized'](m.principalNatif);
      const tete = git(m.repo, 'rev-parse', 'HEAD');
      const r = m.integrer();
      expect(r.status).toBe(1);
      expect(r.stdout).toMatch(/⛔[^\n]*vendor\/natif/);
      expect(m.vus()).toEqual([]);
      expect(git(m.repo, 'rev-parse', 'HEAD')).toBe(tete);
      expect(existsSync(path.join(m.copies.integration, 'vendor/natif/.git'))).toBe(false);
    },
    LONG
  );
});

describe('grillhouse-3uv.58.1 critère 13 — without a possible mount, a declared shared submodule stops the integration and the night', () => {
  const machines = { 'bwrap absent': pathSansBwrap, 'bwrap refused': pathBwrapRefuse };
  for (const [cas, chemin] of Object.entries(machines)) {
    it(
      `critère 13: ${cas} — the integration refuses the lot and says so, no command of the project runs`,
      () => {
        const m = mondePartage();
        const tete = git(m.repo, 'rev-parse', 'HEAD');
        const r = m.integrer({ PATH: `${m.bin}:${chemin()}` });
        expect(r.status, r.stdout + r.stderr).toBe(1);
        expect(r.stdout).toMatch(/⛔[^\n]*(bwrap|montage)/i);
        expect(m.vus()).toEqual([]);
        expect(git(m.repo, 'rev-parse', 'HEAD')).toBe(tete);
      },
      LONG
    );
    it(
      `critère 13: ${cas} — the night turns red and says so, no command of the project runs`,
      () => {
        const m = mondePartage();
        const r = m.nuit({ PATH: `${m.bin}:${chemin()}` });
        expect(r.status, m.journalNuit()).not.toBe(0);
        expect(m.journalNuit()).toMatch(/bwrap|montage/i);
        expect(m.journalNuit()).not.toMatch(/✓ vert/);
        expect(m.vus()).toEqual([]);
      },
      LONG
    );
  }
  it(
    'critère 13: bwrap absent and nothing declared shared — the integration commits and the night plays green, as before',
    () => {
      const m = mondePartage({ partage: null });
      const ailleurs = { PATH: `${m.bin}:${pathSansBwrap()}` };
      const i = m.integrer(ailleurs);
      expect(i.status, i.stdout + i.stderr).toBe(0);
      expect(i.stdout).toMatch(/✓ commit/);
      const n = m.nuit(ailleurs);
      expect(n.status, m.journalNuit()).toBe(0);
      expect(m.journalNuit()).toMatch(/✓ vert/);
    },
    LONG * 2
  );
});

describe('grillhouse-3uv.58.1 critère 14 — a submodule nested in a shared submodule belongs to the main repository', () => {
  it(
    'critère 14: preparing a copy, then preparing it again, neither sets nor cleans the nested submodule of the main repository',
    () => {
      const m = mondePartage({ imbrique: true });
      // The main repository's nested submodule: moved to a commit of its own, a tracked file
      // edited, an untracked file — the supervisor's work.
      const profond = path.join(m.principalNatif, 'profond');
      writeFileSync(path.join(profond, 'profond.txt'), 'p2\n');
      git(profond, 'commit', '-qam', 'p2');
      const p2 = git(profond, 'rev-parse', 'HEAD').trim();
      writeFileSync(path.join(profond, 'profond.txt'), 'en cours\n');
      const nonSuiviProfond = path.join(profond, 'profond-non-suivi.txt');
      writeFileSync(nonSuiviProfond, 'travail du principal\n');
      const copie = m.copieFraiche('imbrique');
      expect(m.poser(copie).status).toBe(0);
      expect(m.lit(copie)).toBe(true);
      expect(m.poser(copie).status).toBe(0);
      expect(git(profond, 'rev-parse', 'HEAD').trim()).toBe(p2);
      expect(readFileSync(path.join(profond, 'profond.txt'), 'utf8')).toBe('en cours\n');
      expect(existsSync(nonSuiviProfond)).toBe(true);
      // The copy reads the nested submodule as the main repository holds it.
      expect(readFileSync(path.join(copie, 'vendor/natif/profond/profond.txt'), 'utf8')).toBe(
        'en cours\n'
      );
      expect(m.etat(copie)).toEqual({ status: '', complet: '' });
    },
    LONG
  );
  it(
    'critère 14: a copy already linked (as a first preparation leaves it) is prepared again without entering the nested submodule of the main repository',
    () => {
      const m = mondePartage({ imbrique: true });
      const profond = path.join(m.principalNatif, 'profond');
      const nonSuiviProfond = path.join(profond, 'profond-non-suivi.txt');
      writeFileSync(nonSuiviProfond, 'travail du principal\n');
      writeFileSync(path.join(profond, 'profond.txt'), 'en cours\n');
      // The state the voie of critère 7 leaves: the link, marked skip-worktree.
      const copie = m.copieFraiche('deja-liee');
      rmSync(path.join(copie, 'vendor/natif'), { recursive: true, force: true });
      symlinkSync(m.principalNatif, path.join(copie, 'vendor/natif'));
      git(copie, 'update-index', '--skip-worktree', 'vendor/natif');
      const r = m.poser(copie);
      expect(r.status, r.stderr).toBe(0);
      expect(existsSync(nonSuiviProfond)).toBe(true);
      expect(readFileSync(path.join(profond, 'profond.txt'), 'utf8')).toBe('en cours\n');
      expect(existsSync(m.nonSuivi)).toBe(true);
      expect(m.lit(copie)).toBe(true);
    },
    LONG
  );
});
