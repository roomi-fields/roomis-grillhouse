// grillhouse-44b.4, décision 2 du responsable — une migration de la montée du cadre écrit le
// package.json de chaque paquet Rust ou Python que l'architecture déclare dans un projet existant,
// et l'inscrit aux `workspaces` : le même package.json que `grillhouse paquet` écrit à la création
// (nom du manifeste, private, scripts build / test:unit / typecheck), sans réécrire un
// package.json présent. Un paquet TypeScript n'en reçoit aucun. Une seconde passe ne change rien.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { paquets } from '../../scripts/paquets.mjs';
import { MIGRATIONS } from '../../scripts/migrations.mjs';

// Le module se charge ici, pour que son absence rougisse chaque test, non le fichier entier.
type Migration = { migrer: (p: string) => unknown[]; nom: string; version: string };
const MODULE = '../../scripts/migrations/0.31.0-paquets-dans-le-graphe.mjs';
const migration = await (import(/* @vite-ignore */ MODULE) as Promise<Migration>).catch(
  (e: Error): Migration => {
    const absent = (): never => {
      throw e;
    };
    return {
      migrer: absent,
      get nom(): string {
        return absent();
      },
      get version(): string {
        return absent();
      },
    };
  }
);

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-graphe-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
type PackageJson = {
  name: string;
  private: boolean;
  scripts: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
};
const dossiers = (racine: string) => (paquets(racine) as { dossier: string }[]).map(p => p.dossier);
const json = (racine: string, f: string) => JSON.parse(lire(racine, f)) as PackageJson;

const ARCHITECTURE = `# Architecture

| Composant | Dépôt | Responsabilité | Langage |
|---|---|---|---|
| \`crates/journal\` | P | le journal | cargo |
| \`crates/noyau\` | P | le noyau | cargo |
| \`outils\` | P | les commandes | python |
| \`packages/site\` | P | le site | typescript |
`;

// Un projet existant : ni crate ni projet Python n'a de package.json.
function projet(racinePackage: Record<string, unknown> = {}): string {
  const r = mkdtempSync(path.join(ESSAIS, 'p-'));
  ecrire(r, 'docs/ARCHITECTURE.md', ARCHITECTURE);
  ecrire(
    r,
    'package.json',
    `${JSON.stringify({ name: 'synthub', private: true, workspaces: ['packages/*'], ...racinePackage })}\n`
  );
  ecrire(r, 'Cargo.toml', '[workspace]\nmembers = ["crates/*"]\nresolver = "2"\n');
  ecrire(r, 'crates/journal/Cargo.toml', '[package]\nname = "journal-core"\nversion = "0.1.0"\n');
  ecrire(r, 'crates/noyau/Cargo.toml', '[package]\nname = "noyau"\nversion = "0.1.0"\n');
  ecrire(r, 'outils/pyproject.toml', '[project]\nname = "synth-outils"\nversion = "0.1.0"\n');
  ecrire(r, 'packages/site/package.json', '{"name":"site"}\n');
  return r;
}

describe('grillhouse-44b.4, décision 2 — la migration écrit les package.json des paquets Rust et Python', () => {
  it('est une migration du cadre de 0.31.0', () => {
    expect(migration.version).toBe('0.31.0');
    expect(MIGRATIONS).toContain(migration);
  });

  it('écrit, pour chaque crate et chaque projet Python, un package.json au nom de son manifeste', () => {
    const r = projet();
    const lignes = migration.migrer(r);
    expect(lignes.length).toBeGreaterThan(0);
    expect(json(r, 'crates/journal/package.json').name).toBe('journal-core');
    expect(json(r, 'crates/noyau/package.json').name).toBe('noyau');
    expect(json(r, 'outils/package.json').name).toBe('synth-outils');
    for (const [d, c] of [
      ['crates/journal', 'crates/journal'],
      ['crates/noyau', 'crates/noyau'],
      ['outils', 'outils'],
    ] as const) {
      const p = json(r, `${d}/package.json`);
      expect(p.private, d).toBe(true);
      expect(p.scripts.build, d).toMatch(new RegExp(`grillhouse construire ${c}$`));
      expect(p.scripts['test:unit'], d).toMatch(new RegExp(`grillhouse tests ${c}$`));
      expect(p.scripts.typecheck, d).toMatch(new RegExp(`grillhouse typer ${c}$`));
    }
  });

  it('inscrit chaque paquet aux workspaces, que paquets() retient, les motifs de la racine gardés', () => {
    const r = projet();
    migration.migrer(r);
    const ws = json(r, 'package.json').workspaces as string[];
    expect(ws[0]).toBe('packages/*');
    expect(dossiers(r)).toEqual(['crates/journal', 'crates/noyau', 'outils', 'packages/site']);
  });

  it('ne touche pas un paquet TypeScript', () => {
    const r = projet();
    migration.migrer(r);
    expect(lire(r, 'packages/site/package.json')).toBe('{"name":"site"}\n');
  });

  it('un package.json présent au bon nom reste tel quel, ses champs gardés', () => {
    const r = projet();
    const present = '{"name":"noyau","private":true,"description":"à moi"}\n';
    ecrire(r, 'crates/noyau/package.json', present);
    migration.migrer(r);
    expect(lire(r, 'crates/noyau/package.json')).toBe(present);
    expect(dossiers(r)).toContain('crates/noyau');
  });

  it('un package.json présent d’un autre nom est nommé dans aFaire, rien de plus écrit pour ce paquet', () => {
    const r = projet();
    const present = '{"name":"autre","private":true}\n';
    ecrire(r, 'crates/noyau/package.json', present);
    const lignes = migration.migrer(r);
    expect(lire(r, 'crates/noyau/package.json')).toBe(present);
    const aFaire = lignes.filter((l: unknown) => typeof l === 'object') as { aFaire: string }[];
    expect(aFaire).toHaveLength(1);
    expect(aFaire[0]!.aFaire).toMatch(/crates\/noyau\/package\.json.*autre.*noyau/s);
    expect(json(r, 'crates/journal/package.json').name).toBe('journal-core');
  });

  it('une seconde passe ne change rien et ne rapporte rien', () => {
    const r = projet();
    migration.migrer(r);
    const apres = ['package.json', 'crates/journal/package.json', 'outils/package.json'].map(f =>
      lire(r, f)
    );
    expect(migration.migrer(r)).toEqual([]);
    expect(
      ['package.json', 'crates/journal/package.json', 'outils/package.json'].map(f => lire(r, f))
    ).toEqual(apres);
  });

  it('un projet sans crate ni projet Python n’est pas touché', () => {
    const r = mkdtempSync(path.join(ESSAIS, 'ts-'));
    ecrire(r, 'package.json', '{"name":"p","workspaces":["packages/*"]}\n');
    ecrire(
      r,
      'docs/ARCHITECTURE.md',
      '# Architecture\n\n| Paquet | Langage |\n|---|---|\n| `a` | typescript |\n'
    );
    ecrire(r, 'packages/a/package.json', '{"name":"a"}\n');
    expect(migration.migrer(r)).toEqual([]);
    expect(lire(r, 'package.json')).toBe('{"name":"p","workspaces":["packages/*"]}\n');
  });
});
