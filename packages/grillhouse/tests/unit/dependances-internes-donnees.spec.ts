// La garde des dépendances internes honore `grillhouse.donnees` : le fournisseur qu'un paquet déclare
// comme donnée d'exécution vit dans les `devDependencies` de son package.json (pour l'ordonnancement
// de Turborepo) et jamais dans le manifeste de son langage (uv et pip ne lient pas un crate) ; la
// garde ne le compte donc pas comme dépendance en trop. Les dépendances de même langage restent
// jugées, et une clé fautive fait échouer la garde en nommant ses fautes.
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { constats } from '../../scripts/dependances-internes.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dependances-internes-donnees-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

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

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

const ARCHITECTURE = `# Architecture

| Composant | Dépôt | Responsabilité | Langage |
|---|---|---|---|
| \`crates/service\` | P | le service | cargo |
| \`crates/client\` | P | le client | cargo |
| \`socle\` | P | le socle | python |
| \`outils\` | P | les commandes | python |
| \`packages/web\` | P | le site | typescript |
`;

type Options = {
  sansClient?: boolean;
  devDependencies?: Record<string, string>;
  donnees?: unknown;
  pyproject?: string;
  clientDevDependencies?: Record<string, string>;
  clientDonnees?: unknown;
  webDevDependencies?: Record<string, string>;
  webDonnees?: unknown;
};

// Un projet d'essai : le crate `service` (binaire `synthhub`), un crate `client` et un projet Python
// `outils` qui lancent ce binaire, un projet Python `socle`, un paquet TypeScript `web`. Rend sa
// racine.
function projet(o: Options = {}): string {
  const r = mkdtempSync(path.join(ESSAIS, 'p-'));
  ecrire(
    r,
    'package.json',
    json({
      name: 'essai',
      private: true,
      workspaces: ['crates/*', 'outils', 'socle', 'packages/*'],
    })
  );
  ecrire(r, 'docs/ARCHITECTURE.md', ARCHITECTURE);
  ecrire(r, 'Cargo.toml', '[workspace]\nmembers = ["crates/*"]\nresolver = "2"\n');
  ecrire(
    r,
    'crates/service/Cargo.toml',
    '[package]\nname = "service"\nversion = "0.1.0"\n\n[[bin]]\nname = "synthhub"\npath = "src/main.rs"\n'
  );
  ecrire(r, 'crates/service/src/main.rs', 'fn main() {}\n');
  ecrire(
    r,
    'crates/service/package.json',
    json({
      name: 'service',
      private: true,
      scripts: { build: 'grillhouse construire crates/service' },
    })
  );
  ecrire(r, 'crates/client/Cargo.toml', '[package]\nname = "client"\nversion = "0.1.0"\n');
  ecrire(
    r,
    'crates/client/package.json',
    json({
      name: 'client',
      private: true,
      devDependencies: o.sansClient ? {} : (o.clientDevDependencies ?? { service: '*' }),
      grillhouse: {
        donnees: o.sansClient ? {} : (o.clientDonnees ?? { SYNTHHUB_BIN: 'service#synthhub' }),
      },
    })
  );
  ecrire(r, 'socle/pyproject.toml', '[project]\nname = "socle"\nversion = "0.1.0"\n');
  ecrire(r, 'socle/package.json', json({ name: 'socle', private: true }));
  ecrire(
    r,
    'outils/pyproject.toml',
    o.pyproject ?? '[project]\nname = "outils"\nversion = "0.1.0"\n'
  );
  ecrire(
    r,
    'outils/package.json',
    json({
      name: 'outils',
      private: true,
      devDependencies: o.devDependencies ?? { service: '*' },
      grillhouse: { donnees: o.donnees ?? { SYNTHHUB_BIN: 'service#synthhub' } },
    })
  );
  ecrire(
    r,
    'packages/web/package.json',
    json({
      name: 'web',
      devDependencies: o.webDevDependencies ?? {},
      ...(o.webDonnees === undefined ? {} : { grillhouse: { donnees: o.webDonnees } }),
    })
  );
  ecrire(
    r,
    '.metadata.json',
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
    })
  );
  return r;
}

describe('un fournisseur de grillhouse.donnees n’est pas une dépendance en trop', () => {
  it('un projet Python qui déclare le binaire d’un crate en donnée ne rend aucun constat', () => {
    expect(constats(projet())).toEqual([]);
  });

  it('un crate qui déclare le binaire d’un autre crate en donnée ne rend aucun constat', () => {
    // `client` (crate) et `outils` (Python) consomment `service` : aucun manifeste de langage ne le lie.
    const r = projet({ clientDevDependencies: { service: '*' } });
    expect(constats(r)).toEqual([]);
  });
});

describe('une dépendance de même langage reste jugée', () => {
  it('une dépendance Python absente du pyproject rend son constat, sans le fournisseur de donnée', () => {
    const r = projet({ sansClient: true, devDependencies: { service: '*', socle: '*' } });
    const c = constats(r);
    expect(c).toHaveLength(1);
    expect(c[0].fichier).toBe('outils/package.json');
    expect(c[0].message).toContain('le package.json nomme socle, que pyproject.toml ne lie pas');
    expect(c[0].message).not.toContain('service');
  });

  it('un fournisseur nommé sans être déclaré en donnée reste refusé', () => {
    const r = projet({ sansClient: true, donnees: {}, devDependencies: { service: '*' } });
    const c = constats(r);
    expect(c).toHaveLength(1);
    expect(c[0].message).toContain('le package.json nomme service, que pyproject.toml ne lie pas');
  });

  it('la dépendance manquante au package.json est toujours refusée', () => {
    const r = projet({
      sansClient: true,
      devDependencies: {},
      donnees: {},
      pyproject:
        '[project]\nname = "outils"\nversion = "0.1.0"\ndependencies = ["socle"]\n\n[tool.uv.sources]\nsocle = { path = "../socle" }\n',
    });
    const c = constats(r);
    expect(c).toHaveLength(1);
    expect(c[0].message).toContain('lie socle');
    expect(c[0].message).toContain('que le package.json ne nomme pas');
  });
});

describe('seuls les paquets d’un manifeste autre que le package.json sont jugés', () => {
  it('un paquet TypeScript qui déclare une donnée ne rend aucun constat', () => {
    const r = projet({
      devDependencies: {},
      donnees: {},
      sansClient: true,
      webDevDependencies: { service: '*' },
      webDonnees: { SYNTHHUB_BIN: 'service#synthhub' },
    });
    expect(constats(r)).toEqual([]);
  });
});

describe('une clé grillhouse.donnees fautive fait échouer la garde', () => {
  it('un fournisseur absent des devDependencies est nommé dans l’erreur, non rendu en constat', () => {
    const r = projet({ devDependencies: {} });
    expect(() => constats(r)).toThrow(/grillhouse\.donnees\.SYNTHHUB_BIN/);
    expect(() => constats(r)).toThrow(/absent des devDependencies/);
  });

  it('un paquet inconnu est nommé dans l’erreur', () => {
    const r = projet({ donnees: { SYNTHHUB_BIN: 'fantome#synthhub' } });
    expect(() => constats(r)).toThrow(/grillhouse\.donnees\.SYNTHHUB_BIN.*fantome/);
  });
});
