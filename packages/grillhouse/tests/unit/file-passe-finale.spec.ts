// The queue enters a lot on main on the final pass, as bors judges the tree that enters and Google's
// TAP plays the touched tests before the submit and the whole suite after (scripts/integration/
// file.mjs): the branch `agent/<ticket>` made the candidate on top of main (`preparerLaBranche`,
// replaced when main moved, never pushed), the final pass played on that candidate unless its tree
// was already judged (`jugerLeCandidat`), then main moved by fast-forward onto the tree judged
// (`avancerMain`) and the entry closed (`fermerLEntree`). The CI of the branch is read no more.
//
// The history is a trial repository read by git, its origin a bare repository; Beads and the pass
// are stand-ins in the process: `passe({ commit })` gives `{ code, sortie }`, the code of
// `npm run verifier` (0 green, 75 to play again at rest, any other red).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { arbreEstJuge, garderLArbreJuge } from '../../scripts/arbres-juges.mjs';
import { SUITE } from '../../scripts/etapes.mjs';
import * as file from '../../scripts/integration/file.mjs';

// The title of the final pass is read in the list of the steps, the only one.
const TITRE_PASSE_FINALE = (SUITE as { titre: string; finale?: boolean }[]).find(
  e => e.finale
)!.titre;

const { INTEGRE, avancerMain, fermerLEntree, preparerLaBranche, situerLeLot } = file;
// Read from the namespace: a name not yet public fails its test, not the loading of the file.
const jugerLeCandidat = (
  file as unknown as {
    jugerLeCandidat: (
      o: object,
      e: object
    ) => { juge: true } | { issue: { etat: string; raison: string } };
  }
).jugerLeCandidat;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-passe-finale-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Commentaire = { author: string; text: string };
type Ticket = {
  id: string;
  status: string;
  close_reason?: string;
  labels: string[];
  comments: Commentaire[];
};
type Reponse = { status: number; stdout: string; stderr: string };

const repondre = (stdout = '', status = 0): Reponse => ({ status, stdout, stderr: '' });

// A stand-in for Beads over the ticket <t>: show, comments add, update (--status, --remove-label),
// close (--reason) and `config get issue_prefix` (demo).
function beads(t: Ticket) {
  const appels: string[][] = [];
  const bd = (...a: string[]): Reponse => {
    appels.push(a);
    if (a[0] === 'config') {
      return repondre('demo\n');
    }
    if (a[0] === 'show') {
      return repondre(JSON.stringify([t]));
    }
    if (a[0] === 'comments' && a[1] === 'add') {
      t.comments.push({ author: 'file', text: a[3] });
    }
    if (a[0] === 'update') {
      const statut = a.indexOf('--status');
      if (statut >= 0) {
        t.status = a[statut + 1];
      }
      const retrait = a.indexOf('--remove-label');
      if (retrait >= 0) {
        t.labels = t.labels.filter(l => l !== a[retrait + 1]);
      }
    }
    if (a[0] === 'close') {
      t.status = 'closed';
      t.close_reason = a[a.indexOf('--reason') + 1];
    }
    return repondre();
  };
  return { bd, appels };
}

// A repository whose main holds a lone package.json, pushed to its origin, and the branch
// agent/demo-1 one commit ahead of main, which names the ticket.
function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 't');
  git('config', 'user.email', 't@t');
  writeFileSync(path.join(racine, 'package.json'), '{}\n');
  mkdirSync(path.join(racine, '.beads'));
  writeFileSync(path.join(racine, '.beads', 'config.yaml'), 'issue-prefix: "demo"\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  const distant = mkdtempSync(path.join(ESSAIS, 'origin-'));
  execFileSync('git', ['init', '-q', '--bare', distant]);
  git('remote', 'add', 'origin', distant);
  git('push', '-q', 'origin', 'main');
  git('checkout', '-qb', 'agent/demo-1');
  writeFileSync(path.join(racine, 'lot.txt'), 'lot\n');
  git('add', '-A');
  git('commit', '-qm', 'feat: lot (demo-1)');
  git('checkout', '-q', 'main');
  const absenteDOrigin = (branche: string) =>
    execFileSync('git', ['-C', distant, 'branch', '--list', branche], {
      encoding: 'utf8',
    }).trim() === '';
  const surOrigin = (branche: string) =>
    execFileSync('git', ['-C', distant, 'rev-parse', '--verify', '-q', `refs/heads/${branche}`], {
      encoding: 'utf8',
    }).trim();
  return { racine, git, distant, absenteDOrigin, surOrigin, tip: git('rev-parse', 'agent/demo-1') };
}

const enFile = (): Ticket => ({
  id: 'demo-1',
  status: 'in_progress',
  labels: ['en-file'],
  comments: [],
});

type Passe = (e: { commit: string }) => { code: number; sortie: string };

// The tools of the queue over the trial <d>, Beads holding <t>, the pass answering <reponse> and
// recording each commit it plays.
function outils(
  d: ReturnType<typeof depot>,
  t: Ticket,
  reponse: { code: number; sortie?: string } = { code: 0 }
) {
  const b = beads(t);
  const jouees: string[] = [];
  const passe: Passe = ({ commit }) => {
    jouees.push(commit);
    return { code: reponse.code, sortie: reponse.sortie ?? '' };
  };
  const dites: string[] = [];
  return {
    o: {
      racine: d.racine,
      principale: 'main',
      bd: b.bd,
      gh: () => {
        throw new Error('la file ne lit plus la CI : aucun appel à gh');
      },
      passe,
      dire: (l: string) => dites.push(l),
      avancement: null,
    },
    bd: b.appels,
    jouees,
    dites,
  };
}

const ENTREE = { ticket: 'demo-1', branche: 'agent/demo-1' };

describe('la file prépare le candidat sans pousser agent/<ticket>', () => {
  it('a branch on top of main is the candidate as it is, and nothing goes to origin', () => {
    const d = depot();
    const { o } = outils(d, enFile());
    expect(preparerLaBranche(o, ENTREE)).toEqual({ candidat: { commit: d.tip } });
    expect(d.absenteDOrigin('agent/demo-1')).toBe(true);
    expect(d.git('rev-parse', 'main')).not.toBe(d.tip);
  });

  it('main moved: the branch is replaced on main and takes the replaced commit, still not pushed', () => {
    const d = depot();
    const { o } = outils(d, enFile());
    writeFileSync(path.join(d.racine, 'autre.txt'), 'autre\n');
    d.git('add', '-A');
    d.git('commit', '-qm', 'feat: autre (demo-2)');
    const r = preparerLaBranche(o, ENTREE) as { candidat: { commit: string } };
    expect(r.candidat.commit).not.toBe(d.tip);
    expect(d.git('merge-base', '--is-ancestor', 'main', r.candidat.commit)).toBe('');
    expect(d.git('rev-parse', 'agent/demo-1')).toBe(r.candidat.commit);
    expect(d.absenteDOrigin('agent/demo-1')).toBe(true);
  });

  it('a lot already on main is entered again without moving main', () => {
    const d = depot();
    const { o } = outils(d, enFile());
    d.git('merge', '-q', '--ff-only', 'agent/demo-1');
    expect(preparerLaBranche(o, ENTREE)).toEqual({ entre: { commit: d.tip } });
  });
});

describe('la passe finale juge le candidat avant que main avance', () => {
  it('plays the pass on the candidate and keeps its tree judged when green', () => {
    const d = depot();
    const { o, jouees } = outils(d, enFile(), { code: 0 });
    expect(jugerLeCandidat(o, { ...ENTREE, commit: d.tip })).toEqual({ juge: true });
    expect(jouees).toEqual([d.tip]);
    expect(arbreEstJuge(d.racine, d.git('rev-parse', `${d.tip}^{tree}`))).toBe(true);
  });

  it('plays nothing again for a tree a final pass already judged', () => {
    const d = depot();
    const { o, jouees } = outils(d, enFile(), { code: 1, sortie: 'ne doit pas se jouer' });
    garderLArbreJuge(d.racine, d.git('rev-parse', `${d.tip}^{tree}`));
    expect(jugerLeCandidat(o, { ...ENTREE, commit: d.tip })).toEqual({ juge: true });
    expect(jouees).toEqual([]);
  });

  it('a pass played green once is not played again at the next judgement of the same tree', () => {
    const d = depot();
    const { o, jouees } = outils(d, enFile(), { code: 0 });
    jugerLeCandidat(o, { ...ENTREE, commit: d.tip });
    jugerLeCandidat(o, { ...ENTREE, commit: d.tip });
    expect(jouees).toHaveLength(1);
  });

  it('a lot whose main moved is replayed: its replaced tree is unjudged, the pass plays', () => {
    const d = depot();
    const { o, jouees } = outils(d, enFile(), { code: 0 });
    // The tree of the lot judged on its first base.
    garderLArbreJuge(d.racine, d.git('rev-parse', `${d.tip}^{tree}`));
    writeFileSync(path.join(d.racine, 'autre.txt'), 'autre\n');
    d.git('add', '-A');
    d.git('commit', '-qm', 'feat: autre (demo-2)');
    const { candidat } = preparerLaBranche(o, ENTREE) as { candidat: { commit: string } };
    expect(jugerLeCandidat(o, { ...ENTREE, commit: candidat.commit })).toEqual({ juge: true });
    expect(jouees).toEqual([candidat.commit]);
  });

  it('red: the ticket reopens without en-file, the end of the output at it, nothing judged, main kept', () => {
    const d = depot();
    const t = enFile();
    const avant = d.git('rev-parse', 'main');
    const { o } = outils(d, t, { code: 1, sortie: 'ligne 1\nFAIL osc_transport_full_roundtrip' });
    const r = jugerLeCandidat(o, { ...ENTREE, commit: d.tip }) as {
      issue: { etat: string; raison: string };
    };
    expect(r.issue.etat).toBe('rouvert');
    expect(t.status).toBe('open');
    expect(t.labels).toEqual([]);
    const mot = t.comments.at(-1)!.text;
    expect(mot).toContain(`${TITRE_PASSE_FINALE} rouge`);
    expect(mot).toContain('agent/demo-1');
    expect(mot).toContain('osc_transport_full_roundtrip');
    expect(mot).toContain('quarantaine');
    expect(arbreEstJuge(d.racine, d.git('rev-parse', `${d.tip}^{tree}`))).toBe(false);
    expect(d.git('rev-parse', 'main')).toBe(avant);
  });

  it('to play again (75): the branch stays in the queue, the ticket told, neither reopened nor closed', () => {
    const d = depot();
    const t = enFile();
    const { o } = outils(d, t, { code: 75, sortie: 'la place attendue manque' });
    const r = jugerLeCandidat(o, { ...ENTREE, commit: d.tip }) as {
      issue: { etat: string };
    };
    expect(r.issue.etat).toBe('en-file');
    expect(t.status).toBe('in_progress');
    expect(t.labels).toEqual(['en-file']);
    expect(t.comments.at(-1)!.text).toContain('la place attendue manque');
    expect(arbreEstJuge(d.racine, d.git('rev-parse', `${d.tip}^{tree}`))).toBe(false);
  });

  it('reads no CI: gh is never called, whatever the verdict', () => {
    const d = depot();
    for (const code of [0, 1, 75]) {
      const { o } = outils(d, enFile(), { code });
      expect(() => jugerLeCandidat(o, { ...ENTREE, commit: d.tip })).not.toThrow();
    }
  });
});

describe('main avance sur l’arbre jugé', () => {
  it('moves by fast-forward onto the tree judged, and played again finds main already there', () => {
    const d = depot();
    const t = enFile();
    const { o } = outils(d, t);
    expect(avancerMain(o, { ...ENTREE, commit: d.tip })).toEqual({ entre: { commit: d.tip } });
    expect(d.git('rev-parse', 'main')).toBe(d.tip);
    expect(avancerMain(o, { ...ENTREE, commit: d.tip })).toEqual({ entre: { commit: d.tip } });
    expect(t.comments).toEqual([]);
  });

  it('main moved after the pass: main does not move, the candidate is replaced and judged again', () => {
    const d = depot();
    writeFileSync(path.join(d.racine, 'autre.txt'), 'autre\n');
    d.git('add', '-A');
    d.git('commit', '-qm', 'feat: autre (demo-2)');
    const avant = d.git('rev-parse', 'main');
    const { o } = outils(d, enFile());
    expect(avancerMain(o, { ...ENTREE, commit: d.tip })).toEqual({ bouge: true });
    expect(d.git('rev-parse', 'main')).toBe(avant);
  });
});

describe('l’entrée fermée : le ticket, la branche, main poussé, le travail retiré', () => {
  const leTravail = (d: ReturnType<typeof depot>) => {
    const travail = path.join(d.racine, '.claude', 'worktrees', 'demo-1.travail');
    mkdirSync(travail, { recursive: true });
    return travail;
  };

  it('the whole sequence: prepared, judged, advanced, closed; origin never held the branch', () => {
    const d = depot();
    const t = enFile();
    const { o, jouees } = outils(d, t);
    const travail = leTravail(d);
    const { candidat } = preparerLaBranche(o, ENTREE) as { candidat: { commit: string } };
    expect(jugerLeCandidat(o, { ...ENTREE, commit: candidat.commit })).toEqual({ juge: true });
    expect(avancerMain(o, { ...ENTREE, commit: candidat.commit })).toEqual({
      entre: { commit: candidat.commit },
    });
    const f = fermerLEntree(o, { ...ENTREE, commit: candidat.commit }) as {
      poussee: string | null;
    };
    expect(jouees).toEqual([candidat.commit]);
    expect(f.poussee).toBe('main');
    expect(t.status).toBe('closed');
    expect(t.close_reason).toBe(`${INTEGRE}${d.tip.slice(0, 7)}`);
    expect(d.surOrigin('main')).toBe(d.tip);
    expect(d.absenteDOrigin('agent/demo-1')).toBe(true);
    expect(d.git('branch', '--list', 'agent/demo-1')).toBe('');
    expect(existsSync(travail)).toBe(false);
  });

  it('the push refused: the ticket closed all the same, the queue is done with it', () => {
    const d = depot();
    const travail = leTravail(d);
    d.git('remote', 'set-url', 'origin', path.join(ESSAIS, 'origine-absente'));
    const { o } = outils(d, enFile());
    const f = fermerLEntree(o, { ...ENTREE, commit: d.tip }) as { poussee: string | null };
    expect(f.poussee).toBeNull();
    expect(existsSync(travail)).toBe(false);
  });

  it('where the lot stands is its ticket in Beads: its status and its reason of closure', () => {
    const d = depot();
    const t = { ...enFile(), status: 'closed', close_reason: 'intégré : abc1234' };
    const { o } = outils(d, t);
    expect(situerLeLot(o, 'demo-1')).toEqual({ statut: 'closed', raison: 'intégré : abc1234' });
  });
});

describe('la file ne lit plus la CI de la branche', () => {
  it('publishes neither the reading of the runs, nor its conclusion, nor the workflows of the branch', () => {
    const noms = Object.keys(file);
    for (const ancien of [
      'lireLesPassagesDeLaCI',
      'conclureLaCI',
      'fluxDeLaBranche',
      'fluxDuCommit',
      'fluxDeMainAbsentsDeLaBranche',
      'inscrireLesFluxDeMain',
      'relireLesLecturesDues',
      'lecturesDuesDe',
    ]) {
      expect(noms, ancien).not.toContain(ancien);
    }
  });
});
