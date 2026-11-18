// L'état partagé des parts de la machine (scripts/places-de-la-machine.mjs) : un fichier par passe, que lit
// le tableau ; une passe dont le processus a disparu libère sa part ; un dossier de remplacement
// isole chaque test (GRILLHOUSE_PARTS_DE_LA_MACHINE).
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  dossierDesParts,
  lireLesParts,
  poserLaPart,
  rendreLaPart,
} from '../../scripts/places-de-la-machine.mjs';

const GO = 1024 ** 3;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'etat-des-parts-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
let n = 0;
const unDossier = () => path.join(ESSAIS, `d${++n}`);
const toutesVivantes = () => true;

const passe = (id: string, o: object = {}) => ({
  id,
  pid: 100,
  depart: 1,
  projet: 'demo',
  ticket: 'gh-1',
  sorte: 'Vérification',
  rang: 1,
  coeurs: 4,
  memoire: 8 * GO,
  etat: 'tient',
  ...o,
});

describe('le dossier de l’état des parts', () => {
  it('la variable de remplacement nomme le dossier', () => {
    expect(dossierDesParts({ GRILLHOUSE_PARTS_DE_LA_MACHINE: '/essai/parts' })).toBe(
      '/essai/parts'
    );
  });

  it('sans la variable, le dossier est celui de l’utilisateur, commun à ses projets', () => {
    const d = dossierDesParts({ HOME: '/home/u', XDG_STATE_HOME: '/home/u/.etat' });
    expect(path.isAbsolute(d)).toBe(true);
    expect(d).toContain('grillhouse');
  });
});

describe('une passe écrit sa part dans un fichier à elle', () => {
  it('une part posée se lit, avec ses cœurs, sa mémoire et son projet', () => {
    const d = unDossier();
    poserLaPart(d, passe('a'));
    const { prises, attentes } = lireLesParts(d, { vivant: toutesVivantes });
    expect(attentes).toEqual([]);
    expect(prises).toHaveLength(1);
    expect(prises[0]).toMatchObject({ id: 'a', coeurs: 4, memoire: 8 * GO, projet: 'demo' });
  });

  it('deux passes écrivent deux fichiers', () => {
    const d = unDossier();
    poserLaPart(d, passe('a'));
    poserLaPart(d, passe('b', { projet: 'autre' }));
    expect(readdirSync(d)).toHaveLength(2);
    expect(
      lireLesParts(d, { vivant: toutesVivantes })
        .prises.map(p => p.id)
        .sort()
    ).toEqual(['a', 'b']);
  });

  it('une passe qui attend est lue en attente, avec ce qu’elle attend, dans l’ordre des rangs', () => {
    const d = unDossier();
    poserLaPart(d, passe('b', { etat: 'attend', rang: 7, raison: 'cœurs : 6 demandés' }));
    poserLaPart(
      d,
      passe('a', { etat: 'attend', rang: 3, raison: 'charge de la machine 12 sur 12' })
    );
    const { prises, attentes } = lireLesParts(d, { vivant: toutesVivantes });
    expect(prises).toEqual([]);
    expect(attentes.map(a => a.id)).toEqual(['a', 'b']);
    expect(attentes[0]?.raison).toContain('charge');
  });

  it('une passe qui attend puis part change d’état dans le même fichier', () => {
    const d = unDossier();
    poserLaPart(d, passe('a', { etat: 'attend', rang: 1, raison: 'cœurs' }));
    poserLaPart(d, passe('a'));
    const lu = lireLesParts(d, { vivant: toutesVivantes });
    expect(lu.attentes).toEqual([]);
    expect(lu.prises).toHaveLength(1);
    expect(readdirSync(d)).toHaveLength(1);
  });

  it('rendre sa part retire le fichier de la passe', () => {
    const d = unDossier();
    poserLaPart(d, passe('a'));
    poserLaPart(d, passe('b'));
    rendreLaPart(d, 'a');
    expect(lireLesParts(d, { vivant: toutesVivantes }).prises.map(p => p.id)).toEqual(['b']);
  });

  it('rendre une part absente ne fait rien', () => {
    const d = unDossier();
    expect(() => rendreLaPart(d, 'absente')).not.toThrow();
  });
});

describe('une passe dont le processus a disparu libère sa part', () => {
  it('sa part et son attente ne sont plus lues, et son fichier part', () => {
    const d = unDossier();
    poserLaPart(d, passe('morte', { pid: 1 }));
    poserLaPart(d, passe('morte-qui-attend', { pid: 1, etat: 'attend', rang: 2 }));
    poserLaPart(d, passe('vivante', { pid: 2 }));
    const lu = lireLesParts(d, { vivant: ({ pid }: { pid: number }) => pid === 2 });
    expect(lu.prises.map(p => p.id)).toEqual(['vivante']);
    expect(lu.attentes).toEqual([]);
    expect(readdirSync(d)).toHaveLength(1);
  });

  it('juge la vie par le pid et le départ du processus', () => {
    const d = unDossier();
    poserLaPart(d, passe('a', { pid: 5, depart: 111 }));
    const vus: unknown[] = [];
    lireLesParts(d, {
      vivant: (p: { pid: number; depart: number }) => {
        vus.push([p.pid, p.depart]);
        return true;
      },
    });
    expect(vus).toEqual([[5, 111]]);
  });

  it('un dossier absent se lit vide', () => {
    const d = path.join(unDossier(), 'rien');
    expect(lireLesParts(d, { vivant: toutesVivantes })).toEqual({ prises: [], attentes: [] });
    expect(existsSync(d)).toBe(false);
  });
});
