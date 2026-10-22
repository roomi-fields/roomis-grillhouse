import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { manquants, releve, texteDuReleve } from '../../scripts/composants-affectes.mjs';

// The survey of a ticket's components by the types and by the architecture (Romain, 2026-10-21:
// « l'agent analyste initial doit utiliser codegraph, le service de langage typescript et les
// documents d'architecture comme base de connaissance pour prendre ses décisions et cherche les
// références par les types et par l'architecture »). As « find all references » of rust-analyzer
// and of TypeScript's language service, an element of the ticket is resolved as a symbol, a member
// of a type or a function internal to a package included, and its references are found through
// the types, not through the text: an internal symbol leads to the published export that carries
// it, and that export's types to the packages that receive them and read their content. The Rend
// of the CADRE.md of the packages that declare the elements names the readers of what they
// return. Witness: BPScript 320.3, where the survey by the names found 040-checker and missed
// 020-loader, whose `sceneWritten` (internal) writes the object of the scene into the `Registry`
// that `load` returns, which 900-driver carries to 030-binder.
//
// grillhouse-3uv.92.8 — as a graph of declared dependencies (the `deps` and `data` of Bazel, the
// `implicitDependencies` of Nx), a reader is a package that reads: carrying a type is not reading
// it. In BPScript 320.4, 13 of the 15 components missing from the title were carriers (« type
// ReadTree rendu par parse, reçu par bind, transporté par 900-driver ») or producers named by a
// « Reçoit » of a CADRE.md; the supervisor set the 15 aside at once, 050-emitter and 900-driver
// with them, and 995-tools, whose `grillhouse.lit` declares `libraries`, was not found.

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

  it('follows an internal function of a reader to the readers of what it returns, never to the producers of what it receives', () => {
    const r = releve(depot(DEPOT), description('`castOf` change.', '1. Rien.'));
    const e = parLesTypes(r, 'castOf');
    expect(e.declarations).toEqual([
      { composant: '030-binder', publie: false, porteurs: ['bind'] },
    ]);
    // loader produces the registry bind receives: it reads nothing bind returns.
    expect(e.lecteurs).toEqual([
      {
        composant: '040-checker',
        par: ['type Bound rendu par bind, reçu par check, transporté par 900-driver'],
      },
      { composant: '900-driver', par: ['appel de bind'] },
    ]);
  });

  // grillhouse-3uv.92.8, criterion 2.
  it('leaves out a package that receives a type the carrier returns without reading its content', () => {
    const racine = depot({
      ...DEPOT,
      // relay receives what bind returns and hands it on, without reading it.
      ...ts('060-relay', 'relay'),
      'packages/relay/src/index.ts': [
        "import type { Bound } from '000-forms';",
        '',
        'export function relay(bound: Bound): Bound[] {',
        '  return [bound];',
        '}',
        '',
      ].join('\n'),
      'packages/driver/src/index.ts': [
        "import { load } from '020-loader';",
        "import { bind } from '030-binder';",
        "import { check } from '040-checker';",
        "import { relay } from '060-relay';",
        '',
        'export function compile(origin: number): number {',
        '  return relay(bind(load(origin).registry)).map(check).length;',
        '}',
        '',
      ].join('\n'),
    });
    const r = releve(racine, description('`castOf` change.', '1. Rien.'));
    expect(parLesTypes(r, 'castOf').lecteurs.map(l => l.composant)).toEqual([
      '040-checker',
      '900-driver',
    ]);
    expect(r.composants).not.toContain('060-relay');
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
  it('reads the Rend of the CADRE.md of a package that declares an element, never its Reçoit', () => {
    const r = releve(depot(DEPOT), description('`castOf` change.', '1. Rien.'));
    expect(r.architecture).toEqual([
      { composant: '040-checker', par: ['CADRE de 030-binder, Rend R4'] },
    ]);
    // Reçoit names the producers, which read nothing the package returns; Connaît names a
    // package that is no producer nor reader.
    expect(r.composants).not.toContain('020-loader');
    expect(r.composants).not.toContain('050-alone');
    expect(r.composants).toEqual(['030-binder', '040-checker', '900-driver']);
  });

  it('writes each reader by the types and by the architecture in the survey, with what makes it one', () => {
    const t = texteDuReleve(
      releve(depot(DEPOT), description('`sceneWritten` et `castOf` changent.', '1. Rien.'))
    );
    expect(t).toContain('- Par les types (service de langage de TypeScript) :');
    expect(t).toContain(
      '  - `sceneWritten` : interne à 020-loader, porté par `load` ; lu par 030-binder (type Registry rendu par load, reçu par bind, transporté par 900-driver), 900-driver (appel de load).'
    );
    expect(t).toContain("- Par l'architecture : 040-checker (CADRE de 030-binder, Rend R4).");
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

// grillhouse-3uv.92.8, criterion 4 — the survey of BPScript 320.4 (2026-10-21, 17:35:48), reduced:
// 030-binder merges the members (`membersOver`, internal, carried by `bind`) and publishes
// `BoundObject.memberSources`; 040-checker reads them (`memberNamed`, internal, carried by
// `check`); 900-driver carries the tree of 010-parser and the registry of 020-loader to `bind`,
// and what `bind` returns to 040-checker, 050-emitter and 060-encoder; 050-emitter reads it,
// 060-encoder hands it on; the CADRE.md of 030-binder receives from 010-parser and 020-loader;
// 995-tools declares it reads `libraries`, which the ticket changes. Of the title « 000-forms,
// 030-binder, 040-checker », the survey misses 050-emitter, 900-driver and 995-tools, and only
// them.
const DEPOT_320_4 = {
  'package.json': JSON.stringify({ name: 'bpscript', private: true, workspaces: ['packages/*'] }),
  'libraries/alphabets.bpsl': 'sound piano(midi(key:60), vel:80)\n',
  ...ts('000-forms', '000-forms'),
  'packages/000-forms/src/index.ts': [
    'export type MemberSource = { readonly owner: string };',
    'export type BoundObject = { readonly memberSources: readonly MemberSource[] };',
    'export type ReadTree = { readonly items: readonly string[] };',
    'export type Registry = { readonly names: readonly string[] };',
    'export type Binding = { readonly objects: readonly BoundObject[] };',
    '',
  ].join('\n'),
  'packages/000-forms/docs/INTERFACE.md': [
    '# 000-forms',
    '',
    '<!-- généré: début -->',
    '### `BoundObject`',
    '',
    'Un objet lié.',
    '<!-- généré: fin -->',
    '',
  ].join('\n'),
  ...ts('010-parser', '010-parser'),
  'packages/010-parser/src/index.ts': [
    "import type { ReadTree } from '000-forms';",
    '',
    'export function parse(text: string): ReadTree {',
    "  return { items: text.split(' ') };",
    '}',
    '',
  ].join('\n'),
  ...ts('020-loader', '020-loader'),
  'packages/020-loader/src/index.ts': [
    "import type { Registry } from '000-forms';",
    '',
    'export function load(names: string[]): Registry {',
    '  return { names };',
    '}',
    '',
  ].join('\n'),
  ...ts('030-binder', '030-binder'),
  'packages/030-binder/src/index.ts': "export { bind } from './fusion.ts';\n",
  'packages/030-binder/src/fusion.ts': [
    "import type { Binding, MemberSource, ReadTree, Registry } from '000-forms';",
    '',
    'function membersOver(tree: ReadTree, registry: Registry): MemberSource[] {',
    '  return [...tree.items, ...registry.names].map(owner => ({ owner }));',
    '}',
    '',
    'export function bind(tree: ReadTree, registry: Registry): Binding {',
    '  return { objects: [{ memberSources: membersOver(tree, registry) }] };',
    '}',
    '',
  ].join('\n'),
  'packages/030-binder/docs/CADRE.md': [
    '# Cadre de 030-binder',
    '',
    '## 3. Reçoit',
    '',
    '- **R3.** De `900-driver`, l’arbre de `010-parser` et le registre de `020-loader`.',
    '',
  ].join('\n'),
  ...ts('040-checker', '040-checker'),
  'packages/040-checker/src/index.ts': [
    "import type { Binding } from '000-forms';",
    '',
    'function memberNamed(binding: Binding, name: string): boolean {',
    '  return binding.objects.some(o => o.memberSources.some(m => m.owner === name));',
    '}',
    '',
    'export function check(binding: Binding): string[] {',
    "  return memberNamed(binding, 'v') ? [] : ['CHECK_MEMBER_RETYPED_BY_EXEMPLAR'];",
    '}',
    '',
  ].join('\n'),
  ...ts('050-emitter', '050-emitter'),
  'packages/050-emitter/src/index.ts': [
    "import type { Binding } from '000-forms';",
    '',
    'export function emit(binding: Binding): number[] {',
    '  return binding.objects.map(o => o.memberSources.length);',
    '}',
    '',
  ].join('\n'),
  ...ts('060-encoder', '060-encoder'),
  'packages/060-encoder/src/index.ts': [
    "import type { Binding } from '000-forms';",
    '',
    'export function encode(binding: Binding): readonly Binding[] {',
    '  return [binding];',
    '}',
    '',
  ].join('\n'),
  ...ts('900-driver', '900-driver'),
  'packages/900-driver/src/index.ts': [
    "import { parse } from '010-parser';",
    "import { load } from '020-loader';",
    "import { bind } from '030-binder';",
    "import { check } from '040-checker';",
    "import { emit } from '050-emitter';",
    "import { encode } from '060-encoder';",
    '',
    'export function compile(text: string): number {',
    '  const binding = bind(parse(text), load([]));',
    '  return check(binding).length + emit(binding).length + encode(binding).length;',
    '}',
    '',
  ].join('\n'),
  'packages/995-tools/package.json': JSON.stringify({
    name: '995-tools',
    type: 'module',
    grillhouse: { lit: ['package.json', 'libraries'] },
  }),
};

const TICKET_320_4 = description(
  [
    '- **Mécanisme commun, existant** : 030-binder fusionne par `membersOver` (fusion.ts:14-23)',
    '  et publie `BoundObject.memberSources` ; 040-checker la lit par `memberNamed`. `T?` peut',
    '  devenir `T`.',
    '- **Documents touchés** : libraries/alphabets.bpsl:46-49.',
  ].join('\n'),
  [
    '1. `def zx(integer? v)` puis `def zx(string? v)` se refuse, par la faute',
    '   `CHECK_MEMBER_RETYPED`, qui nomme `zx`, `v` et `a`.',
  ].join('\n')
);

describe('the survey of BPScript 320.4, reduced', () => {
  it('finds 050-emitter, 900-driver and 995-tools, and leaves out the carriers and the producers', () => {
    const racine = depot(DEPOT_320_4);
    const r = releve(racine, TICKET_320_4);
    expect(r.types.etat).toBe('fait');
    expect(manquants(racine, r, ['000-forms', '030-binder', '040-checker'])).toEqual([
      '050-emitter',
      '900-driver',
      '995-tools',
    ]);
    expect(r.sansFournisseur).toEqual([]);
    expect(texteDuReleve(r)).not.toContain('Sans interface');
  });
});
