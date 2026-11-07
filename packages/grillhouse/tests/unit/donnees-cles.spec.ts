// grillhouse-3dr.5 — les données d'un paquet (`grillhouse.donnees` du package.json du consommateur,
// `{ "<VARIABLE>": "<paquet>#<sortie>" }`), comme les `data` de Bazel : un paquet déclare la sortie
// d'un autre paquet que ses tests lancent, le fournisseur est en `devDependencies` du consommateur,
// et la variable porte le chemin absolu de la sortie construite, passé aux tests comme
// `grillhouse.outils` (scripts/outils-cles.mjs). Lu par scripts/donnees-cles.mjs : `donneesDe(dir)`
// (`{ VARIABLE: chemin }`, refus nommés, rien n'existe encore), `controlerLesDonnees(donnees)`
// (après la construction), `avecLesDonnees(donnees, env)`.
//
// - Critère 1 : la déclaration est lue (fournisseur en devDependencies, variable dans donnees).
// - Critère 2 : `npm test`, `npm run verifier` et le circuit passent la variable aux tests
//   (`environnementDe('verifier')`, `environnementDeLaPasse`) ; la construction du fournisseur avant
//   les tests est celle de Turborepo (turbo-des-paquets.donnees.spec.ts).
// - Critère 3 : la variable porte le chemin absolu, résolu depuis `cargo metadata` (dossier des
//   cibles, profil, binaire).
// - Critère 4 : paquet inconnu, sortie que le fournisseur ne produit pas, forme fautive, fournisseur
//   absent des devDependencies, fournisseur qui n'est pas un crate : refusés par leur nom.
// - Critère 6 (initial) : la sortie est un binaire (`bin`) d'un crate.
// - Critère 7 (initial) : profil `release` quand le script `build` du fournisseur porte `--release` ;
//   un binaire absent après la construction est refusé en nommant la variable et le chemin.
// Le cargo des essais est un faux, qui rend le JSON d'un fichier du dépôt d'essai : ces tests
// jouent sans cargo.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { donneesAuLancement, ARRETS } from '../../scripts/circuit.mjs';
import { environnementDeLaPasse } from '../../scripts/activites.mjs';
import { environnementDe } from '../../scripts/sous-commandes.mjs';

// Le module se charge à la demande de chaque test : son absence rougit chaque test, pas le fichier.
const charger = async () =>
  (await import('../../scripts/donnees-cles.mjs')) as {
    donneesDe: (dir: string) => Record<string, string>;
    controlerLesDonnees: (d: Record<string, string>) => void;
    donneesDuPaquet: (dir: string, chemin: string) => Record<string, string>;
    avecLesDonnees: (
      d: Record<string, string>,
      env: Record<string, string | undefined>
    ) => Record<string, string | undefined>;
  };
const { donneesDe, controlerLesDonnees, donneesDuPaquet, avecLesDonnees } = await charger().catch(
  e => {
    const absent = () => {
      throw e;
    };
    return {
      donneesDe: absent,
      controlerLesDonnees: absent,
      donneesDuPaquet: absent,
      avecLesDonnees: absent,
    } as Awaited<ReturnType<typeof charger>>;
  }
);

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'donnees-cles-'));
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
| outils | P | les commandes | python |
| \`packages/web\` | P | le site | typescript |
`;

type Options = {
  donnees?: unknown;
  devDependencies?: Record<string, string>;
  build?: string;
  cibles?: { kind: string[]; name: string }[];
  cible?: string;
};

// Un projet d'essai : le crate `service` (binaire `synthhub`, lib `service`), le paquet Python
// `outils` qui le lance, le paquet TypeScript `web`. Rend sa racine.
function projet(o: Options = {}): string {
  const r = mkdtempSync(path.join(ESSAIS, 'p-'));
  ecrire(
    r,
    'package.json',
    json({ name: 'essai', private: true, workspaces: ['crates/*', 'outils', 'packages/*'] })
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
      scripts: { build: o.build ?? 'grillhouse construire crates/service' },
    })
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
  ecrire(r, 'outils/pyproject.toml', '[project]\nname = "outils"\nversion = "0.1.0"\n');
  ecrire(
    r,
    'packages/web/package.json',
    json({ name: 'web', scripts: { build: 'tsc -p tsconfig.build.json' } })
  );
  const cibles = o.cibles ?? [
    { kind: ['bin'], name: 'synthhub' },
    { kind: ['lib'], name: 'service' },
  ];
  ecrire(
    r,
    '.metadata.json',
    json({
      workspace_root: r,
      target_directory: o.cible ?? path.join(r, 'cible'),
      workspace_members: ['service 0.1.0 (path+file://x)'],
      packages: [
        {
          id: 'service 0.1.0 (path+file://x)',
          name: 'service',
          manifest_path: path.join(r, 'crates/service/Cargo.toml'),
          dependencies: [],
          targets: cibles.map(c => ({
            ...c,
            src_path: path.join(r, 'crates/service/src/main.rs'),
          })),
        },
      ],
    })
  );
  return r;
}

const refus = (r: string): string => {
  try {
    donneesDe(r);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('aucun refus');
};

describe('grillhouse-3dr.5, critères 1 et 3 — la variable porte le chemin absolu de la sortie construite', () => {
  it('un binaire de crate : dossier des cibles de cargo metadata, profil debug, nom du binaire', () => {
    const r = projet();
    expect(donneesDe(r)).toEqual({ SYNTHHUB_BIN: path.join(r, 'cible/debug/synthhub') });
  });

  it('le dossier des cibles est celui que cargo rapporte, quel qu’il soit', () => {
    const r = projet({ cible: '/ailleurs/cibles' });
    expect(donneesDe(r)).toEqual({ SYNTHHUB_BIN: '/ailleurs/cibles/debug/synthhub' });
  });

  it('un autre binaire du même crate donne son propre chemin', () => {
    const r = projet({
      donnees: { SYNTHHUB_BIN: 'service#synthhub', AUTRE_BIN: 'service#outil' },
      cibles: [
        { kind: ['bin'], name: 'synthhub' },
        { kind: ['bin'], name: 'outil' },
      ],
    });
    expect(donneesDe(r)).toEqual({
      SYNTHHUB_BIN: path.join(r, 'cible/debug/synthhub'),
      AUTRE_BIN: path.join(r, 'cible/debug/outil'),
    });
  });

  it('un projet sans grillhouse.donnees n’a aucune donnée', () => {
    const r = projet();
    ecrire(r, 'outils/package.json', json({ name: 'outils', private: true }));
    expect(donneesDe(r)).toEqual({});
  });

  it('la variable gagne sur l’environnement du lanceur', () => {
    expect(avecLesDonnees({ X_BIN: '/a/b' }, { PATH: '/bin', X_BIN: '/ailleurs' })).toEqual({
      PATH: '/bin',
      X_BIN: '/a/b',
    });
    expect(avecLesDonnees({}, { PATH: '/bin' })).toEqual({ PATH: '/bin' });
  });
});

describe('grillhouse-3dr.5, critère 7 — le profil suit le script build du fournisseur', () => {
  it('--release dans le script build : le binaire est sous release', () => {
    const r = projet({ build: 'grillhouse construire crates/service --release' });
    expect(donneesDe(r)).toEqual({ SYNTHHUB_BIN: path.join(r, 'cible/release/synthhub') });
  });

  it('--release placé avant le chemin ou dans une commande composée : release aussi', () => {
    const r = projet({ build: 'grillhouse construire --release crates/service && echo fait' });
    expect(donneesDe(r).SYNTHHUB_BIN).toBe(path.join(r, 'cible/release/synthhub'));
  });

  it('sans --release : debug', () => {
    const r = projet({ build: 'grillhouse construire crates/service --locked' });
    expect(donneesDe(r).SYNTHHUB_BIN).toBe(path.join(r, 'cible/debug/synthhub'));
  });

  it('après la construction, un binaire absent est refusé en nommant la variable et le chemin', () => {
    const dir = mkdtempSync(path.join(ESSAIS, 'bin-'));
    const absent = path.join(dir, 'debug/synthhub');
    expect(() => controlerLesDonnees({ SYNTHHUB_BIN: absent })).toThrow(
      new RegExp(`SYNTHHUB_BIN[\\s\\S]*${absent}|${absent}[\\s\\S]*SYNTHHUB_BIN`)
    );
  });

  it('un binaire présent passe le contrôle', () => {
    const dir = mkdtempSync(path.join(ESSAIS, 'bin-'));
    ecrire(dir, 'debug/synthhub', '');
    expect(() =>
      controlerLesDonnees({ SYNTHHUB_BIN: path.join(dir, 'debug/synthhub') })
    ).not.toThrow();
  });
});

describe('grillhouse-3dr.5, critère 4 — une déclaration fautive est refusée par son nom', () => {
  it('un paquet inconnu : la clé, la variable et le paquet sont nommés', () => {
    const m = refus(projet({ donnees: { SYNTHHUB_BIN: 'fantome#synthhub' } }));
    expect(m).toContain('grillhouse.donnees.SYNTHHUB_BIN');
    expect(m).toContain('fantome');
  });

  it('une sortie que le fournisseur ne produit pas : la sortie est nommée', () => {
    const m = refus(projet({ donnees: { SYNTHHUB_BIN: 'service#absent' } }));
    expect(m).toContain('grillhouse.donnees.SYNTHHUB_BIN');
    expect(m).toContain('absent');
  });

  it('une cible qui n’est pas un binaire (la lib du crate) n’est pas une sortie', () => {
    const m = refus(projet({ donnees: { SYNTHHUB_BIN: 'service#service' } }));
    expect(m).toContain('grillhouse.donnees.SYNTHHUB_BIN');
    expect(m).toContain('service');
  });

  it('un fournisseur qui n’est pas un crate : « sortie non prise en charge pour <langage> »', () => {
    const m = refus(projet({ donnees: { WEB_BIN: 'web#site' }, devDependencies: { web: '*' } }));
    expect(m).toContain('grillhouse.donnees.WEB_BIN');
    expect(m).toContain('sortie non prise en charge pour typescript');
  });

  it('une valeur sans « # » : la forme <paquet>#<sortie> est exigée', () => {
    const m = refus(projet({ donnees: { SYNTHHUB_BIN: 'service' } }));
    expect(m).toContain('grillhouse.donnees.SYNTHHUB_BIN');
    expect(m).toContain('<paquet>#<sortie>');
  });

  it('une valeur à deux « # » ou à moitié vide est refusée de même', () => {
    for (const v of ['a#b#c', '#synthhub', 'service#', 3]) {
      const m = refus(projet({ donnees: { SYNTHHUB_BIN: v } }));
      expect(m, String(v)).toContain('grillhouse.donnees.SYNTHHUB_BIN');
    }
  });

  it('un fournisseur absent des devDependencies du consommateur : la clé et devDependencies', () => {
    const m = refus(projet({ devDependencies: {} }));
    expect(m).toContain('grillhouse.donnees.SYNTHHUB_BIN');
    expect(m).toContain('devDependencies');
    expect(m).toContain('service');
  });

  it('une clé qui n’est pas un objet, ou un nom qui n’est pas une variable', () => {
    expect(refus(projet({ donnees: ['service#synthhub'] }))).toContain('grillhouse.donnees');
    expect(refus(projet({ donnees: { 'X-BIN': 'service#synthhub' } }))).toContain('X-BIN');
  });

  it('chaque faute est nommée, une par ligne', () => {
    const m = refus(
      projet({ donnees: { A_BIN: 'fantome#x', B_BIN: 'service#absent' }, devDependencies: {} })
    );
    expect(m).toContain('A_BIN');
    expect(m).toContain('B_BIN');
  });
});

describe('grillhouse-3dr.5, critère 2 — npm test : les variables du paquet que les tests lancent', () => {
  it('un paquet nommé reçoit les variables qu’il déclare, un autre paquet aucune', () => {
    const r = projet();
    expect(donneesDuPaquet(r, 'outils')).toEqual({
      SYNTHHUB_BIN: path.join(r, 'cible/debug/synthhub'),
    });
    expect(donneesDuPaquet(r, 'packages/web')).toEqual({});
  });

  it('un fichier dans le paquet reçoit les variables du paquet', () => {
    const r = projet();
    expect(donneesDuPaquet(r, 'outils/tests/test_librarian_tools.py')).toEqual({
      SYNTHHUB_BIN: path.join(r, 'cible/debug/synthhub'),
    });
    expect(donneesDuPaquet(r, 'packages/web/tests/a.spec.ts')).toEqual({});
  });

  it('le binaire absent n’est pas refusé à la lecture : il n’est contrôlé qu’après la construction', () => {
    const r = projet();
    const donnees = donneesDuPaquet(r, 'outils');
    expect(() => controlerLesDonnees(donnees)).toThrow(/SYNTHHUB_BIN/);
  });

  it('une déclaration fautive est refusée à la lecture, avec sa clé', () => {
    const r = projet({ donnees: { SYNTHHUB_BIN: 'fantome#synthhub' } });
    expect(() => donneesDuPaquet(r, 'outils')).toThrow(/grillhouse\.donnees\.SYNTHHUB_BIN/);
  });
});

describe('grillhouse-3dr.5, critère 2 — les passes jouent avec les variables des données', () => {
  it('la vérification : environnementDe(verifier) porte la variable, quoi que tienne le lanceur', () => {
    const r = projet();
    const env = environnementDe('verifier', r, { PATH: '/bin', SYNTHHUB_BIN: '/ailleurs' });
    expect(env.SYNTHHUB_BIN).toBe(path.join(r, 'cible/debug/synthhub'));
    expect(env.PATH).toBe('/bin');
  });

  it('la vérification refuse une déclaration fautive avant tout travail', () => {
    const r = projet({ donnees: { SYNTHHUB_BIN: 'fantome#synthhub' } });
    expect(() => environnementDe('verifier', r, {})).toThrow(/grillhouse\.donnees\.SYNTHHUB_BIN/);
  });

  it('une autre sous-commande garde l’environnement du lanceur', () => {
    const r = projet();
    expect(environnementDe('tests', r, { PATH: '/bin' })).toEqual({ PATH: '/bin' });
  });

  it('le circuit : l’environnement d’une passe porte les données du contexte', () => {
    const ctx = { outils: { X_OUTIL: '/o' }, donnees: { SYNTHHUB_BIN: '/c/debug/synthhub' } };
    expect(
      environnementDeLaPasse(ctx, { PATH: '/bin', SYNTHHUB_BIN: '/ailleurs' }, { R: '1' })
    ).toEqual({ PATH: '/bin', X_OUTIL: '/o', SYNTHHUB_BIN: '/c/debug/synthhub', R: '1' });
    expect(environnementDeLaPasse({ outils: {} }, { PATH: '/bin' })).toEqual({ PATH: '/bin' });
  });

  it('le lancement du circuit lit les données ; une déclaration fautive est l’arrêt « lancement »', () => {
    const r = projet();
    expect(donneesAuLancement(r)).toEqual({
      donnees: { SYNTHHUB_BIN: path.join(r, 'cible/debug/synthhub') },
    });
    const { arret, donnees } = donneesAuLancement(
      projet({ donnees: { SYNTHHUB_BIN: 'fantome#synthhub' } })
    );
    expect(donnees).toBeUndefined();
    expect(arret).toMatchObject({ code: ARRETS.lancement, nom: 'lancement' });
    for (const t of [arret?.rapport, arret?.piece, arret?.question]) {
      expect(t).toContain('grillhouse.donnees.SYNTHHUB_BIN');
    }
  });
});

// Le lanceur (bin/grillhouse.mjs, non exporté) se joue par son processus, dans le projet d'essai ;
// `npx` y est un faux qui note ses arguments et ne construit rien.
const LANCEUR = path.resolve(__dirname, '../../bin/grillhouse.mjs');

const donneesCles = () =>
  import('../../scripts/donnees-cles.mjs') as unknown as Promise<{
    fournisseursDuPaquet: (dir: string, chemin: string) => string[];
    construireLesFournisseurs: (noms: string[]) => void;
  }>;

describe('grillhouse-3dr.5, critère 2 — npm test ciblé construit le fournisseur du paquet', () => {
  it('fournisseursDuPaquet : le paquet nommé, ou un fichier dedans, rend ses fournisseurs ; un autre paquet aucun', async () => {
    const { fournisseursDuPaquet } = await donneesCles();
    const r = projet();
    expect(fournisseursDuPaquet(r, 'outils')).toEqual(['service']);
    expect(fournisseursDuPaquet(r, 'outils/tests/x.py')).toEqual(['service']);
    expect(fournisseursDuPaquet(r, 'packages/web')).toEqual([]);
    expect(fournisseursDuPaquet(r, 'packages/web/tests/a.spec.ts')).toEqual([]);
  });

  it('fournisseursDuPaquet : une déclaration fautive est refusée avec sa clé', async () => {
    const { fournisseursDuPaquet } = await donneesCles();
    const r = projet({ donnees: { SYNTHHUB_BIN: 'fantome#synthhub' } });
    expect(() => fournisseursDuPaquet(r, 'outils')).toThrow(/grillhouse\.donnees\.SYNTHHUB_BIN/);
  });

  it('construireLesFournisseurs : aucun fournisseur, rien à construire', async () => {
    const { construireLesFournisseurs } = await donneesCles();
    expect(() => construireLesFournisseurs([])).not.toThrow();
  });

  it('typescript.construireLesPaquets : sous la construction de Turborepo (TURBO_HASH), rien ne se lance', async () => {
    const mod = (await import('../../scripts/langages/typescript/index.mjs')) as unknown as Record<
      string,
      { construireLesPaquets: (noms: string[]) => void }
    >;
    const langage = mod.typescript ?? mod.default ?? Object.values(mod)[0];
    const bin = path.join(ESSAIS, 'faux-npx');
    mkdirSync(bin, { recursive: true });
    const trace = path.join(bin, 'trace');
    writeFileSync(path.join(bin, 'npx'), `#!/bin/sh\necho "$@" >> "${trace}"\nexit 1\n`);
    chmodSync(path.join(bin, 'npx'), 0o755);
    const avant = { PATH: process.env.PATH, HASH: process.env.TURBO_HASH };
    process.env.PATH = `${bin}${path.delimiter}${avant.PATH ?? ''}`;
    process.env.TURBO_HASH = 'abc';
    try {
      expect(() => langage.construireLesPaquets(['service'])).not.toThrow();
    } finally {
      process.env.PATH = avant.PATH;
      if (avant.HASH === undefined) {
        delete process.env.TURBO_HASH;
      } else {
        process.env.TURBO_HASH = avant.HASH;
      }
    }
    expect(() => readFileSync(trace, 'utf8')).toThrow();
  });

  it('le lanceur construit le fournisseur avant de contrôler la sortie (binaire absent après une construction muette : refus, construction faite)', () => {
    const r = projet();
    const bin = path.join(r, 'faux-npx');
    mkdirSync(bin, { recursive: true });
    const trace = path.join(r, 'trace');
    writeFileSync(path.join(bin, 'npx'), `#!/bin/sh\necho "$@" >> "${trace}"\nexit 0\n`);
    chmodSync(path.join(bin, 'npx'), 0o755);
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` };
    delete env.TURBO_HASH;
    const res = spawnSync('node', [LANCEUR, 'tests', 'outils/tests/x.py'], {
      cwd: r,
      env,
      encoding: 'utf8',
    });
    expect(readFileSync(trace, 'utf8')).toContain('--filter=service');
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('SYNTHHUB_BIN');
  });
});
