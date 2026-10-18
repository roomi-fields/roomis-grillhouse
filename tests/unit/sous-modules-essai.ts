import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { configGit } from '../config-git.js';

// The trial harness of the submodules of the working copies (scripts/sous-modules.sh), shared by
// their tests (tests/unit/sous-modules*.spec.ts): the frame's scripts, git's environment, and the
// worlds of trial (a main repository, its submodules, its copies), which sousModulesEssai builds
// in the trial directory of the file that calls it.

export const RACINE = path.resolve(__dirname, '../..');
export const SCRIPTS = path.join(RACINE, 'scripts');
export const INTEGRER = path.join(SCRIPTS, 'integration/integrer.mjs');
export const LANCER = path.join(SCRIPTS, 'enveloppe/lancer.sh');
export const POSE = path.join(SCRIPTS, 'sous-modules.sh');
export const LONG = 60_000;

// The file protocol is refused to submodule commands by default; the test repositories live on
// disk, so the commands that build them allow it, beside the git settings of the suite. The scripts
// under test run without it, as on the machine (grillhouse-3uv.52): an empty global configuration
// of their own, no system one, and the git settings of the suite but that allowance.
const ENV_GIT = {
  ...configGit([['protocol.file.allow', 'always']]),
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};
export const git = (dir: string, ...a: string[]) =>
  execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...ENV_GIT } });

// The tests of the trial repository, as the frame's `npm test` plays them (Turborepo: the build,
// then the tests): its build, then its suites; `verifier`, the integration's and the night's,
// plays the same.
const TEST = 'npm run --silent build && node suites.mjs';
// The trial's stand-in for Turborepo, the local package `outils/turbo` of the trial repository (its
// `turbo` binary, which `npm install` links into node_modules/.bin, where the launcher's
// `npx --no-install turbo run build` finds it): `turbo run <task>` runs the npm script <task>.
const TURBO_FAUX = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const [commande, tache] = process.argv.slice(2);
if (commande !== 'run' || !tache) process.exit(2);
const r = spawnSync('npm', ['run', '--silent', '--if-present', tache], { stdio: 'inherit' });
process.exit(r.status ?? 1);
`;
const TURBO_PAQUET = JSON.stringify({
  name: 'turbo',
  version: '0.0.0',
  bin: { turbo: 'turbo.mjs' },
});

// A repository whose build succeeds only when its submodule vendor/natif is set, and records what
// it saw; with a fake Beads (every ticket ACCEPTÉ, every list empty). The submodule has two
// commits, `v1` then `v2`; the superproject references `v1`, the older one, so a copy that takes the
// submodule's tip instead of the referenced commit is seen. Its address in .gitmodules is an absolute
// path, a path relative to the superproject, or a file:// URL; `imbrique` gives it a submodule of
// its own, vendor/natif/profond, also at a local address (grillhouse-3uv.52).
type Adresse = 'absolue' | 'relative' | 'file';

// grillhouse-3uv.58.1: a submodule the project declares shared (`grillhouse.partage`, a list of
// submodule paths in the package.json of the copy) is not set in a copy: the copy reads the
// submodule of the main repository at its usual path, by a symbolic link marked « ignored in the
// copy » (skip-worktree). The integration and the night play the project's commands under a
// read-only mount (bwrap) of each shared submodule of the main repository; the envelope of an
// agent already shows the main repository read-only. The world is the one above, vendor/natif
// declared shared (`partage: null`: no declaration); `autre` adds a second submodule, vendor/autre,
// never shared; `ecritures` makes
// each command of the project try to write into vendor/natif and into the copy, and note the
// outcome in the copy's ecritures.log (« <step> <outcome in the submodule> <outcome in the copy> »).
const PARTAGE_ECRITURE = `import fs from 'node:fs';
const etape = process.argv[2];
const essai = f => { try { fs.writeFileSync(f, etape + '\\n'); return 'ok'; } catch (e) { return e.code ?? 'refus'; } };
const dansSousModule = essai('vendor/natif/' + etape + '.txt');
const dansCopie = essai('copie-' + etape + '.txt');
fs.appendFileSync('ecritures.log', [etape, dansSousModule, dansCopie].join(' ') + '\\n');
`;
// The lines of ecritures.log whose step wrote into the shared submodule, or failed to write into its copy.
export const ecrituresFautives = (vues: string[]) =>
  vues.filter(l => !/^\S+ (?!ok )\S+ ok$/.test(l));
// The package.json of the test repository, as the tests rewrite it.
export type Paquet = Record<string, unknown> & { grillhouse?: Record<string, unknown> };

// The worlds of trial of one test file, under <ESSAIS>, with the global git configuration of
// the frame's scripts there.
export function sousModulesEssai(ESSAIS: string) {
  const CONFIG_GLOBALE = path.join(ESSAIS, 'gitconfig');
  writeFileSync(CONFIG_GLOBALE, '');
  const ENV_SCRIPTS: NodeJS.ProcessEnv = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !/^GIT_(CONFIG|ALLOW_PROTOCOL)/.test(k))
    ),
    ...configGit([], cle => !cle.startsWith('protocol.')),
    GIT_CONFIG_GLOBAL: CONFIG_GLOBALE,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
  };
  // git as the scripts see it: no allowance from the environment of the test.
  const gitScripts = (dir: string, ...a: string[]) =>
    spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: ENV_SCRIPTS });
  function monde(avecSousModule = true, adresse: Adresse = 'absolue', imbrique = false) {
    const repo = mkdtempSync(path.join(ESSAIS, 'sousmod-'));
    const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
    writeFileSync(
      path.join(bin, 'bd'),
      `#!/bin/sh\ncase "$1 $2 $3" in "config get issue_prefix") echo demo; exit 0;; esac\ncase "$1" in show) echo '[{"id":"demo-1","labels":[]}]';; comments) echo '[{"text":"ACCEPTÉ"}]';; list) echo '[]';; create) echo demo-12;; esac\n`,
      { mode: 0o755 }
    );
    const vu = path.join(bin, 'vu');
    writeFileSync(
      path.join(repo, 'package.json'),
      JSON.stringify({
        name: 't',
        private: true,
        scripts: { build: 'node build.mjs', test: TEST, verifier: 'npm test' },
        devDependencies: { turbo: 'file:outils/turbo' },
      })
    );
    // Without .gitmodules the build passes. The build says nothing on its own output, so a refusal that names the submodule comes from the
    // preparation, not from it.
    writeFileSync(
      path.join(repo, 'build.mjs'),
      `import fs from 'node:fs';\nconst f = 'vendor/natif/natif.txt';\nconst v = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : 'absent';\nfs.appendFileSync(${JSON.stringify(vu)}, v + '\\n');\nprocess.exit(v === 'absent' && fs.existsSync('.gitmodules') ? 1 : 0);\n`
    );
    // The suites read the submodule as the build does.
    writeFileSync(path.join(repo, 'suites.mjs'), "await import('./build.mjs');\n");
    mkdirSync(path.join(repo, 'outils/turbo'), { recursive: true });
    writeFileSync(path.join(repo, 'outils/turbo/package.json'), TURBO_PAQUET);
    writeFileSync(path.join(repo, 'outils/turbo/turbo.mjs'), TURBO_FAUX, { mode: 0o755 });
    writeFileSync(path.join(repo, '.gitignore'), '.claude/worktrees/\nnode_modules\n');
    mkdirSync(path.join(repo, '.claude/agents'), { recursive: true });
    writeFileSync(
      path.join(repo, '.claude/agents/developpeur.md'),
      '---\nname: developpeur\n---\n'
    );
    mkdirSync(path.join(repo, 'packages/a/src'), { recursive: true });
    writeFileSync(path.join(repo, 'packages/a/src/a.ts'), 'export const a = 1;\n');
    // The night runs from the repository's own scripts: they are copied whole, so the preparation
    // it calls is there, whatever its file.
    cpSync(SCRIPTS, path.join(repo, 'scripts'), { recursive: true });
    git(repo, 'init', '-q');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'base');

    const natif = mkdtempSync(path.join(ESSAIS, 'natif-'));
    const commits: string[] = [];
    if (avecSousModule) {
      git(natif, 'init', '-q');
      if (imbrique) {
        const profond = mkdtempSync(path.join(ESSAIS, 'profond-'));
        git(profond, 'init', '-q');
        writeFileSync(path.join(profond, 'profond.txt'), 'p1\n');
        git(profond, 'add', '.');
        git(profond, 'commit', '-qm', 'p1');
        git(natif, 'submodule', 'add', '-q', profond, 'profond');
      }
      for (const v of ['v1', 'v2']) {
        writeFileSync(path.join(natif, 'natif.txt'), `${v}\n`);
        git(natif, 'add', '.');
        git(natif, 'commit', '-qm', v);
        commits.push(git(natif, 'rev-parse', 'HEAD').trim());
      }
      const url = {
        absolue: natif,
        relative: `../${path.basename(natif)}`,
        file: `file://${natif}`,
      }[adresse];
      git(repo, 'submodule', 'add', '-q', url, 'vendor/natif');
      if (imbrique) {
        git(repo, 'submodule', 'update', '--init', '--recursive');
      }
      git(path.join(repo, 'vendor/natif'), 'checkout', '-q', commits[0] ?? '');
      git(repo, 'add', 'vendor/natif');
      git(repo, 'commit', '-qm', 'natif v1');
    }
    const env = { ...ENV_SCRIPTS, PATH: `${bin}:${process.env.PATH}` };

    // A lot that adds a source to the component packages/a; the integration's `npm run verifier` builds the copy.
    let n = 0;
    const lot = () => {
      n += 1;
      const f = `packages/a/src/lot-${n}.ts`;
      writeFileSync(path.join(repo, f), `export const lot${n} = ${n};\n`);
      const p = path.join(bin, `lot-${n}.patch`);
      writeFileSync(
        p,
        spawnSync('git', ['-C', repo, 'diff', '--no-index', '/dev/null', f], { encoding: 'utf8' })
          .stdout
      );
      rmSync(path.join(repo, f));
      return p;
    };
    const message = path.join(bin, 'msg');
    writeFileSync(message, 'feat: une source (demo-1)\n');
    // `ailleurs`: the environment of the scripts with some variables changed (its PATH, say).
    const integrer = (ailleurs: NodeJS.ProcessEnv = {}) =>
      spawnSync('node', [INTEGRER, '--ticket', 'demo-1', '--code', lot(), '--message', message], {
        cwd: repo,
        encoding: 'utf8',
        env: { ...env, ...ailleurs },
      });
    const nuit = (ailleurs: NodeJS.ProcessEnv = {}) =>
      spawnSync('bash', [path.join(repo, 'scripts/nuit.sh')], {
        encoding: 'utf8',
        env: { ...env, ...ailleurs },
      });
    const journalNuit = () => {
      const d = path.join(repo, '.git/nuit');
      return readdirSync(d)
        .filter(f => f.endsWith('.log'))
        .map(f => readFileSync(path.join(d, f), 'utf8'))
        .join('');
    };
    const consigne = path.join(bin, 'consigne.txt');
    writeFileSync(consigne, 'TON TICKET : demo-1 — un sujet.');
    // `ticket`: the ticket launched, demo-1 by default; another one has a consigne of its own.
    const lancer = (ticket = 'demo-1') => {
      const c = ticket === 'demo-1' ? consigne : path.join(bin, `consigne-${ticket}.txt`);
      writeFileSync(c, `TON TICKET : ${ticket} — un sujet.`);
      return spawnSync('bash', [LANCER, ticket, 'developpeur', 'packages/a', c], {
        cwd: repo,
        encoding: 'utf8',
        env: { ...env, CLAUDE_BIN: 'true' },
      });
    };
    const copies = {
      integration: path.join(repo, '.claude/worktrees/integration'),
      agent: path.join(repo, '.claude/worktrees/demo-1'),
      nuit: path.join(repo, '.claude/worktrees/nuit'),
    };
    const natifDe = (copie: string) => {
      const f = path.join(copie, 'vendor/natif/natif.txt');
      return existsSync(f) ? readFileSync(f, 'utf8').trim() : 'absent';
    };
    const vus = () => (existsSync(vu) ? readFileSync(vu, 'utf8').trim().split('\n') : []);
    // The submodule can no longer be fetched: its source has moved.
    const perdreSource = () => renameSync(natif, `${natif}-parti`);
    // main references the submodule's v2.
    const avancerNatif = () => {
      git(path.join(repo, 'vendor/natif'), 'checkout', '-q', commits[1] ?? '');
      git(repo, 'add', 'vendor/natif');
      git(repo, 'commit', '-qm', 'natif v2');
    };
    return {
      repo,
      bin,
      commits,
      copies,
      integrer,
      nuit,
      journalNuit,
      lancer,
      natifDe,
      vus,
      perdreSource,
      avancerNatif,
    };
  }
  function mondePartage({
    partage = ['vendor/natif'] as unknown,
    autre = false,
    ecritures = false,
    imbrique = false,
    adresse = 'absolue' as Adresse,
  } = {}) {
    const m = monde(true, adresse, imbrique);
    const autreCommits: string[] = [];
    if (autre) {
      const depot = mkdtempSync(path.join(ESSAIS, 'autre-'));
      git(depot, 'init', '-q');
      for (const v of ['a1', 'a2']) {
        writeFileSync(path.join(depot, 'autre.txt'), `${v}\n`);
        git(depot, 'add', '.');
        git(depot, 'commit', '-qm', v);
        autreCommits.push(git(depot, 'rev-parse', 'HEAD').trim());
      }
      git(m.repo, 'submodule', 'add', '-q', depot, 'vendor/autre');
      git(path.join(m.repo, 'vendor/autre'), 'checkout', '-q', autreCommits[0] ?? '');
      git(m.repo, 'add', 'vendor/autre');
    }
    const pkgPath = path.join(m.repo, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Paquet;
    if (partage !== null) {
      pkg.grillhouse = { partage };
    }
    if (ecritures) {
      writeFileSync(path.join(m.repo, 'ecrire.mjs'), PARTAGE_ECRITURE);
      mkdirSync(path.join(m.repo, 'dep'));
      writeFileSync(path.join(m.repo, 'dep/package.json'), '{"name":"dep","version":"1.0.0"}\n');
      pkg.version = '1.0.0';
      pkg.dependencies = { dep: 'file:dep' };
      // `verifier` as the frame's: the build, the guards, then the tests.
      pkg.scripts = {
        postinstall: 'node ecrire.mjs installation',
        build: 'node build.mjs && node ecrire.mjs construction',
        test: 'npm run --silent build && node ecrire.mjs gardes && node ecrire.mjs tests && node suites.mjs',
        verifier: 'npm test',
        nocturne: 'node ecrire.mjs nuit',
      };
      pkg.grillhouse = { ...pkg.grillhouse, nuit: 'nocturne' };
      writeFileSync(
        path.join(m.repo, 'package-lock.json'),
        JSON.stringify({
          name: 't',
          version: '1.0.0',
          lockfileVersion: 3,
          requires: true,
          packages: {
            '': {
              name: 't',
              version: '1.0.0',
              hasInstallScript: true,
              dependencies: { dep: 'file:dep' },
              devDependencies: { turbo: 'file:outils/turbo' },
            },
            dep: { version: '1.0.0' },
            'node_modules/dep': { resolved: 'dep', link: true },
            'outils/turbo': { version: '0.0.0', dev: true, bin: { turbo: 'turbo.mjs' } },
            'node_modules/turbo': { resolved: 'outils/turbo', link: true },
          },
        })
      );
    }
    writeFileSync(pkgPath, JSON.stringify(pkg));
    git(m.repo, 'add', '.');
    git(m.repo, 'commit', '-q', '--allow-empty', '-m', 'partage');
    const principalNatif = path.join(m.repo, 'vendor/natif');
    // A fresh copy, as git creates it: detached on HEAD, its submodule paths empty folders.
    const copieFraiche = (nom: string) => {
      const dir = path.join(m.repo, '.claude/worktrees', nom);
      git(m.repo, 'worktree', 'add', '-q', '--detach', dir, 'HEAD');
      return dir;
    };
    const poser = (copie: string) =>
      spawnSync('bash', [POSE, 'pose', copie], { encoding: 'utf8', env: ENV_SCRIPTS });
    const garder = (copie: string) =>
      spawnSync('bash', [POSE, 'garde', copie], { encoding: 'utf8', env: ENV_SCRIPTS });
    // The build of the copy, run in it as the project runs it: it notes what it read (`vus`).
    const construire = (copie: string) =>
      spawnSync('node', ['build.mjs'], { cwd: copie, encoding: 'utf8', env: ENV_SCRIPTS });
    // A reused copy moved onto the HEAD of the main repository, by the very commands of its caller,
    // then prepared again by the common preparation. Without bwrap, lancer.sh and the integration
    // refuse a copy with a shared submodule (critères 13 and 15): these tests of the preparation run
    // on every machine.
    const tete = () => git(m.repo, 'rev-parse', 'HEAD').trim();
    // As lancer.sh does for the agent copy: the guard, then a fast-forward merge with autostash.
    const avancerCommeLAgent = (copie: string) => {
      const g = garder(copie);
      expect(g.status, g.stderr).toBe(0);
      git(copie, 'merge', '-q', '--ff-only', '--autostash', tete());
      return poser(copie);
    };
    // As the integration does for its copy: detached on HEAD, forced, every untracked file removed.
    const avancerCommeLIntegration = (copie: string) => {
      git(copie, 'checkout', '-q', '--detach', '--force', tete());
      git(copie, 'clean', '-q', '-f', '-d', '-x', '-e', 'node_modules');
      return poser(copie);
    };
    // The copy reads the main repository's submodule: its path is a symbolic link to it.
    const lit = (copie: string, chemin = 'vendor/natif') => {
      const p = path.join(copie, chemin);
      return (
        existsSync(p) &&
        lstatSync(p).isSymbolicLink() &&
        realpathSync(p) === realpathSync(path.join(m.repo, chemin))
      );
    };
    const etat = (copie: string) => ({
      status: git(copie, 'status', '--porcelain'),
      complet: git(copie, 'status', '--porcelain', '--ignore-submodules=none'),
    });
    // An untracked file in the main repository's submodule: the supervisor's work in progress.
    const nonSuivi = path.join(principalNatif, 'principal-non-suivi.txt');
    writeFileSync(nonSuivi, 'travail du principal\n');
    const ecrituresDe = (copie: string) => {
      const f = path.join(copie, 'ecritures.log');
      return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n') : [];
    };
    // The files a copy's commands managed to write into the main repository's submodule.
    const intrus = () =>
      readdirSync(principalNatif).filter(f =>
        /^(installation|construction|tests|gardes|nuit|agent)\.txt$/.test(f)
      );
    return {
      ...m,
      autreCommits,
      principalNatif,
      copieFraiche,
      poser,
      garder,
      construire,
      avancerCommeLAgent,
      avancerCommeLIntegration,
      lit,
      etat,
      nonSuivi,
      ecrituresDe,
      intrus,
    };
  }

  // A PATH where bwrap is not found: each folder of the PATH that holds a bwrap is replaced by a
  // folder of links to its other programs.
  function pathSansBwrap(): string {
    return (process.env.PATH ?? '')
      .split(':')
      .filter(d => d !== '')
      .map(d => {
        if (!existsSync(path.join(d, 'bwrap'))) {
          return d;
        }
        const miroir = mkdtempSync(path.join(ESSAIS, 'sans-bwrap-'));
        for (const f of readdirSync(d)) {
          if (f !== 'bwrap') {
            symlinkSync(path.join(d, f), path.join(miroir, f));
          }
        }
        return miroir;
      })
      .join(':');
  }
  // A bwrap the machine refuses: found, and failing as when its namespaces are denied.
  function pathBwrapRefuse(): string {
    const d = mkdtempSync(path.join(ESSAIS, 'bwrap-refuse-'));
    writeFileSync(
      path.join(d, 'bwrap'),
      '#!/bin/sh\necho "bwrap: setting up uid map: Permission denied" >&2\nexit 1\n',
      { mode: 0o755 }
    );
    return `${d}:${process.env.PATH ?? ''}`;
  }
  return {
    CONFIG_GLOBALE,
    ENV_SCRIPTS,
    gitScripts,
    monde,
    mondePartage,
    pathSansBwrap,
    pathBwrapRefuse,
  };
}
