// La mesure d'essai de la machine : GRILLHOUSE_MESURE_D_ESSAI porte en JSON la mesure
// { coeurs, charge, memoireLibre, memoireTotale } dont l'état des places (scripts/places-de-la-machine.mjs
// `etatDesPlaces`) tire sa charge, ses cœurs et sa mémoire ; sans elle, l'état mesure la machine
// (scripts/mesure-de-la-machine.mjs). Le tableau (scripts/tableau.mjs) en rend la même ligne des
// places en texte et en JSON ; une valeur fautive est refusée par le nom de la variable, et le
// tableau n'affiche alors aucune ligne des places.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const SCRIPT = path.resolve(__dirname, '../../scripts/tableau.mjs');
const GO = 1024 ** 3;
const VARIABLE = 'GRILLHOUSE_MESURE_D_ESSAI';

interface Ligne {
  texte: string;
  section?: string;
}

// Un dépôt dont Beads répond depuis un fichier ; la fonction rend la sortie du tableau sous <env>.
const lanceur = (essais: string) => {
  const racine = mkdtempSync(path.join(essais, 'depot-'));
  mkdirSync(path.join(racine, '.beads'));
  writeFileSync(path.join(racine, '.beads/config.yaml'), 'issue-prefix: "demo"\n');
  const bin = mkdtempSync(path.join(essais, 'bin-'));
  const home = mkdtempSync(path.join(essais, 'home-'));
  writeFileSync(path.join(bin, 'tous.json'), '[]');
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\ncase "$1" in\n  config) echo demo ;;\n  list) cat '${bin}/tous.json' ;;\n  *) echo '[]' ;;\nesac\n`,
    { mode: 0o755 }
  );
  const registre = path.join(bin, 'registre.jsonl');
  writeFileSync(registre, '');
  return (args: string[], env: Record<string, string | undefined>) =>
    execFileSync('node', [SCRIPT, ...args], {
      cwd: racine,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HOME: home,
        GRILLHOUSE_REGISTRE: registre,
        [VARIABLE]: undefined,
        ...env,
      },
    });
};
const RACINE = mkdtempSync(path.join(tmpdir(), 'tableau-mesure-'));
afterAll(() => rmSync(RACINE, { recursive: true, force: true }));
const essais = () => mkdtempSync(path.join(RACINE, 'essai-'));
const desPlaces = (l: string) => l.startsWith('Places ');

describe('la mesure d’essai fixe la mesure de la machine du tableau', () => {
  it('le texte et le JSON portent la même ligne des places, au chiffre près', () => {
    const lancer = lanceur(essais());
    const env = {
      [VARIABLE]: JSON.stringify({
        coeurs: 12,
        charge: 10.24,
        memoireLibre: 24.5 * GO,
        memoireTotale: 31.3 * GO,
      }),
    };
    const texte = lancer(['--texte'], env).split('\n');
    const json = JSON.parse(lancer([], env)) as { lignes: Ligne[] };
    const duTexte = texte.filter(desPlaces);
    const duJson = json.lignes.map(l => l.texte).filter(desPlaces);
    expect(duTexte).toEqual(['Places 0/3 · charge 10,2/12 · mémoire 24/31 Go']);
    expect(duJson).toEqual(duTexte);
  });

  it('une autre mesure change la ligne : ses cœurs, sa charge et sa mémoire sont ceux de la variable', () => {
    const lancer = lanceur(essais());
    const env = {
      [VARIABLE]: JSON.stringify({
        coeurs: 4,
        charge: 0.5,
        memoireLibre: 7 * GO,
        memoireTotale: 8 * GO,
      }),
    };
    const lignes = lancer(['--texte'], env).split('\n');
    expect(lignes.filter(desPlaces)).toEqual(['Places 0/3 · charge 0,5/4 · mémoire 7/8 Go']);
  });

  it.each([
    ['un JSON illisible', 'pas du json'],
    ['un champ manquant', JSON.stringify({ coeurs: 12, charge: 3 })],
    ['un champ non numérique', JSON.stringify({ coeurs: 12, charge: 'haute', memoireLibre: GO })],
  ])('%s : le tableau n’affiche aucune ligne des places', (_nom, valeur) => {
    const lancer = lanceur(essais());
    const lignes = lancer(['--texte'], { [VARIABLE]: valeur }).split('\n');
    expect(lignes.some(desPlaces)).toBe(false);
    expect(lignes.some(l => l.startsWith('AGENTS'))).toBe(true);
  });
});

describe('l’état des places lit la mesure d’essai', () => {
  const etat = async (env: Record<string, string | undefined>) =>
    (
      (await import('../../scripts/places-de-la-machine.mjs')) as {
        etatDesPlaces: (o: { env: Record<string, string | undefined> }) => {
          charge: number;
          coeurs: number;
          memoireGo: number;
          memoireTotaleGo: number;
        };
      }
    ).etatDesPlaces({ env: { CI: '1', ...env } });

  it('sa charge, ses cœurs et sa mémoire viennent de la variable', async () => {
    const r = await etat({
      [VARIABLE]: JSON.stringify({
        coeurs: 8,
        charge: 3.14,
        memoireLibre: 5.9 * GO,
        memoireTotale: 15.6 * GO,
      }),
    });
    expect(r).toMatchObject({ charge: 3.1, coeurs: 8, memoireGo: 5, memoireTotaleGo: 15 });
  });

  it.each([
    ['un JSON illisible', '{'],
    ['un champ manquant', JSON.stringify({ coeurs: 8, memoireLibre: GO, memoireTotale: GO })],
    ['sans la mémoire totale', JSON.stringify({ coeurs: 8, charge: 1, memoireLibre: GO })],
    ['un champ non numérique', JSON.stringify({ coeurs: 8, charge: 1, memoireLibre: '1Go' })],
    ['un champ nul', JSON.stringify({ coeurs: null, charge: 1, memoireLibre: GO })],
  ])('%s est refusé par le nom de la variable', async (_nom, valeur) => {
    await expect(etat({ [VARIABLE]: valeur })).rejects.toThrow(VARIABLE);
  });
});

describe('sans la variable, l’état des places mesure la machine réelle', () => {
  afterEach(() => {
    vi.doUnmock('node:os');
    vi.doUnmock('node:fs');
    vi.resetModules();
  });

  it('la charge sur une minute, les cœurs, la mémoire libre et la totale viennent du système', async () => {
    vi.resetModules();
    vi.doMock('node:os', async importOriginal => ({
      ...(await importOriginal<typeof import('node:os')>()),
      availableParallelism: () => 6,
      loadavg: () => [2.34, 9, 9],
      freemem: () => 3 * GO,
      totalmem: () => 31.3 * GO,
    }));
    vi.doMock('node:fs', async importOriginal => {
      const reel = await importOriginal<typeof import('node:fs')>();
      return {
        ...reel,
        readFileSync: (f: string, ...a: unknown[]) =>
          f === '/proc/meminfo'
            ? `MemTotal: 99999999 kB\nMemAvailable: ${8 * 1024 * 1024} kB\n`
            : (reel.readFileSync as (...x: unknown[]) => unknown)(f, ...a),
      };
    });
    const { etatDesPlaces } = (await import('../../scripts/places-de-la-machine.mjs')) as {
      etatDesPlaces: (o: { env: Record<string, string> }) => Record<string, number>;
    };
    expect(etatDesPlaces({ env: { CI: '1' } })).toMatchObject({
      charge: 2.3,
      coeurs: 6,
      memoireGo: 8,
      memoireTotaleGo: 31,
    });
  });
});

describe('le gabarit de test pose la mesure d’essai', () => {
  it('la variable est posée dans chaque passe de tests, en JSON { coeurs, charge, memoireLibre, memoireTotale }', () => {
    const mesure = JSON.parse(process.env[VARIABLE] ?? 'null') as Record<string, unknown> | null;
    expect(mesure).not.toBeNull();
    for (const champ of ['coeurs', 'charge', 'memoireLibre', 'memoireTotale']) {
      expect(typeof mesure?.[champ], champ).toBe('number');
    }
  });
});
