// Le rouge qui nomme un fichier de test d'un paquet lecteur étendu aux tests (`portes.lecteurs`) va
// au testwriter, seul à l'écrire, et le renvoi du développeur nomme en une fois tous les fichiers
// de test rouges : ceux du plan et ceux des lecteurs étendus.
import { describe, expect, it } from 'vitest';
import { attribuerLeRouge as attribuer } from '../../scripts/reprise.mjs';
import { renvoiDe as renvoi } from '../../scripts/transitions.mjs';

interface Lieu {
  fichier: string | null;
  gardes: string[];
  dansLePlan?: boolean;
}
interface Portes {
  tests: string[];
  code: string[];
  lecteurs?: string[];
}
const attribuerLeRouge = attribuer as unknown as (e: { lieux: Lieu[]; portes: Portes }) => {
  etape: string | null;
  fichiers: string[];
};
const renvoiDe = renvoi as unknown as (e: {
  fiche: { renvoi: string; raison?: string };
  passation: string | null;
  controlesRouges: string | null;
  fichiersRouges?: string[];
}) => string | null;

const LECTEUR = 'packages/b/tests/b.test.ts';
const AUTRE = 'packages/c/tests/c.test.ts';
const LOT = 'packages/a/tests/a.test.ts';
const CODE = 'packages/a/src/a.ts';
const lieu = (fichier: string): Lieu => ({ fichier, gardes: [], dansLePlan: true });

describe('le rouge d’un test de lecteur étendu est au testwriter', () => {
  it('un fichier de test du lecteur sans autre lieu : le testwriter, avec ce fichier', () => {
    expect(
      attribuerLeRouge({
        lieux: [lieu(LECTEUR)],
        portes: { tests: [LECTEUR], code: [], lecteurs: [LECTEUR] },
      })
    ).toEqual({ etape: 'testwriter', fichiers: [LECTEUR] });
  });

  it('deux lecteurs étendus : les deux fichiers vont au testwriter en une fois', () => {
    expect(
      attribuerLeRouge({
        lieux: [lieu(LECTEUR), lieu(AUTRE)],
        portes: { tests: [LECTEUR, AUTRE], code: [], lecteurs: [LECTEUR, AUTRE] },
      })
    ).toEqual({ etape: 'testwriter', fichiers: [LECTEUR, AUTRE] });
  });

  it('un rouge mêlé d’un fichier de code du plan et d’un test de lecteur nomme tous les fichiers au testwriter', () => {
    const r = attribuerLeRouge({
      lieux: [lieu(LECTEUR), lieu(CODE)],
      portes: { tests: [LECTEUR], code: [CODE], lecteurs: [LECTEUR] },
    });
    expect(r.etape).toBe('testwriter');
    expect([...r.fichiers].sort()).toEqual([CODE, LECTEUR].sort());
  });

  it('un test du lot et un test de lecteur rouges vont ensemble au testwriter', () => {
    const r = attribuerLeRouge({
      lieux: [lieu(LOT), lieu(LECTEUR)],
      portes: { tests: [LOT, LECTEUR], code: [], lecteurs: [LECTEUR] },
    });
    expect(r.etape).toBe('testwriter');
    expect([...r.fichiers].sort()).toEqual([LECTEUR, LOT].sort());
  });

  it('sans lecteur étendu, un test du plan que les gardes ne refusent reste au développeur', () => {
    expect(
      attribuerLeRouge({ lieux: [lieu(LOT)], portes: { tests: [LOT], code: [] } })
    ).toMatchObject({ etape: 'developpeur' });
  });
});

describe('le renvoi du développeur nomme tous les fichiers de test rouges', () => {
  const fiche = { renvoi: 'testwriter', raison: 'des tests à migrer' };

  it('les fichiers du plan et ceux des lecteurs étendus, en une fois', () => {
    const texte = renvoiDe({
      fiche,
      passation: 'ma passation',
      controlesRouges: 'sortie rouge',
      fichiersRouges: [LOT, LECTEUR, AUTRE],
    });
    for (const f of [LOT, LECTEUR, AUTRE]) {
      expect(texte).toContain(f);
    }
    expect(texte).toContain('ma passation');
    expect(texte).toContain('sortie rouge');
  });

  it('sans fichier rouge connu, le renvoi garde son texte', () => {
    const texte = renvoiDe({ fiche, passation: null, controlesRouges: null });
    expect(texte).toContain('Le développeur renvoie le rouge qui reste aux tests du lot');
    expect(texte).toContain('aucune');
  });
});
