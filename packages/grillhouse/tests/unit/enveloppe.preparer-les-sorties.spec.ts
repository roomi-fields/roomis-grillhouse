// Before anything is mounted, while the copy is still writable, the launcher of the envelope
// creates the own outputs of the language that are missing in each package the plan does not name
// (`preparerLesSorties`), so that bwrap has a directory to mount an empty one over. Read on a
// temporary directory, without bwrap.
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../scripts/jointure.js';
import { preparerLesSorties, sortiesDuLangage } from '../../scripts/enveloppe/enveloppe.mjs';
import typescript from '../../scripts/langages/typescript/index.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'enveloppe-preparer-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const PAQUETS = ['packages/a', 'packages/essais', 'packages/m'];
const { sorties } = sortiesDuLangage((typescript as unknown as Langage).sorties, {
  maison: '/h',
  principal: '/main',
});

function copie(): string {
  const c = mkdtempSync(path.join(ESSAIS, 'copie-'));
  for (const p of PAQUETS) {
    mkdirSync(path.join(c, p), { recursive: true });
  }
  return c;
}

const preparer = (c: string, o: { paquets: string[]; role?: string }) =>
  preparerLesSorties({
    copie: c,
    paquets: o.paquets,
    paquetsDeLaCopie: PAQUETS.map(p => ({ dossier: p, pkg: { name: p } })),
    matieres: ['packages/m'],
    role: o.role ?? 'developpeur',
    sorties,
  });

describe('la création des dossiers de sortie propre avant le montage', () => {
  it('crée les sorties propres qui manquent dans un paquet hors du plan sans node_modules', () => {
    const c = copie();
    preparer(c, { paquets: ['packages/a'] });
    expect(existsSync(path.join(c, 'packages/essais/node_modules/.vite'))).toBe(true);
    expect(existsSync(path.join(c, 'packages/essais/.turbo'))).toBe(true);
  });

  it('crée aussi les sorties de la racine de la copie quand le plan ne l’écrit pas', () => {
    const c = copie();
    preparer(c, { paquets: ['packages/a'] });
    expect(existsSync(path.join(c, '.turbo'))).toBe(true);
    expect(existsSync(path.join(c, 'node_modules/.vite'))).toBe(true);
  });

  it('ne crée rien dans un paquet que le plan nomme', () => {
    const c = copie();
    preparer(c, { paquets: ['packages/a'] });
    expect(existsSync(path.join(c, 'packages/a/.turbo'))).toBe(false);
    expect(existsSync(path.join(c, 'packages/a/node_modules'))).toBe(false);
  });

  it('crée la matière de test pour un autre rôle, et la laisse au testwriter', () => {
    const dev = copie();
    preparer(dev, { paquets: ['packages/a'], role: 'developpeur' });
    expect(existsSync(path.join(dev, 'packages/m/.turbo'))).toBe(true);
    const tw = copie();
    preparer(tw, { paquets: ['packages/a'], role: 'testwriter' });
    expect(existsSync(path.join(tw, 'packages/m/.turbo'))).toBe(false);
    expect(existsSync(path.join(tw, 'packages/essais/.turbo'))).toBe(true);
  });

  it('garde un dossier de sortie déjà présent et son contenu', () => {
    const c = copie();
    mkdirSync(path.join(c, 'packages/essais/.turbo'), { recursive: true });
    preparer(c, { paquets: ['packages/a'] });
    expect(existsSync(path.join(c, 'packages/essais/.turbo'))).toBe(true);
  });

  it('ne crée pas une sortie qu’un lien symbolique sort de la copie', () => {
    const c = copie();
    const dehors = mkdtempSync(path.join(ESSAIS, 'dehors-'));
    symlinkSync(dehors, path.join(c, 'packages/essais/node_modules'));
    preparer(c, { paquets: ['packages/a'] });
    expect(existsSync(path.join(dehors, '.vite'))).toBe(false);
    expect(existsSync(path.join(c, 'packages/essais/.turbo'))).toBe(true);
  });
});
