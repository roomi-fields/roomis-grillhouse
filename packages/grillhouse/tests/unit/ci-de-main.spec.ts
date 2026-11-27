// The CI of main, read after the lots entered (scripts/ci-de-main.mjs): as Google's TAP runs the
// whole suite after the submit, by batches of changes, a red looks for its culprit among the lots
// entered since the last green. The reading (`lireLaCiDeMain`), the lots (`lotsDepuisLeVert`, by
// git, no state kept), the alert to the supervisor (`alerteDeLaCiDeMain`), the line of the board
// (`ligneDeLaCiDeMain`) and the defect ticket under `a-valider` (`ouvrirLeDefautDeMain`).
//
// Small tests: gh and Beads are stand-ins in the process; the lots are read in a repository of trial.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as ciDeMain from '../../scripts/ci-de-main.mjs';

type Lecture =
  | { etat: 'verte'; commit: string; passage: string }
  | { etat: 'rouge'; flux: string; passage: string; commit: string; vert: string | null }
  | { etat: 'non-lue'; raison: string };
type Lot = { commit: string; ticket: string; titre: string };
type Reponse = { status: number; stdout: string; stderr: string; error?: Error };

const {
  lireLaCiDeMain,
  lotsDepuisLeVert,
  alerteDeLaCiDeMain,
  ligneDeLaCiDeMain,
  ouvrirLeDefautDeMain,
} = ciDeMain as unknown as {
  lireLaCiDeMain: (
    o: { racine: string; gh: (a: string[]) => Reponse },
    p?: { branche?: string }
  ) => Lecture;
  lotsDepuisLeVert: (racine: string, p: { vert: string | null; pointe: string }) => Lot[];
  alerteDeLaCiDeMain: (
    lecture: Lecture,
    lots: Lot[]
  ) => { genre: string; cle: string; texte: string } | null;
  ligneDeLaCiDeMain: (lecture: Lecture) => string;
  ouvrirLeDefautDeMain: (
    o: { racine: string; bd: (...a: string[]) => Reponse },
    lecture: Lecture,
    lots: Lot[]
  ) => { ouvert: boolean; doublon?: string; faute?: string };
};

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ci-de-main-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const VERT = 'a'.repeat(40);
const ROUGE = 'b'.repeat(40);
const ANCIEN = '1'.repeat(40);

type Passage = {
  databaseId: number;
  status: string;
  conclusion: string;
  workflowName: string;
  headSha: string;
  // The file of the flow, which gh filters on (`--workflow`) and never prints here.
  fichier: string;
};
// A pass of the flow <flux>: the flow « CI » lives in ci.yml, any other in a file of its own.
const passage = (
  id: number,
  flux: string,
  conclusion: string,
  sha: string,
  status = 'completed',
  fichier = flux === 'CI' ? 'ci.yml' : `${flux}.yml`
): Passage => ({
  databaseId: id,
  status,
  conclusion: status === 'completed' ? conclusion : '',
  workflowName: flux,
  headSha: sha,
  fichier,
});

// A stand-in for gh answering `gh run list` as GitHub does, each call kept: the passes of the flow
// `--workflow` names (by its file or its name) when it is given, every flow otherwise, newest first,
// no more than `--limit` (20 without it).
function github(passages: Passage[] | Reponse) {
  const appels: string[][] = [];
  const gh = (a: string[]): Reponse => {
    appels.push(a);
    if (!Array.isArray(passages)) {
      return passages;
    }
    const option = (nom: string) => (a.includes(nom) ? a[a.indexOf(nom) + 1] : undefined);
    const flux = option('--workflow');
    const rendus = passages
      .filter(p => !flux || p.fichier === flux || p.workflowName === flux)
      .sort((x, y) => y.databaseId - x.databaseId)
      .slice(0, Number(option('--limit') ?? 20))
      .map(({ fichier: _fichier, ...p }) => p);
    return { status: 0, stdout: JSON.stringify(rendus), stderr: '' };
  };
  return { gh, appels };
}
const lire = (p: Passage[] | Reponse, branche?: string) => {
  const g = github(p);
  return { lecture: lireLaCiDeMain({ racine: ESSAIS, gh: g.gh }, { branche }), appels: g.appels };
};

describe('la lecture de la CI de main', () => {
  it('is green when the latest finished pass of the flow CI is a success', () => {
    const { lecture } = lire([
      passage(20, 'CI', 'success', VERT),
      passage(10, 'CI', 'failure', ANCIEN),
    ]);
    expect(lecture).toEqual({ etat: 'verte', commit: VERT, passage: '20' });
  });

  it('is red when the latest finished pass of the flow CI failed, naming it, its pass, its commit and its last green', () => {
    const { lecture } = lire([
      passage(30, 'CI', 'failure', ROUGE),
      passage(12, 'CI', 'success', VERT),
    ]);
    expect(lecture).toEqual({
      etat: 'rouge',
      flux: 'CI',
      passage: '30',
      commit: ROUGE,
      vert: VERT,
    });
  });

  it('has no last green when the red workflow never succeeded', () => {
    const { lecture } = lire([passage(5, 'CI', 'failure', ROUGE)]);
    expect(lecture).toMatchObject({ etat: 'rouge', flux: 'CI', passage: '5', vert: null });
  });

  it('any conclusion but success, cancelled and skipped is red', () => {
    for (const conclusion of ['failure', 'timed_out', 'startup_failure']) {
      expect(lire([passage(7, 'CI', conclusion, ROUGE)]).lecture, conclusion).toMatchObject({
        etat: 'rouge',
      });
    }
  });

  it('a pass still under way is not judged: the one before it decides', () => {
    expect(
      lire([passage(9, 'CI', '', ROUGE, 'in_progress'), passage(8, 'CI', 'success', VERT)]).lecture
    ).toMatchObject({ etat: 'verte', commit: VERT });
    expect(
      lire([passage(9, 'CI', '', VERT, 'in_progress'), passage(8, 'CI', 'failure', ROUGE)]).lecture
    ).toMatchObject({ etat: 'rouge', passage: '8' });
  });

  it('a skipped pass judged nothing: the one before it decides', () => {
    expect(
      lire([passage(9, 'CI', 'skipped', ROUGE), passage(8, 'CI', 'success', VERT)]).lecture
    ).toMatchObject({ etat: 'verte', commit: VERT });
    expect(
      lire([passage(9, 'CI', 'skipped', VERT), passage(8, 'CI', 'failure', ROUGE)]).lecture
    ).toMatchObject({ etat: 'rouge', passage: '8' });
  });

  it('a cancelled pass (replaced by a later run, or stopped) is not red: the one before it decides', () => {
    expect(
      lire([passage(9, 'CI', 'cancelled', ROUGE), passage(8, 'CI', 'success', VERT)]).lecture
    ).toMatchObject({ etat: 'verte', commit: VERT });
  });

  it('reads the runs of the branch given, main by default', () => {
    expect(lire([passage(1, 'CI', 'success', VERT)]).appels[0]).toEqual(
      expect.arrayContaining(['run', 'list', '--branch', 'main'])
    );
    expect(lire([passage(1, 'CI', 'success', VERT)], 'develop').appels[0]).toEqual(
      expect.arrayContaining(['--branch', 'develop'])
    );
  });

  it('is not read — never silence — when gh fails, does not start, answers garbage or nothing', () => {
    const faute = { status: 1, stdout: '', stderr: 'HTTP 401: Bad credentials' };
    const l = lire(faute).lecture;
    expect(l).toMatchObject({ etat: 'non-lue' });
    expect((l as { raison: string }).raison).toContain('Bad credentials');
    expect(
      lire({ status: 0, stdout: '', stderr: '', error: new Error('ENOENT') }).lecture
    ).toMatchObject({
      etat: 'non-lue',
    });
    expect(lire({ status: 0, stdout: 'pas du json', stderr: '' }).lecture).toMatchObject({
      etat: 'non-lue',
    });
    expect(lire([]).lecture).toMatchObject({ etat: 'non-lue' });
  });
});

describe('la lecture de la CI de main ne juge que le flux CI', () => {
  const CI_VERTE = passage(8, 'CI', 'success', VERT);

  it('a red pass of another flow present on main leaves the CI green', () => {
    for (const flux of ['Nuit', 'Deploy docs', 'Release']) {
      expect(lire([passage(9, flux, 'failure', ROUGE), CI_VERTE]).lecture, flux).toEqual({
        etat: 'verte',
        commit: VERT,
        passage: '8',
      });
    }
  });

  it('a red pass started by hand of a flow since removed from main opens no red', () => {
    expect(
      lire([passage(45398057561, 'Send collection sheets', 'failure', ROUGE), CI_VERTE]).lecture
    ).toEqual({ etat: 'verte', commit: VERT, passage: '8' });
  });

  it('a red of the CI is named as such under a newer red of another flow', () => {
    const { lecture } = lire([
      passage(31, 'Nuit', 'failure', ANCIEN),
      passage(30, 'CI', 'failure', ROUGE),
      passage(29, 'Nuit', 'success', ANCIEN),
      passage(12, 'CI', 'success', VERT),
    ]);
    expect(lecture).toEqual({
      etat: 'rouge',
      flux: 'CI',
      passage: '30',
      commit: ROUGE,
      vert: VERT,
    });
  });

  it('the green of another flow is no last green of the CI', () => {
    expect(
      lire([passage(9, 'CI', 'failure', ROUGE), passage(8, 'Nuit', 'success', VERT)]).lecture
    ).toMatchObject({ etat: 'rouge', flux: 'CI', vert: null });
  });

  it('the passes of other flows, however many, do not push the CI out of the reading', () => {
    const autres = Array.from({ length: 150 }, (_, i) =>
      passage(1000 + i, 'Nuit', 'success', VERT)
    );
    expect(lire([...autres, passage(9, 'CI', 'failure', ROUGE)]).lecture).toMatchObject({
      etat: 'rouge',
      passage: '9',
    });
  });

  it('the flow CI is known by its file ci.yml, whatever name GitHub gives it', () => {
    const nom = '.github/workflows/ci.yml';
    expect(lire([passage(9, nom, 'failure', ROUGE, 'completed', 'ci.yml')]).lecture).toMatchObject({
      etat: 'rouge',
      flux: nom,
      passage: '9',
    });
  });

  it('is not read without a finished pass of the flow CI, whatever the other flows did', () => {
    const autres = [
      passage(20, 'Nuit', 'failure', ROUGE),
      passage(19, 'Deploy docs', 'success', VERT),
    ];
    const sansFini = [
      [],
      [passage(21, 'CI', '', ROUGE, 'in_progress')],
      [passage(21, 'CI', 'cancelled', ROUGE), passage(18, 'CI', 'skipped', ROUGE)],
    ];
    for (const ci of sansFini) {
      expect(lire([...ci, ...autres]).lecture).toEqual({
        etat: 'non-lue',
        raison: 'aucun passage fini de la CI sur main.',
      });
    }
  });
});

// A repository of trial: a base, then commits whose subjects are the circuit’s (« … (ticket) ») or not.
function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  let n = 0;
  const commit = (sujet: string) => {
    writeFileSync(path.join(racine, `f${n++}.txt`), `${sujet}\n`);
    git('add', '-A');
    git('commit', '-qm', sujet);
    return git('rev-parse', 'HEAD');
  };
  return { racine, git, commit };
}

describe('les lots entrés depuis le dernier vert, calculés par git', () => {
  it('names the commits of the circuit between the last green and the tip, oldest first', () => {
    const d = depot();
    const vert = d.commit('base');
    const a = d.commit('feat(@x/y): un sujet (demo-1.2)');
    d.commit('chore: à la main, hors du circuit');
    const b = d.commit('fix(@x/z): un autre sujet (demo-7)');
    const lots = lotsDepuisLeVert(d.racine, { vert, pointe: b });
    expect(lots.map(l => [l.commit, l.ticket])).toEqual([
      [a, 'demo-1.2'],
      [b, 'demo-7'],
    ]);
    expect(lots[0]!.titre).toContain('un sujet');
  });

  it('is empty at the last green itself, and without a last green', () => {
    const d = depot();
    const vert = d.commit('feat: déjà vert (demo-1)');
    expect(lotsDepuisLeVert(d.racine, { vert, pointe: vert })).toEqual([]);
    expect(lotsDepuisLeVert(d.racine, { vert: null, pointe: vert })).toEqual([]);
  });

  it('is empty when the last green is no ancestor of the tip (a history rewritten) or unknown', () => {
    const d = depot();
    d.commit('base');
    const pointe = d.commit('feat: lot (demo-3)');
    expect(lotsDepuisLeVert(d.racine, { vert: 'f'.repeat(40), pointe })).toEqual([]);
  });

  it('keeps no state: the same question twice gives the same lots', () => {
    const d = depot();
    const vert = d.commit('base');
    const pointe = d.commit('feat: lot (demo-3)');
    expect(lotsDepuisLeVert(d.racine, { vert, pointe })).toEqual(
      lotsDepuisLeVert(d.racine, { vert, pointe })
    );
  });
});

const lot = (ticket: string): Lot => ({
  commit: 'c'.repeat(40),
  ticket,
  titre: `feat: sujet (${ticket})`,
});
const ROUGEE: Lecture = {
  etat: 'rouge',
  flux: 'CI',
  passage: '4242',
  commit: ROUGE,
  vert: VERT,
};

describe('l’alerte de la CI de main', () => {
  it('a red names the workflow, its pass, its commit and each lot entered since the last green', () => {
    const a = alerteDeLaCiDeMain(ROUGEE, [lot('demo-1'), lot('demo-2')])!;
    expect(a.genre).toBe('rouge');
    expect(a.cle).toContain('4242');
    for (const mot of ['CI', '4242', ROUGE.slice(0, 7), 'demo-1', 'demo-2']) {
      expect(a.texte, mot).toContain(mot);
    }
  });

  it('a red with no lot of the circuit since the last green says so, without a last green too', () => {
    expect(alerteDeLaCiDeMain(ROUGEE, [])!.texte).toMatch(/aucun lot/);
    expect(alerteDeLaCiDeMain({ ...ROUGEE, vert: null } as Lecture, [])!.texte).toMatch(
      /aucun vert/
    );
  });

  it('a CI not read is the alert « CI de main non lue », with its reason', () => {
    const a = alerteDeLaCiDeMain({ etat: 'non-lue', raison: 'gh ne se lance pas (ENOENT).' }, [])!;
    expect(a.genre).toBe('non-lue');
    expect(a.texte).toContain('CI de main non lue');
    expect(a.texte).toContain('ENOENT');
  });

  it('a green gives no alert: it clears', () => {
    expect(
      alerteDeLaCiDeMain({ etat: 'verte', commit: VERT, passage: '1' }, [lot('demo-1')])
    ).toBeNull();
  });

  it('two passes give two alerts, one key each', () => {
    const a = alerteDeLaCiDeMain(ROUGEE, [])!;
    const b = alerteDeLaCiDeMain({ ...ROUGEE, passage: '4243' } as Lecture, [])!;
    expect(a.cle).not.toBe(b.cle);
  });
});

describe('la ligne de la CI de main au panneau', () => {
  it('shows the last green when green', () => {
    expect(ligneDeLaCiDeMain({ etat: 'verte', commit: VERT, passage: '1' })).toBe(
      `CI de main verte (${VERT.slice(0, 7)})`
    );
  });

  it('shows a red with its workflow, its pass and its last green', () => {
    const l = ligneDeLaCiDeMain(ROUGEE);
    expect(l).toContain('CI de main rouge');
    expect(l).toContain('CI');
    expect(l).toContain('4242');
    expect(l).toContain(VERT.slice(0, 7));
    expect(ligneDeLaCiDeMain({ ...ROUGEE, vert: null } as Lecture)).toContain('aucun vert');
  });

  it('shows a CI not read as a red, its reason on one line', () => {
    const l = ligneDeLaCiDeMain({ etat: 'non-lue', raison: 'gh run list refuse :\nHTTP 401' });
    expect(l).toContain('CI de main non lue');
    expect(l).not.toContain('\n');
  });
});

type TicketBd = {
  id: string;
  title: string;
  status: string;
  labels: string[];
  description: string;
};
// A stand-in for Beads: `list` gives <existants>, `create` is kept.
function beads(
  existants: TicketBd[],
  creation: Reponse = { status: 0, stdout: 'demo-90\n', stderr: '' }
) {
  const appels: string[][] = [];
  const bd = (...a: string[]): Reponse => {
    appels.push(a);
    if (a[0] === 'list' || a[0] === 'search') {
      return { status: 0, stdout: JSON.stringify(existants), stderr: '' };
    }
    if (a[0] === 'create') {
      return creation;
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  return { bd, appels, creations: () => appels.filter(a => a[0] === 'create') };
}

describe('le défaut qu’un rouge de main ouvre pour le responsable', () => {
  it('opens one ticket under a-valider that names the red pass and the candidate lots', () => {
    const b = beads([]);
    const r = ouvrirLeDefautDeMain({ racine: ESSAIS, bd: b.bd }, ROUGEE, [
      lot('demo-1'),
      lot('demo-2'),
    ]);
    expect(r.ouvert).toBe(true);
    expect(b.creations()).toHaveLength(1);
    const ligne = b.creations()[0]!.join(' ');
    expect(ligne).toContain('a-valider');
    for (const mot of ['4242', 'CI', 'demo-1', 'demo-2', ROUGE.slice(0, 7)]) {
      expect(ligne, mot).toContain(mot);
    }
  });

  it('opens no second ticket for the same pass, closed or not, and says which holds it', () => {
    const existant: TicketBd = {
      id: 'demo-90',
      title: 'CI de main rouge — CI, passage 4242',
      status: 'closed',
      labels: ['a-valider'],
      description: 'passage 4242',
    };
    const b = beads([existant]);
    const r = ouvrirLeDefautDeMain({ racine: ESSAIS, bd: b.bd }, ROUGEE, [lot('demo-1')]);
    expect(r).toMatchObject({ ouvert: false, doublon: 'demo-90' });
    expect(b.creations()).toEqual([]);
  });

  it('opens a ticket for another pass even when one stands for an earlier pass', () => {
    const existant: TicketBd = {
      id: 'demo-90',
      title: 'CI de main rouge — CI, passage 4100',
      status: 'open',
      labels: ['a-valider'],
      description: 'passage 4100',
    };
    const b = beads([existant]);
    expect(ouvrirLeDefautDeMain({ racine: ESSAIS, bd: b.bd }, ROUGEE, []).ouvert).toBe(true);
    expect(b.creations()).toHaveLength(1);
  });

  it('opens nothing for a green or a CI not read: the alert says it, no defect is proven', () => {
    const b = beads([]);
    const o = { racine: ESSAIS, bd: b.bd };
    expect(ouvrirLeDefautDeMain(o, { etat: 'verte', commit: VERT, passage: '1' }, []).ouvert).toBe(
      false
    );
    expect(ouvrirLeDefautDeMain(o, { etat: 'non-lue', raison: 'x' }, []).ouvert).toBe(false);
    expect(b.creations()).toEqual([]);
  });

  it('a creation Beads refuses is a fault named, never a silent success', () => {
    const b = beads([], { status: 1, stdout: '', stderr: 'bd : base verrouillée' });
    const r = ouvrirLeDefautDeMain({ racine: ESSAIS, bd: b.bd }, ROUGEE, []);
    expect(r.ouvert).toBe(false);
    expect(r.faute).toContain('base verrouillée');
  });

  it('gives the number of the ticket it created, read on the output of the creation', () => {
    const b = beads([], { status: 0, stdout: 'demo-91\n', stderr: '' });
    const r = ouvrirLeDefautDeMain({ racine: ESSAIS, bd: b.bd }, ROUGEE, []);
    expect(r).toMatchObject({ ouvert: true, ticket: 'demo-91' });
  });

  it('gives the number of the ticket that already holds the pass, closed or not', () => {
    for (const status of ['open', 'closed']) {
      const b = beads([
        {
          id: 'demo-77',
          title: 'CI de main rouge — CI, passage 4242',
          status,
          labels: ['a-valider'],
          description: '',
        },
      ]);
      const r = ouvrirLeDefautDeMain({ racine: ESSAIS, bd: b.bd }, ROUGEE, []);
      expect(r, status).toMatchObject({ ouvert: false, ticket: 'demo-77' });
      expect(b.creations(), status).toEqual([]);
    }
  });

  it('a creation that succeeds without a readable number is open, with no number', () => {
    const b = beads([], { status: 0, stdout: '', stderr: '' });
    const r = ouvrirLeDefautDeMain({ racine: ESSAIS, bd: b.bd }, ROUGEE, []);
    expect(r.ouvert).toBe(true);
    expect(r.faute).toBeUndefined();
    expect(r.ticket ?? null).toBeNull();
  });

  it('finds a ticket created without a number by its title at the next opening', () => {
    const b = beads([
      {
        id: 'demo-92',
        title: 'CI de main rouge — CI, passage 4242',
        status: 'open',
        labels: ['a-valider'],
        description: '',
      },
    ]);
    const r = ouvrirLeDefautDeMain({ racine: ESSAIS, bd: b.bd }, ROUGEE, []);
    expect(r.ticket).toBe('demo-92');
    expect(b.creations()).toEqual([]);
  });
});

type Defaut = { ouvert: boolean; ticket?: string | null; faute?: string; doublon?: string };
const alerteAvec = (defaut: Defaut, lecture: Lecture = ROUGEE) =>
  (
    alerteDeLaCiDeMain as unknown as (
      l: Lecture,
      lots: Lot[],
      d: Defaut
    ) => { genre: string; cle: string; texte: string } | null
  )(lecture, [], defaut)!;

describe('l’alerte de la CI de main et son ticket de défaut', () => {
  it('names the defect ticket by its number, whether the reading created it or found it', () => {
    expect(alerteAvec({ ouvert: true, ticket: 'demo-90' }).texte).toContain('demo-90');
    expect(alerteAvec({ ouvert: false, ticket: 'demo-77' }).texte).toContain('demo-77');
  });

  it('no longer sends the owner to a ticket the alert does not name', () => {
    const t = alerteAvec({ ouvert: false, ticket: 'demo-77' }).texte;
    expect(t).not.toContain('le ticket de défaut ouvert pour le responsable');
  });

  it('a ticket opened without a number says a ticket is open, with no number', () => {
    const t = alerteAvec({ ouvert: true, ticket: null }).texte;
    expect(t).toMatch(/ticket/);
    expect(t).not.toMatch(/[a-z]+-\d+/);
  });

  it('a creation Beads refuses says the ticket could not be opened and why, announcing no ticket', () => {
    const a = alerteAvec({ ouvert: false, faute: 'bd create refuse : base verrouillée' });
    expect(a.texte).toContain('base verrouillée');
    expect(a.texte).toMatch(/n'a pas pu s'ouvrir|n’a pas pu s’ouvrir|pas pu s.ouvrir/);
    expect(a.texte).not.toContain('le ticket de défaut ouvert pour le responsable');
  });

  it('the alert without a ticket has its own key, distinct from the alert with a ticket', () => {
    const sans = alerteAvec({ ouvert: false, faute: 'refus' });
    const avec = alerteAvec({ ouvert: true, ticket: 'demo-90' });
    expect(sans.cle).not.toBe(avec.cle);
    expect(sans.cle).toContain('4242');
    expect(avec.cle).toContain('4242');
  });
});
