import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { mettreAJour } from '../../scripts/grillhouse-maj.mjs';

// The trial harness of the night tests (grillhouse-3uv.34), shared by their tests
// (tests/unit/tests-de-nuit*.spec.ts): the projects of trial that play the real configuration of
// the repository, and what reads their runs.

export const DEPOT = path.resolve(__dirname, '../..');

// A test file that appends its name to the trace `.trace` names, and fails when `rouge`.
export const essai = (nom: string, rouge = false) =>
  `import { appendFileSync, readFileSync } from 'node:fs';\nimport { test } from 'vitest';\n` +
  `test('${nom}', () => {\n  appendFileSync(readFileSync('.trace', 'utf8').trim(), '${nom}\\n');\n` +
  (rouge ? `  throw new Error('rouge');\n` : '') +
  `});\n`;

// The content of /proc/pressure/cpu for a pressure <some> (avg10, in %).
export const PRESSION = (some: number) =>
  `some avg10=${some.toFixed(2)} avg60=0.00 avg300=0.00 total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n`;

// The files of trial: two day tests, night tests of each form and depth.
export const JOUR = ['tests/jour.spec.ts', 'tests/profond/jour.test.ts'];
export const NUITS = [
  'tests/a.nuit.test.ts',
  'tests/b.nuit.spec.ts',
  'tests/profond/c.nuit.test.ts',
  'tests/d.nuit.test.mjs',
];

// The dependencies of the repository, linked one by one so that Vitest writes its cache in the
// project of trial.
export function lierDependances(repo: string) {
  mkdirSync(path.join(repo, 'node_modules'));
  for (const e of readdirSync(path.join(DEPOT, 'node_modules'))) {
    if (e !== '.vite' && e !== '.vitest') {
      symlinkSync(path.join(DEPOT, 'node_modules', e), path.join(repo, 'node_modules', e));
    }
  }
}

export const noms = (fichiers: string[]) => fichiers.map(f => path.basename(f)).sort();

// The positions of the names in the order of the trace.
export const rangs = (lignes: string[], noms_: string[]) => noms_.map(n => lignes.indexOf(n));

// The projects of trial of one test file, under <ESSAIS>.
export function testsDeNuitEssai(ESSAIS: string) {
  // A project of trial, its frame installed by the update of the frame (critère 9): by default the
  // package.json of the repository (its build, which builds the repository itself, left out, and its
  // section `grillhouse` with it: the key `grillhouse.nuit` is the project's, critère 8) and its day
  // configuration of Vitest; `pkg` replaces that package.json and `fichiers` adds or replaces files.
  // `nuits: false` leaves the night tests out. The project of trial proves the night, not the
  // controls of the frame (grillhouse-3uv.55, critère 8): the update installs `grillhouse:gardes`,
  // which projet() takes away, and Turborepo skips a task without script.
  function projet(
    enPlus: Record<string, string> = {},
    o: {
      pkg?: Record<string, unknown>;
      nuits?: boolean;
      jourVitest?: boolean;
      dependances?: boolean;
    } = {}
  ) {
    const repo = mkdtempSync(path.join(ESSAIS, 'projet-'));
    let pkg = o.pkg;
    if (!pkg) {
      const depot = JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
        grillhouse?: unknown;
      };
      for (const s of ['build', 'prepare']) {
        delete depot.scripts[s];
      }
      delete depot.grillhouse;
      pkg = depot;
    }
    writeFileSync(path.join(repo, 'package.json'), JSON.stringify(pkg, null, 2));
    if (o.jourVitest !== false) {
      for (const f of readdirSync(DEPOT)) {
        if (/^vitest\.config\.(c|m)?[jt]s$/.test(f)) {
          cpSync(path.join(DEPOT, f), path.join(repo, f));
        }
      }
    }
    // The dependencies are installed before the update, as in a project: the update reads the
    // Vitest its root resolves.
    if (o.dependances !== false) {
      lierDependances(repo);
    }
    mettreAJour(repo, DEPOT, 'essai');
    const installe = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    if (installe.scripts) {
      delete installe.scripts['grillhouse:gardes'];
      writeFileSync(path.join(repo, 'package.json'), JSON.stringify(installe, null, 2));
    }
    writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n.claude/worktrees/\n.turbo/\n');
    const fichiers: Record<string, string> = {};
    for (const f of [...JOUR, ...(o.nuits === false ? [] : NUITS)]) {
      fichiers[f] = essai(path.basename(f));
    }
    Object.assign(fichiers, enPlus);
    for (const [f, contenu] of Object.entries(fichiers)) {
      mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
      writeFileSync(path.join(repo, f), contenu);
    }
    const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
    const trace = path.join(bin, 'trace');
    writeFileSync(path.join(repo, '.trace'), `${trace}\n`);
    // The CPU pressure the measures of time read (scripts/vitest-config/pression.mjs): at rest, unless
    // a case writes it.
    const pression = path.join(bin, 'pression');
    writeFileSync(pression, PRESSION(1));
    const env = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
      ),
      TRACE: trace,
      PATH: `${bin}:${process.env.PATH}`,
      GRILLHOUSE_PRESSION_CPU: pression,
    };
    const lancer = (cmd: string, args: string[]) =>
      spawnSync(cmd, args, { cwd: repo, encoding: 'utf8', env, timeout: 120_000 });
    const lignes = () =>
      existsSync(trace) ? readFileSync(trace, 'utf8').split('\n').filter(Boolean) : [];
    const joues = () => [...lignes()].sort();
    return { repo, bin, env, lancer, lignes, joues, pression };
  }

  // The night in a repository of trial, as tests/unit/nuit.spec.ts plays it: a fake Beads records
  // its calls.
  function nuitDe(p: ReturnType<typeof projet>) {
    writeFileSync(path.join(p.bin, 'bd'), `#!/bin/sh\necho "$@" >> ${p.bin}/appels\n`, {
      mode: 0o755,
    });
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', p.repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
        encoding: 'utf8',
      });
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'base');
    const r = p.lancer('bash', [path.join(p.repo, 'scripts/nuit.sh')]);
    const dossier = path.join(p.repo, '.git', 'nuit');
    const journal = existsSync(dossier)
      ? readdirSync(dossier)
          .filter(f => f.endsWith('.log'))
          .map(f => readFileSync(path.join(dossier, f), 'utf8'))
          .join('\n')
      : '';
    const vert = path.join(dossier, 'dernier-vert');
    const dernierVert = existsSync(vert) ? readFileSync(vert, 'utf8').trim() : '';
    const tete = git('rev-parse', 'HEAD').trim();
    return { status: r.status, journal: journal.slice(-3000), dernierVert, tete };
  }
  return { projet, nuitDe };
}
