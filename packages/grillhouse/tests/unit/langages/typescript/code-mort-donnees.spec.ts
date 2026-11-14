import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { codeMortEnProcessus } from './code-mort-depot.js';

// Le garde du code mort honore `grillhouse.donnees` : un fournisseur qu'un consommateur déclare comme
// donnée d'exécution est dans ses `devDependencies` sans être importé, et n'est pas mort. Le cadre
// l'enseigne à knip par l'`ignoreDependencies` de l'espace de travail du consommateur, dans les
// réglages qu'il engendre, sans geste du projet.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'code-mort-donnees-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const T = 120_000;
const json = (o: object) => JSON.stringify(o, null, 2) + '\n';

const PATH_AVANT = process.env.PATH;
beforeAll(() => {
  const faux = path.join(ESSAIS, 'faux-outils');
  mkdirSync(faux, { recursive: true });
  // Le faux cargo rend `.metadata.json`, cherché du dossier courant vers la racine.
  writeFileSync(
    path.join(faux, 'cargo'),
    '#!/bin/sh\nd="$PWD"\nwhile [ "$d" != "/" ]; do\n  [ -f "$d/.metadata.json" ] && exec cat "$d/.metadata.json"\n  d=$(dirname "$d")\ndone\nexit 1\n'
  );
  chmodSync(path.join(faux, 'cargo'), 0o755);
  process.env.PATH = `${faux}${path.delimiter}${PATH_AVANT ?? ''}`;
});
afterAll(() => {
  process.env.PATH = PATH_AVANT;
});

const ARCHITECTURE = `# Architecture

| Composant | Dépôt | Responsabilité | Langage |
|---|---|---|---|
| \`crates/service\` | P | le service | cargo |
| \`packages/scripts\` | P | les scripts | typescript |
`;

const DONNEES = { SYNTHHUB_BIN: 'service#synthhub' };

// Le projet d'essai : le crate `service` (binaire `synthhub`) et le paquet `scripts`, qui le déclare
// en donnée et porte `zod`, qu'il n'importe pas. <racine> remplace le package.json de la racine,
// <fichiers> ajoute ou remplace (null : retire) des fichiers.
async function essai(
  fichiers: Record<string, string | null> = {},
  { racine = {}, journal = false }: { racine?: object; journal?: boolean } = {}
) {
  const dir = mkdtempSync(path.join(ESSAIS, 'e-'));
  const metadata = (r: string) =>
    json({
      workspace_root: r,
      target_directory: path.join(r, 'cible'),
      workspace_members: ['service 0.1.0 (path+file://x)'],
      packages: [
        {
          id: 'service 0.1.0 (path+file://x)',
          name: 'service',
          manifest_path: path.join(r, 'crates/service/Cargo.toml'),
          dependencies: [],
          targets: [
            {
              kind: ['bin'],
              name: 'synthhub',
              src_path: path.join(r, 'crates/service/src/main.rs'),
            },
          ],
        },
      ],
    });
  return codeMortEnProcessus(
    ESSAIS,
    {
      'package.json': json({
        name: 'r',
        private: true,
        workspaces: ['packages/*', 'crates/*'],
        ...racine,
      }),
      'docs/ARCHITECTURE.md': ARCHITECTURE,
      'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\nresolver = "2"\n',
      'crates/service/Cargo.toml':
        '[package]\nname = "service"\nversion = "0.1.0"\n\n[[bin]]\nname = "synthhub"\npath = "src/main.rs"\n',
      'crates/service/src/main.rs': 'fn main() {}\n',
      'crates/service/package.json': json({ name: 'service', private: true }),
      'packages/scripts/package.json': json({
        name: 'scripts',
        main: 'src/index.ts',
        devDependencies: { service: '*', zod: '*' },
        grillhouse: { donnees: DONNEES },
      }),
      'packages/scripts/src/index.ts': 'export const i = 1;\n',
      ...fichiers,
      '.metadata.json': metadata(dir),
    },
    { journal }
  );
}

type Espace = { ignoreDependencies: string[]; entry?: string[] };
type Reglages = {
  ignoreDependencies?: string[];
  workspaces?: Record<string, Espace>;
};

// Les réglages que le garde donne à knip à son premier passage.
const premier = (r: Awaited<ReturnType<typeof essai>>) => {
  expect(r.appels.length, r.sortie).toBeGreaterThan(0);
  return r.appels[0].config as Reglages | null;
};

describe('knip ne signale pas un fournisseur de grillhouse.donnees, et signale le reste', () => {
  it(
    'le fournisseur-donnée passe, une autre dépendance inutilisée du même paquet est signalée',
    async () => {
      const r = await essai();
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('dépendance de développement sans usage — zod');
      expect(r.sortie).not.toMatch(/sans usage — (zod, )?service/);
      expect(r.sortie).not.toContain('— service');
    },
    T
  );

  it(
    'un paquet qui ne déclare aucune donnée voit toujours sa dépendance inutilisée signalée',
    async () => {
      const r = await essai({
        'packages/scripts/package.json': json({
          name: 'scripts',
          main: 'src/index.ts',
          devDependencies: { zod: '*' },
        }),
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('dépendance de développement sans usage — zod');
    },
    T
  );

  it(
    'le fournisseur d’un consommateur TypeScript est ignoré comme celui d’un autre langage',
    async () => {
      const r = await essai({
        'packages/scripts/package.json': json({
          name: 'scripts',
          main: 'src/index.ts',
          devDependencies: { service: '*' },
          grillhouse: { donnees: DONNEES },
        }),
      });
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
});

describe('les réglages engendrés portent les fournisseurs dans l’espace de leur consommateur', () => {
  it(
    'sans paquet hors cadre, l’espace du consommateur porte son fournisseur en ignoreDependencies',
    async () => {
      const config = premier(await essai({}, { journal: true }));
      expect(config?.workspaces?.['packages/scripts']?.ignoreDependencies).toEqual(['service']);
    },
    T
  );

  it(
    'un consommateur à la racine reçoit son fournisseur au niveau haut',
    async () => {
      const config = premier(
        await essai(
          {
            'packages/scripts/package.json': json({ name: 'scripts', main: 'src/index.ts' }),
          },
          {
            racine: { devDependencies: { service: '*' }, grillhouse: { donnees: DONNEES } },
            journal: true,
          }
        )
      );
      expect(config?.ignoreDependencies).toEqual(['service']);
      expect(config?.workspaces).toBeUndefined();
    },
    T
  );

  it(
    'les ignoreDependencies du knip.json du projet sont gardés, ceux du fournisseur ajoutés sans doublon',
    async () => {
      const config = premier(
        await essai(
          {
            'knip.json': json({
              workspaces: {
                'packages/scripts': {
                  ignoreDependencies: ['zod', 'service'],
                  entry: ['src/index.ts'],
                },
              },
            }),
          },
          { journal: true }
        )
      );
      const espace = config?.workspaces?.['packages/scripts'];
      expect([...(espace?.ignoreDependencies ?? [])].sort()).toEqual(['service', 'zod']);
      expect(espace?.entry).toEqual(['src/index.ts']);
    },
    T
  );

  it(
    'les ignoreDependencies de haut niveau du knip.json sont gardés quand le projet n’a pas d’espaces',
    async () => {
      const config = premier(
        await essai({ 'knip.json': json({ ignoreDependencies: ['zod'] }) }, { journal: true })
      );
      expect(config?.ignoreDependencies).toEqual(['zod']);
      expect(config?.workspaces?.['packages/scripts']?.ignoreDependencies).toEqual(['service']);
    },
    T
  );

  it(
    'les réglages de haut niveau gardent leur effet sur la racine une fois les espaces écrits',
    async () => {
      // `src/racine.ts` n'est atteint que par l'entrée de haut niveau du knip.json.
      const r = await essai({
        'knip.json': json({ entry: ['src/index.ts'], project: ['src/**/*.ts'] }),
        'src/index.ts': "import { r } from './racine';\nexport const i = r;\n",
        'src/racine.ts': 'export const r = 1;\n',
      });
      expect(r.sortie).not.toContain('src/racine.ts');
      expect(r.sortie).not.toContain('src/index.ts');
    },
    T
  );

  it(
    'sans paquet hors cadre ni donnée, le knip.json du projet est repris tel quel',
    async () => {
      const knip = { entry: ['src/index.ts'], ignoreDependencies: ['zod'] };
      const config = premier(
        await essai(
          {
            'knip.json': json(knip),
            'packages/scripts/package.json': json({ name: 'scripts', main: 'src/index.ts' }),
          },
          { journal: true }
        )
      );
      expect(config).toEqual(knip);
    },
    T
  );

  it(
    'sans paquet hors cadre, sans donnée ni knip.json, aucun réglage n’est engendré',
    async () => {
      const config = premier(
        await essai(
          {
            'knip.json': null,
            'packages/scripts/package.json': json({ name: 'scripts', main: 'src/index.ts' }),
          },
          { journal: true }
        )
      );
      expect(config).toBeNull();
    },
    T
  );
});

describe('une clé grillhouse.donnees fautive fait échouer le garde', () => {
  it(
    'le garde échoue en nommant la faute de la clé, sans la prendre pour un constat',
    async () => {
      const r = await essai({
        'packages/scripts/package.json': json({
          name: 'scripts',
          main: 'src/index.ts',
          devDependencies: { zod: '*' },
          grillhouse: { donnees: DONNEES },
        }),
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toMatch(/grillhouse\.donnees\.SYNTHHUB_BIN/);
      expect(r.sortie).toMatch(/absent des devDependencies/);
      expect(r.sortie).not.toContain('dépendance de développement sans usage');
    },
    T
  );
});
