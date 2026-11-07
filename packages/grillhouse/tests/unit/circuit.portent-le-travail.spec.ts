import { describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/activites.mjs';

// grillhouse-3e2.5 — la preuve du rouge n'exige le rouge que des tests que la fiche du testwriter
// dit porter le travail du ticket (`portent_le_travail`). Le compte de la preuve : `nommes` (verts
// avant le code que la fiche nomme : un défaut), `nonNommes` (verts avant le code qu'elle ne nomme
// pas : acceptés), `anciens` (verts que HEAD tient déjà), `rouges`, `casses`, `misDeCote`.

const preuveReussie = circuit.preuveReussie as (
  compte: Record<string, number>,
  o: { inchange: boolean }
) => boolean;

const COMPTE = {
  fichiers: 1,
  rouges: 0,
  casses: 0,
  nommes: 0,
  nonNommes: 0,
  anciens: 0,
  misDeCote: 0,
};
const COMPORTEMENT = { inchange: false };
const INCHANGE = { inchange: true };

describe('grillhouse-3e2.5, critères 2, 6, 8 et 9 — les verts que la fiche ne nomme pas', () => {
  it('critère 9 : un rouge, même avec des verts non nommés, passe la preuve', () => {
    expect(preuveReussie({ ...COMPTE, rouges: 1, nonNommes: 3 }, COMPORTEMENT)).toBe(true);
  });

  it('critère 9 : un rouge existant (sans fichier du lot) passe aussi', () => {
    expect(preuveReussie({ ...COMPTE, fichiers: 0, rouges: 1 }, COMPORTEMENT)).toBe(true);
  });

  it('critères 2 et 8 : des verts non nommés sans aucun rouge ne suffisent pas', () => {
    expect(preuveReussie({ ...COMPTE, nonNommes: 2 }, COMPORTEMENT)).toBe(false);
  });

  it('critère 8 : des verts que HEAD tient déjà sans aucun rouge ne suffisent plus', () => {
    expect(preuveReussie({ ...COMPTE, anciens: 2 }, COMPORTEMENT)).toBe(false);
    expect(preuveReussie({ ...COMPTE, anciens: 1, nonNommes: 1 }, COMPORTEMENT)).toBe(false);
  });

  it('critère 8 : un lot vide, sans rouge, échoue', () => {
    expect(preuveReussie({ ...COMPTE, fichiers: 0 }, COMPORTEMENT)).toBe(false);
  });

  it('critère 9 : un rouge avec un vert que HEAD tient déjà passe', () => {
    expect(preuveReussie({ ...COMPTE, rouges: 1, anciens: 4 }, COMPORTEMENT)).toBe(true);
  });
});

describe('grillhouse-3e2.5, critères 3, 7 et 8 — les verts que la fiche nomme', () => {
  it('critère 7 : un vert nommé est un défaut, même avec un rouge', () => {
    expect(preuveReussie({ ...COMPTE, rouges: 2, nommes: 1 }, COMPORTEMENT)).toBe(false);
  });

  it('critère 3 : un vert nommé sans autre rouge échoue', () => {
    expect(preuveReussie({ ...COMPTE, nommes: 1 }, COMPORTEMENT)).toBe(false);
  });

  it('critère 8 : un fichier qui ne se charge pas échoue, même avec un rouge', () => {
    expect(preuveReussie({ ...COMPTE, rouges: 1, casses: 1 }, COMPORTEMENT)).toBe(false);
  });
});

describe('grillhouse-3e2.5, critère 8 — sous « comportement inchangé », la preuve passe avec chaque vert', () => {
  it('chaque vert passe, nommé ou non, tenu par HEAD ou non', () => {
    expect(preuveReussie({ ...COMPTE, nonNommes: 2 }, INCHANGE)).toBe(true);
    expect(preuveReussie({ ...COMPTE, nommes: 1 }, INCHANGE)).toBe(true);
    expect(preuveReussie({ ...COMPTE, anciens: 1 }, INCHANGE)).toBe(true);
  });

  it('seul un fichier qui ne se charge pas l’échoue', () => {
    expect(preuveReussie({ ...COMPTE, nonNommes: 1, casses: 1 }, INCHANGE)).toBe(false);
  });
});

describe('grillhouse-3e2.5, arbitrage — la liste portent_le_travail se remplace d’une fiche à l’autre', () => {
  const portentLeTravail = circuit.portentLeTravail as (
    fiches: Array<{ portent_le_travail?: Array<{ fichier: string; test?: string }> }>
  ) => Array<{ fichier: string; test?: string }>;
  const A = [{ fichier: 'a.spec.ts', test: 'a' }];
  const B = [{ fichier: 'b.spec.ts' }];

  it('une fiche relancée avec [] retire les tests nommés avant', () => {
    expect(portentLeTravail([{ portent_le_travail: A }, { portent_le_travail: [] }])).toEqual([]);
  });

  it('une liste donnée remplace celle d’avant', () => {
    expect(portentLeTravail([{ portent_le_travail: A }, { portent_le_travail: B }])).toEqual(B);
  });

  it('un champ absent garde la liste de la fiche d’avant', () => {
    expect(portentLeTravail([{ portent_le_travail: A }, {}])).toEqual(A);
  });

  it('sans aucune liste, rien ne porte le travail', () => {
    expect(portentLeTravail([{}])).toEqual([]);
  });
});

describe('grillhouse-3e2.5, critère 10 — un test nommé mais joué la nuit seule n’est pas exigé rouge', () => {
  it('un lot dont seuls les fichiers sont mis de côté passe sans rouge', () => {
    expect(preuveReussie({ ...COMPTE, fichiers: 0, misDeCote: 1 }, COMPORTEMENT)).toBe(true);
  });

  it('un fichier mis de côté ne compte pas comme un vert nommé : seul le jour juge', () => {
    expect(preuveReussie({ ...COMPTE, rouges: 1, misDeCote: 2 }, COMPORTEMENT)).toBe(true);
    expect(preuveReussie({ ...COMPTE, fichiers: 1, misDeCote: 1 }, COMPORTEMENT)).toBe(false);
  });
});
