import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { releve, texteDuReleve } from '../../scripts/composants-affectes.mjs';

// The survey of a ticket's components by the types and by the architecture (Romain, 2026-10-21:
// « l'agent analyste initial doit utiliser codegraph, le service de langage typescript et les
// documents d'architecture comme base de connaissance pour prendre ses décisions et cherche les
// références par les types et par l'architecture »). As « find all references » of rust-analyzer
// and of TypeScript's language service, an element of the ticket is resolved as a symbol, a member
// of a type or a function internal to a package included, and its references are found through
// the types, not through the text: an internal symbol leads to the published export that carries
// it, and that export's types to the packages that produce or receive them. The Reçoit and Rend
// of the CADRE.md of the packages that declare the elements follow a value through a package that
// carries it. Witness: BPScript 320.3, where the survey by the names found 040-checker and missed
// 020-loader, whose `sceneWritten` (internal) writes the object of the scene into the `Registry`
// that `load` returns, which 900-driver carries to 030-binder.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'composants-affectes-types-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPT = path.resolve(__dirname, '../../scripts/composants-affectes.mjs');

function depot(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(ESSAIS, 'depot-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

// A package published from its build, as BPScript's are: `exports` names `dist/`, which the
// survey reads back to its sources through `tsconfig.build.json`.
const paquet = (nom: string) =>
  JSON.stringify({
    name: nom,
    type: 'module',
    exports: { '.': { types: './dist/src/index.d.ts', default: './dist/src/index.js' } },
  });
const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    allowImportingTsExtensions: true,
    noEmit: true,
    strict: true,
    types: [],
  },
  include: ['src', 'test'],
});
const TSCONFIG_BUILD = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    rewriteRelativeImportExtensions: true,
    declaration: true,
    outDir: 'dist',
    rootDir: '.',
    types: [],
  },
  include: ['src'],
});
const ts = (nom: string, dossier: string) => ({
  [`packages/${dossier}/package.json`]: paquet(nom),
  [`packages/${dossier}/tsconfig.json`]: TSCONFIG,
  [`packages/${dossier}/tsconfig.build.json`]: TSCONFIG_BUILD,
});

// forms holds the types; loader builds the registry, its object of the scene written by an
// internal function; binder reads the registry; driver carries what loader returns to binder, and
// what binder returns to checker; alone receives a registry that nothing carries to it, and
// reads an `objects` of its own type.
const DEPOT = {
  'package.json': JSON.stringify({ name: 'essai', private: true, workspaces: ['packages/*'] }),
  ...ts('000-forms', 'forms'),
  'packages/forms/src/index.ts': [
    'export type RegistryObject = { readonly address: string; readonly origin: number };',
    'export type Registry = { readonly objects: Record<string, RegistryObject> };',
    'export type LoadResult = { readonly registry: Registry; readonly faults: string[] };',
    'export type Bound = { readonly performers: string[] };',
    '',
  ].join('\n'),
  ...ts('020-loader', 'loader'),
  'packages/loader/src/index.ts': "export { load } from './assemble.ts';\n",
  'packages/loader/src/assemble.ts': [
    "import type { LoadResult, RegistryObject } from '000-forms';",
    '',
    'function sceneWritten(origin: number): RegistryObject[] {',
    "  return [{ address: 'scene', origin }];",
    '}',
    '',
    'export function load(origin: number): LoadResult {',
    '  const objects = Object.fromEntries(sceneWritten(origin).map(o => [o.address, o]));',
    '  return { registry: { objects }, faults: [] };',
    '}',
    '',
  ].join('\n'),
  ...ts('030-binder', 'binder'),
  'packages/binder/src/index.ts': "export { bind } from './outer.ts';\n",
  'packages/binder/src/outer.ts': [
    "import type { Bound, Registry } from '000-forms';",
    '',
    'function castOf(registry: Registry): string[] {',
    '  return Object.keys(registry.objects);',
    '}',
    '',
    'export function bind(registry: Registry): Bound {',
    '  return { performers: castOf(registry) };',
    '}',
    '',
  ].join('\n'),
  'packages/binder/docs/CADRE.md': [
    '# Cadre de 030-binder',
    '',
    '## 3. Reçoit',
    '',
    '- **R3.** De `900-driver`, le registre de `020-loader`.',
    '',
    '## 4. Rend',
    '',
    '- **R4.** Les objets liés, que `040-checker` reçoit.',
    '',
    '## 5. Connaît',
    '',
    '- **R5.** Les noms, que `050-alone` écrit aussi.',
    '',
  ].join('\n'),
  ...ts('040-checker', 'checker'),
  'packages/checker/src/index.ts': [
    "import type { Bound } from '000-forms';",
    '',
    'export function check(bound: Bound): number {',
    '  return bound.performers.length;',
    '}',
    '',
  ].join('\n'),
  ...ts('050-alone', 'alone'),
  'packages/alone/src/index.ts': [
    "import type { Registry } from '000-forms';",
    '',
    'type Own = { readonly objects: Record<string, number> };',
    'export function count(own: Own, registry: Registry): number {',
    '  return Object.keys(own.objects).length + Object.keys(registry).length;',
    '}',
    '',
  ].join('\n'),
  ...ts('900-driver', 'driver'),
  'packages/driver/src/index.ts': [
    "import { load } from '020-loader';",
    "import { bind } from '030-binder';",
    "import { check } from '040-checker';",
    '',
    'export function compile(origin: number): number {',
    '  return check(bind(load(origin).registry));',
    '}',
    '',
  ].join('\n'),
};

const description = (architecture: string, criteres: string) =>
  ['## Architecture', '', architecture, '', "## Critères d'acceptation", '', criteres, ''].join(
    '\n'
  );

type Lecteur = { composant: string; par: string[] };
type ParLesTypes = {
  nom: string;
  declarations: { composant: string; publie: boolean; porteurs: string[] }[];
  lecteurs: Lecteur[];
};
const parLesTypes = (r: ReturnType<typeof releve>, nom: string): ParLesTypes =>
  (r.types.elements as ParLesTypes[]).find(e => e.nom === nom)!;

describe('the survey by the types', () => {
  it('leads an internal function to the export that carries it, and the export to its readers through its types', () => {
    const r = releve(depot(DEPOT), description('`sceneWritten` pose son origine.', '1. Rien.'));
    expect(r.types.etat).toBe('fait');
    const e = parLesTypes(r, 'sceneWritten');
    expect(e.declarations).toEqual([
      { composant: '020-loader', publie: false, porteurs: ['load'] },
    ]);
    expect(e.lecteurs).toEqual([
      {
        composant: '030-binder',
        par: ['type Registry rendu par load, reçu par bind, transporté par 900-driver'],
      },
      { composant: '900-driver', par: ['appel de load'] },
    ]);
    // checker reads what binder returns, not what loader returns; alone receives a registry that
    // nothing carries to it.
    expect(r.composants).toEqual(['020-loader', '030-binder', '900-driver']);
    expect(r.sansFournisseur).toEqual([]);
  });

  it('finds the references of a member of a published type, its writers included', () => {
    const r = releve(depot(DEPOT), description('`Registry.objects` change.', '1. Rien.'));
    const e = parLesTypes(r, 'Registry.objects');
    expect(e.declarations).toEqual([{ composant: '000-forms', publie: true, porteurs: [] }]);
    expect(e.lecteurs).toEqual([
      { composant: '020-loader', par: ['référence à Registry.objects'] },
      { composant: '030-binder', par: ['référence à Registry.objects'] },
    ]);
    expect(r.composants).not.toContain('050-alone');
  });

  it('follows an internal function of a reader up to the producers of the type it receives', () => {
    const r = releve(depot(DEPOT), description('`castOf` change.', '1. Rien.'));
    const e = parLesTypes(r, 'castOf');
    expect(e.declarations).toEqual([
      { composant: '030-binder', publie: false, porteurs: ['bind'] },
    ]);
    expect(e.lecteurs).toEqual([
      {
        composant: '020-loader',
        par: ['type Registry rendu par load, reçu par bind, transporté par 900-driver'],
      },
      {
        composant: '040-checker',
        par: ['type Bound rendu par bind, reçu par check, transporté par 900-driver'],
      },
      { composant: '900-driver', par: ['appel de bind'] },
    ]);
  });

  it('keeps, among homonyms, the declaration in a file the ticket names', () => {
    const racine = depot({
      ...DEPOT,
      'packages/alone/src/assemble.ts':
        'export function sceneWritten(): number {\n  return 0;\n}\n',
    });
    const r = releve(
      racine,
      description(
        '`sceneWritten` (`packages/loader/src/assemble.ts`) pose son origine.',
        '1. Rien.'
      )
    );
    expect(parLesTypes(r, 'sceneWritten').declarations.map(d => d.composant)).toEqual([
      '020-loader',
    ]);
  });

  it('says when it cannot run, and the survey by the names stands alone', () => {
    const sans = Object.fromEntries(
      Object.entries(DEPOT).filter(([f]) => !/tsconfig/.test(f))
    ) as Record<string, string>;
    const r = releve(depot(sans), description('`sceneWritten` pose son origine.', '1. Rien.'));
    expect(r.types.etat).toBe('impossible');
    expect(r.types.raison).toMatch(/tsconfig/);
    expect(r.sansFournisseur).toEqual(['sceneWritten']);
    expect(texteDuReleve(r)).toContain(
      `- Par les types : impossible (${r.types.raison}) ; le relevé s'en tient aux noms.`
    );
  });
});

describe('the survey by the architecture', () => {
  it('reads the Reçoit and Rend of the CADRE.md of a package that declares an element', () => {
    const r = releve(depot(DEPOT), description('`castOf` change.', '1. Rien.'));
    expect(r.architecture).toEqual([
      { composant: '020-loader', par: ['CADRE de 030-binder, Reçoit R3'] },
      { composant: '040-checker', par: ['CADRE de 030-binder, Rend R4'] },
      { composant: '900-driver', par: ['CADRE de 030-binder, Reçoit R3'] },
    ]);
    // Connaît names a package that is no producer nor reader.
    expect(r.composants).not.toContain('050-alone');
    expect(r.composants).toEqual(['020-loader', '030-binder', '040-checker', '900-driver']);
  });

  it('writes each reader by the types and by the architecture in the survey, with what makes it one', () => {
    const t = texteDuReleve(
      releve(depot(DEPOT), description('`sceneWritten` et `castOf` changent.', '1. Rien.'))
    );
    expect(t).toContain('- Par les types (service de langage de TypeScript) :');
    expect(t).toContain(
      '  - `sceneWritten` : interne à 020-loader, porté par `load` ; lu par 030-binder (type Registry rendu par load, reçu par bind, transporté par 900-driver), 900-driver (appel de load).'
    );
    expect(t).toContain(
      "- Par l'architecture : 020-loader (CADRE de 030-binder, Reçoit R3), 040-checker (CADRE de 030-binder, Rend R4), 900-driver (CADRE de 030-binder, Reçoit R3)."
    );
  });

  it('runs as a command on a draft, the readers by the types in its output', () => {
    const racine = depot(DEPOT);
    writeFileSync(
      path.join(racine, 'brouillon.md'),
      description('`sceneWritten` pose son origine.', '1. Rien.')
    );
    const r = spawnSync('node', [SCRIPT, '--description', 'brouillon.md'], {
      cwd: racine,
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('**Composants relevés** : 020-loader, 030-binder, 900-driver.');
  });
});
