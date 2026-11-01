// grillhouse-xv9: every temporary file belongs to an owner and goes with it, a pass's with its
// process, an agent's with its ticket, as systemd's PrivateTmp= gives a service a /tmp of its own,
// destroyed with it, and Bazel a sandbox per action;
// the caches of compilation live under ~/.cache, as Bazel's output_base, never on the disk in
// memory that the sessions of the machine share. Witness: the night of 2026-11-01, 25 reds of
// nuit.nuit.spec.ts on « Débordement du quota d'espace disque », /tmp a tmpfs of 16 GB whose 8 GB
// the scratchpads of one supervisor held (a Rust target of 2.7 GB, copies of the repository, npm
// caches), which nothing emptied.
//
// The mechanism is the base of a pass (scripts/mesure/base-de-passe.mjs), its owner a process, a
// ticket or a directory; each case plays it under a trial directory. The launcher's ticket
// directory and the removal of the closed tickets' bases, which need a trial repository, are the
// night's
// (packages/grillhouse-essais/tests/temporaire.nuit.spec.ts).
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  balayerLesTickets,
  cacheDeCompilation,
  cacheDeLaRacine,
  ouvrirBase,
  ouvrirBaseDuTicket,
} from '../../scripts/mesure/base-de-passe.mjs';
import { avecSccache, cibleDeCompilation } from '../../scripts/langages/cargo/sccache.mjs';

const DEPOT = path.resolve(import.meta.dirname, '../..');
const BASE = path.join(DEPOT, 'scripts/mesure/base-de-passe.mjs');
const NUIT = path.join(DEPOT, 'scripts/langages/typescript/tests-de-nuit.mjs');
const VERROU = pathToFileURL(path.join(DEPOT, 'scripts/verrou-de-machine.mjs')).href;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'temporaire-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const unDossier = (nom: string) => mkdtempSync(path.join(ESSAIS, `${nom}-`));
const proprietaire = (base: string) =>
  JSON.parse(readFileSync(path.join(base, '.grillhouse-base'), 'utf8')) as Record<string, unknown>;

// The environment of a child: this one, without what Vitest and the frame set for themselves.
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS' && !k.startsWith('GRILLHOUSE_')
  )
) as Record<string, string>;

// Criterion 1, as the owner amended it: an agent's temporary directory is its ticket's (criterion
// 2), kept from one session and one resumption to the next; the launcher gives it, which the
// night plays (packages/grillhouse-essais/tests/temporaire.nuit.spec.ts).
describe('grillhouse-xv9, critères 1 et 2 — un ticket a un dossier temporaire, retiré quand il se ferme', () => {
  it('`grillhouse temporaire <ticket>` gives the same directory at each call, its owner the ticket', () => {
    const dans = unDossier('ticket');
    const donner = (ticket: string) =>
      spawnSync(process.execPath, [BASE, ticket], {
        encoding: 'utf8',
        env: { ...ENV, TMPDIR: dans },
      });
    const r = donner('demo-3uv.1');
    expect(r.status, r.stderr).toBe(0);
    const t = path.join(dans, 'grillhouse-ticket-demo-3uv.1', 't');
    expect(r.stdout).toBe(`${t}\n`);
    expect(existsSync(t)).toBe(true);
    writeFileSync(path.join(t, 'garde'), '');
    expect(donner('demo-3uv.1').stdout).toBe(`${t}\n`);
    expect(existsSync(path.join(t, 'garde'))).toBe(true);
    expect(proprietaire(path.dirname(t))).toEqual({ ticket: 'demo-3uv.1' });
    const faux = donner('../x');
    expect(faux.status).toBe(2);
    expect(faux.stderr).toMatch(/n'est pas l'identifiant d'un ticket/);
  });

  it('the base of a closed ticket goes, an open one stays, and the sweep of the bases of passes never touches either', () => {
    const dans = unDossier('balayage');
    const ferme = ouvrirBaseDuTicket('demo-1', { dans });
    const ouvert = ouvrirBaseDuTicket('demo-2', { dans });
    ouvrirBase('passe', { dans }).fermer();
    expect(existsSync(ferme.base) && existsSync(ouvert.base)).toBe(true);
    expect(balayerLesTickets(() => new Set(['demo-1']), { dans })).toEqual(['demo-1']);
    expect(existsSync(ferme.base)).toBe(false);
    expect(existsSync(ouvert.base)).toBe(true);
  });

  it('the closed tickets are read only when a ticket has its base there', () => {
    const dans = unDossier('vide');
    let lus = 0;
    expect(balayerLesTickets(() => (lus++, new Set(['demo-1'])), { dans })).toEqual([]);
    expect(lus).toBe(0);
  });
});

describe('grillhouse-xv9, critère 3 — les caches de compilation vont sous ~/.cache/grillhouse/', () => {
  it('a cache of compilation lies under ${XDG_CACHE_HOME:-~/.cache}/grillhouse/<outil>', () => {
    expect(cacheDeCompilation('uv', { HOME: '/h' })).toBe('/h/.cache/grillhouse/uv');
    expect(cacheDeCompilation('uv', { HOME: '/h', XDG_CACHE_HOME: '/x' })).toBe('/x/grillhouse/uv');
  });

  it('sccache keeps its cache there', () => {
    const maison = unDossier('maison');
    const env = avecSccache(unDossier('projet'), { HOME: maison, PATH: '' });
    expect(env.SCCACHE_DIR).toBe(path.join(maison, '.cache', 'grillhouse', 'sccache'));
  });

  it('a workspace rooted in the temporary directory builds into a cache of its root, out of it; a root elsewhere, or a target already named, keeps its own', () => {
    const maison = unDossier('maison');
    const racine = unDossier('projet');
    const env = { HOME: maison, PATH: '', TMPDIR: ESSAIS };
    const cible = cibleDeCompilation(racine, env).CARGO_TARGET_DIR ?? '';
    expect(path.dirname(cible)).toBe(path.join(maison, '.cache', 'grillhouse', 'cargo'));
    expect(proprietaire(cible)).toEqual({ racine, espace: readlinkSync('/proc/self/ns/pid') });
    expect(avecSccache(racine, env).CARGO_TARGET_DIR).toBe(cible);
    expect(cibleDeCompilation(racine, env).CARGO_TARGET_DIR).toBe(cible);
    expect(cibleDeCompilation('/srv/projet', env)).toEqual({});
    expect(cibleDeCompilation(racine, { ...env, CARGO_TARGET_DIR: '/t' })).toEqual({});
  });

  it('a cache of a root bears the namespace of processes that opened it; only that namespace sweeps it', () => {
    const maison = unDossier('maison');
    const env = { HOME: maison };
    const racine = unDossier('racine');
    const cache = cacheDeLaRacine('cargo', racine, env);
    expect(proprietaire(cache)).toEqual({ racine, espace: readlinkSync('/proc/self/ns/pid') });
    // A root that another namespace sees gone (an envelope's private /tmp) is not judged here.
    const ailleurs = path.join(path.dirname(cache), 'grillhouse-ailleurs');
    mkdirSync(ailleurs);
    writeFileSync(
      path.join(ailleurs, '.grillhouse-base'),
      JSON.stringify({ racine: path.join(ESSAIS, 'absente'), espace: 'pid:[1]' })
    );
    cacheDeLaRacine('cargo', unDossier('autre'), env);
    expect(existsSync(ailleurs)).toBe(true);
  });

  // As GitHub Actions removes a cache unused for 7 days and cargo-sweep a target by its age: a base
  // of a cache of a root untouched for 7 days goes, whatever namespace opened it, from the host
  // only (in an envelope, the home is read-only).
  const vieille = (dans: string, nom: string, jours: number) => {
    const b = path.join(dans, nom);
    mkdirSync(b, { recursive: true });
    writeFileSync(
      path.join(b, '.grillhouse-base'),
      JSON.stringify({ racine: path.join(ESSAIS, 'absente'), espace: 'pid:[1]' })
    );
    const t = new Date(Date.now() - jours * 24 * 3600 * 1000);
    utimesSync(b, t, t);
    return b;
  };

  it('a cache of a root untouched for 7 days goes, whatever its namespace; a recent one of another namespace stays', () => {
    const maison = unDossier('maison');
    const env = { HOME: maison };
    const dans = path.join(maison, '.cache', 'grillhouse', 'cargo');
    const ancienne = vieille(dans, 'grillhouse-ancienne', 8);
    const recente = vieille(dans, 'grillhouse-recente', 6);
    cacheDeLaRacine('cargo', unDossier('racine'), env);
    expect(existsSync(ancienne)).toBe(false);
    expect(existsSync(recente)).toBe(true);
  });

  it('in an envelope, no cache is swept by its age; on the host, the next base of a pass sweeps them', () => {
    const maison = unDossier('maison');
    const dans = path.join(maison, '.cache', 'grillhouse', 'cargo');
    const ancienne = vieille(dans, 'grillhouse-ancienne', 8);
    cacheDeLaRacine('cargo', unDossier('racine'), { HOME: maison, GRILLHOUSE_ENVELOPPE: '.' });
    expect(existsSync(ancienne)).toBe(true);
    const ouvrir = (ajouts: Record<string, string>) =>
      spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { ouvrirBase } from ${JSON.stringify(pathToFileURL(BASE).href)}; ouvrirBase('passe').fermer();`,
        ],
        {
          encoding: 'utf8',
          env: { ...ENV, HOME: maison, XDG_CACHE_HOME: '', TMPDIR: unDossier('passe'), ...ajouts },
        }
      );
    expect(ouvrir({ GRILLHOUSE_ENVELOPPE: '.' }).status).toBe(0);
    expect(existsSync(ancienne)).toBe(true);
    const r = ouvrir({});
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(ancienne)).toBe(false);
  });

  it('a reading of the target, as cargo metadata needs, names the cache without making it', () => {
    const maison = unDossier('maison');
    const racine = unDossier('projet');
    const env = { HOME: maison, PATH: '', TMPDIR: ESSAIS };
    const cible = cibleDeCompilation(racine, env, { creer: false }).CARGO_TARGET_DIR ?? '';
    expect(path.dirname(cible)).toBe(path.join(maison, '.cache', 'grillhouse', 'cargo'));
    expect(existsSync(path.join(maison, '.cache'))).toBe(false);
    expect(cibleDeCompilation(racine, env).CARGO_TARGET_DIR).toBe(cible);
  });

  it('the cache of a root that is gone is swept by the next one', () => {
    const maison = unDossier('maison');
    const env = { HOME: maison };
    const partie = unDossier('partie');
    const vieux = cacheDeLaRacine('cargo', partie, env);
    rmSync(partie, { recursive: true, force: true });
    const neuf = cacheDeLaRacine('cargo', unDossier('restee'), env);
    expect(existsSync(vieux)).toBe(false);
    expect(existsSync(neuf)).toBe(true);
  });
});

describe('grillhouse-xv9, critère 4 — une passe lourde attend la place au lieu d’échouer', () => {
  // A child that runs a measure under the lock of the machine, its options <options> (JavaScript),
  // in the temporary directory <dans>: « joue » when the measure plays, the message and the code
  // of a wait that stops.
  const mesurer = (dans: string, options: string, env: Record<string, string> = {}) =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { avecLaMachine } from ${JSON.stringify(VERROU)};
        try { avecLaMachine(() => console.log('joue'), ${options}); }
        catch (e) { if (e?.name !== 'AttenteDeLaMachine') throw e; console.log(e.message); process.exitCode = e.code; }`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...ENV,
          TMPDIR: dans,
          GRILLHOUSE_VERROU_MACHINE: path.join(unDossier('verrou'), 'mesure.lock'),
          // The disk of the copy is grillhouse-k5y's (place-des-copies.spec.ts): no floor here.
          GRILLHOUSE_COPIE_LIBRE: '0',
          ...env,
        },
      }
    );
  // A temporary directory that holds an entry of <ko> KB.
  const occupe = (ko: number) => {
    const dans = unDossier('occupe');
    mkdirSync(path.join(dans, 'claude-1000'));
    writeFileSync(path.join(dans, 'claude-1000', 'gros'), Buffer.alloc(ko * 1024, 1));
    return dans;
  };

  it('under 4 GB free, it says so with what holds the directory, waits, then plays', () => {
    const dans = occupe(64);
    const r = mesurer(
      dans,
      `{ libre: (() => { let n = 0; return () => (++n > 3 ? Infinity : 2 * 1024 ** 3); })(), rappelMs: 1 }`
    );
    expect(r.status, r.stderr).toBe(0);
    const lignes = r.stdout.split('\n');
    expect(lignes[0]).toMatch(
      /^⏳ le dossier temporaire \(.+\) n'a que 2,0 Go libres, moins des 4,0 Go qu'une passe lourde demande .*l'occupent : claude-1000 \(/
    );
    expect(lignes).toContain('joue');
  });

  it('the wait names the ticket whose temporary directory holds the room', () => {
    const dans = unDossier('ticket-occupe');
    const t = path.join(dans, 'grillhouse-ticket-demo-9', 't');
    mkdirSync(t, { recursive: true });
    writeFileSync(path.join(t, 'gros'), Buffer.alloc(64 * 1024, 1));
    const r = mesurer(dans, `{ libre: () => 0, borneMs: 0 }`);
    expect(r.status).toBe(75);
    expect(r.stdout).toMatch(/l'occupent : grillhouse-ticket-demo-9 \(le ticket demo-9, /);
  });

  it('the count of what holds the directory runs only when the wait speaks, never at each turn', () => {
    const dans = occupe(1);
    const r = mesurer(
      dans,
      `{ libre: (() => { let n = 0; return () => (++n > 20 ? Infinity : 0); })(), occupe: () => { console.log('compte'); return 'x'; }, rappelMs: 3_600_000 }`
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.split('\n').filter(l => l === 'compte')).toHaveLength(1);
  });

  it('the wait has the bound of the lock’s, then « à repasser » (75), what holds the directory named', () => {
    const dans = occupe(8);
    const r = mesurer(dans, `{ libre: () => 0, borneMs: 50, rappelMs: 10 }`);
    expect(r.status).toBe(75);
    expect(r.stdout).toMatch(/⏱ attente de place bornée à .*l'occupent : claude-1000 \(.*code 75/);
    expect(r.stdout).not.toContain('joue');
  });

  it('GRILLHOUSE_TEMPORAIRE_LIBRE names another floor, in bytes', () => {
    const dans = occupe(1);
    const r = mesurer(dans, `{ libre: () => 10 }`, { GRILLHOUSE_TEMPORAIRE_LIBRE: '10' });
    expect(r.stdout.trim()).toBe('joue');
  });

  it('the night tests wait too: their bound reached, they end at 75 without playing', () => {
    const racine = unDossier('nuit');
    writeFileSync(path.join(racine, 'a.nuit.test.ts'), '');
    const r = spawnSync(process.execPath, [NUIT], {
      cwd: racine,
      encoding: 'utf8',
      env: {
        ...ENV,
        TMPDIR: racine,
        GRILLHOUSE_TEMPORAIRE_LIBRE: String(2 ** 60),
        GRILLHOUSE_ATTENTE_MACHINE_MS: '0',
      },
    });
    expect(r.status).toBe(75);
    expect(r.stdout).toMatch(/attente de place bornée/);
  });
});

describe('grillhouse-xv9, critère 5 — la charte et la consigne des agents disent la règle', () => {
  const lire = (f: string) => readFileSync(path.join(DEPOT, '../..', f), 'utf8');

  it('the common charter: a temporary file dies with its owner, an agent’s with its ticket, the caches under ~/.cache/grillhouse', () => {
    const regle = lire('mods/grillhouse/charte.md')
      .split('\n- ')
      .find(l => l.startsWith('**Un fichier temporaire meurt avec son propriétaire**'));
    expect(regle).toBeDefined();
    expect(regle).toMatch(/le temps de son ticket/);
    expect(regle).toMatch(/jamais dans le seul dossier temporaire/);
    expect(regle).toMatch(/~\/\.cache\/grillhouse\//);
    expect(regle).toMatch(/npx grillhouse temporaire <ticket>/);
  });

  it('the instruction of the agents carries it', () => {
    expect(lire('mods/grillhouse/skills/pitmaster/references/consigne-agent.md')).toMatch(
      /Ton dossier temporaire est celui de ton ticket[^\n]*ce qu'il te faut pour reprendre vit dans ta copie ou ta passation, jamais dans le seul dossier temporaire/
    );
  });
});
