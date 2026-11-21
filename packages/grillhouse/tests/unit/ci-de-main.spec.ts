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
};
const passage = (
  id: number,
  flux: string,
  conclusion: string,
  sha: string,
  status = 'completed'
): Passage => ({
  databaseId: id,
  status,
  conclusion: status === 'completed' ? conclusion : '',
  workflowName: flux,
  headSha: sha,
});

// A stand-in for gh answering `gh run list` with <passages>, each call kept.
function github(passages: Passage[] | Reponse) {
  const appels: string[][] = [];
  const gh = (a: string[]): Reponse => {
    appels.push(a);
    if (Array.isArray(passages)) {
      return { status: 0, stdout: JSON.stringify(passages), stderr: '' };
    }
    return passages;
  };
  return { gh, appels };
}
const lire = (p: Passage[] | Reponse, branche?: string) => {
  const g = github(p);
  return { lecture: lireLaCiDeMain({ racine: ESSAIS, gh: g.gh }, { branche }), appels: g.appels };
};

describe('la lecture de la CI de main', () => {
  it('is green when the latest finished pass of every workflow is a success', () => {
    const { lecture } = lire([
      passage(20, 'CI', 'success', VERT),
      passage(19, 'Machine vierge', 'success', VERT),
      passage(10, 'CI', 'failure', ANCIEN),
    ]);
    expect(lecture).toMatchObject({ etat: 'verte', commit: VERT });
  });

  it('is red as soon as one workflow’s latest finished pass failed, naming it, its pass and its commit', () => {
    const { lecture } = lire([
      passage(30, 'Machine vierge', 'failure', ROUGE),
      passage(29, 'CI', 'success', ROUGE),
      passage(12, 'Machine vierge', 'success', VERT),
    ]);
    expect(lecture).toEqual({
      etat: 'rouge',
      flux: 'Machine vierge',
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

  it('a skipped pass judged nothing: the flow that alerts on a red one, skipped on a green, is not red', () => {
    expect(
      lire([passage(9, 'Alert on a red flow', 'skipped', VERT), passage(8, 'CI', 'success', VERT)])
        .lecture
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
  flux: 'Machine vierge',
  passage: '4242',
  commit: ROUGE,
  vert: VERT,
};

describe('l’alerte de la CI de main', () => {
  it('a red names the workflow, its pass, its commit and each lot entered since the last green', () => {
    const a = alerteDeLaCiDeMain(ROUGEE, [lot('demo-1'), lot('demo-2')])!;
    expect(a.genre).toBe('rouge');
    expect(a.cle).toContain('4242');
    for (const mot of ['Machine vierge', '4242', ROUGE.slice(0, 7), 'demo-1', 'demo-2']) {
      expect(a.texte, mot).toContain(mot);
    }
  });

  it('the red of the clean machine and the red of the CI are told the same way', () => {
    for (const flux of ['CI', 'Machine vierge']) {
      const a = alerteDeLaCiDeMain({ ...ROUGEE, flux } as Lecture, [lot('demo-1')])!;
      expect(a.texte).toContain(flux);
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
    expect(l).toContain('Machine vierge');
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
    for (const mot of ['4242', 'Machine vierge', 'demo-1', 'demo-2', ROUGE.slice(0, 7)]) {
      expect(ligne, mot).toContain(mot);
    }
  });

  it('opens no second ticket for the same pass, closed or not, and says which holds it', () => {
    const existant: TicketBd = {
      id: 'demo-90',
      title: 'CI de main rouge — Machine vierge, passage 4242',
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
      title: 'CI de main rouge — Machine vierge, passage 4100',
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
});
