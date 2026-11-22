/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
// La nuit d'un projet joue sur la part de son projet, comme une passe (scripts/places-de-la-machine.mjs,
// `prendreUnePart`) : elle ne réserve pas le budget entier. Sa part s'inscrit à la table des parts
// avec la sorte « nuit », les passes des autres projets prennent la leur pendant qu'elle joue, elle
// attend en disant ce qu'elle attend (cœurs) quand sa part manque, et la rend à sa fin. L'ancien
// jeton de la nuit, laissé dans l'environnement, n'y change rien. La machine, le temps et les
// disques sont ceux d'un essai.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { departDe } from '../../scripts/mesure/base-de-passe.mjs';
import {
  dossierDesParts,
  lireLesParts,
  poserLaPart,
  prendreUnePart,
} from '../../scripts/places-de-la-machine.mjs';

const GO = 1024 ** 3;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'nuit-sur-sa-part-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const unDossier = (nom: string) => mkdtempSync(path.join(ESSAIS, `${nom}-`));

function projet() {
  const racine = unDossier('projet');
  expect(spawnSync('git', ['-C', racine, 'init', '-q']).status).toBe(0);
  writeFileSync(path.join(racine, 'package.json'), JSON.stringify({ name: 'essai' }));
  return racine;
}
// Le poste d'essai : 32 cœurs dont 4 réservés (budget 28), 64 Go dont 4 réservés, 7 places : la
// part par défaut d'une passe est de 3 cœurs.
const poste = (extra: Record<string, string> = {}): Record<string, string> => ({
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
  ...extra,
});
// L'environnement que la nuit d'avant donnait à ses passes : il ne doit plus rien changer.
const ANCIEN_JETON = { GRILLHOUSE_JETON_DE_LA_NUIT: 'jeton-de-l-ancienne-nuit' };

function prendre(env: Record<string, string>, o: Record<string, unknown> = {}) {
  const dit: string[] = [];
  let t = 1_000_000;
  const prise = (prendreUnePart as unknown as (o: object) => any)({
    env,
    racine: projet(),
    sorte: 'Nuit',
    libre: () => Infinity,
    occupe: () => 'rien',
    topologie: {
      lisible: false,
      coeurs: Array.from({ length: 32 }, (_, i) => ({ fils: [i], noeud: 0 })),
    },
    chargeDesCoeurs: () => 0,
    borneMs: 1000,
    rappelMs: 1,
    dire: (l: string) => dit.push(l),
    maintenant: () => t,
    dormir: () => {
      t += 10;
    },
    lireLaReservation: () => null,
    ...o,
  });
  return { prise, dit };
}

describe('la nuit prend la part de son projet, sans réserver la machine', () => {
  it('sa part est celle du projet, trois cœurs sans clé, même avec l’ancien jeton dans l’environnement', () => {
    const { prise } = prendre(poste(ANCIEN_JETON));
    expect(prise.part.coeurs).toBe(3);
    expect(prise.part.memoire).toBeLessThan(60 * GO);
    prise.rendre();
  });

  it('sa part s’inscrit à la table des parts avec la sorte « nuit »', () => {
    const env = poste();
    const { prise } = prendre(env);
    const [moi, ...autres] = lireLesParts(dossierDesParts(env)).prises;
    expect(autres).toEqual([]);
    expect(moi.etat).toBe('tient');
    expect(String(moi.sorte).toLowerCase()).toBe('nuit');
    expect(moi.coeurs).toBe(3);
    prise.rendre();
  });

  it('la part déclarée par le projet (grillhouse.part) est celle de sa nuit', () => {
    const env = poste();
    const racine = projet();
    writeFileSync(
      path.join(racine, 'package.json'),
      JSON.stringify({ name: 'essai', grillhouse: { part: { coeurs: 6, memoireGo: 10 } } })
    );
    const { prise } = prendre(env, { racine });
    expect(prise.part).toEqual({ coeurs: 6, memoire: 10 * GO });
    prise.rendre();
  });

  it('une passe d’un autre projet prend sa part pendant la nuit, sans attendre', () => {
    const env = poste(ANCIEN_JETON);
    const nuit = prendre(env).prise;
    const autre = prendre(env, { sorte: 'Vérification', borneMs: 0 });
    expect(autre.prise.part.coeurs).toBe(3);
    expect(autre.dit.join('\n')).not.toMatch(/nuit/);
    expect(lireLesParts(dossierDesParts(env)).prises).toHaveLength(2);
    autre.prise.rendre();
    nuit.rendre();
  });

  it('plusieurs passes de projets différents jouent à côté de la nuit tant que le budget a la place', () => {
    const env = poste();
    // Chaque projet déclare une petite mémoire : sept parts de 4 cœurs et 4 Go tiennent dans 60 Go.
    const petit = () => {
      const racine = projet();
      writeFileSync(
        path.join(racine, 'package.json'),
        JSON.stringify({ name: 'essai', grillhouse: { part: { coeurs: 4, memoireGo: 4 } } })
      );
      return racine;
    };
    const nuit = prendre(env, { racine: petit() }).prise;
    const autres = [1, 2, 3, 4, 5, 6].map(() =>
      prendre(env, { sorte: 'Vérification', borneMs: 0, racine: petit() })
    );
    expect(lireLesParts(dossierDesParts(env)).prises).toHaveLength(7);
    for (const a of autres) {
      a.prise.rendre();
    }
    nuit.rendre();
  });

  it('elle rend sa part : la table des parts n’en garde rien', () => {
    const env = poste();
    const { prise } = prendre(env);
    prise.rendre();
    expect(lireLesParts(dossierDesParts(env)).prises).toEqual([]);
  });
});

describe('la nuit attend sa part en disant ce qu’elle attend', () => {
  const tenirTout = (env: Record<string, string>) => {
    const dossier = dossierDesParts(env);
    poserLaPart(dossier, {
      id: 'autre',
      pid: process.pid,
      depart: departDe(process.pid),
      rang: 0,
      coeurs: 28,
      memoire: 60 * GO,
      etat: 'tient',
    });
    return () => rmSync(path.join(dossier, 'autre.json'), { force: true });
  };

  it('sa raison dit les cœurs : trois demandés, aucun libre sur vingt-huit', () => {
    const env = poste(ANCIEN_JETON);
    const lacher = tenirTout(env);
    let vue: any[] = [];
    let tours = 0;
    const { prise, dit } = prendre(env, {
      dormir: () => {
        tours += 1;
        if (tours === 1) {
          vue = lireLesParts(dossierDesParts(env)).attentes;
        }
        if (tours === 2) {
          lacher();
        }
      },
    });
    expect(vue).toHaveLength(1);
    expect(String(vue[0].sorte).toLowerCase()).toBe('nuit');
    expect(vue[0].raison).toMatch(/cœurs : 3 demandés, 0 libres sur 28/);
    expect(dit.join('\n')).toMatch(/cœurs : 3 demandés, 0 libres sur 28/);
    expect(dit.join('\n')).not.toMatch(/la nuit tient la machine/);
    prise.rendre();
  });

  it('elle prend sa part dès que les cœurs se libèrent', () => {
    const env = poste();
    const lacher = tenirTout(env);
    let tours = 0;
    const { prise } = prendre(env, {
      dormir: () => {
        tours += 1;
        if (tours === 1) {
          lacher();
        }
      },
    });
    expect(prise.part.coeurs).toBe(3);
    prise.rendre();
  });
});
