// Les paquets d'un dépôt (scripts/paquets.mjs) : les dossiers que sélectionnent les `workspaces`
// du package.json racine, comme npm les relie. La nuit lit cette liste pour savoir si sa copie
// porte le paquet du cadre comme un paquet du dépôt, et ne le construit que dans ce cas : un
// projet d'essai qui copie le package.json du cadre sous packages/grillhouse/ sans le déclarer
// n'a pas de paquet du cadre (npm y refuse `--workspace=@roomi-fields/grillhouse`).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { paquets } from '../../scripts/paquets.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'paquets-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

function depot(racine: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(ESSAIS, 'depot-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(racine));
  mkdirSync(path.join(dir, 'packages/grillhouse'), { recursive: true });
  writeFileSync(
    path.join(dir, 'packages/grillhouse/package.json'),
    JSON.stringify({ name: '@roomi-fields/grillhouse' })
  );
  return dir;
}

describe('les paquets du dépôt', () => {
  it("un package.json que les workspaces ne sélectionnent pas n'est pas un paquet du dépôt", () => {
    expect(paquets(depot({ name: 'essai', private: true }))).toEqual([]);
  });

  it('un package.json que les workspaces sélectionnent est un paquet du dépôt, avec son nom', () => {
    const liste = paquets(depot({ name: 'cadre', private: true, workspaces: ['packages/*'] })) as {
      dossier: string;
      pkg: { name?: string };
    }[];
    expect(liste.map(p => [p.dossier, p.pkg.name])).toEqual([
      ['packages/grillhouse', '@roomi-fields/grillhouse'],
    ]);
  });
});
