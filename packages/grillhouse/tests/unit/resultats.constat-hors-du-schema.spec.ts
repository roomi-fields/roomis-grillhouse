// A finding of the reviewer's sheet names its agent alone (scripts/resultats.mjs, `lireFiche`): a
// finding that names a component too is out of the sheet's schema, its fault read at the path of
// the field, and the circuit asks the sheet again.
import { describe, expect, it } from 'vitest';
import { lireFiche } from '../../scripts/resultats.mjs';

const sortie = (structured: unknown) =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: 'abc',
    result: 'fini',
    structured_output: structured,
  });
const lire = (fiche: Record<string, unknown>) =>
  lireFiche('relecteur', sortie(fiche)) as { erreur?: string; fiche?: unknown };

const CONSTAT = {
  titre: 'packages/forms/src/index.mjs:1 — un nom flou',
  genre: 'bloquant',
  piece: 'packages/forms/src/index.mjs:1',
  regle: 'critère 1',
  role: 'developpeur',
  corps: 'Le nom ne dit pas la mesure.',
};

describe('un constat du relecteur qui nomme un composant', () => {
  it('est refusé : le champ composant est hors du schéma, son chemin dit', () => {
    const r = lire({ verdict: 'RENDU', constats: [{ ...CONSTAT, composant: '000-forms' }] });
    expect(r.erreur).toContain('constats[0].composant : hors du schéma');
    expect(r.fiche).toBeUndefined();
  });

  it('un constat qui ne nomme que son agent passe', () => {
    expect(lire({ verdict: 'RENDU', constats: [CONSTAT] }).erreur).toBeUndefined();
  });

  it('le refus nomme le constat fautif, pas les autres', () => {
    const r = lire({
      verdict: 'RENDU',
      constats: [CONSTAT, { ...CONSTAT, titre: 'autre', composant: '030-binder' }],
    });
    expect(r.erreur).toContain('constats[1].composant : hors du schéma');
    expect(r.erreur).not.toContain('constats[0]');
  });
});
