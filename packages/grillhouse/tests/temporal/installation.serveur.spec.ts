// The server of the account under load: its unit takes the processor first (CPUWeight, no cap),
// opens its database in WAL with a normal synchronous write, keeps a closed workflow 7 days; the
// installation that applies the server's unit refuses under a workflow of a circuit in flight,
// stops the server, compacts its database, then starts it again, and says it. Everything under a
// trial home and a trial directory of units, systemctl, the query of the circuits and the compaction
// stand-ins: no process, no server, no account's systemd.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { describe, expect, it } from 'vitest';
import {
  cheminsDe,
  compacterLaBase,
  installer,
  lieuxDe,
  textesDesUnites,
  UNITE_DE_LA_MACHINE,
  UNITE_DU_SERVEUR,
  uniteDuProjet,
} from '../../src/temporal/installation.js';
import { dossier } from './essai.js';

// The runtime's SQLite, typed here: the types of Node in use do not describe `node:sqlite`.
interface Base {
  exec(sql: string): void;
  prepare(sql: string): { run(...a: string[]): unknown; get(): unknown };
  close(): void;
}
const DatabaseSync = (
  createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (f: string) => Base }
).DatabaseSync;

const VERSION = '0.0.7';
const EPINGLE_ESSAI = { version: VERSION, sommes: { linux_amd64: '0'.repeat(64) } };

// A trial project with the program already laid down, and a journal of what the installation calls.
function monde() {
  const racine = dossier('projet');
  declarerLesLangages(racine);
  writeFileSync(path.join(racine, 'package.json'), '{\n  "name": "essai"\n}\n');
  const l = lieuxDe({ maison: dossier('maison'), unites: dossier('unites'), racine });
  const { programme, donnees } = cheminsDe(l, VERSION);
  mkdirSync(path.dirname(programme), { recursive: true });
  writeFileSync(programme, '#!/bin/sh\n');
  const journal: string[] = [];
  const bases: string[] = [];
  const enVol = { tickets: [] as string[] };
  const compactage = { echec: null as string | null };
  const options = {
    lieux: l,
    epingle: EPINGLE_ESSAI,
    systemctl: (args: string[]) => {
      journal.push(`systemctl ${args.join(' ')}`);
      return { status: 0, stdout: '', stderr: '' };
    },
    circuitsEnVol: () => {
      journal.push('circuits');
      return enVol.tickets;
    },
    compacter: (base: string) => {
      journal.push('compacter');
      bases.push(base);
      if (compactage.echec) {
        throw new Error(compactage.echec);
      }
      return { avant: 4096, apres: 1024 };
    },
    node: '/usr/bin/node',
    travailleur: '/paquet/dist/temporal/travailleur.js',
    trouver: (nom: string) => `/compte/bin/${nom}`,
  };
  const base = () => {
    mkdirSync(path.dirname(donnees), { recursive: true });
    writeFileSync(donnees, 'une base');
  };
  return { l, racine, journal, bases, enVol, compactage, options, base, donnees };
}

const serveur = (journal: string[], verbe: string) =>
  journal.findIndex(j => j.startsWith(`systemctl ${verbe}`) && j.includes(UNITE_DU_SERVEUR));

describe('the unit of the server under load', () => {
  const l = lieuxDe({ maison: dossier('maison'), unites: dossier('unites'), racine: dossier('p') });
  writeFileSync(path.join(l.racine, 'package.json'), '{"name":"essai"}');
  const textes = textesDesUnites(l, {
    version: VERSION,
    node: '/usr/bin/node',
    travailleur: '/paquet/dist/temporal/travailleur.js',
    chemin: '/usr/bin',
    outils: {},
  });

  it('takes the processor before the passes and the workers, without a cap', () => {
    const t = textes[UNITE_DU_SERVEUR]!;
    expect(t).toMatch(/^CPUWeight=1000$/m);
    expect(t).not.toMatch(/^CPUQuota=/m);
  });

  it('leaves each worker the default weight', () => {
    for (const u of [uniteDuProjet(l.racine), UNITE_DE_LA_MACHINE]) {
      expect(textes[u]!, u).not.toMatch(/CPUWeight=/);
    }
  });

  it('opens its database in WAL with a normal synchronous write', () => {
    const t = textes[UNITE_DU_SERVEUR]!;
    expect(t).toContain('--sqlite-pragma journal_mode=wal');
    expect(t).toContain('--sqlite-pragma synchronous=NORMAL');
    expect(t.split('\n').find(x => x.startsWith('ExecStart='))).toContain(
      '--sqlite-pragma synchronous=NORMAL'
    );
  });

  it('keeps a closed workflow 7 days, not 30', () => {
    const post = textes[UNITE_DU_SERVEUR]!.split('\n').find(x => x.startsWith('ExecStartPost='));
    expect(post).toContain('--retention 168h');
    expect(post).not.toContain('720h');
  });
});

describe('applying the unit of the server', () => {
  it('stops the server, compacts its database, then starts it again, in that order', async () => {
    const m = monde();
    m.base();
    await installer(m.options);
    const stop = serveur(m.journal, 'stop');
    const compacter = m.journal.indexOf('compacter');
    const redemarre = m.journal.findIndex(
      (j, i) => i > compacter && /^systemctl (re)?start /.test(j) && j.includes(UNITE_DU_SERVEUR)
    );
    expect(stop).toBeGreaterThanOrEqual(0);
    expect(compacter).toBeGreaterThan(stop);
    expect(redemarre).toBeGreaterThan(compacter);
    expect(m.journal.filter(j => j === 'compacter')).toHaveLength(1);
    expect(m.bases).toEqual([m.donnees]);
  });

  it('asks the circuits in flight before it writes anything', async () => {
    const m = monde();
    m.base();
    await installer(m.options);
    expect(m.journal[0]).toBe('circuits');
  });

  it('says in its report that it compacted the database, its size before and after', async () => {
    const m = monde();
    m.base();
    const r = await installer(m.options);
    expect(r.compactage).toEqual({ avant: 4096, apres: 1024 });
    expect(r.change).toBe(true);
  });

  it('compacts nothing and does not fail without a database file', async () => {
    const m = monde();
    const r = await installer(m.options);
    expect(m.journal).not.toContain('compacter');
    expect(r.compactage ?? null).toBeNull();
    expect(r.appliquees).toContain(UNITE_DU_SERVEUR);
  });

  it('compacts when only the server’s unit is still to apply, the workers’ being applied', async () => {
    const m = monde();
    m.base();
    await installer(m.options);
    const f = cheminsDe(m.l, VERSION).appliquees;
    const sommes = JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>;
    delete sommes[UNITE_DU_SERVEUR];
    writeFileSync(f, JSON.stringify(sommes));
    m.journal.length = 0;
    const r = await installer(m.options);
    expect(r.appliquees).toEqual([UNITE_DU_SERVEUR]);
    expect(m.journal.filter(j => j === 'compacter')).toHaveLength(1);
    expect(m.journal[0]).toBe('circuits');
  });

  it('neither compacts, nor restarts the server, nor asks the circuits when only a worker is to apply', async () => {
    const m = monde();
    m.base();
    await installer(m.options);
    const f = cheminsDe(m.l, VERSION).appliquees;
    const sommes = JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>;
    delete sommes[UNITE_DE_LA_MACHINE];
    writeFileSync(f, JSON.stringify(sommes));
    m.journal.length = 0;
    const r = await installer(m.options);
    expect(r.appliquees).toEqual([UNITE_DE_LA_MACHINE]);
    expect(m.journal).not.toContain('compacter');
    expect(m.journal).not.toContain('circuits');
    expect(m.journal.some(j => j.includes(UNITE_DU_SERVEUR))).toBe(false);
    expect(r.compactage ?? null).toBeNull();
  });

  it('on an installation up to date compacts nothing, restarts nothing and asks no circuit', async () => {
    const m = monde();
    m.base();
    await installer(m.options);
    m.journal.length = 0;
    const avant = readFileSync(m.donnees, 'utf8');
    const r = await installer(m.options);
    expect(m.journal).toEqual([]);
    expect(r.change).toBe(false);
    expect(r.compactage ?? null).toBeNull();
    expect(readFileSync(m.donnees, 'utf8')).toBe(avant);
  });
});

describe('the installation under a circuit in flight', () => {
  it('refuses by the tickets in flight and touches no unit, no file, no service', async () => {
    const m = monde();
    m.base();
    m.enVol.tickets = ['grillhouse-3uv.108', 'grillhouse-4nr.2'];
    const instantane = (d: string) =>
      readdirSync(d, { recursive: true, withFileTypes: true })
        .filter(e => e.isFile())
        .map(e => [
          path.join(e.parentPath, e.name),
          statSync(path.join(e.parentPath, e.name)).mtimeMs,
        ]);
    const avant = [m.l.maison, m.l.unites, m.racine].map(instantane);
    const refus = await installer(m.options).then(
      () => null,
      (e: unknown) => e as Error
    );
    expect(refus).toBeInstanceOf(Error);
    expect(refus!.message).toContain('grillhouse-3uv.108');
    expect(refus!.message).toContain('grillhouse-4nr.2');
    expect(m.journal).toEqual(['circuits']);
    expect(readdirSync(m.l.unites)).toEqual([]);
    expect(existsSync(cheminsDe(m.l, VERSION).appliquees)).toBe(false);
    expect([m.l.maison, m.l.unites, m.racine].map(instantane)).toEqual(avant);
    expect(readFileSync(m.donnees, 'utf8')).toBe('une base');
  });

  it('lays no program down when it refuses', async () => {
    const racine = dossier('projet');
    declarerLesLangages(racine);
    writeFileSync(path.join(racine, 'package.json'), '{\n  "name": "essai"\n}\n');
    const l = lieuxDe({ maison: dossier('maison'), unites: dossier('unites'), racine });
    const archive = Buffer.from('une archive');
    const epingle = {
      version: VERSION,
      sommes: { linux_amd64: createHash('sha256').update(archive).digest('hex') },
    };
    const appels: string[][] = [];
    const refus = await installer({
      lieux: l,
      epingle,
      plateforme: 'linux_amd64',
      obtenir: () => Promise.resolve(archive),
      systemctl: a => (appels.push(a), { status: 0, stdout: '', stderr: '' }),
      circuitsEnVol: () => ['grillhouse-3uv.108'],
      compacter: () => ({ avant: 0, apres: 0 }),
      node: '/usr/bin/node',
      travailleur: '/paquet/dist/temporal/travailleur.js',
      trouver: nom => `/compte/bin/${nom}`,
    }).then(
      () => null,
      (e: unknown) => e as Error
    );
    expect(refus?.message).toContain('grillhouse-3uv.108');
    expect(existsSync(cheminsDe(l, VERSION).programme)).toBe(false);
    expect(appels).toEqual([]);
    expect(readdirSync(l.unites)).toEqual([]);
  });

  it('goes on when no circuit is in flight, as when the server does not answer', async () => {
    const m = monde();
    m.base();
    m.enVol.tickets = [];
    const r = await installer(m.options);
    expect(r.appliquees).toContain(UNITE_DU_SERVEUR);
  });
});

describe('a compaction that fails', () => {
  it('refuses the installation by its name, after starting the stopped server again', async () => {
    const m = monde();
    m.base();
    m.compactage.echec = 'disk I/O error';
    const refus = await installer(m.options).then(
      () => null,
      (e: unknown) => e as Error
    );
    expect(refus).toBeInstanceOf(Error);
    expect(refus!.message).toMatch(/compactage/i);
    expect(refus!.message).toContain('disk I/O error');
    const stop = serveur(m.journal, 'stop');
    const apres = m.journal.findIndex(
      (j, i) => i > stop && /^systemctl (re)?start /.test(j) && j.includes(UNITE_DU_SERVEUR)
    );
    expect(stop).toBeGreaterThanOrEqual(0);
    expect(apres).toBeGreaterThan(stop);
    expect(m.journal.indexOf('compacter')).toBeLessThan(apres);
  });

  it('is played again at the next run: the server’s unit is not recorded as applied', async () => {
    const m = monde();
    m.base();
    m.compactage.echec = 'disk I/O error';
    await expect(installer(m.options)).rejects.toThrow();
    m.compactage.echec = null;
    m.journal.length = 0;
    const r = await installer(m.options);
    expect(r.appliquees).toContain(UNITE_DU_SERVEUR);
    expect(m.journal).toContain('compacter');
  });
});

describe('the real compaction', () => {
  it('opens the database with the runtime’s SQLite and gives the freed pages back', () => {
    const base = path.join(dossier('base'), 'temporal.db');
    const db = new DatabaseSync(base);
    db.exec('CREATE TABLE t (x TEXT)');
    const insert = db.prepare('INSERT INTO t VALUES (?)');
    for (let i = 0; i < 2000; i++) {
      insert.run('x'.repeat(500));
    }
    db.exec('DELETE FROM t WHERE rowid > 10');
    db.close();
    const avant = statSync(base).size;
    const r = compacterLaBase(base);
    expect(r.avant).toBe(avant);
    expect(r.apres).toBe(statSync(base).size);
    expect(r.apres).toBeLessThan(r.avant);
    const lu = new DatabaseSync(base);
    expect((lu.prepare('SELECT count(*) AS n FROM t').get() as { n: number }).n).toBe(10);
    lu.close();
  });

  it('refuses a file that is not a database, by SQLite’s own message', () => {
    const base = path.join(dossier('base'), 'temporal.db');
    writeFileSync(
      base,
      'pas une base de données SQLite, assez longue pour être lue comme telle'.repeat(20)
    );
    expect(() => compacterLaBase(base)).toThrow(/not a database/i);
  });
});
