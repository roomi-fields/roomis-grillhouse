// La première ligne du panneau porte, à son bord droit, la version du cadre dont le code dessine le
// panneau : « v<x.y.z> », lue du package.json du paquet par `versionDuPaquet` (scripts/greffons.mjs),
// une seule fois par processus.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const PAQUET = path.resolve(__dirname, '../..');
const PACKAGE_JSON = path.join(PAQUET, 'package.json');
const VRAIE_VERSION = (JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')) as { version: string })
  .version;

type Contenu = string | Error;
const etat = { contenu: null as Contenu | null, lectures: 0 };

// Charge les scripts à neuf, la lecture du package.json du paquet donnée par `etat.contenu`
// (null : la vraie lecture), chaque lecture comptée.
const charger = async (contenu: Contenu | null) => {
  // Les modules lisent ce package.json en se chargeant : la lecture donnée ne vaut qu'après.
  etat.contenu = null;
  etat.lectures = 0;
  vi.resetModules();
  vi.doMock('node:fs', async importOriginal => {
    const reel = await importOriginal<typeof import('node:fs')>();
    return {
      ...reel,
      default: reel,
      readFileSync: (f: unknown, ...reste: unknown[]) => {
        if (String(f) === PACKAGE_JSON || String(f) === `file://${PACKAGE_JSON}`) {
          etat.lectures++;
          if (etat.contenu instanceof Error) {
            throw etat.contenu;
          }
          if (etat.contenu !== null) {
            return etat.contenu;
          }
        }
        return (reel.readFileSync as (...a: unknown[]) => unknown)(f, ...reste);
      },
    };
  });
  const greffons = (await import('../../scripts/greffons.mjs')) as {
    versionDuPaquet: () => string | null;
  };
  const tableau = (await import('../../scripts/tableau.mjs')) as {
    assembler: (a: object) => unknown;
    ensemble: (l: object[]) => unknown;
    lignes: (t: unknown, nom: string, largeur?: number, groupes?: object) => { texte: string }[];
  };
  etat.contenu = contenu;
  etat.lectures = 0;
  return { ...greffons, ...tableau };
};
const paquet = (o: object) => JSON.stringify(o);

afterEach(() => {
  vi.doUnmock('node:fs');
  vi.resetModules();
});

const MAINTENANT = Date.parse('2026-10-10T12:00:00Z');
const JOUR = Date.parse('2026-10-10T00:00:00Z');
const plateau = (m: { assembler: (a: object) => unknown }) =>
  m.assembler({
    tous: [],
    prefix: 'demo',
    registre: [],
    vivants: [],
    maintenant: MAINTENANT,
    jour: JOUR,
  });

describe('la version du paquet se lit de son package.json', () => {
  it('rend la version du paquet @roomi-fields/grillhouse', async () => {
    const m = await charger(null);
    expect(m.versionDuPaquet()).toBe(VRAIE_VERSION);
  });
  it('rend null pour un package.json au nom autre', async () => {
    const m = await charger(paquet({ name: 'autre', version: '1.2.3' }));
    expect(m.versionDuPaquet()).toBeNull();
  });
  it('rend null sans version chaîne', async () => {
    const m = await charger(paquet({ name: '@roomi-fields/grillhouse', version: 3 }));
    expect(m.versionDuPaquet()).toBeNull();
    const n = await charger(paquet({ name: '@roomi-fields/grillhouse' }));
    expect(n.versionDuPaquet()).toBeNull();
  });
  it('rend null pour un package.json absent', async () => {
    const m = await charger(new Error('ENOENT'));
    expect(m.versionDuPaquet()).toBeNull();
  });
});

describe('la première ligne du panneau porte la version à son bord droit', () => {
  const bon = paquet({ name: '@roomi-fields/grillhouse', version: '0.47.1' });

  it('écrit « v0.47.1 » alignée à droite sur la largeur du panneau', async () => {
    const m = await charger(bon);
    const [premiere] = m.lignes(plateau(m), 'demo', 40);
    expect(premiere.texte).toHaveLength(40);
    expect(premiere.texte.startsWith('DEMO ')).toBe(true);
    expect(premiere.texte.endsWith(' v0.47.1')).toBe(true);
  });
  it('suit la largeur demandée', async () => {
    const m = await charger(bon);
    const [premiere] = m.lignes(plateau(m), 'demo', 60);
    expect(premiere.texte).toHaveLength(60);
    expect(premiere.texte.endsWith('v0.47.1')).toBe(true);
  });
  it('affiche la version du paquet réel, non celle d’un projet', async () => {
    const m = await charger(null);
    const [premiere] = m.lignes(plateau(m), 'demo', 40);
    expect(premiere.texte.endsWith(` v${VRAIE_VERSION}`)).toBe(true);
  });
  it('coupe le nom et garde la version entière sur un panneau étroit', async () => {
    const m = await charger(bon);
    const [premiere] = m.lignes(plateau(m), 'grillhouse-long', 12);
    expect(premiere.texte).toHaveLength(12);
    expect(premiere.texte.endsWith(' v0.47.1')).toBe(true);
    expect(premiere.texte).toContain('…');
  });
  it('porte la version une seule fois sur le panneau de plusieurs projets', async () => {
    const m = await charger(bon);
    const t = m.ensemble([
      { etiquette: 'A', t: plateau(m) },
      { etiquette: 'B', t: plateau(m) },
    ]);
    const l = m.lignes(t, 'demo', 40);
    expect(l[0].texte.endsWith(' v0.47.1')).toBe(true);
    expect(l.filter(x => x.texte.includes('v0.47.1'))).toHaveLength(1);
  });
});

describe('une version non affichable laisse la première ligne telle qu’avant', () => {
  const sans = async (version: unknown) => {
    const m = await charger(paquet({ name: '@roomi-fields/grillhouse', version }));
    return m.lignes(plateau(m), 'demo', 40)[0].texte;
  };
  it.each(['abc', '0.48.0-rc.1', '1.2', 'v0.47.1', '0.47.1 ', ''])(
    'n’affiche rien pour « %s »',
    async version => {
      expect(await sans(version)).toBe('DEMO');
    }
  );
  it('n’affiche rien et ne casse pas le rendu quand le package.json est illisible', async () => {
    const m = await charger('{ pas du json');
    expect(m.lignes(plateau(m), 'demo', 40)[0].texte).toBe('DEMO');
    const n = await charger(new Error('ENOENT'));
    expect(n.lignes(plateau(n), 'demo', 40)[0].texte).toBe('DEMO');
  });
  it('ne coupe pas le nom du projet, sans espace de fin', async () => {
    const m = await charger(paquet({ name: '@roomi-fields/grillhouse', version: 'abc' }));
    expect(m.lignes(plateau(m), 'un-nom-de-projet-tres-long-vraiment', 10)[0].texte).toBe(
      'UN-NOM-DE-PROJET-TRES-LONG-VRAIMENT'
    );
  });
});

describe('la version se lit une seule fois par processus', () => {
  it('garde la version du code chargé après une montée du paquet', async () => {
    const m = await charger(paquet({ name: '@roomi-fields/grillhouse', version: '0.47.1' }));
    expect(m.lignes(plateau(m), 'demo', 40)[0].texte.endsWith(' v0.47.1')).toBe(true);
    etat.contenu = paquet({ name: '@roomi-fields/grillhouse', version: '0.48.0' });
    expect(m.lignes(plateau(m), 'demo', 40)[0].texte.endsWith(' v0.47.1')).toBe(true);
  });
  it('ne relit pas le fichier à chaque appel de lignes', async () => {
    const m = await charger(paquet({ name: '@roomi-fields/grillhouse', version: '0.47.1' }));
    const t = plateau(m);
    const avant = etat.lectures;
    m.lignes(t, 'demo', 40);
    m.lignes(t, 'demo', 40);
    m.lignes(t, 'demo', 40);
    expect(etat.lectures - avant).toBeLessThanOrEqual(1);
  });
});
