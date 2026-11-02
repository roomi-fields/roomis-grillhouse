/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
// grillhouse-9kq critères 5 et 17 — le parallélisme des tests d'une séance d'agent : chaque séance
// reçoit max(1, cœurs ÷ places) travailleurs (GRILLHOUSE_TRAVAILLEURS), que le module de chaque
// langage passe à son outil (Vitest `maxWorkers`, nextest et cargo `-j`, pytest `-n`) ; la séance
// joue sous nice et ionice. Une passe lourde, sans la variable, garde tous les cœurs (l'outil
// décide). Modèle : `make -jN`, Bazel `--local_cpu_resources`, Slurm (cœurs réservés par tâche).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  environnementDeLaSeance,
  lancementDeLaSeance,
  sousNiceEtIonice,
} from '../../scripts/enveloppe/enveloppe.mjs';
import { lancementDeLaPasse } from '../../scripts/passe-de-la-machine.mjs';
import cargoModule from '../../scripts/langages/cargo/index.mjs';
import exemplesCargo from '../../scripts/langages/cargo/exemples.mjs';
import pythonModule from '../../scripts/langages/python/index.mjs';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';
import { installerFauxUv } from './langages/python/faux-uv.js';

type Commandes = { commandes: (r: string) => Record<string, { script: string; args: string[] }> };
const cargo = cargoModule as unknown as Commandes;
const python = pythonModule as unknown as Commandes;

const BASE = pathToFileURL(
  path.resolve(__dirname, '../../scripts/langages/typescript/vitest-config/base.mjs')
).href;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'travailleurs-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const JOURNAL_CARGO = path.join(ESSAIS, 'journal-cargo');
const JOURNAL_UV = path.join(ESSAIS, 'journal-uv');
let FAUX_UV = '';
let restaurer = () => {};
let espace = '';
beforeAll(() => {
  FAUX_UV = installerFauxUv(ESSAIS);
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), JOURNAL_CARGO);
  espace = (exemplesCargo.preparer(ESSAIS) as { depots: { espace: string } }).depots.espace;
});
afterAll(() => restaurer());
beforeEach(() => {
  writeFileSync(JOURNAL_CARGO, '');
  writeFileSync(JOURNAL_UV, '');
});

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const sansLaVariable = () => {
  const { GRILLHOUSE_TRAVAILLEURS: _, ...env } = process.env;
  void _;
  return env;
};

describe('grillhouse-9kq critères 5 et 17 — Vitest (module typescript)', () => {
  const maxWorkers = (travailleurs?: string) => {
    const env = {
      ...sansLaVariable(),
      ...(travailleurs ? { GRILLHOUSE_TRAVAILLEURS: travailleurs } : {}),
    };
    const r = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import b from ${JSON.stringify(BASE)}; console.log(JSON.stringify(b.test.maxWorkers ?? null));`,
      ],
      { encoding: 'utf8', env }
    );
    expect(r.status, r.stderr).toBe(0);
    return JSON.parse(r.stdout.trim().split('\n').pop() ?? 'null');
  };

  it('la configuration de base passe GRILLHOUSE_TRAVAILLEURS à maxWorkers', () => {
    expect(maxWorkers('4')).toBe(4);
    expect(maxWorkers('1')).toBe(1);
  });

  it('sans la variable (une passe lourde), maxWorkers reste celui de Vitest : tous les cœurs', () => {
    expect(maxWorkers()).toBeNull();
  });
});

describe('grillhouse-9kq critère 17 — nextest et cargo (module cargo)', () => {
  const jouer = (env: NodeJS.ProcessEnv) => {
    const c = cargo.commandes(espace).tester;
    const r = spawnSync(process.execPath, [c.script, ...c.args], {
      cwd: espace,
      encoding: 'utf8',
      env: {
        ...sansLaVariable(),
        HOME: path.join(ESSAIS, 'maison'),
        XDG_CACHE_HOME: '',
        GRILLHOUSE_RESULTATS: mkdtempSync(path.join(ESSAIS, 'resultats-')),
        ...env,
      },
    });
    expect(r.status, r.stderr).toBe(0);
    return readFileSync(JOURNAL_CARGO, 'utf8')
      .split('\n')
      .filter(l => l && !l.startsWith('metadata '));
  };

  it('chaque appel qui compile ou joue reçoit « -j 4 » sous GRILLHOUSE_TRAVAILLEURS=4', () => {
    const appels = jouer({ GRILLHOUSE_TRAVAILLEURS: '4' });
    const jouant = appels.filter(l => /^(nextest|test)\b/.test(l));
    expect(jouant.length).toBeGreaterThan(0);
    for (const l of jouant) {
      expect(l, l).toMatch(/(^| )-j 4( |$)/);
    }
  });

  it('le nombre suit la variable : 2 donne « -j 2 »', () => {
    const appels = jouer({ GRILLHOUSE_TRAVAILLEURS: '2' });
    expect(appels.filter(l => l.startsWith('nextest')).every(l => / -j 2( |$)/.test(l))).toBe(true);
  });

  it('sans la variable, aucun « -j » : cargo et nextest gardent tous les cœurs', () => {
    const appels = jouer({});
    expect(appels.some(l => /(^| )-j( |\d|$)/.test(l))).toBe(false);
  });
});

describe('grillhouse-9kq critère 17 — pytest (module python)', () => {
  const jouer = (env: NodeJS.ProcessEnv) => {
    const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
    ecrire(racine, 'package.json', JSON.stringify({ name: 'p', private: true }));
    declarerLesLangages(racine, { site: 'python' });
    ecrire(
      racine,
      'site/pyproject.toml',
      '[project]\nname = "g"\nversion = "0.1.0"\nrequires-python = ">=3.12"\n\n[dependency-groups]\ntest = ["pytest>=8", "pytest-xdist"]\n'
    );
    ecrire(racine, 'site/uv.lock', 'version = 1\n');
    ecrire(racine, 'site/test_a.py', 'def test_a():\n    assert True\n');
    const c = python.commandes(racine).tester;
    const r = spawnSync(process.execPath, [c.script, ...c.args], {
      cwd: racine,
      encoding: 'utf8',
      env: {
        ...sansLaVariable(),
        PATH: `${FAUX_UV}${path.delimiter}${process.env.PATH ?? ''}`,
        GRILLHOUSE_RESULTATS: mkdtempSync(path.join(ESSAIS, 'resultats-')),
        FAUX_UV_JOURNAL: JOURNAL_UV,
        ...env,
      },
    });
    expect(r.status, r.stderr).toBe(0);
    return readFileSync(JOURNAL_UV, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => (JSON.parse(l) as { args: string[] }).args);
  };

  it('pytest reçoit « -n 4 » sous GRILLHOUSE_TRAVAILLEURS=4', () => {
    const pytest = jouer({ GRILLHOUSE_TRAVAILLEURS: '4' }).find(a => a.includes('pytest'))!;
    const i = pytest.indexOf('-n');
    expect(i).toBeGreaterThan(-1);
    expect(pytest[i + 1]).toBe('4');
  });

  it('sans la variable, pas de « -n » : pytest joue seul', () => {
    const pytest = jouer({}).find(a => a.includes('pytest'))!;
    expect(pytest).not.toContain('-n');
  });
});

describe('grillhouse-9kq critère 5 — la séance d’agent reçoit ses travailleurs, sous nice et ionice', () => {
  const entree = { cacheNpm: '/c', paquets: ['p'], travail: '/t' };

  it('l’environnement de la séance porte GRILLHOUSE_TRAVAILLEURS', () => {
    const env = environnementDeLaSeance({ PATH: '/bin' }, { ...entree, travailleurs: 4 });
    expect(env.GRILLHOUSE_TRAVAILLEURS).toBe('4');
  });

  it('sans travailleurs donnés (une passe lourde), la variable n’y est pas', () => {
    const env = environnementDeLaSeance({ PATH: '/bin' }, entree);
    expect(env).not.toHaveProperty('GRILLHOUSE_TRAVAILLEURS');
  });

  it('la commande de la séance se place sous nice puis ionice, et garde sa commande entière', () => {
    const commande = ['claude', '-p', '--agent', 'testwriter'];
    const sous = sousNiceEtIonice(commande);
    expect(sous.indexOf('nice')).toBe(0);
    expect(sous.indexOf('ionice')).toBeGreaterThan(sous.indexOf('nice'));
    expect(sous.slice(-commande.length)).toEqual(commande);
  });
});

// grillhouse-9kq critères 5, 6, 18 et 21 — ce que reçoit chaque sorte de séance et chaque passe
// ciblée : GRILLHOUSE_TRAVAILLEURS = max(1, cœurs ÷ places) et un départ sous nice puis ionice ; une
// passe lourde (npm run verifier) ne porte ni l'un ni l'autre.
// Interfaces : enveloppe.mjs `lancementDeLaSeance({ argsBwrap, commande, env, cacheNpm, paquets,
// travail, outils })` -> { cmd: 'bwrap', args, env } (ce que `envelopper` lance) ;
// passe-de-la-machine.mjs `lancementDeLaPasse({ lourde, cmd, args, env })` -> { cmd, args, env }
// (la preuve et les contrôles ciblés, et la séance hors enveloppe du circuit, le relecteur).
describe('grillhouse-9kq critères 5 et 18 — le lancement de chaque séance et de chaque passe', () => {
  const travailleurs = (places: number) => Math.max(1, Math.floor(availableParallelism() / places));
  const SOUS_NICE = ['nice', '-n', '10', 'ionice', '-c', '2', '-n', '7'];
  const base = { PATH: '/bin', HOME: '/h', GRILLHOUSE_PLACES: '3' } as Record<string, string>;

  describe('la séance dans l’enveloppe (lancementDeLaSeance)', () => {
    const lancer = (env: Record<string, string>) =>
      lancementDeLaSeance({
        argsBwrap: ['--die-with-parent'],
        commande: ['claude', '-p', '--agent', 'testwriter'],
        env,
        cacheNpm: '/c',
        paquets: ['p'],
        travail: '/t',
        outils: {},
      });

    it('lance bwrap, la commande de la séance sous nice puis ionice, entière à la fin', () => {
      const l = lancer(base);
      expect(l.cmd).toBe('bwrap');
      expect(l.args.slice(0, 1)).toEqual(['--die-with-parent']);
      const queue = [...SOUS_NICE, 'claude', '-p', '--agent', 'testwriter'];
      expect(l.args.slice(-queue.length)).toEqual(queue);
    });

    it('porte GRILLHOUSE_TRAVAILLEURS = max(1, cœurs ÷ places) du plafond de l’environnement', () => {
      expect(lancer(base).env.GRILLHOUSE_TRAVAILLEURS).toBe(String(travailleurs(3)));
      expect(lancer({ ...base, GRILLHOUSE_PLACES: '5' }).env.GRILLHOUSE_TRAVAILLEURS).toBe(
        String(travailleurs(5))
      );
    });

    it('plus de places que de cœurs : un travailleur au moins', () => {
      expect(lancer({ ...base, GRILLHOUSE_PLACES: '100000' }).env.GRILLHOUSE_TRAVAILLEURS).toBe(
        '1'
      );
    });
  });

  describe('une passe ciblée et la séance hors enveloppe (lancementDeLaPasse, lourde: false)', () => {
    const lancer = (env: Record<string, string>) =>
      lancementDeLaPasse({
        lourde: false,
        cmd: 'npm',
        args: ['test', '--', 'packages/x/tests/a.spec.ts'],
        env,
      });

    it('lance la commande sous nice puis ionice, entière à la fin', () => {
      const l = lancer(base);
      expect(l.cmd).toBe('nice');
      expect(l.args).toEqual([
        ...SOUS_NICE.slice(1),
        'npm',
        'test',
        '--',
        'packages/x/tests/a.spec.ts',
      ]);
    });

    it('porte GRILLHOUSE_TRAVAILLEURS = max(1, cœurs ÷ places) et garde le reste de l’environnement', () => {
      const l = lancer(base);
      expect(l.env.GRILLHOUSE_TRAVAILLEURS).toBe(String(travailleurs(3)));
      expect(l.env.PATH).toBe('/bin');
      expect(lancer({ ...base, GRILLHOUSE_PLACES: '5' }).env.GRILLHOUSE_TRAVAILLEURS).toBe(
        String(travailleurs(5))
      );
    });

    it('une valeur héritée de GRILLHOUSE_TRAVAILLEURS est remplacée par la mesure de la passe', () => {
      const l = lancer({ ...base, GRILLHOUSE_TRAVAILLEURS: '99' });
      expect(l.env.GRILLHOUSE_TRAVAILLEURS).toBe(String(travailleurs(3)));
    });
  });

  describe('une passe lourde (lancementDeLaPasse, lourde: true) garde tous les cœurs', () => {
    const lancer = (env: Record<string, string>) =>
      lancementDeLaPasse({ lourde: true, cmd: 'npm', args: ['run', 'verifier'], env });

    it('lance sa commande telle quelle, sans nice ni ionice', () => {
      const l = lancer(base);
      expect(l.cmd).toBe('npm');
      expect(l.args).toEqual(['run', 'verifier']);
    });

    it('ne porte pas GRILLHOUSE_TRAVAILLEURS, même hérité', () => {
      expect(lancer(base).env).not.toHaveProperty('GRILLHOUSE_TRAVAILLEURS');
      expect(lancer({ ...base, GRILLHOUSE_TRAVAILLEURS: '4' }).env).not.toHaveProperty(
        'GRILLHOUSE_TRAVAILLEURS'
      );
    });
  });
});
