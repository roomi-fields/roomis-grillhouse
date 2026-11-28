// The standard input of a role session, composed by the one module both launchers call: the
// `initialize` request with the skills of the session, then the whole instruction as a message of
// the user (claude's `--input-format stream-json`).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lireLEntree } from '@roomi-fields/grillhouse-matiere/test-fixtures';

const MODULE = path.resolve(__dirname, '../../scripts/entree-de-seance.mjs');

type Composer = (entree: { competences: string[]; consigne: string }) => string;
const composer = async () =>
  ((await import(pathToFileURL(MODULE).href)) as { entreeDeSeance: Composer }).entreeDeSeance;

describe('l’entrée standard d’une séance de rôle', () => {
  it.each([
    ['une compétence', ['grillhouse:relecteur'], 'TON TICKET : demo-1\n'],
    [
      'les compétences dans leur ordre',
      ['grillhouse:developpeur', 'grillhouse:systematic-debugging', 'grillhouse:mesure'],
      'Une ligne.\n\nUne autre, « citée », avec "des guillemets", un \\ et ${des} $signes.\n',
    ],
    ['une consigne qui passe 128 Kio', ['grillhouse:direct'], 'é ligne\n'.repeat(20_000)],
  ])(
    'porte la demande initialize avec la liste, puis la consigne entière : %s',
    async (_cas, competences, consigne) => {
      const entreeDeSeance = await composer();
      expect(lireLEntree(entreeDeSeance({ competences, consigne }))).toEqual({
        competences,
        consigne,
      });
    }
  );

  it('porte une liste vide telle quelle, qui ne laisse aucune compétence à la séance', async () => {
    const entreeDeSeance = await composer();
    expect(lireLEntree(entreeDeSeance({ competences: [], consigne: 'x' }))?.competences).toEqual(
      []
    );
  });
});
