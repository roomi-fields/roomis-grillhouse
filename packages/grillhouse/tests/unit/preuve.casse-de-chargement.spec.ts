// grillhouse-s2i — la preuve du rouge ne casse pas un harnais d'intégration Rust sans test propre.
// Un fichier de test changé du lot qui ne produit aucun résultat à son nom n'est un casse que
// lorsqu'il a vraiment échoué à charger. Le harnais que la charte prescrit (un seul exécutable par
// moment : tests/it/main.rs, `mod common; mod session_isolation;`, aucun #[test] propre) ne produit
// jamais de résultat à son nom — ses tests vivent dans ses sous-modules — mais le binaire compile et
// joue (code 0) : il n'a pas échoué, il n'a simplement pas de test à lui. casseDeChargement, le
// prédicat qui décide, ne le compte pas casse, et garde le casse pour un vrai échec de chargement.
import { describe, expect, it } from 'vitest';
import { casseDeChargement } from '../../scripts/activites.mjs';

type Res = { tests: { nom: string; etat: string }[]; etat?: string; message?: string };
type Arg = { res?: Res; code: number; constructions: { nom: string }[]; aDesResultats?: boolean };
const casse = casseDeChargement as (a: Arg) => string | null;

describe('casseDeChargement — un fichier de test sans résultat propre', () => {
  it('un harnais d’intégration (aucun test propre) sur un run code 0, ses voisins verts, n’est pas un casse', () => {
    // tests/it/main.rs : le binaire a compilé et joué, aucun résultat à son nom → pas de casse.
    expect(casse({ res: undefined, code: 0, constructions: [] })).toBe(null);
  });

  it('un vrai échec de chargement (code ≠ 0, aucun résultat produit) reste un casse', () => {
    expect(casse({ res: undefined, code: 101, constructions: [], aDesResultats: false })).toBe(
      'non-joue'
    );
  });

  it('un harnais sur un run code ≠ 0 dont les modules ont produit des résultats a joué : pas un casse', () => {
    // tests/it/main.rs : le binaire unique a compilé et joué, ses modules ont rougi (le travail du
    // ticket), donc le binaire sort en code ≠ 0 — ce n’est pas un échec de chargement.
    expect(casse({ res: undefined, code: 1, constructions: [], aDesResultats: true })).toBe(null);
  });

  it('un fichier avant la construction du paquet (constructions présentes) joue aux contrôles, pas un casse', () => {
    expect(casse({ res: undefined, code: 1, constructions: [{ nom: 'osc-bridge' }] })).toBe(null);
  });

  it('un résultat présent, sans test, qui a échoué est un casse (ne se charge pas, inchangé)', () => {
    expect(
      casse({ res: { tests: [], etat: 'failed', message: 'erreur' }, code: 0, constructions: [] })
    ).toBe('ne-charge-pas');
  });

  it('un résultat présent, sans test, qui n’a pas échoué n’est pas un casse (pas de test propre)', () => {
    expect(casse({ res: { tests: [], etat: 'passed' }, code: 0, constructions: [] })).toBe(null);
  });

  it('un fichier avec un test propre n’est jamais un casse de chargement', () => {
    expect(
      casse({ res: { tests: [{ nom: 'un', etat: 'passed' }] }, code: 0, constructions: [] })
    ).toBe(null);
  });
});
