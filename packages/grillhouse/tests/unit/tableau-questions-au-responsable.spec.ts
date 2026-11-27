// The head of the board shows, under its line « toi », one line per question that waits for the
// owner: a stopped circuit whose question was carried to him (`--chez-le-responsable`, the field
// `chez` of the file of the stops gone up) or names him from the start (`qui`):
//   ❓ 266  Le panneau montre en per… · depuis 12:44
// « N question » of the line « toi » counts those same questions. The line stays while the view of
// the circuit waits for its answer.
import { describe, expect, it } from 'vitest';
import { assembler, ensemble, LARGEUR, lignes, TONS } from '../../scripts/tableau.mjs';
import { circuitLu } from './tableau-essai.js';

// Local times: the board writes the local hour and day.
const a = (jour: number, heure: number, minute: number, mois = 11) =>
  new Date(2026, mois - 1, jour, heure, minute).getTime();
const MAINTENANT = a(27, 15, 30);
const CHEZ = a(27, 12, 44);

interface Ligne {
  texte: string;
  ton?: string;
}
interface Entree {
  cle: string;
  depuis: number;
  presentee: number;
  lue?: number;
  chez?: number;
}

const SUJET = 'Le panneau montre en permanence chaque question qui attend le responsable';
const T = (id: string, sujet = 'Le sujet', o: object = {}) => ({
  id,
  title: `${id.slice(id.indexOf('-') + 1)} — ${sujet} — packages/demo`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: new Date(a(27, 9, 0)).toISOString(),
  labels: ['circuit'],
  ...o,
});
// A circuit stopped on a question, to the supervisor unless <c> says otherwise.
const arrete = (ticket: string, c: Record<string, unknown> = {}) =>
  circuitLu(ticket, {
    etape: 'controles',
    code: 14,
    arret: 'controles',
    question: 'Quel paquet lève ce rouge ?',
    qui: 'superviseur',
    numero: 1,
    ...c,
  });
const entree = (ticket: string, reste: Partial<Entree> = {}, numero = 1): Entree => ({
  cle: `${ticket}:run-${ticket}:${numero}:controles`,
  depuis: a(27, 10, 0),
  presentee: a(27, 10, 0),
  ...reste,
});
// The question of <ticket> carried to the owner at <chez>.
const porte = (ticket: string, chez = CHEZ) => entree(ticket, { lue: a(27, 10, 1), chez });

const plateau = (
  tous: object[],
  circuits: object[],
  remontees: Entree[] = [],
  { prefix = 'demo', ...o }: Record<string, unknown> = {}
) =>
  assembler({
    tous,
    prefix,
    registre: [],
    vivants: [],
    circuits,
    remontees,
    maintenant: MAINTENANT,
    jour: a(27, 0, 0),
    ...o,
  } as Parameters<typeof assembler>[0]);

// One ticket demo-266, its circuit <c>, the file of the stops gone up <remontees>.
const un = (c: Record<string, unknown> = {}, remontees: Entree[] = [porte('demo-266')]) =>
  plateau([T('demo-266', 'Court')], [arrete('demo-266', c)], remontees);

type Tableau = Parameters<typeof lignes>[0];
const toutes = (t: Tableau, largeur = LARGEUR) =>
  (lignes(t, 'demo', largeur) as Ligne[]).map(x => ({ texte: x.texte.trimEnd(), ton: x.ton }));
const questions = (t: Tableau, largeur = LARGEUR) =>
  toutes(t, largeur)
    .map(x => x.texte)
    .filter(x => x.startsWith('❓'));
const toi = (t: Tableau) => toutes(t).filter(x => x.texte.includes('toi : '));
const compte = (t: Tableau) => toi(t).map(x => Number(/(\d+) question$/.exec(x.texte)?.[1]));
// The columns of a line in a terminal, « ❓ » taking two.
const colonnes = (s: string) => s.length + (s.match(/❓/g)?.length ?? 0);

describe('the head shows each question that waits for the owner', () => {
  it('puts « ❓ <number>  <subject> · depuis <HH:MM> » between the line « toi » and the line « file »', () => {
    const l = toutes(un());
    expect(l.slice(1, 4).map(x => x.texte)).toEqual([
      'toi : 0 sans go · 0 à valider · 1 question',
      '❓ 266  Court · depuis 12:44',
      'file : ● 0 · ✎ 0 · ⧗ 0 · ⊘ 0',
    ]);
    expect(l[2]?.ton).toBe(TONS.attendLeResponsable);
    expect(l[2]?.ton).toBe('attention');
    expect(l[1]?.ton).toBe('attention');
  });

  it('writes one line per question, in the tickets’ order, all in the tone « attention »', () => {
    const ids = ['demo-10', 'demo-2', 'demo-7'];
    const t = plateau(
      ids.map(id => T(id, `Sujet ${id}`)),
      ids.map(id => arrete(id)),
      [porte('demo-10', a(27, 9, 5)), porte('demo-2'), porte('demo-7', a(27, 14, 0))]
    );
    const l = toutes(t);
    expect(l.slice(1, 6).map(x => x.texte)).toEqual([
      'toi : 0 sans go · 0 à valider · 3 question',
      '❓ 2  Sujet demo-2 · depuis 12:44',
      '❓ 7  Sujet demo-7 · depuis 14:00',
      '❓ 10  Sujet demo-10 · depuis 09:05',
      'file : ● 0 · ✎ 0 · ⧗ 0 · ⊘ 0',
    ]);
    expect(l.slice(2, 5).map(x => x.ton)).toEqual(['attention', 'attention', 'attention']);
  });

  it('shows a question whose circuit names the owner from the start, never carried by the supervisor', () => {
    const t = un({ qui: 'responsable' }, [entree('demo-266', { depuis: a(27, 11, 7) })]);
    expect(questions(t)).toEqual(['❓ 266  Court · depuis 11:07']);
    expect(compte(t)).toEqual([1]);
  });

  it('shows a stop without a question’s text that names the owner', () => {
    const t = un({ question: null, qui: 'responsable' }, []);
    expect(questions(t)).toEqual(['❓ 266  Court']);
    expect(compte(t)).toEqual([1]);
  });

  it('shows a circuit ended without its issue whose answer is the owner’s', () => {
    const t = un({ interrompu: true, sansIssue: true, qui: 'responsable' }, []);
    expect(questions(t)).toEqual(['❓ 266  Court']);
    expect(compte(t)).toEqual([1]);
  });

  it('shows the question of a ticket closed before its integration, its circuit waiting for the owner', () => {
    const t = plateau(
      [T('demo-266', 'Court', { status: 'closed', closed_at: new Date(CHEZ).toISOString() })],
      [arrete('demo-266')],
      [porte('demo-266')]
    );
    expect(questions(t)).toEqual(['❓ 266  Court · depuis 12:44']);
    expect(compte(t)).toEqual([1]);
  });

  it('shows the question of a ticket labelled « direct », which AGENTS shows « en direct », and counts it', () => {
    const t = plateau(
      [T('demo-266', 'Court', { labels: ['direct'] })],
      [arrete('demo-266')],
      [porte('demo-266')]
    );
    expect(questions(t)).toEqual(['❓ 266  Court · depuis 12:44']);
    expect(compte(t)).toEqual([1]);
    expect(toutes(t).some(x => x.texte.includes('· en direct'))).toBe(true);
  });

  it('shows the question of a « direct » ticket that names the owner from the start', () => {
    const t = plateau(
      [T('demo-266', 'Court', { labels: ['direct'] })],
      [arrete('demo-266', { qui: 'responsable' })]
    );
    expect(questions(t)).toEqual(['❓ 266  Court']);
    expect(compte(t)).toEqual([1]);
  });
});

describe('only a question that waits for the owner has its line and its count', () => {
  const rien = (t: Tableau) => {
    expect(questions(t)).toEqual([]);
    expect(compte(t)).toEqual([0]);
    expect(toi(t)[0]?.ton).toBe('discret');
  };

  it('a question to the supervisor, sent or read, has neither', () => {
    rien(un({}, []));
    rien(un({}, [entree('demo-266', { lue: a(27, 10, 1) })]));
  });

  it('a stop that names no one has neither', () => {
    rien(un({ qui: null }, []));
    rien(un({ qui: null, question: null }, [entree('demo-266')]));
  });

  it('a circuit ended without its issue, to the supervisor or to no one, has neither', () => {
    rien(un({ interrompu: true, sansIssue: true }, []));
    rien(un({ interrompu: true, sansIssue: true, qui: null }, []));
  });

  it('a stopped circuit whose pass is frozen has neither when the owner is not asked, both when he is', () => {
    const figee = {
      machine: {
        budget: null,
        attentes: [],
        prises: [
          {
            projet: 'demo',
            ticket: 'demo-266',
            sorte: 'Tests',
            depuis: a(27, 12, 0),
            avancement: { faits: 1, prevus: 4, dernier: a(27, 12, 0) },
          },
        ],
      },
    };
    const gele = (qui: string) =>
      plateau([T('demo-266', 'Court')], [arrete('demo-266', { qui })], [], figee);
    expect(questions(gele('superviseur'))).toEqual([]);
    expect(compte(gele('superviseur'))).toEqual([0]);
    expect(questions(gele('responsable'))).toEqual(['❓ 266  Court']);
    expect(compte(gele('responsable'))).toEqual([1]);
  });

  it('counts the owner’s questions alone beside the supervisor’s', () => {
    const t = plateau(
      [T('demo-1'), T('demo-2'), T('demo-3')],
      [arrete('demo-1'), arrete('demo-2'), arrete('demo-3', { interrompu: true, sansIssue: true })],
      [porte('demo-2')]
    );
    expect(questions(t)).toEqual(['❓ 2  Le sujet · depuis 12:44']);
    expect(compte(t)).toEqual([1]);
  });
});

describe('the line leaves with the answer', () => {
  const sans = (c: Record<string, unknown>) => {
    // The file of the stops gone up still holds the stop and its mark.
    const t = un(c);
    expect(questions(t)).toEqual([]);
    expect(compte(t)).toEqual([0]);
  };

  it('stays while the circuit waits for its answer, however long', () => {
    const t = un({}, [porte('demo-266', a(1, 8, 0))]);
    expect(questions(t)).toEqual(['❓ 266  Court · depuis 01/11']);
  });

  it('leaves, with its count, once the circuit runs again', () => {
    expect(questions(un())).toHaveLength(1);
    sans({ vivant: true, question: null, arret: null, qui: null });
    sans({ vivant: true });
  });

  it('leaves once the view of the circuit holds no question nor stop, or says the supervisor stopped it, or integrated', () => {
    expect(questions(un())).toHaveLength(1);
    sans({ question: null, arret: null, qui: null });
    sans({ question: null, arret: 'arrete', qui: null });
    sans({ integre: true });
  });

  it('does not come back with the next stop of the same circuit, to the supervisor', () => {
    expect(questions(un())).toHaveLength(1);
    const t = un({ numero: 2 }, [porte('demo-266'), entree('demo-266', {}, 2)]);
    expect(questions(t)).toEqual([]);
    expect(compte(t)).toEqual([0]);
    const pasEncoreRelevee = un({ numero: 2 });
    expect(questions(pasEncoreRelevee)).toEqual([]);
    expect(compte(pasEncoreRelevee)).toEqual([0]);
  });
});

describe('a deferral is no answer', () => {
  const differe = {
    status: 'deferred',
    defer_until: new Date(a(28, 8, 0)).toISOString(),
  };

  it('keeps the line, its « depuis » and its count of a question carried to the owner', () => {
    const t = plateau([T('demo-266', 'Court', differe)], [arrete('demo-266')], [porte('demo-266')]);
    expect(questions(t)).toEqual(['❓ 266  Court · depuis 12:44']);
    expect(compte(t)).toEqual([1]);
  });

  it('keeps them for a question that names the owner from the start', () => {
    const t = plateau(
      [T('demo-266', 'Court', differe)],
      [arrete('demo-266', { qui: 'responsable' })],
      [entree('demo-266', { depuis: a(27, 11, 7) })]
    );
    expect(questions(t)).toEqual(['❓ 266  Court · depuis 11:07']);
    expect(compte(t)).toEqual([1]);
  });
});

describe('the hour after « depuis » comes from the follow-up of the questions', () => {
  it('is the time the question was carried to the owner, not its first going up', () => {
    const t = un({}, [entree('demo-266', { depuis: a(27, 8, 15), chez: a(27, 13, 2) })]);
    expect(questions(t)).toEqual(['❓ 266  Court · depuis 13:02']);
  });

  it('is the time of its first going up when it was never carried, not its last sending', () => {
    const t = un({ qui: 'responsable' }, [
      entree('demo-266', { depuis: a(27, 8, 15), presentee: a(27, 14, 50), lue: a(27, 14, 51) }),
    ]);
    expect(questions(t)).toEqual(['❓ 266  Court · depuis 08:15']);
  });

  it('is written on two digits, local', () => {
    expect(questions(un({}, [porte('demo-266', a(27, 0, 7))]))).toEqual([
      '❓ 266  Court · depuis 00:07',
    ]);
  });

  it('is the date « jj/mm » for a question of another day, even a few minutes old', () => {
    const veille = un({}, [porte('demo-266', a(26, 23, 59))]);
    veille.maintenant = a(27, 0, 5);
    expect(questions(veille)).toEqual(['❓ 266  Court · depuis 26/11']);
    expect(questions(un({}, [porte('demo-266', a(6, 12, 44))]))).toEqual([
      '❓ 266  Court · depuis 06/11',
    ]);
    // The same day of another month is another day.
    expect(questions(un({}, [porte('demo-266', a(27, 12, 44, 10))]))).toEqual([
      '❓ 266  Court · depuis 27/10',
    ]);
  });

  it('is left out, the line kept, for a question absent from the follow-up', () => {
    const t = un({ qui: 'responsable' }, [entree('demo-1')]);
    expect(questions(t)).toEqual(['❓ 266  Court']);
    expect(compte(t)).toEqual([1]);
  });
});

describe('the subject alone is cut to the width of the pane', () => {
  const long = (largeur: number, remontees = [porte('demo-266')]) =>
    questions(
      plateau([T('demo-266', SUJET)], [arrete('demo-266', { qui: 'responsable' })], remontees),
      largeur
    )[0] ?? '';

  it.each([LARGEUR, 40, 70])(
    'keeps « ❓ », the number and « · depuis … » whole at %i columns',
    n => {
      const l = long(n);
      const m = /^❓ 266 {2}(.+)… · depuis 12:44$/.exec(l);
      expect(m).not.toBeNull();
      expect(SUJET.startsWith(m![1]!)).toBe(true);
      expect(colonnes(l)).toBeLessThanOrEqual(n);
    }
  );

  it('gives the subject the room a wider pane leaves it', () => {
    expect(long(LARGEUR)).toContain('Le panneau montre en per');
    expect(long(70).length).toBeGreaterThan(long(LARGEUR).length);
    expect(long(200)).toBe(`❓ 266  ${SUJET} · depuis 12:44`);
  });

  it('writes whole a subject that fits exactly in the width', () => {
    // « ❓ 266  » takes 8 columns and « · depuis 12:44 » with its space 15.
    const juste = 'x'.repeat(LARGEUR - 8 - 15);
    const t = plateau([T('demo-266', juste)], [arrete('demo-266')], [porte('demo-266')]);
    expect(questions(t)).toEqual([`❓ 266  ${juste} · depuis 12:44`]);
  });

  it('cuts a long subject to the width without « · depuis … » too', () => {
    const l = long(LARGEUR, []);
    expect(l).toMatch(/^❓ 266 {2}Le panneau montre en per.*…$/);
    expect(colonnes(l)).toBeLessThanOrEqual(LARGEUR);
  });
});

describe('a board of several projects puts each question under its project’s line « toi »', () => {
  const projet = (etiquette: string, ids: string[], remontees: Entree[]) => ({
    etiquette,
    t: plateau(
      ids.map(id => T(id)),
      ids.map(id => arrete(id)),
      remontees,
      { prefix: etiquette }
    ),
  });
  const trois = () =>
    ensemble([
      projet('OB', ['OB-4'], []),
      projet('OSD', ['OSD-sf1.25.41'], [porte('OSD-sf1.25.41', a(27, 9, 48))]),
      projet('SH', ['SH-10', 'SH-2'], [porte('SH-10', a(26, 9, 0)), porte('SH-2')]),
    ]);

  it('writes « ❓ [label] <number>  <subject> · depuis … » after its project’s « toi », each project counting its own', () => {
    const l = toutes(trois()).slice(1, 13);
    expect(l.map(x => x.texte)).toEqual([
      '[OB]  toi : 0 sans go · 0 à valider · 0 question',
      '      file : ● 0 · ✎ 0 · ⧗ 0 · ⊘ 0',
      '      en cours : ▶ 1 · ✓ 0 · ⏸ 0',
      '[OSD] toi : 0 sans go · 0 à valider · 1 question',
      '❓ [OSD] sf1.25.41  Le sujet · depuis 09:48',
      '      file : ● 0 · ✎ 0 · ⧗ 0 · ⊘ 0',
      '      en cours : ▶ 1 · ✓ 0 · ⏸ 0',
      '[SH]  toi : 0 sans go · 0 à valider · 2 question',
      '❓ [SH] 2  Le sujet · depuis 12:44',
      '❓ [SH] 10  Le sujet · depuis 26/11',
      '      file : ● 0 · ✎ 0 · ⧗ 0 · ⊘ 0',
      '      en cours : ▶ 2 · ✓ 0 · ⏸ 0',
    ]);
    expect([l[4], l[8], l[9]].map(x => x?.ton)).toEqual(['attention', 'attention', 'attention']);
  });

  it('cuts the subject alone, label, number and « depuis » whole', () => {
    const t = ensemble([
      {
        etiquette: 'OSD',
        t: plateau(
          [T('OSD-sf1.25.41', SUJET)],
          [arrete('OSD-sf1.25.41')],
          [porte('OSD-sf1.25.41')],
          { prefix: 'OSD' }
        ),
      },
    ]);
    const [l = ''] = questions(t);
    expect(l).toMatch(/^❓ \[OSD\] sf1\.25\.41 {2}Le panneau.*… · depuis 12:44$/);
    expect(colonnes(l)).toBeLessThanOrEqual(LARGEUR);
  });

  it('shows and counts the « direct » ticket of one project without touching the others', () => {
    const t = ensemble([
      projet('OB', ['OB-4'], []),
      {
        etiquette: 'SH',
        t: plateau(
          [T('SH-3', 'Le sujet', { labels: ['direct'] })],
          [arrete('SH-3')],
          [porte('SH-3')],
          { prefix: 'SH' }
        ),
      },
    ]);
    expect(questions(t)).toEqual(['❓ [SH] 3  Le sujet · depuis 12:44']);
    expect(compte(t)).toEqual([0, 1]);
  });
});
