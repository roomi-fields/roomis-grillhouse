// The night plays each of its files under the Vitest configuration of its own package, as the day
// does (`npm test` plays each file in its package). Medium test: a project of trial with several
// packages, played by `testsDeNuit` of scripts/langages/typescript/tests-de-nuit.mjs (the module's
// own function, which starts Vitest), without the whole product.
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
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as nuitMjs from '../../../../scripts/langages/typescript/tests-de-nuit.mjs';

const nuit = nuitMjs as unknown as {
  testsDeNuit: (
    racine: string,
    options?: { horsDuPoste?: boolean; tranche?: { index: number; count: number } }
  ) => number;
};

const DEPOT = path.resolve(fileURLToPath(import.meta.url), '../../../../../../..');
const MESURE = path.join(
  DEPOT,
  'packages/grillhouse/scripts/langages/typescript/vitest-config/mesure.mjs'
);

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'nuit-config-paquet-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Ligne = {
  nom: string;
  marque: string | null;
  prepare: string | null;
  alias?: string;
  debut?: number;
  fin?: number;
};

// A project of trial: its root, its trace, a link to the repository's node_modules, the files
// <fichiers> written under the root (the paths from the root).
function projet(fichiers: Record<string, string>) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  const trace = path.join(racine, 'trace.jsonl');
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(racine, 'node_modules'));
  const tous: Record<string, string> = { 'package.json': '{"type":"module"}\n', ...fichiers };
  for (const [f, contenu] of Object.entries(tous)) {
    mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
    writeFileSync(path.join(racine, f), contenu.replaceAll('%TRACE%', JSON.stringify(trace)));
  }
  return { racine, trace };
}

// A test file that records what its run holds: the marker of the environment, the flag of the
// setup file, and, with <alias>, the value of the alias the package declares; a witness when
// <temoin>, a red test when <rouge>.
const essai = (nom: string, { alias = false, temoin = false, rouge = false } = {}) =>
  "import { appendFileSync } from 'node:fs';\nimport { it } from 'vitest';\n" +
  (temoin ? `import { mesurerAuRepos } from ${JSON.stringify(MESURE)};\n` : '') +
  (alias ? "import valeur from 'marque-alias';\n" : '') +
  `it('${nom}', ${temoin ? 'ctx => mesurerAuRepos(ctx, () => {' : '() => {'}\n` +
  `  appendFileSync(%TRACE%, JSON.stringify({ nom: '${nom}', marque: process.env.MARQUE ?? null, ` +
  `prepare: globalThis.__PREPARE ?? null${alias ? ', alias: valeur' : ''} }) + '\\n');\n` +
  (rouge ? "  throw new Error('rouge');\n" : '') +
  `}${temoin ? ')' : ''});\n`;

// A test file that records its start and its end around a wait of 250 ms.
const lent = (nom: string) =>
  "import { appendFileSync } from 'node:fs';\nimport { it } from 'vitest';\n" +
  `it('${nom}', async () => {\n  const debut = Date.now();\n` +
  '  await new Promise(r => setTimeout(r, 250));\n' +
  `  appendFileSync(%TRACE%, JSON.stringify({ nom: '${nom}', marque: null, prepare: null, ` +
  "debut, fin: Date.now() }) + '\\n');\n});\n";

const lignes = (trace: string): Ligne[] =>
  existsSync(trace)
    ? readFileSync(trace, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(l => JSON.parse(l) as Ligne)
    : [];
const de = (trace: string, nom: string) => lignes(trace).find(l => l.nom === nom);

// A configuration of package that sets a marker in the environment, a setup file, an alias, and an
// include that names no night file.
const configurationDe = (marque: string, extra = '') =>
  `export default { test: { env: { MARQUE: '${marque}' }, setupFiles: ['./preparation.mjs'], ` +
  `include: ['**/rien.test.mjs']${extra} }, resolve: { alias: { 'marque-alias': ` +
  `new URL('./alias.mjs', import.meta.url).pathname } } };\n`;
const paquetConfigure = (dossier: string, marque: string, extra = ''): Record<string, string> => ({
  [`${dossier}/vitest.config.mjs`]: configurationDe(marque, extra),
  [`${dossier}/preparation.mjs`]: `globalThis.__PREPARE = '${marque}';\n`,
  [`${dossier}/alias.mjs`]: `export default 'alias-${marque}';\n`,
});

beforeEach(() => {
  const pression = path.join(mkdtempSync(path.join(ESSAIS, 'pression-')), 'cpu');
  writeFileSync(pression, 'some avg10=1.00 avg60=0.00 avg300=0.00 total=1\n');
  vi.stubEnv('GRILLHOUSE_PRESSION_CPU', pression);
});
afterEach(() => vi.unstubAllEnvs());

describe('la nuit joue un fichier sous la configuration de son paquet', () => {
  it('un test de nuit, un banc et un témoin jouent dans l’environnement du paquet, sa préparation exécutée et son alias résolu', () => {
    const { racine, trace } = projet({
      ...paquetConfigure('packages/a', 'a'),
      'packages/a/tests/n.nuit.test.mjs': essai('nuit', { alias: true }),
      'packages/a/tests/b.budget.test.mjs': essai('banc', { alias: true }),
      'packages/a/tests/t.test.mjs': essai('temoin', { alias: true, temoin: true }),
    });
    expect(nuit.testsDeNuit(racine)).toBe(0);
    for (const nom of ['nuit', 'banc', 'temoin']) {
      expect(de(trace, nom), nom).toMatchObject({ marque: 'a', prepare: 'a', alias: 'alias-a' });
    }
  }, 120_000);

  it('chaque fichier prend la configuration de son paquet, non celle d’un autre ni celle de la racine', () => {
    const { racine, trace } = projet({
      'vitest.config.mjs': "export default { test: { env: { MARQUE: 'racine' } } };\n",
      ...paquetConfigure('packages/a', 'a'),
      ...paquetConfigure('packages/b', 'b'),
      'packages/a/tests/n.nuit.test.mjs': essai('en-a'),
      'packages/b/tests/n.nuit.test.mjs': essai('en-b'),
      'packages/b/tests/t.test.mjs': essai('temoin-b', { temoin: true }),
    });
    expect(nuit.testsDeNuit(racine)).toBe(0);
    expect(de(trace, 'en-a')).toMatchObject({ marque: 'a', prepare: 'a' });
    expect(de(trace, 'en-b')).toMatchObject({ marque: 'b', prepare: 'b' });
    expect(de(trace, 'temoin-b')).toMatchObject({ marque: 'b', prepare: 'b' });
  }, 120_000);

  it('un paquet sans configuration joue sous celle du cadre seule, à côté d’un paquet configuré', () => {
    const { racine, trace } = projet({
      'vitest.config.mjs': "export default { test: { env: { MARQUE: 'racine' } } };\n",
      ...paquetConfigure('packages/a', 'a'),
      'packages/a/tests/n.nuit.test.mjs': essai('en-a'),
      'packages/nu/tests/n.nuit.test.mjs': essai('sans-configuration'),
      'packages/nu/tests/b.budget.test.mjs': essai('banc-sans-configuration'),
    });
    expect(nuit.testsDeNuit(racine)).toBe(0);
    expect(de(trace, 'en-a')).toMatchObject({ marque: 'a' });
    expect(de(trace, 'sans-configuration')).toMatchObject({ marque: null, prepare: null });
    expect(de(trace, 'banc-sans-configuration')).toMatchObject({ marque: null, prepare: null });
  }, 120_000);

  it('vitest.config l’emporte sur vite.config du même paquet, et vite.config sert à son défaut', () => {
    const { racine, trace } = projet({
      'packages/c/vitest.config.mjs': "export default { test: { env: { MARQUE: 'vitest' } } };\n",
      'packages/c/vite.config.mjs': "export default { test: { env: { MARQUE: 'vite' } } };\n",
      'packages/c/tests/n.nuit.test.mjs': essai('les-deux'),
      'packages/d/vite.config.mjs': "export default { test: { env: { MARQUE: 'vite' } } };\n",
      'packages/d/tests/n.nuit.test.mjs': essai('vite-seul'),
    });
    expect(nuit.testsDeNuit(racine)).toBe(0);
    expect(de(trace, 'les-deux')?.marque).toBe('vitest');
    expect(de(trace, 'vite-seul')?.marque).toBe('vite');
  }, 120_000);
});

describe('ce que la nuit pose l’emporte sur la configuration du paquet', () => {
  it('l’include du paquet n’écarte aucun fichier de nuit, et le paquet qui autorise le parallélisme joue quand même un fichier à la fois', () => {
    const { racine, trace } = projet({
      ...paquetConfigure('packages/a', 'a', ', fileParallelism: true'),
      'packages/a/tests/un.nuit.test.mjs': lent('un'),
      'packages/a/tests/deux.nuit.test.mjs': lent('deux'),
    });
    expect(nuit.testsDeNuit(racine)).toBe(0);
    const [premier, second] = lignes(trace).sort((x, y) => (x.debut ?? 0) - (y.debut ?? 0));
    expect(lignes(trace)).toHaveLength(2);
    expect(second.debut).toBeGreaterThanOrEqual(premier.fin ?? Infinity);
  }, 120_000);

  it('les fichiers de préparation du paquet s’ajoutent à ceux de la mesure du cadre, qui reste joué', () => {
    // The measure's setup notes the pressure at the start and the end of a test: a witness under
    // a package's own setup file still reads the pressure file the run names.
    const { racine, trace } = projet({
      ...paquetConfigure('packages/a', 'a'),
      'packages/a/tests/t.test.mjs': essai('temoin', { temoin: true }),
    });
    const pression = process.env.GRILLHOUSE_PRESSION_CPU ?? '';
    writeFileSync(pression, 'some avg10=100.00 avg60=0.00 avg300=0.00 total=1\n');
    // A red witness under load is « à repasser » (75) only when the measure's setup ran.
    writeFileSync(
      path.join(racine, 'packages/a/tests/t.test.mjs'),
      essai('temoin', { temoin: true, rouge: true }).replaceAll('%TRACE%', JSON.stringify(trace))
    );
    expect(nuit.testsDeNuit(racine)).toBe(75);
    expect(de(trace, 'temoin')).toMatchObject({ prepare: 'a' });
  }, 120_000);
});

describe('le compte rendu de la nuit garde sa forme', () => {
  it('un projet sans configuration de paquet joue et sort 0, un fichier rouge sort 1', () => {
    const vert = projet({ 'tests/n.nuit.test.mjs': essai('vert') });
    expect(nuit.testsDeNuit(vert.racine)).toBe(0);
    expect(de(vert.trace, 'vert')).toMatchObject({ marque: null, prepare: null });
    const rouge = projet({
      ...paquetConfigure('packages/a', 'a'),
      'packages/a/tests/n.nuit.test.mjs': essai('rouge', { rouge: true }),
    });
    expect(nuit.testsDeNuit(rouge.racine)).toBe(1);
    expect(de(rouge.trace, 'rouge')).toMatchObject({ marque: 'a', prepare: 'a' });
  }, 120_000);

  it('une tranche joue sous la configuration du paquet et écrit son rapport sous le dossier des rapports de la racine', () => {
    const { racine, trace } = projet({
      ...paquetConfigure('packages/a', 'a'),
      'packages/a/tests/n.nuit.test.mjs': essai('tranche'),
    });
    expect(nuit.testsDeNuit(racine, { horsDuPoste: true, tranche: { index: 1, count: 1 } })).toBe(
      0
    );
    expect(de(trace, 'tranche')).toMatchObject({ marque: 'a', prepare: 'a' });
    expect(existsSync(path.join(racine, '.vitest-reports'))).toBe(true);
  }, 120_000);
});
