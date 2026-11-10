// grillhouse-osf.2 (de 4nr.2, critère 10) : grand test de nuit. Le paquet publie les sources
// construites de src/temporal/. Ce cas monte une copie du dépôt, construit (npm run build) et
// empaquette (npm pack) pour de vrai : un grand test (pyramide de la charte), joué la nuit. Ses
// sept voisins, légers, restent dans commande.spec.ts, du jour.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dossier, PAQUET } from './essai.js';

const DEPOT = path.resolve(PAQUET, '../..');

describe('le paquet publie les sources construites de src/temporal/', () => {
  it('built in a copy of its own, from its sources alone, its archive holds dist/temporal/', () => {
    // A copy of the package's sources and configuration, no dist/, the repository's dependencies
    // linked: what Turborepo built in the package is never read. The scripts are sources too: the
    // workflow of the machine imports their rule of the places (grillhouse-4nr.7).
    const racine = dossier('copie');
    const copie = path.join(racine, 'packages/grillhouse');
    for (const f of ['package.json', 'tsconfig.json', 'tsconfig.build.json', 'src', 'scripts']) {
      cpSync(path.join(PAQUET, f), path.join(copie, f), { recursive: true });
    }
    cpSync(
      path.join(DEPOT, 'templates/projet/tsconfig.json'),
      path.join(racine, 'templates/projet/tsconfig.json')
    );
    symlinkSync(path.join(DEPOT, 'node_modules'), path.join(racine, 'node_modules'));
    expect(existsSync(path.join(copie, 'dist'))).toBe(false);
    const b = spawnSync('npm', ['run', 'build'], { cwd: copie, encoding: 'utf8' });
    expect(b.status, b.stdout + b.stderr).toBe(0);
    const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: copie,
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    const fichiers = (JSON.parse(r.stdout) as { files: { path: string }[] }[])[0]!.files.map(
      f => f.path
    );
    for (const f of [
      'dist/temporal/client.js',
      'dist/temporal/commande.js',
      'dist/temporal/travailleur.js',
      'dist/temporal/sonde/deroule.js',
      'dist/temporal/sonde/activites.js',
      'dist/temporal/deroules.js',
      'dist/temporal/places/deroule.js',
      'dist/temporal/places/activites.js',
    ]) {
      expect(fichiers, f).toContain(f);
    }
    expect(fichiers.filter(f => f.startsWith('src/'))).toEqual([]);
  }, 120_000);
});
