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

const RACINE = path.resolve(__dirname, '../../../..');
const MODULE = pathToFileURL(
  path.join(RACINE, 'packages/grillhouse/scripts/verrou-de-machine.mjs')
).href;
const VERIFIER = path.join(RACINE, 'packages/grillhouse/scripts/langages/typescript/verifier.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verrou-de-machine-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let n = 0;
const unDossier = () => {
  const d = path.join(ESSAIS, `essai-${++n}`);
  mkdirSync(d, { recursive: true });
  return d;
};
const attendre = (ms: number) => new Promise(r => setTimeout(r, ms));
// Waits for <condition>, up to <ms>: a child started under the load of a full pass can take a while to begin.
async function jusqua(condition: () => boolean, nom = 'la condition', ms = 60_000) {
  const fin = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > fin) {
      throw new Error(`${nom} ne vient pas`);
    }
    await attendre(50);
  }
}
// Waits for <promesse>, up to <ms>, and fails naming <nom> when it does not come.
async function avant<T>(promesse: Promise<T>, nom: string, ms: number): Promise<T> {
  let minuteur: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promesse,
      new Promise<never>((_, rejette) => {
        minuteur = setTimeout(() => rejette(new Error(`${nom} ne vient pas`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(minuteur);
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

// A child that takes the lock (`avecLaMachine`, its options <options>, JavaScript), writes
// « <nom> début » to <trace>, runs <corps> (JavaScript, `envEnfant` in scope), then writes
// « <nom> fin ». A wait that stops (an error named `AttenteDeLaMachine`) writes its message and
// exits with its code.
const preneur = (nom: string, trace: string, corps = '', options = '{}') => `
  import { appendFileSync, existsSync } from 'node:fs';
  import { spawnSync } from 'node:child_process';
  import { avecLaMachine } from ${JSON.stringify(MODULE)};
  try {
    avecLaMachine(envEnfant => {
      appendFileSync(${JSON.stringify(trace)}, ${JSON.stringify(`${nom} début\n`)});
      ${corps}
      appendFileSync(${JSON.stringify(trace)}, ${JSON.stringify(`${nom} fin\n`)});
    }, ${options});
  } catch (e) {
    if (e?.name !== 'AttenteDeLaMachine') throw e;
    console.log(e.message);
    process.exitCode = e.code;
  }
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

    // Romain, 2026-10-21: a full pass hung 40 min, the machine at rest, a test's nested verifier
    // waiting for the lock the pass that played it held. As `flock -w` and a database's lock
    // timeout, the wait is bounded, and it names who holds the lock.
    it('au-delà de sa borne, l’attente s’arrête à 75 et nomme le détenteur : processus, dossier, commande, depuis quand', async () => {
      const d = unDossier();
      const verrou = path.join(d, 'mesure.lock');
      const trace = path.join(d, 'trace');
      const libere = path.join(d, 'libere');
      // The holder's command names its script by a relative name, as `node scripts/langages/typescript/verifier.mjs`
      // does, the working directory being said apart: the command carries no long path, whatever $TMPDIR is.
      writeFileSync(path.join(d, 'marque-du-detenteur.mjs'), preneur('A', trace, tenir(libere)));
      const detenteur = spawn(process.execPath, ['marque-du-detenteur.mjs'], {
        env: environnement({ GRILLHOUSE_VERROU_MACHINE: verrou }),
        cwd: d,
        stdio: 'pipe',
      });
      const finDetenteur = fin(detenteur);
      try {
        await jusqua(() => lignes(trace).includes('A début'));
        const marque = readFileSync(verrou, 'utf8');
        const debut = Date.now();
        const b = await fin(
          lancer(
            preneur('B', trace),
            environnement({
              GRILLHOUSE_VERROU_MACHINE: verrou,
              GRILLHOUSE_ATTENTE_MACHINE_MS: '1500',
            })
          )
        );
        expect(b.code, b.sortie).toBe(75);
        expect(Date.now() - debut).toBeGreaterThanOrEqual(1_500);
        expect(Date.now() - debut).toBeLessThan(10_000);
        expect(lignes(trace)).toEqual(['A début']);
        expect(b.sortie).toContain(String(detenteur.pid));
        expect(b.sortie).toContain(d);
        expect(b.sortie).toContain('marque-du-detenteur.mjs');
        expect(b.sortie).toContain(`(dans ${d})`);
        expect(b.sortie).toMatch(/depuis \d\d:\d\d:\d\d/);
        expect(b.sortie).toContain('GRILLHOUSE_ATTENTE_MACHINE_MS');
        expect(readFileSync(verrou, 'utf8')).toBe(marque);
      } finally {
        writeFileSync(libere, '');
        await finDetenteur;
      }
    });

    it('sans borne dite, l’attente dure jusqu’à 60 min, plus longue que la plus longue passe complète mesurée', async () => {
      const { ATTENTE_MACHINE_MS } = (await import(MODULE)) as { ATTENTE_MACHINE_MS: number };
      expect(ATTENTE_MACHINE_MS).toBe(60 * 60_000);
    });

    it('l’attente dit à intervalle régulier qu’elle attend, depuis combien de temps et qui', async () => {
      const d = unDossier();
      const verrou = path.join(d, 'mesure.lock');
      const trace = path.join(d, 'trace');
      const libere = path.join(d, 'libere');
      const env = environnement({ GRILLHOUSE_VERROU_MACHINE: verrou });
      const detenteur = lancer(preneur('A', trace, tenir(libere)), env);
      const finDetenteur = fin(detenteur);
      try {
        await jusqua(() => lignes(trace).includes('A début'));
        // A fake clock that moves 10 min at each sleep, in this process: a real sleep or the wall
        // clock could not tell 60 min in a test's time, so a wait that ignores them never ends here.
        const { avecLaMachine } = (await import(MODULE)) as {
          avecLaMachine: (corps: () => void, o: Record<string, unknown>) => void;
        };
        let t = 0;
        let dormis = 0;
        const dites: string[] = [];
        let erreur: { code?: number } | undefined;
        try {
          avecLaMachine(() => {}, {
            env,
            racine: d,
            libre: () => Number.MAX_SAFE_INTEGER,
            occupe: () => '',
            dire: (l: string) => dites.push(l),
            borneMs: 60 * 60_000,
            rappelMs: 10 * 60_000,
            maintenant: () => t,
            dormir: () => {
              dormis += 1;
              t += 10 * 60_000;
            },
          });
        } catch (e) {
          erreur = e as { code?: number };
        }
        expect(erreur?.code, dites.join('\n')).toBe(75);
        expect(dormis).toBe(6);
        const attentes = dites.filter(l => l.startsWith('⏳'));
        expect(attentes.length, dites.join('\n')).toBe(6);
        for (const l of attentes) {
          expect(l).toContain(String(detenteur.pid));
        }
        expect(attentes.at(-1)).toContain('depuis 50 min');
      } finally {
        writeFileSync(libere, '');
        await finDetenteur;
      }
    });

    it('l’attente d’une place nommée dit sa durée sur l’horloge et le sommeil qu’on lui donne', async () => {
      const d = unDossier();
      const { attendreDeLaPlace } = (await import(MODULE)) as {
        attendreDeLaPlace: (o: Record<string, unknown>) => void;
      };
      let t = 0;
      const dites: string[] = [];
      let erreur: { code?: number; message?: string } | undefined;
      try {
        attendreDeLaPlace({
          env: environnement({
            GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock'),
            GRILLHOUSE_TEMPORAIRE_LIBRE: undefined,
          }),
          libre: () => 0,
          occupe: () => 'rien',
          dire: (l: string) => dites.push(l),
          borneMs: 60 * 60_000,
          rappelMs: 10 * 60_000,
          maintenant: () => t,
          dormir: () => {
            t += 10 * 60_000;
          },
        });
      } catch (e) {
        erreur = e as { code?: number; message?: string };
      }
      expect(erreur?.code).toBe(75);
      const attentes = dites.filter(l => l.startsWith('⏳'));
      expect(attentes.length, dites.join('\n')).toBe(6);
      expect(attentes.at(-1)).toContain('attente de place depuis 50 min');
    });

    // The case of the 40 min: a measure that waits for a lock its own ancestor holds would wait for
    // ever, each waiting for the other. It says so at once and stops, red.
    it('un verrou tenu par un ancêtre (ici le parent du parent) se dit tout de suite, et la mesure s’arrête rouge', async () => {
      const d = unDossier();
      const verrou = path.join(d, 'mesure.lock');
      const trace = path.join(d, 'trace');
      const enfant = preneur('enfant', trace);
      // The child's environment loses the mark of the taking, as a test's own environment does.
      const corps = `
      const env = { ...envEnfant };
      delete env.GRILLHOUSE_MESURE_TENUE;
      const debut = Date.now();
      const r = spawnSync('sh', ['-c', '"$0" --input-type=module -e "$1"; exit $?', process.execPath, ${JSON.stringify(enfant)}], { env, timeout: 20_000, encoding: 'utf8' });
      appendFileSync(${JSON.stringify(trace)}, 'enfant code ' + r.status + ' en ' + (Date.now() - debut) + ' ms\\n' + r.stdout);
    `;
      const parent = lancer(
        preneur('parent', trace, corps),
        environnement({ GRILLHOUSE_VERROU_MACHINE: verrou })
      );
      const r = await fin(parent);
      expect(r.code, r.sortie).toBe(0);
      const t = lignes(trace);
      expect(t[0]).toBe('parent début');
      expect(t).not.toContain('enfant début');
      const [, ms] = /^enfant code 1 en (\d+) ms$/.exec(t[1]) ?? [];
      expect(ms, t.join('\n')).toBeDefined();
      expect(Number(ms)).toBeLessThan(5_000);
      const message = t.slice(2).join('\n');
      expect(message).toContain(String(parent.pid));
      expect(message).toContain('ancêtre');
      expect(t.at(-1)).toBe('parent fin');
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

  it('au-delà de la borne de l’attente, la passe rend 75 sans jouer et nomme qui tient le verrou', async () => {
    const d = unDossier();
    const bin = fauxTurbo(d);
    const verrou = path.join(d, 'mesure.lock');
    const libere = path.join(d, 'libere');
    const trace = path.join(d, 'trace');
    const env = environnement({
      GRILLHOUSE_VERROU_MACHINE: verrou,
      GRILLHOUSE_ATTENTE_MACHINE_MS: '1000',
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
    });
    const autre = lancer(preneur('autre', trace, tenir(libere)), env);
    const finAutre = fin(autre);
    try {
      await jusqua(() => lignes(trace).includes('autre début'));
      const v = await fin(spawn(process.execPath, [VERIFIER], { cwd: d, env, stdio: 'pipe' }));
      expect(v.code, v.sortie).toBe(75);
      expect(v.sortie).toContain(String(autre.pid));
      expect(appels(d)).toEqual([]);
    } finally {
      writeFileSync(libere, '');
      await finAutre;
    }
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

// grillhouse-3uv.95.2 — the rank of a measure. BPScript 320.9: 208 min of its circuit's wait for
// the lock of the machine went to the checks of the frame's agent copies. As the job server of GNU
// make and Bazel's `--experimental_local_test_priority`: a measure played in the frame's own
// repository (the package @roomi-fields/grillhouse in development, its agent copies included) is
// of the second rank, a project's is of the first, and a measure of the second rank waits while
// one of the first waits too.
describe('grillhouse-3uv.95.2 — le rang d’une mesure', { timeout: 60_000 }, () => {
  // The repository of the frame in <d>: its root's workspaces hold the package in development.
  const depotDuCadre = (d: string) => {
    mkdirSync(path.join(d, 'packages/grillhouse'), { recursive: true });
    writeFileSync(
      path.join(d, 'package.json'),
      JSON.stringify({ name: 'roomis-grillhouse', private: true, workspaces: ['packages/*'] })
    );
    writeFileSync(
      path.join(d, 'packages/grillhouse/package.json'),
      JSON.stringify({ name: '@roomi-fields/grillhouse', version: '0.0.0' })
    );
    return d;
  };
  // A project in <d>: its own packages, the frame installed under node_modules.
  const unProjet = (d: string) => {
    mkdirSync(path.join(d, 'packages/a'), { recursive: true });
    mkdirSync(path.join(d, 'node_modules/@roomi-fields/grillhouse'), { recursive: true });
    writeFileSync(
      path.join(d, 'package.json'),
      JSON.stringify({
        name: 'projet',
        private: true,
        workspaces: ['packages/*'],
        devDependencies: { '@roomi-fields/grillhouse': '0.24.0' },
      })
    );
    writeFileSync(path.join(d, 'packages/a/package.json'), JSON.stringify({ name: 'a' }));
    writeFileSync(
      path.join(d, 'node_modules/@roomi-fields/grillhouse/package.json'),
      JSON.stringify({ name: '@roomi-fields/grillhouse', version: '0.24.0' })
    );
    return d;
  };
  // A child that takes the lock from <cwd>, its output read as it comes.
  const lancerDans = (code: string, env: Record<string, string>, cwd: string) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', code], {
      env,
      cwd,
      stdio: 'pipe',
    });
    let sortie = '';
    p.stdout?.on('data', b => (sortie += b));
    p.stderr?.on('data', b => (sortie += b));
    return { p, fini: fin(p), sortie: () => sortie };
  };

  it('une mesure du dépôt du cadre, ou d’une de ses copies d’agents, est de premier rang ; celle d’un projet, de second rang', async () => {
    const { rangDeLaMesure } = (await import(MODULE)) as {
      rangDeLaMesure: (racine: string) => number;
    };
    const d = unDossier();
    const cadre = depotDuCadre(path.join(d, 'cadre'));
    const copie = depotDuCadre(path.join(cadre, '.claude/worktrees/agent-x'));
    const projet = unProjet(path.join(d, 'projet'));
    expect(rangDeLaMesure(RACINE)).toBe(1);
    expect(rangDeLaMesure(cadre)).toBe(1);
    expect(rangDeLaMesure(copie)).toBe(1);
    expect(rangDeLaMesure(projet)).toBe(2);
    expect(rangDeLaMesure(unDossier())).toBe(2);
  });

  it('une mesure de premier rang qui attend passe avant les mesures de second rang qui attendent', async () => {
    const d = unDossier();
    const cadre = depotDuCadre(path.join(d, 'cadre'));
    const projet = unProjet(path.join(d, 'projet'));
    const env = environnement({ GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock') });
    const trace = path.join(d, 'trace');
    const libere = path.join(d, 'libere');
    const a = lancerDans(preneur('A', trace, tenir(libere)), env, cadre);
    await jusqua(() => lignes(trace).includes('A début'));
    // Three measures of the second rank wait first, then one of the first rank.
    const seconds = ['S1', 'S2', 'S3'].map(nom => lancerDans(preneur(nom, trace), env, projet));
    await jusqua(() => seconds.every(s => s.sortie().includes('⏳')));
    const premier = lancerDans(preneur('P', trace), env, cadre);
    await jusqua(() => premier.sortie().includes('⏳'));
    writeFileSync(libere, '');
    const fins = await Promise.all([a.fini, premier.fini, ...seconds.map(s => s.fini)]);
    for (const f of fins) {
      expect(f.code, f.sortie).toBe(0);
    }
    expect(lignes(trace).slice(0, 4)).toEqual(['A début', 'A fin', 'P début', 'P fin']);
    expect(lignes(trace)).toHaveLength(10);
  });

  it('une mesure de second rang ne prend pas le verrou libre tant qu’une mesure de premier rang attend, et dit qui elle attend', async () => {
    const d = unDossier();
    const cadre = depotDuCadre(path.join(d, 'cadre'));
    const projet = unProjet(path.join(d, 'projet'));
    const env = environnement({ GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock') });
    const trace = path.join(d, 'trace');
    const libereA = path.join(d, 'libere-a');
    const libereP = path.join(d, 'libere-p');
    const a = lancerDans(preneur('A', trace, tenir(libereA)), env, cadre);
    await jusqua(() => lignes(trace).includes('A début'));
    const premier = lancerDans(preneur('P', trace, tenir(libereP)), env, cadre);
    await jusqua(() => premier.sortie().includes('⏳'));
    expect(premier.sortie()).toContain('mesure du cadre');
    const second = lancerDans(preneur('S', trace), env, projet);
    await jusqua(() => second.sortie().includes('⏳'));
    expect(second.sortie()).toContain("mesure d'un projet");
    expect(second.sortie()).toContain("une mesure du cadre attend aussi et passe d'abord");
    expect(second.sortie()).toContain(String(a.p.pid));
    expect(second.sortie()).toContain(String(premier.p.pid));
    writeFileSync(libereA, '');
    await jusqua(() => lignes(trace).includes('P début'));
    writeFileSync(libereP, '');
    const fins = await Promise.all([a.fini, premier.fini, second.fini]);
    for (const f of fins) {
      expect(f.code, f.sortie).toBe(0);
    }
    expect(lignes(trace)).toEqual(['A début', 'A fin', 'P début', 'P fin', 'S début', 'S fin']);
  });

  it('une mesure de second rang seule prend le verrou libre sans attendre', async () => {
    const d = unDossier();
    const projet = unProjet(path.join(d, 'projet'));
    const env = environnement({ GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock') });
    const trace = path.join(d, 'trace');
    const r = await lancerDans(preneur('S', trace), env, projet).fini;
    expect(r.code, r.sortie).toBe(0);
    expect(r.sortie).not.toContain('⏳');
    expect(lignes(trace)).toEqual(['S début', 'S fin']);
  });

  it('une mesure de premier rang tuée pendant son attente ne retient pas celles de second rang', async () => {
    const d = unDossier();
    const cadre = depotDuCadre(path.join(d, 'cadre'));
    const projet = unProjet(path.join(d, 'projet'));
    const env = environnement({ GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock') });
    const trace = path.join(d, 'trace');
    const libere = path.join(d, 'libere');
    const a = lancerDans(preneur('A', trace, tenir(libere)), env, cadre);
    await jusqua(() => lignes(trace).includes('A début'));
    const premier = lancerDans(preneur('P', trace), env, cadre);
    await jusqua(() => premier.sortie().includes('⏳'));
    premier.p.kill('SIGKILL');
    await premier.fini;
    const second = lancerDans(preneur('S', trace), env, projet);
    await jusqua(() => second.sortie().includes('⏳'));
    writeFileSync(libere, '');
    const debut = Date.now();
    const r = await second.fini;
    expect(r.code, r.sortie).toBe(0);
    expect(Date.now() - debut).toBeLessThan(5_000);
    expect(lignes(trace)).toEqual(['A début', 'A fin', 'S début', 'S fin']);
    expect((await a.fini).code).toBe(0);
  });

  it('une mesure de premier rang lancée avant que le détenteur ne tienne le verrou le prend, sans attendre', async () => {
    const d = unDossier();
    const cadre = depotDuCadre(path.join(d, 'cadre'));
    const env = environnement({ GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock') });
    const trace = path.join(d, 'trace');
    const libere = path.join(d, 'libere');
    const premier = lancerDans(preneur('P', trace), env, cadre);
    const fP = await avant(premier.fini, 'fin de P', 20_000);
    expect(fP.code, fP.sortie).toBe(0);
    expect(premier.sortie()).not.toContain('⏳');
    const a = lancerDans(preneur('A', trace, tenir(libere)), env, cadre);
    await jusqua(() => lignes(trace).includes('A début'), 'A début', 20_000);
    writeFileSync(libere, '');
    expect((await avant(a.fini, 'fin de A', 20_000)).code).toBe(0);
    expect(lignes(trace)).toEqual(['P début', 'P fin', 'A début', 'A fin']);
  });

  it('la borne de l’attente reste la même pour une mesure de second rang : à 75, le détenteur nommé', async () => {
    const d = unDossier();
    const cadre = depotDuCadre(path.join(d, 'cadre'));
    const projet = unProjet(path.join(d, 'projet'));
    const env = environnement({ GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock') });
    const trace = path.join(d, 'trace');
    const libere = path.join(d, 'libere');
    const a = lancerDans(preneur('A', trace, tenir(libere)), env, cadre);
    let premier: ReturnType<typeof lancerDans> | undefined;
    try {
      await jusqua(() => lignes(trace).includes('A début'), 'A début', 20_000);
      const p = lancerDans(preneur('P', trace), env, cadre);
      premier = p;
      await jusqua(() => p.sortie().includes('⏳'), '⏳ de P', 20_000);
      const debut = Date.now();
      const s = await avant(
        lancerDans(preneur('S', trace), { ...env, GRILLHOUSE_ATTENTE_MACHINE_MS: '1500' }, projet)
          .fini,
        'sortie de S',
        20_000
      );
      expect(s.code, s.sortie).toBe(75);
      expect(Date.now() - debut).toBeGreaterThanOrEqual(1_500);
      expect(Date.now() - debut).toBeLessThan(10_000);
      expect(s.sortie).toContain('GRILLHOUSE_ATTENTE_MACHINE_MS');
      expect(s.sortie).toContain(String(a.p.pid));
      expect(lignes(trace)).toEqual(['A début']);
    } finally {
      writeFileSync(libere, '');
      await avant(
        Promise.all(premier ? [a.fini, premier.fini] : [a.fini]),
        'fin de A et P',
        20_000
      );
    }
  });
});

// grillhouse-wui — the lock of the machine names its holder and its waits, as lslocks names who
// holds a lock and cargo's « Blocking waiting for file lock » says what a wait waits for: the
// holder, whatever it is (a pass out of a ticket, the circuit of a ticket, of any project of the
// machine), beside the lock (projet, ticket, sorte, since when); each wait for the lock or for
// room under /tmp, one per process, gone with it. Witness: Romain, 2026-11-01 at 17 h, the
// verification of Grillhouse waiting behind the circuit of BPScript 320.11, which the board did
// not show (scripts/tableau.mjs reads them: tests/unit/tableau-verrou.spec.ts).
describe(
  'grillhouse-wui — le verrou nomme son détenteur et ses attentes',
  { timeout: 60_000 },
  () => {
    interface Lu {
      detenteur: Record<string, unknown> | null;
      attentes: Record<string, unknown>[];
    }
    const lireLeVerrou = async (env: Record<string, string>) =>
      (
        (await import(MODULE)) as { lireLeVerrou: (env: Record<string, string>) => Lu }
      ).lireLeVerrou(env);
    // A child from <cwd>, its output read as it comes.
    const lancerDans = (code: string, env: Record<string, string>, cwd: string) => {
      const p = spawn(process.execPath, ['--input-type=module', '-e', code], {
        env,
        cwd,
        stdio: 'pipe',
      });
      let sortie = '';
      p.stdout?.on('data', b => (sortie += b));
      p.stderr?.on('data', b => (sortie += b));
      return { p, fini: fin(p), sortie: () => sortie };
    };

    it('critères 1 et 2 : le détenteur nomme son projet, son ticket, sa sorte ; une mesure qui attend s’inscrit ; tout part avec eux', async () => {
      const d = unDossier();
      const projet = path.join(d, 'BPScript');
      const cadre = path.join(d, 'roomis-grillhouse');
      mkdirSync(projet);
      mkdirSync(cadre);
      const verrou = path.join(d, 'mesure.lock');
      const env = environnement({ GRILLHOUSE_VERROU_MACHINE: verrou });
      const trace = path.join(d, 'trace');
      const libere = path.join(d, 'libere');
      const avant = Date.now();
      const a = lancerDans(
        preneur('A', trace, tenir(libere), "{ ticket: 'bp-mono-vbwf.320.11', sorte: 'Contrôles' }"),
        env,
        projet
      );
      await jusqua(() => lignes(trace).includes('A début'));
      const tenu = await lireLeVerrou(env);
      expect(tenu.detenteur).toMatchObject({
        depot: projet,
        projet: 'BPScript',
        ticket: 'bp-mono-vbwf.320.11',
        sorte: 'Contrôles',
        pid: a.p.pid,
      });
      expect(tenu.detenteur?.depuis).toBeGreaterThanOrEqual(avant - 1_000);
      expect(tenu.attentes).toEqual([]);
      const b = lancerDans(preneur('B', trace), env, cadre);
      await jusqua(() => b.sortie().includes('⏳'));
      const attendu = await lireLeVerrou(env);
      expect(attendu.detenteur).toMatchObject({ pid: a.p.pid });
      expect(attendu.attentes).toEqual([
        expect.objectContaining({
          depot: cadre,
          projet: 'roomis-grillhouse',
          ticket: null,
          sorte: 'Vérification',
          quoi: 'verrou',
          pid: b.p.pid,
        }),
      ]);
      writeFileSync(libere, '');
      const fins = await Promise.all([a.fini, b.fini]);
      for (const f of fins) {
        expect(f.code, f.sortie).toBe(0);
      }
      expect(await lireLeVerrou(env)).toEqual({ detenteur: null, attentes: [] });
    });

    it('critère 2 : une passe qui attend la place sous /tmp s’inscrit ; critère 3 : tuée, sa ligne disparaît', async () => {
      const d = unDossier();
      const env = environnement({
        GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock'),
        GRILLHOUSE_TEMPORAIRE_LIBRE: undefined,
      });
      const code = `
      import { attendreDeLaPlace } from ${JSON.stringify(MODULE)};
      attendreDeLaPlace({ libre: () => 0, occupe: () => 'rien', borneMs: 600000, ticket: 'demo-12', sorte: 'Preuve du rouge' });
    `;
      const p = lancerDans(code, env, d);
      await jusqua(() => p.sortie().includes('⏳'));
      expect((await lireLeVerrou(env)).attentes).toEqual([
        expect.objectContaining({
          projet: path.basename(d),
          ticket: 'demo-12',
          sorte: 'Preuve du rouge',
          quoi: 'place',
          pid: p.p.pid,
        }),
      ]);
      p.p.kill('SIGKILL');
      await p.fini;
      expect(await lireLeVerrou(env)).toEqual({ detenteur: null, attentes: [] });
    });

    it('critère 3 : un détenteur mort ne s’affiche pas', async () => {
      const d = unDossier();
      const env = environnement({ GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock') });
      const trace = path.join(d, 'trace');
      const a = lancerDans(preneur('A', trace, tenir(path.join(d, 'jamais'))), env, d);
      await jusqua(() => lignes(trace).includes('A début'));
      expect((await lireLeVerrou(env)).detenteur).toMatchObject({ pid: a.p.pid });
      a.p.kill('SIGKILL');
      await a.fini;
      expect(existsSync(path.join(d, 'mesure.lock'))).toBe(true);
      expect((await lireLeVerrou(env)).detenteur).toBeNull();
    });

    it('critère 1 : un verrou tenu par un processus vivant qui ne se nomme pas (un cadre plus ancien) se montre, sorte « Verrou »', async () => {
      const d = unDossier();
      const verrou = path.join(d, 'mesure.lock');
      writeFileSync(verrou, `${process.pid}:ancien`);
      const lu = await lireLeVerrou(environnement({ GRILLHOUSE_VERROU_MACHINE: verrou }));
      expect(lu.detenteur).toMatchObject({ sorte: 'Verrou', ticket: null, pid: process.pid });
      expect(String(lu.detenteur?.projet)).not.toBe('');
    });
  }
);

// grillhouse-6ay — la phase et le ticket d'une vérification passent de son appelant au verrou par
// l'environnement (GRILLHOUSE_VERIFICATION_SORTE, GRILLHOUSE_VERIFICATION_TICKET), comme
// GRILLHOUSE_MESURE_TENUE passe la marque du verrou ; ils ne passent qu'à la prise du verrou.
describe(
  'grillhouse-6ay — l’identité d’une vérification vient de son appelant',
  { timeout: 60_000 },
  () => {
    const SORTE = 'GRILLHOUSE_VERIFICATION_SORTE';
    const TICKET = 'GRILLHOUSE_VERIFICATION_TICKET';
    interface Lu {
      detenteur: Record<string, unknown> | null;
      attentes: Record<string, unknown>[];
    }
    const lireLeVerrou = async (env: Record<string, string>) =>
      (
        (await import(MODULE)) as { lireLeVerrou: (env: Record<string, string>) => Lu }
      ).lireLeVerrou(env);
    // What the holder was inscribed as, and what its measure received: a child takes the lock
    // with <options> under <ajouts>, writes the variables of its measure's environment to a file,
    // holds the lock while <lire> reads it, then lets go.
    async function inscription(ajouts: Record<string, string | undefined>, options = '{}') {
      const d = unDossier();
      const env = environnement({
        GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock'),
        ...ajouts,
      });
      const trace = path.join(d, 'trace');
      const libere = path.join(d, 'libere');
      const enfant = path.join(d, 'enfant.json');
      const corps = `
        appendFileSync(${JSON.stringify(enfant)}, JSON.stringify({
          sorte: envEnfant.${SORTE} ?? null,
          ticket: envEnfant.${TICKET} ?? null,
          tenue: Boolean(envEnfant.GRILLHOUSE_MESURE_TENUE),
        }));
        ${tenir(libere)}
      `;
      const p = lancer(preneur('A', trace, corps, options), env);
      const fini = fin(p);
      try {
        await jusqua(() => lignes(trace).includes('A début'));
        const { detenteur } = await lireLeVerrou(env);
        return {
          detenteur,
          enfant: JSON.parse(readFileSync(enfant, 'utf8')) as {
            sorte: string | null;
            ticket: string | null;
            tenue: boolean;
          },
        };
      } finally {
        writeFileSync(libere, '');
        await fini;
      }
    }

    it('critère 7 : l’identité lit la sorte et le ticket de l’environnement', async () => {
      const lu = await inscription({ [SORTE]: 'Intégration', [TICKET]: 'SH-ae6.5' });
      expect(lu.detenteur).toMatchObject({ sorte: 'Intégration', ticket: 'SH-ae6.5' });
    });

    it('critère 7 : la sorte seule (la nuit) s’inscrit sans ticket', async () => {
      const lu = await inscription({ [SORTE]: 'Nuit' });
      expect(lu.detenteur).toMatchObject({ sorte: 'Nuit', ticket: null });
    });

    it('critère 7 : une sorte libre est inscrite telle quelle', async () => {
      const lu = await inscription({ [SORTE]: 'Banc du matin', [TICKET]: 'demo-3' });
      expect(lu.detenteur).toMatchObject({ sorte: 'Banc du matin', ticket: 'demo-3' });
    });

    it('critère 7 : une option explicite de l’appelant l’emporte sur l’environnement', async () => {
      const lu = await inscription(
        { [SORTE]: 'Intégration', [TICKET]: 'SH-ae6.5' },
        "{ ticket: 'demo-12', sorte: 'Preuve du rouge' }"
      );
      expect(lu.detenteur).toMatchObject({ sorte: 'Preuve du rouge', ticket: 'demo-12' });
    });

    it('critères 3 et 7 : sans variable, la sorte vaut « Vérification » et le ticket null', async () => {
      const lu = await inscription({ [SORTE]: undefined, [TICKET]: undefined });
      expect(lu.detenteur).toMatchObject({ sorte: 'Vérification', ticket: null });
    });

    it('critère 7 : des variables vides valent des variables absentes', async () => {
      const lu = await inscription({ [SORTE]: '', [TICKET]: '' });
      expect(lu.detenteur).toMatchObject({ sorte: 'Vérification', ticket: null });
    });

    it('critère 8 : la mesure du détenteur reçoit la marque, sans les deux variables', async () => {
      const lu = await inscription({ [SORTE]: 'File', [TICKET]: 'SH-ae6.5' });
      expect(lu.enfant).toEqual({ sorte: null, ticket: null, tenue: true });
    });

    it('critère 10 : l’attente de la place porte le même nom que le détenteur', async () => {
      const d = unDossier();
      const env = environnement({
        GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock'),
        GRILLHOUSE_TEMPORAIRE_LIBRE: undefined,
        [SORTE]: 'File',
        [TICKET]: 'SH-ae6.5',
      });
      const code = `
        import { attendreDeLaPlace } from ${JSON.stringify(MODULE)};
        attendreDeLaPlace({ libre: () => 0, occupe: () => 'rien', borneMs: 600000 });
      `;
      const p = spawn(process.execPath, ['--input-type=module', '-e', code], {
        env,
        cwd: d,
        stdio: 'pipe',
      });
      let sortie = '';
      p.stdout?.on('data', b => (sortie += b));
      const fini = fin(p);
      try {
        await jusqua(() => sortie.includes('⏳'));
        expect((await lireLeVerrou(env)).attentes).toEqual([
          expect.objectContaining({ quoi: 'place', sorte: 'File', ticket: 'SH-ae6.5' }),
        ]);
      } finally {
        p.kill('SIGKILL');
        await fini;
      }
    });

    // The verification of a language module, played in a trial project: its guards script writes
    // what the lock says of its holder and the variables it received.
    const GARDE = `
      import { readFileSync, writeFileSync } from 'node:fs';
      const lock = process.env.GRILLHOUSE_VERROU_MACHINE;
      writeFileSync('lu.json', JSON.stringify({
        detenteur: JSON.parse(readFileSync(lock + '.detenteur.json', 'utf8')),
        sorte: process.env.${SORTE} ?? null,
        ticket: process.env.${TICKET} ?? null,
      }));
    `;
    const projetDEssai = (d: string) => {
      writeFileSync(path.join(d, 'garde.mjs'), GARDE);
      writeFileSync(
        path.join(d, 'package.json'),
        JSON.stringify({
          name: 'essai',
          private: true,
          scripts: { gardes: 'node garde.mjs' },
        })
      );
      const bin = path.join(d, 'bin');
      mkdirSync(bin, { recursive: true });
      writeFileSync(path.join(bin, 'sccache'), '#!/bin/sh\nexit 0\n');
      chmodSync(path.join(bin, 'sccache'), 0o755);
      return bin;
    };
    const lu = (d: string) =>
      JSON.parse(readFileSync(path.join(d, 'lu.json'), 'utf8')) as {
        detenteur: Record<string, unknown>;
        sorte: string | null;
        ticket: string | null;
      };

    // The Cargo module needs a trial repository (a Cargo.lock that git tracks): its case is a night
    // test, verrou-de-machine-cargo.nuit.test.ts.
    for (const langage of ['python'] as const) {
      const module = pathToFileURL(
        path.join(RACINE, `packages/grillhouse/scripts/langages/${langage}/commandes.mjs`)
      ).href;
      const jouer = async (d: string, ajouts: Record<string, string | undefined>) => {
        const bin = projetDEssai(d);
        // The home of the trial: the Cargo module writes its caches under ~/.cache/grillhouse.
        const maison = path.join(d, 'maison');
        mkdirSync(path.join(maison, '.cache', 'grillhouse'), { recursive: true });
        const env = environnement({
          HOME: maison,
          GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock'),
          PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
          ...ajouts,
        });
        const { lancer: jouerLaCommande } = (await import(module)) as {
          lancer: (
            nom: string,
            args: string[],
            o: { racine: string; env: Record<string, string> }
          ) => number;
        };
        return jouerLaCommande('verifier', ['--gardes'], { racine: d, env });
      };

      it(`critère 5 (${langage}) : la vérification s’inscrit avec l’identité de l’environnement, que sa mesure ne reçoit pas`, async () => {
        const d = unDossier();
        const code = await jouer(d, { [SORTE]: 'Intégration', [TICKET]: 'SH-ae6.5' });
        expect(code).toBe(0);
        expect(lu(d)).toMatchObject({
          detenteur: { sorte: 'Intégration', ticket: 'SH-ae6.5' },
          sorte: null,
          ticket: null,
        });
      });

      it(`critères 3 et 5 (${langage}) : lancée à la main, elle s’inscrit « Vérification », sans ticket`, async () => {
        const d = unDossier();
        const code = await jouer(d, { [SORTE]: undefined, [TICKET]: undefined });
        expect(code).toBe(0);
        expect(lu(d).detenteur).toMatchObject({ sorte: 'Vérification', ticket: null });
      });
    }

    describe('critères 3, 5 et 8 : npm run verifier du module TypeScript', () => {
      // A Turborepo that writes what the lock says of its holder and the variables it received.
      const turboEspion = (d: string) => {
        const bin = path.join(d, 'bin');
        mkdirSync(bin, { recursive: true });
        const f = path.join(bin, 'turbo');
        writeFileSync(
          f,
          `#!/bin/sh
cp "$GRILLHOUSE_VERROU_MACHINE.detenteur.json" ${JSON.stringify(path.join(d, 'detenteur.json'))}
echo "sorte=\${${SORTE}:-} ticket=\${${TICKET}:-}" > ${JSON.stringify(path.join(d, 'variables'))}
exit 0
`
        );
        chmodSync(f, 0o755);
        writeFileSync(path.join(d, 'package.json'), '{ "name": "essai", "private": true }\n');
        return bin;
      };
      const jouer = async (ajouts: Record<string, string | undefined>) => {
        const d = unDossier();
        const bin = turboEspion(d);
        const env = environnement({
          GRILLHOUSE_VERROU_MACHINE: path.join(d, 'mesure.lock'),
          PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
          ...ajouts,
        });
        const v = await fin(spawn(process.execPath, [VERIFIER], { cwd: d, env, stdio: 'pipe' }));
        expect(v.code, v.sortie).toBe(0);
        return {
          detenteur: JSON.parse(readFileSync(path.join(d, 'detenteur.json'), 'utf8')) as Record<
            string,
            unknown
          >,
          variables: readFileSync(path.join(d, 'variables'), 'utf8').trim(),
        };
      };

      it('critère 5 : la vérification de l’intégration s’inscrit « Intégration » avec le ticket du lot ; ses tâches ne reçoivent pas les variables', async () => {
        const r = await jouer({ [SORTE]: 'Intégration', [TICKET]: 'SH-ae6.5' });
        expect(r.detenteur).toMatchObject({ sorte: 'Intégration', ticket: 'SH-ae6.5' });
        expect(r.variables).toBe('sorte= ticket=');
      });

      it('critère 3 : lancée à la main, elle s’inscrit « Vérification », sans ticket', async () => {
        const r = await jouer({ [SORTE]: undefined, [TICKET]: undefined });
        expect(r.detenteur).toMatchObject({ sorte: 'Vérification', ticket: null });
      });
    });
  }
);
