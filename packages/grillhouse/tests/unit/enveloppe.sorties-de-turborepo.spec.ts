// Every language plays by Turborepo, so what it writes belongs to the core, not to a module, as a
// sandbox of Bazel keeps the logs and the cache of its scheduler out of the rules of a language:
// the outputs of the envelope (`sortiesDuLangage`) hold, for every module, the store
// `<main tree>/.turbo/cache` written and `.turbo` proper to the session, which the plan of the
// envelope and the creation before mounting apply to the packages out of the plan, to the root
// and to the shared test material. Read on the plan, without bwrap.
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../scripts/jointure.js';
import { plan, preparerLesSorties, sortiesDuLangage } from '../../scripts/enveloppe/enveloppe.mjs';
import c from '../../scripts/langages/c/index.mjs';
import cargo from '../../scripts/langages/cargo/index.mjs';
import python from '../../scripts/langages/python/index.mjs';
import typescript from '../../scripts/langages/typescript/index.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'enveloppe-turborepo-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MODULES: [string, Langage][] = [
  ['typescript', typescript as unknown as Langage],
  ['cargo', cargo as unknown as Langage],
  ['python', python as unknown as Langage],
  ['c', c as unknown as Langage],
];
const SANS_SORTIE = { ecrites: [], propres: [], lues: [] };
const PAQUETS = ['crates/app', 'crates/fournisseur', 'crates/m'];
const PAQUETS_DE_LA_COPIE = PAQUETS.map(p => ({ dossier: p, pkg: { name: p } }));
const CACHE = '/main/.turbo/cache';

const des = (s: Langage['sorties']) => sortiesDuLangage(s, { maison: '/h', principal: '/main' });

const pairs = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 1] ?? ''] : []));

function enveloppe(s: Langage['sorties'], o: { paquets?: string[]; role?: string } = {}) {
  const { magasins, lectures, sorties } = des(s);
  const presents = new Set([
    '/wt',
    '/wt/.git',
    '/wt/.turbo',
    '/main/.beads',
    CACHE,
    ...PAQUETS.flatMap(p => [`/wt/${p}`, `/wt/${p}/.turbo`]),
  ]);
  const r = plan(
    {
      trees: ['/main', '/wt'],
      copie: '/wt',
      paquets: o.paquets ?? ['crates/app'],
      role: o.role ?? 'developpeur',
      matieres: ['crates/m'],
      magasins,
      lectures,
      sorties,
      paquetsDeLaCopie: PAQUETS_DE_LA_COPIE,
    },
    { existe: (p: string) => presents.has(p), lien: () => null }
  );
  expect(r.refus).toBeUndefined();
  return r.args ?? [];
}

describe('les sorties de Turborepo, que le noyau déclare pour chaque langage', () => {
  it.each(MODULES)(
    '%s : le cache de Turborepo de l’arbre principal est un magasin écrit, un dossier',
    (_nom, m) => {
      const { magasins, fichiers } = des(m.sorties);
      expect(magasins).toContain(CACHE);
      expect(fichiers).not.toContain(CACHE);
    }
  );

  it.each(MODULES)('%s : .turbo est une sortie propre à la séance', (_nom, m) => {
    expect(des(m.sorties).sorties.propres).toContain('.turbo');
  });

  it('les déclare même pour un module qui ne déclare aucune sortie', () => {
    const s = des(SANS_SORTIE);
    expect(s.magasins).toEqual([CACHE]);
    expect(s.sorties).toEqual({ ecrites: [], propres: ['.turbo'] });
  });

  it('garde les sorties que le module déclare à côté d’elles', () => {
    const s = des({ ecrites: ['target/', '~/.registre/'], propres: ['__cache__'], lues: [] });
    expect([...s.magasins].sort()).toEqual(['/h/.registre', CACHE]);
    expect(s.sorties.ecrites).toEqual(['target']);
    expect([...s.sorties.propres].sort()).toEqual(['.turbo', '__cache__']);
  });

  it.each(MODULES.filter(([nom]) => nom !== 'typescript'))(
    '%s : ne reçoit pas le dossier des outils du module typescript',
    (_nom, m) => {
      expect(des(m.sorties).sorties.propres).not.toContain('.cache-outils');
    }
  );

  it('le module typescript ne déclare plus .turbo ni le cache de Turborepo', () => {
    const s = (typescript as unknown as Langage).sorties;
    expect(s.propres).not.toContain('.turbo');
    expect(s.ecrites).not.toContain('//.turbo/cache/');
  });
});

describe('le journal de Turborepo d’un fournisseur hors du plan, dans un projet sans typescript', () => {
  it.each(MODULES)(
    '%s : monte vide et propre le .turbo de chaque paquet hors du plan et de la racine',
    (_nom, m) => {
      const args = enveloppe(m.sorties);
      const vides = pairs(args, '--tmpfs');
      expect(vides).toContain('/wt/crates/fournisseur/.turbo');
      expect(vides).toContain('/wt/.turbo');
      expect(vides).not.toContain('/wt/crates/app/.turbo');
      // Mounted after the read-only copy, which would cover it.
      expect(args.lastIndexOf('/wt/crates/fournisseur/.turbo')).toBeGreaterThan(
        args.indexOf('/wt')
      );
      expect(pairs(args, '--bind')).not.toContain('/wt/crates/fournisseur');
    }
  );

  it.each(MODULES)(
    '%s : monte en écriture le cache de l’arbre principal, d’où la tâche est relue',
    (_nom, m) => {
      expect(pairs(enveloppe(m.sorties), '--bind')).toContain(CACHE);
    }
  );

  it('un plan qui écrit la racine la garde écrite, sans .turbo vide à elle', () => {
    const args = enveloppe((cargo as unknown as Langage).sorties, { paquets: ['.'] });
    expect(pairs(args, '--tmpfs')).not.toContain('/wt/.turbo');
    expect(pairs(args, '--bind')).toContain('/wt');
    expect(pairs(args, '--bind')).toContain(CACHE);
  });

  it('la matière de test : son .turbo est vide et propre pour un autre rôle, écrit pour le testwriter', () => {
    const s = (cargo as unknown as Langage).sorties;
    expect(pairs(enveloppe(s, { role: 'developpeur' }), '--tmpfs')).toContain(
      '/wt/crates/m/.turbo'
    );
    const testwriter = enveloppe(s, { role: 'testwriter' });
    expect(pairs(testwriter, '--tmpfs')).not.toContain('/wt/crates/m/.turbo');
    expect(pairs(testwriter, '--bind')).toContain('/wt/crates/m');
  });
});

describe('la création des .turbo avant le montage, dans un projet sans typescript', () => {
  function preparer(m: Langage, role: string): string {
    const copie = mkdtempSync(path.join(ESSAIS, 'copie-'));
    for (const p of PAQUETS) {
      mkdirSync(path.join(copie, p), { recursive: true });
    }
    preparerLesSorties({
      copie,
      paquets: ['crates/app'],
      paquetsDeLaCopie: PAQUETS_DE_LA_COPIE,
      matieres: ['crates/m'],
      role,
      sorties: des(m.sorties).sorties,
    });
    return copie;
  }
  const turbo = (copie: string, d: string) => existsSync(path.join(copie, d, '.turbo'));

  it.each(MODULES.filter(([nom]) => nom !== 'typescript'))(
    '%s : crée celui de la racine, des paquets hors du plan et de la matière',
    (_nom, m) => {
      const copie = preparer(m, 'developpeur');
      expect(turbo(copie, '.')).toBe(true);
      expect(turbo(copie, 'crates/fournisseur')).toBe(true);
      expect(turbo(copie, 'crates/m')).toBe(true);
      expect(turbo(copie, 'crates/app')).toBe(false);
    }
  );

  it('ne crée pas celui de la matière pour le testwriter, qui l’écrit', () => {
    const copie = preparer(cargo as unknown as Langage, 'testwriter');
    expect(turbo(copie, 'crates/m')).toBe(false);
    expect(turbo(copie, 'crates/fournisseur')).toBe(true);
  });
});
