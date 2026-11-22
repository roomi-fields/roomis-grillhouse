// L'attente d'une place sous la fermeture du superviseur (scripts/places-du-serveur.mjs,
// `attendreLaPlace`, publiée pour le test) : la borne d'attente ne la coupe pas (ni sortie 75, ni
// demande retirée) ; elle dit « machine fermée par le superviseur » et attend la réouverture, où
// la demande est jugée de nouveau et donnée. L'attente d'une autre raison garde sa borne.
// Petits tests : un déroulé simulé par ses deux appels (la lecture de la demande, le retrait).
import { describe, expect, it, vi } from 'vitest';
import { attendreLaPlace } from '../../scripts/places-du-serveur.mjs';

const FERMEE = 'machine fermée par le superviseur : la place est donnée à la réouverture';
const LA_DEMANDE = 'laDemande';

function essai(etats: object[]) {
  const lues: object[] = [...etats];
  const retraits: string[] = [];
  const lignes: string[] = [];
  const h = { query: vi.fn(() => Promise.resolve(lues.length > 1 ? lues.shift() : lues[0])) };
  const places = {
    rendreLaPlace: (_c: unknown, id: string) => {
      retraits.push(id);
      return Promise.resolve();
    },
  };
  const ecrire = vi.spyOn(process.stdout, 'write').mockImplementation(l => {
    lignes.push(String(l));
    return true;
  });
  const jouer = async () => {
    try {
      return await (attendreLaPlace as unknown as (...a: unknown[]) => Promise<number>)(
        { client: {} },
        places,
        {
          h,
          id: 'moi',
          rang: 1,
          borneMs: 0,
          rappelMs: 30_000,
          sous: (f: () => unknown) => f(),
          LA_DEMANDE,
        }
      );
    } finally {
      ecrire.mockRestore();
    }
  };
  return { jouer, retraits, lignes, h };
}

describe('l’attente d’une place sous la fermeture du superviseur', () => {
  it('passe sa borne sans sortie 75 ni retrait, dit la fermeture, puis prend la place à la réouverture', async () => {
    const e = essai([
      { etat: 'attend', rang: 1, raison: FERMEE },
      { etat: 'attend', rang: 1, raison: FERMEE },
      { etat: 'donnee', rang: 1 },
    ]);
    expect(await e.jouer()).toBe(0);
    expect(e.retraits).toEqual([]);
    expect(e.lignes.join('')).toMatch(/machine fermée par le superviseur/);
    expect(e.lignes.join('')).not.toMatch(/bornée/);
  }, 30_000);

  it('une attente d’une autre raison atteint sa borne : 75, la demande retirée', async () => {
    const e = essai([{ etat: 'attend', rang: 1, raison: 'aucune place libre : 3 prises sur 3' }]);
    expect(await e.jouer()).toBe(75);
    expect(e.retraits).toEqual(['moi']);
    expect(e.lignes.join('')).toMatch(/bornée/);
  });
});
