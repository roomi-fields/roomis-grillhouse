// Les entrées de hash du build d'un paquet sans package.json propre se rangent par une branche
// explicite de chaque langage (rust.mdx § Caching behavior pour cargo) : cargo, son dossier et le
// Cargo.lock et le Cargo.toml de la racine ; python, son dossier et le pyproject.toml et l'uv.lock
// de la racine quand ils existent ; c, son dossier seul, aucun fichier de la racine, qu'il en
// existe ou non (un paquet c n'a ni verrou ni manifeste de racine).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ecrire, verifier } from '../../../../scripts/langages/typescript/turbo-des-paquets.mjs';

const DEPOT = path.resolve(__dirname, '../../../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'turbo-entrees-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const fichier = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
type Taches = Record<string, { inputs?: string[] }>;
const tachesDe = (racine: string, dossier: string) =>
  (
    JSON.parse(
      readFileSync(path.join(racine, dossier, 'turbo.json'), 'utf8').replace(/^\/\/.*\n/, '')
    ) as { tasks: Taches }
  ).tasks;

const ARCHITECTURE = `# Architecture

| Composant | Dépôt | Responsabilité | Langage |
|---|---|---|---|
| \`crates/noyau\` | P | le noyau | cargo |
| \`outils\` | P | les commandes | python |
| \`osd-embed\` | P | le noyau embarqué | c |
`;

const paquet = (nom: string) =>
  json({
    name: nom,
    private: true,
    scripts: {
      build: `grillhouse construire ${nom}`,
      'test:unit': `grillhouse tests-du-paquet ${nom}`,
      typecheck: `grillhouse typer ${nom}`,
    },
  });

// Un dépôt d'un crate, d'un projet Python et d'un paquet c ; <racine> dit si la racine porte le
// Cargo.toml, le Cargo.lock, le pyproject.toml et l'uv.lock (cargo et python les nomment, c jamais).
function depot(racineAvecFichiers: boolean): string {
  const r = mkdtempSync(path.join(ESSAIS, 'd-'));
  fichier(
    r,
    'package.json',
    json({
      name: 'essai',
      private: true,
      workspaces: ['crates/*', 'outils', 'osd-embed'],
      packageManager: 'npm@10.9.8',
    })
  );
  fichier(r, 'turbo.json', readFileSync(path.join(DEPOT, 'templates/turbo/paquets.json'), 'utf8'));
  fichier(r, 'docs/ARCHITECTURE.md', ARCHITECTURE);
  fichier(r, 'crates/noyau/package.json', paquet('noyau'));
  fichier(r, 'crates/noyau/Cargo.toml', '[package]\nname = "noyau"\nversion = "0.1.0"\n');
  fichier(r, 'outils/package.json', paquet('outils'));
  fichier(r, 'outils/pyproject.toml', '[project]\nname = "outils"\nversion = "0.1.0"\n');
  fichier(r, 'osd-embed/package.json', paquet('osd-embed'));
  fichier(
    r,
    'osd-embed/CMakeLists.txt',
    'cmake_minimum_required(VERSION 3.16)\nproject(osd-embed C)\n'
  );
  if (racineAvecFichiers) {
    fichier(r, 'Cargo.toml', '[workspace]\nmembers = ["crates/*"]\nresolver = "2"\n');
    fichier(r, 'Cargo.lock', 'version = 4\n');
    fichier(r, 'pyproject.toml', '[tool.uv.workspace]\nmembers = ["outils"]\n');
    fichier(r, 'uv.lock', 'version = 1\n');
    fichier(r, 'CMakeLists.txt', 'add_subdirectory(osd-embed)\n');
  }
  return r;
}

describe('les entrées de build, une branche par langage', () => {
  it('un paquet c : son dossier seul, aucun fichier de la racine, qu’elle en porte ou non', () => {
    for (const avec of [false, true]) {
      const r = depot(avec);
      ecrire(r);
      expect(tachesDe(r, 'osd-embed').build!.inputs, `racine avec fichiers : ${avec}`).toEqual([
        '$TURBO_DEFAULT$',
      ]);
    }
  });

  it('un crate : son dossier, Cargo.lock et Cargo.toml de la racine', () => {
    const r = depot(true);
    ecrire(r);
    expect(tachesDe(r, 'crates/noyau').build!.inputs).toEqual([
      '$TURBO_DEFAULT$',
      '$TURBO_ROOT$/Cargo.lock',
      '$TURBO_ROOT$/Cargo.toml',
    ]);
  });

  it('un projet Python : son dossier, pyproject.toml et uv.lock de la racine quand ils existent', () => {
    const avec = depot(true);
    ecrire(avec, 'outils');
    expect(tachesDe(avec, 'outils').build!.inputs).toEqual([
      '$TURBO_DEFAULT$',
      '$TURBO_ROOT$/pyproject.toml',
      '$TURBO_ROOT$/uv.lock',
    ]);
    const sans = depot(false);
    ecrire(sans);
    expect(tachesDe(sans, 'outils').build!.inputs).toEqual(['$TURBO_DEFAULT$']);
  });

  it('le turbo.json d’un paquet c, écrit, passe la vérification', () => {
    const r = depot(true);
    ecrire(r);
    expect(verifier(r)).toEqual([]);
  });
});
