// Le verrou global de la machine est remplacé par les parts, sans trace : ni son module, ni sa
// variable, ni ses fichiers, ni un lecteur dans le code ou la base de configuration des tests.
// @lit packages/grillhouse/scripts/** packages/grillhouse/src/**
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PAQUET = path.resolve(__dirname, '../..');

// Les noms de l'ancien verrou, écrits en deux morceaux pour que ce fichier ne se cite pas lui-même.
const ANCIENS = [
  ['GRILLHOUSE_VERROU', '_MACHINE'],
  ['mesure-lourde', '.lock'],
  ['.detenteur', '.json'],
  ['}.atten', 'tes'],
  ['verrou-de-', 'machine'],
].map(([a, b]) => a + b);

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap(nom => {
    if (nom === 'node_modules') {
      return [];
    }
    const p = path.join(dossier, nom);
    return statSync(p).isDirectory() ? fichiers(p) : [p];
  });
}

const code = [
  ...fichiers(path.join(PAQUET, 'scripts')),
  ...fichiers(path.join(PAQUET, 'src')),
].filter(f => /\.(mjs|ts|mts|js|sh)$/.test(f));

describe('le verrou global de la machine est supprimé', () => {
  it('le module du verrou n’existe plus', () => {
    expect(existsSync(path.join(PAQUET, 'scripts', ANCIENS[4] + '.mjs'))).toBe(false);
  });

  it.each(ANCIENS.slice(0, 4))('aucun code du paquet ne garde « %s »', nom => {
    const lecteurs = code
      .filter(f => readFileSync(f, 'utf8').includes(nom))
      .map(f => path.relative(PAQUET, f));
    expect(lecteurs).toEqual([]);
  });

  it('aucun code du paquet n’importe l’ancien module du verrou', () => {
    const lecteurs = code
      .filter(f => readFileSync(f, 'utf8').includes(ANCIENS[4] as string))
      .map(f => path.relative(PAQUET, f));
    expect(lecteurs).toEqual([]);
  });
});

describe('la base de configuration des tests isole ses parts', () => {
  const setup = path.join(PAQUET, 'scripts/langages/typescript/vitest-config/machine.setup.mjs');

  it('pose le dossier de remplacement des parts, un par passe de tests', () => {
    expect(readFileSync(setup, 'utf8')).toContain('GRILLHOUSE_PARTS_DE_LA_MACHINE');
  });
});
