// grillhouse-nt4 (grillhouse-1js merged in it): the tests of a project leave nothing in the
// temporary directory. A pass of tests plays under a temporary directory of its own (TMPDIR, TMP,
// TEMP), removed at its end, green, red or interrupted, and fails naming what its tests left there,
// as pytest's `tmp_path` and the CI of osc-bridge (OB-ud1.3, 7e1be39) do; a directory of a pass
// that nothing holds anymore goes at the next pass. Witness (grillhouse-1js, 2026-10-24): `df -i
// /tmp` at 1 044 633 inodes of 1 048 576, 2 888 entries over 2 h old left by trials.
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
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

const DEPOT = path.resolve(__dirname, '../../../../../..');
const SCRIPTS = path.join(DEPOT, 'packages/grillhouse/scripts');
const BASE = path.join(SCRIPTS, 'langages/typescript/vitest-config/base.mjs');
const TESTS = path.join(SCRIPTS, 'langages/typescript/tests.mjs');
const MODULE = path.join(SCRIPTS, 'mesure/base-de-passe.mjs');
const VITEST = path.join(DEPOT, 'node_modules/vitest/vitest.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dossier-temporaire-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const LONG = 60_000;

// The environment of a process the test plays: this one's, without what Vitest set for itself.
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS' && !k.startsWith('GRILLHOUSE_')
  )
);

// A temporary directory of trial, the one a run is launched with, and a probe beside it.
function essai() {
  const racine = mkdtempSync(path.join(ESSAIS, 'essai-'));
  const dans = path.join(racine, 'tmp');
  mkdirSync(dans);
  return { racine, dans, sonde: path.join(racine, 'sonde.json') };
}

// A trial project of the base configuration whose one test file is <test>.
function projet(racine: string, test: string): string {
  const r = path.join(racine, 'projet');
  mkdirSync(r);
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(r, 'node_modules'), 'dir');
  writeFileSync(
    path.join(r, 'package.json'),
    '{ "name": "essai", "private": true, "type": "module" }\n'
  );
  writeFileSync(
    path.join(r, 'vitest.config.mjs'),
    `import { mergeConfig } from 'vitest/config';\nimport base from ${JSON.stringify(BASE)};\nexport default mergeConfig(base, { test: { include: ['*.test.mjs'], pool: 'forks' } });\n`
  );
  writeFileSync(path.join(r, 'essai.test.mjs'), test);
  return r;
}

// The test of a trial: it writes its temporary directories to SONDE, then does <corps>, which
// reaches its temporary directory by TMPDIR, the variable Node reads it from.
const test = (corps: string) =>
  [
    "import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';",
    "import path from 'node:path';",
    "import { afterAll, it } from 'vitest';",
    'const { TMPDIR, TMP, TEMP } = process.env;',
    'writeFileSync(process.env.SONDE, JSON.stringify({ TMPDIR, TMP, TEMP }));',
    corps,
    '',
  ].join('\n');

// A base of the genre `vitest` in <dans> whose pass was killed (SIGKILL): its path.
function baseTuee(dans: string): string {
  const r = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { ouvrirBase } from ${JSON.stringify(MODULE)};\nouvrirBase('vitest', { dans: ${JSON.stringify(dans)} });\nprocess.kill(process.pid, 'SIGKILL');`,
    ],
    { encoding: 'utf8' }
  );
  expect(r.signal, r.stderr).toBe('SIGKILL');
  const [base] = readdirSync(dans);
  return path.join(dans, base ?? '');
}

const motif = (dans: string, genre: string) =>
  new RegExp(`^${dans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/grillhouse-${genre}-[^/]+/t$`);

// Waits for <fichier>, then sends SIGINT to the group of <p>, as Ctrl-C in a terminal does, and
// waits for <p> to end.
async function interrompre(p: ReturnType<typeof spawn>, fichier: string) {
  const fin = new Promise(ok => p.on('close', ok));
  for (let i = 0; i < 600 && !existsSync(fichier); i++) {
    await new Promise(ok => setTimeout(ok, 50));
  }
  expect(existsSync(fichier)).toBe(true);
  process.kill(-(p.pid ?? 0), 'SIGINT');
  await fin;
}

describe('grillhouse-nt4, critère 1 — la règle dans la charte commune', () => {
  it('the common charter carries the rule, without the name of a tool of one language', () => {
    const charte = readFileSync(path.join(DEPOT, 'mods/grillhouse/charte.md'), 'utf8');
    const regle = charte
      .split('\n- ')
      .find(l => l.startsWith('**Les tests ne laissent rien dans le dossier temporaire**'));
    expect(regle).toBeDefined();
    expect(regle).toMatch(/l'outil de son langage/);
    expect(regle).toMatch(/échoue en nommant/);
    expect(regle).not.toMatch(/tempfile|mkdtemp|vitest|pytest|nextest|cargo|tmp_path/i);
  });
});

describe('grillhouse-nt4, critères 2 et 3 — un lancement de Vitest sous le dossier temporaire de sa passe', () => {
  it(
    'a red test whose temporary directory goes in afterAll leaves nothing, no leftover named; TMPDIR, TMP and TEMP name the directory of the pass; a directory of a pass nothing holds anymore goes (1js b)',
    () => {
      const { racine, dans, sonde } = essai();
      const orpheline = baseTuee(dans);
      const r = spawnSync(process.execPath, [VITEST, 'run'], {
        cwd: projet(
          racine,
          test(
            [
              "const d = mkdtempSync(path.join(process.env.TMPDIR, 'essai-'));",
              'afterAll(() => rmSync(d, { recursive: true, force: true }));',
              "it('rouge', () => {",
              "  writeFileSync(path.join(d, 'f'), 'x');",
              "  throw new Error('rouge du jouet');",
              '});',
            ].join('\n')
          )
        ),
        env: { ...ENV, TMPDIR: dans, SONDE: sonde },
        encoding: 'utf8',
      });
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stdout + r.stderr).toContain('rouge du jouet');
      expect(r.stderr).not.toMatch(/dossier temporaire/);
      const t = JSON.parse(readFileSync(sonde, 'utf8')) as Record<string, string>;
      expect(t.TMPDIR).toMatch(motif(dans, 'vitest'));
      expect(t.TMP).toBe(t.TMPDIR);
      expect(t.TEMP).toBe(t.TMPDIR);
      expect(existsSync(orpheline)).toBe(false);
      expect(readdirSync(dans)).toEqual([]);
    },
    LONG
  );

  it(
    'a green test that leaves a directory in its temporary directory fails the run, the directory named, and nothing stays',
    () => {
      const { racine, dans, sonde } = essai();
      const r = spawnSync(process.execPath, [VITEST, 'run'], {
        cwd: projet(
          racine,
          test("it('vert', () => mkdtempSync(path.join(process.env.TMPDIR, 'oublie-du-test-')));")
        ),
        env: { ...ENV, TMPDIR: dans, SONDE: sonde },
        encoding: 'utf8',
      });
      expect(r.status, r.stdout + r.stderr).toBe(1);
      expect(r.stderr).toMatch(/dossier temporaire : oublie-du-test-\w+\./);
      expect(readdirSync(dans)).toEqual([]);
    },
    LONG
  );

  it(
    'a green test that leaves nothing: the run is green, no leftover named',
    () => {
      const { racine, dans, sonde } = essai();
      const r = spawnSync(process.execPath, [VITEST, 'run'], {
        cwd: projet(racine, test("it('vert', () => {});")),
        env: { ...ENV, TMPDIR: dans, SONDE: sonde },
        encoding: 'utf8',
      });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stderr).not.toMatch(/dossier temporaire/);
      expect(readdirSync(dans)).toEqual([]);
    },
    LONG
  );

  it(
    'a test that launches npm and leaves nothing itself is green: the compile cache npm writes there is a cache of a tool, tolerated by name',
    () => {
      const { racine, dans, sonde } = essai();
      const r = spawnSync(process.execPath, [VITEST, 'run'], {
        cwd: projet(
          racine,
          test(
            [
              "import { execFileSync } from 'node:child_process';",
              "import { readdirSync } from 'node:fs';",
              "it('npm', () => {",
              "  execFileSync('npm', ['--version']);",
              // The directory of the run, by TEMP, which names it as TMPDIR does.
              "  if (!readdirSync(process.env.TEMP).includes('node-compile-cache')) throw new Error('pas de cache de npm');",
              '});',
            ].join('\n')
          )
        ),
        env: { ...ENV, TMPDIR: dans, SONDE: sonde },
        encoding: 'utf8',
      });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stderr).not.toMatch(/dossier temporaire/);
      expect(readdirSync(dans)).toEqual([]);
    },
    LONG
  );

  it(
    '1js c: a run interrupted (SIGINT) leaves nothing at the root of the temporary directory',
    async () => {
      const { racine, dans, sonde } = essai();
      const p = spawn(process.execPath, [VITEST, 'run'], {
        cwd: projet(
          racine,
          test(
            [
              "mkdtempSync(path.join(process.env.TMPDIR, 'trace-'));",
              "it('long', () => new Promise(fin => setTimeout(fin, 20_000)), 30_000);",
            ].join('\n')
          )
        ),
        env: { ...ENV, TMPDIR: dans, SONDE: sonde },
        detached: true,
        stdio: 'ignore',
      });
      await interrompre(p, sonde);
      expect(readdirSync(dans)).toEqual([]);
    },
    LONG
  );
});

describe('grillhouse-nt4, 1js a et c — npm test sous le dossier temporaire de sa passe', () => {
  it(
    'npm test interrupted (SIGINT) while Turborepo plays: its directory, which Turborepo receives in TMPDIR, TMP and TEMP, goes',
    async () => {
      const { racine, dans, sonde } = essai();
      const depot = path.join(racine, 'depot');
      mkdirSync(depot);
      writeFileSync(path.join(depot, 'package.json'), '{ "name": "essai", "private": true }\n');
      // A Turborepo that writes its temporary directories, leaves a trial directory there, and
      // plays long.
      const bin = path.join(racine, 'bin');
      mkdirSync(bin);
      writeFileSync(
        path.join(bin, 'turbo'),
        `#!/bin/sh\nmkdir "$TMPDIR/trace-turbo"\nprintf '{"TMPDIR":"%s","TMP":"%s","TEMP":"%s"}' "$TMPDIR" "$TMP" "$TEMP" > ${JSON.stringify(`${sonde}.part`)}\nmv ${JSON.stringify(`${sonde}.part`)} ${JSON.stringify(sonde)}\nexec sleep 20\n`
      );
      chmodSync(path.join(bin, 'turbo'), 0o755);
      const p = spawn(process.execPath, [TESTS], {
        cwd: depot,
        env: { ...ENV, TMPDIR: dans, PATH: `${bin}${path.delimiter}${ENV.PATH ?? ''}` },
        detached: true,
        stdio: 'ignore',
      });
      await interrompre(p, sonde);
      const t = JSON.parse(readFileSync(sonde, 'utf8')) as Record<string, string>;
      expect(t.TMPDIR).toMatch(motif(dans, 'tests'));
      expect(t.TMP).toBe(t.TMPDIR);
      expect(t.TEMP).toBe(t.TMPDIR);
      expect(readdirSync(dans)).toEqual([]);
    },
    LONG
  );
});
