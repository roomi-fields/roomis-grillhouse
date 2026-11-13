// The circuit of a ticket on the board (scripts/circuit.mjs), as the Temporal server gives it
// (scripts/circuits-du-serveur.mjs; here a reading made of the states each test names, the server's
// own reading proved by tests/temporal/circuit.nuit.spec.ts). A circuit's ticket stands on one line, the only one of it in AGENTS, at the step of its state
// (scripts/etapes.mjs); one that stopped on a question for the supervisor stands under its step,
// after the line « ⤷ Question · <qui> », who must answer it (grillhouse-3uv.95.4), its card opening
// on that question; one stopped without a question's text (« à repasser » among them) stands there
// too (grillhouse-pq6: one rule of the questions that wait for the supervisor), its card opening
// on where it stopped, its stop's name and code and the first line of its reason; one the
// supervisor stopped (« arrete ») stands at its step.
import { describe, expect, it } from 'vitest';
import { assembler, fiches, lignes } from '../../scripts/tableau.mjs';
import { circuitLu } from './tableau-essai.js';

const MIN = 60_000;
const at = (hm: string) => `2026-10-18T${hm}:00Z`;
const MAINTENANT = Date.parse(at('12:00'));

interface Ligne {
  texte: string;
  ton?: string;
  ticket?: string;
  section?: string;
}
interface Board {
  alertes: { texte: string }[];
  agents: { roles: string[]; enCours: { id: string }[] }[];
}

// The states of the circuits <etats> names, by ticket, in the words of the circuit's state.
interface Etat {
  etape?: string;
  tentative?: number;
  code?: number | null;
  raison?: string | null;
  rapport?: string | null;
  finale?: boolean;
  question?: Record<string, string> | null;
  questionnement?: Record<string, string> | null;
  boucles?: Record<string, number>;
  mene?: string;
}
const depot = (etats: Record<string, Etat>) => etats;
// The circuits <etats> as the server gives them, those of <vivants> running: a workflow ended with
// neither a code nor a stop ended without its issue (`interrompu`), its question the resumption.
const circuits = (etats: Record<string, Etat>, ...vivants: string[]) =>
  Object.entries(etats).map(([ticket, e]) => {
    const vivant = vivants.includes(ticket);
    const interrompu = !vivant && (e.code ?? null) === null && !e.raison;
    return circuitLu(ticket, {
      etape: e.etape ?? 'testwriter',
      tentative: e.tentative ?? 1,
      finale: e.finale === true,
      code: e.code ?? null,
      arret: e.raison ?? null,
      raison:
        String(e.rapport ?? '')
          .split('\n')
          .map(x => x.trim())
          .find(Boolean) ?? null,
      question: interrompu
        ? 'Le déroulé du circuit a fini sans son issue (TERMINATED), aucun arrêt écrit.'
        : (e.question?.question ?? null),
      qui: interrompu ? 'superviseur' : (e.question?.qui ?? null),
      questionnement: e.questionnement?.objet ?? null,
      boucles: e.boucles ?? {},
      mene: e.mene ? Date.parse(e.mene) : null,
      vivant,
      interrompu,
      sansIssue: interrompu,
      reponse: interrompu
        ? `npx grillhouse circuit ${ticket} --reprendre\` ou \`--depuis <testwriter|developpeur> --contexte <texte>`
        : `npx grillhouse circuit ${ticket} --reprendre`,
    });
  });

const T = (id: string, o: object = {}) => ({
  id,
  title: `${id.slice(5)} — Le sujet de ${id} — packages/demo`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: at('07:00'),
  labels: ['circuit'],
  ...o,
});
const fin = (agent: string, ticket: string, role: string, hm: string) => ({
  projet: '/depot',
  agent,
  ticket,
  role,
  debut: at('08:00'),
  fin: at(hm),
  travail: Date.parse(at(hm)) - Date.parse(at('08:00')),
  jetons: 10,
  cache: 0,
  cout: null,
});
const plateau = (tous: object[], registre: object[], vivants: object[], lus: object[]): Board =>
  assembler({
    tous,
    prefix: 'demo',
    registre,
    vivants,
    circuits: lus,
    maintenant: MAINTENANT,
    jour: MAINTENANT - 24 * 60 * MIN,
  }) as Board;
// The text of the card of <id> on the board <t> of the tickets <tous>, as the pane receives it.
const carte = (t: Board, tous: object[], id: string) =>
  (
    fiches(tous, lignes(t, 'depot'), '', {}, (t as { circuits?: object[] }).circuits) as Record<
      string,
      { resume: string }
    >
  )[id]?.resume ?? '';
const lignesAgents = (t: Board) =>
  (lignes(t, 'depot') as Ligne[]).filter(x => x.section === 'agents');
const agents = (t: Board) => lignesAgents(t).map(x => x.texte.trimEnd());
const QUESTION = '  ⤷ Question · superviseur';
// The reason of a circuit that waits for the supervisor, at the end of its line.
const TAG = ' · question au superviseur';
// The panel is 52 columns wide: the subject gives way, the reason stays at the end of the line.
const ENATTENTE13 = /^⏸ 13 {2}Le su.* · question au superviseur$/;
// The question of a stop, as scripts/circuit.mjs keeps it in the state.
const question = (o: object = {}) => ({
  arret: 'controles',
  fait: 'Le test « tableau » reste rouge.',
  piece: 'packages/demo/test/tableau.test.ts:3',
  question: 'Quel paquet lève ce rouge ?',
  qui: 'superviseur',
  ...o,
});

describe("a circuit's line carries its ticket's working time and tokens", () => {
  const registre = [fin('a1', 'demo-12', 'testwriter', '09:00')];
  it('a circuit that runs: at its step, then the time and tokens so far', () => {
    const racine = depot({
      'demo-12': { etape: 'developpeur', tentative: 2 },
    });
    const t = plateau([T('demo-12')], registre, [], circuits(racine, 'demo-12'));
    const a = agents(t);
    expect(a[a.indexOf('▾ 3 · Code · développeur') + 1]).toMatch(
      /^▶ 12 {2}Le sujet de demo-12 +1 h 00 · 10$/
    );
  });

  it('a circuit that stopped: under its step, then the time and tokens so far', () => {
    const racine = depot({
      'demo-12': {
        etape: 'controles',
        code: 14,
        raison: 'controles',
        rapport: 'Rouge.',
        question: question(),
      },
    });
    const t = plateau([T('demo-12')], registre, [], circuits(racine));
    const a = agents(t);
    const i = a.indexOf('  3.1 · Contrôles · auto');
    expect(a[i + 1]).toBe(QUESTION);
    expect(a[i + 2]).toMatch(/^⏸ 12 {2}Le su.* · question au superviseur +1 h 00 · 10$/);
  });
});

describe('a circuit that runs: its step and its attempt', () => {
  it('its state and its process make it run, at the step and attempt of the state', () => {
    const racine = depot({
      'demo-12': { etape: 'developpeur', tentative: 2 },
    });
    expect(circuits(racine, 'demo-12')).toEqual([
      expect.objectContaining({
        ticket: 'demo-12',
        etape: 'developpeur',
        tentative: 2,
        vivant: true,
      }),
    ]);
  });

  it('the board draws it on one line at its step: its subject, alone', () => {
    const racine = depot({
      'demo-12': { etape: 'developpeur', tentative: 2 },
    });
    const t = plateau([T('demo-12')], [], [], circuits(racine, 'demo-12'));
    const a = agents(t);
    expect(a).not.toContain('circuits');
    const i = a.indexOf('▾ 3 · Code · développeur');
    expect(i).toBeGreaterThan(-1);
    expect(a[i + 1]).toBe('▶ 12  Le sujet de demo-12');
    expect(lignesAgents(t)[i + 1]).not.toHaveProperty('alterne');
    expect(lignesAgents(t)[i + 1]).toMatchObject({ ton: 'actif', ticket: 'demo-12' });
    expect(a.filter(x => x.includes('Le sujet de demo-12'))).toHaveLength(1);
  });

  it('each step of the state stands at its numbered step, the automatic ones included', () => {
    const sous = (etape: string) => {
      const racine = depot({ 'demo-12': { etape } });
      const a = agents(plateau([T('demo-12')], [], [], circuits(racine, 'demo-12')));
      const i = a.findIndex(x => x.includes('Le sujet de demo-12'));
      return [...a.slice(0, i)].reverse().find(x => /^ *\d+(\.\d+)? · /.test(x));
    };
    expect(sous('preuve')).toBe('  2.1 · Preuve du rouge · auto');
    expect(sous('controles')).toBe('  3.1 · Contrôles · auto');
    expect(sous('relecture')).toBe('  4.3 · Relecture · relecteur');
    expect(sous('integration')).toBe('  5.1 · Commit · auto');
    expect(sous('file')).toBe('  5.2 · File : main, poussée, CI · auto');
  });

  it('the checks once `finale` are the final pass, step 4.1', () => {
    const racine = depot({
      'demo-12': { etape: 'controles', tentative: 1, finale: true },
    });
    const a = agents(plateau([T('demo-12')], [], [], circuits(racine, 'demo-12')));
    const i = a.indexOf('  4.1 · Passe finale · auto');
    expect(a[i + 1]).toMatch(/^▶ 12 /);
    expect(a[i - 1]).toBe('▾ 4 · Passe finale et relecture');
  });

  it('the start of the step the circuit leads itself (`mene`) counts on its ticket', () => {
    const racine = depot({
      'demo-12': { etape: 'controles', mene: at('11:50') },
      'demo-13': { etape: 'developpeur' },
    });
    const lus = circuits(racine, 'demo-12', 'demo-13');
    // Running since 11:50, its step counts 10 min at noon on its ticket.
    const t = plateau([T('demo-12')], [], [], lus) as Board & {
      parTicket: Record<string, { travail: number }>;
    };
    expect(t.parTicket['demo-12']).toEqual({ travail: 10 * MIN, jetons: 0 });
  });
});

describe('a circuit that stopped: under its step, its stop, its code and its reason on its card', () => {
  const ARRET = {
    etape: 'controles',
    tentative: 3,
    code: 14,
    raison: 'controles',
    rapport: '\nLe test « tableau » reste rouge.\n\nSortie : …',
  };

  it('without its process, the state gives its stop, its code and the first line of its reason', () => {
    const racine = depot({ 'demo-13': ARRET });
    expect(circuits(racine)).toEqual([
      expect.objectContaining({
        ticket: 'demo-13',
        vivant: false,
        code: 14,
        arret: 'controles',
        raison: 'Le test « tableau » reste rouge.',
        question: null,
        qui: null,
      }),
    ]);
  });

  // grillhouse-pq6: one rule of the questions that wait for the supervisor, the board's as the
  // opening's and the wait's (`attendLeSuperviseur`): a stop without a question's text waits for
  // him as well.
  it('grillhouse-pq6 — stopped without a question, it stands under « ⤷ Question · superviseur », and its card says where it stopped and why', () => {
    const racine = depot({ 'demo-13': ARRET });
    const t = plateau([T('demo-13')], [], [], circuits(racine));
    const a = agents(t);
    const i = a.indexOf('  3.1 · Contrôles · auto');
    expect(a[i + 1]).toBe(QUESTION);
    expect(a[i + 2]).toMatch(ENATTENTE13);
    expect(lignesAgents(t)[i + 2]).toMatchObject({ ton: 'attention', ticket: 'demo-13' });
    expect(carte(t, [T('demo-13')], 'demo-13')).toMatch(
      /^Circuit arrêté en 3\.1 Contrôles 3, arrêt controles \(14\) : Le test « tableau » reste rouge\./
    );
  });

  it('grillhouse-pq6 — « à repasser » (75) waits for the supervisor’s --reprendre: under « ⤷ Question · superviseur »', () => {
    const racine = depot({
      'demo-13': { etape: 'controles', tentative: 1, code: 75, raison: 'a-repasser' },
    });
    const a = agents(plateau([T('demo-13')], [], [], circuits(racine)));
    const i = a.indexOf(QUESTION);
    expect(i).toBeGreaterThan(-1);
    expect(a[i + 1]).toMatch(ENATTENTE13);
  });

  it('grillhouse-pq6 — stopped by the supervisor (« arrete »), it waits for no one', () => {
    const racine = depot({ 'demo-13': { etape: 'controles', code: 0, raison: 'arrete' } });
    expect(agents(plateau([T('demo-13')], [], [], circuits(racine)))).not.toContain(QUESTION);
  });

  // grillhouse-mwz, criterion 2: a circuit dead without a final state (its process gone, no stop
  // written) is named with the command that resumes it, a question for the supervisor.
  it('grillhouse-mwz critère 2 — a circuit dead without a stop written stands under « ⤷ Question · superviseur », ⛔ « fini sans son issue », with the command that resumes it', () => {
    const racine = depot({ 'demo-13': { etape: 'preuve', tentative: 1 } });
    const lus = circuits(racine);
    expect(lus).toEqual([
      expect.objectContaining({
        ticket: 'demo-13',
        vivant: false,
        interrompu: true,
        qui: 'superviseur',
      }),
    ]);
    // Its question names no command: the board names the answers once, beside it.
    expect(lus[0]?.question).not.toContain('npx grillhouse circuit');
    const t = plateau([T('demo-13')], [], [], lus);
    const a = agents(t);
    const i = a.indexOf(QUESTION);
    expect(a[i - 1]).toBe('  2.1 · Preuve du rouge · auto');
    expect(a[i + 1]).toMatch(/^⛔ 13 {2}Le su.* · fini sans son issue$/);
    expect(carte(t, [T('demo-13')], 'demo-13')).toMatch(
      /^Question · superviseur : Le déroulé du circuit a fini sans son issue \(TERMINATED\), aucun arrêt écrit\. `npx grillhouse circuit demo-13 --reprendre` ou `--depuis <testwriter\|developpeur> --contexte <texte>` le reprend\./
    );
  });

  it('grillhouse-mwz critère 2 — a circuit running, stopped or ended is not interrupted', () => {
    const racine = depot({
      'demo-13': { etape: 'preuve' },
      'demo-14': ARRET,
      'demo-15': { etape: 'relecture', raison: 'arrete' },
      'demo-16': { etape: 'relecture', code: 0 },
    });
    const lus = circuits(racine, 'demo-13');
    expect(lus.map(c => [c.ticket, c.interrompu]).sort()).toEqual([
      ['demo-13', false],
      ['demo-14', false],
      ['demo-15', false],
      ['demo-16', false],
    ]);
  });

  // grillhouse-3uv.95.4, criterion 4: the board shows the stop « question » and who must answer it.
  it('stopped on a question, it stands under its step after « ⤷ Question · superviseur », the question at the head of its card', () => {
    const racine = depot({ 'demo-13': { ...ARRET, question: question() } });
    const lus = circuits(racine);
    expect(lus).toEqual([
      expect.objectContaining({
        ticket: 'demo-13',
        question: 'Quel paquet lève ce rouge ?',
        qui: 'superviseur',
      }),
    ]);
    const t = plateau([T('demo-13')], [], [], lus);
    const a = agents(t);
    const i = a.indexOf(QUESTION);
    expect(a[i - 1]).toBe('  3.1 · Contrôles · auto');
    expect(a[i + 1]).toMatch(ENATTENTE13);
    expect(lignesAgents(t)[i]).toMatchObject({ ton: 'titre' });
    expect(lignesAgents(t)[i + 1]).toMatchObject({ ton: 'attention', ticket: 'demo-13' });
    expect(carte(t, [T('demo-13')], 'demo-13')).toMatch(
      /^Question · superviseur : Quel paquet lève ce rouge \?/
    );
  });

  it('a question the owner must answer stands after « ⤷ Question · responsable », beside the supervisor’s', () => {
    const racine = depot({
      'demo-13': { ...ARRET, question: question() },
      'demo-14': {
        ...ARRET,
        etape: 'relecture',
        code: 20,
        raison: 'besoin',
        question: question({
          arret: 'besoin',
          question: 'Le relecteur demande : « mesure » est-il le mot juste ?',
          qui: 'responsable',
        }),
      },
    });
    const t = plateau([T('demo-13'), T('demo-14')], [], [], circuits(racine));
    const a = agents(t);
    const i = a.indexOf('  ⤷ Question · responsable');
    expect(a[i - 1]).toBe('  4.3 · Relecture · relecteur');
    expect(a[i + 1]).toBe('⏸ 14  Le sujet de demo-14 · question au responsable');
    expect(a[a.indexOf(QUESTION) + 1]).toMatch(ENATTENTE13);
    expect(carte(t, [T('demo-14')], 'demo-14')).toMatch(
      /^Question · responsable : Le relecteur demande/
    );
  });

  it('a circuit that waits for the supervisor says « question au superviseur », one that waits for the owner « question au responsable », one ended without its issue ⛔ « fini sans son issue », one that runs nothing', () => {
    const racine = depot({
      'demo-13': { ...ARRET, question: question() },
      'demo-14': {
        ...ARRET,
        code: 20,
        raison: 'besoin',
        question: question({ arret: 'besoin', qui: 'responsable' }),
      },
      'demo-15': { ...ARRET, code: null, raison: null },
      'demo-16': { etape: 'relecture', raison: 'arrete' },
      'demo-17': { etape: 'preuve', tentative: 1 },
    });
    const tous = ['13', '14', '15', '16', '17'].map(n => T(`demo-${n}`));
    const lus = circuits(racine, 'demo-15');
    const a = agents(plateau(tous, [], [], lus));
    const ligne = (n: string) => a.find(x => x.startsWith(`⏸ ${n} `) || x.startsWith(`▶ ${n} `));
    expect(ligne('13')).toContain(TAG);
    expect(a.find(x => x.startsWith('⛔ 17 '))).toMatch(/ · fini sans son issue$/);
    expect(ligne('14')).toMatch(/ · question au responsable$/);
    expect(ligne('15')).not.toContain(' · question');
    // Stopped by the supervisor, its ticket still claimed: worked in direct, out of the circuit.
    expect(a.find(x => x.startsWith('▶ 16 '))).toMatch(/ · en direct$/);
  });

  it('a circuit that runs again after the answer stands at its step, running, its question gone', () => {
    const racine = depot({ 'demo-13': { ...ARRET, code: null, raison: null } });
    const t = plateau([T('demo-13')], [], [], circuits(racine, 'demo-13'));
    const a = agents(t);
    const i = a.indexOf('  3.1 · Contrôles · auto');
    expect(a[i + 1]).toBe('▶ 13  Le sujet de demo-13');
    expect(a.filter(x => x.startsWith('  ⤷ '))).toEqual([]);
  });
});

// grillhouse-3uv.90, grillhouse-3uv.95.5: a circuit whose plan the explorateur writes or the
// questionneur reads stands at 1 Plan.
describe('a circuit at the questioning', () => {
  const SEANCE = '0b8e8c7e-1d2f-4a3b-9c4d-5e6f7a8b9c0d';

  it('runs on its one line, at 1 for the plan', () => {
    const racine = depot({
      'demo-12': { questionnement: { objet: 'plan', role: 'questionneur', seance: SEANCE } },
    });
    const lus = circuits(racine, 'demo-12');
    expect(lus).toEqual([expect.objectContaining({ ticket: 'demo-12', questionnement: 'plan' })]);
    const t = plateau([T('demo-12')], [], [], lus);
    const a = agents(t);
    const i = a.indexOf('▾ 1 · Plan · explorateur ⇄ questionneur');
    expect(i).toBeGreaterThan(-1);
    expect(a[i + 1]).toBe('▶ 12  Le sujet de demo-12');
  });
});

describe('a ticket in progress with no circuit and no agent: the alert', () => {
  const alerte = (t: Board) => t.alertes.map(x => x.texte);

  it('without a state and with nothing running, it raises the alert', () => {
    const t = plateau([T('demo-15')], [fin('t0', 'demo-15', 'testwriter', '09:00')], [], []);
    expect(alerte(t)).toContain('15 en cours sans rien qui tourne');
  });

  it('its circuit running, no alert', () => {
    const racine = depot({ 'demo-15': { etape: 'preuve' } });
    const t = plateau(
      [T('demo-15')],
      [fin('t0', 'demo-15', 'testwriter', '09:00')],
      [],
      circuits(racine, 'demo-15')
    );
    expect(alerte(t)).not.toContain('15 en cours sans rien qui tourne');
  });
});

// The Temporal server on the board: a server that does not answer is the first alert, the
// tickets shown without their circuits; the card of a ticket with a circuit ends on the page of
// its workflow on the web UI of the server.
describe('the Temporal server on the board', () => {
  const NUIT = T('demo-30', {
    title: '30 — La nuit est rouge — packages/demo',
    status: 'open',
    labels: ['nuit'],
    created_at: at('01:00'),
  });
  const avec = (muet: boolean) =>
    assembler({
      tous: [NUIT],
      prefix: 'demo',
      registre: [],
      vivants: [],
      maintenant: MAINTENANT,
      jour: MAINTENANT - 24 * 60 * MIN,
      muet,
    }) as Board;

  it('a server that does not answer is the first alert, before a red night, its line in the head', () => {
    const t = avec(true);
    expect(t.alertes.map(x => x.texte)).toEqual([
      'Temporal ne répond pas en 5 s · temporal etat',
      'Nuit rouge depuis le 18/10 30',
    ]);
    const l = (lignes(t, 'depot') as Ligne[]).find(x => x.texte.includes('Temporal'));
    expect(l?.texte.trimEnd()).toBe('⚠ Temporal ne répond pas en 5 s · temporal etat');
    expect(l?.ton).toBe('alerte');
  });

  it('another fault of the reading is the first alert, as it is', () => {
    const t = assembler({
      tous: [NUIT],
      prefix: 'demo',
      registre: [],
      vivants: [],
      maintenant: MAINTENANT,
      jour: MAINTENANT - 24 * 60 * MIN,
      faute: 'mémo illisible',
    }) as Board;
    expect(t.alertes[0]?.texte).toBe('Circuits illisibles : mémo illisible');
  });

  it('a server that answers raises no alert of its own', () => {
    expect(avec(false).alertes.map(x => x.texte)).not.toContain(
      'Temporal ne répond pas en 5 s · temporal etat'
    );
  });

  const LIEN = 'http://127.0.0.1:8233/namespaces/default/workflows/circuit%3A%2Fdepot%3Ademo-31';

  it('the card of a ticket with a circuit ends on its link, whole, after a long description', () => {
    const tous = [T('demo-31', { description: 'mot '.repeat(200) })];
    const t = plateau(tous, [], [], [circuitLu('demo-31', { lien: LIEN, vivant: true })]);
    const c = carte(t, tous, 'demo-31');
    expect(c.endsWith(`…\nTemporal : ${LIEN}`)).toBe(true);
  });

  it('the card of a stopped circuit ends on its link too, after its question', () => {
    const tous = [T('demo-31', { description: 'Le sujet.' })];
    const t = plateau(
      tous,
      [],
      [],
      [circuitLu('demo-31', { lien: LIEN, question: 'Que faire ?' })]
    );
    expect(carte(t, tous, 'demo-31')).toMatch(/^Question · .*Le sujet\.\nTemporal : http:\/\/127/);
  });

  it('the card of a ticket without a circuit has no link', () => {
    const tous = [T('demo-32', { description: 'Le sujet.' })];
    const t = plateau(tous, [], [], []);
    expect(carte(t, tous, 'demo-32')).not.toContain('Temporal');
  });
});

describe('the tickets of the queue without their architecture', () => {
  const SECTION = '## Architecture\n\n- Adresse.';
  const enFile = (id: string, o: object = {}) => T(id, { status: 'open', ...o });

  it('one alert names each ticket of the queue whose description has no section « ## Architecture »', () => {
    const tous = [
      enFile('demo-40', { description: '## Besoin\n\nUn besoin.' }),
      enFile('demo-41', { description: SECTION }),
      enFile('demo-42'),
      enFile('demo-43', { description: '## Besoin', labels: [] }),
      enFile('demo-44', { description: '## Besoin' }),
    ];
    const t = plateau(tous, [], [], [circuitLu('demo-44', { vivant: true })]);
    expect(t.alertes.map(x => x.texte)).toEqual(['En file sans architecture : 40, 42']);
  });

  it('no alert when each ticket of the queue has its section', () => {
    const t = plateau([enFile('demo-41', { description: SECTION })], [], [], []);
    expect(t.alertes).toEqual([]);
  });
});
