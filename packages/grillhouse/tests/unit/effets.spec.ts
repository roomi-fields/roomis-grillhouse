// grillhouse-4nr.6.1: the code of the circuit that the workflow of a ticket runs writes nothing
// outside itself; it emits each external effect as data (scripts/effets.mjs), as a functional core
// hands its imperative shell what to write. An effect emitted outside an act is played at once;
// an act of the workflow gathers them, its readings seeing those it emitted, and the workflow
// plays each in an activity of its own, under the key of that activity (src/temporal/acte.ts
// `cleDeLActivite`: its workflow, its run, its activity id), so that an effect played again is
// written once (docs/ARCHITECTURE.md, « une activité, un effet, une clé »).
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
import { afterAll, describe, expect, it, vi } from 'vitest';
import { AVEC_CLE, ecrireLEffet, emettre, jouerLEffet } from '../../scripts/effets.mjs';
import { garder } from '../../scripts/seances.mjs';
import {
  commenter,
  inscrire,
  lesCommentaires,
  lesFiches,
  leTicket,
} from '../../scripts/ticket-du-circuit.mjs';
import { effetsAJouer } from '../../scripts/transitions.mjs';
import { cleDeLActivite } from '../../src/temporal/acte.js';

// The repository of the frame: its architecture names the components of a discovery.
const DEPOT = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'effets-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Reponse = { status: number; stdout: string; stderr: string };
type Ctx = {
  ticket: string;
  tmp: string;
  fiches: string;
  etat: string;
  racine: string;
  paquets: string[];
  bd: (...a: string[]) => Reponse;
  rendus?: { genre: string }[];
};

// A stand-in for bd on the PATH, for scripts/ticket.sh: each call written in <journal>, the ticket
// it creates « demo-9 ».
function fauxBd(dossier: string) {
  const journal = path.join(dossier, 'bd.log');
  const bin = path.join(dossier, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    path.join(bin, 'bd'),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> ${journal}\ncase "$1" in create) echo demo-9;; config) echo demo;; esac\n`
  );
  chmodSync(path.join(bin, 'bd'), 0o755);
  return { journal, bin };
}

// A context of trial: its ticket's comments, title and description in a stand-in that answers as
// bd does (its JSON escaping `<` and `>` as Go's encoder), the discoveries the stand-in on the PATH
// created (listed by their body), its sheets, its state and its working directory.
function essai() {
  const dossier = mkdtempSync(path.join(ESSAIS, 'essai-'));
  const commentaires: { ticket: string; text: string }[] = [];
  const mises: string[][] = [];
  const ticket = { title: '1 — sujet — a', description: 'avant' };
  const { journal, bin } = fauxBd(dossier);
  const bd = (...a: string[]): Reponse => {
    const r = (stdout: string) => ({ status: 0, stdout, stderr: '' });
    if (a[0] === 'comments' && a[1] === 'add') {
      commentaires.push({ ticket: a[2]!, text: a[3]! });
      return r('');
    }
    if (a[0] === 'comments') {
      const lus = commentaires.filter(c => c.ticket === a[1]);
      return r(JSON.stringify(lus).replace(/</g, '\\u003c').replace(/>/g, '\\u003e'));
    }
    if (a[0] === 'list') {
      const marque = a[a.indexOf('--desc-contains') + 1]!;
      const crees = existsSync(journal) ? readFileSync(journal, 'utf8') : '';
      return r(crees.includes(marque) ? '[{"id":"demo-9"}]' : '[]');
    }
    if (a[0] === 'update') {
      mises.push(a);
      return r('');
    }
    return r(JSON.stringify([ticket]));
  };
  const ctx: Ctx = {
    ticket: 'demo-1',
    bd,
    tmp: dossier,
    fiches: path.join(dossier, 'fiches.jsonl'),
    etat: path.join(dossier, 'etat.json'),
    racine: DEPOT,
    paquets: [],
  };
  return { ctx, commentaires, mises, journal, bin };
}

const lignes = (ctx: Ctx) =>
  existsSync(ctx.fiches)
    ? readFileSync(ctx.fiches, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(l => JSON.parse(l) as Record<string, unknown>)
    : [];

// <f> with the stand-in bd on the PATH (scripts/ticket.sh calls it).
function avecBd<T>(bin: string, f: () => T): T {
  const avant = process.env.PATH;
  process.env.PATH = `${bin}:${avant}`;
  try {
    return f();
  } finally {
    process.env.PATH = avant;
  }
}

describe('le code partagé rend ses écritures en effets', () => {
  it('under an act, a comment, a sheet and a discovery are gathered, nothing written', () => {
    const { ctx, commentaires, journal, bin } = essai();
    ctx.rendus = [];
    commenter(ctx, 'tests', 'séance 1 finie');
    inscrire(ctx, { role: 'circuit', resultat: { etape: 'tests' } });
    avecBd(bin, () => {
      garder(
        ctx,
        'developpeur',
        { statut: 'FAIT', decouvertes: [{ sujet: 'un défaut', corps: 'c' }] },
        {}
      );
    });
    expect(ctx.rendus.map(e => e.genre)).toEqual(['commentaire', 'fiche', 'fiche', 'decouverte']);
    expect(commentaires).toEqual([]);
    expect(existsSync(ctx.fiches)).toBe(false);
    expect(existsSync(journal)).toBe(false);
  });

  it('a body @<file> of a discovery is read from its file, the effect carrying its text', () => {
    const { ctx } = essai();
    ctx.rendus = [];
    writeFileSync(path.join(ctx.tmp, 'corps.md'), 'le corps du fichier\n');
    garder(
      ctx,
      'developpeur',
      {
        statut: 'FAIT',
        decouvertes: [{ sujet: 's', corps: `@${path.join(ctx.tmp, 'corps.md')}` }],
      },
      {}
    );
    expect(ctx.rendus.at(-1)).toMatchObject({ genre: 'decouverte', corps: 'le corps du fichier' });
  });

  it('the readings of an act see the comments, the sheets and the plan it emitted', () => {
    const { ctx } = essai();
    ctx.rendus = [];
    commenter(ctx, 'tests', 'x');
    inscrire(ctx, { role: 'circuit', plan: { empreinte: 'e' } });
    emettre(ctx, { genre: 'plan', titre: '1 — sujet — a, b', description: 'après' });
    expect(lesCommentaires(ctx).at(-1)).toEqual({ author: 'circuit', text: 'Circuit · tests : x' });
    expect(lesFiches(ctx).at(-1)).toMatchObject({ plan: { empreinte: 'e' } });
    expect(leTicket(ctx)).toMatchObject({ titre: '1 — sujet — a, b', description: 'après' });
  });

  it('out of an act, each effect is written as it is emitted', () => {
    const { ctx, commentaires } = essai();
    commenter(ctx, 'tests', 'x');
    commenter(ctx, 'tests', 'x');
    inscrire(ctx, { role: 'circuit', resultat: {} });
    expect(commentaires.map(c => c.text)).toEqual(['Circuit · tests : x', 'Circuit · tests : x']);
    expect(lignes(ctx)).toHaveLength(1);
    expect(lignes(ctx)[0]).not.toHaveProperty('cle');
  });
});

describe('un effet rejoué sous la clé de son activité ne s’écrit qu’une fois', () => {
  it('a comment played twice under one key is written once, its key in it; two keys, twice', () => {
    const { ctx, commentaires } = essai();
    const e = {
      genre: 'commentaire',
      ticket: 'demo-1',
      texte: 'Circuit · bilan : b',
      auteur: 'circuit',
    };
    jouerLEffet(ctx, e, 'circuit:r:run-1:effet:3:commentaire');
    jouerLEffet(ctx, e, 'circuit:r:run-1:effet:3:commentaire');
    expect(commentaires).toHaveLength(1);
    expect(commentaires[0]!.text).toContain(
      '<!-- grillhouse : circuit:r:run-1:effet:3:commentaire -->'
    );
    jouerLEffet(ctx, e, 'circuit:r:run-1:effet:4:commentaire');
    expect(commentaires).toHaveLength(2);
  });

  it('a comment at another ticket is looked for at that ticket', () => {
    const { ctx, commentaires } = essai();
    const e = { genre: 'commentaire', ticket: 'demo-7', texte: 't', auteur: 'circuit' };
    jouerLEffet(ctx, e, 'k:1');
    jouerLEffet(ctx, e, 'k:1');
    expect(commentaires.map(c => c.ticket)).toEqual(['demo-7']);
  });

  it('a sheet played twice under one key is one line, its key in it; two keys, two lines', () => {
    const { ctx } = essai();
    const e = {
      genre: 'fiche',
      entree: { date: 'd', role: 'testwriter', fiche: { statut: 'FAIT' } },
    };
    jouerLEffet(ctx, e, 'k:1');
    jouerLEffet(ctx, e, 'k:1');
    expect(lignes(ctx)).toEqual([{ ...e.entree, cle: 'k:1' }]);
    jouerLEffet(ctx, e, 'k:2');
    expect(lignes(ctx)).toHaveLength(2);
  });

  it('a discovery played twice under one key is filed once, its key in its body', () => {
    const { ctx, journal, bin } = essai();
    const e = {
      genre: 'decouverte',
      role: 'circuit',
      sujet: 'un défaut',
      corps: 'le corps',
      composants: 'a',
    };
    avecBd(bin, () => {
      jouerLEffet(ctx, e, 'k:1');
      jouerLEffet(ctx, e, 'k:1');
    });
    const appels = readFileSync(journal, 'utf8');
    expect(appels.match(/^create /gm)).toHaveLength(1);
    expect(appels).toContain('<!-- grillhouse : k:1 -->');
    expect(lignes(ctx).filter(l => l.decouverte)).toEqual([
      expect.objectContaining({ decouverte: { id: 'demo-9', sujet: 'un défaut' }, cle: 'k:1' }),
    ]);
  });

  // grillhouse-4nr.12, decision Q2: the state is no writing out of the workflow, which holds it;
  // no player writes it to a file.
  it('the state is no effect a player writes: the workflow holds it', () => {
    const { ctx } = essai();
    expect(AVEC_CLE.has('etat')).toBe(false);
    expect(() => {
      jouerLEffet(ctx, { genre: 'etat', etat: { etape: 'code' } }, null);
    }).toThrow(/effet inconnu du circuit : etat/);
  });

  it('the plan writes the title and the description that change', () => {
    const { ctx, mises } = essai();
    jouerLEffet(ctx, { genre: 'plan', titre: 't', description: null }, null);
    expect(mises).toEqual([['update', 'demo-1', '--title', 't']]);
  });

  it('an effect of an unknown sort is refused by its name', () => {
    const { ctx } = essai();
    expect(() => {
      jouerLEffet(ctx, { genre: 'autre' }, null);
    }).toThrow(/effet inconnu du circuit : autre/);
  });
});

describe('chaque sorte d’identité de la clé compte', () => {
  const info = {
    workflowExecution: { workflowId: 'circuit:/r:demo-1', runId: 'run-1' },
    activityId: 'effet:3:commentaire',
  };

  it('the key of an activity is its workflow, its run and its activity id', () => {
    expect(cleDeLActivite(info)).toBe('circuit:/r:demo-1:run-1:effet:3:commentaire');
  });

  it('another workflow, another run or another activity id: another key', () => {
    const cle = cleDeLActivite(info);
    const autres = [
      {
        ...info,
        workflowExecution: { ...info.workflowExecution, workflowId: 'circuit:/r:demo-2' },
      },
      { ...info, workflowExecution: { ...info.workflowExecution, runId: 'run-2' } },
      { ...info, activityId: 'effet:4:commentaire' },
    ];
    for (const a of autres) {
      expect(cleDeLActivite(a)).not.toBe(cle);
    }
  });

  it('out of a workflow, no key', () => {
    expect(cleDeLActivite({ workflowExecution: null, activityId: '1' })).toBeNull();
  });
});

describe('les effets que le déroulé joue', () => {
  it('consecutive states are one, the last; every other effect is kept, in its order', () => {
    const effets = [
      { genre: 'etat', n: 1 },
      { genre: 'etat', n: 2 },
      { genre: 'commentaire', n: 3 },
      { genre: 'etat', n: 4 },
      { genre: 'fiche', n: 5 },
      { genre: 'fiche', n: 6 },
    ];
    expect(effetsAJouer(effets).map(e => e.n)).toEqual([2, 3, 4, 5, 6]);
  });
});

// grillhouse-4nr.6.2, renvoi de d827494, point 4: an effect not written has one outcome, out of
// an act (each effect written as it is emitted) and under the workflow (each in its activity, under
// its key) (`ecrireLEffet`).
describe('un effet raté a une seule suite, hors d’un acte et sous le déroulé', () => {
  // <f> with the error output caught: what it wrote there.
  function sortieDErreur(f: () => unknown) {
    const ecrit: string[] = [];
    const espion = vi.spyOn(process.stderr, 'write').mockImplementation(t => {
      ecrit.push(String(t));
      return true;
    });
    try {
      f();
    } finally {
      espion.mockRestore();
    }
    return ecrit.join('');
  }
  const enPanne = (): Reponse => ({ status: 1, stdout: '', stderr: 'bd en panne' });

  it('a comment not written is said on the error output and the circuit goes on, in both', () => {
    const { ctx } = essai();
    ctx.bd = enPanne;
    const effet = { genre: 'commentaire', ticket: 'demo-1', texte: 't', auteur: 'circuit' };
    const aujourdhui = sortieDErreur(() => emettre(ctx, effet));
    const sousSaCle = sortieDErreur(() => ecrireLEffet(ctx, effet, 'k:1'));
    expect(aujourdhui).toMatch(/commentaire non écrit au ticket demo-1 : bd en panne/);
    // Under its key, its reading before it fails the same way: said, the circuit going on.
    expect(sousSaCle).toMatch(/commentaire non écrit au ticket demo-1 : .*bd en panne/);
  });

  it('a plan not written stops, in both', () => {
    const { ctx } = essai();
    ctx.bd = enPanne;
    const effet = { genre: 'plan', titre: 't', description: null };
    expect(() => {
      emettre(ctx, effet);
    }).toThrow(/plan non écrit : bd en panne/);
    expect(() => {
      ecrireLEffet(ctx, effet, 'k:1');
    }).toThrow(/plan non écrit : bd en panne/);
  });
});

// grillhouse-4nr.6.2, renvois de 129c84c et de 92dead5: the tri says the truth.
// Its line is written once its writings are, and reads each discovery when it is written: its
// verdict among its comments, its labels, its status when it reopens it; a writing absent is
// named among those that failed, a discovery still closed is not counted reopened.
describe('le résumé du tri lit ses écritures quand il s’écrit', () => {
  const DEBUT = 'Circuit · tri : 2 découvertes triées — 2 a-porter';
  const ecriture = (decouverte: string) => ({
    decouverte,
    verdict: `Circuit · tri : a-porter — x.`,
    etiquettes: ['a-porter', 'a-valider'],
    rouvre: true,
  });
  const resume = (ids: string[]) => ({
    genre: 'resume-du-tri',
    ticket: 'demo-1',
    debut: DEBUT,
    ecritures: ids.map(ecriture),
  });
  // A context whose bd shows each ticket of <tickets> (its status, its labels, its comments;
  // absent: bd fails, or answers what does not parse for « illisible »).
  type Tenu = { status: string; labels: string[]; dits: string[] } | 'illisible';
  function avecTickets(tickets: Record<string, Tenu>) {
    const { ctx, commentaires } = essai();
    const bd = ctx.bd;
    ctx.bd = (...a: string[]) => {
      const t = a[1] === 'demo-1' || a[1] === 'add' ? null : a[1]!;
      if (t && (a[0] === 'show' || a[0] === 'comments')) {
        const tenu = tickets[t];
        if (!tenu) {
          return { status: 1, stdout: '', stderr: `no issue found: ${t}` };
        }
        if (tenu === 'illisible') {
          return { status: 0, stdout: '{tronqué', stderr: '' };
        }
        return {
          status: 0,
          stdout: JSON.stringify(
            a[0] === 'show'
              ? [{ id: t, status: tenu.status, labels: tenu.labels }]
              : tenu.dits.map(text => ({ text }))
          ),
          stderr: '',
        };
      }
      return bd(...a);
    };
    return { ctx, commentaires };
  }
  const ecrit = { labels: ['a-porter', 'a-valider'], dits: ['Circuit · tri : a-porter — x.'] };

  it('a discovery whose writings took counts; one still closed is named among the failures', () => {
    const { ctx, commentaires } = avecTickets({
      'demo-1.1': { status: 'open', ...ecrit },
      'demo-1.2': { status: 'closed', ...ecrit },
    });
    ecrireLEffet(ctx, resume(['demo-1.1', 'demo-1.2']), 'k:1');
    expect(commentaires.map(c => c.text.split('\n')[0])).toEqual([
      `${DEBUT} ; rouvertes sous a-valider : demo-1.1 ; écritures en échec : demo-1.2 : réouverture (toujours fermée).`,
    ]);
  });

  it('a verdict or a label absent at the discovery is named, as main names them', () => {
    const { ctx, commentaires } = avecTickets({
      'demo-1.1': { status: 'open', labels: ['a-porter'], dits: [] },
    });
    ecrireLEffet(ctx, resume(['demo-1.1']), null);
    expect(commentaires[0]!.text).toBe(
      `${DEBUT} ; rouvertes sous a-valider : demo-1.1 ; écritures en échec : demo-1.1 : verdict (absent), étiquette (absente).`
    );
  });

  it('a ticket bd cannot show, or answers what does not parse, is named with its reason', () => {
    const { ctx, commentaires } = avecTickets({ 'demo-1.3': 'illisible' });
    ecrireLEffet(ctx, resume(['demo-1.2', 'demo-1.3']), null);
    const t = commentaires[0]!.text;
    expect(t).toContain('aucune rouverte');
    expect(t).toMatch(
      /demo-1\.2 : verdict \(.*no issue found: demo-1\.2\), étiquette \(.*no issue found: demo-1\.2\), réouverture \(.*no issue found: demo-1\.2\)/
    );
    expect(t).toMatch(/demo-1\.3 : verdict \(.*illisibles : .*\), étiquette \(.*illisibles/);
  });

  // Remarque sur 69f0ffa: the cause bd gave for a writing that failed is kept, as main keeps it.
  it('a writing that failed is named with the cause bd gave', () => {
    const { ctx, commentaires } = avecTickets({
      'demo-1.1': { status: 'closed', labels: [], dits: [] },
    });
    const bd = ctx.bd;
    ctx.bd = (...a: string[]) =>
      (a[0] === 'comments' && a[1] === 'add' && a[2] === 'demo-1.1') ||
      (a[0] === 'update' && a[1] === 'demo-1.1') ||
      a[0] === 'reopen'
        ? { status: 1, stdout: '', stderr: 'database is locked\nau revoir' }
        : bd(...a);
    const espion = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      emettre(ctx, {
        genre: 'commentaire',
        ticket: 'demo-1.1',
        texte: 'Circuit · tri : a-porter — x.',
      });
      ecrireLEffet(
        ctx,
        { genre: 'etiquettes', ticket: 'demo-1.1', etiquettes: ['a-porter'] },
        'k:2'
      );
      ecrireLEffet(ctx, { genre: 'reouverture', ticket: 'demo-1.1' }, null);
    } finally {
      espion.mockRestore();
    }
    ecrireLEffet(ctx, resume(['demo-1.1']), null);
    expect(commentaires.at(-1)!.text).toBe(
      `${DEBUT} ; aucune rouverte ; écritures en échec : demo-1.1 : verdict (database is locked), étiquette (database is locked), réouverture (database is locked).`
    );
  });

  it('the summary carries its key, written once', () => {
    const { ctx, commentaires } = avecTickets({ 'demo-1.1': { status: 'open', ...ecrit } });
    ecrireLEffet(ctx, resume(['demo-1.1']), 'k:1');
    ecrireLEffet(ctx, resume(['demo-1.1']), 'k:1');
    expect(commentaires).toHaveLength(1);
    expect(AVEC_CLE.has('resume-du-tri')).toBe(true);
  });

  it('a comment whose reading under its key does not parse is said, the circuit going on', () => {
    const { ctx } = essai();
    ctx.bd = () => ({ status: 0, stdout: '{tronqué', stderr: '' });
    const espion = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(() => {
        ecrireLEffet(ctx, { genre: 'commentaire', ticket: 'demo-1', texte: 't' }, 'k:1');
      }).not.toThrow();
    } finally {
      espion.mockRestore();
    }
  });
});

// Remarque de 129c84c: an effect that warns is first tried again by Temporal on a passing failure,
// and warns only at the last attempt of its activity; a discovery whose line among the sheets
// cannot be written stops.
describe('un effet qui avertit profite des reprises de Temporal', () => {
  const enPanne = (): Reponse => ({ status: 1, stdout: '', stderr: 'bd en panne' });
  it('before its last attempt, a comment not written fails its activity; at the last, it warns', () => {
    const { ctx } = essai();
    ctx.bd = enPanne;
    const effet = { genre: 'commentaire', ticket: 'demo-1', texte: 't', auteur: 'circuit' };
    expect(() => {
      ecrireLEffet(ctx, effet, 'k:1', { reessayer: true });
    }).toThrow(/effet commentaire non écrit : .*bd en panne/);
    const espion = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      expect(() => {
        ecrireLEffet(ctx, effet, 'k:1', { reessayer: false });
      }).not.toThrow();
    } finally {
      espion.mockRestore();
    }
  });

  it('a discovery filed, its line among the sheets not written: it stops, in both', () => {
    const { ctx, bin } = essai();
    mkdirSync(ctx.fiches);
    const effet = {
      genre: 'decouverte',
      role: 'circuit',
      sujet: 'Le sujet',
      corps: 'Le corps',
      composants: 'a',
    };
    expect(() => {
      avecBd(bin, () => {
        emettre(ctx, effet);
      });
    }).toThrow();
    expect(() => {
      avecBd(bin, () => {
        ecrireLEffet(ctx, effet, 'k:2');
      });
    }).toThrow();
  });
});
