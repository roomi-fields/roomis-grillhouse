// L'écriture que le verrou du testwriter arrête (`hors-plan`) sur un fichier de test d'un paquet
// lecteur : le circuit étend le plan à ces tests seuls, sans arrêt (`etendreTests`), la séance
// reprend. Une écriture de code du lecteur, ou celle d'un autre rôle, arrête comme avant
// (« hors-plan »). C'est l'arrêt que le superviseur levait à la main.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { seanceLancee } from '../../scripts/seances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'seances-tests-lecteur-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

interface Lancee {
  etendreTests?: { paquet: string; chemin: string; piece: string };
  etendre?: unknown;
}
const lancee = seanceLancee as unknown as (ctx: object, role: string, r: object) => Lancee | void;

const copie = mkdtempSync(path.join(ESSAIS, 'copie-'));
writeFileSync(path.join(copie, 'package.json'), JSON.stringify({ name: 'racine' }));
declarerLesLangages(copie);
for (const p of ['a', 'b']) {
  mkdirSync(path.join(copie, `packages/${p}`), { recursive: true });
  writeFileSync(path.join(copie, `packages/${p}/package.json`), JSON.stringify({ name: p }));
}
const ctx = { copie, paquets: ['packages/a'], ticket: 'x-1', journal: '/nonexistent' };

const arret = (chemin: string, paquet = 'packages/b') => ({
  horsPlan: `⛔ hors-plan — ${chemin} est dans ${paquet}, hors des paquets du plan (packages/a)`,
  ecriture: { chemin, paquet, racine: false },
});
const nom = (r: object, role: string) => {
  try {
    return { rendu: lancee(ctx, role, r) };
  } catch (e) {
    return { arret: (e as { nom: string }).nom };
  }
};

describe('une écriture du testwriter dans un fichier de test d’un lecteur étend le plan à ces tests', () => {
  it('rend l’extension aux tests du paquet, sans arrêt, avec le fichier et sa pièce', () => {
    const r = nom(arret('packages/b/tests/b.test.ts'), 'testwriter').rendu;
    expect(r?.etendreTests).toMatchObject({
      paquet: 'packages/b',
      chemin: 'packages/b/tests/b.test.ts',
    });
    expect(r?.etendreTests?.piece).toContain('packages/b/tests/b.test.ts');
    expect(r?.etendre).toBeUndefined();
  });

  it('une écriture de code du lecteur arrête « hors-plan » comme avant', () => {
    expect(nom(arret('packages/b/src/b.ts'), 'testwriter').arret).toBe('hors-plan');
  });

  it('le manifeste du lecteur arrête « hors-plan » comme avant', () => {
    expect(nom(arret('packages/b/package.json'), 'testwriter').arret).toBe('hors-plan');
  });

  it('une écriture du développeur dans un fichier de test du lecteur arrête « hors-plan »', () => {
    expect(nom(arret('packages/b/tests/b.test.ts'), 'developpeur').arret).toBe('hors-plan');
  });

  it('un fichier de test que tient la racine du dépôt arrête « hors-plan »', () => {
    const racine = {
      horsPlan: '⛔ hors-plan — tests/x.test.ts est dans la racine du dépôt',
      ecriture: { chemin: 'tests/x.test.ts', paquet: 'la racine du dépôt', racine: true },
    };
    expect(nom(racine, 'testwriter').arret).toBe('hors-plan');
  });
});
