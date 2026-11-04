// grillhouse-44b.5, critères 1, 8 et 9 — `npm run verifier` (scripts/langages/typescript/verifier.mjs)
// joue, dans un projet à plusieurs langages, les tâches de tous les langages du graphe, par un seul
// `turbo run` : le crate (déclaré cargo dans docs/ARCHITECTURE.md) a sa tâche `test:unit` comme un
// paquet TypeScript, relue du cache quand aucune entrée n'a bougé, rejouée par `--force` ; le dernier
// vert est posé une fois, quand toutes les tâches de tous les langages sont vertes, jamais quand
// l'une est rouge. Le vrai Turborepo et le vrai Vitest, dans un dépôt d'essai (git) d'un paquet
// TypeScript `a` et d'un crate `c` dont le script de test écrit son nom dans une trace. Un grand
// test (il monte un dépôt d'essai et y lance le produit) : un test de nuit.
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const DEPOT = path.resolve(__dirname, '../../../../../..');
const SCRIPT = path.join(DEPOT, 'packages/grillhouse/scripts/langages/typescript/verifier.mjs');
const BASE = path.join(
  DEPOT,
  'packages/grillhouse/scripts/langages/typescript/vitest-config/base.mjs'
);
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verifier-langages-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

// Un dépôt d'un paquet TypeScript `a` (un test vert) et d'un crate `c` dont `test:unit` rend
// <codeDuCrate> après avoir écrit `c` dans la trace.
function depot(codeDuCrate: number) {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(r, 'node_modules'), 'dir');
  const ecrire = (f: string, t: string) => {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  };
  const trace = JSON.stringify(path.join(r, 'joues.txt'));
  ecrire(
    'package.json',
    json({
      name: 'essai',
      private: true,
      workspaces: ['packages/*', 'crates/*'],
      packageManager: 'npm@10.9.8',
    })
  );
  // La variable des tests entre au hash de `test:unit`, comme le générateur l'écrit : sans elle,
  // `--tout` ne peut pas rejouer la tâche.
  ecrire(
    'turbo.json',
    json({
      $schema: 'https://turborepo.com/schema.json',
      tasks: {
        build: { outputs: [] },
        'grillhouse:gardes': { dependsOn: ['build'], outputs: [] },
        gardes: { dependsOn: ['build'], outputs: [] },
        'test:unit': { dependsOn: ['build'], outputs: [], env: ['GRILLHOUSE_TESTS'] },
        typecheck: { dependsOn: ['build', '^build'], outputs: [] },
      },
    })
  );
  ecrire(
    'docs/ARCHITECTURE.md',
    `# Architecture\n\n| Composant | Dépôt | Responsabilité | Langage |\n|---|---|---|---|\n| \`packages/a\` | P | a | typescript |\n| \`crates/c\` | P | c | cargo |\n`
  );
  ecrire('Cargo.toml', '[workspace]\nmembers = ["crates/c"]\n');
  ecrire('Cargo.lock', 'version = 4\n');
  ecrire('crates/c/Cargo.toml', '[package]\nname = "c"\nversion = "0.1.0"\n');
  ecrire('crates/c/src/lib.rs', 'pub fn un() {}\n');
  ecrire(
    'crates/c/jouer.cjs',
    `require('node:fs').appendFileSync(${trace}, 'c\\n');\nprocess.exit(${codeDuCrate});\n`
  );
  ecrire(
    'crates/c/package.json',
    json({ name: 'c', private: true, scripts: { 'test:unit': 'node jouer.cjs' } })
  );
  ecrire(
    'packages/a/package.json',
    json({ name: 'a', type: 'module', scripts: { 'test:unit': 'vitest run' } })
  );
  ecrire(
    'packages/a/vitest.config.mjs',
    `import base from ${JSON.stringify(BASE)};\nexport default base;\n`
  );
  ecrire(
    'packages/a/test/x.test.mjs',
    `import { appendFileSync } from 'node:fs';\nimport { it } from 'vitest';\nit('a', () => { appendFileSync(${trace}, 'a\\n'); });\n`
  );
  ecrire('.gitignore', 'node_modules\n.turbo/\njoues.txt\n');
  const git = (...args: string[]) => spawnSync('git', ['-C', r, ...args], { encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  const env: NodeJS.ProcessEnv = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
    ),
    PATH: `${path.join(DEPOT, 'node_modules/.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
    TURBO_TELEMETRY_DISABLED: '1',
    DO_NOT_TRACK: '1',
  };
  const joues = () =>
    existsSync(path.join(r, 'joues.txt'))
      ? readFileSync(path.join(r, 'joues.txt'), 'utf8').split('\n').filter(Boolean)
      : [];
  const vert = () => path.join(r, '.git/grillhouse/dernier-vert/main.json');
  return { racine: r, env, joues, vert, tete: () => git('rev-parse', 'HEAD').stdout.trim() };
}

function lancer(
  d: ReturnType<typeof depot>,
  args: string[] = []
): Promise<{ status: number | null; sortie: string }> {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [SCRIPT, ...args], { cwd: d.racine, env: d.env });
    let sortie = '';
    const lire = (b: Buffer) => {
      sortie += b.toString();
    };
    p.stdout.on('data', lire);
    p.stderr.on('data', lire);
    p.on('close', status => resolve({ status, sortie }));
  });
}

describe(
  'grillhouse-44b.5 — npm run verifier, dans un projet à plusieurs langages',
  { timeout: 180_000 },
  () => {
    it('critère 1: la tâche de test du crate est jouée avec celle du paquet TypeScript', async () => {
      const d = depot(0);
      const r = await lancer(d);
      expect(r.status, r.sortie).toBe(0);
      expect(d.joues().sort()).toEqual(['a', 'c']);
    });

    it('critère 9: toutes les tâches de tous les langages vertes, le vert est posé, une fois, pour HEAD', async () => {
      const d = depot(0);
      expect((await lancer(d)).status).toBe(0);
      expect(d.joues().sort()).toEqual(['a', 'c']);
      expect(existsSync(d.vert())).toBe(true);
      expect((JSON.parse(readFileSync(d.vert(), 'utf8')) as { commit: string }).commit).toBe(
        d.tete()
      );
    });

    it('critère 9: la tâche du crate rouge rend la passe rouge, nommée, et aucun vert n’est posé', async () => {
      const d = depot(1);
      const r = await lancer(d);
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('⛔ c#test:unit');
      expect(d.joues().sort()).toEqual(['a', 'c']);
      expect(existsSync(d.vert())).toBe(false);
    });

    it('critère 1: la passe suivante relit du cache la tâche du crate dont aucune entrée n’a bougé', async () => {
      const d = depot(0);
      expect((await lancer(d)).status).toBe(0);
      expect((await lancer(d)).status).toBe(0);
      expect(d.joues().filter(x => x === 'c')).toHaveLength(1);
    });

    it('critère 8: --force et --tout rejouent la tâche du crate pour de vrai', async () => {
      const d = depot(0);
      expect((await lancer(d)).status).toBe(0);
      expect((await lancer(d, ['--force'])).status).toBe(0);
      expect(d.joues().filter(x => x === 'c')).toHaveLength(2);
      expect((await lancer(d, ['--tout'])).status).toBe(0);
      expect(d.joues().filter(x => x === 'c')).toHaveLength(3);
    });
  }
);
