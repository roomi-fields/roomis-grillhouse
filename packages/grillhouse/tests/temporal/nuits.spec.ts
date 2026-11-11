// The nights of the machine under Temporal (src/temporal/nuits/), what plays without a server: the
// choice of the projects of the register (./choix.ts) on projects of trial (a git repository, the
// command of the frame, the script verifier, the marker of the last green night), the note of a
// skip in the journal of the night and in a register of trial, the options of the one schedule,
// and the call of `grillhouse nuit`. The workflow and the schedule on a server are
// ./nuits.nuit.spec.ts's.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scriptsDesSousCommandes, SOUS_COMMANDES } from '../../scripts/sous-commandes.mjs';
import { lireLAppel } from '../../src/temporal/nuits/appel.js';
import {
  choisir,
  ecartDuProjet,
  marqueurDeLaNuit,
  projetsDuRegistre,
  sautDuProjet,
} from '../../src/temporal/nuits/choix.js';
import { HEURE_PAR_DEFAUT, optionsDeLaPlanification } from '../../src/temporal/nuits/client.js';
import {
  ID_DE_LA_NUIT_PLANIFIEE,
  ID_DE_LA_PLANIFICATION,
  NUIT_PLANIFIEE,
} from '../../src/temporal/nuits/contrat.js';
import { FILE_DE_LA_MACHINE } from '../../src/temporal/installation.js';

// The trial folders, under the run's temporary directory, removed after the file's tests.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'nuits-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
let n = 0;
const dossier = (nom: string) => {
  const d = path.join(ESSAIS, `${nom}-${++n}`);
  mkdirSync(d, { recursive: true });
  return d;
};

// The register of trial, named before the activities load the register's module, which reads it.
const REGISTRE = path.join(dossier('registre'), 'registre.jsonl');
let activites: typeof import('../../src/temporal/nuits/activites.js');
beforeAll(async () => {
  process.env.GRILLHOUSE_REGISTRE = REGISTRE;
  activites = await import('../../src/temporal/nuits/activites.js');
});

const git = (racine: string, ...args: string[]) =>
  execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    encoding: 'utf8',
  }).trim();

// A project of trial whose night is wired: a repository with one commit, the command of the
// frame, the script verifier; each part left out on demand.
function projet(
  o: { commande?: boolean; verifier?: boolean; commit?: boolean; paquet?: string } = {}
) {
  const racine = dossier('projet');
  writeFileSync(
    path.join(racine, 'package.json'),
    o.paquet ??
      JSON.stringify({ scripts: o.verifier === false ? {} : { verifier: 'grillhouse verifier' } })
  );
  if (o.commande !== false) {
    mkdirSync(path.join(racine, 'node_modules/.bin'), { recursive: true });
    writeFileSync(path.join(racine, 'node_modules/.bin/grillhouse'), '#!/bin/sh\n', {
      mode: 0o755,
    });
  }
  writeFileSync(path.join(racine, '.gitignore'), 'node_modules/\n');
  git(racine, 'init', '-q', '-b', 'main');
  if (o.commit !== false) {
    git(racine, 'add', '.');
    git(racine, 'commit', '-qm', 'base');
  }
  return racine;
}

// The marker of the last green night of <racine> written to <commit>, as a green night writes it.
function nuitVerte(racine: string, commit: string) {
  const m = marqueurDeLaNuit(racine)!;
  mkdirSync(path.dirname(m), { recursive: true });
  writeFileSync(m, `${commit}\n`);
}

// A new commit on <racine>: its top moves.
function bouger(racine: string) {
  git(racine, 'commit', '-q', '--allow-empty', '-m', 'suite');
}

describe('the projects of the register', () => {
  it('names each project once, in the order of their paths, a torn line naming nothing', () => {
    const texte = [
      JSON.stringify({ projet: '/depot/b', agent: 'x' }),
      JSON.stringify({ projet: '/depot/a', agent: 'y' }),
      '{"projet": "/depot/c"',
      JSON.stringify({ projet: '/depot/b', agent: 'z' }),
      JSON.stringify({ projet: 'relatif', agent: 'w' }),
      JSON.stringify({ agent: 'sans-projet' }),
    ].join('\n');
    expect(projetsDuRegistre(texte)).toEqual(['/depot/a', '/depot/b']);
  });
});

describe('a project left out of the nights', () => {
  it('a project whose night is wired is not left out', () => {
    expect(ecartDuProjet(projet())).toBeNull();
  });
  it('is left out when its root no longer exists', () => {
    expect(ecartDuProjet(path.join(dossier('vide'), 'parti'))).toMatch(/racine n’existe plus/);
  });
  it('is left out without the command of the frame', () => {
    expect(ecartDuProjet(projet({ commande: false }))).toMatch(/node_modules\/\.bin\/grillhouse/);
  });
  it('is left out without the script verifier the night plays', () => {
    expect(ecartDuProjet(projet({ verifier: false }))).toMatch(/script verifier/);
  });
  it('is left out when its package.json does not read', () => {
    expect(ecartDuProjet(projet({ paquet: '{ "scripts": ' }))).toMatch(/package\.json/);
  });
  it('is left out without a commit', () => {
    expect(ecartDuProjet(projet({ commit: false }))).toMatch(/aucun commit/);
  });
});

describe('a project skipped by the scheduled night', () => {
  it('is skipped when its top is the commit of its last green night, the reason naming the top', () => {
    const racine = projet();
    const sommet = git(racine, 'rev-parse', 'HEAD');
    nuitVerte(racine, sommet);
    const saut = sautDuProjet(racine);
    expect(saut).toEqual({
      racine,
      raison: expect.stringContaining(sommet.slice(0, 7)) as string,
      sommet,
      reference: sommet,
    });
  });
  it('plays when its top moved since its last green night', () => {
    const racine = projet();
    nuitVerte(racine, git(racine, 'rev-parse', 'HEAD'));
    bouger(racine);
    expect(sautDuProjet(racine)).toBeNull();
  });
  it('plays without a last green night', () => {
    expect(sautDuProjet(projet())).toBeNull();
  });
  it('plays when its marker no longer reads as a commit of the repository', () => {
    const racine = projet();
    nuitVerte(racine, 'f'.repeat(40));
    expect(sautDuProjet(racine)).toBeNull();
    nuitVerte(racine, 'pas un commit');
    expect(sautDuProjet(racine)).toBeNull();
  });
  it('the green of the day does not skip: only the marker of the night counts', () => {
    const racine = projet();
    const commun = git(racine, 'rev-parse', '--path-format=absolute', '--git-common-dir');
    const sommet = git(racine, 'rev-parse', 'HEAD');
    mkdirSync(path.join(commun, 'grillhouse/dernier-vert'), { recursive: true });
    writeFileSync(
      path.join(commun, 'grillhouse/dernier-vert/main.json'),
      JSON.stringify({ commit: sommet, arbre: git(racine, 'rev-parse', 'HEAD^{tree}') })
    );
    expect(sautDuProjet(racine)).toBeNull();
  });
});

describe('the choice of a scheduled night', () => {
  it('sorts the projects in played, skipped and left out, each with its reason, in their order', () => {
    const [a, b, c] = [projet(), projet(), projet({ verifier: false })];
    nuitVerte(b, git(b, 'rev-parse', 'HEAD'));
    const parti = path.join(dossier('vide'), 'parti');
    const choix = choisir([a, b, c, parti]);
    expect(choix.jouer).toEqual([a]);
    expect(choix.sautes.map(s => s.racine)).toEqual([b]);
    expect(choix.ecartes).toEqual([
      { racine: c, raison: expect.stringMatching(/script verifier/) as string },
      { racine: parti, raison: expect.stringMatching(/racine/) as string },
    ]);
  });
  it('reads the projects of the register of the machine', async () => {
    const [a, b] = [projet(), projet()];
    writeFileSync(
      REGISTRE,
      `${[b, a, b].map(p => JSON.stringify({ projet: p, agent: p })).join('\n')}\n`
    );
    expect((await activites.choisirLesNuits()).jouer).toEqual([a, b].sort());
  });
});

describe('the note of a skip', () => {
  it('writes its reason in the journal of the night and in the register, once a day in the register', () => {
    const racine = projet();
    const sommet = git(racine, 'rev-parse', 'HEAD');
    nuitVerte(racine, sommet);
    const saut = sautDuProjet(racine)!;
    const quand = new Date(2026, 10, 12, 23, 5);
    activites.noterLeSautA(saut, quand);
    activites.noterLeSautA(saut, new Date(2026, 10, 12, 23, 40));
    const journal = path.join(path.dirname(marqueurDeLaNuit(racine)!), '2026-11-12.log');
    expect(readFileSync(journal, 'utf8')).toContain(
      `— la nuit du 2026-11-12 23:05 sur ${sommet.slice(0, 7)} : sautée, ${saut.raison} (sommet ${sommet}, référence ${sommet}).`
    );
    const lignes = readFileSync(REGISTRE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as { projet: string; role: string; nuit?: object })
      .filter(l => l.projet === racine && l.role === 'nuit');
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.nuit).toEqual({
      verdict: 'sautee',
      raison: saut.raison,
      sommet,
      reference: sommet,
    });
  });
  it('a project of the register skipped stays in the register, so it enters the next night', async () => {
    const racine = projet();
    nuitVerte(racine, git(racine, 'rev-parse', 'HEAD'));
    writeFileSync(REGISTRE, `${JSON.stringify({ projet: racine, agent: 'a' })}\n`);
    activites.noterLeSautA(sautDuProjet(racine)!, new Date());
    bouger(racine);
    expect((await activites.choisirLesNuits()).jouer).toEqual([racine]);
  });
});

describe('the one schedule of the machine', () => {
  it('fires every day at its hour, in the time zone of the machine', () => {
    const o = optionsDeLaPlanification(22, 'Europe/Paris');
    expect(o.scheduleId).toBe(ID_DE_LA_PLANIFICATION);
    expect(o.spec.calendars).toEqual([expect.objectContaining({ hour: 22, minute: 0 })]);
    expect(o.spec.timezone).toBe('Europe/Paris');
  });
  it('skips a firing while one runs, and takes a missed firing within 24 h', () => {
    const o = optionsDeLaPlanification(1, 'UTC');
    expect(o.policies).toEqual({ overlap: 'SKIP', catchupWindow: '24 hours' });
  });
  it('starts the workflow that asks for the scheduled nights, on the queue of the machine', () => {
    const o = optionsDeLaPlanification(1, 'UTC');
    expect(o.action).toMatchObject({
      type: 'startWorkflow',
      workflowType: NUIT_PLANIFIEE,
      workflowId: ID_DE_LA_NUIT_PLANIFIEE,
      taskQueue: FILE_DE_LA_MACHINE,
    });
  });
});

describe('the call of grillhouse nuit', () => {
  it('alone, plays the pass of the night', () => {
    expect(lireLAppel([])).toEqual({ quoi: 'passe' });
  });
  it('with a project, asks for its night', () => {
    expect(lireLAppel(['../autre'])).toEqual({ quoi: 'demander', projet: '../autre' });
  });
  it('--planifier creates or updates the schedule', () => {
    expect(lireLAppel(['--planifier'])).toEqual({ quoi: 'planifier', heure: null });
  });
  it('--planifier --heure gives the hour of the schedule, from 0 to 23', () => {
    expect(lireLAppel(['--planifier', '--heure', '3'])).toEqual({ quoi: 'planifier', heure: 3 });
    expect(lireLAppel(['--planifier', '--heure', '0'])).toEqual({ quoi: 'planifier', heure: 0 });
    for (const faux of [['24'], ['-1'], ['une'], []]) {
      expect(lireLAppel(['--planifier', '--heure', ...faux])).toMatchObject({ quoi: 'faute' });
    }
    expect(lireLAppel(['--planifier', '--minute', '3'])).toMatchObject({ quoi: 'faute' });
  });
  it('the hour of a new schedule is 1 h, apart from the night the bilan counts', () => {
    expect(HEURE_PAR_DEFAUT).toBe(1);
  });
  it('--help and -h give the usage', () => {
    expect(lireLAppel(['--help'])).toEqual({ quoi: 'aide' });
    expect(lireLAppel(['-h'])).toEqual({ quoi: 'aide' });
  });
  it('an unknown option, or two arguments, is a fault named', () => {
    expect(lireLAppel(['--tout'])).toEqual({
      quoi: 'faute',
      raison: expect.stringContaining('--tout') as string,
    });
    expect(lireLAppel(['a', 'b'])).toMatchObject({ quoi: 'faute' });
    expect(lireLAppel(['--help', 'a'])).toMatchObject({ quoi: 'faute' });
  });
  it('is the client of the nights, and the pass it replaces is still nuit.sh', () => {
    expect(SOUS_COMMANDES.nuit).toBe('../dist/temporal/nuits/commande.js');
    expect(scriptsDesSousCommandes(path.resolve(__dirname, '../../../..')).nuit).toBe('nuit.sh');
  });
});
