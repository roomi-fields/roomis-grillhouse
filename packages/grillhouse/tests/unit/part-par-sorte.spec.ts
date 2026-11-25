/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// La part de mémoire d'une passe par sorte (src/machine/part-par-sorte.ts, lue par
// scripts/places-de-la-machine.mjs `partDeLaPasse`, `prendreUnePart`) : la réservation, le 95e
// centile des pics de la sorte au registre, que l'admission compte ; la limite, leur maximum plus
// un quart, où le groupe coupe. Les registres sont ceux de dépôts git d'essai ; la machine est
// celle d'un essai.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { memoireDeLaSorte } from '../../src/machine/part-par-sorte.js';
import {
  depasseLaPart,
  garderLaConsommation,
  lireLaConsommation,
} from '../../scripts/consommation-des-passes.mjs';
import { commandeDuGroupe, mesureDeLaSeance } from '../../scripts/passe-de-la-machine.mjs';
import { partDeLaPasse, prendreUnePart } from '../../scripts/places-de-la-machine.mjs';
import { lireLaMesure } from '../../scripts/avancement.mjs';
import { etatsDAgents, lignesDesParts } from '../../scripts/tableau.mjs';

const GO = 1024 ** 3;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'part-par-sorte-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const unDossier = (nom: string) => mkdtempSync(path.join(ESSAIS, `${nom}-`));

function projet(memoireGo?: number) {
  const racine = unDossier('projet');
  expect(spawnSync('git', ['-C', racine, 'init', '-q']).status).toBe(0);
  writeFileSync(
    path.join(racine, 'package.json'),
    JSON.stringify({
      name: 'essai',
      ...(memoireGo ? { grillhouse: { part: { memoireGo } } } : {}),
    })
  );
  return racine;
}
// `n` relevés de la sorte `sorte` au pic `go`.
const relever = (racine: string, sorte: string, n: number, go: number) => {
  for (let i = 0; i < n; i++) {
    garderLaConsommation(racine, { sorte, memoirePic: go * GO, dureeMs: 1000 });
  }
};
// 20 relevés de vérification : dix-neuf à 2 Go, un à 8 Go ; le 95e centile vaut 2, le maximum 8.
const mesure = (racine: string) => {
  relever(racine, 'verification', 19, 2);
  relever(racine, 'verification', 1, 8);
};

// Le poste d'essai : budget de 28 cœurs et 12 Go.
const poste = (): Record<string, string> => ({
  HOME: unDossier('maison'),
  TMPDIR: unDossier('tmp'),
  GRILLHOUSE_PARTS_DE_LA_MACHINE: path.join(unDossier('parts'), 'etat'),
  GRILLHOUSE_RESERVE_COEURS: '4',
  GRILLHOUSE_RESERVE_MEMOIRE_GO: '4',
  GRILLHOUSE_MESURE_D_ESSAI: JSON.stringify({
    coeurs: 32,
    charge: 0,
    memoireLibre: 40 * GO,
    memoireTotale: 16 * GO,
  }),
});
interface Prise {
  part: { memoire: number };
  rendre: () => void;
}
const prendre = (env: Record<string, string>, racine: string, o: Record<string, unknown> = {}) =>
  (prendreUnePart as unknown as (o: object) => Prise)({
    env,
    racine,
    libre: () => Infinity,
    occupe: () => 'rien',
    topologie: {
      lisible: false,
      coeurs: Array.from({ length: 32 }, (_, i) => ({ fils: [i], noeud: 0 })),
    },
    borneMs: 0,
    dire: () => {},
    lireLaReservation: () => null,
    ...o,
  });

describe('la mémoire d’une sorte tirée du registre', () => {
  const lignes = (pics: number[]) => pics.map(memoirePic => ({ sorte: 's', memoirePic }));

  it('réserve le 95e centile des pics et coupe à leur maximum plus un quart', () => {
    const pics = Array.from({ length: 100 }, (_, i) => 100 - i);
    expect(memoireDeLaSorte(lignes(pics), 's', 1000)).toEqual({ reservation: 95, limite: 125 });
  });

  it('ne dit rien sous 20 pics lisibles de la sorte', () => {
    const peu = [
      ...lignes(Array<number>(19).fill(4)),
      { sorte: 'autre', memoirePic: 4 },
      { sorte: 's', memoirePic: null },
    ];
    expect(memoireDeLaSorte(peu, 's', 1000)).toBeNull();
  });

  it('ne dépasse jamais le budget', () => {
    expect(memoireDeLaSorte(lignes(Array<number>(20).fill(900)), 's', 800)).toEqual({
      reservation: 800,
      limite: 800,
    });
  });
});

describe('la part d’une passe par sorte', () => {
  it('à 20 relevés, la mesure de la sorte l’emporte sur la mémoire déclarée', () => {
    const racine = projet(5);
    mesure(racine);
    expect(partDeLaPasse({ racine, env: poste(), sorte: 'Vérification' })).toEqual({
      coeurs: 3,
      memoire: 2 * GO,
      limite: 10 * GO,
    });
  });

  it('une sorte sans assez de relevés garde la part du projet pour les deux', () => {
    const racine = projet(5);
    mesure(racine);
    const part = partDeLaPasse({ racine, env: poste(), sorte: 'Passe finale' });
    expect(part).toEqual({ coeurs: 3, memoire: 5 * GO });
  });

  it('les relevés des séances ne montent pas la part par défaut des passes', () => {
    const racine = projet();
    relever(racine, 'seance-direct', 1, 8);
    expect(partDeLaPasse({ racine, env: poste(), sorte: 'Nuit' }).memoire).toBe(
      Math.floor((12 * GO * 10) / 28)
    );
  });

  it('l’admission compte les réservations : des passes que la part du projet ferait attendre partent', () => {
    // 12 Go de budget : deux parts de 8 Go (la limite, ou une part fixe) n'y tiendraient pas.
    const env = poste();
    const racine = projet(8);
    mesure(racine);
    const une = prendre(env, racine, { sorte: 'Vérification' });
    const deux = prendre(env, racine, { sorte: 'Vérification' });
    expect([une.part.memoire, deux.part.memoire]).toEqual([2 * GO, 2 * GO]);
    // La passe finale, sans relevé, demande les 8 Go déclarés : 8 libres sur 12.
    const trois = prendre(env, racine, { sorte: 'Passe finale' });
    expect(() => prendre(env, racine, { sorte: 'Passe finale' })).toThrow(
      /mémoire : 8 Go demandés, 0 Go libres/
    );
    [une, deux, trois].forEach(p => p.rendre());
  });

  it('la ligne d’attente dit la réservation et la limite', () => {
    const env = poste();
    const racine = projet();
    relever(racine, 'verification', 20, 8);
    const une = prendre(env, racine, { sorte: 'Vérification' });
    const dit: string[] = [];
    // Une horloge d'essai : un sommeil passe la borne.
    let t = 0;
    expect(() =>
      prendre(env, racine, {
        sorte: 'Vérification',
        borneMs: 1,
        maintenant: () => t,
        dormir: () => void (t += 10),
        dire: (l: string) => void dit.push(l),
      })
    ).toThrow(/mémoire/);
    expect(dit.join('\n')).toContain('(3 cœurs, 8 Go réservés, limite 10 Go)');
    une.rendre();
  });

  it('le panneau dit la réservation et la limite de chaque passe, « sans limite » une séance', () => {
    const base = { projet: 'p', ticket: null, coeurs: 3, memoire: 2 * GO };
    const lignes = lignesDesParts({
      budget: { coeurs: 28, memoire: 12 * GO },
      prises: [
        { ...base, sorte: 'Vérification', limite: 10 * GO },
        { ...base, sorte: 'séance direct', limite: null },
      ],
      attentes: [{ ...base, sorte: 'Nuit', limite: 10 * GO, raison: 'mémoire' }],
    });
    expect(lignes.slice(1)).toEqual([
      '🔒 Vérification · p · 3 cœurs · 2 Go, limite 10 Go',
      '🔒 séance direct · p · 3 cœurs · 2 Go, sans limite',
      '⏳ Nuit · p · attend mémoire · 2 Go réservés, limite 10 Go',
    ]);
  });

  it('une vraie part, lue par le panneau, dit sa réservation et sa limite', () => {
    // 12 Go de budget : 2 Go (vérification mesurée) et 8 Go tenus, 8 Go de plus attendent.
    const env = poste();
    const racine = projet(8);
    mesure(racine);
    const une = prendre(env, racine, { sorte: 'Vérification', ticket: 'essai.1' });
    const deux = prendre(env, racine, { sorte: 'Passe finale' });
    let lue = lireLaMesure(env);
    let t = 0;
    expect(() =>
      prendre(env, racine, {
        sorte: 'Passe finale',
        ticket: 'essai.2',
        borneMs: 1,
        maintenant: () => t,
        dormir: () => {
          lue = lireLaMesure(env);
          t += 10;
        },
      })
    ).toThrow(/mémoire/);

    const lignes = lignesDesParts(lue as never);
    expect(lignes.find(l => l.includes('essai.1'))).toContain('3 cœurs · 2 Go, limite 10 Go');
    expect(lignes.find(l => l.includes('essai.2'))).toContain('8 Go réservés, limite 8 Go');

    const { parts } = etatsDAgents({
      agents: [{ enCours: [{ id: 'essai.1' }, { id: 'essai.2' }] }],
      machine: lue,
    });
    expect(parts.get('essai.1')?.texte).toContain('3 cœurs · 2 Go, limite 10 Go');
    expect(parts.get('essai.2')?.texte).toContain('attend 3 cœurs');
    expect(parts.get('essai.2')?.texte).toContain('8 Go réservés, limite 8 Go');
    une.rendre();
    deux.rendre();
  });

  it('le groupe coupe à la limite, et seul un pic au-delà d’elle est un dépassement', () => {
    const part = { coeurs: 3, memoire: 2 * GO, limite: 10 * GO };
    expect(commandeDuGroupe({ part, cmd: 'c', args: [] }).args).toContain(`MemoryMax=${10 * GO}`);
    const juger = (memoirePic: number) =>
      depasseLaPart({ part, cpuNs: null, dureeMs: 1000, memoirePic });
    expect(juger(9 * GO)).toBeNull();
    expect(juger(11 * GO)).toMatch(/pour 10/);
  });
});

describe('la mesure d’une séance d’agent', () => {
  it('écrit au registre le pic de son groupe, sous la sorte de son rôle', () => {
    const racine = projet();
    const env = poste();
    const m = mesureDeLaSeance({
      racine,
      env,
      role: 'developpeur',
      ticket: 't',
      sonde: () => true,
      scope: {
        ouvrir: () => ({ unite: 'u.scope', lire: () => ({ cpuNs: 1, memoirePic: 3 * GO }) }),
      },
    });
    expect(m?.unite).toBe('u.scope');
    m?.garder({ status: 0 });
    expect(lireLaConsommation(racine)).toMatchObject([
      { sorte: 'seance-developpeur', ticket: 't', memoirePic: 3 * GO, issue: 'verte' },
    ]);
  });

  it('ne mesure rien sans gestionnaire de groupes', () => {
    expect(
      mesureDeLaSeance({ racine: projet(), env: {}, role: 'direct', sonde: () => false })
    ).toBeNull();
  });
});
