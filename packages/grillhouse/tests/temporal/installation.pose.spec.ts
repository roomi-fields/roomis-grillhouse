// grillhouse-4nr.2, criteria 1 and 7: the installation laid down from an archive of trial, a
// stand-in of the program `temporal` packed by tar, its sum pinned by the test: the program under
// the cache of the home, the units of the account written, systemd told, the variable TEMPORAL
// declared in `grillhouse.outils` of the project's package.json; played again on an installation
// up to date, it changes nothing; a systemctl that failed is played again at the next run, the
// units it did not apply applied then; the program laid down alone, for the CI, writes no unit and
// tells no systemd. Everything under a trial home and a trial directory of units,
// systemctl a stand-in: no test touches the account's systemd.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cheminsDe,
  installer,
  lieuxDe,
  poserLeProgramme,
  UNITE_DE_LA_MACHINE,
  UNITE_DU_SERVEUR,
  uniteDuProjet,
} from '../../src/temporal/installation.js';
import { cacheDesOutils } from '../../scripts/aiguillage.mjs';
import { dossier } from './essai.js';

// An archive of trial as the release packs it: LICENSE and the program `temporal`, a script that
// says its version.
function archive(version: string): Buffer {
  const d = dossier('archive');
  writeFileSync(path.join(d, 'LICENSE'), 'MIT\n');
  writeFileSync(path.join(d, 'temporal'), `#!/bin/sh\necho "temporal version ${version}"\n`);
  chmodSync(path.join(d, 'temporal'), 0o755);
  const f = path.join(d, 'temporal.tar.gz');
  const r = spawnSync('tar', ['-czf', f, '-C', d, 'LICENSE', 'temporal']);
  expect(r.status, r.stderr?.toString()).toBe(0);
  return readFileSync(f);
}

const somme = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('the installation from an archive whose sum is the pinned one', () => {
  const contenu = archive('0.0.1');
  const epingle = { version: '0.0.1', sommes: { linux_amd64: somme(contenu) } };
  const racine = dossier('projet');
  writeFileSync(path.join(racine, 'package.json'), '{\n  "name": "essai"\n}\n');
  const l = lieuxDe({ maison: dossier('maison'), unites: dossier('unites'), racine });
  const obtenus: string[] = [];
  const obtenir = (url: string) => (obtenus.push(url), Promise.resolve(contenu));
  const appels: string[][] = [];
  const systemctl = (args: string[]) => (appels.push(args), { status: 0, stdout: '', stderr: '' });
  const options = {
    lieux: l,
    epingle,
    plateforme: 'linux_amd64' as const,
    obtenir,
    systemctl,
    node: '/usr/bin/node',
    travailleur: '/paquet/dist/temporal/travailleur.js',
    trouver: (nom: string) => `/compte/bin/${nom}`,
  };
  const unites = [UNITE_DU_SERVEUR, uniteDuProjet(racine), UNITE_DE_LA_MACHINE];

  it('lays the program down, executable, writes the units, tells systemd and declares nothing in the package.json', async () => {
    const r = await installer(options);
    const { programme, donnees } = cheminsDe(l, '0.0.1');
    expect(r.change).toBe(true);
    expect(obtenus).toHaveLength(1);
    expect(statSync(programme).mode & 0o111).not.toBe(0);
    expect(spawnSync(programme, ['--version']).stdout.toString()).toBe('temporal version 0.0.1\n');
    for (const u of unites) {
      expect(readFileSync(path.join(l.unites, u), 'utf8'), u).toContain('[Service]');
    }
    expect(statSync(path.dirname(donnees)).isDirectory()).toBe(true);
    expect(appels).toEqual([['daemon-reload'], ['enable', ...unites], ['restart', ...unites]]);
    // The package.json is not written: TEMPORAL is not declared there, and the report has no tool.
    expect(readFileSync(path.join(racine, 'package.json'), 'utf8')).toBe(
      '{\n  "name": "essai"\n}\n'
    );
    expect(r).not.toHaveProperty('outil');
    // The worker's unit names the PATH of the account's tools and TEMPORAL, the program laid down.
    const travail = readFileSync(path.join(l.unites, uniteDuProjet(racine)), 'utf8');
    expect(travail).toContain('Environment=PATH=/usr/bin:/compte/bin:/usr/local/bin:/bin\n');
    expect(travail).toContain(`Environment=TEMPORAL=${programme}\n`);
    expect(readFileSync(path.join(l.unites, UNITE_DU_SERVEUR), 'utf8')).toContain(
      '--retention 720h'
    );
  });

  it('played again on an installation up to date, changes nothing', async () => {
    const fichiers = [
      cheminsDe(l, '0.0.1').programme,
      path.join(racine, 'package.json'),
      ...unites.map(u => path.join(l.unites, u)),
    ];
    const avant = fichiers.map(f => [f, statSync(f).mtimeMs, readFileSync(f, 'utf8')]);
    appels.length = 0;
    const r = await installer(options);
    expect(r.change).toBe(false);
    expect(obtenus).toHaveLength(1);
    expect(appels).toEqual([]);
    expect(fichiers.map(f => [f, statSync(f).mtimeMs, readFileSync(f, 'utf8')])).toEqual(avant);
  });
});

describe('a systemctl that fails is played again at the next run', () => {
  const contenu = archive('0.0.2');
  const epingle = { version: '0.0.2', sommes: { linux_amd64: somme(contenu) } };
  const racine = dossier('projet');
  writeFileSync(path.join(racine, 'package.json'), '{\n  "name": "reprise"\n}\n');
  const l = lieuxDe({ maison: dossier('maison'), unites: dossier('unites'), racine });
  const unites = [UNITE_DU_SERVEUR, uniteDuProjet(racine), UNITE_DE_LA_MACHINE];
  const appels: string[][] = [];
  let enPanne = true;
  const systemctl = (args: string[]) => {
    appels.push(args);
    return enPanne
      ? { status: 1, stdout: '', stderr: 'Failed to connect to bus' }
      : { status: 0, stdout: '', stderr: '' };
  };
  const options = {
    lieux: l,
    epingle,
    plateforme: 'linux_amd64' as const,
    obtenir: () => Promise.resolve(contenu),
    systemctl,
    node: '/usr/bin/node',
    travailleur: '/paquet/dist/temporal/travailleur.js',
    trouver: (nom: string) => `/compte/bin/${nom}`,
  };

  it('fails, the units written and not applied', async () => {
    await expect(installer(options)).rejects.toThrow(
      /daemon-reload échoue \(1\) : Failed to connect/
    );
    for (const u of unites) {
      expect(existsSync(path.join(l.unites, u)), u).toBe(true);
    }
    expect(appels).toEqual([['daemon-reload']]);
  });

  it('the next run, its units unchanged, applies them all', async () => {
    enPanne = false;
    appels.length = 0;
    const r = await installer(options);
    expect(r.unites).toEqual([]);
    expect(r.appliquees).toEqual(unites);
    expect(r.change).toBe(true);
    expect(appels).toEqual([['daemon-reload'], ['enable', ...unites], ['restart', ...unites]]);
  });

  it('the run after, everything applied, changes nothing', async () => {
    appels.length = 0;
    const r = await installer(options);
    expect(r.change).toBe(false);
    expect(appels).toEqual([]);
  });
});

describe('every refusal comes before any writing', () => {
  it('a tool of the account not found is refused by its name: no program, no unit, the package.json as it was', async () => {
    const contenu = archive('0.0.4');
    const racine = dossier('projet');
    const avant = '{\n  "name": "sans-outil"\n}\n';
    writeFileSync(path.join(racine, 'package.json'), avant);
    const l = lieuxDe({ maison: dossier('maison'), unites: dossier('unites'), racine });
    const appels: string[][] = [];
    await expect(
      installer({
        lieux: l,
        epingle: { version: '0.0.4', sommes: { linux_amd64: somme(contenu) } },
        plateforme: 'linux_amd64',
        obtenir: () => Promise.resolve(contenu),
        systemctl: args => (appels.push(args), { status: 0, stdout: '', stderr: '' }),
        node: '/usr/bin/node',
        travailleur: '/paquet/dist/temporal/travailleur.js',
        trouver: nom => (nom === 'claude' ? null : `/compte/bin/${nom}`),
      })
    ).rejects.toThrow("temporal : l'outil claude est introuvable dans PATH");
    expect(existsSync(cheminsDe(l, '0.0.4').programme)).toBe(false);
    expect(readdirSync(l.maison)).toEqual([]);
    expect(readdirSync(l.unites)).toEqual([]);
    expect(readFileSync(path.join(racine, 'package.json'), 'utf8')).toBe(avant);
    expect(appels).toEqual([]);
  });
});

describe('the other refusals come before any writing too', () => {
  // An installation on the project whose package.json is <pkg>, the published version laid down
  // by <poser> in its folder of the cache of the trial home: the refusal and the places.
  async function refus(pkg: object, poser?: (dossier: string) => string) {
    const contenu = archive('0.0.6');
    const racine = dossier('projet');
    const avant = `${JSON.stringify(pkg, null, 2)}\n`;
    writeFileSync(path.join(racine, 'package.json'), avant);
    const l = lieuxDe({ maison: dossier('maison'), unites: dossier('unites'), racine });
    const appels: string[][] = [];
    const e = await installer({
      lieux: l,
      epingle: { version: '0.0.6', sommes: { linux_amd64: somme(contenu) } },
      plateforme: 'linux_amd64',
      obtenir: () => Promise.resolve(contenu),
      systemctl: args => (appels.push(args), { status: 0, stdout: '', stderr: '' }),
      node: '/usr/bin/node',
      trouver: nom => `/compte/bin/${nom}`,
      ...(poser ? { outil: (v: string) => poser(path.join(cacheDesOutils(l.maison), v)) } : {}),
    }).then(
      () => null,
      (x: unknown) => x as Error
    );
    expect(existsSync(cheminsDe(l, '0.0.6').programme)).toBe(false);
    expect(readdirSync(l.unites)).toEqual([]);
    expect(readFileSync(path.join(racine, 'package.json'), 'utf8')).toBe(avant);
    expect(appels).toEqual([]);
    return { e, l };
  }

  it('a fault of grillhouse.outils is refused by its key: nothing written', async () => {
    const { e, l } = await refus({ name: 'faute', grillhouse: { outils: 'pas un objet' } });
    expect(e?.message).toBe(
      'temporal : la clé grillhouse.outils vaut "pas un objet", pas un objet { VARIABLE: chemin }.'
    );
    expect(readdirSync(l.maison)).toEqual([]);
  });

  it('a published version without a worker is refused: only that version lies, in its cache', async () => {
    const { e, l } = await refus({ name: 'version', grillhouse: { outil: '9.9.7' } }, dossier => {
      // The version laid down in its cache, without a worker.
      mkdirSync(dossier, { recursive: true });
      return dossier;
    });
    expect(e?.message).toMatch(/@roomi-fields\/grillhouse@9\.9\.7, .*ne porte pas de travailleur/);
    expect(readdirSync(l.maison)).toEqual(['.cache']);
    expect(readdirSync(path.join(l.maison, '.cache'))).toEqual(['grillhouse']);
    expect(readdirSync(path.join(l.maison, '.cache/grillhouse'))).toEqual(['outil']);
  });
});

// --maison covers the cache of the published versions of the frame: the worker of the version a
// project names is looked for, and laid down, under the trial home, never under the account's.
describe('the published version of the frame under --maison', () => {
  it('runs the worker of the version the project names, from the cache of the trial home', async () => {
    const contenu = archive('0.0.5');
    const racine = dossier('projet');
    writeFileSync(
      path.join(racine, 'package.json'),
      JSON.stringify({ name: 'outille', grillhouse: { outil: '9.9.8' } })
    );
    const maison = dossier('maison');
    const paquet = path.join(
      maison,
      '.cache/grillhouse/outil/9.9.8/node_modules/@roomi-fields/grillhouse'
    );
    const travailleur = path.join(paquet, 'dist/temporal/travailleur.js');
    for (const f of [travailleur, path.join(paquet, 'bin/grillhouse.mjs')]) {
      mkdirSync(path.dirname(f), { recursive: true });
      writeFileSync(f, '');
    }
    const l = lieuxDe({ maison, unites: dossier('unites'), racine });
    await installer({
      lieux: l,
      epingle: { version: '0.0.5', sommes: { linux_amd64: somme(contenu) } },
      plateforme: 'linux_amd64',
      obtenir: () => Promise.resolve(contenu),
      systemctl: () => ({ status: 0, stdout: '', stderr: '' }),
      node: '/usr/bin/node',
      trouver: nom => `/compte/bin/${nom}`,
    });
    expect(readFileSync(path.join(l.unites, uniteDuProjet(racine)), 'utf8')).toContain(
      `ExecStart=/usr/bin/node ${travailleur} --file`
    );
  });
});

describe('a package.json that already carries grillhouse.outils.TEMPORAL', () => {
  it('is not rewritten, and the worker’s unit takes the program laid down, not the key’s value', async () => {
    const contenu = archive('0.0.7');
    const racine = dossier('projet');
    const avant = `${JSON.stringify(
      { name: 'garde', grillhouse: { outils: { TEMPORAL: '/ailleurs/temporal' } } },
      null,
      2
    )}\n`;
    writeFileSync(path.join(racine, 'package.json'), avant);
    const l = lieuxDe({ maison: dossier('maison'), unites: dossier('unites'), racine });
    const r = await installer({
      lieux: l,
      epingle: { version: '0.0.7', sommes: { linux_amd64: somme(contenu) } },
      plateforme: 'linux_amd64',
      obtenir: () => Promise.resolve(contenu),
      systemctl: () => ({ status: 0, stdout: '', stderr: '' }),
      node: '/usr/bin/node',
      travailleur: '/paquet/dist/temporal/travailleur.js',
      trouver: nom => `/compte/bin/${nom}`,
    });
    expect(readFileSync(path.join(racine, 'package.json'), 'utf8')).toBe(avant);
    const travail = readFileSync(path.join(l.unites, uniteDuProjet(racine)), 'utf8');
    expect(travail).toContain(`Environment=TEMPORAL=${r.programme}\n`);
    expect(travail).not.toContain('/ailleurs/temporal');
  });

  it('keeps the other tools of the project in the unit', async () => {
    const contenu = archive('0.0.8');
    const racine = dossier('projet');
    const outil = dossier('outil');
    writeFileSync(
      path.join(racine, 'package.json'),
      JSON.stringify({ name: 'autres', grillhouse: { outils: { AUTRE: outil } } })
    );
    const l = lieuxDe({ maison: dossier('maison'), unites: dossier('unites'), racine });
    await installer({
      lieux: l,
      epingle: { version: '0.0.8', sommes: { linux_amd64: somme(contenu) } },
      plateforme: 'linux_amd64',
      obtenir: () => Promise.resolve(contenu),
      systemctl: () => ({ status: 0, stdout: '', stderr: '' }),
      node: '/usr/bin/node',
      travailleur: '/paquet/dist/temporal/travailleur.js',
      trouver: nom => `/compte/bin/${nom}`,
    });
    const travail = readFileSync(path.join(l.unites, uniteDuProjet(racine)), 'utf8');
    expect(travail).toContain(`Environment=AUTRE=${outil}\n`);
    expect(travail).toContain(`Environment=TEMPORAL=${cheminsDe(l, '0.0.8').programme}\n`);
  });
});

describe('the program laid down alone (the CI’s mode)', () => {
  it('is checked against its pinned sum and laid under the cache: no unit, no package.json', async () => {
    const contenu = archive('0.0.3');
    const l = lieuxDe({
      maison: dossier('maison'),
      unites: dossier('unites'),
      racine: dossier('vide'),
    });
    const r = await poserLeProgramme({
      lieux: l,
      epingle: { version: '0.0.3', sommes: { linux_amd64: somme(contenu) } },
      plateforme: 'linux_amd64',
      obtenir: () => Promise.resolve(contenu),
    });
    expect(r).toEqual({ programme: cheminsDe(l, '0.0.3').programme, pose: true });
    expect(spawnSync(r.programme, ['--version']).stdout.toString()).toBe(
      'temporal version 0.0.3\n'
    );
    expect(readdirSync(l.unites)).toEqual([]);
    expect(readdirSync(l.racine)).toEqual([]);
    expect(readdirSync(l.maison)).toEqual(['.cache']);
  });
});
