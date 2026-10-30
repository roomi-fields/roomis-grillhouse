import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { LANGAGE } from '@roomi-fields/grillhouse-matiere/test-fixtures';

// grillhouse-3uv.84.4 critère 5, a night test: the package packed as npm publishes it (`npm pack`,
// its prepack carrying the frame's files under cadre/) installs in a fresh project, whose
// `grillhouse verifier` plays its tests, green. The project declares what a project declares: its
// language (grillhouse.langages, which the core requires: grillhouse-3dr.2.3), the frame's
// package, Turborepo and Vitest, and the optional peers the scripts of the module typescript
// import, which `grillhouse maj` adds from the template (grillhouse-3dr.2.2); npm brings the rest,
// the package's dependencies.
// npm reads its cache first (`--prefer-offline`), the registry for what it lacks.

const PAQUET = path.resolve(__dirname, '../..');
const DEPOT = path.resolve(PAQUET, '../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'paquet-publie-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const gabarit = JSON.parse(
  readFileSync(path.join(DEPOT, 'templates/projet/package.json'), 'utf8')
) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
  packageManager: string;
};
// The environment of a person's command: no mark of the suite that runs this test.
const env = (): NodeJS.ProcessEnv => {
  const e = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !k.startsWith('VITEST') && !k.startsWith('GRILLHOUSE_') && k !== 'NODE_OPTIONS'
    )
  );
  return { ...e, TURBO_TELEMETRY_DISABLED: '1' };
};

describe('grillhouse-3uv.84.4 critère 5 — the packed package installs in a fresh project and works alone', () => {
  it('npm pack, npm install in a fresh project, then grillhouse verifier plays its tests, green', () => {
    const archives = path.join(ESSAIS, 'archives');
    mkdirSync(archives);
    execFileSync('npm', ['pack', '--pack-destination', archives, '--silent'], {
      cwd: PAQUET,
      env: env(),
      stdio: 'pipe',
    });
    const [archive] = readdirSync(archives).filter(f => f.endsWith('.tgz'));
    expect(archive, 'npm pack wrote an archive').toBeDefined();

    const projet = path.join(ESSAIS, 'projet');
    const ecrire = (f: string, texte: string) => {
      mkdirSync(path.dirname(path.join(projet, f)), { recursive: true });
      writeFileSync(path.join(projet, f), texte);
    };
    const scripts = Object.fromEntries(
      ['test', 'test:unit', 'verifier'].map(s => [s, gabarit.scripts[s] as string])
    );
    ecrire(
      'package.json',
      `${JSON.stringify(
        {
          name: 'essai',
          private: true,
          type: 'module',
          scripts,
          devDependencies: {
            '@roomi-fields/grillhouse': `file:${path.join(archives, archive as string)}`,
            turbo: gabarit.devDependencies.turbo,
            vitest: gabarit.devDependencies.vitest,
            ...Object.fromEntries(
              [
                '@microsoft/api-extractor',
                '@microsoft/api-extractor-model',
                '@microsoft/tsdoc-config',
                'jsonc-parser',
              ].map(d => [d, gabarit.devDependencies[d]])
            ),
          },
          packageManager: gabarit.packageManager,
          grillhouse: LANGAGE,
        },
        null,
        2
      )}\n`
    );
    ecrire(
      'turbo.json',
      readFileSync(path.join(DEPOT, 'templates/turbo/sans-paquets.json'), 'utf8')
    );
    ecrire('.gitignore', 'node_modules/\n.turbo/\n');
    ecrire(
      'vitest.config.mjs',
      "import { defineConfig, mergeConfig } from 'vitest/config';\nimport base from '@roomi-fields/grillhouse/vitest-config';\nexport default mergeConfig(base, defineConfig({ test: { include: ['tests/**/*.spec.mjs'] } }));\n"
    );
    ecrire(
      'tests/un.spec.mjs',
      "import { expect, it } from 'vitest';\nit('passe', () => expect(1 + 1).toBe(2));\n"
    );
    const installation = spawnSync(
      'npm',
      ['install', '--prefer-offline', '--no-audit', '--no-fund'],
      { cwd: projet, encoding: 'utf8', env: env(), timeout: 600_000 }
    );
    expect(installation.status, installation.stderr).toBe(0);
    for (const a of [
      ['init', '-q', '-b', 'main'],
      ['add', '-A'],
      [
        '-c',
        'user.name=Essai',
        '-c',
        'user.email=essai@example.invalid',
        'commit',
        '-q',
        '--no-verify',
        '-m',
        'essai',
      ],
    ]) {
      execFileSync('git', ['-C', projet, ...a], { env: env() });
    }
    const r = spawnSync(path.join(projet, 'node_modules/.bin/grillhouse'), ['verifier'], {
      cwd: projet,
      encoding: 'utf8',
      env: env(),
      timeout: 600_000,
    });
    const sortie = stripVTControlCharacters(`${r.stdout}\n${r.stderr}`);
    expect(r.status, sortie).toBe(0);
    expect(sortie).toMatch(/1 passed/);
  }, 900_000);
});
