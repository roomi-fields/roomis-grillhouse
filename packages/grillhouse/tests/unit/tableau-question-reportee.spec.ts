// Une question reportée à une heure (`grillhouse circuit <ticket> --reporter <heure>`) au tableau
// (scripts/tableau.mjs) : celle du superviseur se montre en pause (⏸), « reporté » et son heure,
// jusqu'à cette heure, puis se remontre ; celle du responsable ne se cache jamais (greffon.md
// §5.3). Le report se juge comme `horsAttente` de scripts/superviseur.mjs. Tests petits.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assembler,
  comptesDAgents,
  ensemble,
  etatsDAgents,
  lignes,
} from '../../scripts/tableau.mjs';
import { circuitLu } from './tableau-essai.js';

// Local times: Beads writes `defer_until` at the local wall time, with a « Z » it does not mean.
const a = (jour: number, heure: number, minute: number) =>
  new Date(2026, 10, jour, heure, minute).getTime();
const MAINTENANT = a(28, 13, 0);
const JUSQUA_14H = '2026-11-28T14:00:00Z';

interface Ligne {
  texte: string;
  ticket?: string;
}

const T = (id: string, o: object = {}) => ({
  id,
  title: `${id.slice(id.indexOf('-') + 1)} — Le sujet — packages/demo`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: new Date(a(28, 9, 0)).toISOString(),
  labels: ['circuit'],
  ...o,
});
const differe = (defer_until = JUSQUA_14H, status = 'deferred') => ({ status, defer_until });
const auSuperviseur = (ticket: string, c: Record<string, unknown> = {}) =>
  circuitLu(ticket, {
    etape: 'controles',
    code: 14,
    arret: 'controles',
    question: 'Quel paquet lève ce rouge ?',
    qui: 'superviseur',
    numero: 1,
    ...c,
  });
const finiSansIssue = (ticket: string) =>
  circuitLu(ticket, { etape: 'controles', interrompu: true, sansIssue: true });
const entree = (ticket: string, reste: object = {}) => ({
  cle: `${ticket}:run-${ticket}:1:controles`,
  depuis: a(28, 10, 0),
  presentee: a(28, 10, 0),
  ...reste,
});

const plateau = (
  ticket: object,
  circuit: object,
  { maintenant = MAINTENANT, remontees = [entree('demo-1')], prefix = 'demo' } = {}
) =>
  assembler({
    tous: [ticket],
    prefix,
    registre: [],
    vivants: [],
    circuits: [circuit],
    remontees,
    maintenant,
    jour: a(28, 0, 0),
  } as unknown as Parameters<typeof assembler>[0]);

type Tableau = object;
interface Etat {
  signe: string;
  ton: string;
  raison: string;
}
const vue = (t: Tableau) => (lignes(t, 'demo', 120) as Ligne[]).map(l => l.texte.trimEnd());
const ligneDe = (t: Tableau, id: string) =>
  (lignes(t, 'demo', 120) as Ligne[]).find(l => l.ticket === id)?.texte ?? '';
const etatDe = (t: Tableau, id = 'demo-1') => etatsDAgents(t).circuits.get(id) as Etat | undefined;
const montreLeReport = (t: Tableau, raison: string) => {
  expect(etatDe(t)).toMatchObject({ signe: '⏸', ton: 'discret', raison });
  expect(ligneDe(t, 'demo-1')).toMatch(/^⏸ 1 /);
  expect(ligneDe(t, 'demo-1')).toContain(`· ${raison}`);
  const l = vue(t);
  expect(l.filter(x => x.includes('⤷ Question'))).toEqual([]);
  expect(l.filter(x => x.includes('❓'))).toEqual([]);
  expect(l.filter(x => x.includes('⛔'))).toEqual([]);
  expect(l.filter(x => /attend le superviseur/.test(x))).toEqual([]);
  expect(l.find(x => x.startsWith('toi : '))).toMatch(/ 0 question$/);
  expect(comptesDAgents(t)).toEqual({ enCours: 0, enAttente: 1, arretes: 0 });
};
const montreLaQuestion = (t: Tableau) => {
  expect(etatDe(t)).toMatchObject({ raison: 'question au superviseur', ton: 'attention' });
  expect(vue(t).filter(x => x.includes('⤷ Question · superviseur'))).toHaveLength(1);
  expect(vue(t).filter(x => /attend le superviseur/.test(x))).toHaveLength(1);
  expect(ligneDe(t, 'demo-1')).not.toContain('reporté');
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('la question au superviseur reportée à une heure future', () => {
  it('se montre en pause, « reporté » et l’heure du jour, sans question ni alerte', () => {
    montreLeReport(plateau(T('demo-1', differe()), auSuperviseur('demo-1')), 'reporté 14:00');
  });

  it('dit le jour et l’heure d’un report à un autre jour', () => {
    const t = plateau(T('demo-1', differe('2026-11-29T08:05:00Z')), auSuperviseur('demo-1'));
    montreLeReport(t, 'reporté 29/11 08:05');
  });

  it('se tait aussi pour une question sans destinataire', () => {
    const t = plateau(T('demo-1', differe()), auSuperviseur('demo-1', { qui: null }));
    montreLeReport(t, 'reporté 14:00');
  });

  it('se montre en pause pour un déroulé fini sans son issue', () => {
    montreLeReport(plateau(T('demo-1', differe()), finiSansIssue('demo-1')), 'reporté 14:00');
  });

  it('ne compte pas dans la ligne d’état', () => {
    const t = plateau(T('demo-1', differe()), auSuperviseur('demo-1'));
    expect(comptesDAgents(t).arretes).toBe(0);
    expect(comptesDAgents(t).enAttente).toBe(1);
  });
});

describe('la question au superviseur se remontre', () => {
  it('une fois l’heure du report passée, le ticket resté différé', () => {
    const t = plateau(T('demo-1', differe()), auSuperviseur('demo-1'), {
      maintenant: a(28, 14, 1),
    });
    montreLaQuestion(t);
  });

  it('à l’instant même de l’heure du report', () => {
    const t = plateau(T('demo-1', differe()), auSuperviseur('demo-1'), {
      maintenant: a(28, 14, 0),
    });
    montreLaQuestion(t);
  });

  it('pour un ticket fermé dont le circuit attend, même reporté', () => {
    montreLaQuestion(plateau(T('demo-1', differe(JUSQUA_14H, 'closed')), auSuperviseur('demo-1')));
  });

  it('pour un déroulé fini sans son issue dont l’heure est passée', () => {
    const t = plateau(T('demo-1', differe()), finiSansIssue('demo-1'), {
      maintenant: a(28, 14, 1),
    });
    expect(etatDe(t)).toMatchObject({ signe: '⛔', raison: 'fini sans son issue' });
  });
});

describe('une question au responsable ne se cache jamais', () => {
  it.each([
    ['qui le nomme d’emblée', { qui: 'responsable' }, entree('demo-1')],
    ['portée à lui', {}, entree('demo-1', { chez: a(28, 12, 44) })],
  ])('reportée, la question %s garde sa ligne ❓ et son compte', (_cas, c, remontee) => {
    const t = plateau(T('demo-1', differe()), auSuperviseur('demo-1', c), {
      remontees: [remontee],
    });
    const l = vue(t);
    expect(l.filter(x => x.startsWith('❓'))).toHaveLength(1);
    expect(l.find(x => x.startsWith('toi : '))).toMatch(/ 1 question$/);
    expect(l.filter(x => x.includes('⤷ Question · responsable'))).toHaveLength(1);
    expect(etatDe(t)?.raison).toBe('question au responsable');
  });
});

describe('l’heure du report que Beads écrit, à Paris', () => {
  // `--reporter +6h` saisi à 15:28 : Beads écrit `defer_until` à « …T21:28:00Z ».
  const aParis = (heure: number, minute: number) => {
    vi.stubEnv('TZ', 'Europe/Paris');
    return plateau(T('demo-1', differe('2026-11-28T21:28:00Z')), auSuperviseur('demo-1'), {
      maintenant: a(28, heure, minute),
    });
  };

  it('se montre reportée à 21:28 à 21:27', () => {
    montreLeReport(aParis(21, 27), 'reporté 21:28');
  });

  it('se montre en question à 21:29', () => {
    montreLaQuestion(aParis(21, 29));
  });
});

describe('le report sur un tableau de plusieurs projets', () => {
  const deux = () =>
    ensemble([
      {
        etiquette: 'A',
        t: plateau(T('A-1', differe()), auSuperviseur('A-1'), {
          prefix: 'A',
          remontees: [entree('A-1')],
        }),
      },
      {
        etiquette: 'B',
        t: plateau(T('B-1', differe()), auSuperviseur('B-1', { qui: 'responsable' }), {
          prefix: 'B',
          remontees: [entree('B-1')],
        }),
      },
    ] as Parameters<typeof ensemble>[0]) as Tableau;

  it('met en pause la seule question au superviseur, celle au responsable gardée', () => {
    const t = deux();
    expect(etatDe(t, 'A-1')).toMatchObject({
      signe: '⏸',
      ton: 'discret',
      raison: 'reporté 14:00',
    });
    expect(ligneDe(t, 'A-1')).toMatch(/⏸/);
    expect(ligneDe(t, 'A-1')).toContain('reporté 14:00');
    const l = vue(t);
    expect(l.filter(x => x.includes('⤷ Question · superviseur'))).toEqual([]);
    expect(l.filter(x => /attend le superviseur/.test(x))).toEqual([]);
    const questions = l.filter(x => x.startsWith('❓'));
    expect(questions).toHaveLength(1);
    expect(questions[0]).toContain('[B]');
    expect(l.find(x => /^\[A\] +toi : /.test(x))).toMatch(/ 0 question$/);
    expect(l.find(x => /^\[B\] +toi : /.test(x))).toMatch(/ 1 question$/);
  });
});
