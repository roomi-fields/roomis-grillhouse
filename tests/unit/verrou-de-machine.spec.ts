// grillhouse-3uv.89, L5 — the lock of the machine for the heavy measure
// (scripts/verrou-de-machine.mjs): one heavy measure at a time on the machine, whatever repository
// it plays in, as GNU make's job server shares its slots between the makes of one build. Witness:
// BPScript 320.3, where the final passes of BPScript ran under the `npm run verifier` of the frame,
// on the same machine, for 74 of their 121 min.
//
// Each case plays the module in child processes, each lock in a trial directory named by
// GRILLHOUSE_VERROU_MACHINE (or by the user's cache, XDG_CACHE_HOME or HOME, for the default).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../..');
const MODULE = pathToFileURL(path.join(RACINE, 'scripts/verrou-de-machine.mjs')).href;
const VERIFIER = path.join(RACINE, 'scripts/verifier.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verrou-de-machine-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let n = 0;
const unDossier = () => {
  const d = path.join(ESSAIS, `essai-${++n}`);
  mkdirSync(d, { recursive: true });
  return d;
};
const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));
async function jusqua(condition: () => boolean, ms = 10_000) {
  const fin = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > fin) {
      throw new Error('la condition ne vient pas');
    }
    await attendre(50);
  }
}

// The environment of a child: this one, without Vitest's, the lock at <verrou> when given.
const environnement = (ajouts: Record<string, string | undefined>) => {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('VITEST') && k !== 'NODE_OPTIONS') {
      env[k] = v;
    }
  }
  delete env.GRILLHOUSE_VERROU_MACHINE;
  delete env.GRILLHOUSE_MESURE_TENUE;
  delete env.GRILLHOUSE_ENVELOPPE;
  for (const [k, v] of Object.entries(ajouts)) {
    if (v === undefined) {
      delete env[k];
    } else {
      env[k] = v;
    }
  }
  return env;
};

// A child that takes the lock (`avecLaMachine`), writes « <nom> début » to <trace>, runs <corps>
// (JavaScript, `envEnfant` in scope), then writes « <nom> fin ».
const preneur = (nom: string, trace: string, corps = '') => `
  import { appendFileSync, existsSync } from 'node:fs';
  import { spawnSync } from 'node:child_process';
  import { avecLaMachine } from ${JSON.stringify(MODULE)};
  avecLaMachine(envEnfant => {
    appendFileSync(${JSON.stringify(trace)}, ${JSON.stringify(`${nom} début\n`)});
    ${corps}
    appendFileSync(${JSON.stringify(trace)}, ${JSON.stringify(`${nom} fin\n`)});
  });
`;
const lancer = (code: string, env: Record<string, string>): ChildProcess =>
  spawn(process.execPath, ['--input-type=module', '-e', code], { env, stdio: 'pipe' });
const fin = (p: ChildProcess) =>
  new Promise<{ code: number | null; sortie: string }>(resolve => {
    let sortie = '';
    p.stdout?.on('data', b => (sortie += b));
    p.stderr?.on('data', b => (sortie += b));
    p.on('close', code => resolve({ code, sortie }));
  });
const lignes = (trace: string) =>
  existsSync(trace) ? readFileSync(trace, 'utf8').split('\n').filter(Boolean) : [];
// A holder that keeps the lock until the file <libere> exists.
const tenir = (libere: string) => `
  while (!existsSync(${JSON.stringify(libere)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
`;

describe(
  'grillhouse-3uv.89 — le verrou de la machine pour la mesure lourde',
  { timeout: 60_000 },
  () => {
    it('une seconde mesure attend la fin de la première, et dit qui la tient', async () => {
      const d = unDossier();
      const env = environnement({ GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock') });
      const trace = path.join(d, 'trace');
      const libere = path.join(d, 'libere');
      const premier = lancer(preneur('A', trace, tenir(libere)), env);
      const finPremier = fin(premier);
      await jusqua(() => lignes(trace).includes('A début'));
      const second = lancer(preneur('B', trace), env);
      const finSecond = fin(second);
      await attendre(1_000);
      expect(lignes(trace)).toEqual(['A début']);
      writeFileSync(libere, '');
      const [a, b] = await Promise.all([finPremier, finSecond]);
      expect(a.code, a.sortie).toBe(0);
      expect(b.code, b.sortie).toBe(0);
      expect(lignes(trace)).toEqual(['A début', 'A fin', 'B début', 'B fin']);
      expect(b.sortie).toContain('⏳');
      expect(b.sortie).toContain(String(premier.pid));
      expect(existsSync(path.join(d, 'mesure.lock'))).toBe(false);
    });

    it('un verrou dont le processus est mort se reprend sans attendre', async () => {
      const d = unDossier();
      const verrou = path.join(d, 'mesure.lock');
      const mort = spawnSync(process.execPath, ['-e', '']).pid;
      writeFileSync(verrou, `${mort}:abandonne`);
      const trace = path.join(d, 'trace');
      const debut = Date.now();
      const r = await fin(
        lancer(preneur('B', trace), environnement({ GRILLHOUSE_VERROU_MACHINE: verrou }))
      );
      expect(r.code, r.sortie).toBe(0);
      expect(lignes(trace)).toEqual(['B début', 'B fin']);
      expect(Date.now() - debut).toBeLessThan(5_000);
      expect(existsSync(verrou)).toBe(false);
    });

    it('un enfant de celui qui tient le verrou mesure sous son verrou, sans le reprendre', async () => {
      const d = unDossier();
      const env = environnement({ GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock') });
      const trace = path.join(d, 'trace');
      const enfant = preneur('enfant', trace);
      const corps = `
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(enfant)}], { env: envEnfant, timeout: 10_000 });
      if (r.status !== 0) throw new Error('enfant : ' + r.status + ' ' + r.stderr);
    `;
      const r = await fin(lancer(preneur('parent', trace, corps), env));
      expect(r.code, r.sortie).toBe(0);
      expect(lignes(trace)).toEqual(['parent début', 'enfant début', 'enfant fin', 'parent fin']);
    });

    it('sans GRILLHOUSE_VERROU_MACHINE, le verrou vit dans le cache de l’utilisateur, partagé par tous ses dépôts', async () => {
      const d = unDossier();
      const cache = path.join(d, 'cache');
      const maison = path.join(d, 'maison');
      const trace = path.join(d, 'trace');
      const vu = (f: string) =>
        `appendFileSync(${JSON.stringify(trace)}, (existsSync(${JSON.stringify(f)}) ? 'tenu ' : 'absent ') + ${JSON.stringify(f)} + '\\n');`;
      const avecVu = (f: string) => preneur('x', trace, vu(f));
      const parXdg = path.join(cache, 'grillhouse', 'mesure-lourde.lock');
      const r1 = await fin(lancer(avecVu(parXdg), environnement({ XDG_CACHE_HOME: cache })));
      expect(r1.code, r1.sortie).toBe(0);
      const parMaison = path.join(maison, '.cache', 'grillhouse', 'mesure-lourde.lock');
      const r2 = await fin(
        lancer(avecVu(parMaison), environnement({ XDG_CACHE_HOME: undefined, HOME: maison }))
      );
      expect(r2.code, r2.sortie).toBe(0);
      expect(lignes(trace)).toEqual([
        'x début',
        `tenu ${parXdg}`,
        'x fin',
        'x début',
        `tenu ${parMaison}`,
        'x fin',
      ]);
      expect(existsSync(parXdg)).toBe(false);
      expect(existsSync(parMaison)).toBe(false);
    });

    it('dans l’enveloppe d’un agent, qui a son propre espace de processus, aucun verrou ne se prend', async () => {
      const d = unDossier();
      const verrou = path.join(d, 'mesure.lock');
      // A lock held by a live process: outside the envelope, the measure would wait.
      const dormeur = spawn('sleep', ['30'], { stdio: 'ignore' });
      writeFileSync(verrou, `${dormeur.pid}:vivant`);
      try {
        const trace = path.join(d, 'trace');
        const r = await fin(
          lancer(
            preneur('B', trace),
            environnement({ GRILLHOUSE_VERROU_MACHINE: verrou, GRILLHOUSE_ENVELOPPE: 'packages/a' })
          )
        );
        expect(r.code, r.sortie).toBe(0);
        expect(lignes(trace)).toEqual(['B début', 'B fin']);
        expect(readFileSync(verrou, 'utf8')).toBe(`${dormeur.pid}:vivant`);
      } finally {
        dormeur.kill();
      }
    });

    it('le verrou se lâche quand la mesure échoue', async () => {
      const d = unDossier();
      const verrou = path.join(d, 'mesure.lock');
      const r = await fin(
        lancer(
          preneur('B', path.join(d, 'trace'), "throw new Error('mesure en échec');"),
          environnement({ GRILLHOUSE_VERROU_MACHINE: verrou })
        )
      );
      expect(r.code).not.toBe(0);
      expect(r.sortie).toContain('mesure en échec');
      expect(existsSync(verrou)).toBe(false);
    });
  }
);

// `npm run verifier` takes the lock, and bounds the tasks it plays side by side. A stand-in of
// Turborepo, first on the PATH, writes each of its calls and exits 0.
describe('grillhouse-3uv.89 — npm run verifier et la machine', { timeout: 60_000 }, () => {
  const fauxTurbo = (d: string) => {
    const bin = path.join(d, 'bin');
    mkdirSync(bin, { recursive: true });
    const f = path.join(bin, 'turbo');
    writeFileSync(
      f,
      `#!/bin/sh\necho "turbo $*" >> ${JSON.stringify(path.join(d, 'appels'))}\nexit 0\n`
    );
    chmodSync(f, 0o755);
    writeFileSync(path.join(d, 'package.json'), '{ "name": "essai", "private": true }\n');
    return bin;
  };
  const appels = (d: string) => lignes(path.join(d, 'appels'));

  it('prend le verrou de la machine : tenu par une autre mesure, il attend sa fin avant de jouer', async () => {
    const d = unDossier();
    const bin = fauxTurbo(d);
    const verrou = path.join(d, 'mesure.lock');
    const libere = path.join(d, 'libere');
    const trace = path.join(d, 'trace');
    const env = environnement({
      GRILLHOUSE_VERROU_MACHINE: verrou,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
    });
    const autre = lancer(preneur('autre', trace, tenir(libere)), env);
    const finAutre = fin(autre);
    await jusqua(() => lignes(trace).includes('autre début'));
    const passe = spawn(process.execPath, [VERIFIER], { cwd: d, env, stdio: 'pipe' });
    const finPasse = fin(passe);
    await attendre(1_500);
    expect(appels(d)).toEqual([]);
    writeFileSync(libere, '');
    const [a, v] = await Promise.all([finAutre, finPasse]);
    expect(a.code, a.sortie).toBe(0);
    expect(v.code, v.sortie).toBe(0);
    expect(v.sortie).toContain('⏳');
    expect(appels(d)).toHaveLength(1);
  });

  it('borne ses tâches côte à côte par le nombre de cœurs de la machine', async () => {
    const d = unDossier();
    const bin = fauxTurbo(d);
    const env = environnement({
      GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock'),
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
    });
    const v = await fin(spawn(process.execPath, [VERIFIER], { cwd: d, env, stdio: 'pipe' }));
    expect(v.code, v.sortie).toBe(0);
    const attendu = Math.max(1, Math.floor(availableParallelism() / 2));
    expect(appels(d)[0]).toContain(`--concurrency=${attendu}`);
    const g = await fin(
      spawn(process.execPath, [VERIFIER, '--concurrency=1'], { cwd: d, env, stdio: 'pipe' })
    );
    expect(g.code, g.sortie).toBe(0);
    expect(appels(d)[1].match(/--concurrency=\S*/g)).toEqual(['--concurrency=1']);
  });
});
