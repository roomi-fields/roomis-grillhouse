// La consommation des passes lourdes : ce que le scope du gestionnaire systemd rend (`lireLeScope`),
// le registre sous `<git common dir>/grillhouse/` (`garderLaConsommation`, `lireLaConsommation`),
// les chiffres par sorte (`bilanDeLaConsommation`), l'échantillonneur d'une passe tuée
// (`echantillonner`) et la commande `grillhouse consommation` (`consommation`). La passe elle-même
// se joue dans tests/unit/passe-lourde-mesuree.spec.ts.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPTS = path.resolve(__dirname, '../../scripts');
const MODULE = pathToFileURL(path.join(SCRIPTS, 'consommation-des-passes.mjs')).href;
const ECHANTILLONNEUR = pathToFileURL(path.join(SCRIPTS, 'echantillonneur-de-la-passe.mjs')).href;
const COMMANDE = pathToFileURL(path.join(SCRIPTS, 'consommation.mjs')).href;

type Ligne = {
  sorte: string;
  ticket?: string;
  dureeMs: number;
  cpuNs: number | null;
  memoirePic: number | null;
  coeurs: number;
  issue: 'verte' | 'rouge' | 'interrompue';
  fin: string;
};
type Rang = {
  sorte: string;
  passes: number;
  coeursMediane: number;
  coeursMax: number;
  memoireMediane: number;
  memoireMax: number;
};
type Module = {
  lireLeScope: (texte: string) => { cpuNs: number | null; memoirePic: number | null };
  fichierDeConsommation: (racine: string) => string | null;
  garderLaConsommation: (racine: string, ligne: Ligne) => void;
  lireLaConsommation: (racine: string) => Ligne[];
  bilanDeLaConsommation: (lignes: Ligne[]) => Rang[];
};
const charger = async (): Promise<Module> => (await import(MODULE)) as Module;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'consommation-des-passes-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
let n = 0;
const unDepot = (): string => {
  const d = path.join(ESSAIS, `depot-${++n}`);
  mkdirSync(d, { recursive: true });
  const r = spawnSync('git', ['-C', d, 'init', '-q'], { encoding: 'utf8' });
  expect(r.status).toBe(0);
  return d;
};
const unDossier = (): string => {
  const d = path.join(ESSAIS, `dossier-${++n}`);
  mkdirSync(d, { recursive: true });
  return d;
};

const GO = 1024 ** 3;
const ligne = (o: Partial<Ligne> = {}): Ligne => ({
  sorte: 'verification',
  dureeMs: 10_000,
  cpuNs: 20_000_000_000,
  memoirePic: 2 * GO,
  coeurs: 8,
  issue: 'verte',
  fin: '2026-11-18T10:00:00.000Z',
  ...o,
});

describe('lire ce que le scope d’une passe rend', () => {
  it('lit le temps de processeur et le pic de mémoire du scope', async () => {
    const { lireLeScope } = await charger();
    expect(lireLeScope('CPUUsageNSec=1234567890\nMemoryPeak=987654321\n')).toEqual({
      cpuNs: 1234567890,
      memoirePic: 987654321,
    });
  });
  it('lit les deux valeurs quel que soit leur ordre', async () => {
    const { lireLeScope } = await charger();
    expect(lireLeScope('MemoryPeak=42\nCPUUsageNSec=7\n')).toEqual({ cpuNs: 7, memoirePic: 42 });
  });
  it('un temps de processeur non rendu (« [not set] ») est illisible, non zéro', async () => {
    const { lireLeScope } = await charger();
    expect(lireLeScope('CPUUsageNSec=[not set]\nMemoryPeak=42\n')).toEqual({
      cpuNs: null,
      memoirePic: 42,
    });
  });
  it('une valeur « infini » de systemd (2^64 − 1) est illisible', async () => {
    const { lireLeScope } = await charger();
    expect(
      lireLeScope('CPUUsageNSec=18446744073709551615\nMemoryPeak=18446744073709551615\n')
    ).toEqual({
      cpuNs: null,
      memoirePic: null,
    });
  });
  it('un texte vide ne rend aucune valeur', async () => {
    const { lireLeScope } = await charger();
    expect(lireLeScope('')).toEqual({ cpuNs: null, memoirePic: null });
  });
});

describe('le registre de la consommation sous le dépôt', () => {
  it('vit sous le dossier commun de git du projet, dans grillhouse/', async () => {
    const { fichierDeConsommation } = await charger();
    const depot = unDepot();
    const f = fichierDeConsommation(depot) as string;
    expect(path.dirname(f)).toBe(path.join(depot, '.git', 'grillhouse'));
  });
  it('hors de git, il n’a pas d’adresse et rien ne s’écrit', async () => {
    const { fichierDeConsommation, garderLaConsommation, lireLaConsommation } = await charger();
    const hors = unDossier();
    expect(fichierDeConsommation(hors)).toBeNull();
    garderLaConsommation(hors, ligne());
    expect(lireLaConsommation(hors)).toEqual([]);
  });
  it('chaque mesure gardée est une ligne ajoutée, les précédentes restent', async () => {
    const { fichierDeConsommation, garderLaConsommation, lireLaConsommation } = await charger();
    const depot = unDepot();
    const a = ligne({ sorte: 'controles', ticket: 'grillhouse-x.1', issue: 'rouge' });
    const b = ligne({ issue: 'interrompue', cpuNs: null, memoirePic: null });
    garderLaConsommation(depot, a);
    garderLaConsommation(depot, b);
    expect(lireLaConsommation(depot)).toEqual([a, b]);
    const texte = readFileSync(fichierDeConsommation(depot) as string, 'utf8');
    expect(texte.trimEnd().split('\n')).toHaveLength(2);
  });
  it('une ligne hors ticket n’a pas de clé ticket, une ligne de ticket la garde', async () => {
    const { garderLaConsommation, lireLaConsommation } = await charger();
    const depot = unDepot();
    garderLaConsommation(depot, ligne());
    garderLaConsommation(depot, ligne({ ticket: 'grillhouse-x.2' }));
    const [sans, avec] = lireLaConsommation(depot);
    expect('ticket' in (sans as object)).toBe(false);
    expect(avec?.ticket).toBe('grillhouse-x.2');
  });
  it('un registre absent se lit vide, une ligne mal formée est ignorée', async () => {
    const { fichierDeConsommation, garderLaConsommation, lireLaConsommation } = await charger();
    const depot = unDepot();
    expect(lireLaConsommation(depot)).toEqual([]);
    garderLaConsommation(depot, ligne());
    const f = fichierDeConsommation(depot) as string;
    const { appendFileSync } = await import('node:fs');
    appendFileSync(f, 'pas du json\n');
    garderLaConsommation(depot, ligne({ sorte: 'nuit' }));
    expect(lireLaConsommation(depot).map(l => l.sorte)).toEqual(['verification', 'nuit']);
  });
});

describe('les chiffres de la consommation par sorte de passe', () => {
  it('rend, par sorte, le nombre de passes, la médiane et le maximum des cœurs occupés et du pic', async () => {
    const { bilanDeLaConsommation } = await charger();
    // cœurs occupés = temps de processeur ÷ durée : 2, 4 et 6.
    const lignes = [
      ligne({ cpuNs: 20e9, dureeMs: 10_000, memoirePic: 1 * GO }),
      ligne({ cpuNs: 40e9, dureeMs: 10_000, memoirePic: 5 * GO }),
      ligne({ cpuNs: 60e9, dureeMs: 10_000, memoirePic: 3 * GO }),
    ];
    expect(bilanDeLaConsommation(lignes)).toEqual([
      {
        sorte: 'verification',
        passes: 3,
        coeursMediane: 4,
        coeursMax: 6,
        memoireMediane: 3 * GO,
        memoireMax: 5 * GO,
      },
    ]);
  });
  it('la médiane d’un nombre pair de passes est la moyenne des deux du milieu', async () => {
    const { bilanDeLaConsommation } = await charger();
    const [r] = bilanDeLaConsommation([
      ligne({ cpuNs: 10e9, dureeMs: 10_000, memoirePic: 2 * GO }),
      ligne({ cpuNs: 30e9, dureeMs: 10_000, memoirePic: 4 * GO }),
    ]);
    expect(r?.coeursMediane).toBe(2);
    expect(r?.memoireMediane).toBe(3 * GO);
  });
  it('une ligne par sorte, chaque sorte avec ses seules passes', async () => {
    const { bilanDeLaConsommation } = await charger();
    const rangs = bilanDeLaConsommation([
      ligne({ sorte: 'controles', cpuNs: 10e9, memoirePic: 1 * GO }),
      ligne({ sorte: 'nuit', cpuNs: 80e9, memoirePic: 9 * GO }),
      ligne({ sorte: 'controles', cpuNs: 30e9, memoirePic: 3 * GO }),
    ]);
    const parSorte = Object.fromEntries(rangs.map(r => [r.sorte, r]));
    expect(rangs).toHaveLength(2);
    expect(parSorte.controles).toMatchObject({ passes: 2, coeursMax: 3, memoireMax: 3 * GO });
    expect(parSorte.nuit).toMatchObject({ passes: 1, coeursMax: 8, memoireMax: 9 * GO });
  });
  it('une passe rouge ou interrompue compte quand son temps de processeur est lisible', async () => {
    const { bilanDeLaConsommation } = await charger();
    const [r] = bilanDeLaConsommation([
      ligne({ issue: 'rouge' }),
      ligne({ issue: 'interrompue' }),
      ligne({ issue: 'verte' }),
    ]);
    expect(r?.passes).toBe(3);
  });
  it('une mesure sans temps de processeur lisible n’entre pas dans les chiffres', async () => {
    const { bilanDeLaConsommation } = await charger();
    const rangs = bilanDeLaConsommation([
      ligne({ cpuNs: 20e9, memoirePic: 2 * GO }),
      ligne({ cpuNs: null, memoirePic: 30 * GO, issue: 'interrompue' }),
    ]);
    expect(rangs).toHaveLength(1);
    expect(rangs[0]).toMatchObject({ passes: 1, coeursMax: 2, memoireMax: 2 * GO });
  });
  it('une sorte dont aucune mesure n’a de temps de processeur lisible n’a pas de ligne', async () => {
    const { bilanDeLaConsommation } = await charger();
    expect(bilanDeLaConsommation([ligne({ sorte: 'nuit', cpuNs: null })])).toEqual([]);
  });
  it('sans mesure, rien', async () => {
    const { bilanDeLaConsommation } = await charger();
    expect(bilanDeLaConsommation([])).toEqual([]);
  });
});

describe('l’échantillonneur d’une passe tuée sans rendre la main', () => {
  type Port = {
    base: { sorte: string; ticket?: string; coeurs: number; debut: number };
    lire: () => { cpuNs: number | null; memoirePic: number | null } | null;
    vivante: () => boolean;
    finale: () => boolean;
    noter: (l: { cpuNs: number | null; memoirePic: number | null }) => void;
    garder: (l: Ligne) => void;
    maintenant: () => number;
    dormir: () => void;
  };
  const echantillonner = async (p: Port): Promise<void> =>
    ((await import(ECHANTILLONNEUR)) as { echantillonner: (p: Port) => void }).echantillonner(p);

  // Une passe qui vit pendant `lectures.length` tours, que `tue` laisse sans ligne finale.
  const banc = (
    lectures: ({ cpuNs: number | null; memoirePic: number | null } | null)[],
    finale = false
  ) => {
    let tour = 0;
    let t = 10_000;
    const notees: unknown[] = [];
    const gardees: Ligne[] = [];
    const port: Port = {
      base: { sorte: 'verification', coeurs: 8, debut: 10_000 },
      lire: () => lectures[Math.min(tour, lectures.length - 1)] ?? null,
      vivante: () => tour < lectures.length,
      finale: () => finale,
      noter: l => notees.push(l),
      garder: l => gardees.push(l),
      maintenant: () => t,
      dormir: () => {
        tour += 1;
        t += 1000;
      },
    };
    return { port, notees, gardees };
  };

  it('relit le scope pendant la passe et note chaque lecture lisible', async () => {
    const { port, notees } = banc([
      { cpuNs: 1e9, memoirePic: 1 * GO },
      { cpuNs: 3e9, memoirePic: 2 * GO },
    ]);
    await echantillonner(port);
    expect(notees).toEqual([
      { cpuNs: 1e9, memoirePic: 1 * GO },
      { cpuNs: 3e9, memoirePic: 2 * GO },
    ]);
  });
  it('quand la passe a disparu sans ligne finale, écrit « interrompue » avec la dernière lecture', async () => {
    const { port, gardees } = banc([
      { cpuNs: 1e9, memoirePic: 1 * GO },
      { cpuNs: 3e9, memoirePic: 2 * GO },
    ]);
    port.base.ticket = 'grillhouse-x.1';
    await echantillonner(port);
    expect(gardees).toHaveLength(1);
    expect(gardees[0]).toMatchObject({
      sorte: 'verification',
      ticket: 'grillhouse-x.1',
      coeurs: 8,
      issue: 'interrompue',
      cpuNs: 3e9,
      memoirePic: 2 * GO,
    });
    expect(gardees[0]?.dureeMs).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(gardees[0]?.fin as string))).toBe(false);
  });
  it('une lecture manquée garde la lecture d’avant', async () => {
    const { port, gardees } = banc([{ cpuNs: 5e9, memoirePic: 4 * GO }, null, null]);
    await echantillonner(port);
    expect(gardees[0]).toMatchObject({ cpuNs: 5e9, memoirePic: 4 * GO });
  });
  it('une passe qui a écrit sa ligne finale n’en reçoit aucune de plus', async () => {
    const { port, gardees } = banc([{ cpuNs: 1e9, memoirePic: 1 * GO }], true);
    await echantillonner(port);
    expect(gardees).toEqual([]);
  });
  it('une passe tuée avant toute lecture lisible écrit sa ligne sans valeurs, interrompue', async () => {
    const { port, gardees } = banc([null, null]);
    await echantillonner(port);
    expect(gardees).toHaveLength(1);
    expect(gardees[0]).toMatchObject({ issue: 'interrompue', cpuNs: null, memoirePic: null });
  });
});

describe('la commande consommation', () => {
  type Sortie = { code: number; sortie: string };
  const lancer = async (racine: string, args: string[]): Promise<Sortie> => {
    const { consommation } = (await import(COMMANDE)) as {
      consommation: (o: { args: string[]; racine: string; ecrire: (t: string) => void }) => number;
    };
    let sortie = '';
    const code = consommation({ args, racine, ecrire: t => (sortie += t) });
    return { code, sortie };
  };
  const rempli = async (): Promise<string> => {
    const { garderLaConsommation } = await charger();
    const depot = unDepot();
    garderLaConsommation(depot, ligne({ cpuNs: 20e9, memoirePic: 1 * GO }));
    garderLaConsommation(depot, ligne({ cpuNs: 60e9, memoirePic: 3 * GO }));
    garderLaConsommation(depot, ligne({ sorte: 'nuit', cpuNs: 80e9, memoirePic: 9 * GO }));
    garderLaConsommation(depot, ligne({ sorte: 'nuit', cpuNs: null, memoirePic: 30 * GO }));
    return depot;
  };

  it('sans aucune mesure, écrit « aucune mesure » et sort 0', async () => {
    const r = await lancer(unDepot(), []);
    expect(r.code).toBe(0);
    expect(r.sortie).toContain('aucune mesure');
  });
  it('rend une ligne par sorte de passe, avec le nombre de passes', async () => {
    const r = await lancer(await rempli(), []);
    const lignes = r.sortie.split('\n').filter(l => l.trim() !== '');
    expect(r.code).toBe(0);
    expect(lignes).toHaveLength(2);
    expect(lignes.find(l => l.includes('verification'))).toMatch(/\b2\b/);
    expect(lignes.find(l => l.includes('nuit'))).toMatch(/\b1\b/);
  });
  it('--json rend les mêmes valeurs en JSON', async () => {
    const r = await lancer(await rempli(), ['--json']);
    const rangs = JSON.parse(r.sortie) as Rang[];
    expect(r.code).toBe(0);
    expect(rangs.find(x => x.sorte === 'verification')).toEqual({
      sorte: 'verification',
      passes: 2,
      coeursMediane: 4,
      coeursMax: 6,
      memoireMediane: 2 * GO,
      memoireMax: 3 * GO,
    });
    expect(rangs.find(x => x.sorte === 'nuit')).toMatchObject({
      passes: 1,
      coeursMax: 8,
      memoireMax: 9 * GO,
    });
  });
  it('--json sans mesure rend une liste vide et sort 0', async () => {
    const r = await lancer(unDepot(), ['--json']);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.sortie)).toEqual([]);
  });
});
