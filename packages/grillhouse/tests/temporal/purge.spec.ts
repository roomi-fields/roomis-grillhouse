// The purge of the closed workflows past the retention, then the compaction of the database:
// the server's answers, the program `temporal`, systemctl, the compaction and the wait are
// stand-ins under a trial home: no process, no server, no account's systemd.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cheminsDe,
  EPINGLE,
  lieuxDe,
  purger,
  texteDeLaPurge,
  UNITE_DU_SERVEUR,
} from '../../src/temporal/installation.js';
import { dossier } from './essai.js';

const MAINTENANT = Date.parse('2026-11-25T08:00:00.000Z');
const REQUETE = "ExecutionStatus != 'Running' AND CloseTime < '2026-11-18T08:00:00.000Z'";

// A trial home with a database, and a journal of what the purge calls. `comptes` is what the
// server counts, one value per call, the last one repeated.
function monde(comptes: number[] = [3868, 1200, 0]) {
  const l = lieuxDe({ maison: dossier('maison'), unites: dossier('unites'), racine: dossier('p') });
  const { donnees, programme } = cheminsDe(l, EPINGLE.version);
  mkdirSync(path.dirname(donnees), { recursive: true });
  writeFileSync(donnees, 'une base');
  const journal: string[] = [];
  const commandes: string[][] = [];
  const requetes: string[] = [];
  const reste = [...comptes];
  const etat = {
    vols: [[], []] as string[][],
    suppression: 0,
    compactage: null as string | null,
    horloge: MAINTENANT,
  };
  const options = {
    lieux: l,
    maintenant: () => etat.horloge,
    attendre: (ms: number) => {
      etat.horloge += ms;
      return Promise.resolve();
    },
    circuitsEnVol: () => {
      journal.push('circuits');
      return etat.vols.shift() ?? [];
    },
    compter: (requete: string) => {
      requetes.push(requete);
      const n = reste.length > 1 ? reste.shift()! : reste[0]!;
      journal.push(`compter ${n}`);
      return Promise.resolve(n);
    },
    temporal: (p: string, args: string[]) => {
      journal.push('supprimer');
      commandes.push([p, ...args]);
      return { status: etat.suppression, stdout: '', stderr: 'refus du serveur' };
    },
    systemctl: (args: string[]) => {
      journal.push(`systemctl ${args.join(' ')}`);
      return { status: 0, stdout: '', stderr: '' };
    },
    compacter: (base: string) => {
      journal.push(`compacter ${base}`);
      if (etat.compactage) {
        throw new Error(etat.compactage);
      }
      return { avant: 4096, apres: 1024 };
    },
  };
  return { options, journal, commandes, requetes, etat, donnees, programme };
}

const ARRET = `systemctl stop ${UNITE_DU_SERVEUR}`;
const DEPART = `systemctl start ${UNITE_DU_SERVEUR}`;

describe('the purge of the closed workflows past the retention', () => {
  it('deletes by query the workflows closed more than 7 days ago, never a running one', async () => {
    const m = monde();
    await purger(m.options);
    expect(m.commandes).toEqual([
      [
        m.programme,
        'workflow',
        'delete',
        '--address',
        '127.0.0.1:7233',
        '--namespace',
        'default',
        '--query',
        REQUETE,
        '--reason',
        'grillhouse temporal purger',
        '--yes',
      ],
    ]);
  });

  it('keeps the same cutoff for every count, while the clock goes on', async () => {
    const m = monde();
    await purger(m.options);
    expect(new Set(m.requetes)).toEqual(new Set([REQUETE]));
  });

  it('compacts with the server stopped, once the server counts none left, then starts it', async () => {
    const m = monde();
    await purger(m.options);
    expect(m.journal).toEqual([
      'circuits',
      'compter 3868',
      'supprimer',
      'compter 1200',
      'compter 0',
      'circuits',
      ARRET,
      `compacter ${m.donnees}`,
      DEPART,
    ]);
  });

  it('reports the workflows deleted and the sizes before and after', async () => {
    const m = monde();
    const r = await purger(m.options);
    expect(r).toEqual({ supprimes: 3868, compactage: { avant: 4096, apres: 1024 } });
    expect(texteDeLaPurge(r)).toBe(
      'temporal : 3868 déroulés fermés au-delà de la rétention supprimés ; base compactée : 4096 octets avant, 1024 après.\n'
    );
  });

  it('deletes nothing when none is past the retention, and compacts all the same', async () => {
    const m = monde([0]);
    const r = await purger(m.options);
    expect(m.commandes).toEqual([]);
    expect(r.supprimes).toBe(0);
    expect(m.journal).toContain(`compacter ${m.donnees}`);
  });
});

describe('the purge’s refusals', () => {
  it('under a circuit in flight, names the tickets and touches nothing', async () => {
    const m = monde();
    m.etat.vols = [['grillhouse-3uv.108', 'grillhouse-4nr.2']];
    await expect(purger(m.options)).rejects.toThrow(/grillhouse-3uv\.108, grillhouse-4nr\.2/);
    expect(m.journal).toEqual(['circuits']);
  });

  it('under a circuit launched during the purge, leaves the server running', async () => {
    const m = monde();
    m.etat.vols = [[], ['grillhouse-4nr.2']];
    await expect(purger(m.options)).rejects.toThrow(/grillhouse-4nr\.2/);
    expect(m.journal.filter(j => j.startsWith('systemctl'))).toEqual([]);
  });

  it('on a deletion the server refuses, stops nothing', async () => {
    const m = monde();
    m.etat.suppression = 1;
    await expect(purger(m.options)).rejects.toThrow(/refus du serveur/);
    expect(m.journal.at(-1)).toBe('supprimer');
  });

  it('on a deletion that no longer advances, says what is left and stops nothing', async () => {
    const m = monde([10, 4]);
    await expect(purger(m.options)).rejects.toThrow(/4 déroulés restent/);
    expect(m.journal.filter(j => j.startsWith('systemctl'))).toEqual([]);
  });

  it('on a compaction that fails, starts the server again and refuses by its name', async () => {
    const m = monde();
    m.etat.compactage = 'disk I/O error';
    await expect(purger(m.options)).rejects.toThrow(/compactage.*disk I\/O error/);
    expect(m.journal.slice(-3)).toEqual([ARRET, `compacter ${m.donnees}`, DEPART]);
  });
});
