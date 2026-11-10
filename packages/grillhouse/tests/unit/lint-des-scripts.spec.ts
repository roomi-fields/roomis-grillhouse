// The guard `lint-des-scripts`, proper to the grillhouse package (scripts/lint-des-scripts.mjs):
// it runs ESLint on `packages/grillhouse/scripts` of the working directory and counts each error
// per file and rule against the debt of `grillhouse-dette.json` (`trancher`, scripts/dette.mjs).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const GARDE_SCRIPT = path.resolve(__dirname, '../../scripts/lint-des-scripts.mjs');
const PAQUET_JSON = path.resolve(__dirname, '../../package.json');
const GARDES_TS = path.resolve(__dirname, '../../scripts/langages/typescript/index.mjs');

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'lint-des-scripts-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const CONFIG = `module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  rules: { curly: ['error', 'all'], 'no-unused-vars': 'error' },
};
`;
// One `curly` error, then two, and one `no-unused-vars` error.
const UN_CURLY = 'export const f = x => {\n  if (x) return 1;\n  return 0;\n};\n';
const DEUX_CURLY =
  'export const f = x => {\n  if (x) return 1;\n  if (!x) return 2;\n  return 0;\n};\n';
const UN_INUTILE = 'const inutile = 1;\nexport const g = 2;\n';
const PROPRE = 'export const h = 3;\n';

// A project of trial with the scripts <scripts> (name → text) under packages/grillhouse/scripts,
// and the debt <dette> ({} for none) written when given.
function projet(scripts: Record<string, string>, dette?: object) {
  const r = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(r, '.eslintrc.cjs'), CONFIG);
  const dossier = path.join(r, 'packages/grillhouse/scripts');
  mkdirSync(dossier, { recursive: true });
  for (const [nom, texte] of Object.entries(scripts)) {
    writeFileSync(path.join(dossier, nom), texte);
  }
  if (dette) {
    writeFileSync(path.join(r, 'grillhouse-dette.json'), JSON.stringify(dette));
  }
  return r;
}
const inscrit = (fichier: string, regles: Record<string, number>) => ({
  'lint-des-scripts': {
    [`packages/grillhouse/scripts/${fichier}`]: Object.fromEntries(
      Object.entries(regles).map(([r, count]) => [r, { count }])
    ),
  },
});
const jouer = (racine: string) =>
  spawnSync('node', [GARDE_SCRIPT], { cwd: racine, encoding: 'utf8', timeout: 120_000 });
const sortie = (r: { stdout: string; stderr: string }) => `${r.stdout}\n${r.stderr}`;

describe('the guard of the lint of the scripts counts each ESLint error against the debt', () => {
  it('refuses a file whose errors of a rule exceed the inscribed count, naming file, rule and count', () => {
    const r = jouer(projet({ 'a.mjs': DEUX_CURLY }, inscrit('a.mjs', { curly: 1 })));
    expect(r.status).not.toBe(0);
    const texte = sortie(r);
    expect(texte).toContain('packages/grillhouse/scripts/a.mjs');
    expect(texte).toContain('curly');
    expect(texte).toMatch(/2[^\n]*1 inscrit/);
  });

  it('refuses a file with an error of a rule that has no inscription', () => {
    const r = jouer(projet({ 'a.mjs': UN_INUTILE }, inscrit('a.mjs', { curly: 3 })));
    expect(r.status).not.toBe(0);
    expect(sortie(r)).toContain('no-unused-vars');
  });

  it('refuses an error in a file absent from the debt, without any debt file', () => {
    const r = jouer(projet({ 'a.mjs': PROPRE, 'b.mjs': UN_CURLY }));
    expect(r.status).not.toBe(0);
    expect(sortie(r)).toContain('packages/grillhouse/scripts/b.mjs');
    expect(sortie(r)).not.toContain('scripts/a.mjs');
  });

  it('passes when every count is at most the inscribed one', () => {
    const dette = { 'lint-des-scripts': { ...inscrit('a.mjs', { curly: 2 })['lint-des-scripts'] } };
    const r = jouer(projet({ 'a.mjs': DEUX_CURLY, 'b.mjs': PROPRE }, dette));
    expect(r.status).toBe(0);
  });

  it('passes on scripts without any error and without debt', () => {
    expect(jouer(projet({ 'a.mjs': PROPRE })).status).toBe(0);
  });

  it('reports without refusing an inscription above what it finds', () => {
    const r = jouer(projet({ 'a.mjs': UN_CURLY }, inscrit('a.mjs', { curly: 4 })));
    expect(r.status).toBe(0);
    const texte = sortie(r);
    expect(texte).toContain('curly');
    expect(texte).toMatch(/1[^\n]*4 inscrit/);
  });

  it('counts the errors of a file whose rules differ separately', () => {
    const texte = `${UN_CURLY}const inutile = 1;\n`;
    const ok = jouer(
      projet({ 'a.mjs': texte }, inscrit('a.mjs', { curly: 1, 'no-unused-vars': 1 }))
    );
    expect(ok.status).toBe(0);
    const ko = jouer(projet({ 'a.mjs': texte }, inscrit('a.mjs', { curly: 5 })));
    expect(ko.status).not.toBe(0);
  });
});

describe('the lint of the package covers the scripts like src and tests', () => {
  const pkg = JSON.parse(readFileSync(PAQUET_JSON, 'utf8')) as { scripts: Record<string, string> };

  it('plays ESLint on src and tests, then the guard on the scripts, in the script lint', () => {
    const lint = pkg.scripts.lint;
    expect(lint).toMatch(/eslint src tests/);
    expect(lint).toContain('scripts/lint-des-scripts.mjs');
    expect(lint.indexOf('eslint src tests')).toBeLessThan(lint.indexOf('lint-des-scripts.mjs'));
    expect(lint).toMatch(/&&/);
  });

  it('is not delivered to the projects by the list of guards of the TypeScript module', () => {
    expect(readFileSync(GARDES_TS, 'utf8')).not.toContain('lint-des-scripts');
  });
});
