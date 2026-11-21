// The installation of the account's Temporal relaunches the queue of the project in flight
// (`file:<racine>`, src/temporal/file/deroule.ts) when it is on the former path of entering main
// (its view says `surLaPasseFinale` false, or does not say it: an old queue answers without the
// field): the queue restarts as new, at rest at once, busy after its entry under way, carrying
// those that wait. The queue is signalled after the worker restarts, at each pass, up to date
// included; a queue already new is never signalled, a project without a queue starts none, a server
// that does not answer is no queue. The report says what became of the queue, and so does the line
// of the command. Everything under a trial home and a trial directory of units, systemctl, the
// circuits and the client of the queue stand-ins: no process, no server, no account's systemd.
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
} from '../../src/temporal/installation.js';
import { dossier } from './essai.js';

const VERSION = '0.0.7';
const EPINGLE_ESSAI = { version: VERSION, sommes: { linux_amd64: '0'.repeat(64) } };

// What the stand-in of the queue's client answers to its view: a view, no queue (null), or a
// server that does not answer (a failure).
type Vue =
  { enCours: string | null; attente: string[]; surLaPasseFinale?: boolean } | null | 'injoignable';

// A trial project with the program already laid down, and a journal of what the installation calls.
function monde() {
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
    travailleur: '/paquet/dist/temporal/travailleur.js',
    trouver: (nom: string) => `/compte/bin/${nom}`,
  };
  return { racine, journal, etat, options };
}

const relances = (journal: string[]) => journal.filter(j => j.startsWith('relancer'));

describe('the queue in flight restarted by the installation', () => {
  it('an old queue at rest is signalled, once, by the id of the queue of the project', async () => {
    const m = monde();
    m.etat.vue = { enCours: null, attente: [] };
    const r = await installer(m.options);
    expect(relances(m.journal)).toEqual([`relancer ${idDeLaFile(m.racine)}`]);
    expect(r.file).toBe('repartie');
  });

  it('the queue is signalled after the worker restarted, not before', async () => {
    const m = monde();
    m.etat.vue = { enCours: null, attente: [] };
    await installer(m.options);
    const redemarrage = m.journal.findIndex(j => j.startsWith('systemctl restart'));
    expect(redemarrage).toBeGreaterThanOrEqual(0);
    expect(m.journal.findIndex(j => j.startsWith('relancer'))).toBeGreaterThan(redemarrage);
  });

  it('a busy old queue is signalled and the report says after which entry it restarts', async () => {
    const m = monde();
    m.etat.vue = { enCours: 'essai-7', attente: ['essai-8', 'essai-9'], surLaPasseFinale: false };
    const r = await installer(m.options);
    expect(relances(m.journal)).toEqual([`relancer ${idDeLaFile(m.racine)}`]);
    expect(r.file).toBe("repart après l'entrée de essai-7");
  });

  it('a queue whose view does not say its path (an old queue answers without the field) is signalled', async () => {
    const m = monde();
    m.etat.vue = { enCours: 'essai-3', attente: [] };
    const r = await installer(m.options);
    expect(relances(m.journal)).toHaveLength(1);
    expect(r.file).toBe("repart après l'entrée de essai-3");
  });

  it('a queue already on the final pass is never signalled', async () => {
    const m = monde();
    m.etat.vue = { enCours: 'essai-1', attente: ['essai-2'], surLaPasseFinale: true };
    const r = await installer(m.options);
    expect(relances(m.journal)).toEqual([]);
    expect(r.file).toBe('aucune');
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
    m.etat.vue = { enCours: null, attente: [] };
    const r = await installer(m.options);
    expect(r.serveurDiffere).toEqual(['essai-1']);
    expect(relances(m.journal)).toEqual([`relancer ${idDeLaFile(m.racine)}`]);
    expect(r.file).toBe('repartie');
  });
});

describe('the queue at each pass of the installation, up to date included', () => {
  it('an up to date installation with an old queue signals it and reports a change', async () => {
    const m = monde();
    await installer(m.options);
    m.journal.length = 0;
    m.etat.vue = { enCours: null, attente: [] };
    const r = await installer(m.options);
    expect(r.appliquees).toEqual([]);
    expect(relances(m.journal)).toEqual([`relancer ${idDeLaFile(m.racine)}`]);
    expect(r.file).toBe('repartie');
    expect(r.change).toBe(true);
  });

  it('an up to date installation with no old queue says nothing of the queue and changes nothing', async () => {
    const m = monde();
    await installer(m.options);
    m.etat.vue = { enCours: null, attente: [], surLaPasseFinale: true };
    const r = await installer(m.options);
    expect(r.file).toBe('aucune');
    expect(r.change).toBe(false);
    expect(texteDeLInstallation(r)).toBe('temporal : l’installation est à jour, rien ne change.\n');
  });

  it('a signal lost is made up at the next pass', async () => {
    const m = monde();
    m.etat.vue = { enCours: null, attente: [] };
    m.etat.echecDuSignal = true;
    await installer(m.options);
    expect(relances(m.journal)).toHaveLength(1);
    m.etat.echecDuSignal = false;
    const r = await installer(m.options);
    expect(relances(m.journal)).toHaveLength(2);
    expect(r.file).toBe('repartie');
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

  it('a queue restarted at rest: the line says « repartie »', () => {
    expect(texteDeLInstallation({ ...rapport, file: 'repartie' })).toContain('repartie');
  });

  it('a queue that restarts after its entry: the line names the ticket', () => {
    const t = texteDeLInstallation({ ...rapport, file: "repart après l'entrée de essai-7" });
    expect(t).toContain("repart après l'entrée de essai-7");
  });

  it('an up to date installation with a queue restarted is no longer the « rien ne change » line', () => {
    const t = texteDeLInstallation({
      ...rapport,
      appliquees: [],
      change: true,
      file: 'repartie',
    });
    expect(t).not.toContain('rien ne change');
    expect(t).toContain('repartie');
  });
});
