// grillhouse-44b.4, critères 4 et 13 — la garde des dépendances internes : le package.json d'un
// crate ou d'un projet Python nomme les mêmes paquets internes que son manifeste (Cargo.toml :
// `path = …` ; pyproject.toml : `[tool.uv.sources]`), comme Turborepo lit le graphe du package.json
// (multi-language.mdx:191) quand Cargo lit celui du Cargo.toml. Les dépendances externes ne se
// comparent pas ; un écart se nomme par le paquet et les dépendances, dans un sens comme dans
// l'autre. La garde est l'une de celles du cadre (`scripts/gardes-du-cadre.mjs`).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gardesDuCadre, nomsDesGardes } from '../../scripts/gardes-du-cadre.mjs';

// Le module se charge ici, pour que son absence rougisse chaque test, non le fichier entier.
type Constat = { fichier: string; message: string };
type Garde = { constats: (r: string) => Constat[]; GARDE: string; SCRIPT: string };
const MODULE = '../../scripts/dependances-internes.mjs';
const garde = await (import(/* @vite-ignore */ MODULE) as Promise<Garde>).catch(
  (e: Error): Garde => {
    const absent = (): never => {
      throw e;
    };
    return {
      constats: absent,
      get GARDE(): string {
        return absent();
      },
      get SCRIPT(): string {
        return absent();
      },
    };
  }
);
const constats = (r: string) => garde.constats(r);

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dependances-internes-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const json = (o: unknown) => `${JSON.stringify(o)}\n`;

const ARCHITECTURE = `# Architecture

| Composant | Dépôt | Responsabilité | Langage |
|---|---|---|---|
| \`crates/noyau\` | P | le noyau | cargo |
| \`crates/journal\` | P | le journal | cargo |
| \`outils\` | P | les commandes | python |
| \`socle\` | P | le socle | python |
`;

type Options = {
  cargo?: string;
  pkgJournal?: Record<string, unknown>;
  pyproject?: string;
  pkgOutils?: Record<string, unknown>;
};

// Un dépôt de deux crates (`journal` dépend de `noyau`) et de deux projets Python (`outils`
// dépend de `socle`), chaque manifeste et chaque package.json d'accord, sauf ce que <o> change.
function depot(o: Options = {}): string {
  const r = mkdtempSync(path.join(ESSAIS, 'd-'));
  ecrire(r, 'docs/ARCHITECTURE.md', ARCHITECTURE);
  ecrire(
    r,
    'package.json',
    json({ name: 'essai', private: true, workspaces: ['crates/*', 'outils', 'socle'] })
  );
  ecrire(r, 'Cargo.toml', '[workspace]\nmembers = ["crates/*"]\nresolver = "2"\n');
  ecrire(r, 'crates/noyau/Cargo.toml', '[package]\nname = "noyau"\nversion = "0.1.0"\n');
  ecrire(r, 'crates/noyau/package.json', json({ name: 'noyau', private: true }));
  ecrire(
    r,
    'crates/journal/Cargo.toml',
    o.cargo ??
      '[package]\nname = "journal"\nversion = "0.1.0"\n\n[dependencies]\nnoyau = { path = "../noyau" }\nserde = "1"\n'
  );
  ecrire(
    r,
    'crates/journal/package.json',
    json(
      o.pkgJournal ?? { name: 'journal', private: true, dependencies: { noyau: '*', lodash: '*' } }
    )
  );
  ecrire(r, 'socle/pyproject.toml', '[project]\nname = "socle"\nversion = "0.1.0"\n');
  ecrire(r, 'socle/package.json', json({ name: 'socle', private: true }));
  ecrire(
    r,
    'outils/pyproject.toml',
    o.pyproject ??
      '[project]\nname = "outils"\nversion = "0.1.0"\ndependencies = ["socle", "requests>=2"]\n\n[tool.uv.sources]\nsocle = { path = "../socle" }\n'
  );
  ecrire(
    r,
    'outils/package.json',
    json(o.pkgOutils ?? { name: 'outils', private: true, dependencies: { socle: '*' } })
  );
  return r;
}

describe('grillhouse-44b.4, critère 13 — la garde passe quand tout s’accorde', () => {
  it('crates et projets Python d’accord, dépendances externes de part et d’autre ignorées', () => {
    expect(constats(depot())).toEqual([]);
  });

  it('un crate sans dépendance interne, un package.json sans dépendance : rien', () => {
    const r = depot({
      cargo: '[package]\nname = "journal"\nversion = "0.1.0"\n',
      pkgJournal: { name: 'journal', private: true },
    });
    expect(constats(r)).toEqual([]);
  });

  it('une dépendance de développement en `path` s’accorde avec les devDependencies', () => {
    const r = depot({
      cargo:
        '[package]\nname = "journal"\nversion = "0.1.0"\n\n[dev-dependencies]\nnoyau = { path = "../noyau" }\n',
      pkgJournal: { name: 'journal', private: true, devDependencies: { noyau: '*' } },
    });
    expect(constats(r)).toEqual([]);
  });

  it('une dépendance externe du package.json ou du manifeste ne fait aucun écart', () => {
    const r = depot({
      pkgJournal: {
        name: 'journal',
        private: true,
        dependencies: { noyau: '*', express: '*', serde_json: '*' },
      },
    });
    expect(constats(r)).toEqual([]);
  });
});

describe('grillhouse-44b.4, critères 4 et 13 — un écart se nomme, dans un sens comme dans l’autre', () => {
  it('Cargo.toml en `path` que le package.json ne nomme pas : le crate et la dépendance nommés', () => {
    const r = depot({
      pkgJournal: { name: 'journal', private: true, dependencies: { lodash: '*' } },
    });
    const c = constats(r);
    expect(c).toHaveLength(1);
    expect(c[0].fichier).toBe('crates/journal/package.json');
    expect(c[0].message).toMatch(/journal/);
    expect(c[0].message).toMatch(/noyau/);
    expect(c[0].message).toMatch(/Cargo\.toml/);
  });

  it('package.json qui nomme un paquet interne que le Cargo.toml ne lie pas : de même', () => {
    const r = depot({
      cargo: '[package]\nname = "journal"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1"\n',
    });
    const c = constats(r);
    expect(c).toHaveLength(1);
    expect(c[0].message).toMatch(/journal/);
    expect(c[0].message).toMatch(/noyau/);
  });

  it('projet Python : [tool.uv.sources] que le package.json ne nomme pas', () => {
    const r = depot({ pkgOutils: { name: 'outils', private: true } });
    const c = constats(r);
    expect(c).toHaveLength(1);
    expect(c[0].fichier).toBe('outils/package.json');
    expect(c[0].message).toMatch(/outils/);
    expect(c[0].message).toMatch(/socle/);
    expect(c[0].message).toMatch(/pyproject\.toml/);
  });

  it('projet Python : package.json qui nomme un paquet interne que pyproject.toml ne lie pas', () => {
    const r = depot({
      pyproject: '[project]\nname = "outils"\nversion = "0.1.0"\ndependencies = ["requests"]\n',
    });
    const c = constats(r);
    expect(c).toHaveLength(1);
    expect(c[0].message).toMatch(/outils.*socle|socle.*outils/s);
  });

  it('plusieurs dépendances en écart sont toutes nommées, un constat par paquet', () => {
    const r = depot({
      cargo:
        '[package]\nname = "journal"\nversion = "0.1.0"\n\n[dependencies]\nnoyau = { path = "../noyau" }\nsocle = { path = "../../socle" }\n',
      pkgJournal: { name: 'journal', private: true },
    });
    const c = constats(r);
    expect(c).toHaveLength(1);
    expect(c[0].message).toMatch(/noyau/);
    expect(c[0].message).toMatch(/socle/);
  });
});

describe('grillhouse-44b.4, critère 4 — la garde est l’une des gardes du cadre', () => {
  it('son nom est celui de son script, et gardesDuCadre la joue', () => {
    expect(garde.GARDE).toBe('dependances-internes');
    expect(nomsDesGardes(depot())).toContain('dependances-internes');
    expect(gardesDuCadre(depot()).map(g => g[0])).toContain(garde.SCRIPT);
  });

  it('ne rend aucun constat sur un dépôt d’accord, un seul qui nomme l’écart', () => {
    expect(constats(depot())).toEqual([]);
    const c = constats(depot({ pkgOutils: { name: 'outils', private: true } }));
    expect(c).toHaveLength(1);
    expect(c[0].message).toMatch(/outils.*socle|socle.*outils/s);
  });
});
