// grillhouse-44b.4 — le générateur de turbo.json est sensible au langage que déclare
// docs/ARCHITECTURE.md (rust.mdx § Caching behavior : les entrées d'un crate sont son dossier, son
// verrou et le Cargo.toml racine ; `<paquet>#<tâche>`).
//
// - Critère 2 : entrées de hash d'un crate et d'un projet Python ; `grillhouse.lit` et `traces`
//   valent pour tout paquet.
// - Critère 3 : `turbo run build --dry=json` nomme les crates et les projets Python.
// - Critère 5 et 12 : `grillhouse.outils` entre dans `globalPassThroughEnv`, sans doublon.
// - Critère 6 : sans crate ni projet Python, rien ne change pour un paquet TypeScript.
// - Critère 10 : sans `--ecrire`, le turbo.json d'un crate qui diffère est refusé par son nom.
// - Critère 11 : aucune entrée de tsconfig pour un crate ou un projet Python.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  attendus,
  ecrire,
  horsTypescript,
  verifier,
} from '../../../../scripts/langages/typescript/turbo-des-paquets.mjs';

const DEPOT = path.resolve(__dirname, '../../../../../..');
const TURBO = path.join(DEPOT, 'node_modules/.bin/turbo');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'turbo-langages-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrireFichier = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
type Taches = Record<string, { dependsOn?: string[]; inputs?: string[]; outputs?: string[] }>;
const tachesDe = (racine: string, dossier: string) =>
  (JSON.parse(lire(racine, `${dossier}/turbo.json`).replace(/^\/\/.*\n/, '')) as { tasks: Taches })
    .tasks;

const ARCHITECTURE = `# Architecture

| Composant | Dépôt | Responsabilité | Langage |
|---|---|---|---|
| \`crates/noyau\` | P | le noyau | cargo |
| \`crates/journal\` | P | le journal | cargo |
| \`outils\` | P | les commandes | python |
| \`packages/site\` | P | le site | typescript |
`;
const SCRIPTS_CRATE = {
  build: 'grillhouse construire crates/noyau',
  'test:unit': 'grillhouse tests crates/noyau',
  typecheck: 'grillhouse typer crates/noyau',
};

// Un dépôt de deux crates (`journal` dépend de `noyau`), d'un projet Python et d'un paquet
// TypeScript, dont la racine npm porte <racine>.
function depot({
  racine = {},
  noyau = {},
  ts = true,
}: { racine?: object; noyau?: object; ts?: boolean } = {}): string {
  const r = mkdtempSync(path.join(ESSAIS, 'd-'));
  ecrireFichier(
    r,
    'package.json',
    json({
      name: 'essai',
      private: true,
      workspaces: ['crates/*', 'outils', 'packages/*'],
      packageManager: 'npm@10.9.8',
      ...racine,
    })
  );
  ecrireFichier(r, 'turbo.json', lire(DEPOT, 'templates/turbo/paquets.json'));
  ecrireFichier(r, 'docs/ARCHITECTURE.md', ARCHITECTURE);
  ecrireFichier(r, 'Cargo.toml', '[workspace]\nmembers = ["crates/*"]\nresolver = "2"\n');
  ecrireFichier(r, 'Cargo.lock', 'version = 4\n');
  ecrireFichier(
    r,
    'crates/noyau/package.json',
    json({ name: 'noyau', private: true, scripts: SCRIPTS_CRATE, ...noyau })
  );
  ecrireFichier(r, 'crates/noyau/Cargo.toml', '[package]\nname = "noyau"\nversion = "0.1.0"\n');
  ecrireFichier(
    r,
    'crates/journal/package.json',
    json({
      name: 'journal',
      private: true,
      scripts: { ...SCRIPTS_CRATE, build: 'grillhouse construire crates/journal' },
      dependencies: { noyau: '*' },
    })
  );
  ecrireFichier(
    r,
    'crates/journal/Cargo.toml',
    '[package]\nname = "journal"\nversion = "0.1.0"\n\n[dependencies]\nnoyau = { path = "../noyau" }\n'
  );
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
    })
  );
  ecrireFichier(r, 'outils/pyproject.toml', '[project]\nname = "outils"\nversion = "0.1.0"\n');
  ecrireFichier(r, 'outils/uv.lock', 'version = 1\n');
  if (ts) {
    ecrireFichier(
      r,
      'packages/site/package.json',
      json({
        name: 'site',
        scripts: { build: 'tsc -p tsconfig.build.json', 'test:unit': 'vitest run' },
      })
    );
    ecrireFichier(
      r,
      'packages/site/tsconfig.build.json',
      json({ compilerOptions: { outDir: 'dist' }, include: ['src'] })
    );
    ecrireFichier(r, 'packages/site/src/index.ts', 'export {};\n');
  }
  return r;
}

describe('grillhouse-44b.4, critère 2 — les entrées de hash par langage', () => {
  it('un crate : son dossier, Cargo.lock et le Cargo.toml racine, rien d’autre', () => {
    const r = depot();
    ecrire(r);
    const t = tachesDe(r, 'crates/noyau');
    expect(t.build!.inputs).toEqual([
      '$TURBO_DEFAULT$',
      '$TURBO_ROOT$/Cargo.lock',
      '$TURBO_ROOT$/Cargo.toml',
    ]);
  });

  it('un second crate a les mêmes entrées, sa dépendance interne en dependsOn', () => {
    const r = depot();
    ecrire(r);
    const t = tachesDe(r, 'crates/journal');
    expect(t.build!.inputs).toEqual([
      '$TURBO_DEFAULT$',
      '$TURBO_ROOT$/Cargo.lock',
      '$TURBO_ROOT$/Cargo.toml',
    ]);
    expect(t.build!.dependsOn).toEqual(['noyau#build']);
  });

  it('un projet Python : son dossier, qui tient uv.lock et pyproject.toml', () => {
    const r = depot();
    ecrire(r);
    expect(tachesDe(r, 'outils').build!.inputs).toEqual(['$TURBO_DEFAULT$']);
  });

  it('un projet Python dont le verrou et le manifeste sont à la racine les nomme', () => {
    const r = depot();
    ecrireFichier(r, 'uv.lock', 'version = 1\n');
    ecrireFichier(r, 'pyproject.toml', '[tool.uv.workspace]\nmembers = ["outils"]\n');
    ecrire(r);
    expect(tachesDe(r, 'outils').build!.inputs).toEqual([
      '$TURBO_DEFAULT$',
      '$TURBO_ROOT$/pyproject.toml',
      '$TURBO_ROOT$/uv.lock',
    ]);
  });

  it('`grillhouse.lit` d’un crate donne à son test:unit les données lues, hors de son build', () => {
    const r = depot({ noyau: { grillhouse: { lit: ['donnees/scenes'] } } });
    ecrireFichier(r, 'donnees/scenes/a.json', '{}\n');
    ecrire(r);
    const t = tachesDe(r, 'crates/noyau');
    expect(t['test:unit']!.inputs).toContain('$TURBO_ROOT$/donnees/scenes/**');
    expect(t.build!.inputs).not.toContain('$TURBO_ROOT$/donnees/scenes/**');
  });

  it('`grillhouse.lit` d’un projet Python vaut de même', () => {
    const r = depot();
    ecrireFichier(
      r,
      'outils/package.json',
      json({
        name: 'outils',
        private: true,
        scripts: { build: 'grillhouse construire outils', 'test:unit': 'grillhouse tests outils' },
        grillhouse: { lit: ['donnees/pages'] },
      })
    );
    ecrireFichier(r, 'donnees/pages/a.json', '{}\n');
    ecrire(r);
    expect(tachesDe(r, 'outils')['test:unit']!.inputs).toContain('$TURBO_ROOT$/donnees/pages/**');
  });

  it('`traces` d’un crate : sa tâche de trace, ses sorties, et le test qui la lit l’attend', () => {
    const r = depot({
      noyau: {
        scripts: { ...SCRIPTS_CRATE, 'trace:grammaires': 'node trace.mjs' },
        grillhouse: {
          lit: ['donnees/paires'],
          traces: { 'trace:grammaires': { lit: ['donnees/paires'], ecrit: 'crates/noyau/trace' } },
        },
      },
    });
    ecrireFichier(r, 'donnees/paires/a.json', '{}\n');
    ecrire(r);
    const t = tachesDe(r, 'crates/noyau');
    expect(t['trace:grammaires']!.outputs).toEqual(['trace/**']);
    expect(t['trace:grammaires']!.inputs).toContain('$TURBO_ROOT$/donnees/paires/**');
  });
});

describe('grillhouse-44b.4, critère 11 — aucune entrée de build de TypeScript', () => {
  it('un crate et un projet Python n’ont ni tsconfig ni dossier de sources dans leurs entrées', () => {
    const r = depot();
    ecrireFichier(r, 'crates/noyau/tsconfig.build.json', json({ include: ['src'] }));
    ecrireFichier(r, 'outils/tsconfig.build.json', json({ include: ['src'] }));
    ecrire(r);
    for (const d of ['crates/noyau', 'outils']) {
      const entrees = tachesDe(r, d).build!.inputs!.join(' ');
      expect(entrees, d).not.toMatch(/tsconfig|package\.json|src\/\*\*/);
    }
  });

  it('un dossier de données de `grillhouse.lit` dans le crate reste hors de son build', () => {
    const r = depot({ noyau: { grillhouse: { lit: ['crates/noyau/donnees'] } } });
    ecrireFichier(r, 'crates/noyau/donnees/a.json', '{}\n');
    ecrire(r);
    const t = tachesDe(r, 'crates/noyau');
    expect(t.build!.inputs).toEqual([
      '$TURBO_DEFAULT$',
      '$TURBO_ROOT$/Cargo.lock',
      '$TURBO_ROOT$/Cargo.toml',
      '!donnees/**',
    ]);
  });
});

describe('grillhouse-44b.4, critère 10 — le turbo.json d’un crate se vérifie comme celui de TypeScript', () => {
  it('écrit, il passe ; modifié à la main, il est refusé par son nom', () => {
    const r = depot();
    ecrire(r);
    expect(verifier(r)).toEqual([]);
    ecrireFichier(
      r,
      'crates/noyau/turbo.json',
      lire(r, 'crates/noyau/turbo.json').replace('Cargo.lock', 'autre.lock')
    );
    const refus = verifier(r);
    expect(refus).toHaveLength(1);
    expect(refus[0]).toMatch(/crates\/noyau\/turbo\.json/);
  });

  it('absent, il est refusé de même, pour un projet Python', () => {
    const r = depot();
    ecrire(r);
    rmSync(path.join(r, 'outils/turbo.json'));
    expect(verifier(r).join('\n')).toMatch(/outils\/turbo\.json manque/);
  });

  it('attendus() nomme le turbo.json de chaque crate et de chaque projet Python', () => {
    expect([...attendus(depot()).keys()].sort()).toEqual([
      'crates/journal/turbo.json',
      'crates/noyau/turbo.json',
      'outils/turbo.json',
      'packages/site/turbo.json',
    ]);
  });
});

describe('grillhouse-44b.4, critère 3 — le graphe de Turborepo nomme les crates et les projets Python', () => {
  it('turbo run build --dry=json : journal#build attend noyau#build, outils#build est là', () => {
    const r = depot();
    ecrire(r);
    const t = spawnSync(TURBO, ['run', 'build', '--dry=json', '--cwd', r], {
      encoding: 'utf8',
      env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
    });
    expect(t.status, t.stderr).toBe(0);
    const taches = Object.fromEntries(
      (JSON.parse(t.stdout) as { tasks: { taskId: string; dependencies: string[] }[] }).tasks.map(
        x => [x.taskId, x.dependencies]
      )
    );
    expect(Object.keys(taches).sort()).toEqual([
      'journal#build',
      'noyau#build',
      'outils#build',
      'site#build',
    ]);
    expect(taches['journal#build']).toEqual(['noyau#build']);
  });
});

describe('grillhouse-44b.4, critère 6 — un dépôt sans crate ni projet Python ne change pas', () => {
  it('un paquet TypeScript seul garde ses entrées de build : package.json, tsconfig.build.json, src/**', () => {
    const r = mkdtempSync(path.join(ESSAIS, 'ts-'));
    ecrireFichier(
      r,
      'package.json',
      json({ name: 'essai', private: true, workspaces: ['packages/*'] })
    );
    ecrireFichier(r, 'turbo.json', lire(DEPOT, 'templates/turbo/paquets.json'));
    ecrireFichier(
      r,
      'packages/site/package.json',
      json({ name: 'site', scripts: { build: 'tsc -p tsconfig.build.json' } })
    );
    ecrireFichier(r, 'packages/site/tsconfig.build.json', json({ include: ['src'] }));
    ecrireFichier(r, 'packages/site/src/index.ts', 'export {};\n');
    ecrire(r);
    expect(tachesDe(r, 'packages/site').build!.inputs).toEqual([
      'package.json',
      'src/**',
      'tsconfig.build.json',
    ]);
    const avant = lire(r, 'turbo.json');
    expect(ecrire(r)).toEqual([]);
    expect(lire(r, 'turbo.json')).toBe(avant);
  });

  it('dans un dépôt mixte, le paquet TypeScript garde les mêmes entrées', () => {
    const r = depot();
    ecrire(r);
    expect(tachesDe(r, 'packages/site').build!.inputs).toEqual([
      'package.json',
      'src/**',
      'tsconfig.build.json',
    ]);
  });
});

describe('grillhouse-44b.4, critères 5 et 12 — les outils du projet dans globalPassThroughEnv', () => {
  const OUTILS = { MON_OUTIL: '/usr/bin', AUTRE_OUTIL: '/usr/lib' };
  const passage = (r: string) =>
    (JSON.parse(lire(r, 'turbo.json')) as { globalPassThroughEnv: string[] }).globalPassThroughEnv;

  it('chaque variable de grillhouse.outils est écrite, celles du projet gardées', () => {
    const r = depot({ racine: { grillhouse: { outils: OUTILS } } });
    ecrire(r);
    expect(passage(r)).toEqual([
      'GRILLHOUSE_RESULTATS',
      'GRILLHOUSE_CHANGEMENTS',
      'GRILLHOUSE_AVANCEMENT',
      'TMPDIR',
      'MON_OUTIL',
      'AUTRE_OUTIL',
    ]);
  });

  it('sans la variable, la vérification la refuse par son nom', () => {
    const r = depot({ racine: { grillhouse: { outils: OUTILS } } });
    const refus = verifier(r).filter(l => /globalPassThroughEnv/.test(l));
    expect(refus.join('\n')).toMatch(/MON_OUTIL/);
    expect(refus.join('\n')).toMatch(/AUTRE_OUTIL/);
    ecrire(r);
    expect(verifier(r)).toEqual([]);
  });

  it('une variable déjà présente n’est pas écrite deux fois', () => {
    const r = depot({ racine: { grillhouse: { outils: OUTILS } } });
    const conf = JSON.parse(lire(r, 'turbo.json')) as { globalPassThroughEnv: string[] };
    conf.globalPassThroughEnv.push('MON_OUTIL');
    ecrireFichier(r, 'turbo.json', json(conf));
    ecrire(r);
    expect(passage(r).filter(v => v === 'MON_OUTIL')).toHaveLength(1);
    ecrire(r);
    expect(passage(r).filter(v => v === 'AUTRE_OUTIL')).toHaveLength(1);
  });

  it('un projet sans grillhouse.outils garde son globalPassThroughEnv', () => {
    const r = depot();
    const avant = passage(r);
    ecrire(r);
    expect(passage(r)).toEqual(avant);
    expect(verifier(r)).toEqual([]);
  });
});

describe('grillhouse-44b.4 — projet mixte : un test de crate ne joue qu’une fois', () => {
  it('horsTypescript nomme chaque crate et chaque projet Python, pas le paquet TypeScript', () => {
    const r = depot();
    ecrire(r);
    expect([...horsTypescript(r)].sort()).toEqual([
      '--filter=!journal',
      '--filter=!noyau',
      '--filter=!outils',
    ]);
  });

  it('turbo run test:unit avec ces filtres ne joue que le paquet TypeScript', () => {
    const r = depot();
    ecrire(r);
    const t = spawnSync(
      TURBO,
      ['run', 'test:unit', '--dry=json', '--cwd', r, ...horsTypescript(r)],
      {
        encoding: 'utf8',
        env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' },
      }
    );
    expect(t.status, t.stderr).toBe(0);
    const ids = (JSON.parse(t.stdout) as { tasks: { taskId: string }[] }).tasks.map(x => x.taskId);
    expect(ids.filter(i => i.endsWith('#test:unit'))).toEqual(['site#test:unit']);
  });

  it('sans crate ni projet Python, aucun filtre', () => {
    const r = depot({ ts: true });
    ecrireFichier(
      r,
      'docs/ARCHITECTURE.md',
      ARCHITECTURE.replace(/\| `(crates|outils)[^\n]*\n/g, '')
    );
    expect(horsTypescript(r)).toEqual([]);
  });
});
