/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
// La part par défaut d'une passe, lue pour un projet (scripts/places-de-la-machine.mjs
// `partDeLaPasse`, `prendreUnePart`) : les cœurs valent le budget divisé par les places de la
// machine, la mémoire le plus grand pic des passes de jour du registre des consommations plus un
// quart. Les registres sont ceux de dépôts git d'essai ; la machine est celle d'un essai.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  fichierDeConsommation,
  garderLaConsommation,
} from '../../scripts/consommation-des-passes.mjs';
import { partDeLaPasse, prendreUnePart } from '../../scripts/places-de-la-machine.mjs';

const GO = 1024 ** 3;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'part-par-defaut-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const unDossier = (nom: string) => mkdtempSync(path.join(ESSAIS, `${nom}-`));

// Un dépôt git d'essai, son package.json portant <grillhouse>.
function projet(grillhouse?: Record<string, unknown>) {
  const racine = unDossier('projet');
  expect(spawnSync('git', ['-C', racine, 'init', '-q']).status).toBe(0);
  writeFileSync(
    path.join(racine, 'package.json'),
    JSON.stringify({ name: 'essai', ...(grillhouse ? { grillhouse } : {}) })
  );
  return racine;
}
const ligne = (o: Record<string, unknown> = {}) => ({
  sorte: 'verification',
  dureeMs: 10_000,
  cpuNs: 20_000_000_000,
  memoirePic: 2 * GO,
  coeurs: 8,
  issue: 'verte',
  fin: '2026-11-18T10:00:00.000Z',
  ...o,
});
const garder = (racine: string, ...lignes: Record<string, unknown>[]) =>
  lignes.forEach(l => garderLaConsommation(racine, l));

// Le poste d'essai : 32 cœurs, 4 réservés (budget 28), 64 Go dont 4 réservés (budget 60 Go).
const poste = (places?: string, fils = 32): Record<string, string> => ({
  HOME: unDossier('maison'),
  TMPDIR: unDossier('tmp'),
  GRILLHOUSE_PARTS_DE_LA_MACHINE: path.join(unDossier('parts'), 'etat'),
  GRILLHOUSE_RESERVE_COEURS: '4',
  GRILLHOUSE_RESERVE_MEMOIRE_GO: '4',
  ...(places === undefined ? {} : { GRILLHOUSE_PLACES: places }),
  GRILLHOUSE_MESURE_D_ESSAI: JSON.stringify({
    coeurs: fils,
    charge: 0,
    memoireLibre: 40 * GO,
    memoireTotale: 64 * GO,
  }),
});

describe('la part par défaut d’une passe pour un projet', () => {
  it('sans clé, les cœurs valent 3, quelles que soient les places de la machine', () => {
    expect(partDeLaPasse({ racine: projet(), env: poste('7') }).coeurs).toBe(3);
    expect(partDeLaPasse({ racine: projet(), env: poste('2') }).coeurs).toBe(3);
    expect(partDeLaPasse({ racine: projet(), env: poste() }).coeurs).toBe(3);
  });

  it('sans mesure au registre, la mémoire est le tiers du budget, quelles que soient les places', () => {
    const tiers = Math.floor((60 * GO * 10) / 28);
    expect(partDeLaPasse({ racine: projet(), env: poste('7') }).memoire).toBe(tiers);
    expect(partDeLaPasse({ racine: projet(), env: poste('2') }).memoire).toBe(tiers);
  });

  it('la mémoire vaut le plus grand pic des passes de jour du registre plus un quart', () => {
    const racine = projet();
    garder(
      racine,
      ligne({ memoirePic: 24 * GO }),
      ligne({ memoirePic: 32 * GO, sorte: 'controles', ticket: 'grillhouse-x.1' }),
      ligne({ memoirePic: 28 * GO })
    );
    expect(partDeLaPasse({ racine, env: poste('7') })).toEqual({ coeurs: 3, memoire: 40 * GO });
  });

  it('un registre de passes légères seules garde le plancher, le tiers du budget', () => {
    const racine = projet();
    garder(racine, ligne({ memoirePic: 16 * 1024 ** 2 }), ligne({ memoirePic: 2 * GO }));
    expect(partDeLaPasse({ racine, env: poste('7') }).memoire).toBe(
      Math.floor((60 * GO * 10) / 28)
    );
  });

  it('une ligne sans pic lisible ou malformée ne compte pas dans le plus grand pic', () => {
    const racine = projet();
    garder(
      racine,
      ligne({ memoirePic: 24 * GO }),
      ligne({ memoirePic: null }),
      ligne({ memoirePic: 'beaucoup' }),
      ligne({ memoirePic: undefined })
    );
    appendFileSync(fichierDeConsommation(racine) as string, '{ pas du json\n');
    expect(partDeLaPasse({ racine, env: poste('7') }).memoire).toBe(30 * GO);
  });

  it('les lignes de la nuit et des mesures de temps ne comptent pas dans le plus grand pic', () => {
    const racine = projet();
    garder(
      racine,
      ligne({ memoirePic: 24 * GO }),
      ligne({ memoirePic: 44 * GO, sorte: 'nuit' }),
      ligne({ memoirePic: 45 * GO, sorte: 'tests-de-nuit' }),
      ligne({ memoirePic: 46 * GO, sorte: 'mesure' })
    );
    expect(partDeLaPasse({ racine, env: poste('7') }).memoire).toBe(30 * GO);
  });

  it('un registre sans aucune passe de jour mesurée garde la mémoire par défaut, le tiers du budget', () => {
    const racine = projet();
    garder(racine, ligne({ memoirePic: 20 * GO, sorte: 'nuit' }), ligne({ memoirePic: null }));
    expect(partDeLaPasse({ racine, env: poste('7') }).memoire).toBe(
      Math.floor((60 * GO * 10) / 28)
    );
  });

  it('la mémoire par défaut ne dépasse jamais le budget', () => {
    const racine = projet();
    garder(racine, ligne({ memoirePic: 80 * GO }));
    expect(partDeLaPasse({ racine, env: poste('7') }).memoire).toBe(60 * GO);
  });

  it('le registre se lit à la racine du dépôt principal, depuis un sous-dossier du dépôt', () => {
    const racine = projet();
    garder(racine, ligne({ memoirePic: 32 * GO }));
    const sous = path.join(racine, 'paquet');
    mkdirSync(sous);
    expect(partDeLaPasse({ racine: sous, env: poste('7') }).memoire).toBe(40 * GO);
  });

  it('des cœurs seuls déclarés gardent la mémoire du registre', () => {
    const racine = projet({ part: { coeurs: 6 } });
    garder(racine, ligne({ memoirePic: 32 * GO }));
    expect(partDeLaPasse({ racine, env: poste('7') })).toEqual({ coeurs: 6, memoire: 40 * GO });
  });

  it('une mémoire seule déclarée garde les cœurs par défaut, 3', () => {
    const racine = projet({ part: { memoireGo: 3 } });
    garder(racine, ligne({ memoirePic: 4 * GO }));
    expect(partDeLaPasse({ racine, env: poste('7') })).toEqual({ coeurs: 3, memoire: 3 * GO });
  });

  it('une part déclarée en entier reste telle quelle', () => {
    const racine = projet({ part: { coeurs: 4, memoireGo: 6 } });
    garder(racine, ligne({ memoirePic: 9 * GO }));
    expect(partDeLaPasse({ racine, env: poste('7') })).toEqual({ coeurs: 4, memoire: 6 * GO });
  });
});

describe('la nuit prend la part du projet, la mesure de temps ses cœurs dédiés', () => {
  const topologie = {
    lisible: true,
    coeurs: Array.from({ length: 16 }, (_, c) => ({ fils: [c, c + 16], noeud: 0 })),
  };
  const prendre = (env: Record<string, string>, racine: string, o: Record<string, unknown>) =>
    prendreUnePart({
      env,
      racine,
      libre: () => Infinity,
      occupe: () => 'rien',
      borneMs: 0,
      dire: () => {},
      topologie,
      chargeDesCoeurs: () => 0,
      ...o,
    });

  it('sans grillhouse.mesure, la mesure demande 3 cœurs arrondis aux cœurs entiers, quelles que soient les places', () => {
    const m = prendre(poste('7'), projet(), { mesure: true });
    expect(m.part.coeurs).toBe(4);
    m.rendre();
    const n = prendre(poste('2'), projet(), { mesure: true });
    expect(n.part.coeurs).toBe(4);
    n.rendre();
  });

  it('la nuit prend la part du projet, sans réserver le budget entier', () => {
    const n = prendre(poste('7'), projet(), { sorte: 'Nuit' });
    expect(n.part).toEqual({ coeurs: 3, memoire: Math.floor((60 * GO * 10) / 28) });
    n.rendre();
  });
});
