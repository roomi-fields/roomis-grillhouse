// The elements of the lot as the reviewer's instruction lists them (scripts/activites.mjs,
// `texteDesElements`): one line each; in a bounded review each marked « à rejuger » or « reprise »;
// then the sources the language service does not read. One suite for the four forms the list takes.
import { describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';

interface Liste {
  etat: string;
  raison?: string;
  elements: object[];
  horsDuService: string[];
  service?: string | null;
}
interface Bornee {
  touches: Set<string> | null;
  lignes: Map<string, object>;
}
const texteDesElements = activites.texteDesElements as (
  liste: Liste,
  bornee?: Bornee | null
) => string;

const MESURE = 'packages/forms/src/index.mjs#mesure';
const UNITE = 'packages/forms/src/index.mjs#unite';
const element = (id: string, plus: object = {}) => ({
  id,
  genre: 'constante',
  statut: 'changé',
  exporte: false,
  paquet: '000-forms',
  fichier: 'packages/forms/src/index.mjs',
  ligne: 1,
  ...plus,
});
const fait = (elements: object[], plus: Partial<Liste> = {}): Liste => ({
  etat: 'fait',
  elements,
  horsDuService: [],
  ...plus,
});
const ligneDAvant = (piece: string) => ({
  element: UNITE,
  conforme: 'oui',
  document: 'CADRE',
  reference: 'de 000-forms, R1',
  piece,
});

describe('la liste des éléments du lot dans la consigne du relecteur', () => {
  it('une ligne par élément : son id, sa sorte, son statut, son export, son paquet, sa place', () => {
    expect(
      texteDesElements(fait([element(MESURE), element(UNITE, { exporte: true, ligne: 2 })]))
    ).toBe(
      [
        `- \`${MESURE}\` : constante, changé, non exporté, paquet 000-forms, packages/forms/src/index.mjs:1`,
        `- \`${UNITE}\` : constante, changé, exporté, paquet 000-forms, packages/forms/src/index.mjs:2`,
      ].join('\n')
    );
  });

  it('dit que le lot ne change aucun élément quand la liste est vide', () => {
    expect(texteDesElements(fait([]))).toBe('aucun : le lot ne change aucun élément du code.');
  });

  it('dit pourquoi la liste n’a pas pu être calculée, le relecteur relevant alors chaque élément', () => {
    expect(
      texteDesElements({ etat: 'echec', raison: 'tsc a planté', elements: [], horsDuService: [] })
    ).toBe(
      "aucun : la liste n'a pas pu être calculée (tsc a planté) ; tu relèves toi-même chaque élément du lot."
    );
  });

  it('en relecture bornée, marque à rejuger l’élément que la différence touche', () => {
    const texte = texteDesElements(fait([element(MESURE)]), {
      touches: new Set([MESURE]),
      lignes: new Map([[MESURE, ligneDAvant('x:1')]]),
    });
    expect(texte).toMatch(/ — à rejuger : la différence le touche$/);
  });

  it('en relecture bornée, reprend la ligne d’avant de l’élément que la différence ne touche pas', () => {
    const texte = texteDesElements(fait([element(UNITE, { statut: 'neuf', ligne: 2 })]), {
      touches: new Set([MESURE]),
      lignes: new Map([[UNITE, ligneDAvant('packages/forms/src/index.mjs:2')]]),
    });
    expect(texte).toBe(
      `- \`${UNITE}\` : constante, neuf, non exporté, paquet 000-forms, packages/forms/src/index.mjs:2 — reprise, la différence ne le touche pas : oui — CADRE de 000-forms, R1 — packages/forms/src/index.mjs:2`
    );
  });

  it('en relecture bornée, un élément sans ligne d’avant est à rejuger', () => {
    const texte = texteDesElements(fait([element(MESURE)]), {
      touches: new Set([MESURE]),
      lignes: new Map(),
    });
    expect(texte).toMatch(/ — à rejuger : aucune ligne d'avant$/);
  });

  it('en relecture bornée sans ensemble touché (touches nul), chaque élément avec une ligne d’avant est à rejuger', () => {
    const texte = texteDesElements(fait([element(UNITE)]), {
      touches: null,
      lignes: new Map([[UNITE, ligneDAvant('x:1')]]),
    });
    expect(texte).toMatch(/ — à rejuger : la différence le touche$/);
  });

  it('nomme la forme « <fichier>#<nom> » des fichiers hors du service de langage, faute de tsconfig.json', () => {
    const texte = texteDesElements(
      fait([element(MESURE)], {
        horsDuService: ['packages/forms/src/a.mjs', 'packages/forms/src/b.mjs'],
      })
    );
    expect(texte).toContain(
      '- Hors du service de langage (aucun tsconfig.json ne les lit), tu relèves toi-même leurs éléments, une ligne de conformité chacun, son élément `<fichier>#<nom>` : packages/forms/src/a.mjs, packages/forms/src/b.mjs.'
    );
  });

  it('dit, hors du service de langage, que le service n’a pas pu tourner quand c’est la cause', () => {
    const texte = texteDesElements(
      fait([], { horsDuService: ['packages/forms/src/a.mjs'], service: 'tsserver absent' })
    );
    expect(texte).toContain(
      "Hors du service de langage (le service de langage n'a pas pu tourner : tsserver absent)"
    );
    expect(texte).toContain('`<fichier>#<nom>`');
  });
});
