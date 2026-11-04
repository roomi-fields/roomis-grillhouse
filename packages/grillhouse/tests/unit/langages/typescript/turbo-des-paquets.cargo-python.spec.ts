// grillhouse-44b.5, critères 2, 6 et 8 — le cache des tâches de Turborepo fait la sélection pour un
// crate et un projet Python, comme pour un paquet TypeScript (turbo.dev, « Caching » : une tâche
// dont aucune entrée n'a bougé est relue du cache) : le hash de `test:unit` d'un crate suit ses
// sources et celles de ses fournisseurs, et la variable des chemins nommés (`GRILLHOUSE_TESTS`,
// `VARIABLE` de vitest-config/cibles.mjs) y entre. Turborepo est le vrai, en `--dry=json`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ecrire } from '../../../../scripts/langages/typescript/turbo-des-paquets.mjs';

const DEPOT = path.resolve(__dirname, '../../../../../..');
const TURBO = path.join(DEPOT, 'node_modules/.bin/turbo');
const VARIABLE = 'GRILLHOUSE_TESTS';
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'turbo-cargo-python-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const fichier = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

const ARCHITECTURE = `# Architecture

| Composant | Dépôt | Responsabilité | Langage |
|---|---|---|---|
| \`crates/noyau\` | P | le noyau | cargo |
| \`crates/journal\` | P | le journal | cargo |
| \`crates/seul\` | P | un crate sans lien | cargo |
| \`outils\` | P | les commandes | python |
`;

// Trois crates (`journal` dépend de `noyau`, `seul` de personne) et un projet Python, dont le
// `test:unit` appelle la commande du corps de la tâche (critère 7).
function depot(): string {
  const r = mkdtempSync(path.join(ESSAIS, 'd-'));
  fichier(
    r,
    'package.json',
    json({
      name: 'essai',
      private: true,
      workspaces: ['crates/*', 'outils'],
      packageManager: 'npm@10.9.8',
    })
  );
  fichier(r, 'turbo.json', readFileSync(path.join(DEPOT, 'templates/turbo/paquets.json'), 'utf8'));
  fichier(r, 'docs/ARCHITECTURE.md', ARCHITECTURE);
  fichier(r, 'Cargo.toml', '[workspace]\nmembers = ["crates/*"]\nresolver = "2"\n');
  fichier(r, 'Cargo.lock', 'version = 4\n');
  for (const [nom, dependances] of [
    ['noyau', {}],
    ['journal', { noyau: '*' }],
    ['seul', {}],
  ] as const) {
    fichier(
      r,
      `crates/${nom}/package.json`,
      json({
        name: nom,
        private: true,
        scripts: {
          build: `grillhouse construire crates/${nom}`,
          'test:unit': `grillhouse tests-du-paquet crates/${nom}`,
          typecheck: `grillhouse typer crates/${nom}`,
        },
        dependencies: dependances,
      })
    );
    fichier(r, `crates/${nom}/Cargo.toml`, `[package]\nname = "${nom}"\nversion = "0.1.0"\n`);
    fichier(r, `crates/${nom}/src/lib.rs`, 'pub fn un() {}\n');
  }
  fichier(
    r,
    'outils/package.json',
    json({
      name: 'outils',
      private: true,
      scripts: {
        build: 'grillhouse construire outils',
        'test:unit': 'grillhouse tests-du-paquet outils',
        typecheck: 'grillhouse typer outils',
      },
    })
  );
  fichier(r, 'outils/pyproject.toml', '[project]\nname = "outils"\nversion = "0.1.0"\n');
  fichier(r, 'outils/uv.lock', 'version = 1\n');
  fichier(r, 'outils/test_x.py', 'def test_x():\n    assert True\n');
  ecrire(r);
  return r;
}

type Tache = { taskId: string; hash: string };
function hashes(r: string, env: Record<string, string> = {}): Record<string, string> {
  const t = spawnSync(TURBO, ['run', 'test:unit', '--dry=json', '--cwd', r], {
    encoding: 'utf8',
    env: { ...process.env, TURBO_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', ...env },
  });
  expect(t.status, t.stderr).toBe(0);
  return Object.fromEntries(
    (JSON.parse(t.stdout) as { tasks: Tache[] }).tasks.map(x => [x.taskId, x.hash])
  );
}

describe('grillhouse-44b.5, critère 2 — un lot qui change un crate ne rejoue que lui et ses dépendants', () => {
  it('une source de `noyau` change le hash de noyau#test:unit et de journal#test:unit, qui en dépend', () => {
    const r = depot();
    const avant = hashes(r);
    fichier(r, 'crates/noyau/src/lib.rs', 'pub fn deux() {}\n');
    const apres = hashes(r);
    expect(apres['noyau#test:unit']).not.toBe(avant['noyau#test:unit']);
    expect(apres['journal#test:unit']).not.toBe(avant['journal#test:unit']);
  });

  it('le crate qui n’en dépend pas et le projet Python gardent leur hash : relus du cache', () => {
    const r = depot();
    const avant = hashes(r);
    fichier(r, 'crates/noyau/src/lib.rs', 'pub fn deux() {}\n');
    const apres = hashes(r);
    expect(apres['seul#test:unit']).toBe(avant['seul#test:unit']);
    expect(apres['outils#test:unit']).toBe(avant['outils#test:unit']);
  });

  it('une source du projet Python ne change que son hash', () => {
    const r = depot();
    const avant = hashes(r);
    fichier(r, 'outils/test_x.py', 'def test_x():\n    assert 1 == 1\n');
    const apres = hashes(r);
    expect(apres['outils#test:unit']).not.toBe(avant['outils#test:unit']);
    for (const c of ['noyau', 'journal', 'seul']) {
      expect(apres[`${c}#test:unit`], c).toBe(avant[`${c}#test:unit`]);
    }
  });
});

describe('grillhouse-44b.5, critère 6 — les chemins nommés entrent dans le hash de la tâche', () => {
  it('le même chemin donne le même hash : un lancement par chemin d’un crate inchangé est relu du cache', () => {
    const r = depot();
    const chemins = JSON.stringify({ arguments: [path.join(r, 'crates/seul/tests/a.rs')] });
    expect(hashes(r, { [VARIABLE]: chemins })['seul#test:unit']).toBe(
      hashes(r, { [VARIABLE]: chemins })['seul#test:unit']
    );
  });

  it('un autre chemin change le hash de la tâche d’un crate, d’un projet Python', () => {
    const r = depot();
    const a = hashes(r, {
      [VARIABLE]: JSON.stringify({ arguments: [path.join(r, 'crates/seul/tests/a.rs')] }),
    });
    const b = hashes(r, {
      [VARIABLE]: JSON.stringify({ arguments: [path.join(r, 'crates/seul/tests/b.rs')] }),
    });
    const sans = hashes(r);
    for (const t of ['seul#test:unit', 'noyau#test:unit', 'outils#test:unit']) {
      expect(a[t], t).not.toBe(b[t]);
      expect(a[t], t).not.toBe(sans[t]);
    }
  });
});

describe('grillhouse-44b.5, critère 8 — le moment d’un rejeu change le hash de chaque tâche', () => {
  it('`rejouer` (que porte `test:forcer`) change le hash d’un crate et d’un projet Python', () => {
    const r = depot();
    const lundi = hashes(r, { [VARIABLE]: JSON.stringify({ arguments: [], rejouer: 'lundi' }) });
    const mardi = hashes(r, { [VARIABLE]: JSON.stringify({ arguments: [], rejouer: 'mardi' }) });
    for (const t of ['seul#test:unit', 'journal#test:unit', 'outils#test:unit']) {
      expect(lundi[t], t).not.toBe(mardi[t]);
    }
  });
});
