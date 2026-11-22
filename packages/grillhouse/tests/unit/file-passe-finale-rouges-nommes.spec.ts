// A red final pass of the queue reports as a merge queue does (the logs of a CI job, the list of
// the failed tests of bors and of Zuul): its whole output kept in the journal of the ticket, which
// the comment names, and its reds named in the comment (test, file, message) by the reading the
// checks of the circuit use (`rougesDe` of scripts/activites.mjs), in every language; the end of
// the output comes only when that reading names no red.
//
// Medium tests: a trial repository read by git, Beads a stand-in; the reading plays on a results
// directory written as a pass leaves it (the JSON report of Vitest, the JUnit report of nextest),
// and the pass of the queue's tools runs a stand-in command through bash.
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  declarerLeLangage,
  declarerLesLangages,
} from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import { jouerLActe } from '../../scripts/faits-du-circuit.mjs';
import * as file from '../../scripts/integration/file.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

type Lecture = { copie: string; dossier: string; code: number; ticket: string; journal: string };
type Passe = (e: { commit: string; ticket: string }) => {
  code: number;
  sortie: string;
  rouges?: string[];
  refus?: boolean;
};
// Read from the namespaces: a name not yet public fails its test, not the loading of the file.
const rougesDUnePasse = (activites as unknown as { rougesDUnePasse: (l: Lecture) => string[] })
  .rougesDUnePasse;
const jugerLeCandidat = (
  file as unknown as {
    jugerLeCandidat: (o: object, e: object) => { issue: { etat: string; raison: string } };
  }
).jugerLeCandidat;
const outilsDeLaFile = (
  file as unknown as {
    outilsDeLaFile: (
      racine: string,
      dire: (l: string) => void,
      avancement: null,
      ports?: {
        rouges?: (l: Lecture) => string[];
        ouvrir?: (e: {
          copie: string;
          ref: string;
        }) => { monter: (...commande: string[]) => string[] } | { refus: string };
      }
    ) => { passe: Passe };
  }
).outilsDeLaFile;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-passe-finale-rouges-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
let restaurer: () => void = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal-de-cargo'));
});
afterAll(() => restaurer());

// A repository whose main holds a lone package.json, and the branch agent/demo-1 one commit ahead.
function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  writeFileSync(path.join(racine, 'package.json'), '{}\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  git('checkout', '-qb', 'agent/demo-1');
  writeFileSync(path.join(racine, 'lot.txt'), 'lot\n');
  git('add', '-A');
  git('commit', '-qm', 'feat: lot (demo-1)');
  git('checkout', '-q', 'main');
  return { racine, git, tip: git('rev-parse', 'agent/demo-1') };
}

// The tools of the queue over <racine>: Beads keeps the comments, the pass answers <reponse>.
function outils(racine: string, reponse: ReturnType<Passe>) {
  const commentaires: string[] = [];
  const recues: { commit: string; ticket: string }[] = [];
  const bd = (...a: string[]) => {
    if (a[0] === 'comments' && a[1] === 'add') {
      commentaires.push(a[3]!);
    }
    return { status: 0, stdout: a[0] === 'config' ? 'demo\n' : '', stderr: '' };
  };
  const passe: Passe = e => {
    recues.push(e);
    return reponse;
  };
  return {
    o: { racine, principale: 'main', bd, passe, dire: () => {}, avancement: null },
    commentaires,
    recues,
  };
}

const ENTREE = { ticket: 'demo-1', branche: 'agent/demo-1' };
const JOURNAL = (racine: string) => path.join(racine, '.claude', 'worktrees', 'demo-1.log');
// An output longer than the end a comment gives: its first line is in the journal alone.
const SORTIE = [
  'premiere ligne de la passe',
  ...Array.from({ length: 200 }, (_, i) => `ligne ${i}`),
  'service#test:unit: command exited (1)',
].join('\n');
const ROUGE =
  'test packages/service/tests/horloge.spec.ts › the clock ticks once — AssertionError: expected 1 to be 2';

describe('une passe finale rouge de la file garde sa sortie entière', () => {
  it('writes the whole output to the journal of the ticket, which the comment names', () => {
    const d = depot();
    const { o, commentaires } = outils(d.racine, { code: 1, sortie: SORTIE, rouges: [ROUGE] });
    jugerLeCandidat(o, { ...ENTREE, commit: d.tip });
    const journal = readFileSync(JOURNAL(d.racine), 'utf8');
    expect(journal).toContain('premiere ligne de la passe');
    expect(journal).toContain('service#test:unit: command exited (1)');
    expect(journal).toContain(d.tip.slice(0, 7));
    expect(commentaires.at(-1)).toContain(JOURNAL(d.racine));
  });

  it('adds to a journal the circuit already wrote, without replacing it', () => {
    const d = depot();
    mkdirSync(path.dirname(JOURNAL(d.racine)), { recursive: true });
    writeFileSync(JOURNAL(d.racine), 'ce que le circuit a écrit\n');
    const { o } = outils(d.racine, { code: 1, sortie: SORTIE });
    jugerLeCandidat(o, { ...ENTREE, commit: d.tip });
    const journal = readFileSync(JOURNAL(d.racine), 'utf8');
    expect(journal.startsWith('ce que le circuit a écrit\n')).toBe(true);
    expect(journal).toContain('premiere ligne de la passe');
  });

  it('keeps the output of a pass to play again (75) too', () => {
    const d = depot();
    const { o, commentaires } = outils(d.racine, { code: 75, sortie: SORTIE });
    jugerLeCandidat(o, { ...ENTREE, commit: d.tip });
    expect(readFileSync(JOURNAL(d.racine), 'utf8')).toContain('premiere ligne de la passe');
    expect(commentaires.at(-1)).toContain(JOURNAL(d.racine));
  });

  it('a copy that does not open (75) is told as such: no header of a verification never played', () => {
    const d = depot();
    const { o } = outils(d.racine, {
      code: 75,
      sortie: 'La copie ne se prépare pas.',
      refus: true,
    });
    jugerLeCandidat(o, { ...ENTREE, commit: d.tip });
    const journal = readFileSync(JOURNAL(d.racine), 'utf8');
    expect(journal).toContain('La copie ne se prépare pas.');
    expect(journal).not.toContain('npm run verifier');
    expect(journal).toContain(d.tip.slice(0, 7));
  });

  it('writes no journal for a green pass', () => {
    const d = depot();
    const { o } = outils(d.racine, { code: 0, sortie: SORTIE });
    jugerLeCandidat(o, { ...ENTREE, commit: d.tip });
    expect(existsSync(JOURNAL(d.racine))).toBe(false);
  });
});

describe('le commentaire d’une passe finale rouge nomme ses rouges', () => {
  it('asks the pass for the reds of its ticket', () => {
    const d = depot();
    const { o, recues } = outils(d.racine, { code: 1, sortie: SORTIE, rouges: [ROUGE] });
    jugerLeCandidat(o, { ...ENTREE, commit: d.tip });
    expect(recues).toEqual([{ commit: d.tip, ticket: 'demo-1' }]);
  });

  it('lists each red the pass read, and leaves out the end of the output', () => {
    const d = depot();
    const autre = 'constat frontieres packages/service/src/a.ts:3 — import interdit';
    const { o, commentaires } = outils(d.racine, {
      code: 1,
      sortie: SORTIE,
      rouges: [ROUGE, autre],
    });
    const r = jugerLeCandidat(o, { ...ENTREE, commit: d.tip });
    expect(r.issue.etat).toBe('rouvert');
    const mot = commentaires.at(-1)!;
    expect(mot).toContain('Ses rouges (2)');
    expect(mot).toContain(ROUGE);
    expect(mot).toContain(autre);
    expect(mot).not.toContain('ligne 199');
    expect(mot).not.toContain('command exited (1)');
    expect(mot).toContain('quarantaine');
  });

  it('writes every red to the journal, and bounds the list of the comment, which says the count', () => {
    const d = depot();
    const nombreux = Array.from(
      { length: 400 },
      (_, i) => `test packages/service/tests/t${i}.spec.ts › le cas ${i} — ${'x'.repeat(200)}`
    );
    const { o, commentaires } = outils(d.racine, { code: 1, sortie: SORTIE, rouges: nombreux });
    jugerLeCandidat(o, { ...ENTREE, commit: d.tip });
    const mot = commentaires.at(-1)!;
    expect(mot.length).toBeLessThan(30000);
    expect(mot).toContain('Ses rouges (400)');
    expect(mot).toContain(nombreux[0]);
    expect(mot).not.toContain(nombreux[399]);
    expect(mot).toMatch(/et \d+ autre\(s\), au journal/);
    expect(mot).toContain(JOURNAL(d.racine));
    const journal = readFileSync(JOURNAL(d.racine), 'utf8');
    expect(journal).toContain(nombreux[0]);
    expect(journal).toContain(nombreux[399]);
  });

  it('gives the end of the output when the reading names no red', () => {
    const d = depot();
    const { o, commentaires } = outils(d.racine, { code: 1, sortie: SORTIE, rouges: [] });
    jugerLeCandidat(o, { ...ENTREE, commit: d.tip });
    const mot = commentaires.at(-1)!;
    expect(mot).toContain('command exited (1)');
    expect(mot).toContain('ligne 199');
    expect(mot).not.toContain('premiere ligne de la passe');
    expect(mot).not.toContain('Ses rouges');
  });
});

// A results directory holding the summary of Turborepo <taches>.
function resultats(taches: object[]) {
  const dossier = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  mkdirSync(path.join(dossier, 'turbo'), { recursive: true });
  writeFileSync(path.join(dossier, 'turbo', 'run.json'), JSON.stringify({ tasks: taches }));
  return dossier;
}
const tache = (paquet: string, journal: string) => ({
  taskId: `${paquet}#test:unit`,
  package: paquet,
  directory: '.',
  task: 'test:unit',
  execution: { exitCode: 1 },
  cache: { status: 'MISS' },
  logFile: journal,
});

describe('la lecture des rouges d’une passe, celle des contrôles du circuit', () => {
  it('names the failed test of a Vitest report: test, file, message', () => {
    const copie = mkdtempSync(path.join(ESSAIS, 'copie-ts-'));
    declarerLeLangage(copie);
    const dossier = resultats([tache('essai', 'essai-test-unit.log')]);
    mkdirSync(path.join(dossier, 'vitest'), { recursive: true });
    writeFileSync(
      path.join(dossier, 'vitest', 'essai.json'),
      JSON.stringify({
        testResults: [
          {
            name: path.join(copie, 'tests', 'horloge.spec.ts'),
            status: 'failed',
            message: '',
            assertionResults: [
              { title: 'ticks twice', fullName: 'the clock ticks twice', status: 'passed' },
              {
                title: 'ticks once',
                fullName: 'the clock ticks once',
                status: 'failed',
                failureMessages: ['AssertionError: expected 1 to be 2\n    at horloge.spec.ts:7:3'],
              },
            ],
          },
        ],
      })
    );
    const rouges = rougesDUnePasse({
      copie,
      dossier,
      code: 1,
      ticket: 'demo-1',
      journal: path.join(ESSAIS, 'demo-1.log'),
    });
    expect(rouges).toEqual([
      'test tests/horloge.spec.ts › the clock ticks once — AssertionError: expected 1 to be 2',
    ]);
  });

  it('names the failed test of a nextest report, in a project of cargo', () => {
    const copie = mkdtempSync(path.join(ESSAIS, 'copie-cargo-'));
    declarerLesLangages(copie, { '.': 'cargo' });
    writeFileSync(
      path.join(copie, 'Cargo.toml'),
      '[package]\nname = "osc-bridge"\nversion = "0.1.0"\nedition = "2021"\n'
    );
    mkdirSync(path.join(copie, 'src'), { recursive: true });
    writeFileSync(path.join(copie, 'src', 'lib.rs'), 'pub fn un() -> i32 { 1 }\n');
    mkdirSync(path.join(copie, 'tests'), { recursive: true });
    writeFileSync(path.join(copie, 'tests', 'osc_transport_e2e.rs'), '#[test]\nfn e2e() {}\n');
    const dossier = resultats([tache('osc-bridge', 'osc-bridge-test-unit.log')]);
    mkdirSync(path.join(dossier, 'cargo'), { recursive: true });
    writeFileSync(
      path.join(dossier, 'cargo', 'run.json'),
      JSON.stringify({
        taches: [],
        cibles: {
          'osc-bridge::osc_transport_e2e': path.join(copie, 'tests', 'osc_transport_e2e.rs'),
        },
      })
    );
    mkdirSync(path.join(dossier, 'nextest'), { recursive: true });
    writeFileSync(
      path.join(dossier, 'nextest', 'osc-bridge.xml'),
      '<?xml version="1.0"?><testsuites><testsuite name="osc-bridge::osc_transport_e2e">' +
        '<testcase name="e2e"><failure message="panicked at roundtrip">panic</failure></testcase>' +
        '</testsuite></testsuites>'
    );
    const rouges = rougesDUnePasse({
      copie,
      dossier,
      code: 1,
      ticket: 'demo-1',
      journal: path.join(ESSAIS, 'demo-1.log'),
    });
    expect(rouges).toHaveLength(1);
    expect(rouges[0]).toMatch(
      /^test tests\/osc_transport_e2e\.rs › .*e2e — .*panicked at roundtrip/
    );
  });

  it('names nothing for a red pass whose results situate no red', () => {
    const copie = mkdtempSync(path.join(ESSAIS, 'copie-vide-'));
    declarerLeLangage(copie);
    const dossier = mkdtempSync(path.join(ESSAIS, 'resultats-vides-'));
    expect(
      rougesDUnePasse({
        copie,
        dossier,
        code: 1,
        ticket: 'demo-1',
        journal: path.join(ESSAIS, 'demo-1.log'),
      })
    ).toEqual([]);
  });
});

// A stand-in for the opening of the queue's copy: an empty folder, where the pass plays <commande>
// through bash in place of `npm run verifier`.
const copieVide =
  (commande: string) =>
  ({ copie }: { copie: string }) => {
    mkdirSync(copie, { recursive: true });
    return { monter: () => ['-c', commande] };
  };

describe('la passe des outils de la file lit ses rouges dans ses résultats', () => {
  it('names a results directory to the pass, reads its reds there, then removes it', () => {
    const d = depot();
    const temoin = path.join(ESSAIS, 'resultats-nommes');
    const lues: (Lecture & { present: boolean; proprietaire: boolean })[] = [];
    const o = outilsDeLaFile(d.racine, () => {}, null, {
      rouges: l => {
        lues.push({
          ...l,
          present: existsSync(l.dossier),
          proprietaire: existsSync(path.resolve(l.dossier, '..', '..', '.grillhouse-base')),
        });
        return [ROUGE];
      },
      // The pass is a command that names its results directory.
      ouvrir: copieVide(
        `echo "sortie de la passe"; printf %s "$GRILLHOUSE_RESULTATS" > ${temoin}; exit 1`
      ),
    });
    const r = o.passe({ commit: d.tip, ticket: 'demo-1' });
    expect(r.code).toBe(1);
    expect(r.sortie).toContain('sortie de la passe');
    expect(r.rouges).toEqual([ROUGE]);
    const dossier = readFileSync(temoin, 'utf8');
    expect(dossier).not.toBe('');
    expect(lues).toHaveLength(1);
    // The results lie in the base of a pass (scripts/mesure/base-de-passe.mjs), which its owner
    // removes at its end and the next pass sweeps when that owner was killed.
    expect(dossier).toMatch(/\/grillhouse-file-[^/]+\/t\/resultats-[^/]+$/);
    expect(lues[0]!.proprietaire).toBe(true);
    expect(existsSync(path.resolve(dossier, '..', '..'))).toBe(false);
    expect(lues[0]).toMatchObject({
      copie: path.join(d.racine, '.claude', 'worktrees', 'file'),
      dossier,
      code: 1,
      ticket: 'demo-1',
      journal: JOURNAL(d.racine),
      present: true,
    });
    expect(existsSync(dossier)).toBe(false);
  });

  it('reads no red for a green pass', () => {
    const d = depot();
    let lues = 0;
    const o = outilsDeLaFile(d.racine, () => {}, null, {
      rouges: () => {
        lues++;
        return [];
      },
      ouvrir: copieVide('exit 0'),
    });
    expect(o.passe({ commit: d.tip, ticket: 'demo-1' }).code).toBe(0);
    expect(lues).toBe(0);
  });
});

describe('les outils de la file reçoivent la lecture des rouges', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses tools built without the reading of the reds, by its name', () => {
    const d = depot();
    expect(() => outilsDeLaFile(d.racine, () => {}, null)).toThrow(/rouges/);
    expect(() => outilsDeLaFile(d.racine, () => {}, null, { ouvrir: copieVide('exit 0') })).toThrow(
      /rouges/
    );
  });

  it('a copy that does not open gives 75, its refusal, and says no pass played', () => {
    const d = depot();
    const o = outilsDeLaFile(d.racine, () => {}, null, {
      rouges: () => [],
      ouvrir: () => ({ refus: 'La copie ne se prépare pas.' }),
    });
    expect(o.passe({ commit: d.tip, ticket: 'demo-1' })).toEqual({
      code: 75,
      sortie: 'La copie ne se prépare pas.',
      rouges: [],
      refus: true,
    });
  });

  it('the acts of the queue build their tools with it', async () => {
    const d = depot();
    // Beads is a stand-in on the PATH, which answers a ticket in progress.
    const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
    writeFileSync(
      path.join(bin, 'bd'),
      '#!/bin/sh\necho \'[{"id":"demo-1","status":"in_progress","labels":[]}]\'\n'
    );
    chmodSync(path.join(bin, 'bd'), 0o755);
    vi.stubEnv('PATH', `${bin}:${process.env.PATH}`);
    await expect(
      jouerLActe('situer', { racine: d.racine, ticket: 'demo-1' })
    ).resolves.toMatchObject({ statut: 'in_progress' });
    await expect(
      jouerLActe('effet-de-la-file', {
        racine: d.racine,
        effet: { genre: 'commentaire', ticket: 'demo-1', texte: 'un mot', auteur: 'file' },
        cle: 'demo-1:effet:0:commentaire',
        derniere: true,
      })
    ).resolves.toBeNull();
  });
});
