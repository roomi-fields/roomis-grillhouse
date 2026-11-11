// The detection of a stale worker: the state applied by `installer` (the sums of the units laid
// down, unites-appliquees.json) compared to the texts `installer` would write now, by the same
// computation, for the version `grillhouse.outil` names. Without a process: a trial home, a trial
// directory of units, systemctl and the account's tools stand-ins; the detection runs none, writes
// nothing, and never lays the published version down.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { describe, expect, it } from 'vitest';
import {
  cheminsDe,
  installer,
  lieuxDe,
  travailleurPerime,
} from '../../src/temporal/installation.js';
import { cacheDesOutils } from '../../scripts/aiguillage.mjs';
import { dossier } from './essai.js';

const VERSION = '0.0.1';
const EPINGLE_ESSAI = { version: VERSION, sommes: {} };
const tous = (nom: string) => `/compte/bin/${nom}`;

// A trial project that names <outil> as its published version (none when absent), its home with the
// program of the pin already laid down, and its directory of units.
function monde(outil?: string, langages: string[] = ['typescript']) {
  const racine = dossier('projet');
  declarerLesLangages(racine, langages);
  const ecrire = (o?: string) =>
    writeFileSync(
      path.join(racine, 'package.json'),
      JSON.stringify({ name: 'essai', ...(o ? { grillhouse: { outil: o } } : {}) })
    );
  ecrire(outil);
  const l = lieuxDe({ maison: dossier('maison'), unites: dossier('unites'), racine });
  const { programme } = cheminsDe(l, VERSION);
  mkdirSync(path.dirname(programme), { recursive: true });
  writeFileSync(programme, '#!/bin/sh\n');
  return { l, ecrire };
}

// The worker of the published version <v>, laid down in the cache of the home of <l> as npm would.
function poserLeTravailleur(l: { maison: string }, v: string): string {
  const d = path.join(cacheDesOutils(l.maison), v);
  const f = path.join(d, 'node_modules/@roomi-fields/grillhouse/dist/temporal/travailleur.js');
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, '');
  return d;
}

// `installer` for the version the project names now, the account's tools found by <trouver>.
function poserLesUnites(l: ReturnType<typeof monde>['l'], trouver = tous) {
  return installer({
    lieux: l,
    epingle: EPINGLE_ESSAI,
    systemctl: () => ({ status: 0, stdout: '', stderr: '' }),
    node: '/usr/bin/node',
    trouver,
    outil: v => path.join(cacheDesOutils(l.maison), v),
  });
}

const detecter = (
  l: ReturnType<typeof monde>['l'],
  trouver: (nom: string) => string | null = tous
) => travailleurPerime({ lieux: l, epingle: EPINGLE_ESSAI, node: '/usr/bin/node', trouver });

// Every file under <d> with its content, to see that nothing was written.
function instantane(d: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(d, { recursive: true, withFileTypes: true })
      .filter(e => e.isFile())
      .map(e => path.join(e.parentPath, e.name))
      .map(f => [f, readFileSync(f, 'utf8')])
  );
}

describe('the stale worker, compared to what installer writes for grillhouse.outil', () => {
  it('is stale after a rise of grillhouse.outil: the units still stand on the former version', async () => {
    const { l, ecrire } = monde('1.0.0');
    poserLeTravailleur(l, '1.0.0');
    await poserLesUnites(l);
    ecrire('2.0.0');
    expect(detecter(l)).toBe(true);
  });

  it('is stale for another version, the same units, the detection told the other version', async () => {
    const { l, ecrire } = monde('1.0.0');
    poserLeTravailleur(l, '1.0.0');
    await poserLesUnites(l);
    expect(detecter(l)).toBe(false);
    ecrire('1.0.1');
    expect(detecter(l)).toBe(true);
  });

  it('is up to date right after installer wrote the units for the same version', async () => {
    const { l } = monde('1.0.0');
    poserLeTravailleur(l, '1.0.0');
    await poserLesUnites(l);
    expect(detecter(l)).toBe(false);
  });

  it('is up to date again once installer ran after the rise', async () => {
    const { l, ecrire } = monde('1.0.0');
    poserLeTravailleur(l, '1.0.0');
    await poserLesUnites(l);
    ecrire('2.0.0');
    poserLeTravailleur(l, '2.0.0');
    await poserLesUnites(l);
    expect(detecter(l)).toBe(false);
  });

  it('is stale when the PATH of the account changed since the units were applied', async () => {
    const { l } = monde('1.0.0');
    poserLeTravailleur(l, '1.0.0');
    await poserLesUnites(l);
    expect(detecter(l, nom => `/autre/bin/${nom}`)).toBe(true);
  });
});

describe('the stale worker, without an installation of Temporal on the account', () => {
  it('is not stale: the initial deployment is not a rise', () => {
    expect(detecter(monde('1.0.0').l)).toBe(false);
    expect(detecter(monde().l)).toBe(false);
  });

  it('is not stale when the applied state holds no sum', () => {
    const { l } = monde('1.0.0');
    const f = cheminsDe(l, VERSION).appliquees;
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, '{}\n');
    expect(detecter(l)).toBe(false);
  });
});

describe('the detection plays nothing', () => {
  it('writes nothing and lays no published version down: its worker is deduced from its folder in the cache', async () => {
    const { l, ecrire } = monde('1.0.0');
    poserLeTravailleur(l, '1.0.0');
    await poserLesUnites(l);
    ecrire('3.0.0');
    const avant = instantane(l.maison);
    const unites = instantane(l.unites);
    expect(detecter(l)).toBe(true);
    expect(instantane(l.maison)).toEqual(avant);
    expect(instantane(l.unites)).toEqual(unites);
    expect(existsSync(path.join(cacheDesOutils(l.maison), '3.0.0'))).toBe(false);
  });

  it('takes the worker of the version from the cache of the home, where installer takes it', async () => {
    const { l } = monde('1.0.0');
    const d = poserLeTravailleur(l, '1.0.0');
    await poserLesUnites(l);
    // The applied unit names a worker under that very folder.
    const projet = readdirSync(l.unites).find(n => n.startsWith('grillhouse-travailleur-essai'))!;
    expect(readFileSync(path.join(l.unites, projet), 'utf8')).toContain(d);
    expect(detecter(l)).toBe(false);
  });
});

describe('the stale worker, grillhouse.outil absent or a tool missing', () => {
  it('compares to the worker of the repository when the key is absent, and says a stale one', async () => {
    const { l } = monde();
    await poserLesUnites(l);
    expect(detecter(l)).toBe(false);
    const f = cheminsDe(l, VERSION).appliquees;
    const somme = JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>;
    for (const k of Object.keys(somme)) {
      somme[k] = '0'.repeat(64);
    }
    writeFileSync(f, JSON.stringify(somme));
    expect(detecter(l)).toBe(true);
  });

  it('does not throw when a tool of the account is not found: it says the worker to reinstall', async () => {
    const { l } = monde('1.0.0');
    poserLeTravailleur(l, '1.0.0');
    await poserLesUnites(l);
    expect(() => detecter(l, nom => (nom === 'claude' ? null : tous(nom)))).not.toThrow();
    expect(detecter(l, nom => (nom === 'claude' ? null : tous(nom)))).toBe(true);
  });

  it('does not throw when a tool of a declared language is not found', async () => {
    const { l } = monde('1.0.0', ['typescript', 'cargo']);
    poserLeTravailleur(l, '1.0.0');
    await poserLesUnites(l);
    expect(detecter(l)).toBe(false);
    expect(() => detecter(l, nom => (nom === 'cargo' ? null : tous(nom)))).not.toThrow();
    expect(detecter(l, nom => (nom === 'cargo' ? null : tous(nom)))).toBe(true);
  });
});
