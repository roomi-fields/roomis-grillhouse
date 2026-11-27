// Un projet sans paquet TypeScript a le générateur du graphe comme les autres : ce que
// `grillhouse.lit` déclare entre au hachage des tests d'un paquet de chaque langage (turbo.dev,
// « inputs » ; la `data` d'une cible de Bazel). Turborepo est le vrai, en `--dry=json`.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { gardesDuCadre } from '../../../../scripts/gardes-du-cadre.mjs';
import { mettreAJour, regenerer } from '../../../../scripts/grillhouse-maj.mjs';
import { langageDe } from '../../../../scripts/langages.mjs';
import { ecrire, verifier } from '../../../../scripts/langages/typescript/turbo-des-paquets.mjs';
import { commandeDe } from '../../../../scripts/sous-commandes.mjs';

const DEPOT = path.resolve(__dirname, '../../../../../..');
const TURBO = path.join(DEPOT, 'node_modules/.bin/turbo');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'turbo-sans-typescript-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const fichier = (racine: string, f: string, texte: string, mode?: number) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte, { mode });
};
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

const MANIFESTES = { cargo: 'Cargo.toml', python: 'pyproject.toml', c: 'CMakeLists.txt' };
type Langage = keyof typeof MANIFESTES;
const manifeste = (l: Langage) =>
  ({
    cargo: '[package]\nname = "noyau"\nversion = "0.1.0"\n',
    python: '[project]\nname = "noyau"\nversion = "0.1.0"\n',
    c: 'project(noyau C)\n',
  })[l];

// Un projet d'un seul langage, d'un paquet `noyau` qui déclare lire `spec/`, hors de lui.
function depot(langage: Langage): string {
  const r = mkdtempSync(path.join(ESSAIS, `${langage}-`));
  fichier(
    r,
    'package.json',
    json({ name: 'essai', private: true, workspaces: ['noyau'], packageManager: 'npm@10.9.8' })
  );
  fichier(r, 'turbo.json', readFileSync(path.join(DEPOT, 'templates/turbo/paquets.json'), 'utf8'));
  fichier(
    r,
    'docs/ARCHITECTURE.md',
    `# Architecture\n\n| Composant | Dépôt | Responsabilité | Langage |\n|---|---|---|---|\n| \`noyau\` | P | le noyau | ${langage} |\n`
  );
  fichier(
    r,
    'noyau/package.json',
    json({
      name: 'noyau',
      private: true,
      scripts: { 'test:unit': 'grillhouse tests-du-paquet noyau' },
      grillhouse: { lit: ['spec'] },
    })
  );
  fichier(r, `noyau/${MANIFESTES[langage]}`, manifeste(langage));
  fichier(r, 'spec/cas.json', '{ "cas": 1 }\n');
  return r;
}

const hachage = (r: string): string => {
  const sortie = spawnSync(TURBO, ['run', 'test:unit', '--dry=json'], {
    cwd: r,
    encoding: 'utf8',
  });
  const plan = JSON.parse(sortie.stdout) as { tasks: { taskId: string; hash: string }[] };
  return plan.tasks.find(t => t.taskId === 'noyau#test:unit')!.hash;
};

const nomsDesGardes = (r: string) =>
  gardesDuCadre(r).map(([s]) => path.basename(s as string, '.mjs'));

describe.each(['cargo', 'python', 'c'] as const)('un projet %s sans paquet TypeScript', langage => {
  it('refuse par ses gardes le turbo.json qui manque à un paquet qui déclare ce qu’il lit', () => {
    const r = depot(langage);
    expect(nomsDesGardes(r)).toContain('turbo-des-paquets');
    expect(verifier(r).join('\n')).toContain('noyau/turbo.json manque');
  });

  it('a la commande du générateur et ses turbo.json engendrés, que la file régénère', () => {
    const r = depot(langage);
    const commande = commandeDe('turbo-des-paquets', r);
    expect(existsSync(commande!.script)).toBe(true);
    const engendres = langageDe(r).fichiersEngendres(r);
    expect(engendres.flatMap(e => e.gardes)).toContain('turbo-des-paquets');
  });

  it('rejoue les tests du paquet quand un fichier que grillhouse.lit couvre change', () => {
    const r = depot(langage);
    ecrire(r);
    const avant = hachage(r);
    expect(hachage(r)).toBe(avant);
    fichier(r, 'spec/cas.json', '{ "cas": 2 }\n');
    expect(hachage(r)).not.toBe(avant);
  });

  it('joue le générateur à la montée', () => {
    const r = depot(langage);
    fichier(r, 'node_modules/.bin/grillhouse', '#!/bin/sh\necho "$*" >> commandes-jouees\n', 0o755);
    fichier(r, 'node_modules/jsonc-parser/package.json', json({ name: 'jsonc-parser' }));
    expect(regenerer(r)).toEqual([]);
    expect(readFileSync(path.join(r, 'commandes-jouees'), 'utf8').split('\n')).toContain(
      'turbo-des-paquets --ecrire'
    );
  });

  it('reçoit de la montée l’outil par lequel le générateur lit les turbo.json', () => {
    const r = depot(langage);
    mettreAJour(r, DEPOT);
    const pkg = JSON.parse(readFileSync(path.join(r, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.devDependencies)).toEqual(
      expect.arrayContaining(['jsonc-parser', 'turbo'])
    );
  });
});

describe('un projet cargo sans paquets', () => {
  it('ne reçoit aucune garde du graphe', () => {
    const r = depot('cargo');
    fichier(r, 'package.json', json({ name: 'essai', private: true }));
    expect(nomsDesGardes(r)).not.toContain('turbo-des-paquets');
  });
});
