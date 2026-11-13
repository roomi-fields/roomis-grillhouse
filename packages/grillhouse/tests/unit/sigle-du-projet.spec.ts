// Le sigle d'un projet (scripts/sigle-du-projet.mjs) : la clé `grillhouse.sigle` de son package.json,
// sinon le `issue-prefix` de son .beads/config.yaml ; il ne sert qu'aux affichages partagés entre
// projets. La clé se lit comme les autres clés `grillhouse.*` (scripts/circuits-cles.mjs) : lue
// telle qu'écrite, une valeur fautive est nommée par la clé. Grillhouse déclare « GH ».
// @lit package.json
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// Le module se charge à l'appel : s'il manque, chaque test échoue seul, au lieu du fichier entier.
const MODULE = path.resolve(__dirname, '../../scripts/sigle-du-projet.mjs');
const charger = (): any => createRequire(path.join(__dirname, 'x.cjs'))(MODULE);
type Lu = { sigle: string | null; faute: string | null };
const lireSigle = (...a: any[]): Lu => charger().lireSigle(...a);
const sigleDuProjet = (...a: any[]): Lu => charger().sigleDuProjet(...a);
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'sigle-du-projet-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// Un projet d'essai : son package.json (`pkg`) et le texte de son .beads/config.yaml (`beads`).
const projet = (o: { pkg?: unknown; beads?: string } = {}) => {
  const d = mkdtempSync(path.join(ESSAIS, 'projet-'));
  if (o.pkg !== undefined) {
    writeFileSync(path.join(d, 'package.json'), JSON.stringify(o.pkg));
  }
  if (o.beads !== undefined) {
    mkdirSync(path.join(d, '.beads'));
    writeFileSync(path.join(d, '.beads', 'config.yaml'), o.beads);
  }
  return d;
};

describe('la clé grillhouse.sigle se lit comme les autres clés grillhouse.*', () => {
  it('absente ou nulle : aucun sigle déclaré, aucune faute', () => {
    expect(lireSigle({})).toEqual({ sigle: null, faute: null });
    expect(lireSigle({ grillhouse: {} })).toEqual({ sigle: null, faute: null });
    expect(lireSigle({ grillhouse: { sigle: null } })).toEqual({ sigle: null, faute: null });
    expect(lireSigle(null)).toEqual({ sigle: null, faute: null });
  });

  it('une chaîne non vide sans espace est le sigle, telle qu’écrite', () => {
    expect(lireSigle({ grillhouse: { sigle: 'GH' } })).toEqual({ sigle: 'GH', faute: null });
    expect(lireSigle({ grillhouse: { sigle: 'osc' } })).toEqual({ sigle: 'osc', faute: null });
  });

  it('toute autre valeur est une faute nommée par la clé, sans sigle', () => {
    for (const v of ['', ' ', 'G H', ' GH', 'GH ', 3, true, [], {}, ['GH']]) {
      const r = lireSigle({ grillhouse: { sigle: v } });
      expect(r.sigle, JSON.stringify(v)).toBeNull();
      expect(r.faute, JSON.stringify(v)).toContain('grillhouse.sigle');
    }
  });
});

describe('le sigle d’un projet se lit de sa racine', () => {
  it('la clé du package.json l’emporte sur le préfixe des tickets', () => {
    const d = projet({
      pkg: { grillhouse: { sigle: 'GH' } },
      beads: 'issue-prefix: "grillhouse"\n',
    });
    expect(sigleDuProjet(d)).toEqual({ sigle: 'GH', faute: null });
  });

  it('sans clé, le issue-prefix de .beads/config.yaml sert', () => {
    const d = projet({ pkg: { name: 'x' }, beads: 'issue-prefix: "osc-bridge"\n' });
    expect(sigleDuProjet(d)).toEqual({ sigle: 'osc-bridge', faute: null });
    const sansPackage = projet({ beads: 'issue-prefix: demo\n' });
    expect(sigleDuProjet(sansPackage)).toEqual({ sigle: 'demo', faute: null });
  });

  it('une clé fautive est dite par la clé, et le préfixe des tickets reste le sigle', () => {
    for (const v of [3, '', 'a b', {}]) {
      const d = projet({ pkg: { grillhouse: { sigle: v } }, beads: 'issue-prefix: "demo"\n' });
      const r = sigleDuProjet(d);
      expect(r.sigle, JSON.stringify(v)).toBe('demo');
      expect(r.faute, JSON.stringify(v)).toContain('grillhouse.sigle');
    }
  });

  it('ni clé ni préfixe lisible : aucun sigle, sans lever', () => {
    expect(sigleDuProjet(projet({ pkg: { name: 'x' } }))).toEqual({ sigle: null, faute: null });
  });
});

describe('Grillhouse s’affiche « GH »', () => {
  it('le package.json racine du dépôt déclare grillhouse.sigle « GH »', () => {
    const racine = path.resolve(__dirname, '../../../..');
    expect(sigleDuProjet(racine).sigle).toBe('GH');
  });
});
