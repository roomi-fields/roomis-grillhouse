// grillhouse-44b.4 — un paquet Rust ou Python entre dans le graphe de Turborepo par son package.json
// (node_modules/turbo/docs/guides/multi-language.mdx:191 : un package.json à côté de chaque projet non
// JavaScript). `grillhouse paquet` l'écrit à la création d'un crate ou d'un projet Python, et
// l'inscrit aux `workspaces` de la racine.
//
// - Critère 1 : le package.json écrit (nom, private, scripts build / test:unit / typecheck qui
//   appellent la commande du module sur le chemin du paquet) et son entrée aux workspaces.
// - Critère 8 : un chemin que `paquets()` ne sélectionne pas, ou qu'un motif `!` exclut, entre aux
//   workspaces (après le motif `!`) ; un chemin déjà sélectionné laisse la racine telle quelle.
// - Critère 9 : le nom est celui du crate (Cargo.toml) ou du projet Python (pyproject.toml) ; un
//   package.json présent n'est jamais réécrit, et celui dont le nom diffère, ou est déjà celui d'un
//   autre paquet des workspaces, est refusé par son nom.
// Critère 14 (le CHANGELOG et les documents du paquet) : se juge à la relecture, sans test.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'smol-toml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ecrireLePaquet, planDuPaquet, Refus } from '../../scripts/paquet.mjs';
import { paquets } from '../../scripts/paquets.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'paquet-graphe-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// Les juges de nom que la création consulte (`cargo new --lib`, les modules de la bibliothèque
// standard de Python par uv) : des outils factices qui acceptent tout nom, pour que ces tests jouent
// sans cargo ni uv.
const PATH_AVANT = process.env.PATH;
beforeAll(() => {
  const faux = path.join(ESSAIS, 'faux-outils');
  mkdirSync(faux, { recursive: true });
  writeFileSync(path.join(faux, 'cargo'), '#!/bin/sh\nexit 0\n');
  writeFileSync(path.join(faux, 'uv'), '#!/bin/sh\nprintf "os\\nsys\\njson\\n"\n');
  chmodSync(path.join(faux, 'cargo'), 0o755);
  chmodSync(path.join(faux, 'uv'), 0o755);
  process.env.PATH = `${faux}${path.delimiter}${PATH_AVANT ?? ''}`;
});
afterAll(() => {
  process.env.PATH = PATH_AVANT;
});

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
const json = (racine: string, f: string) => JSON.parse(lire(racine, f)) as PackageJson;
type Entree = { dossier: string; pkg: { name: string } };
const entrees = (racine: string) => paquets(racine) as Entree[];
const tous = (racine: string): string[] =>
  readdirSync(racine, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => path.relative(racine, path.join(e.parentPath, e.name)))
    .sort();

const TABLE = `# Architecture

| Composant | Dépôt | Responsabilité | Langage |
|---|---|---|---|
| \`crates/journal\` | SyntHub | le journal des requêtes | cargo |
| \`crates/noyau\` | SyntHub | le noyau | cargo |
| outils | SyntHub | les commandes du catalogue | python |
| \`packages/interface\` | SyntHub | ce que le navigateur exécute | typescript |
`;

const CARGO_RACINE = `[workspace]
members = ["crates/noyau"]
resolver = "2"

[workspace.package]
version = "0.1.0"
edition = "2021"
`;

// Un projet de Rust et de Python dont la racine npm porte <racinePackage>.
function projet(racinePackage: Record<string, unknown> = {}): string {
  const racine = mkdtempSync(path.join(ESSAIS, 'p-'));
  ecrire(racine, 'docs/ARCHITECTURE.md', TABLE);
  ecrire(racine, 'Cargo.toml', CARGO_RACINE);
  ecrire(
    racine,
    'crates/noyau/Cargo.toml',
    '[package]\nname = "noyau"\nversion.workspace = true\n'
  );
  ecrire(racine, 'crates/noyau/src/lib.rs', '');
  ecrire(
    racine,
    'package.json',
    `${JSON.stringify({ name: 'synthub', private: true, ...racinePackage }, null, 2)}\n`
  );
  return racine;
}

describe('grillhouse-44b.4, critère 1 — le package.json d’un crate ou d’un projet Python', () => {
  it('un crate : son nom, private, ses trois scripts, écrits avec le paquet', () => {
    const racine = projet();
    const plan = planDuPaquet(racine, 'crates/journal');
    expect(Object.keys(plan.fichiers)).toContain('crates/journal/package.json');
    ecrireLePaquet(racine, plan);
    const p = json(racine, 'crates/journal/package.json');
    expect(p.name).toBe('journal');
    expect(p.private).toBe(true);
    expect(Object.keys(p.scripts).sort()).toEqual(['build', 'test:unit', 'typecheck']);
    expect(p.scripts.build).toMatch(/\bgrillhouse construire\b.*crates\/journal/);
    expect(p.scripts['test:unit']).toMatch(/\bgrillhouse tests\b.*crates\/journal/);
    expect(p.scripts.typecheck).toMatch(/\bgrillhouse typer\b.*crates\/journal/);
  });

  it('un projet Python : son package.json, ses trois scripts sur son dossier', () => {
    const racine = projet();
    const plan = planDuPaquet(racine, 'outils');
    ecrireLePaquet(racine, plan);
    const p = json(racine, 'outils/package.json');
    expect(p.private).toBe(true);
    expect(p.scripts.build).toMatch(/\bgrillhouse construire\b.*\boutils\b/);
    expect(p.scripts['test:unit']).toMatch(/\bgrillhouse tests\b.*\boutils\b/);
    expect(p.scripts.typecheck).toMatch(/\bgrillhouse typer\b.*\boutils\b/);
  });

  it('un paquet TypeScript garde le package.json que le cadre écrit : ni construire ni typer du module', () => {
    const racine = projet();
    ecrireLePaquet(racine, planDuPaquet(racine, 'packages/interface'));
    const p = json(racine, 'packages/interface/package.json');
    expect(p.scripts['test:unit']).toBe('vitest run');
    expect(JSON.stringify(p.scripts)).not.toMatch(/construire/);
  });

  it('chaque script, joué par npm dans le dossier du paquet, appelle la commande du module sur le chemin, depuis la racine', () => {
    const racine = projet();
    const faux = mkdtempSync(path.join(ESSAIS, 'faux-'));
    const sortie = path.join(faux, 'appels.jsonl');
    ecrire(
      faux,
      'grillhouse',
      `#!/usr/bin/env node\nrequire('node:fs').appendFileSync(${JSON.stringify(sortie)}, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }) + '\\n');\n`
    );
    chmodSync(path.join(faux, 'grillhouse'), 0o755);
    for (const [chemin, ...commandes] of [
      ['crates/journal', 'construire', 'tests', 'typer'],
      ['outils', 'construire', 'tests', 'typer'],
    ] as const) {
      ecrireLePaquet(racine, planDuPaquet(racine, chemin));
      writeFileSync(sortie, '');
      for (const script of ['build', 'test:unit', 'typecheck']) {
        const r = spawnSync('npm', ['run', '--silent', script], {
          cwd: path.join(racine, chemin),
          encoding: 'utf8',
          env: { ...process.env, PATH: `${faux}${path.delimiter}${process.env.PATH ?? ''}` },
        });
        expect(r.status, `${chemin} ${script} : ${r.stderr}`).toBe(0);
      }
      const appels = readFileSync(sortie, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(l => JSON.parse(l) as { cwd: string; args: string[] });
      expect(
        appels.map(a => a.args),
        chemin
      ).toEqual(commandes.map(c => [c, chemin]));
      for (const a of appels) {
        expect(realpathSync(a.cwd)).toBe(realpathSync(racine));
      }
    }
  });

  it('le crate entre aux workspaces de la racine, et paquets() le retient avec le nom du crate', () => {
    const racine = projet();
    ecrireLePaquet(racine, planDuPaquet(racine, 'crates/journal'));
    expect(json(racine, 'package.json').workspaces).toEqual(['crates/journal']);
    expect(entrees(racine).map(p => [p.dossier, p.pkg.name])).toEqual([
      ['crates/journal', 'journal'],
    ]);
  });

  it('un second paquet de langage différent s’ajoute aux workspaces, le premier gardé', () => {
    const racine = projet();
    ecrireLePaquet(racine, planDuPaquet(racine, 'crates/journal'));
    ecrireLePaquet(racine, planDuPaquet(racine, 'outils'));
    expect(json(racine, 'package.json').workspaces).toEqual(['crates/journal', 'outils']);
    expect(entrees(racine).map(p => p.dossier)).toEqual(['crates/journal', 'outils']);
  });
});

describe('grillhouse-44b.4, critère 8 — l’entrée aux workspaces', () => {
  it('un chemin qu’aucun motif ne sélectionne reçoit son chemin, les motifs de la racine gardés', () => {
    const racine = projet({ workspaces: ['packages/*'] });
    ecrireLePaquet(racine, planDuPaquet(racine, 'crates/journal'));
    expect(json(racine, 'package.json').workspaces).toEqual(['packages/*', 'crates/journal']);
  });

  it('un chemin qu’un motif `!` exclut est remis après ce motif, et paquets() le retient', () => {
    const racine = projet({ workspaces: ['crates/*', '!crates/journal'] });
    ecrireLePaquet(racine, planDuPaquet(racine, 'crates/journal'));
    const ws = json(racine, 'package.json').workspaces as string[];
    expect(ws.indexOf('crates/journal')).toBeGreaterThan(ws.indexOf('!crates/journal'));
    expect(ws.slice(0, 2)).toEqual(['crates/*', '!crates/journal']);
    expect(entrees(racine).map(p => p.dossier)).toEqual(['crates/journal']);
  });

  it('la forme { packages: […] } des workspaces reste la sienne', () => {
    const racine = projet({ workspaces: { packages: ['packages/*'] } });
    ecrireLePaquet(racine, planDuPaquet(racine, 'outils'));
    expect(json(racine, 'package.json').workspaces).toEqual({ packages: ['packages/*', 'outils'] });
  });

  it('un chemin que paquets() sélectionne déjà ne réécrit pas la racine, octet pour octet', () => {
    const racine = projet({ workspaces: ['crates/*'] });
    const avant = lire(racine, 'package.json');
    ecrireLePaquet(racine, planDuPaquet(racine, 'crates/journal'));
    expect(lire(racine, 'package.json')).toBe(avant);
    expect(entrees(racine).map(p => p.dossier)).toEqual(['crates/journal']);
  });

  it('un chemin qu’un motif sélectionne par son dossier en `**` ne le réécrit pas non plus', () => {
    const racine = projet({ workspaces: ['**/journal'] });
    const avant = lire(racine, 'package.json');
    ecrireLePaquet(racine, planDuPaquet(racine, 'crates/journal'));
    expect(lire(racine, 'package.json')).toBe(avant);
  });
});

describe('grillhouse-44b.4, critère 9 — le nom du paquet npm est celui du manifeste', () => {
  it('un projet Python porte le `name` de son pyproject.toml, tel que la commande l’écrit', () => {
    const racine = projet();
    const plan = planDuPaquet(racine, 'outils');
    const nom = (
      parse(plan.fichiers['outils/pyproject.toml'] as string) as { project: { name: string } }
    ).project.name;
    ecrireLePaquet(racine, plan);
    expect(json(racine, 'outils/package.json').name).toBe(nom);
  });

  it('un package.json présent au bon nom n’est jamais réécrit, ses champs gardés', () => {
    const racine = projet();
    const present = `${JSON.stringify({ name: 'journal', private: true, description: 'à moi' })}\n`;
    ecrire(racine, 'crates/journal/package.json', present);
    const plan = planDuPaquet(racine, 'crates/journal');
    ecrireLePaquet(racine, plan);
    expect(lire(racine, 'crates/journal/package.json')).toBe(present);
    expect(json(racine, 'package.json').workspaces).toEqual(['crates/journal']);
  });

  it('un package.json dont le nom diffère est refusé, son fichier et les deux noms nommés, rien écrit', () => {
    const racine = projet();
    ecrire(racine, 'crates/journal/package.json', '{"name":"autre","private":true}\n');
    const avant = tous(racine);
    expect(() => planDuPaquet(racine, 'crates/journal')).toThrow(Refus);
    expect(() => planDuPaquet(racine, 'crates/journal')).toThrow(
      /crates\/journal\/package\.json.*autre.*journal/s
    );
    expect(tous(racine)).toEqual(avant);
  });

  it('un package.json de Python dont le nom diffère du pyproject.toml est refusé de même', () => {
    const racine = projet();
    ecrire(racine, 'outils/package.json', '{"name":"fantaisie","private":true}\n');
    expect(() => planDuPaquet(racine, 'outils')).toThrow(/outils\/package\.json.*fantaisie/s);
  });

  it('un package.json au bon nom qu’un autre paquet des workspaces porte déjà est refusé, l’autre nommé', () => {
    const racine = projet({ workspaces: ['packages/*'] });
    ecrire(racine, 'packages/ancien/package.json', '{"name":"journal"}\n');
    ecrire(racine, 'crates/journal/package.json', '{"name":"journal","private":true}\n');
    expect(() => planDuPaquet(racine, 'crates/journal')).toThrow(Refus);
    expect(() => planDuPaquet(racine, 'crates/journal')).toThrow(/journal.*packages\/ancien/s);
  });
});
