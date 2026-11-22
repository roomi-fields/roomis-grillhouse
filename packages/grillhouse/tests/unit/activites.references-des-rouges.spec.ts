// `referencesDesRouges` (scripts/activites.mjs) : les références dont un rouge est le rouge, aussi
// mêlé à d'autres, comme `--update-snapshots` met à jour les snapshots qui échouent et laisse les
// autres échecs. Des tests moyens : un dépôt d'essai, sans processus.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import { depotDeReferences, type Reference } from './references-essai.js';

interface Lieu {
  fichier: string | null;
  gardes: string[];
  dansLePlan?: boolean;
}
const referencesDesRouges = activites.referencesDesRouges as (
  ctx: object,
  lieux: Lieu[],
  aElaguer?: boolean
) => { nom: string }[];

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'activites-references-des-rouges-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MESURE: Reference = {
  nom: 'la référence de la mesure',
  commande: 'node regenerer.mjs',
  fichiers: ['reference.txt'],
};
const EMPREINTE: Reference = {
  nom: "l'empreinte des scènes",
  commande: 'node empreinte.mjs',
  fichiers: ['packages/binder/empreinte/*.json'],
  tests: ['packages/binder/test/empreinte.test.mjs'],
};
const PLAFOND: Reference = {
  nom: 'le plafond des mots',
  commande: 'node abaisser.mjs',
  fichiers: ['packages/binder/plafond.txt'],
  gardes: ['un mot de librairie écrit dans le code'],
};
const GARDE_DES_MOTS = 'un mot de librairie écrit dans le code';
const noms = (rs: { nom: string }[]) => rs.map(r => r.nom);
const depot = (...references: Reference[]) => depotDeReferences(ESSAIS, references);

describe('les références d’un rouge', () => {
  it('un fichier que les fichiers d’une référence couvrent la désigne', () => {
    const ctx = depot(MESURE);
    expect(
      noms(
        referencesDesRouges(ctx, [{ fichier: 'reference.txt', gardes: ['x'], dansLePlan: false }])
      )
    ).toEqual([MESURE.nom]);
    expect(
      referencesDesRouges(ctx, [{ fichier: 'autre.txt', gardes: ['x'], dansLePlan: false }])
    ).toEqual([]);
  });

  it('un dossier sous un motif, jugé par son fichier de test : le test rouge désigne la référence, sans fichier couvert', () => {
    const ctx = depot(EMPREINTE);
    const lieu = (fichier: string): Lieu => ({ fichier, gardes: [], dansLePlan: false });
    expect(
      noms(referencesDesRouges(ctx, [lieu('packages/binder/test/empreinte.test.mjs')]))
    ).toEqual([EMPREINTE.nom]);
    expect(noms(referencesDesRouges(ctx, [lieu('packages/binder/empreinte/un.json')]))).toEqual([
      EMPREINTE.nom,
    ]);
    expect(referencesDesRouges(ctx, [lieu('packages/binder/empreinte/a/un.json')])).toEqual([]);
    expect(referencesDesRouges(ctx, [lieu('packages/binder/test/autre.test.mjs')])).toEqual([]);
  });

  it('le constat d’une garde nommée, sans fichier ou sur un fichier qu’elle couvre, est celui de la référence', () => {
    const ctx = depot(PLAFOND);
    const sans = { fichier: null, gardes: [GARDE_DES_MOTS], dansLePlan: false };
    const sur = {
      fichier: 'packages/binder/plafond.txt',
      gardes: [GARDE_DES_MOTS],
      dansLePlan: false,
    };
    expect(noms(referencesDesRouges(ctx, [sans]))).toEqual([PLAFOND.nom]);
    expect(noms(referencesDesRouges(ctx, [sur]))).toEqual([PLAFOND.nom]);
  });

  it('le constat d’une garde nommée sur le code d’un paquet du plan que la référence ne couvre pas est celui du développeur', () => {
    const ctx = depot(PLAFOND);
    const code = {
      fichier: 'packages/forms/src/index.mjs',
      gardes: [GARDE_DES_MOTS],
      dansLePlan: true,
    };
    expect(referencesDesRouges(ctx, [code])).toEqual([]);
  });

  it('le constat d’une garde nommée sur un fichier hors du plan que la référence ne couvre pas reste celui de la référence', () => {
    const ctx = depot(PLAFOND);
    const dehors = {
      fichier: 'packages/binder/src/a.mjs',
      gardes: [GARDE_DES_MOTS],
      dansLePlan: false,
    };
    expect(noms(referencesDesRouges(ctx, [dehors]))).toEqual([PLAFOND.nom]);
  });

  it('un rouge mêlé à d’autres désigne sa référence sans désigner les autres', () => {
    const ctx = depot(MESURE, PLAFOND);
    const lieux: Lieu[] = [
      { fichier: 'packages/forms/src/index.mjs', gardes: ['autre'], dansLePlan: true },
      { fichier: 'reference.txt', gardes: ['reference'], dansLePlan: false },
    ];
    expect(noms(referencesDesRouges(ctx, lieux))).toEqual([MESURE.nom]);
  });

  it('une clé de la dette inscrite au-dessus de ce que la garde trouve désigne la dette des gardes, sans rouge', () => {
    const ctx = depot(MESURE);
    expect(noms(referencesDesRouges(ctx, [], true))).toEqual(['la dette des gardes']);
    expect(referencesDesRouges(ctx, [], false)).toEqual([]);
  });

  it('le constat de la garde des turbo.json sur le turbo.json d’un paquet hors du plan désigne la référence des turbo.json', () => {
    const ctx = depot();
    const lieu = {
      fichier: 'packages/binder/turbo.json',
      gardes: ['turbo-des-paquets'],
      dansLePlan: false,
    };
    expect(noms(referencesDesRouges(ctx, [lieu]))).toEqual(['les turbo.json des paquets']);
  });

  it('un constat de garde du cadre sur le fichier d’une référence du cadre la désigne par sa garde seule', () => {
    const ctx = depot();
    const lieu = { fichier: 'docs/agents/index-des-interfaces.md', gardes: ['index-interfaces'] };
    expect(noms(referencesDesRouges(ctx, [lieu]))).toEqual(["l'index des interfaces"]);
  });
});
