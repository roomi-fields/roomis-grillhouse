// grillhouse-4nr.2, criteria 1, 7 and 9, without a process: the pin of the program `temporal`
// (its version and the sums of its archives), the units of the account it writes (the server, the
// worker of the project, the worker of the machine, each started again by systemd, the server's
// state in a file of the machine), and the refusal of an archive whose sum differs from the pinned
// one, nothing laid down; grillhouse-4nr.12: the retention of 30 days of the server, the worker of
// the published version a project names, the PATH of the account's tools and the project's tools
// in each worker's unit. Everything under a trial home and a trial directory of units, systemctl
// a stand-in: no test touches the account's systemd, nor installs a version of the frame.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EPINGLE,
  cheminDesUnites,
  cheminsDe,
  installer,
  lieuxDe,
  plateformeDe,
  SommeRefusee,
  textesDesUnites,
  travailleurDe,
  UNITE_DE_LA_MACHINE,
  UNITE_DU_SERVEUR,
  uniteDuProjet,
  urlDeLArchive,
  valeurDeLOutil,
} from '../../src/temporal/installation.js';
import { dossier } from './essai.js';

// A trial project, its home and its directory of units, all empty.
function lieux() {
  const racine = dossier('projet');
  writeFileSync(path.join(racine, 'package.json'), '{\n  "name": "@essai/projet-un"\n}\n');
  return lieuxDe({ maison: dossier('maison'), unites: dossier('unites'), racine });
}

// A stand-in of systemctl that records its calls.
function faux() {
  const appels: string[][] = [];
  const systemctl = (args: string[]) => {
    appels.push(args);
    return { status: 0, stdout: '', stderr: '' };
  };
  return { appels, systemctl };
}

describe('the pin of the program temporal (criterion 1)', () => {
  it('names an exact version and the sum of the archive of each platform of the machine', () => {
    expect(EPINGLE.version).toBe('1.9.1');
    expect(EPINGLE.sommes.linux_amd64).toBe(
      '09a0326a51db84d02735e53542b9ebd8c4758daf47482a9ab0abce15844e60d5'
    );
    for (const s of Object.values(EPINGLE.sommes)) {
      expect(s).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('downloads the archive of its release from the project’s releases', () => {
    expect(urlDeLArchive('1.9.1', 'linux_amd64')).toBe(
      'https://github.com/temporalio/cli/releases/download/v1.9.1/temporal_cli_1.9.1_linux_amd64.tar.gz'
    );
  });

  it('knows the platform of Node’s names, and refuses one it has no sum for, by its name', () => {
    expect(plateformeDe('linux', 'x64')).toBe('linux_amd64');
    expect(plateformeDe('darwin', 'arm64')).toBe('darwin_arm64');
    expect(() => plateformeDe('sunos', 'x64')).toThrow(/sunos/);
  });

  it('lays the program under the cache of the home, its version in the path', () => {
    const l = lieux();
    expect(cheminsDe(l, '1.9.1').programme).toBe(
      path.join(l.maison, '.cache/grillhouse/temporal/1.9.1/temporal')
    );
  });
});

describe('the value of TEMPORAL in grillhouse.outils', () => {
  it('is written under ~ when the program lies under the home, so that it holds on every machine', () => {
    expect(valeurDeLOutil('/home/x/.cache/grillhouse/temporal/1.9.1/temporal', '/home/x')).toBe(
      '~/.cache/grillhouse/temporal/1.9.1/temporal'
    );
  });

  it('is the absolute path when the program lies out of the home', () => {
    expect(valeurDeLOutil('/opt/temporal/temporal', '/home/x')).toBe('/opt/temporal/temporal');
    expect(valeurDeLOutil('/home/xy/temporal', '/home/x')).toBe('/home/xy/temporal');
  });
});

describe('the units of the account (criterion 9)', () => {
  const l = lieux();
  const textes = textesDesUnites(l, {
    version: '1.9.1',
    node: '/usr/bin/node',
    travailleur: '/paquet/dist/temporal/travailleur.js',
    chemin: '/usr/bin:/compte/bin:/usr/local/bin:/bin',
    outils: { TEMPORAL: '/maison/.cache/grillhouse/temporal/1.9.1/temporal', AUTRE: '/un outil/x' },
  });

  it('are three: the server, the worker of the project, the worker of the machine', () => {
    expect(Object.keys(textes).sort()).toEqual(
      [UNITE_DU_SERVEUR, uniteDuProjet(l.racine), UNITE_DE_LA_MACHINE].sort()
    );
    expect(uniteDuProjet(l.racine)).toBe('grillhouse-travailleur-essai-projet-un.service');
  });

  it('each starts its service again by itself', () => {
    for (const [n, t] of Object.entries(textes)) {
      expect(t, n).toMatch(/^Restart=always$/m);
      expect(t, n).toMatch(/^WantedBy=default\.target$/m);
    }
  });

  it('the server serves the loopback only, its state in a file under ~/.local/share', () => {
    const t = textes[UNITE_DU_SERVEUR]!;
    const { programme, donnees } = cheminsDe(l, '1.9.1');
    expect(donnees).toBe(path.join(l.maison, '.local/share/grillhouse/temporal/temporal.db'));
    expect(t).toContain(`ExecStart=${programme} server start-dev --db-filename ${donnees}`);
    expect(t).toMatch(/--ip 127\.0\.0\.1 /);
    expect(t).toContain('--search-attribute GrillhouseTicket=Keyword');
    expect(t).toContain('--search-attribute GrillhouseEtape=Keyword');
  });

  it('each worker runs the worker of the frame on its task queue, after the server', () => {
    const p = textes[uniteDuProjet(l.racine)]!;
    expect(p).toContain(
      'ExecStart=/usr/bin/node /paquet/dist/temporal/travailleur.js --file grillhouse-projet-essai-projet-un'
    );
    expect(p).toContain(`WorkingDirectory=${l.racine}`);
    expect(p).toMatch(new RegExp(`^After=${UNITE_DU_SERVEUR}$`, 'm'));
    const m = textes[UNITE_DE_LA_MACHINE]!;
    expect(m).toContain(
      'ExecStart=/usr/bin/node /paquet/dist/temporal/travailleur.js --file grillhouse-machine'
    );
    expect(m).toMatch(new RegExp(`^After=${UNITE_DU_SERVEUR}$`, 'm'));
  });

  it('the server keeps a closed workflow 30 days, set once it answers at each start', () => {
    const t = textes[UNITE_DU_SERVEUR]!;
    const { programme } = cheminsDe(l, '1.9.1');
    const post = t.split('\n').find(x => x.startsWith('ExecStartPost='));
    expect(post).toContain('/bin/sh -c');
    expect(post).toContain(
      `'${programme}' operator namespace update --namespace default --retention 720h --address 127.0.0.1:7233`
    );
    // systemd reads `$$` as `$`: the loop counts its tries, 60 at most, one a second.
    expect(post).toContain('i=$$((i+1)); [ $$i -ge 60 ] && exit 1; sleep 1');
  });

  it('each worker runs under the PATH of the account’s tools and the tools of the project', () => {
    for (const u of [uniteDuProjet(l.racine), UNITE_DE_LA_MACHINE]) {
      const t = textes[u]!;
      expect(t, u).toMatch(/^Environment=PATH=\/usr\/bin:\/compte\/bin:\/usr\/local\/bin:\/bin$/m);
      expect(t, u).toMatch(
        /^Environment=TEMPORAL=\/maison\/\.cache\/grillhouse\/temporal\/1\.9\.1\/temporal$/m
      );
      expect(t, u).toContain('Environment="AUTRE=/un outil/x"');
    }
  });
});

describe('the PATH of a worker’s unit', () => {
  it('names the folder of Node, then of each tool of the account, then the system’s, once each', () => {
    const outils: Record<string, string> = {
      node: '/nvm/bin/node',
      npm: '/nvm/bin/npm',
      claude: '/maison/.local/bin/claude',
      bd: '/maison/.local/bin/bd',
      gh: '/usr/bin/gh',
    };
    expect(cheminDesUnites('/nvm/bin/node', n => outils[n] ?? null)).toBe(
      '/nvm/bin:/maison/.local/bin:/usr/bin:/usr/local/bin:/bin'
    );
  });

  it('refuses a tool of the account it does not find, by its name', () => {
    expect(() => cheminDesUnites('/usr/bin/node', n => (n === 'bd' ? null : `/x/${n}`))).toThrow(
      "temporal : l'outil bd est introuvable dans PATH"
    );
  });
});

describe('the worker a project runs', () => {
  it('is that of the published version the project names, laid down under its folder', () => {
    const l = lieux();
    writeFileSync(
      path.join(l.racine, 'package.json'),
      JSON.stringify({ name: 'p', grillhouse: { outil: '9.9.9' } })
    );
    const outil = dossier('outil');
    const f = path.join(
      outil,
      'node_modules/@roomi-fields/grillhouse/dist/temporal/travailleur.js'
    );
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, '');
    const demandees: string[] = [];
    expect(travailleurDe(l.racine, v => (demandees.push(v), outil))).toBe(f);
    expect(demandees).toEqual(['9.9.9']);
  });

  it('refuses a published version that carries no worker, by its version', () => {
    const l = lieux();
    writeFileSync(
      path.join(l.racine, 'package.json'),
      JSON.stringify({ name: 'p', grillhouse: { outil: '0.29.0' } })
    );
    expect(() => travailleurDe(l.racine, () => dossier('sans-travailleur'))).toThrow(
      /@roomi-fields\/grillhouse@0\.29\.0, la version que nomme grillhouse\.outil, ne porte pas de travailleur/
    );
  });

  it('without a version named, is the project’s own version of the frame, else this one', () => {
    const l = lieux();
    expect(
      travailleurDe(l.racine, () => {
        throw new Error('aucune version à poser');
      })
    ).toMatch(/dist\/temporal\/travailleur\.js$/);
  });
});

describe('an archive whose sum differs from the pinned one (criterion 7)', () => {
  it('is refused: nothing laid down, no unit written, the expected and the read sums named', async () => {
    const l = lieux();
    const { appels, systemctl } = faux();
    const avant = readFileSync(path.join(l.racine, 'package.json'), 'utf8');
    const refus = await installer({
      lieux: l,
      plateforme: 'linux_amd64',
      obtenir: () => Promise.resolve(Buffer.from('pas une archive')),
      systemctl,
    }).then(
      () => null,
      (e: unknown) => e
    );
    expect(refus).toBeInstanceOf(SommeRefusee);
    const m = (refus as Error).message;
    expect(m).toContain(EPINGLE.sommes.linux_amd64);
    expect((refus as SommeRefusee).lue).toMatch(/^[0-9a-f]{64}$/);
    expect(m).toContain((refus as SommeRefusee).lue);
    expect(readdirSync(l.maison)).toEqual([]);
    expect(readdirSync(l.unites)).toEqual([]);
    expect(readFileSync(path.join(l.racine, 'package.json'), 'utf8')).toBe(avant);
    expect(appels).toEqual([]);
    expect(existsSync(cheminsDe(l, EPINGLE.version).programme)).toBe(false);
  });
});
