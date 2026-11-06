// The copy of the trial package takes what the package publishes (`files` of
// its package.json), never the working tree: a folder that lies beside it, or that is born or
// vanishes meanwhile, is neither read nor copied. Small tests on a trial package built in a
// temporary directory of the test.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PAQUET } from './outil-essai.js';
import { copierLePaquet, copieSaine } from './verrou-essai.js';

const RACINE = mkdtempSync(path.join(tmpdir(), 'copie-paquet-'));
afterAll(() => rmSync(RACINE, { recursive: true, force: true }));
let compte = 0;
const temporaire = () => {
  const d = path.join(RACINE, `p${++compte}`);
  mkdirSync(d);
  return d;
};
const ecrire = (racine: string, rel: string, texte = 'x') => {
  mkdirSync(path.dirname(path.join(racine, rel)), { recursive: true });
  writeFileSync(path.join(racine, rel), texte);
};

// A package whose `files` name a file, a folder, and an entry that the tree does not hold.
function paquetEssai() {
  const source = temporaire();
  ecrire(
    source,
    'package.json',
    JSON.stringify({ name: 'p', files: ['bin', 'charte.md', 'cadre'] })
  );
  ecrire(source, 'bin/a.mjs', 'a');
  ecrire(source, 'bin/sous/b.mjs', 'b');
  ecrire(source, 'charte.md', 'charte');
  return source;
}

describe('la copie du paquet d’essai prend ce que le paquet publie', () => {
  it('le package.json et les entrées de `files` présentes sont copiés', () => {
    const source = paquetEssai();
    const vers = path.join(temporaire(), 'copie');
    copierLePaquet(source, vers);
    expect(readFileSync(path.join(vers, 'package.json'), 'utf8')).toContain('"name":"p"');
    expect(readFileSync(path.join(vers, 'bin/a.mjs'), 'utf8')).toBe('a');
    expect(readFileSync(path.join(vers, 'bin/sous/b.mjs'), 'utf8')).toBe('b');
    expect(readFileSync(path.join(vers, 'charte.md'), 'utf8')).toBe('charte');
  });

  it('une entrée de `files` absente de l’arbre est ignorée sans échec', () => {
    const source = paquetEssai();
    const vers = path.join(temporaire(), 'copie');
    expect(() => copierLePaquet(source, vers)).not.toThrow();
    expect(existsSync(path.join(vers, 'cadre'))).toBe(false);
  });

  it('un dossier ou un fichier hors de `files` à la racine n’est ni lu ni copié', () => {
    const source = paquetEssai();
    ecrire(source, '.essai-x/depot/.git/refs/tags/t', 'piege');
    ecrire(source, 'tests/t.spec.ts');
    ecrire(source, 'node_modules/m/index.js');
    ecrire(source, 'autre.txt');
    const vers = path.join(temporaire(), 'copie');
    copierLePaquet(source, vers);
    for (const hors of ['.essai-x', 'tests', 'node_modules', 'autre.txt']) {
      expect(existsSync(path.join(vers, hors)), hors).toBe(false);
    }
    expect(existsSync(path.join(vers, 'bin/a.mjs'))).toBe(true);
  });

  it('un dossier hors de `files` illisible à la racine ne fait pas échouer la copie', () => {
    const source = paquetEssai();
    // A dangling link would make a recursive stat of the root fail; the root is not walked.
    const hors = path.join(source, '.essai-y');
    mkdirSync(hors);
    ecrire(hors, 'depot/.git/refs/tags/t');
    rmSync(path.join(hors, 'depot/.git/refs/tags'), { recursive: true });
    const vers = path.join(temporaire(), 'copie');
    expect(() => copierLePaquet(source, vers)).not.toThrow();
  });

  it('la copie du vrai paquet ne contient que package.json et les entrées de `files` présentes', () => {
    const vers = copieSaine('copie-vrai');
    const manifeste = JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')) as {
      files: string[];
    };
    const publie = manifeste.files;
    for (const rel of ['package.json', ...publie]) {
      expect(existsSync(path.join(vers, rel)), rel).toBe(existsSync(path.join(PAQUET, rel)));
    }
    expect(existsSync(path.join(vers, 'tests'))).toBe(false);
    expect(existsSync(path.join(vers, 'node_modules'))).toBe(false);
  });

  it('la copie du vrai paquet porte `bin`, `scripts` et `package.json` que le verrou joue', () => {
    const vers = copieSaine('copie-verrou');
    for (const rel of ['bin/grillhouse.mjs', 'scripts/langages.mjs', 'package.json']) {
      expect(existsSync(path.join(vers, rel)), rel).toBe(true);
    }
  });
});
