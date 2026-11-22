// `lesReferences` (scripts/activites.mjs) : la liste des références du circuit, celles que le projet
// déclare (`grillhouse.references`), les fichiers qu'il engendre, puis celles du cadre. Des tests
// moyens : un dépôt d'essai, sans processus.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import { depotDeReferences, type Reference } from './references-essai.js';

interface Ref {
  nom: string;
  commande: string;
  fichiers: string[];
  tests: string[];
  lit: string[];
  gardes: string[];
  entiers: string[];
  cadre: boolean;
}
const lesReferences = activites.lesReferences as (ctx: object) => Ref[];

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'activites-les-references-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MESURE: Reference = {
  nom: 'la référence de la mesure',
  commande: 'node regenerer.mjs',
  fichiers: ['reference.txt'],
};
const noms = (rs: Ref[]) => rs.map(r => r.nom);

describe('les références du circuit', () => {
  it('sans déclaration du projet, aucune étape ne régénère un fichier du projet : seules restent celles du cadre', () => {
    const rs = lesReferences(depotDeReferences(ESSAIS, []));
    expect(rs.length).toBeGreaterThan(0);
    expect(rs.every(r => r.cadre)).toBe(true);
    expect(noms(rs)).not.toContain(MESURE.nom);
    expect(noms(rs)).toContain('la dette des gardes');
  });

  it('la référence que le projet déclare vient avant celles du cadre, ses listes vides quand elle n’en donne pas', () => {
    const rs = lesReferences(depotDeReferences(ESSAIS, [MESURE]));
    expect(rs[0]).toEqual({
      ...MESURE,
      tests: [],
      lit: [],
      gardes: [],
      entiers: [],
      cadre: false,
    });
    expect(rs.slice(1).every(r => r.cadre)).toBe(true);
  });

  it('garde les tests, les lectures et les gardes que la déclaration donne', () => {
    const rs = lesReferences(
      depotDeReferences(ESSAIS, [
        { ...MESURE, tests: ['t.test.mjs'], lit: ['src/**'], gardes: ['reference'] },
      ])
    );
    expect(rs[0]).toMatchObject({ tests: ['t.test.mjs'], lit: ['src/**'], gardes: ['reference'] });
  });

  it('refuse une déclaration sans nom, sans commande ou sans fichier', () => {
    const rs = lesReferences(
      depotDeReferences(ESSAIS, [
        { ...MESURE, nom: undefined as unknown as string },
        { ...MESURE, commande: undefined as unknown as string },
        { ...MESURE, fichiers: [] },
        { ...MESURE, nom: 'la bonne' },
      ])
    );
    expect(rs.filter(r => !r.cadre).map(r => r.nom)).toEqual(['la bonne']);
  });

  it('une référence du projet qui couvre le premier fichier d’une référence du cadre la remplace', () => {
    const duCadre = lesReferences(depotDeReferences(ESSAIS, []));
    const index = duCadre.find(r => r.nom === "l'index des interfaces")!;
    const rs = lesReferences(
      depotDeReferences(ESSAIS, [
        { nom: 'mon index', commande: 'node index.mjs', fichiers: [index.fichiers[0]!] },
      ])
    );
    expect(noms(rs)).toContain('mon index');
    expect(noms(rs)).not.toContain("l'index des interfaces");
    expect(noms(rs)).toContain('la dette des gardes');
  });
});
