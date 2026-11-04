// grillhouse-3dr.5 — les données d'un paquet (`grillhouse.donnees` du package.json du consommateur,
// `{ "<VARIABLE>": "<paquet>#<sortie>" }`), comme les `data` de Bazel : le générateur de turbo.json
// met chaque variable dans `globalPassThroughEnv` (sinon le mode strict de Turborepo la retire de
// l'environnement du test), et le hash du test du consommateur suit le fournisseur.
//
// - Critère 2 (amendé) : le test du consommateur attend la construction du fournisseur.
// - Critère 5 (amendé, sonde) : le hash de la tâche de test change quand une source du crate change.
// - Critère 5 (initial) : `globalPassThroughEnv` nomme chaque variable de `grillhouse.donnees`, la
//   garde refuse un turbo.json qui ne la nomme pas, la variable n'entre dans aucun hash.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ecrire, verifier } from '../../../../scripts/langages/typescript/turbo-des-paquets.mjs';

const DEPOT = path.resolve(__dirname, '../../../../../..');
const TURBO = path.join(DEPOT, 'node_modules/.bin/turbo');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'turbo-donnees-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrireFichier = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

const ARCHITECTURE = `# Architecture

| Composant | Dépôt | Responsabilité | Langage |
|---|---|---|---|
| \`crates/service\` | P | le service | cargo |
| \`outils\` | P | les commandes | python |
`;

// Un dépôt d'un crate (`service`, binaire `synthhub`) et d'un projet Python (`outils`) qui le
// lance dans ses tests ; <consommateur> complète le package.json de `outils`.
function depot(consommateur: object = {}): string {
  const r = mkdtempSync(path.join(ESSAIS, 'd-'));
  ecrireFichier(
    r,
    'package.json',
    json({
      name: 'essai',
      private: true,
      workspaces: ['crates/*', 'outils'],
      packageManager: 'npm@10.9.8',
    })
  );
  ecrireFichier(r, 'turbo.json', lire(DEPOT, 'templates/turbo/paquets.json'));
  ecrireFichier(r, 'docs/ARCHITECTURE.md', ARCHITECTURE);
  ecrireFichier(r, 'Cargo.toml', '[workspace]\nmembers = ["crates/*"]\nresolver = "2"\n');
  ecrireFichier(r, 'Cargo.lock', 'version = 4\n');
  ecrireFichier(
    r,
    'crates/service/package.json',
    json({
      name: 'service',
      private: true,
      scripts: {
        build: 'grillhouse construire crates/service',
        'test:unit': 'grillhouse tests crates/service',
        typecheck: 'grillhouse typer crates/service',
      },
    })
  );
  ecrireFichier(
    r,
    'crates/service/Cargo.toml',
    '[package]\nname = "service"\nversion = "0.1.0"\n\n[[bin]]\nname = "synthhub"\npath = "src/main.rs"\n'
  );
  ecrireFichier(r, 'crates/service/src/main.rs', 'fn main() {}\n');
  ecrireFichier(
    r,
    'outils/package.json',
    json({
      name: 'outils',
      private: true,
      scripts: {
        build: 'grillhouse construire outils',
        'test:unit': 'grillhouse tests outils',
        typecheck: 'grillhouse typer outils',
      },
      devDependencies: { service: '*' },
      grillhouse: { donnees: { SYNTHHUB_BIN: 'service#synthhub' } },
      ...consommateur,
    })
  );
  ecrireFichier(r, 'outils/pyproject.toml', '[project]\nname = "outils"\nversion = "0.1.0"\n');
  ecrireFichier(r, 'outils/uv.lock', 'version = 1\n');
  return r;
}

type Tache = { taskId: string; hash: string; dependencies: string[] };
function plan(r: string): Tache[] {
  const t = spawnSync(TURBO, ['run', 'test:unit', '--dry=json', '--cwd', r, '--filter=outils'], {
    encoding: 'utf8',
    env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
  });
  expect(t.status, t.stderr).toBe(0);
  return (JSON.parse(t.stdout) as { tasks: Tache[] }).tasks;
}
const passage = (r: string) =>
  (JSON.parse(lire(r, 'turbo.json')) as { globalPassThroughEnv: string[] }).globalPassThroughEnv;

describe('grillhouse-3dr.5, critère 2 — le test du consommateur attend la construction du fournisseur', () => {
  it('outils#test:unit attend service#build, le fournisseur étant hors de ce que le test nomme', () => {
    const r = depot();
    ecrire(r);
    const t = plan(r).find(x => x.taskId === 'outils#test:unit');
    expect(t?.dependencies).toContain('service#build');
  });
});

describe('grillhouse-3dr.5, critère 5 (sonde) — le hash du test suit le binaire du fournisseur', () => {
  it('une source du crate modifiée change le hash de outils#test:unit', () => {
    const r = depot();
    ecrire(r);
    const avant = plan(r).find(x => x.taskId === 'outils#test:unit')?.hash;
    ecrireFichier(r, 'crates/service/src/main.rs', 'fn main() { println!("autre"); }\n');
    const apres = plan(r).find(x => x.taskId === 'outils#test:unit')?.hash;
    expect(avant).toMatch(/^[0-9a-f]+$/);
    expect(apres).toMatch(/^[0-9a-f]+$/);
    expect(apres).not.toBe(avant);
  });
});

describe('grillhouse-3dr.5, critère 5 (initial) — les données du projet dans globalPassThroughEnv', () => {
  it('la variable du consommateur est écrite, celles du projet gardées', () => {
    const r = depot();
    ecrire(r);
    expect(passage(r)).toEqual([
      'GRILLHOUSE_RESULTATS',
      'GRILLHOUSE_CHANGEMENTS',
      'GRILLHOUSE_AVANCEMENT',
      'TMPDIR',
      'SYNTHHUB_BIN',
    ]);
  });

  it('sans la variable, la vérification la refuse par son nom ; avec, elle est quitte', () => {
    const r = depot();
    const refus = verifier(r).filter(l => /globalPassThroughEnv/.test(l));
    expect(refus.join('\n')).toMatch(/SYNTHHUB_BIN/);
    ecrire(r);
    expect(verifier(r)).toEqual([]);
  });

  it('deux consommateurs : chaque variable est écrite une fois', () => {
    const r = depot();
    ecrireFichier(
      r,
      'autre/package.json',
      json({
        name: 'autre',
        private: true,
        scripts: { build: 'grillhouse construire autre', 'test:unit': 'grillhouse tests autre' },
        devDependencies: { service: '*' },
        grillhouse: { donnees: { AUTRE_BIN: 'service#synthhub' } },
      })
    );
    ecrireFichier(r, 'autre/pyproject.toml', '[project]\nname = "autre"\nversion = "0.1.0"\n');
    ecrireFichier(r, 'autre/uv.lock', 'version = 1\n');
    ecrireFichier(
      r,
      'package.json',
      json({ ...JSON.parse(lire(r, 'package.json')), workspaces: ['crates/*', 'outils', 'autre'] })
    );
    ecrireFichier(
      r,
      'docs/ARCHITECTURE.md',
      `${ARCHITECTURE}| \`autre\` | P | un autre | python |\n`
    );
    ecrire(r);
    expect(passage(r).filter(v => v === 'SYNTHHUB_BIN')).toHaveLength(1);
    expect(passage(r).filter(v => v === 'AUTRE_BIN')).toHaveLength(1);
    ecrire(r);
    expect(passage(r).filter(v => v === 'SYNTHHUB_BIN')).toHaveLength(1);
  });

  it('la variable n’entre dans aucun hash : sa valeur dans l’environnement ne change pas celui du test', () => {
    const r = depot();
    ecrire(r);
    const jouer = (valeur: string) => {
      const t = spawnSync(
        TURBO,
        ['run', 'test:unit', '--dry=json', '--cwd', r, '--filter=outils'],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            SYNTHHUB_BIN: valeur,
            TURBO_TELEMETRY_DISABLED: '1',
            DO_NOT_TRACK: '1',
          },
        }
      );
      expect(t.status, t.stderr).toBe(0);
      return (JSON.parse(t.stdout) as { tasks: Tache[] }).tasks.find(
        x => x.taskId === 'outils#test:unit'
      )?.hash;
    };
    expect(jouer('/un/chemin')).toBe(jouer('/un/autre'));
  });

  it('un projet sans grillhouse.donnees garde son globalPassThroughEnv', () => {
    const r = depot({ grillhouse: {} });
    const avant = passage(r);
    ecrire(r);
    expect(passage(r)).toEqual(avant);
    expect(verifier(r)).toEqual([]);
  });
});
