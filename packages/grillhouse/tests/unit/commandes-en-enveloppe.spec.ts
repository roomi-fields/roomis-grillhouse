import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { CODE_COPIE } from '../../scripts/enveloppe/codes.mjs';
import { dossierDeTravail } from '../../scripts/enveloppe/enveloppe.mjs';
import { ecrire as ecrireTurbo } from '../../scripts/langages/typescript/turbo-des-paquets.mjs';

// Witness: BPScript (Turborepo 2.11.8), four sessions on one day. Inside the envelope of
// one package, a command of the frame wanted to build or read what the envelope shows read-only or
// hides: `npm test -- <files>` rebuilt the dist/ of a neighbour; the tests of 030-binder stopped on a
// cycle of Turborepo that the copy outside the envelope does not have; `npm run api` failed. As in a
// sandbox of Bazel, the neighbours arrive built and read-only: a command of the frame builds and
// writes the agent's package only, and reads the neighbours by their published form.

const DEPOT = path.resolve(__dirname, '../../../..');
const ENVELOPPE = path.join(DEPOT, 'packages/grillhouse/scripts/enveloppe/enveloppe.mjs');
const TESTS = path.join(DEPOT, 'packages/grillhouse/scripts/langages/typescript/tests.mjs');
const API = path.join(
  DEPOT,
  'packages/grillhouse/scripts/langages/typescript/interfaces-contre-code.mjs'
);
const BASE = path.join(
  DEPOT,
  'packages/grillhouse/scripts/langages/typescript/vitest-config/base.mjs'
);
const BIN = path.join(DEPOT, 'node_modules/.bin');
const LANCEUR = path.join(DEPOT, 'packages/grillhouse/scripts/enveloppe/lancer.sh');

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-commandes-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// Gives <dossier> this repository's dependencies as its own, Turborepo among them, as a project
// holds them: `npx --no-install turbo` finds it there, or in a parent's, without the registry.
const lierLesDependances = (dossier: string) =>
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(dossier, 'node_modules'), 'dir');

const DEBUT = '<!-- généré: début -->';
const FIN = '<!-- généré: fin -->';
// The declarations of a package, its contract in TSDoc.
const declarations = (nom: string) =>
  [
    '/**',
    ` * Rend la mesure de ${nom}.`,
    ' * @param x - La valeur mesurée.',
    ' * @returns La mesure.',
    ' */',
    `export declare function ${nom}(x: number): number;`,
    '',
  ].join('\n');

// A repository of packages as BPScript holds them: `forms` the base; `etage` and `kernel` two
// stages that depend on it and test themselves with the shared test material of `corpus` (a
// devDependency); `corpus`, which exports `./test-fixtures`, depends on the stages. Each package's
// turbo.json is the generated one, and its tsconfig.json its own: a build waits for the runtime dependencies only. Each build
// copies its declarations into dist/ and writes its package's name to `construits.txt`. The
// witnesses (`construits.txt`, `joues.txt`) live in the session's working directory, which the
// envelope of a package writes, the rest of the copy read-only (grillhouse-3uv.92.4).
function depot() {
  const repo = path.join(ESSAIS, 'depot');
  const copie = path.join(repo, '.claude/worktrees/demo-1');
  const temoins = dossierDeTravail(copie);
  mkdirSync(temoins, { recursive: true });
  ecrire(
    repo,
    'package.json',
    json({
      name: 'essai',
      private: true,
      type: 'module',
      workspaces: ['packages/*'],
      packageManager: 'npm@10.9.8',
    })
  );
  ecrire(
    repo,
    'turbo.json',
    readFileSync(path.join(DEPOT, 'templates/turbo/paquets.json'), 'utf8')
  );
  copyFileSync(path.join(DEPOT, 'tsdoc.json'), path.join(repo, 'tsdoc.json'));
  ecrire(
    repo,
    'construire.mjs',
    [
      "import { appendFileSync, copyFileSync, mkdirSync } from 'node:fs';",
      "import path from 'node:path';",
      "mkdirSync('dist', { recursive: true });",
      "copyFileSync('src/index.d.ts', 'dist/index.d.ts');",
      `appendFileSync(${JSON.stringify(path.join(temoins, 'construits.txt'))}, \`\${path.basename(process.cwd())}\\n\`);`,
      '',
    ].join('\n')
  );
  const paquets: Record<string, Record<string, unknown>> = {
    forms: {},
    etage: { dependencies: { forms: '*' }, devDependencies: { corpus: '*' } },
    kernel: {
      dependencies: { forms: '*' },
      devDependencies: { corpus: '*' },
      scripts: { build: 'node ../../construire.mjs', 'test:vitest': 'vitest run' },
    },
    corpus: {
      dependencies: { forms: '*', etage: '*', kernel: '*' },
      exports: { './test-fixtures': { types: './dist/index.d.ts' } },
      scripts: { build: 'node ../../construire.mjs', 'test:vitest': 'vitest run' },
    },
  };
  for (const [nom, champs] of Object.entries(paquets)) {
    ecrire(
      repo,
      `packages/${nom}/package.json`,
      json({
        name: nom,
        type: 'module',
        types: 'dist/index.d.ts',
        scripts: { build: 'node ../../construire.mjs' },
        ...champs,
      })
    );
    ecrire(repo, `packages/${nom}/src/index.d.ts`, declarations(nom));
    ecrire(
      repo,
      `packages/${nom}/tsconfig.json`,
      json({ compilerOptions: { strict: true, skipLibCheck: true } })
    );
    ecrire(repo, `packages/${nom}/docs/INTERFACE.md`, `# ${nom}\n\n${DEBUT}\n${FIN}\n`);
  }
  // A test writes its name to `joues.txt`; `corpus/echec` fails on its assertion.
  const test = (nom: string, passe = true) =>
    [
      "import { appendFileSync } from 'node:fs';",
      "import { expect, it } from 'vitest';",
      `it('${nom}', () => {`,
      `  appendFileSync(${JSON.stringify(path.join(temoins, 'joues.txt'))}, '${nom}\\n');`,
      `  expect(${passe}).toBe(true);`,
      '});',
      '',
    ].join('\n');
  ecrire(
    repo,
    'packages/kernel/vitest.config.mjs',
    `import base from ${JSON.stringify(BASE)};\nexport default base;\n`
  );
  // The material's configuration is CommonJS, as the frame asks (scripts/langages/typescript/turbo-des-paquets.mjs),
  // and reaches the frame's base, ESM, by its name, as a project does: by a dynamic import, which
  // Vite lets through where it refuses a `require` of an ESM package.
  ecrire(
    repo,
    'packages/corpus/vitest.config.cjs',
    [
      "const { defineConfig, mergeConfig } = require('vitest/config');",
      'module.exports = defineConfig(async () =>',
      "  mergeConfig((await import('@roomi-fields/grillhouse/vitest-config')).default, {})",
      ');',
      '',
    ].join('\n')
  );
  ecrire(repo, 'packages/kernel/test/x.test.mjs', test('kernel/x'));
  ecrire(repo, 'packages/corpus/test/x.test.mjs', test('corpus/x'));
  ecrire(repo, 'packages/corpus/echec/x.test.mjs', test('corpus/echec', false));
  ecrire(repo, '.gitignore', 'node_modules\n.turbo/\ndist/\n');
  ecrireTurbo(repo);
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'init');
  git('worktree', 'add', '-q', '-b', 'agent/demo-1', copie);
  lierLesDependances(copie);
  // The frame's base, a workspace of a project, reached by its name from the material.
  const base = path.join(copie, 'packages/corpus/node_modules/@grillhouse');
  mkdirSync(base, { recursive: true });
  symlinkSync(path.dirname(BASE), path.join(base, 'vitest-config'), 'dir');
  return { repo, copie, temoins };
}

const ENV = {
  ...process.env,
  PATH: `${BIN}${path.delimiter}${process.env.PATH ?? ''}`,
  TURBO_TELEMETRY_DISABLED: '1',
  DO_NOT_TRACK: '1',
};

describe.runIf(canWrap)(
  "the frame's commands in the envelope of one package",
  { timeout: 120_000 },
  () => {
    const { copie, temoins } = depot();
    const home = path.join(ESSAIS, 'home');
    mkdirSync(path.join(home, '.claude'), { recursive: true });
    // The launcher builds the copy outside the envelope: the neighbours arrive built.
    const dehors = (shell: string) =>
      spawnSync('bash', ['-c', shell], { cwd: copie, encoding: 'utf8', env: ENV });
    const preparation = dehors('turbo run build');
    const dans = (role: string, shell: string) =>
      spawnSync('node', [ENVELOPPE, copie, 'packages/kernel', role, '--', 'bash', '-c', shell], {
        encoding: 'utf8',
        env: { ...ENV, HOME: home },
      });
    const dedans = (shell: string) => dans('developpeur', shell);
    const sortie = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`;
    const lignes = (f: string) =>
      existsSync(path.join(temoins, f))
        ? readFileSync(path.join(temoins, f), 'utf8').split('\n').filter(Boolean)
        : [];
    // The tasks of a dry run of Turborepo, sorted.
    const taches = (r: { stdout: string }) =>
      (JSON.parse(r.stdout) as { tasks: { taskId: string }[] }).tasks.map(t => t.taskId).sort();

    it('the copy is built outside the envelope, as the launcher builds it', () => {
      expect(preparation.status, sortie(preparation)).toBe(0);
    });

    it('names its component to every command of the session', () => {
      const r = dedans('printenv GRILLHOUSE_ENVELOPPE');
      expect(r.stdout).toBe('packages/kernel\n');
    });

    it('refuses a component named by its package, and gives its path', () => {
      const r = spawnSync('node', [ENVELOPPE, copie, 'kernel', 'developpeur', '--', 'true'], {
        encoding: 'utf8',
        env: { ...ENV, HOME: home },
      });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('packages/kernel');
    });

    // Cause: a package's turbo.json, which replaces the root's `^build` by its runtime
    // dependencies, was hidden with the neighbour's source; Turborepo then gave the neighbour the
    // root's `^build`, which follows its devDependency on the shared test material, and the
    // material depends on the neighbour: a cycle.
    it("shows a neighbour's package configuration: Turborepo reads the graph it reads outside", () => {
      expect(dedans('cat packages/etage/turbo.json').status).toBe(0);
      const graphe = 'turbo run build --filter=kernel... --dry=json';
      const r = dedans(graphe);
      expect(r.status, sortie(r)).toBe(0);
      expect(taches(r)).toEqual(taches(dehors(graphe)));
    });

    it('npm test -- <files> builds the agent package only, and plays its tests', () => {
      rmSync(path.join(temoins, 'construits.txt'), { force: true });
      const r = dedans(`node ${TESTS} --force packages/kernel/test/x.test.mjs`);
      expect(r.status, sortie(r)).toBe(0);
      expect(lignes('joues.txt')).toContain('kernel/x');
      expect(lignes('construits.txt').filter(p => p !== 'kernel')).toEqual([]);
    });

    // Witness: BPScript (packages/990-corpus). The shared test material is read-only for every role
    // but the testwriter; a targeted run of one of its tests built it, and Turborepo wrote its task
    // logs in it (`.turbo/turbo-<task>.log`): « Cannot write logs: Read-only file system », and the
    // developer could not play a bench of the material. As in Bazel, a read-only input arrives
    // built, and the logs of a test go to an output directory, never into the source.
    describe('a test of the shared material, in the envelope of a role that does not write it', () => {
      // Every path under the material, with its time of modification.
      const etat = () =>
        execFileSync('find', [path.join(copie, 'packages/corpus'), '-printf', '%p %T@\\n'], {
          encoding: 'utf8',
        });

      it('plays without building the material or writing anything in it', () => {
        rmSync(path.join(temoins, 'construits.txt'), { force: true });
        rmSync(path.join(temoins, 'joues.txt'), { force: true });
        // A first session makes the empty directories the envelope mounts its own over.
        expect(dedans('true').status).toBe(0);
        const avant = etat();
        const r = dedans(`node ${TESTS} packages/corpus/test/x.test.mjs`);
        expect(r.status, sortie(r)).toBe(0);
        expect(lignes('joues.txt')).toEqual(['corpus/x']);
        expect(lignes('construits.txt')).toEqual([]);
        expect(etat()).toBe(avant);
      });

      it('gives its true verdict: a failing test fails on its assertion', () => {
        rmSync(path.join(temoins, 'joues.txt'), { force: true });
        const r = dedans(`node ${TESTS} packages/corpus/echec/x.test.mjs`);
        expect(r.status).not.toBe(0);
        expect(lignes('joues.txt')).toEqual(['corpus/echec']);
        expect(sortie(r)).not.toContain('Read-only file system');
      });

      it('in the envelope of the testwriter, the material builds and writes as before', () => {
        rmSync(path.join(temoins, 'construits.txt'), { force: true });
        const journal = path.join(copie, 'packages/corpus/.turbo/turbo-test$colon$vitest.log');
        rmSync(journal, { force: true });
        // A change to the material's source: its build misses the cache, and plays.
        ecrire(copie, 'packages/corpus/src/index.d.ts', `${declarations('corpus')}// changé\n`);
        const r = dans('testwriter', `node ${TESTS} packages/corpus/test/x.test.mjs`);
        expect(r.status, sortie(r)).toBe(0);
        expect(lignes('construits.txt')).toEqual(['corpus']);
        expect(readFileSync(path.join(copie, 'packages/corpus/dist/index.d.ts'), 'utf8')).toContain(
          '// changé'
        );
        expect(existsSync(journal)).toBe(true);
      });
    });

    it("npm run api writes the agent package's API report and generated part, its neighbours untouched", () => {
      const r = dedans(`node ${TESTS} packages/kernel/test/x.test.mjs && node ${API} --ecrire`);
      expect(r.status, sortie(r)).toBe(0);
      expect(readFileSync(path.join(copie, 'packages/kernel/docs/INTERFACE.md'), 'utf8')).toContain(
        '### `kernel`'
      );
      expect(existsSync(path.join(copie, 'packages/kernel/docs/INTERFACE.api.md'))).toBe(true);
      expect(existsSync(path.join(copie, 'packages/forms/docs/INTERFACE.api.md'))).toBe(false);
      const controle = dedans(`node ${API}`);
      expect(controle.status, sortie(controle)).toBe(0);
    });
  }
);

// Witness: BPScript (ticket 320.5.2). A parent ticket changed a form of 000-forms, the provider, its
// lot written in the copy; its children 020-loader and 050-emitter follow in the same copy. The
// launcher built the whole copy and stopped on the first failure: 020-loader no longer built, which
// was the child's work, and no session of a consumer could open. As Bazel builds a target's
// dependencies, the launcher builds the providers of the session's package; the package's own
// failure goes into the instruction.
describe.runIf(canWrap)(
  "the launcher builds the session package's providers first",
  { timeout: 300_000 },
  () => {
    const repo = path.join(ESSAIS, 'lanceur');
    ecrire(
      repo,
      'package.json',
      json({
        name: 'essai',
        private: true,
        workspaces: ['packages/*'],
        packageManager: 'npm@10.9.8',
      })
    );
    ecrire(
      repo,
      'turbo.json',
      readFileSync(path.join(DEPOT, 'templates/turbo/paquets.json'), 'utf8')
    );
    // A build fails when its package holds src/casse, or when the file it reads lacks the word.
    ecrire(
      repo,
      'construire.mjs',
      [
        "import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';",
        'const [lu, mot] = process.argv.slice(2);',
        "if (existsSync('src/casse')) { console.error('construction cassée'); process.exit(1); }",
        "if (lu && !readFileSync(lu, 'utf8').includes(mot)) {",
        "  console.error(`src/objects.ts(20,26): error TS2339: Property '${mot}' does not exist.`);",
        '  process.exit(1);',
        '}',
        "mkdirSync('dist', { recursive: true });",
        "copyFileSync('src/index.d.ts', 'dist/index.d.ts');",
        '',
      ].join('\n')
    );
    ecrire(
      repo,
      'packages/forms/package.json',
      json({ name: 'forms', scripts: { build: 'node ../../construire.mjs' } })
    );
    ecrire(repo, 'packages/forms/src/index.d.ts', 'export declare const name: string;\n');
    ecrire(
      repo,
      'packages/loader/package.json',
      json({
        name: 'loader',
        dependencies: { forms: '*' },
        scripts: { build: 'node ../../construire.mjs ../forms/dist/index.d.ts name' },
      })
    );
    ecrire(repo, 'packages/loader/src/index.d.ts', 'export declare const charge: string;\n');
    ecrire(repo, '.gitignore', 'node_modules\n.turbo/\ndist/\n.claude/worktrees/\n');
    cpSync(path.join(DEPOT, 'packages/grillhouse/scripts'), path.join(repo, 'scripts'), {
      recursive: true,
    });
    // The main tree's Turborepo, which the copy, under it, reaches as a project's copy does.
    lierLesDependances(repo);
    // A stand-in for claude: it writes its arguments, one per NUL, and the prompt it reads on its
    // standard input, in the session's component.
    const faux = path.join(repo, 'faux-claude.sh');
    ecrire(
      repo,
      'faux-claude.sh',
      '#!/bin/bash\nprintf "%s\\0" "$@" > packages/loader/args\ncat > packages/loader/prompt\n'
    );
    chmodSync(faux, 0o755);
    ecrireTurbo(repo);
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'init');
    const home = path.join(ESSAIS, 'home-lanceur');
    mkdirSync(path.join(home, '.claude'), { recursive: true });
    const copie = path.join(repo, '.claude/worktrees/demo-1');
    const args = path.join(copie, 'packages/loader/args');
    const recu = path.join(copie, 'packages/loader/prompt');

    // A launch of the developpeur on <composant>, with the options <options> before its arguments.
    const lancer = (options: string[] = [], composant = 'packages/loader') => {
      rmSync(args, { force: true });
      rmSync(recu, { force: true });
      const consigne = path.join(ESSAIS, 'consigne.txt');
      writeFileSync(consigne, 'TON TICKET : demo-1 — suivre forms.');
      const r = spawnSync(
        'bash',
        [LANCEUR, ...options, 'demo-1', 'developpeur', composant, consigne],
        {
          cwd: repo,
          encoding: 'utf8',
          env: { ...ENV, CLAUDE_BIN: faux, HOME: home },
        }
      );
      const journal = existsSync(`${copie}.log`) ? readFileSync(`${copie}.log`, 'utf8') : '';
      const prompt = existsSync(recu) ? readFileSync(recu, 'utf8') : null;
      return { r, prompt, trace: `${r.stderr}\n${journal}` };
    };

    it('opens the session of a package that builds, its instruction without a build section', () => {
      const { r, prompt, trace } = lancer();
      expect(r.status, trace).toBe(0);
      expect(prompt).toContain('TON TICKET : demo-1');
      expect(prompt).not.toContain('La construction échoue');
    });

    it("opens the session of a consumer that a provider's lot breaks, the error in its instruction", () => {
      writeFileSync(
        path.join(copie, 'packages/forms/src/index.d.ts'),
        'export declare const nom: string;\n'
      );
      const { r, prompt, trace } = lancer();
      expect(r.status, trace).toBe(0);
      expect(prompt).toContain('La construction échoue');
      expect(prompt).toContain("Property 'name' does not exist");
      expect(prompt).toContain('## Ton dossier de travail');
      // The section of the build comes last, after the working directory.
      expect(prompt?.indexOf('## La construction échoue')).toBeGreaterThan(
        prompt?.indexOf('## Ton dossier de travail') ?? Infinity
      );
      // The provider was built with its lot.
      expect(readFileSync(path.join(copie, 'packages/forms/dist/index.d.ts'), 'utf8')).toContain(
        'nom'
      );
    });

    // grillhouse-3uv.95.6: the circuit launches one session for the whole ticket, `.` as its
    // component and the packages of the plan as `--paquets`: the launch builds the packages of the
    // plan, their providers first, and one of them that does not build opens the session, its error
    // in the instruction, as it does for one package; the whole copy is not built in its place.
    it('builds the packages of the plan of a session over the whole ticket, a failure in its instruction', () => {
      writeFileSync(
        path.join(copie, 'packages/forms/src/index.d.ts'),
        'export declare const nom: string;\n'
      );
      const { r, prompt, trace } = lancer(['--paquets', 'packages/forms:packages/loader'], '.');
      expect(r.status, trace).toBe(0);
      expect(prompt).toContain('La construction échoue');
      expect(prompt).toContain('La construction des paquets de ton plan échoue');
      expect(prompt).toContain("Property 'name' does not exist");
      expect(readFileSync(path.join(copie, 'packages/forms/dist/index.d.ts'), 'utf8')).toContain(
        'nom'
      );
    });

    it('stops the launch when a provider does not build', () => {
      writeFileSync(path.join(copie, 'packages/forms/src/casse'), '');
      const { r, prompt } = lancer();
      expect(r.status).toBe(CODE_COPIE);
      expect(prompt).toBeNull();
    });

    // Witness: a project whose graph of one package, `turbo run build --filter=<paquet>
    // --dry=json`, held 216 948 bytes: passed as an argument, it went past the 128 KiB Linux
    // allows one argument (MAX_ARG_STRLEN), « Liste d'arguments trop longue ». A stand-in for
    // Turborepo, in the copy's own binaries, where `npx --no-install turbo` looks first, pads every
    // plan it prints past that size.
    it('reads a graph of Turborepo larger than one argument allows', () => {
      const gros = path.join(repo, '.claude/worktrees/demo-gros');
      const consigne = path.join(ESSAIS, 'consigne-gros.txt');
      writeFileSync(consigne, 'TON TICKET : demo-gros — suivre forms.');
      const lancerGros = () =>
        spawnSync('bash', [LANCEUR, 'demo-gros', 'developpeur', 'packages/loader', consigne], {
          cwd: repo,
          encoding: 'utf8',
          env: { ...ENV, CLAUDE_BIN: faux, HOME: home },
        });
      // A first launch makes the copy, with the real Turborepo.
      expect(lancerGros().status).toBe(0);
      const appels = path.join(ESSAIS, 'appels-turbo-gros');
      const reel = JSON.stringify(path.join(BIN, 'turbo'));
      ecrire(
        gros,
        'node_modules/.bin/turbo',
        [
          '#!/bin/bash',
          'set -o pipefail',
          `echo "$*" >> ${JSON.stringify(appels)}`,
          'case " $* " in',
          `  *" --dry=json "*) ${reel} "$@" | node -e 'const g = JSON.parse(require("node:fs").readFileSync(0, "utf8")); g.remplissage = "x".repeat(256 * 1024); process.stdout.write(JSON.stringify(g));' ;;`,
          `  *) exec ${reel} "$@" ;;`,
          'esac',
          '',
        ].join('\n')
      );
      chmodSync(path.join(gros, 'node_modules/.bin/turbo'), 0o755);
      const r = lancerGros();
      const journal = existsSync(`${gros}.log`) ? readFileSync(`${gros}.log`, 'utf8') : '';
      expect(existsSync(appels) ? readFileSync(appels, 'utf8') : '').toContain(
        '--filter=loader --dry=json'
      );
      expect(r.status, `${r.stderr}\n${journal}`).toBe(0);
      expect(readFileSync(path.join(gros, 'packages/loader/prompt'), 'utf8')).toContain(
        'TON TICKET : demo-gros'
      );
    });
  }
);

// Witness: BPScript. Between the testwriter's lot and the developer's, the build of 030-binder failed;
// Turborepo, by default (`--continue=never`), cancelled the build of 040-checker, which its tests
// read and whose build does not wait for it: the copy kept a dist/ of 040-checker half rewritten,
// read-only in the envelope, and every test of 030-binder crashed on loading. As Bazel's
// `--keep_going`, a failure stops only what depends on it: what the tests read is built whole.
describe.runIf(canWrap)(
  "the launcher builds what the session package's tests read, whole, when its own build fails",
  { timeout: 300_000 },
  () => {
    const repo = path.join(ESSAIS, 'lanceur-lus');
    ecrire(
      repo,
      'package.json',
      json({
        name: 'essai',
        private: true,
        workspaces: ['packages/*'],
        packageManager: 'npm@10.9.8',
      })
    );
    ecrire(
      repo,
      'turbo.json',
      readFileSync(path.join(DEPOT, 'templates/turbo/paquets.json'), 'utf8')
    );
    // `lent`, which the tests of `paq` read, writes the start of its dist/, waits, then its end.
    ecrire(
      repo,
      'packages/lent/construire.mjs',
      [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "mkdirSync('dist', { recursive: true });",
        "writeFileSync('dist/debut.txt', 'début');",
        'await new Promise(r => setTimeout(r, 5000));',
        "writeFileSync('dist/fin.txt', 'fin');",
        '',
      ].join('\n')
    );
    ecrire(
      repo,
      'packages/lent/package.json',
      json({ name: 'lent', type: 'module', scripts: { build: 'node construire.mjs' } })
    );
    // `paq`'s build fails at once; it reads `lent` in its tests only.
    ecrire(
      repo,
      'packages/paq/package.json',
      json({
        name: 'paq',
        devDependencies: { lent: '*' },
        scripts: { build: "echo 'construction cassée' >&2; exit 1" },
      })
    );
    ecrire(repo, '.gitignore', 'node_modules\n.turbo/\ndist/\n.claude/worktrees/\n');
    cpSync(path.join(DEPOT, 'packages/grillhouse/scripts'), path.join(repo, 'scripts'), {
      recursive: true,
    });
    // The main tree's Turborepo, which the copy, under it, reaches as a project's copy does.
    lierLesDependances(repo);
    // A stand-in for claude: it writes the prompt it reads on its standard input.
    const faux = path.join(repo, 'faux-claude.sh');
    ecrire(repo, 'faux-claude.sh', '#!/bin/bash\ncat > "$GRILLHOUSE_ENVELOPPE/prompt"\n');
    chmodSync(faux, 0o755);
    // A folder that is no package of the frame, as BPScript's libraries/ and spec/.
    ecrire(repo, 'libraries/LISEZMOI.md', 'Les bibliothèques.\n');
    // A stand-in for claude in a session whose plan names that folder: it writes its prompt in paq.
    const fauxHors = path.join(repo, 'faux-claude-hors.sh');
    ecrire(repo, 'faux-claude-hors.sh', '#!/bin/bash\ncat > packages/paq/prompt\n');
    chmodSync(fauxHors, 0o755);
    ecrireTurbo(repo);
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'init');
    const home = path.join(ESSAIS, 'home-lanceur-lus');
    mkdirSync(path.join(home, '.claude'), { recursive: true });

    it('opens the session, the error in its instruction, and what its tests read built whole', () => {
      const copie = path.join(repo, '.claude/worktrees/demo-1');
      const consigne = path.join(ESSAIS, 'consigne-lus.txt');
      writeFileSync(consigne, 'TON TICKET : demo-1 — réparer paq.');
      const r = spawnSync('bash', [LANCEUR, 'demo-1', 'developpeur', 'packages/paq', consigne], {
        cwd: repo,
        encoding: 'utf8',
        env: { ...ENV, CLAUDE_BIN: faux, HOME: home },
      });
      const journal = existsSync(`${copie}.log`) ? readFileSync(`${copie}.log`, 'utf8') : '';
      const trace = `${r.stderr}\n${journal}`;
      expect(r.status, trace).toBe(0);
      const prompt = readFileSync(path.join(copie, 'packages/paq/prompt'), 'utf8');
      expect(prompt).toContain('La construction échoue');
      expect(prompt).toContain('construction cassée');
      expect(existsSync(path.join(copie, 'packages/lent/dist/fin.txt')), trace).toBe(true);
    });

    // Witness: BPScript bp-mono-vbwf.320.14.2.1 (grillhouse-6q1). The plan of the developpeur's
    // session named libraries and spec, which are no packages of the frame: the launcher built the
    // copy whole, stopped on the failure of 990-corpus#build (the red the testwriter wrote for the
    // developpeur), and the session never opened (code 10). As Bazel's --keep_going, which the
    // launcher follows for a plan of packages: the copy is built as far as it builds, and the
    // failure goes into the instruction.
    it('builds the copy whole as far as it builds when the plan names a path out of the packages, the error in its instruction', () => {
      // A change of `lent`, so that its build runs anew instead of coming back from the cache.
      ecrire(repo, 'packages/lent/LISEZMOI.md', 'Lent.\n');
      git('add', '.');
      git('commit', '-qm', 'lent');
      const copie = path.join(repo, '.claude/worktrees/demo-2');
      const consigne = path.join(ESSAIS, 'consigne-hors.txt');
      writeFileSync(consigne, 'TON TICKET : demo-2 — réparer paq.');
      const r = spawnSync(
        'bash',
        [LANCEUR, '--paquets', 'libraries:packages/paq', 'demo-2', 'developpeur', '.', consigne],
        { cwd: repo, encoding: 'utf8', env: { ...ENV, CLAUDE_BIN: fauxHors, HOME: home } }
      );
      const journal = existsSync(`${copie}.log`) ? readFileSync(`${copie}.log`, 'utf8') : '';
      const trace = `${r.stderr}\n${journal}`;
      expect(r.status, trace).toBe(0);
      const prompt = readFileSync(path.join(copie, 'packages/paq/prompt'), 'utf8');
      expect(prompt).toContain('TON TICKET : demo-2');
      expect(prompt).toContain('## La construction échoue');
      expect(prompt).toContain('La construction de la copie entière échoue');
      expect(prompt).toContain('construction cassée');
      // What the failure does not wait for is built to its end.
      expect(existsSync(path.join(copie, 'packages/lent/dist/fin.txt')), trace).toBe(true);
    });
  }
);

// Witness: BPScript (320.6.6). The tests of 070-deriver read the trace of 060-encoder
// (`grillhouse.lit` over its `grillhouse.traces`); in the envelope, the build is the package's
// alone, and the trace lives in the producer, read-only: the session's test failed, « trace
// absente ». As in a sandbox of Bazel, the inputs of a test arrive ready: the launcher produces
// the traces the session package's tests wait for, before the session.
describe.runIf(canWrap)(
  "the launcher produces the traces the session package's tests read",
  { timeout: 300_000 },
  () => {
    const repo = path.join(ESSAIS, 'lanceur-traces');
    ecrire(
      repo,
      'package.json',
      json({
        name: 'essai',
        private: true,
        workspaces: ['packages/*'],
        packageManager: 'npm@10.9.8',
      })
    );
    ecrire(
      repo,
      'turbo.json',
      readFileSync(path.join(DEPOT, 'templates/turbo/paquets.json'), 'utf8')
    );
    // The trace of `prod` fails when its package holds `casse`.
    ecrire(
      repo,
      'packages/prod/trace.mjs',
      [
        "import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';",
        "if (existsSync('casse')) { console.error('trace cassée'); process.exit(1); }",
        "rmSync('trace/g', { recursive: true, force: true });",
        "mkdirSync('trace/g', { recursive: true });",
        "writeFileSync('trace/g/x.txt', 'trace de prod');",
        '',
      ].join('\n')
    );
    ecrire(
      repo,
      'packages/prod/package.json',
      json({
        name: 'prod',
        scripts: { build: 'true', 'trace:g': 'node trace.mjs', 'test:vitest': 'true' },
        // Its tests read its own trace too, as BPScript's 060-encoder.
        grillhouse: {
          lit: ['packages/prod/trace/g'],
          traces: { 'trace:g': { lit: [], ecrit: 'packages/prod/trace/g' } },
        },
      })
    );
    ecrire(
      repo,
      'packages/lect/package.json',
      json({
        name: 'lect',
        scripts: { build: 'true', 'test:vitest': 'true' },
        grillhouse: { lit: ['packages/prod/trace/g'] },
      })
    );
    ecrire(
      repo,
      '.gitignore',
      'node_modules\n.turbo/\ndist/\n.claude/worktrees/\npackages/prod/trace/\n'
    );
    cpSync(path.join(DEPOT, 'packages/grillhouse/scripts'), path.join(repo, 'scripts'), {
      recursive: true,
    });
    // The main tree's Turborepo, which the copy, under it, reaches as a project's copy does.
    lierLesDependances(repo);
    // A stand-in for claude: inside the envelope, it writes its arguments, one per NUL, the prompt
    // it reads on its standard input, and a copy of the trace, in the session's component.
    const faux = path.join(repo, 'faux-claude.sh');
    ecrire(
      repo,
      'faux-claude.sh',
      [
        '#!/bin/bash',
        'printf "%s\\0" "$@" > "$GRILLHOUSE_ENVELOPPE/args"',
        'cat > "$GRILLHOUSE_ENVELOPPE/prompt"',
        'cat packages/prod/trace/g/x.txt > "$GRILLHOUSE_ENVELOPPE/vu" 2>&1 || true',
        '',
      ].join('\n')
    );
    chmodSync(faux, 0o755);
    ecrireTurbo(repo);
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'init');
    const home = path.join(ESSAIS, 'home-lanceur-traces');
    mkdirSync(path.join(home, '.claude'), { recursive: true });

    // Launches the session of <ticket> on <composant>: its code, what it read of the trace, its
    // prompt (null when no session opened), its stderr and log.
    const lancer = (ticket: string, composant: string) => {
      const copie = path.join(repo, '.claude/worktrees', ticket);
      const vu = path.join(copie, composant, 'vu');
      const args = path.join(copie, composant, 'args');
      const recu = path.join(copie, composant, 'prompt');
      rmSync(vu, { force: true });
      rmSync(args, { force: true });
      rmSync(recu, { force: true });
      const consigne = path.join(ESSAIS, 'consigne-traces.txt');
      writeFileSync(consigne, `TON TICKET : ${ticket} — lire la trace.`);
      const r = spawnSync('bash', [LANCEUR, ticket, 'developpeur', composant, consigne], {
        cwd: repo,
        encoding: 'utf8',
        env: { ...ENV, CLAUDE_BIN: faux, HOME: home },
      });
      const journal = existsSync(`${copie}.log`) ? readFileSync(`${copie}.log`, 'utf8') : '';
      return {
        r,
        lu: existsSync(vu) ? readFileSync(vu, 'utf8') : null,
        prompt: existsSync(args) && existsSync(recu) ? readFileSync(recu, 'utf8') : null,
        trace: `${r.stderr}\n${journal}`,
      };
    };

    it("produces another package's trace before the session, which reads it in its envelope", () => {
      const { r, lu, trace } = lancer('demo-1', 'packages/lect');
      expect(r.status, trace).toBe(0);
      expect(lu, trace).toBe('trace de prod');
    });

    it("stops the launch when another package's trace fails, as a provider that does not build", () => {
      const copie = path.join(repo, '.claude/worktrees/demo-1');
      rmSync(path.join(copie, 'packages/prod/trace'), { recursive: true, force: true });
      writeFileSync(path.join(copie, 'packages/prod/casse'), '');
      const { r, prompt } = lancer('demo-1', 'packages/lect');
      expect(r.status).toBe(CODE_COPIE);
      expect(prompt).toBeNull();
    });

    it("produces the package's own trace with its build, its failure in the instruction", () => {
      const { r, lu, trace } = lancer('demo-2', 'packages/prod');
      expect(r.status, trace).toBe(0);
      expect(lu, trace).toBe('trace de prod');
      const copie = path.join(repo, '.claude/worktrees/demo-2');
      rmSync(path.join(copie, 'packages/prod/trace'), { recursive: true, force: true });
      writeFileSync(path.join(copie, 'packages/prod/casse'), '');
      const casse = lancer('demo-2', 'packages/prod');
      expect(casse.r.status, casse.trace).toBe(0);
      expect(casse.prompt).toContain('La construction échoue');
      expect(casse.prompt).toContain('trace cassée');
    });
  }
);

// Witness: BPScript (bp-mono-vbwf.320.10, 0.24.7). The plan held 990-corpus, the shared test
// material, and the stages whose tests read it; the testwriter's calls to a new signature left
// 990-corpus unbuilt until the developer's code, the red expected. The tests of the stages wait for
// the trace of 060-encoder, out of the plan, whose task waits for 990-corpus's build: the step of the
// other packages' traces built 990-corpus, and its failure stopped the launch, code 10 « lancement ».
// As Bazel builds a target's dependencies and, under --keep_going, every target whose dependencies
// succeed: a package of the plan stays a target of the plan, even as another's dependency; a task
// out of the plan that waits for it is built with the plan, and only a provider that fails on its
// own stops the launch.
describe.runIf(canWrap)(
  'the launcher builds a package of the plan that provides another with the plan',
  { timeout: 300_000 },
  () => {
    const repo = path.join(ESSAIS, 'lanceur-plan-fournisseur');
    ecrire(
      repo,
      'package.json',
      json({
        name: 'essai',
        private: true,
        workspaces: ['packages/*'],
        packageManager: 'npm@10.9.8',
      })
    );
    ecrire(
      repo,
      'turbo.json',
      readFileSync(path.join(DEPOT, 'templates/turbo/paquets.json'), 'utf8')
    );
    // A build fails when its package holds src/casse, the error on its output.
    ecrire(
      repo,
      'construire.mjs',
      [
        "import { existsSync, mkdirSync, writeFileSync } from 'node:fs';",
        "if (existsSync('src/casse')) {",
        '  console.error("error TS2345: Argument of type \'Table\' is not assignable.");',
        '  process.exit(1);',
        '}',
        "mkdirSync('dist', { recursive: true });",
        "writeFileSync('dist/index.d.ts', 'export {};\\n');",
        '',
      ].join('\n')
    );
    // `forms`, out of the plan, provides every package; `corpus`, of the plan, is the shared
    // material; `mid`, out of the plan, provides `stage` and its build waits for `corpus`'s; the
    // trace of `prod`, out of the plan, which `stage`'s tests read, waits for `corpus`'s build (its
    // devDependency); `stage`, of the plan, tests itself with `corpus`.
    const paquets: Record<string, Record<string, unknown>> = {
      forms: {},
      corpus: { dependencies: { forms: '*' } },
      mid: { dependencies: { corpus: '*' } },
      prod: {
        devDependencies: { corpus: '*' },
        scripts: { build: 'node ../../construire.mjs', 'trace:g': 'node trace.mjs' },
        grillhouse: { traces: { 'trace:g': { lit: [], ecrit: 'packages/prod/trace/g' } } },
      },
      stage: {
        dependencies: { forms: '*', mid: '*' },
        devDependencies: { corpus: '*' },
        scripts: { build: 'node ../../construire.mjs', 'test:vitest': 'true' },
        grillhouse: { lit: ['packages/prod/trace/g'] },
      },
    };
    for (const [nom, champs] of Object.entries(paquets)) {
      ecrire(
        repo,
        `packages/${nom}/package.json`,
        json({ name: nom, scripts: { build: 'node ../../construire.mjs' }, ...champs })
      );
      ecrire(repo, `packages/${nom}/src/index.d.ts`, 'export {};\n');
    }
    ecrire(
      repo,
      'packages/prod/trace.mjs',
      [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "mkdirSync('trace/g', { recursive: true });",
        "writeFileSync('trace/g/x.txt', 'trace de prod');",
        '',
      ].join('\n')
    );
    ecrire(
      repo,
      '.gitignore',
      'node_modules\n.turbo/\ndist/\n.claude/worktrees/\npackages/prod/trace/\n'
    );
    cpSync(path.join(DEPOT, 'packages/grillhouse/scripts'), path.join(repo, 'scripts'), {
      recursive: true,
    });
    // The main tree's Turborepo, which the copy, under it, reaches as a project's copy does.
    lierLesDependances(repo);
    // A stand-in for claude: it writes the prompt it reads on its standard input in a package of
    // the plan, which the envelope opens in writing.
    const faux = path.join(repo, 'faux-claude.sh');
    ecrire(repo, 'faux-claude.sh', '#!/bin/bash\ncat > packages/stage/prompt\n');
    chmodSync(faux, 0o755);
    ecrireTurbo(repo);
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'init');
    const home = path.join(ESSAIS, 'home-lanceur-plan-fournisseur');
    mkdirSync(path.join(home, '.claude'), { recursive: true });
    const copie = path.join(repo, '.claude/worktrees/demo-1');
    const recu = path.join(copie, 'packages/stage/prompt');

    // A launch of the circuit's session over the whole ticket, its plan `corpus` and `stage`.
    const lancer = () => {
      rmSync(recu, { force: true });
      const consigne = path.join(ESSAIS, 'consigne-plan-fournisseur.txt');
      writeFileSync(consigne, 'TON TICKET : demo-1 — suivre la signature.');
      const r = spawnSync(
        'bash',
        [
          LANCEUR,
          '--paquets',
          'packages/corpus:packages/stage',
          'demo-1',
          'developpeur',
          '.',
          consigne,
        ],
        { cwd: repo, encoding: 'utf8', env: { ...ENV, CLAUDE_BIN: faux, HOME: home } }
      );
      const journal = existsSync(`${copie}.log`) ? readFileSync(`${copie}.log`, 'utf8') : '';
      const prompt = existsSync(recu) ? readFileSync(recu, 'utf8') : null;
      return { r, prompt, trace: `${r.stderr}\n${journal}` };
    };

    it('builds the plan with what waits for it out of the plan, the instruction without a build section', () => {
      const { r, prompt, trace } = lancer();
      expect(r.status, trace).toBe(0);
      expect(prompt, trace).not.toContain('La construction échoue');
      expect(readFileSync(path.join(copie, 'packages/prod/trace/g/x.txt'), 'utf8')).toBe(
        'trace de prod'
      );
      expect(existsSync(path.join(copie, 'packages/mid/dist/index.d.ts')), trace).toBe(true);
    });

    it('opens the session when a package of the plan that provides another fails, the error in its instruction', () => {
      writeFileSync(path.join(copie, 'packages/corpus/src/casse'), '');
      const { r, prompt, trace } = lancer();
      rmSync(path.join(copie, 'packages/corpus/src/casse'));
      expect(r.status, trace).toBe(0);
      expect(prompt, trace).toContain('La construction échoue');
      expect(prompt).toContain('error TS2345');
    });

    it('stops the launch when a provider out of the plan fails, as before', () => {
      writeFileSync(path.join(copie, 'packages/forms/src/casse'), '');
      const { r, prompt } = lancer();
      rmSync(path.join(copie, 'packages/forms/src/casse'));
      expect(r.status).toBe(CODE_COPIE);
      expect(prompt).toBeNull();
    });
  }
);
