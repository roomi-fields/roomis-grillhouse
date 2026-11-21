/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
// L'attente de la part d'une passe sous la réservation de la machine (scripts/places-de-la-machine.mjs,
// `prendreUnePart`), comme `kubectl cordon` : la réservation se lit à chaque tour de la boucle
// d'attente par son lecteur (`lireLaReservation`, donné par l'essai : la vue du déroulé des places
// par défaut), jamais sous le verrou d'admission. Sous la fermeture du superviseur, une passe neuve
// attend sans borne, écrit sa part « attend » avec « machine fermée par le superviseur », et la
// prend à la réouverture ; sous la nuit, seule la passe au jeton de la réservation passe, les autres
// gardent la borne (75). Un lecteur qui échoue vaut « pas de réservation ». La machine, le temps et
// les disques sont ceux d'un essai.
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
  VARIABLE_JETON,
} from '../../scripts/places-de-la-machine.mjs';

const GO = 1024 ** 3;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'part-sous-reservation-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const unDossier = (nom: string) => mkdtempSync(path.join(ESSAIS, `${nom}-`));

function projet() {
  const racine = unDossier('projet');
  expect(spawnSync('git', ['-C', racine, 'init', '-q']).status).toBe(0);
  writeFileSync(path.join(racine, 'package.json'), JSON.stringify({ name: 'essai' }));
  return racine;
}
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

type Reservation = { auteur?: 'nuit' | 'superviseur'; jeton: string; depuis?: number } | null;
const FERMEE: Reservation = { auteur: 'superviseur', jeton: 'j-sup', depuis: 1 };
const NUIT: Reservation = { auteur: 'nuit', jeton: 'j-nuit', depuis: 1 };

// Un temps d'essai : chaque sommeil avance l'horloge de <pas> ms, très au-delà de la borne.
function essai(
  env: Record<string, string>,
  lectures: (Reservation | 'echec')[],
  o: { borneMs?: number; pas?: number; avantLecture?: (n: number) => void } = {}
) {
  let t = 1_000_000;
  let n = 0;
  const dit: string[] = [];
  const appels = () => n;
  const prendre = () =>
    (prendreUnePart as unknown as (o: object) => any)({
      env,
      racine: projet(),
      libre: () => Infinity,
      occupe: () => 'rien',
      topologie: {
        lisible: false,
        coeurs: Array.from({ length: 32 }, (_, i) => ({ fils: [i], noeud: 0 })),
      },
      chargeDesCoeurs: () => 0,
      borneMs: o.borneMs ?? 1000,
      rappelMs: 1,
      dire: (l: string) => dit.push(l),
      maintenant: () => t,
      dormir: () => {
        t += o.pas ?? 10_000_000;
      },
      lireLaReservation: () => {
        const i = n++;
        o.avantLecture?.(i);
        const v = lectures[Math.min(i, lectures.length - 1)];
        if (v === 'echec') {
          throw new Error('le serveur ne répond pas');
        }
        return v;
      },
    });
  return { prendre, dit, appels };
}

describe('la part d’une passe neuve sous la fermeture du superviseur', () => {
  it('attend sans sortir en 75 au-delà de sa borne, dit « machine fermée par le superviseur », puis prend sa part à la réouverture', () => {
    const env = poste();
    const e = essai(env, [FERMEE, FERMEE, FERMEE, FERMEE, null]);
    const prise = e.prendre();
    expect(prise.part).not.toBeNull();
    expect(e.appels()).toBe(5);
    expect(e.dit.join('\n')).toMatch(/machine fermée par le superviseur/);
    prise.rendre();
  });

  it('écrit sa part « attend » avec cette raison au dossier des parts pendant l’attente', () => {
    const env = poste();
    let vue: any[] = [];
    const e = essai(env, [FERMEE, FERMEE, null], {
      avantLecture: i => {
        if (i === 2) {
          vue = lireLesParts(dossierDesParts(env)).attentes;
        }
      },
    });
    e.prendre().rendre();
    expect(vue).toHaveLength(1);
    expect(vue[0].etat).toBe('attend');
    expect(vue[0].raison).toMatch(/machine fermée par le superviseur/);
  });

  it('le jeton de la nuit, même égal à celui de la fermeture, n’ouvre rien', () => {
    const env = poste({ [VARIABLE_JETON]: 'j-sup' });
    const e = essai(env, [FERMEE, FERMEE, FERMEE, null]);
    const prise = e.prendre();
    expect(e.appels()).toBe(4);
    prise.rendre();
  });

  it('une passe en attente de budget quand la machine ferme ne prend pas sa part au tour suivant', () => {
    const env = poste();
    const dossier = dossierDesParts(env);
    // Une autre passe vivante tient tout le budget (28 cœurs, 60 Go).
    poserLaPart(dossier, {
      id: 'autre',
      pid: process.pid,
      depart: departDe(process.pid),
      rang: 0,
      coeurs: 28,
      memoire: 60 * GO,
      etat: 'tient',
    });
    const e = essai(env, [null, FERMEE, FERMEE, null], {
      avantLecture: i => {
        // La part libérée au 2e tour : seule la fermeture retient encore la passe.
        if (i === 1) {
          rmSync(path.join(dossier, 'autre.json'), { force: true });
        }
      },
    });
    const prise = e.prendre();
    // Prise au 4e tour seulement : ni au tour où le budget se libère, ni au suivant, sous fermeture.
    expect(e.appels()).toBe(4);
    prise.rendre();
  });
});

describe('la part d’une passe sous la réservation de la nuit', () => {
  it('la passe de la nuit, qui porte le jeton de la réservation, prend sa part', () => {
    const env = poste({ [VARIABLE_JETON]: 'j-nuit' });
    const prise = essai(env, [NUIT]).prendre();
    expect(prise.part).not.toBeNull();
    prise.rendre();
  });

  it('une passe sans jeton garde la borne de son attente : 75 à la borne, « la nuit tient la machine »', () => {
    const env = poste();
    const e = essai(env, [NUIT]);
    let erreur: any;
    try {
      e.prendre();
    } catch (x) {
      erreur = x;
    }
    expect(erreur?.code).toBe(75);
    expect(String(erreur?.message)).toMatch(/la nuit tient la machine/);
  });

  it('la variable seule, ou le jeton d’une nuit passée, n’ouvre rien : la passe attend, 75 à la borne', () => {
    const env = poste({ [VARIABLE_JETON]: 'j-ancienne-nuit' });
    let erreur: any;
    try {
      essai(env, [NUIT]).prendre();
    } catch (x) {
      erreur = x;
    }
    expect(erreur?.code).toBe(75);
  });

  it('la nuit levée avant la borne, la passe sans jeton prend sa part', () => {
    const env = poste();
    const prise = essai(env, [NUIT, null], { pas: 1 }).prendre();
    expect(prise.part).not.toBeNull();
    prise.rendre();
  });
});

describe('la part d’une passe hors de toute réservation', () => {
  it('sans réservation, la passe prend sa part comme avant', () => {
    const env = poste();
    const e = essai(env, [null]);
    const prise = e.prendre();
    expect(prise.part).not.toBeNull();
    expect(e.appels()).toBeGreaterThanOrEqual(1);
    prise.rendre();
  });

  it('un lecteur qui échoue (serveur muet, délai dépassé) vaut « pas de réservation », sans sortir en 1', () => {
    const env = poste();
    const prise = essai(env, ['echec']).prendre();
    expect(prise.part).not.toBeNull();
    prise.rendre();
  });

  it('un lecteur qui échoue un tour puis lit la fermeture voit la fermeture au tour suivant', () => {
    const env = poste();
    const dossier = dossierDesParts(env);
    // Une autre passe vivante tient tout le budget : la passe attend au tour où la lecture échoue.
    poserLaPart(dossier, {
      id: 'autre',
      pid: process.pid,
      depart: departDe(process.pid),
      rang: 0,
      coeurs: 28,
      memoire: 60 * GO,
      etat: 'tient',
    });
    const e = essai(env, ['echec', FERMEE, null], {
      avantLecture: i => {
        if (i === 1) {
          rmSync(path.join(dossier, 'autre.json'), { force: true });
        }
      },
    });
    e.prendre().rendre();
    // Le budget libre au 2e tour : seule la fermeture lue retient la passe jusqu'au 3e.
    expect(e.appels()).toBe(3);
  });

  it('une part déjà tenue (la part du parent) ne lit aucune réservation', () => {
    const env = poste({ GRILLHOUSE_PART_TENUE: 'parent' });
    const e = essai(env, [FERMEE]);
    expect(e.prendre().part).toBeNull();
    expect(e.appels()).toBe(0);
  });
});
