// La reprise du circuit à l'étape qui porte le rouge (scripts/reprise.mjs) : l'attribution d'un
// rouge à l'étape qui le porte, l'empreinte d'une étape, et l'étape où `--depuis` reprend. Modèle
// mûr : « Re-run failed jobs » de GitHub Actions et la clé de cache d'une tâche de Turborepo.
import { describe, expect, it } from 'vitest';
import * as transitions from '../../scripts/transitions.mjs';

// Le module se charge à part : sans lui, chaque test échoue sur sa fonction manquante.
const reprise: object = await (
  import('../../scripts/reprise.mjs' as string) as Promise<object>
).catch(() => ({}));

interface Lieu {
  paquet?: string;
  fichier?: string | null;
  gardes?: string[];
}
interface Portes {
  tests: string[];
  code: string[];
}
interface Attribution {
  etape: 'testwriter' | 'developpeur' | null;
  fichiers: string[];
  motif?: string;
}
// L'empreinte d'une étape se calcule du côté des activités (node:crypto) : son module à elle.
const empreinteModule: object = await (
  import('../../scripts/empreinte-d-etape.mjs' as string) as Promise<object>
).catch(() => ({}));
const { empreinteDEtape } = empreinteModule as unknown as {
  empreinteDEtape: (e: { commande: string; hashes: Record<string, string> }) => string;
};
const { attribuerLeRouge, departDepuis } = reprise as unknown as {
  attribuerLeRouge: (e: { lieux: Lieu[]; portes: Portes }) => Attribution;
  departDepuis: (nom: string) => {
    etape: string;
    tentative: number;
    rapport: string | null;
    finale: boolean;
    verts: Record<string, unknown>;
  };
};
const T = transitions as unknown as Record<string, string>;

const PORTES: Portes = {
  tests: ['packages/a/tests/x.spec.ts', 'packages/a/tests/y.spec.ts'],
  code: ['packages/a/src/x.ts'],
};

describe('un rouge s’attribue à l’étape qui le porte, par la sortie de l’étape rouge', () => {
  it('un fichier de code du lot : le développeur, ce fichier nommé', () => {
    expect(
      attribuerLeRouge({
        lieux: [{ paquet: 'packages/a', fichier: 'packages/a/src/x.ts' }],
        portes: PORTES,
      })
    ).toMatchObject({ etape: 'developpeur', fichiers: ['packages/a/src/x.ts'] });
  });

  it('un seul fichier de test du lot : le testwriter, ce fichier nommé', () => {
    expect(
      attribuerLeRouge({
        lieux: [
          { paquet: 'packages/a', fichier: 'packages/a/tests/y.spec.ts', gardes: ['tailles'] },
        ],
        portes: PORTES,
      })
    ).toMatchObject({ etape: 'testwriter', fichiers: ['packages/a/tests/y.spec.ts'] });
  });

  it('un test du lot qui échoue (aucune garde) : le développeur, ce fichier nommé', () => {
    expect(
      attribuerLeRouge({
        lieux: [{ paquet: 'packages/a', fichier: 'packages/a/tests/y.spec.ts', gardes: [] }],
        portes: PORTES,
      })
    ).toMatchObject({ etape: 'developpeur', fichiers: ['packages/a/tests/y.spec.ts'] });
  });

  it('plusieurs fichiers de test : le testwriter, chacun nommé une fois', () => {
    const r = attribuerLeRouge({
      lieux: [
        { fichier: 'packages/a/tests/x.spec.ts', gardes: ['tailles'] },
        { fichier: 'packages/a/tests/y.spec.ts', gardes: ['tailles'] },
        { fichier: 'packages/a/tests/x.spec.ts', gardes: ['tailles'] },
      ],
      portes: PORTES,
    });
    expect(r.etape).toBe('testwriter');
    expect([...r.fichiers].sort()).toEqual([...PORTES.tests].sort());
  });

  it('un fichier de test et un fichier de code : l’étape la plus tôt, le testwriter, qui rejoue ensuite le code', () => {
    expect(
      attribuerLeRouge({
        lieux: [
          { fichier: 'packages/a/src/x.ts' },
          { fichier: 'packages/a/tests/x.spec.ts', gardes: ['tailles'] },
        ],
        portes: PORTES,
      }).etape
    ).toBe('testwriter');
  });

  it.each([
    ['aucun lieu', []],
    ['un lieu sans fichier', [{ paquet: 'packages/a', fichier: null }]],
    ['un lieu au fichier vide', [{ paquet: 'packages/a', fichier: '' }]],
  ])('un rouge sans fichier nommé (%s) n’est jamais attribué : il monte', (_nom, lieux) => {
    const r = attribuerLeRouge({ lieux, portes: PORTES });
    expect(r.etape).toBeNull();
    expect(r.fichiers).toEqual([]);
    expect(r.motif).toEqual(expect.any(String));
  });

  it('un fichier que ni le testwriter ni le développeur ne portent n’est pas attribué : il monte', () => {
    const r = attribuerLeRouge({
      lieux: [{ fichier: 'packages/b/src/autre.ts' }],
      portes: PORTES,
    });
    expect(r.etape).toBeNull();
    expect(r.motif).toEqual(expect.any(String));
  });

  it('un fichier porté et un fichier que personne ne porte : le rouge monte, rien n’est deviné', () => {
    expect(
      attribuerLeRouge({
        lieux: [{ fichier: 'packages/a/src/x.ts' }, { fichier: 'package.json' }],
        portes: PORTES,
      }).etape
    ).toBeNull();
  });
});

describe('l’empreinte d’une étape est le hachage de ses entrées et de sa commande', () => {
  const hashes = { 'packages/a': 'h1', 'packages/b': 'h2' };
  it('les mêmes entrées et la même commande : la même empreinte, quel que soit l’ordre des paquets', () => {
    const a = empreinteDEtape({ commande: 'npm test', hashes });
    expect(a).toEqual(expect.any(String));
    expect(a.length).toBeGreaterThan(0);
    expect(empreinteDEtape({ commande: 'npm test', hashes })).toBe(a);
    expect(
      empreinteDEtape({ commande: 'npm test', hashes: { 'packages/b': 'h2', 'packages/a': 'h1' } })
    ).toBe(a);
  });

  it('le contenu d’un paquet change, même d’un dépendant : l’empreinte change', () => {
    const a = empreinteDEtape({ commande: 'npm test', hashes });
    expect(
      empreinteDEtape({ commande: 'npm test', hashes: { ...hashes, 'packages/b': 'h3' } })
    ).not.toBe(a);
  });

  it('la configuration racine change : l’empreinte change', () => {
    const a = empreinteDEtape({ commande: 'npm test', hashes });
    expect(empreinteDEtape({ commande: 'npm test', hashes: { ...hashes, '//': 'conf' } })).not.toBe(
      a
    );
  });

  it('la commande change : l’empreinte change', () => {
    expect(empreinteDEtape({ commande: 'npm test', hashes })).not.toBe(
      empreinteDEtape({ commande: 'npm run verifier', hashes })
    );
  });

  it('un paquet de plus change l’empreinte, deux paquets échangés de hachage aussi', () => {
    const a = empreinteDEtape({ commande: 'c', hashes: { x: '1', y: '2' } });
    expect(empreinteDEtape({ commande: 'c', hashes: { x: '2', y: '1' } })).not.toBe(a);
    expect(empreinteDEtape({ commande: 'c', hashes: { x: '1', y: '2', z: '3' } })).not.toBe(a);
  });
});

describe('--depuis nomme une étape et rejoue celle-là et les suivantes, sans relire de cache', () => {
  it.each([
    ['testwriter', T.TESTS, 1, false],
    ['preuve', T.PREUVE, 1, false],
    ['developpeur', T.CODE, 1, false],
    ['controles', T.CONTROLES, 0, false],
    ['passe-finale', T.CONTROLES, 0, true],
  ])('%s : reprend à son étape, aucune empreinte gardée', (nom, etape, tentative, finale) => {
    expect(departDepuis(nom)).toEqual({ etape, tentative, rapport: null, finale, verts: {} });
  });

  it('un nom qui n’est pas une étape est refusé, les noms permis dits', () => {
    expect(() => departDepuis('relecteur')).toThrow(/testwriter.*developpeur/s);
  });
});
