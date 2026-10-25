// A package plays all its tests when a file of a package it depends on changes or goes, that file
// being one its neighbour's build reads: as Turborepo hashes the inputs of the neighbour's `build`
// task and Bazel the `srcs` of its target, the rule reads the inputs of the `build` of the
// neighbour's generated turbo.json as Turborepo reads them, or, when they name none, its files of
// code and configuration out of its docs/; a test of the neighbour plays none of the dependent's
// tests (scripts/vitest-config/changements.mjs).
// Witness: BPScript bp-mono-vbwf.320.8 (Grillhouse 0.24.3), where a change of
// packages/000-forms/docs/INTERFACE.md played 900-driver (6 min 25 s) and 995-tools (5 min 15 s)
// whole: « ↳ packages/900-driver : tous ses tests, le code d’un paquet dont il dépend, que ses tests
// lisent construit (packages/000-forms/docs/INTERFACE.md) ».
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { restreindre } from '../../scripts/vitest-config/changements.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'changements-des-voisins-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
const ENTETE =
  '// Généré par `npx grillhouse turbo-des-paquets --ecrire` depuis les package.json, le turbo.json racine et docs/agents/hors-cadre.txt ; ne pas éditer.\n';
// The turbo.json of 000-forms as BPScript holds it on 320.8, whose build is `tsc -p tsconfig.build.json`.
const TURBO_000 = `${ENTETE}${json({
  $schema: 'https://turborepo.com/schema.json',
  extends: ['//'],
  tasks: {
    build: {
      dependsOn: [],
      inputs: [
        '$TURBO_ROOT$/tsconfig.construction.json',
        'package.json',
        'src/**',
        'tsconfig.build.json',
        'tsconfig.json',
      ],
    },
  },
})}`;

// A repository of BPScript's form: 000-forms the provider (its turbo.json <turbo>, none when null),
// 900-driver depending on it, 995-tools on both, each link in the root's node_modules as npm
// writes a workspace.
function depot(turbo: string | null = TURBO_000) {
  const r = realpathSync(mkdtempSync(path.join(ESSAIS, 'depot-')));
  const ecrire = (f: string, t: string) => {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  };
  ecrire('package.json', json({ name: 'bp', private: true, workspaces: ['packages/*'] }));
  ecrire(
    'packages/000-forms/package.json',
    json({ name: '000-forms', scripts: { build: 'tsc -p tsconfig.build.json' } })
  );
  if (turbo !== null) {
    ecrire('packages/000-forms/turbo.json', turbo);
  }
  ecrire(
    'packages/900-driver/package.json',
    json({ name: '900-driver', dependencies: { '000-forms': '*' } })
  );
  ecrire(
    'packages/995-tools/package.json',
    json({
      name: '995-tools',
      devDependencies: { '000-forms': '*', '900-driver': '*' },
      grillhouse: { lit: ['package.json', 'docs/agents/hors-cadre.txt'] },
    })
  );
  mkdirSync(path.join(r, 'node_modules'));
  for (const p of ['000-forms', '900-driver', '995-tools']) {
    symlinkSync(`../packages/${p}`, path.join(r, 'node_modules', p), 'dir');
  }
  return { racine: r, ecrire };
}

// The line the restriction of <paquet> writes for the changes <fichiers> and the removals
// <supprimes>, and its `related`.
function restreint(racine: string, paquet: string, fichiers: string[], supprimes: string[] = []) {
  const lignes: string[] = [];
  const test: { related?: string[] } = {};
  restreindre(
    test,
    path.join(racine, 'packages', paquet),
    { racine, fichiers, supprimes },
    [],
    (l: string) => lignes.push(l)
  );
  return { ligne: lignes.join('\n'), related: test.related };
}
const entier = (racine: string, paquet: string, fichiers: string[], supprimes: string[] = []) =>
  restreint(racine, paquet, fichiers, supprimes).ligne.includes('tous ses tests');
// A turbo.json of 000-forms whose build has the inputs <inputs>.
const turboAvec = (inputs: string[]) =>
  `${ENTETE}${json({ extends: ['//'], tasks: { build: { inputs } } })}`;

describe('a document of the provider plays none of its dependents’ tests (criterion 1)', () => {
  it.each([
    ['packages/000-forms/docs/INTERFACE.md'],
    ['packages/000-forms/docs/INTERFACE.api.md'],
    ['packages/000-forms/docs/ARCHITECTURE.md'],
  ])('%s, the generated turbo.json read', f => {
    const { racine } = depot();
    for (const p of ['900-driver', '995-tools']) {
      const { ligne, related } = restreint(racine, p, [f]);
      expect(ligne).toContain('les tests que Vitest relie');
      expect(related).toEqual([path.join(racine, f)]);
    }
  });

  it.each([
    ['packages/000-forms/docs/INTERFACE.md'],
    ['packages/000-forms/docs/INTERFACE.api.json'],
    ['packages/000-forms/README.md'],
  ])('%s, without a turbo.json of the provider', f => {
    const { racine } = depot(null);
    expect(entier(racine, '900-driver', [f])).toBe(false);
  });

  it('a test of the provider plays none, its turbo.json read or not', () => {
    for (const turbo of [TURBO_000, null]) {
      const { racine } = depot(turbo);
      expect(entier(racine, '900-driver', ['packages/000-forms/src/forms.test.ts'])).toBe(false);
    }
  });
});

describe('a file the provider’s build reads plays its dependents whole (criterion 2)', () => {
  it.each([
    ['packages/000-forms/src/forms.ts'],
    ['packages/000-forms/src/tables/niveaux.ts'],
    ['packages/000-forms/package.json'],
    ['packages/000-forms/tsconfig.build.json'],
  ])('%s, an input of the build of its turbo.json', f => {
    const { racine } = depot();
    for (const p of ['900-driver', '995-tools']) {
      const { ligne } = restreint(racine, p, [f]);
      expect(ligne).toContain('tous ses tests');
      expect(ligne).toContain('le code d’un paquet dont il dépend');
      expect(ligne).toContain(`(${f})`);
    }
  });

  it.each([
    ['packages/000-forms/src/forms.ts'],
    ['packages/000-forms/package.json'],
    ['packages/000-forms/tsconfig.build.json'],
  ])('%s, without a turbo.json of the provider: its code and its configuration', f => {
    const { racine } = depot(null);
    expect(entier(racine, '900-driver', [f])).toBe(true);
  });

  it('a file of the provider out of the inputs of its build plays none', () => {
    const { racine } = depot();
    expect(entier(racine, '900-driver', ['packages/000-forms/scripts/outil.mjs'])).toBe(false);
  });

  it('inputs that extend a root naming none: its code and configuration, its exclusion kept', () => {
    const { racine } = depot(turboAvec(['$TURBO_EXTENDS$', '!src/donnees/**']));
    expect(entier(racine, '900-driver', ['packages/000-forms/src/forms.ts'])).toBe(true);
    expect(entier(racine, '900-driver', ['packages/000-forms/src/donnees/table.json'])).toBe(false);
    expect(entier(racine, '900-driver', ['packages/000-forms/docs/INTERFACE.md'])).toBe(false);
  });

  it('$TURBO_DEFAULT$ is every file of the package, docs/ included, as Turborepo hashes it', () => {
    const { racine } = depot(turboAvec(['$TURBO_DEFAULT$', '!src/donnees/**']));
    expect(entier(racine, '900-driver', ['packages/000-forms/docs/INTERFACE.md'])).toBe(true);
    expect(entier(racine, '900-driver', ['packages/000-forms/notes.txt'])).toBe(true);
    expect(entier(racine, '900-driver', ['packages/000-forms/src/donnees/table.json'])).toBe(false);
    expect(entier(racine, '900-driver', ['packages/000-forms/src/forms.test.ts'])).toBe(false);
  });

  it.each([
    ['turbo.json', ['$TURBO_DEFAULT$', '$TURBO_ROOT$/tsconfig.construction.json'], true],
    ['turbo.jsonc', ['src/**'], false],
  ])(
    '$TURBO_EXTENDS$ is the inputs of the root’s build (%s: %j): a document plays %s',
    (fichier, inputs, joue) => {
      const { racine, ecrire } = depot(turboAvec(['$TURBO_EXTENDS$']));
      ecrire(fichier, `// La configuration du dépôt.\n${json({ tasks: { build: { inputs } } })}`);
      expect(entier(racine, '900-driver', ['packages/000-forms/docs/INTERFACE.md'])).toBe(joue);
      expect(entier(racine, '900-driver', ['packages/000-forms/src/forms.ts'])).toBe(true);
    }
  );

  it('a pattern `<x>/**` covers <x> itself, as in Turborepo', () => {
    const { racine } = depot(turboAvec(['src/motif.txt/**']));
    expect(entier(racine, '900-driver', ['packages/000-forms/src/motif.txt'])).toBe(true);
    expect(entier(racine, '900-driver', ['packages/000-forms/src/autre.txt'])).toBe(false);
  });
});

// Witnesses: BPScript d09c7dbef, which renames packages/<p>/docs/ARCHITECTURE.md to CADRE.md in
// each package, and 2e2fbf644, which removes packages/000-forms/test/own-by-subject.test.ts.
describe('a file removed from the provider plays its dependents only when its build reads it', () => {
  it('a document removed plays none', () => {
    const { racine } = depot();
    expect(entier(racine, '900-driver', [], ['packages/000-forms/docs/INTERFACE.md'])).toBe(false);
  });

  it('a document renamed (the new name changed, the former removed) plays none', () => {
    const { racine } = depot();
    for (const p of ['900-driver', '995-tools']) {
      const { ligne } = restreint(
        racine,
        p,
        ['packages/000-forms/docs/CADRE.md'],
        ['packages/000-forms/docs/ARCHITECTURE.md']
      );
      expect(ligne).toContain('les tests que Vitest relie');
    }
  });

  it('a test removed plays none, its turbo.json read or not', () => {
    for (const turbo of [TURBO_000, null]) {
      const { racine } = depot(turbo);
      const f = 'packages/000-forms/test/own-by-subject.test.ts';
      expect(entier(racine, '900-driver', [], [f])).toBe(false);
    }
  });

  it('a file of its code removed, or renamed, plays its dependents whole', () => {
    const { racine } = depot();
    const { ligne } = restreint(racine, '900-driver', [], ['packages/000-forms/src/forms.ts']);
    expect(ligne).toContain('tous ses tests, un fichier supprimé');
    expect(
      entier(
        racine,
        '900-driver',
        ['packages/000-forms/src/formes.ts'],
        ['packages/000-forms/src/forms.ts']
      )
    ).toBe(true);
  });

  it('a file removed from the package itself, a document included, still plays it whole', () => {
    const { racine } = depot();
    expect(entier(racine, '900-driver', [], ['packages/900-driver/docs/INTERFACE.md'])).toBe(true);
  });
});

describe('the change of BPScript 320.8 (criterion 3)', () => {
  it('000-forms/docs/INTERFACE.md alone changed: 900-driver and 995-tools play the tests related', () => {
    const { racine } = depot();
    const f = 'packages/000-forms/docs/INTERFACE.md';
    expect(restreint(racine, '900-driver', [f]).ligne).toBe(
      '↳ packages/900-driver : les tests que Vitest relie aux 1 fichier(s) changé(s) depuis le dernier vert.'
    );
    expect(restreint(racine, '995-tools', [f]).ligne).toBe(
      '↳ packages/995-tools : les tests que Vitest relie aux 1 fichier(s) changé(s) depuis le dernier vert.'
    );
  });
});
