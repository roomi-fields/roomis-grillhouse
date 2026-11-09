// A trial directory under the home (`racineSousLaMaison`, grillhouse-matiere) belongs to the pass
// that made it: the next pass sweeps the ones whose pass is gone, and the finished pass fails on
// the ones it leaves. The mechanism is the base of a pass (scripts/mesure/base-de-passe.mjs); each
// case plays it under a trial home.
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { departDe, ligneDesRestes, ouvrirBase } from '../../scripts/mesure/base-de-passe.mjs';

const BASE = path.resolve(import.meta.dirname, '../../scripts/mesure/base-de-passe.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dossiers-essai-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ESPACE = readlinkSync('/proc/self/ns/pid');
const IL_Y_A_DEUX_JOURS = new Date(Date.now() - 2 * 24 * 3600 * 1000);

// A trial home, and the temporary directory a pass opens its base in.
const unePasse = () => {
  const racine = mkdtempSync(path.join(ESSAIS, 'p-'));
  const maison = path.join(racine, 'maison');
  const dans = path.join(racine, 'tmp');
  mkdirSync(path.join(maison, '.cache'), { recursive: true });
  mkdirSync(dans);
  return { maison, dans, cache: path.join(maison, '.cache') };
};

// A trial directory in <cache>, made by mkdtemp, its owner file holding <proprietaire> (none when null).
const unEssai = (cache: string, proprietaire: object | null) => {
  const d = mkdtempSync(path.join(cache, 'grillhouse-essais-'));
  if (proprietaire) {
    writeFileSync(path.join(d, '.grillhouse-base'), `${JSON.stringify(proprietaire)}\n`);
  }
  return d;
};

// A process that has ended: its number is free.
const unPidMort = () => spawnSync(process.execPath, ['-e', '']).pid;

// A pass that opens its base, as a run of tests does, under the trial home, then ends.
const ouvrirSousLaMaison = (
  p: { maison: string; dans: string },
  env: Record<string, string> = {}
) => {
  const propre = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !k.startsWith('VITEST') && !k.startsWith('GRILLHOUSE_') && k !== 'XDG_CACHE_HOME'
    )
  ) as Record<string, string>;
  const code = `import { ouvrirBase } from ${JSON.stringify(`file://${BASE}`)}; ouvrirBase('tests').fermer();`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8',
    env: { ...propre, HOME: p.maison, TMPDIR: p.dans, ...env },
  });
  expect(r.status, r.stderr).toBe(0);
};

describe('le balayage des dossiers d’essai sous la maison, à l’ouverture d’une passe', () => {
  it('retire le dossier dont la passe est morte, y compris un numéro repris par un autre processus', () => {
    const p = unePasse();
    const mort = unEssai(p.cache, { pid: unPidMort(), depart: '1', espace: ESPACE });
    const repris = unEssai(p.cache, {
      pid: process.pid,
      depart: `${departDe(process.pid)}0`,
      espace: ESPACE,
    });
    ouvrirSousLaMaison(p);
    expect(existsSync(mort)).toBe(false);
    expect(existsSync(repris)).toBe(false);
  });

  it('laisse le dossier dont la passe vit, celui d’un autre espace de processus et un autre dossier', () => {
    const p = unePasse();
    const vivant = unEssai(p.cache, {
      pid: process.pid,
      depart: departDe(process.pid),
      espace: ESPACE,
    });
    const ailleurs = unEssai(p.cache, {
      pid: unPidMort(),
      depart: '1',
      espace: 'pid:[4026999999]',
    });
    const autre = path.join(p.cache, 'autre-chose');
    mkdirSync(autre);
    ouvrirSousLaMaison(p);
    expect(existsSync(vivant)).toBe(true);
    expect(existsSync(ailleurs)).toBe(true);
    expect(existsSync(autre)).toBe(true);
  });

  it('laisse un dossier sans fichier lisible de moins d’un jour, retire celui de plus d’un jour', () => {
    const p = unePasse();
    const jeune = unEssai(p.cache, null);
    const vieux = unEssai(p.cache, null);
    utimesSync(vieux, IL_Y_A_DEUX_JOURS, IL_Y_A_DEUX_JOURS);
    ouvrirSousLaMaison(p);
    expect(existsSync(jeune)).toBe(true);
    expect(existsSync(vieux)).toBe(false);
  });

  it('sous l’enveloppe, la passe ne balaie pas la maison', () => {
    const p = unePasse();
    const mort = unEssai(p.cache, { pid: unPidMort(), depart: '1', espace: ESPACE });
    const vieux = unEssai(p.cache, null);
    utimesSync(vieux, IL_Y_A_DEUX_JOURS, IL_Y_A_DEUX_JOURS);
    ouvrirSousLaMaison(p, { GRILLHOUSE_ENVELOPPE: '1' });
    expect(existsSync(mort)).toBe(true);
    expect(existsSync(vieux)).toBe(true);
  });
});

describe('la garde d’une passe sur les dossiers d’essai qu’elle laisse', () => {
  afterEach(() => vi.unstubAllEnvs());
  const avecMaison = <T>(maison: string, jouer: () => T): T => {
    vi.stubEnv('HOME', maison);
    return jouer();
  };

  it('nomme un dossier qu’un test crée sous la maison, pas celui d’une autre passe vivante', () => {
    const p = unePasse();
    avecMaison(p.maison, () => {
      const passe = ouvrirBase('tests', { dans: p.dans });
      // Another pass that lives: a process of its own, with its own number and start.
      const voisin = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
        stdio: 'ignore',
      });
      try {
        vi.stubEnv('TMPDIR', passe.dossier);
        const mien = racineSousLaMaison('grillhouse-essais-', p.maison);
        const autre = unEssai(p.cache, {
          pid: voisin.pid,
          depart: departDe(voisin.pid as number),
          espace: ESPACE,
        });
        const restes = passe.essais();
        expect(restes).toEqual([path.basename(mien)]);
        expect(restes).not.toContain(path.basename(autre));
        const ligne = ligneDesRestes(restes);
        expect(ligne).toContain(path.basename(mien));
        expect(ligne).toMatch(/rouge compris/);
        rmSync(mien, { recursive: true, force: true });
        expect(passe.essais()).toEqual([]);
      } finally {
        voisin.kill();
        passe.fermer();
      }
    });
  });

  it('nomme un dossier dont le fichier nomme la passe, qu’un processus enfant l’ait écrit', () => {
    const p = unePasse();
    avecMaison(p.maison, () => {
      const passe = ouvrirBase('tests', { dans: p.dans });
      try {
        const enfant = unEssai(p.cache, {
          pid: process.pid,
          depart: departDe(process.pid),
          espace: ESPACE,
        });
        expect(passe.essais()).toEqual([path.basename(enfant)]);
      } finally {
        passe.fermer();
      }
    });
  });

  it('ne nomme rien quand la passe ne laisse aucun dossier d’essai', () => {
    const p = unePasse();
    avecMaison(p.maison, () => {
      const passe = ouvrirBase('tests', { dans: p.dans });
      try {
        expect(passe.essais()).toEqual([]);
      } finally {
        passe.fermer();
      }
    });
  });
});
