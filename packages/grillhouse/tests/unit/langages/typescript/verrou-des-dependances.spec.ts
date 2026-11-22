// La garde du verrou des dépendances (scripts/langages/typescript/verrou-des-dependances.mjs) :
// pour chaque package.json suivi, ses dépendances (dependencies, devDependencies,
// optionalDependencies, peerDependencies) se comparent à l'entrée de son paquet dans
// package-lock.json (clé `packages`), sans registre ni npm. Des tests petits : un dossier d'essai,
// aucun processus.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  COMMANDE,
  verifier,
} from '../../../../scripts/langages/typescript/verrou-des-dependances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verrou-des-dependances-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Dependances = Record<string, string>;
interface Manifeste {
  name: string;
  version?: string;
  dependencies?: Dependances;
  devDependencies?: Dependances;
  optionalDependencies?: Dependances;
  peerDependencies?: Dependances;
}
type Entrees = Record<string, object>;

const poser = (racine: string, f: string, o: object) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), `${JSON.stringify(o, null, 2)}\n`);
};

/** Un dépôt de deux paquets, `site` et `moteur`, dont le verrou est <verrou> sur <entrees>. */
function depot(site: Manifeste, verrou: object | null, entrees: Entrees = {}) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const moteur: Manifeste = { name: 'moteur', version: '1.0.0' };
  poser(racine, 'package.json', { name: 'p', private: true, workspaces: ['packages/*'] });
  poser(racine, 'packages/moteur/package.json', moteur);
  poser(racine, 'packages/site/package.json', site);
  if (verrou) {
    poser(racine, 'package-lock.json', {
      name: 'p',
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': { name: 'p', workspaces: ['packages/*'] },
        'node_modules/moteur': { resolved: 'packages/moteur', link: true },
        'node_modules/site': { resolved: 'packages/site', link: true },
        'packages/moteur': { version: '1.0.0' },
        ...entrees,
        'packages/site': { ...site, name: undefined, ...verrou },
      },
    });
  }
  return racine;
}

const SITE: Manifeste = { name: 'site', version: '1.0.0' };
const LODASH = { 'node_modules/lodash': { version: '4.17.21' } };
const refus = (racine: string) => verifier(racine).join('\n');

describe('la garde du verrou des dépendances', () => {
  it('laisse passer un verrou à jour, ses dépendances de chaque sorte comprises', () => {
    const site: Manifeste = {
      ...SITE,
      dependencies: { lodash: '^4.0.0' },
      devDependencies: { moteur: '*' },
      optionalDependencies: { lodash: '^4.17.0' },
      peerDependencies: { moteur: '>=1.0.0' },
    };
    expect(verifier(depot(site, {}, LODASH))).toEqual([]);
  });

  it('laisse passer un verrou à jour quand aucun paquet ne déclare de dépendance', () => {
    expect(verifier(depot(SITE, {}))).toEqual([]);
  });

  it.each(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const)(
    'refuse une dépendance de %s absente du verrou, par le paquet, la dépendance et la commande',
    sorte => {
      const racine = depot(
        { ...SITE, [sorte]: { lodash: '^4.0.0' } },
        { [sorte]: undefined },
        LODASH
      );
      const dit = refus(racine);
      expect(dit).toContain('packages/site');
      expect(dit).toContain('lodash');
      expect(dit).toContain(COMMANDE);
    }
  );

  it('refuse une dépendance retirée du package.json encore présente dans l’entrée du verrou', () => {
    const racine = depot(SITE, { devDependencies: { lodash: '^4.0.0' } }, LODASH);
    const dit = refus(racine);
    expect(dit).toContain('packages/site');
    expect(dit).toContain('lodash');
    expect(dit).toContain(COMMANDE);
  });

  it('refuse une plage changée dans le package.json qui diffère de celle de l’entrée du verrou', () => {
    const racine = depot(
      { ...SITE, dependencies: { lodash: '^4.17.0' } },
      { dependencies: { lodash: '^4.0.0' } },
      LODASH
    );
    const dit = refus(racine);
    expect(dit).toContain('packages/site');
    expect(dit).toContain('lodash');
    expect(dit).toContain('^4.17.0');
    expect(dit).toContain(COMMANDE);
  });

  it('refuse une version résolue du verrou qui ne satisfait plus la plage déclarée', () => {
    const racine = depot(
      { ...SITE, dependencies: { lodash: '^5.0.0' } },
      { dependencies: { lodash: '^5.0.0' } },
      LODASH
    );
    const dit = refus(racine);
    expect(dit).toContain('packages/site');
    expect(dit).toContain('lodash');
    expect(dit).toContain('4.17.21');
    expect(dit).toContain(COMMANDE);
  });

  it('juge une dépendance vers un paquet du dépôt sur la version de ce paquet', () => {
    const bonne = depot(
      { ...SITE, devDependencies: { moteur: '^1.0.0' } },
      { devDependencies: { moteur: '^1.0.0' } }
    );
    expect(verifier(bonne)).toEqual([]);
    const mauvaise = depot(
      { ...SITE, devDependencies: { moteur: '^2.0.0' } },
      { devDependencies: { moteur: '^2.0.0' } }
    );
    expect(refus(mauvaise)).toContain('moteur');
  });

  it('juge aussi le package.json de la racine, contre l’entrée "" du verrou', () => {
    const racine = depot(SITE, {}, LODASH);
    poser(racine, 'package.json', {
      name: 'p',
      private: true,
      workspaces: ['packages/*'],
      devDependencies: { lodash: '^4.0.0' },
    });
    const dit = refus(racine);
    expect(dit).toContain('lodash');
    expect(dit).toContain(COMMANDE);
  });

  it('dit chaque paquet en cause, un refus par dépendance fautive', () => {
    const racine = depot(
      { ...SITE, dependencies: { lodash: '^4.0.0', zod: '^3.0.0' } },
      { dependencies: {} },
      LODASH
    );
    const lignes = verifier(racine);
    expect(lignes.filter(l => l.includes('lodash'))).toHaveLength(1);
    expect(lignes.filter(l => l.includes('zod'))).toHaveLength(1);
  });
});
