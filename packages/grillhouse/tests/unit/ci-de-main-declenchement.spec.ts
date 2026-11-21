// The queue starts the CI of main itself after a lot entered, as the schedulers of Google's TAP and
// Chromium's LUCI start the pass after the submit, by batches, at their own pace
// (scripts/ci-de-main.mjs `declencherLaCiDeMain`): one pass an hour at most, on the tip of main,
// which judges every lot entered since the last one. The reading of the passes, the delay kept in a
// file of the project and the fault of a refused start (`fauteDeDeclenchement`, its alert
// `alerteDeDeclenchement`) are played here with gh as a stand-in and a repository of trial.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as ciDeMain from '../../scripts/ci-de-main.mjs';

type Reponse = { status: number; stdout: string; stderr: string; error?: Error };
type Gh = (a: string[]) => Reponse;
type Issue = { declenche: boolean; faute?: string };

const {
  declencherLaCiDeMain,
  fauteDeDeclenchement,
  alerteDeDeclenchement,
  lireEtOuvrirLeDefautDeMain,
} = ciDeMain as unknown as {
  declencherLaCiDeMain: (
    o: { racine: string; gh: Gh },
    p?: { apresEntree?: boolean; maintenant?: number }
  ) => Issue;
  fauteDeDeclenchement: (racine: string) => string | null;
  alerteDeDeclenchement: (faute: string) => { genre: string; cle: string; texte: string };
  lireEtOuvrirLeDefautDeMain: (
    racine: string,
    o?: { gh?: Gh }
  ) => { genre: string; cle: string; texte: string } | null | undefined;
};

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ci-de-main-declenchement-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const HEURE = 3_600_000;
const QUART = 900_000;
const MAINTENANT = Date.UTC(2026, 10, 21, 12, 0, 0);

const git = (racine: string, ...a: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
    cwd: racine,
    encoding: 'utf8',
  }).trim();

// A repository of trial whose main has one commit; its tip is `pointe`.
function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'commit', '-q', '--allow-empty', '-m', 'un');
  return { racine, pointe: git(racine, 'rev-parse', 'HEAD') };
}
const ANCIEN = '1'.repeat(40);

type Passage = {
  databaseId: number;
  status: string;
  conclusion: string;
  workflowName: string;
  headSha: string;
  event: string;
  createdAt: string;
};
const passage = (
  sha: string,
  ageMs: number,
  { status = 'completed', event = 'schedule', id = 10 } = {}
): Passage => ({
  databaseId: id,
  status,
  conclusion: status === 'completed' ? 'success' : '',
  workflowName: 'CI',
  headSha: sha,
  event,
  createdAt: new Date(MAINTENANT - ageMs).toISOString(),
});

// A stand-in for gh: `run list` answers <passages>, `workflow run` answers <declenchement>.
function github(
  passages: Passage[] | Reponse,
  declenchement: Reponse = { status: 0, stdout: '', stderr: '' }
) {
  const appels: string[][] = [];
  const gh: Gh = a => {
    appels.push(a);
    const verbe = a.slice(0, 2).join(' ');
    if (verbe === 'workflow run') {
      return declenchement;
    }
    if (Array.isArray(passages)) {
      return { status: 0, stdout: JSON.stringify(passages), stderr: '' };
    }
    return passages;
  };
  return {
    gh,
    appels,
    declenchements: () => appels.filter(a => a.slice(0, 2).join(' ') === 'workflow run'),
  };
}

describe('la file déclenche la CI de main après l’entrée d’un lot', () => {
  it('starts the workflow ci.yml on main when a lot entered and no pass is known for an hour', () => {
    const { racine } = depot();
    const g = github([passage(ANCIEN, 2 * HEURE)]);
    const issue = declencherLaCiDeMain(
      { racine, gh: g.gh },
      { apresEntree: true, maintenant: MAINTENANT }
    );
    expect(issue.declenche).toBe(true);
    const appels = g.declenchements();
    expect(appels).toHaveLength(1);
    expect(appels[0]).toEqual(expect.arrayContaining(['ci.yml', '--ref', 'main']));
  });

  it('reads the passes of the workflow ci.yml on main, whatever started them', () => {
    const { racine } = depot();
    const g = github([passage(ANCIEN, 2 * HEURE)]);
    declencherLaCiDeMain({ racine, gh: g.gh }, { apresEntree: true, maintenant: MAINTENANT });
    const lecture = g.appels.find(a => a.slice(0, 2).join(' ') === 'run list')!;
    expect(lecture).toEqual(expect.arrayContaining(['--workflow', 'ci.yml', '--branch', 'main']));
    expect(lecture).not.toContain('--event');
  });

  it('starts nothing for a project with no lot entered and no pass at all', () => {
    const { racine } = depot();
    const g = github([]);
    const issue = declencherLaCiDeMain(
      { racine, gh: g.gh },
      { apresEntree: false, maintenant: MAINTENANT }
    );
    expect(issue.declenche).toBe(false);
    expect(g.declenchements()).toHaveLength(0);
  });

  it('starts at the first lot entered when no pass is known on main', () => {
    const { racine } = depot();
    const g = github([]);
    expect(
      declencherLaCiDeMain({ racine, gh: g.gh }, { apresEntree: true, maintenant: MAINTENANT })
        .declenche
    ).toBe(true);
  });

  it('starts nothing when the tip of main is the commit of the last pass', () => {
    const { racine, pointe } = depot();
    const g = github([passage(pointe, 3 * HEURE)]);
    expect(
      declencherLaCiDeMain({ racine, gh: g.gh }, { apresEntree: true, maintenant: MAINTENANT })
        .declenche
    ).toBe(false);
    expect(g.declenchements()).toHaveLength(0);
  });

  it('counts a pass started by hand: its commit at the tip starts nothing', () => {
    const { racine, pointe } = depot();
    const g = github([passage(pointe, 5 * HEURE, { event: 'workflow_dispatch' })]);
    expect(
      declencherLaCiDeMain({ racine, gh: g.gh }, { apresEntree: false, maintenant: MAINTENANT })
        .declenche
    ).toBe(false);
  });

  it('judges at the resume a lot entered while the queue was stopped: the tip differs from the last pass, no entry needed', () => {
    const { racine } = depot();
    const g = github([passage(ANCIEN, 2 * HEURE)]);
    expect(
      declencherLaCiDeMain({ racine, gh: g.gh }, { apresEntree: false, maintenant: MAINTENANT })
        .declenche
    ).toBe(true);
    expect(g.declenchements()).toHaveLength(1);
  });
});

describe('plusieurs lots dans l’heure sont jugés par un seul passage', () => {
  it('waits for the hour after the last pass, then starts on the tip without a new entry', () => {
    const { racine } = depot();
    const g = github([passage(ANCIEN, 20 * 60_000)]);
    const tot = declencherLaCiDeMain(
      { racine, gh: g.gh },
      { apresEntree: true, maintenant: MAINTENANT }
    );
    expect(tot.declenche).toBe(false);
    const apresLeQuart = declencherLaCiDeMain(
      { racine, gh: g.gh },
      { apresEntree: false, maintenant: MAINTENANT + QUART }
    );
    expect(apresLeQuart.declenche).toBe(false);
    const apresLHeure = declencherLaCiDeMain(
      { racine, gh: g.gh },
      { apresEntree: false, maintenant: MAINTENANT + 40 * 60_000 }
    );
    expect(apresLHeure.declenche).toBe(true);
    expect(g.declenchements()).toHaveLength(1);
  });

  it('starts nothing within the hour of its own last start, before the pass shows', () => {
    const { racine } = depot();
    const g = github([passage(ANCIEN, 3 * HEURE)]);
    expect(
      declencherLaCiDeMain({ racine, gh: g.gh }, { apresEntree: true, maintenant: MAINTENANT })
        .declenche
    ).toBe(true);
    for (const delai of [QUART, 2 * QUART, 3 * QUART]) {
      expect(
        declencherLaCiDeMain(
          { racine, gh: g.gh },
          { apresEntree: true, maintenant: MAINTENANT + delai }
        ).declenche,
        `${delai}`
      ).toBe(false);
    }
    expect(g.declenchements()).toHaveLength(1);
    expect(
      declencherLaCiDeMain(
        { racine, gh: g.gh },
        { apresEntree: true, maintenant: MAINTENANT + HEURE }
      ).declenche
    ).toBe(true);
    expect(g.declenchements()).toHaveLength(2);
  });
});

describe('un passage en cours ou en attente n’en déclenche pas un second', () => {
  it.each(['in_progress', 'queued', 'waiting', 'pending'])(
    'a pass %s on main starts nothing',
    status => {
      const { racine } = depot();
      const g = github([
        passage(ANCIEN, 5 * HEURE, { id: 10 }),
        passage(ANCIEN, 2 * HEURE, { status, id: 11 }),
      ]);
      const issue = declencherLaCiDeMain(
        { racine, gh: g.gh },
        { apresEntree: true, maintenant: MAINTENANT }
      );
      expect(issue.declenche).toBe(false);
      expect(g.declenchements()).toHaveLength(0);
    }
  );
});

describe('un déclenchement refusé par GitHub n’arrête pas la file', () => {
  const refus: Reponse = {
    status: 1,
    stdout: '',
    stderr: 'HTTP 403: Resource not accessible by integration',
  };

  it('gives back the reason of gh without throwing, and keeps the fault for the alert', () => {
    const { racine } = depot();
    const g = github([passage(ANCIEN, 2 * HEURE)], refus);
    const issue = declencherLaCiDeMain(
      { racine, gh: g.gh },
      { apresEntree: true, maintenant: MAINTENANT }
    );
    expect(issue.declenche).toBe(false);
    expect(issue.faute).toContain('Resource not accessible');
    expect(fauteDeDeclenchement(racine)).toContain('Resource not accessible');
  });

  it('names a gh that does not start', () => {
    const { racine } = depot();
    const absent = Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' });
    const g = github([passage(ANCIEN, 2 * HEURE)], {
      status: 0,
      stdout: '',
      stderr: '',
      error: absent,
    });
    const issue = declencherLaCiDeMain(
      { racine, gh: g.gh },
      { apresEntree: true, maintenant: MAINTENANT }
    );
    expect(issue.declenche).toBe(false);
    expect(issue.faute).toContain('ENOENT');
    expect(fauteDeDeclenchement(racine)).toContain('ENOENT');
  });

  it('has no fault before any refusal', () => {
    expect(fauteDeDeclenchement(depot().racine)).toBeNull();
  });

  it('tries again at the next quarter of an hour, without a new entry, and clears the fault on success', () => {
    const { racine } = depot();
    const refuse = github([passage(ANCIEN, 2 * HEURE)], refus);
    declencherLaCiDeMain({ racine, gh: refuse.gh }, { apresEntree: true, maintenant: MAINTENANT });
    const accepte = github([passage(ANCIEN, 2 * HEURE)]);
    const issue = declencherLaCiDeMain(
      { racine, gh: accepte.gh },
      { apresEntree: false, maintenant: MAINTENANT + QUART }
    );
    expect(issue.declenche).toBe(true);
    expect(accepte.declenchements()).toHaveLength(1);
    expect(fauteDeDeclenchement(racine)).toBeNull();
  });

  it('keeps the entry of a refused start when no pass is known: the retry starts without a new entry', () => {
    const { racine } = depot();
    const refuse = github([], refus);
    declencherLaCiDeMain({ racine, gh: refuse.gh }, { apresEntree: true, maintenant: MAINTENANT });
    const accepte = github([]);
    expect(
      declencherLaCiDeMain(
        { racine, gh: accepte.gh },
        { apresEntree: false, maintenant: MAINTENANT + QUART }
      ).declenche
    ).toBe(true);
  });

  it('a pass list that gh refuses starts nothing and does not throw', () => {
    const { racine } = depot();
    const g = github({ status: 1, stdout: '', stderr: 'gh: not logged in' });
    const issue = declencherLaCiDeMain(
      { racine, gh: g.gh },
      { apresEntree: true, maintenant: MAINTENANT }
    );
    expect(issue.declenche).toBe(false);
    expect(g.declenchements()).toHaveLength(0);
  });
});

describe('l’alerte du déclenchement refusé', () => {
  it('says that the CI could not be started and why, in a kind apart from « CI de main non lue »', () => {
    const a = alerteDeDeclenchement('HTTP 403: Resource not accessible');
    expect(a.texte).toMatch(/CI de main n'a pas pu être déclenchée/);
    expect(a.texte).toContain('HTTP 403: Resource not accessible');
    expect(a.genre).not.toBe('non-lue');
    expect(a.genre).not.toBe('rouge');
    expect(a.cle).not.toBe('non-lue');
    expect(a.texte).not.toMatch(/non lue/);
  });

  it('is the alert the supervisor reads while the fault stands, and is gone once the start succeeds', () => {
    const { racine } = depot();
    mkdirSync(path.join(racine, '.github', 'workflows'), { recursive: true });
    git(racine, 'remote', 'add', 'origin', 'https://example.invalid/p.git');
    const verte = [{ ...passage(ANCIEN, 2 * HEURE), headSha: ANCIEN }];
    const refus: Reponse = {
      status: 1,
      stdout: '',
      stderr: 'workflow ci.yml not found on the default branch',
    };
    const g = github(verte, refus);
    declencherLaCiDeMain({ racine, gh: g.gh }, { apresEntree: true, maintenant: MAINTENANT });
    const alerte = lireEtOuvrirLeDefautDeMain(racine, { gh: g.gh });
    expect(alerte).toMatchObject({ genre: 'declenchement' });
    expect(alerte!.texte).toContain('workflow ci.yml not found');

    const ok = github(verte);
    declencherLaCiDeMain(
      { racine, gh: ok.gh },
      { apresEntree: false, maintenant: MAINTENANT + QUART }
    );
    expect(fauteDeDeclenchement(racine)).toBeNull();
  });
});
