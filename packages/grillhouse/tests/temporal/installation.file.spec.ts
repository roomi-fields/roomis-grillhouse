// The installation of the account's Temporal relaunches the queue of the project in flight
// (`file:<racine>`, src/temporal/file/deroule.ts) whenever the version of the tool the queue
// started under differs from the one installed: its view says `version`, an old queue answers
// without it and reads « inconnue » (different). The queue restarts as new, at rest at once, busy
// after its entry under way, carrying those that wait. The installed version is that of the package
// the worker of the project comes from (its package.json). The worker's unit is restarted before
// the signal when this pass did not restart it, so that the queue restarts under the installed
// code. A queue of the installed version is never signalled, a project without a queue starts none,
// a server that does not answer is no queue. The report says what became of the queue with both
// versions, and so does the line of the command. Everything under a trial home and a trial
// directory of units, systemctl, the circuits and the client of the queue stand-ins: no process,
// no server, no account's systemd.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { describe, expect, it } from 'vitest';
import { idDeLaFile } from '../../src/temporal/file/contrat.js';
import {
  cheminsDe,
  installer,
  lieuxDe,
  texteDeLInstallation,
  uniteDuProjet,
} from '../../src/temporal/installation.js';
import { dossier } from './essai.js';

const VERSION = '0.0.7';
const EPINGLE_ESSAI = { version: VERSION, sommes: { linux_amd64: '0'.repeat(64) } };
const INSTALLEE = '0.2.0';
const ANCIENNE = '0.1.0';

// What the stand-in of the queue's client answers to its view: a view, no queue (null), or a
// server that does not answer (a failure).
type Vue = { enCours: string | null; attente: string[]; version?: string } | null | 'injoignable';

// A package of the tool of <version>: its package.json, and the worker path two levels below it.
function paquetDe(
  version: string,
  parent = dossier('paquet')
): { dossier: string; travailleur: string } {
  mkdirSync(path.join(parent, 'dist/temporal'), { recursive: true });
  writeFileSync(
    path.join(parent, 'package.json'),
    JSON.stringify({ name: '@roomi-fields/grillhouse', version })
  );
  const travailleur = path.join(parent, 'dist/temporal/travailleur.js');
  writeFileSync(travailleur, '');
  return { dossier: parent, travailleur };
}

// A trial project with the program already laid down, and a journal of what the installation calls.
function monde(installee = INSTALLEE) {
  const racine = dossier('projet');
  declarerLesLangages(racine);
  writeFileSync(path.join(racine, 'package.json'), '{\n  "name": "essai"\n}\n');
  const l = lieuxDe({ maison: dossier('maison'), unites: dossier('unites'), racine });
  const { programme } = cheminsDe(l, VERSION);
  mkdirSync(path.dirname(programme), { recursive: true });
  writeFileSync(programme, '#!/bin/sh\n');
  const journal: string[] = [];
  const etat = {
    vue: null as Vue,
    circuits: [] as string[],
    echecDuSignal: false,
  };
  const options = {
    lieux: l,
    epingle: EPINGLE_ESSAI,
    systemctl: (args: string[]) => {
      journal.push(`systemctl ${args.join(' ')}`);
      return { status: 0, stdout: '', stderr: '' };
    },
    circuitsEnVol: () => etat.circuits,
    compacter: () => ({ avant: 1, apres: 1 }),
    file: {
      vue: (id: string) => {
        journal.push(`vue ${id}`);
        return etat.vue === 'injoignable'
          ? Promise.reject(new Error('connexion refusée'))
          : Promise.resolve(etat.vue);
      },
      relancer: (id: string) => {
        journal.push(`relancer ${id}`);
        return etat.echecDuSignal ? Promise.reject(new Error('signal perdu')) : Promise.resolve();
      },
    },
    node: '/usr/bin/node',
    travailleur: paquetDe(installee).travailleur,
    trouver: (nom: string) => `/compte/bin/${nom}`,
  };
  return { racine, journal, etat, options };
}

const relances = (journal: string[]) => journal.filter(j => j.startsWith('relancer'));
const redemarrages = (journal: string[]) => journal.filter(j => j.startsWith('systemctl restart'));

describe('the queue in flight restarted by the installation when its version differs', () => {
  it('a queue of another version at rest is signalled, once, by the id of the queue of the project', async () => {
    const m = monde();
    m.etat.vue = { enCours: null, attente: [], version: ANCIENNE };
    const r = await installer(m.options);
    expect(relances(m.journal)).toEqual([`relancer ${idDeLaFile(m.racine)}`]);
    expect(r.file).toBe(`repartie (${ANCIENNE} → ${INSTALLEE})`);
  });

  it('the queue is signalled after the worker restarted, not before', async () => {
    const m = monde();
    m.etat.vue = { enCours: null, attente: [], version: ANCIENNE };
    await installer(m.options);
    const redemarrage = m.journal.findIndex(j => j.startsWith('systemctl restart'));
    expect(redemarrage).toBeGreaterThanOrEqual(0);
    expect(m.journal.findIndex(j => j.startsWith('relancer'))).toBeGreaterThan(redemarrage);
  });

  it('a busy queue of another version is signalled and the report says after which entry it restarts, with both versions', async () => {
    const m = monde();
    m.etat.vue = { enCours: 'essai-7', attente: ['essai-8', 'essai-9'], version: ANCIENNE };
    const r = await installer(m.options);
    expect(relances(m.journal)).toEqual([`relancer ${idDeLaFile(m.racine)}`]);
    expect(r.file).toBe(`repart après l'entrée de essai-7 (${ANCIENNE} → ${INSTALLEE})`);
  });

  it('a queue whose view carries no version (started before the field) is signalled, its version read « inconnue »', async () => {
    const m = monde();
    m.etat.vue = { enCours: 'essai-3', attente: [] };
    const r = await installer(m.options);
    expect(relances(m.journal)).toHaveLength(1);
    expect(r.file).toBe(`repart après l'entrée de essai-3 (inconnue → ${INSTALLEE})`);
  });

  it('a queue of the installed version is never signalled, whatever its entries', async () => {
    const m = monde();
    m.etat.vue = { enCours: 'essai-1', attente: ['essai-2'], version: INSTALLEE };
    const r = await installer(m.options);
    expect(relances(m.journal)).toEqual([]);
    expect(r.file).toBe('aucune');
  });

  it('a queue of the installed version is not signalled even when units changed at this pass', async () => {
    const m = monde();
    m.etat.vue = { enCours: null, attente: [], version: INSTALLEE };
    const r = await installer(m.options);
    expect(r.appliquees.length).toBeGreaterThan(0);
    expect(relances(m.journal)).toEqual([]);
    expect(r.file).toBe('aucune');
    expect(texteDeLInstallation(r)).not.toContain('repartie');
    expect(texteDeLInstallation(r)).not.toContain('repart après');
  });

  it('a project without a queue in flight signals nothing and starts none: the report says none', async () => {
    const m = monde();
    m.etat.vue = null;
    const r = await installer(m.options);
    expect(relances(m.journal)).toEqual([]);
    expect(r.file).toBe('aucune');
    expect(m.journal.filter(j => j.startsWith('vue'))).toEqual([`vue ${idDeLaFile(m.racine)}`]);
  });

  it('a server that does not answer: the installation succeeds, nothing is signalled, the report says none', async () => {
    const m = monde();
    m.etat.vue = 'injoignable';
    const r = await installer(m.options);
    expect(relances(m.journal)).toEqual([]);
    expect(r.file).toBe('aucune');
    expect(r.appliquees.length).toBeGreaterThan(0);
  });

  it('the queue is signalled when the server unit is deferred by a circuit in flight', async () => {
    const m = monde();
    m.etat.circuits = ['essai-1'];
    m.etat.vue = { enCours: null, attente: [], version: ANCIENNE };
    const r = await installer(m.options);
    expect(r.serveurDiffere).toEqual(['essai-1']);
    expect(relances(m.journal)).toEqual([`relancer ${idDeLaFile(m.racine)}`]);
    expect(r.file).toBe(`repartie (${ANCIENNE} → ${INSTALLEE})`);
  });

  it('the report carries the version of the queue and the version installed', async () => {
    const m = monde();
    m.etat.vue = { enCours: null, attente: [], version: ANCIENNE };
    const r = await installer(m.options);
    expect(r.versionDeLaFile).toBe(ANCIENNE);
    expect(r.versionInstallee).toBe(INSTALLEE);
  });

  it('the report says « inconnue » for the version of a queue that carries none', async () => {
    const m = monde();
    m.etat.vue = { enCours: null, attente: [] };
    const r = await installer(m.options);
    expect(r.versionDeLaFile).toBe('inconnue');
    expect(r.versionInstallee).toBe(INSTALLEE);
  });
});

describe('the installed version the queue is compared to', () => {
  it('is that of the package the project names by grillhouse.outil, read in its package.json', async () => {
    const m = monde();
    writeFileSync(
      path.join(m.racine, 'package.json'),
      '{\n  "name": "essai",\n  "grillhouse": { "outil": "0.9.0" }\n}\n'
    );
    const { travailleur: _ignore, ...sans } = m.options;
    const cache = dossier('outils');
    paquetDe('0.9.0', path.join(cache, 'node_modules/@roomi-fields/grillhouse'));
    m.etat.vue = { enCours: null, attente: [], version: ANCIENNE };
    const r = await installer({ ...sans, outil: () => cache });
    expect(r.versionInstallee).toBe('0.9.0');
    expect(r.file).toBe(`repartie (${ANCIENNE} → 0.9.0)`);
  });

  it('is the same on both sides: a queue that says the installed version is left alone', async () => {
    const m = monde('3.4.5');
    m.etat.vue = { enCours: null, attente: [], version: '3.4.5' };
    const r = await installer(m.options);
    expect(relances(m.journal)).toEqual([]);
    expect(r.versionInstallee).toBe('3.4.5');
  });
});

describe('the worker of the project restarted before the signal when this pass did not', () => {
  it('an up to date installation with a queue of another version restarts the worker unit, then signals', async () => {
    const m = monde();
    await installer(m.options);
    m.journal.length = 0;
    m.etat.vue = { enCours: null, attente: [], version: ANCIENNE };
    const r = await installer(m.options);
    expect(r.appliquees).toEqual([]);
    const unite = uniteDuProjet(m.racine);
    const redemarrage = m.journal.findIndex(
      j => j.startsWith('systemctl restart') && j.includes(unite)
    );
    const signal = m.journal.findIndex(j => j.startsWith('relancer'));
    expect(redemarrage).toBeGreaterThanOrEqual(0);
    expect(signal).toBeGreaterThan(redemarrage);
    expect(r.file).toBe(`repartie (${ANCIENNE} → ${INSTALLEE})`);
    expect(r.change).toBe(true);
  });

  it('a pass that already restarted the worker unit does not restart it a second time', async () => {
    const m = monde();
    m.etat.vue = { enCours: null, attente: [], version: ANCIENNE };
    const r = await installer(m.options);
    expect(r.appliquees).toContain(uniteDuProjet(m.racine));
    expect(redemarrages(m.journal)).toHaveLength(1);
  });

  it('a queue of the installed version leaves the worker alone at an up to date pass', async () => {
    const m = monde();
    await installer(m.options);
    m.journal.length = 0;
    m.etat.vue = { enCours: null, attente: [], version: INSTALLEE };
    await installer(m.options);
    expect(redemarrages(m.journal)).toEqual([]);
  });
});

describe('the queue at each pass of the installation, up to date included', () => {
  it('an up to date installation with a queue of another version signals it and reports a change', async () => {
    const m = monde();
    await installer(m.options);
    m.journal.length = 0;
    m.etat.vue = { enCours: null, attente: [], version: ANCIENNE };
    const r = await installer(m.options);
    expect(r.appliquees).toEqual([]);
    expect(relances(m.journal)).toEqual([`relancer ${idDeLaFile(m.racine)}`]);
    expect(r.file).toBe(`repartie (${ANCIENNE} → ${INSTALLEE})`);
    expect(r.change).toBe(true);
  });

  it('an up to date installation with a queue of the installed version says nothing of the queue and changes nothing', async () => {
    const m = monde();
    await installer(m.options);
    m.etat.vue = { enCours: null, attente: [], version: INSTALLEE };
    const r = await installer(m.options);
    expect(r.file).toBe('aucune');
    expect(r.change).toBe(false);
    expect(texteDeLInstallation(r)).toBe('temporal : l’installation est à jour, rien ne change.\n');
  });

  it('a queue relaunched is not relaunched at the next pass once it says the installed version', async () => {
    const m = monde();
    m.etat.vue = { enCours: null, attente: [] };
    await installer(m.options);
    expect(relances(m.journal)).toHaveLength(1);
    m.etat.vue = { enCours: null, attente: [], version: INSTALLEE };
    const r = await installer(m.options);
    expect(relances(m.journal)).toHaveLength(1);
    expect(r.file).toBe('aucune');
  });

  it('a signal lost is made up at the next pass', async () => {
    const m = monde();
    m.etat.vue = { enCours: null, attente: [], version: ANCIENNE };
    m.etat.echecDuSignal = true;
    await installer(m.options);
    expect(relances(m.journal)).toHaveLength(1);
    m.etat.echecDuSignal = false;
    const r = await installer(m.options);
    expect(relances(m.journal)).toHaveLength(2);
    expect(r.file).toBe(`repartie (${ANCIENNE} → ${INSTALLEE})`);
  });
});

describe('the line of the command says what became of the queue', () => {
  const rapport = {
    programme: '/p/temporal',
    pose: false,
    unites: [],
    appliquees: ['a.service'],
    change: true,
  };

  it('a queue restarted at rest: the line says « repartie » with both versions', () => {
    const t = texteDeLInstallation({
      ...rapport,
      file: `repartie (${ANCIENNE} → ${INSTALLEE})`,
      versionDeLaFile: ANCIENNE,
      versionInstallee: INSTALLEE,
    });
    expect(t).toContain(`file : repartie (${ANCIENNE} → ${INSTALLEE})`);
  });

  it('a queue that restarts after its entry: the line names the ticket and both versions', () => {
    const t = texteDeLInstallation({
      ...rapport,
      file: `repart après l'entrée de essai-7 (inconnue → ${INSTALLEE})`,
      versionDeLaFile: 'inconnue',
      versionInstallee: INSTALLEE,
    });
    expect(t).toContain(`repart après l'entrée de essai-7 (inconnue → ${INSTALLEE})`);
  });

  it('an up to date installation with a queue restarted is no longer the « rien ne change » line', () => {
    const t = texteDeLInstallation({
      ...rapport,
      appliquees: [],
      change: true,
      file: `repartie (${ANCIENNE} → ${INSTALLEE})`,
      versionDeLaFile: ANCIENNE,
      versionInstallee: INSTALLEE,
    });
    expect(t).not.toContain('rien ne change');
    expect(t).toContain('repartie');
  });
});
