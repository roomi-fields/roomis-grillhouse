// The directory of the parts of the machine goes when the last part is given back
// (`rendreLaPart` of scripts/places-de-la-machine.mjs) and is made again by the pass that takes the
// next one. Two passes at once: one makes the directory, the other, giving its part back, removes
// it, still empty, before the first has laid its admission lock in it. The pass that takes its part
// makes the directory again, as `mkdir -p` then a file in it is retried when a cleaner passes
// between the two; it never fails on the directory another pass removed.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// What another pass does between the making of the directory and the lock of this one: set by a
// test, played once after the directory of the parts is made.
const autre = vi.hoisted(() => ({
  passe: null as ((dossier: string) => void) | null,
  dossier: null as string | null,
}));
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>();
  const mkdirSync = ((chemin: string, ...reste: unknown[]) => {
    const r = (fs.mkdirSync as (...a: unknown[]) => unknown)(chemin, ...reste);
    if (autre.passe && chemin === autre.dossier) {
      const passe = autre.passe;
      autre.passe = null;
      passe(chemin);
    }
    return r;
  }) as typeof fs.mkdirSync;
  return { ...fs, default: { ...fs, mkdirSync }, mkdirSync };
});

// The module is imported after the registry is emptied: a setup file of the base configuration has
// loaded it already with the real node:fs (tests/unit/verrou-de-fichier.spec.ts does the same).
vi.resetModules();
const { dossierDesParts, prendreUnePart } = await import('../../scripts/places-de-la-machine.mjs');

const GO = 1024 ** 3;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'part-prise-pendant-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const unDossier = (nom: string) => mkdtempSync(path.join(ESSAIS, `${nom}-`));

function projet() {
  const racine = unDossier('projet');
  expect(spawnSync('git', ['-C', racine, 'init', '-q']).status).toBe(0);
  writeFileSync(path.join(racine, 'package.json'), JSON.stringify({ name: 'essai' }));
  return racine;
}
const poste = (): Record<string, string> => ({
  HOME: unDossier('maison'),
  TMPDIR: unDossier('tmp'),
  GRILLHOUSE_PARTS_DE_LA_MACHINE: path.join(unDossier('parts'), 'etat'),
  GRILLHOUSE_RESERVE_COEURS: '4',
  GRILLHOUSE_RESERVE_MEMOIRE_GO: '4',
  GRILLHOUSE_PLACES: '7',
  GRILLHOUSE_MESURE_D_ESSAI: JSON.stringify({
    coeurs: 32,
    charge: 0,
    memoireLibre: 40 * GO,
    memoireTotale: 64 * GO,
  }),
});

type Prise = { part: object | null; rendre: () => void };
const prendre = (env: Record<string, string>) =>
  (prendreUnePart as unknown as (o: object) => Prise)({
    env,
    racine: projet(),
    libre: () => Infinity,
    occupe: () => 'rien',
    topologie: {
      lisible: false,
      coeurs: Array.from({ length: 32 }, (_, i) => ({ fils: [i], noeud: 0 })),
    },
    chargeDesCoeurs: () => 0,
    borneMs: 1000,
    rappelMs: 1,
    dire: () => {},
    lireLaReservation: () => null,
  });

describe('une part se prend pendant qu’une autre passe rend la sienne', () => {
  it('le dossier des parts retiré, vide, entre sa création et le verrou d’admission est refait, et la part est prise', () => {
    const env = poste();
    const dossier = dossierDesParts(env);
    let retire = false;
    autre.dossier = dossier;
    autre.passe = d => {
      // The other pass gives its part back: the directory, empty, goes.
      expect(readdirSync(d)).toEqual([]);
      rmdirSync(d);
      retire = true;
    };
    const prise = prendre(env);
    expect(retire).toBe(true);
    expect(prise.part).not.toBeNull();
    expect(readdirSync(dossier).filter(n => n.endsWith('.json'))).toHaveLength(1);
    prise.rendre();
    expect(existsSync(dossier)).toBe(false);
  });
});
