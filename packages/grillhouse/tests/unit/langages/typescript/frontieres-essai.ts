import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// The trial harness of the boundaries between components (scripts/langages/typescript/frontieres.mjs,
// dependency-cruiser), shared by their tests (tests/unit/frontieres*.spec.ts).

export const SCRIPT = path.resolve(
  __dirname,
  '../../../../scripts/langages/typescript/frontieres.mjs'
);
const MODULES = path.resolve(__dirname, '../../../../../../node_modules');
// The configuration dependency-cruiser loads in <dir>: the generated file, required afresh.
export interface Chargee {
  forbidden: unknown[];
  options: Record<string, unknown> & { exclude: { path: string } };
}
export const charge = (dir: string) =>
  createRequire(import.meta.url)(path.join(dir, '.dependency-cruiser.cjs')) as Chargee;

// grillhouse-3uv.77: the published code imports no development dependency, types and exported test
// material included. The published code is every file reached from the entries of the `exports`
// field of a package (its main entry and `./test-fixtures` included); the frame's rule
// `pas-d-outil-de-developpement-dans-le-code` is the one that refuses it. The reference is the
// rule of npm: what a package publishes depends only on its dependencies.
//
// A workspace: `packages/p`, whose dependencies are `dotenv` and whose development dependencies
// are `vitest` and its sibling `b` (the BPScript witness: a corpus importing the types of the
// packages it declares in devDependencies). Each package is linked in node_modules by its name.
export const REGLE = 'pas-d-outil-de-developpement-dans-le-code';
// The package.json of `p` with the given `exports` field.
export const paquet = (exports: unknown) =>
  JSON.stringify({
    name: 'p',
    exports,
    dependencies: { dotenv: '*' },
    devDependencies: { vitest: '*', b: '*' },
  });
export const EXPORTS = { '.': './src/index.ts', './test-fixtures': './test-fixtures/index.ts' };
// The rules named by the errors of an output.
export const erreurs = (sortie: string) => [
  ...new Set([...sortie.matchAll(/^\s*error ([^:\s]+):/gm)].map(m => m[1])),
];
// A refusal of the rule: the file, then the development dependency it reaches.
export const refus = (fichier: string, dependance: string) =>
  new RegExp(`${REGLE}: ${fichier.replace(/[.]/g, '\\.')} → node_modules/${dependance}/`);

// The repositories of trial of one test file, under <ESSAIS>, and what reads their
// configuration and their verdict.
export function frontieresEssai(ESSAIS: string) {
  // A repository with the given files, the template's dependencies, and its generated configuration.
  function repo(files: Record<string, string>) {
    const dir = mkdtempSync(path.join(ESSAIS, 'frontieres-'));
    for (const [rel, text] of Object.entries({ 'package.json': '{"name":"r"}', ...files })) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), text);
    }
    symlinkSync(MODULES, path.join(dir, 'node_modules'));
    const run = (...args: string[]) =>
      spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
    run('--ecrire');
    return { dir, run };
  }
  const verdict = (files: Record<string, string>) => {
    const r = repo(files).run();
    return { status: r.status, sortie: r.stdout + r.stderr };
  };
  function espace(files: Record<string, string>) {
    const dir = mkdtempSync(path.join(ESSAIS, 'espace-'));
    const tout: Record<string, string> = {
      'package.json': '{"name":"r"}',
      'packages/b/package.json': '{"name":"b","exports":{".":"./src/index.ts"}}',
      'packages/b/src/index.ts': 'export type B = number;\nexport const b = 1;',
      ...files,
    };
    for (const [rel, text] of Object.entries(tout)) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), text);
    }
    mkdirSync(path.join(dir, 'node_modules'));
    for (const nom of readdirSync(MODULES)) {
      symlinkSync(path.join(MODULES, nom), path.join(dir, 'node_modules', nom));
    }
    for (const nom of ['p', 'b']) {
      symlinkSync(path.join(dir, 'packages', nom), path.join(dir, 'node_modules', nom));
    }
    const run = (...args: string[]) =>
      spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
    run('--ecrire');
    const r = run();
    return { dir, status: r.status, sortie: r.stdout + r.stderr };
  }
  return { repo, verdict, espace };
}
