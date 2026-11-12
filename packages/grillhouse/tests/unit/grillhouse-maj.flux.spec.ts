// The update names each flow of the CI without entry in `grillhouse.flux` of the package.json and
// the command that writes the whole object, once (`npm pkg set --json`): the entries already
// declared are kept as they are, each missing flow gets the list ["<paquet>"], a name the graph does
// not know, so the guard stays red until the project names the package the flow exercises. The read
// is `fluxSansEntree` of the guard (scripts/flux-des-paquets.mjs). Witness: SyntHub at 0.34.0, whose
// flows the CHANGELOG had never told to declare.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { afterAll, describe, expect, it } from 'vitest';
import { fluxSansEntree } from '../../scripts/flux-des-paquets.mjs';
import { mettreAJour, rapport } from '../../scripts/grillhouse-maj.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'grillhouse-maj-flux-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../../../..');
const CI = '.github/workflows/ci.yml';
const NUIT = '.github/workflows/nuit.yml';
const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};

// A project of TypeScript declaring <flux> (absent when undefined), with the workflows <ymls>.
function projet(flux: unknown, ymls: string[]) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(
    racine,
    'package.json',
    `${JSON.stringify({ name: 'p', ...(flux === undefined ? {} : { grillhouse: { flux } }) })}\n`
  );
  declarerLesLangages(racine);
  for (const y of ymls) {
    ecrire(racine, y, 'name: x\n');
  }
  return racine;
}
const montee = (racine: string) => rapport(mettreAJour(racine, DEPOT));
const occurrences = (texte: string, motif: string) => texte.split(motif).length - 1;

describe('la montée nomme chaque flux sans entrée et la commande qui déclare grillhouse.flux', () => {
  it('écrit l’objet complet : l’entrée déclarée reprise, le flux manquant avec la liste ["<paquet>"]', () => {
    const racine = projet({ [CI]: ['mon-paquet'] }, [CI, NUIT]);
    const texte = montee(racine);
    expect(texte).toContain(
      `npm pkg set --json grillhouse.flux='{"${CI}":["mon-paquet"],"${NUIT}":["<paquet>"]}'`
    );
    expect(texte).toContain(NUIT);
  });

  it('donne à chaque flux d’un projet sans clé la liste ["<paquet>"], triés', () => {
    const racine = projet(undefined, [NUIT, CI]);
    expect(montee(racine)).toContain(
      `npm pkg set --json grillhouse.flux='{"${CI}":["<paquet>"],"${NUIT}":["<paquet>"]}'`
    );
  });

  it('la liste écrite est un nom inconnu du graphe, jamais une liste vide', () => {
    const racine = projet(undefined, [CI]);
    const texte = montee(racine);
    expect(texte).toContain('["<paquet>"]');
    expect(texte).not.toContain('[]');
  });

  it('reprend telle quelle une entrée déclarée dont le fichier est absent', () => {
    const racine = projet({ '.github/workflows/ancien.yml': ['@p/a', '@p/b'] }, [CI]);
    const texte = montee(racine);
    expect(texte).toContain(`"${'.github/workflows/ancien.yml'}":["@p/a","@p/b"]`);
    expect(texte).toContain(`"${CI}":["<paquet>"]`);
  });

  it('dit la commande une fois, et nomme les flux que fluxSansEntree rend', () => {
    const racine = projet(undefined, [CI, NUIT]);
    const texte = montee(racine);
    expect(occurrences(texte, 'npm pkg set --json')).toBe(1);
    for (const f of fluxSansEntree(racine)) {
      expect(texte).toContain(f);
    }
  });

  it('n’a pas cette ligne quand chaque flux est déclaré', () => {
    const racine = projet({ [CI]: ['a'], [NUIT]: ['b'] }, [CI, NUIT]);
    expect(montee(racine)).not.toContain('grillhouse.flux');
  });

  it('n’a pas cette ligne pour un projet sans flux', () => {
    expect(montee(projet(undefined, []))).not.toContain('grillhouse.flux');
  });

  it('n’a pas cette ligne quand la clé est fautive', () => {
    for (const faute of ['ci.yml', ['a'], { [CI]: 'oui' }]) {
      expect(montee(projet(faute, [CI, NUIT]))).not.toContain('npm pkg set --json');
    }
  });
});
