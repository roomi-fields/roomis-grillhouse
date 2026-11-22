// La régénération du verrou npm (scripts/activites.mjs, étape 4.2) : le circuit joue la commande du
// verrou dans la copie, jamais l'agent, avant les contrôles et la passe finale que la garde juge.
// Des tests moyens : un dépôt git d'essai et le vrai npm, dont les seules dépendances sont des
// paquets du dépôt (aucun registre interrogé).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import { depotDeReferences } from './references-essai.js';
import type { Ctx } from './preuve-essai.js';

interface Lot {
  commit: string;
  arbre: string;
}
interface Rendu {
  regenerees?: string[];
  fichiers?: string[];
  restreinte?: object | null;
}
const leLotGarde = activites.leLotGarde as (ctx: object) => { lot: Lot | null };
const regenerer = activites.regenerer as (
  ctx: object,
  e: { noms: string[]; suite: 'controles' | 'passe' | null; avant: Lot }
) => Rendu;
const lesReferences = activites.lesReferences as (ctx: object) => { nom: string }[];

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'activites-verrou-npm-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const NOM = 'le verrou des dépendances';
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;
const LOCK = json({
  name: 'p',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: 'p', workspaces: ['packages/*'] },
    'node_modules/moteur': { resolved: 'packages/moteur', link: true },
    'node_modules/site': { resolved: 'packages/site', link: true },
    'packages/moteur': { version: '1.0.0' },
    'packages/site': { version: '1.0.0' },
  },
});
const copie = () =>
  depotDeReferences(ESSAIS, [], {
    'package.json': json({ name: 'p', private: true, workspaces: ['packages/*'] }),
    'packages/moteur/package.json': json({ name: 'moteur', version: '1.0.0' }),
    'packages/site/package.json': json({ name: 'site', version: '1.0.0' }),
    'package-lock.json': LOCK,
  });
const lire = (ctx: Ctx, f: string) => readFileSync(path.join(ctx.copie, f), 'utf8');

describe('la régénération du verrou des dépendances', () => {
  it('fait partie des références du circuit', () => {
    expect(lesReferences(copie()).map(r => r.nom)).toContain(NOM);
  });

  it('écrit dans la copie le verrou d’une devDependency ajoutée à un package.json, et le dit', () => {
    const ctx = copie();
    writeFileSync(
      path.join(ctx.copie, 'packages/site/package.json'),
      json({ name: 'site', version: '1.0.0', devDependencies: { moteur: '*' } })
    );
    const r = regenerer(ctx, {
      noms: [NOM],
      suite: 'controles',
      avant: leLotGarde(ctx).lot!,
    });
    expect(r.regenerees).toEqual([NOM]);
    expect(r.fichiers).toEqual(['package-lock.json']);
    expect(lire(ctx, 'package-lock.json')).toContain('"devDependencies"');
    expect(lire(ctx, 'package-lock.json')).toContain('"moteur": "*"');
    expect(r.restreinte).toBeTruthy();
  });

  it('ne change rien à un verrou déjà à jour', () => {
    const ctx = copie();
    const r = regenerer(ctx, { noms: [NOM], suite: 'controles', avant: leLotGarde(ctx).lot! });
    expect(r.regenerees).toEqual([]);
    expect(r.fichiers).toEqual([]);
    expect(lire(ctx, 'package-lock.json')).toBe(LOCK);
  });
});
