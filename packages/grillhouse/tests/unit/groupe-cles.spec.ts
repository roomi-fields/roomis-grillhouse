/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// La lecture de `grillhouse.groupe` du package.json (scripts/groupe-cles.mjs) : une liste de
// projets, chacun par son chemin (absolu, ou relatif à la racine du projet), tous les projets du
// groupe, le projet lui-même compris. `lireGroupe(pkg, racine)` rend `{ groupe, fautes }` :
// `groupe` est null sans la clé, sinon `{ id, projets: [{ nom, chemin }] }` (`nom`, le dossier du
// projet, la clé de `external_projects` ; `chemin`, absolu) ; l'`id` est le même pour tous les
// projets qui déclarent les mêmes chemins, dans l'ordre qu'ils veulent. Chaque faute nomme sa clé
// (`grillhouse.groupe`, ou `grillhouse.groupe[<i>]`) et sa valeur. `projetsExternes(groupe,
// racine)` rend les `external_projects` de Beads du projet : `{ <nom>: <chemin> }`, les autres
// projets du groupe, chacun par son chemin relatif à la racine du projet.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const MODULE = path.resolve(__dirname, '../../scripts/groupe-cles.mjs');
/* eslint-disable @typescript-eslint/no-explicit-any */
const charger = (): any => createRequire(path.join(__dirname, 'x.cjs'))(MODULE);
const lireGroupe = (...a: any[]) => charger().lireGroupe(...a);
const projetsExternes = (...a: any[]) => charger().projetsExternes(...a);
/* eslint-enable @typescript-eslint/no-explicit-any */

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'groupe-cles-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// Trois projets du groupe, dossiers réels.
const dossier = (nom: string) => {
  const d = path.join(ESSAIS, nom);
  mkdirSync(d, { recursive: true });
  return d;
};
const SH = dossier('synthub');
const OB = dossier('osc-bridge');
const OSD = dossier('osd');
const groupe = (...liste: unknown[]) => ({ grillhouse: { groupe: liste } });

describe('la déclaration du groupe se lit, validée, avant tout travail', () => {
  it('sans la clé : aucun groupe, aucune faute', () => {
    expect(lireGroupe({}, SH)).toEqual({ groupe: null, fautes: [] });
    expect(lireGroupe({ grillhouse: {} }, SH)).toEqual({ groupe: null, fautes: [] });
  });

  it('une liste de chemins absolus : chaque projet par son nom et son chemin', () => {
    const r = lireGroupe(groupe(SH, OB, OSD), SH);
    expect(r.fautes).toEqual([]);
    expect(r.groupe.projets).toEqual([
      { nom: 'synthub', chemin: SH },
      { nom: 'osc-bridge', chemin: OB },
      { nom: 'osd', chemin: OSD },
    ]);
  });

  it('un chemin relatif se lit depuis la racine du projet', () => {
    const r = lireGroupe(groupe('.', '../osc-bridge'), SH);
    expect(r.fautes).toEqual([]);
    expect(r.groupe.projets.map((p: { chemin: string }) => p.chemin)).toEqual([SH, OB]);
  });

  it('un chemin absent du disque est refusé, nommé avec sa clé', () => {
    const absent = path.join(ESSAIS, 'absent');
    const r = lireGroupe(groupe(SH, absent), SH);
    expect(r.groupe).toBeNull();
    expect(r.fautes.map((f: { cle: string }) => f.cle)).toEqual(['grillhouse.groupe[1]']);
    expect(r.fautes[0].valeur).toContain('absent');
  });

  it('un doublon est refusé, même écrit sous deux formes', () => {
    const r = lireGroupe(groupe(SH, OB, '../osc-bridge'), SH);
    expect(r.groupe).toBeNull();
    expect(r.fautes.map((f: { cle: string }) => f.cle)).toContain('grillhouse.groupe[2]');
  });

  it('une clé mal formée est refusée : pas une liste', () => {
    for (const mauvais of ['osc-bridge', { SH }, 3, true]) {
      const r = lireGroupe({ grillhouse: { groupe: mauvais } }, SH);
      expect(r.groupe).toBeNull();
      expect(r.fautes.map((f: { cle: string }) => f.cle)).toEqual(['grillhouse.groupe']);
    }
  });

  it('un élément mal formé est refusé : ni chaîne, ni chaîne vide ou blanche', () => {
    const r = lireGroupe(groupe(SH, 4, '', '  ', null), SH);
    expect(r.groupe).toBeNull();
    expect(r.fautes.map((f: { cle: string }) => f.cle)).toEqual([
      'grillhouse.groupe[1]',
      'grillhouse.groupe[2]',
      'grillhouse.groupe[3]',
      'grillhouse.groupe[4]',
    ]);
  });

  it('une liste vide est refusée : un groupe nomme au moins un projet', () => {
    const r = lireGroupe(groupe(), SH);
    expect(r.groupe).toBeNull();
    expect(r.fautes.map((f: { cle: string }) => f.cle)).toEqual(['grillhouse.groupe']);
  });
});

describe('l’identité du groupe est celle de ses projets, dans l’ordre qu’on veut', () => {
  it('deux projets qui déclarent les mêmes chemins, dans deux ordres, ont la même identité', () => {
    const a = lireGroupe(groupe(SH, OB, OSD), SH).groupe.id;
    const b = lireGroupe(groupe(OSD, '../synthub', OB), OB).groupe.id;
    expect(typeof a).toBe('string');
    expect(a).not.toBe('');
    expect(b).toBe(a);
  });

  it('un autre ensemble de projets a une autre identité', () => {
    const a = lireGroupe(groupe(SH, OB, OSD), SH).groupe.id;
    expect(lireGroupe(groupe(SH, OB), SH).groupe.id).not.toBe(a);
  });
});

describe('les projets externes de Beads d’un projet sont les autres projets de son groupe', () => {
  it('chaque autre projet par son nom, le projet lui-même exclu', () => {
    const { groupe: g } = lireGroupe(groupe(SH, OB, OSD), SH);
    expect(projetsExternes(g, SH)).toEqual({
      'osc-bridge': path.relative(SH, OB),
      osd: path.relative(SH, OSD),
    });
    expect(projetsExternes(g, OB)).toEqual({
      synthub: path.relative(OB, SH),
      osd: path.relative(OB, OSD),
    });
  });

  it('un groupe d’un seul projet n’a aucun projet externe', () => {
    const { groupe: g } = lireGroupe(groupe(SH), SH);
    expect(projetsExternes(g, SH)).toEqual({});
  });
});
