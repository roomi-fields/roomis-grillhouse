// The progress of an automatic pass on the board (scripts/tableau.mjs), in figures, as Bazel's
// counter of actions « [1 234 / 2 000] » and the steps of a CI: the line of a ticket whose circuit
// runs an automatic step gives `faits/prévus · il y a <durée>` since the last sign of its pass
// (scripts/avancement.mjs), after the counters of its loops, or in their place when room lacks;
// past FIGEE without a sign, `⚠ figée <durée> · faits/prévus`, in the tone of an alert. The survey
// of the components (1.1) gives only the time since its start; the queue (5.2), the steps of its
// CI. A measure out of a ticket that holds the lock of the machine stands at the head of AGENTS.
// Witness: Romain, 2026-10-21, a pass frozen 40 min, the machine at rest, that nothing showed.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ouvrirAvancement } from '../../scripts/avancement.mjs';
import { assembler, FIGEE, LARGEUR, lignes, lireCircuits } from '../../scripts/tableau.mjs';
import { ligneCircuit } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tableau-avancement-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const S = 1_000;
const MIN = 60_000;
const at = (hm: string) => `2026-10-18T${hm}:00Z`;
const MAINTENANT = Date.parse(at('12:00'));
const COMPOSANTS = [
  'packages/forms',
  'packages/sheet',
  'packages/binder',
  'packages/audio',
  'packages/kronos',
];

interface Ligne {
  texte: string;
  alterne?: string;
  ton?: string;
  ticket?: string;
  section?: string;
  avancement?: boolean;
}

// A progress directory of a pass begun 20 min ago, one record per task: `[faits, prevus, il y a]`.
const avancement = (taches: [number, number, number][], ci?: [number, number, number]) => {
  const dossier = ouvrirAvancement({
    racine: ESSAIS,
    genre: null,
    dans: ESSAIS,
    debut: MAINTENANT - 20 * MIN,
  });
  mkdirSync(path.join(dossier, 'taches'), { recursive: true });
  taches.forEach(([faits, prevus, age], i) =>
    writeFileSync(
      path.join(dossier, 'taches', `t${i}.json`),
      JSON.stringify({ hash: `h${i}`, faits, prevus, a: MAINTENANT - age })
    )
  );
  if (ci) {
    const [faits, prevus, age] = ci;
    writeFileSync(
      path.join(dossier, 'taches', 'etapes-de-la-ci.json'),
      JSON.stringify({ hash: null, faits, prevus, a: MAINTENANT - age })
    );
  }
  return { dossier };
};

// A repository with the state of the circuit of demo-12, as scripts/circuit.mjs writes it.
const depot = (e: object) => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const dossier = path.join(racine, '.claude', 'worktrees');
  mkdirSync(dossier, { recursive: true });
  writeFileSync(
    path.join(dossier, 'demo-12.circuit.json'),
    JSON.stringify({
      etape: 'preuve',
      composant: 'packages/binder',
      composants: COMPOSANTS,
      tentative: 1,
      code: null,
      raison: null,
      rapport: null,
      finale: false,
      seance: null,
      ...e,
    })
  );
  return racine;
};
const T = {
  id: 'demo-12',
  title: '12 — Le sujet de demo-12 — packages/binder',
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: at('07:00'),
  labels: ['circuit'],
};
const fin = {
  projet: '/depot',
  agent: 'a1',
  ticket: 'demo-12',
  role: 'testeur',
  debut: at('08:00'),
  fin: at('09:00'),
  travail: 60 * MIN,
  jetons: 10,
  cache: 0,
  cout: null,
};
// The lines of AGENTS of the board of <racine>, its circuit running unless <vivant> is false.
const agents = (
  racine: string,
  { vivant = true, registre = [] as object[], mesure = null as object | null } = {}
) =>
  (
    lignes(
      assembler({
        tous: [T],
        prefix: 'demo',
        registre,
        vivants: [],
        circuits: lireCircuits({
          racine,
          prefix: 'demo',
          ps: vivant ? ligneCircuit('demo-12') : '',
        }),
        maintenant: MAINTENANT,
        jour: MAINTENANT - 24 * 60 * MIN,
        horsTicket: mesure,
      }),
      'depot'
    ) as Ligne[]
  ).filter(l => l.section === 'agents');
const duTicket = (l: Ligne[]) => l.find(x => x.ticket === 'demo-12')!;

describe('the line of a ticket at an automatic step gives the progress of its pass', () => {
  it('done/planned and the time since the last sign, after its component, on both of its texts', () => {
    const racine = depot({
      avancement: avancement([
        [80, 100, 8 * S],
        [7, 23, 30 * S],
      ]),
    });
    const l = duTicket(agents(racine));
    expect(l.alterne).toBe('▶ 12  binder 3/5 · 87/123 · il y a 8 s');
    expect(l.texte).toBe('▶ 12  Le sujet de demo-12 · 87/123 · il y a 8 s');
    expect(l).toMatchObject({ ton: 'actif', avancement: true });
  });

  it(`past FIGEE (${FIGEE / MIN} min) without a sign: « ⚠ figée <durée> · faits/prévus », in the tone of an alert`, () => {
    expect(FIGEE).toBe(5 * MIN);
    const racine = depot({ avancement: avancement([[87, 123, 12 * MIN]]) });
    const l = duTicket(agents(racine));
    expect(l.alterne).toBe('▶ 12  binder 3/5 · ⚠ figée 12 min · 87/123');
    expect(l.ton).toBe('alerte');
    const juste = depot({ avancement: avancement([[87, 123, 4 * MIN]]) });
    expect(duTicket(agents(juste)).alterne).toBe('▶ 12  binder 3/5 · 87/123 · il y a 4 min');
  });

  it('after the counters of the loops while they hold, in their place when room lacks; the subject is cut, never the figures', () => {
    const etat = {
      etape: 'controles',
      tentative: 2,
      boucles: { code: 2 },
      avancement: avancement([[87, 123, 8 * S]]),
    };
    const large = duTicket(agents(depot(etat)));
    expect(large.alterne).toBe('▶ 12  binder 3/5 · essai 2/3 · 87/123 · il y a 8 s');
    const serre = duTicket(agents(depot(etat), { registre: [fin] }));
    for (const t of [serre.texte, serre.alterne!]) {
      expect(t.length).toBeLessThanOrEqual(LARGEUR);
      expect(t).toMatch(/ · 87\/123 · il y a 8 s +1 h 00 · 10$/);
      expect(t).not.toContain('essai 2/3');
    }
  });

  it('a circuit that does not run shows no progress', () => {
    const racine = depot({ avancement: avancement([[87, 123, 8 * S]]) });
    const l = duTicket(agents(racine, { vivant: false }));
    expect(l.texte).not.toContain('87/123');
    expect(l.avancement).toBeUndefined();
  });

  it('a pass whose tasks have not written yet: the time since its start alone, frozen past FIGEE', () => {
    const racine = depot({ avancement: avancement([]) });
    expect(duTicket(agents(racine)).alterne).toBe('▶ 12  binder 3/5 · ⚠ figée 20 min');
  });
});

describe('every automatic step carries its witness', () => {
  const sous = (a: Ligne[]) => {
    const i = a.findIndex(x => x.ticket === 'demo-12');
    return [...a.slice(0, i)].reverse().find(x => /^ *\d+(\.\d+)? · /.test(x.texte))?.texte;
  };

  it('1.1 the survey of the components: the time since its start, frozen past FIGEE', () => {
    const racine = depot({ etape: 'testeur', releve: new Date(MAINTENANT - 8 * S).toISOString() });
    const a = agents(racine);
    expect(sous(a)).toBe('  1.1 · Relevé des composants · auto');
    expect(duTicket(a).alterne).toBe('▶ 12  binder 3/5 · il y a 8 s');
    const fige = depot({ etape: 'testeur', releve: new Date(MAINTENANT - 6 * MIN).toISOString() });
    expect(duTicket(agents(fige))).toMatchObject({
      alterne: '▶ 12  binder 3/5 · ⚠ figée 6 min',
      ton: 'alerte',
    });
  });

  it('2.4 the checks and 3 the final pass', () => {
    const controles = agents(
      depot({ etape: 'controles', avancement: avancement([[3, 9, 2 * S]]) })
    );
    expect(sous(controles)).toBe('  2.4 · Contrôles · auto');
    expect(duTicket(controles).alterne).toBe('▶ 12  binder 3/5 · 3/9 · il y a 2 s');
    const finale = agents(
      depot({ etape: 'controles', finale: true, avancement: avancement([[40, 200, 2 * S]]) })
    );
    expect(sous(finale)).toBe('  3 · Passe finale · auto');
    expect(duTicket(finale).alterne).toBe('▶ 12  binder 3/5 · 40/200 · il y a 2 s');
  });

  it('5.1 the commit: the verification of the integration, in the same figures', () => {
    const a = agents(depot({ etape: 'integration', avancement: avancement([[40, 123, 3 * S]]) }));
    expect(sous(a)).toBe('  5.1 · Commit · auto');
    expect(duTicket(a).alterne).toBe('▶ 12  binder 3/5 · 40/123 · il y a 3 s');
  });

  it('5.2 the queue: the steps of its CI done over planned', () => {
    const a = agents(depot({ etape: 'file', avancement: avancement([], [3, 7, 10 * S]) }));
    expect(sous(a)).toBe('  5.2 · File : main, poussée, CI · auto');
    expect(duTicket(a).alterne).toBe('▶ 12  binder 3/5 · 3/7 · il y a 10 s');
  });
});

describe('a measure out of a ticket stands at the head of AGENTS', () => {
  const tete = (a: Ligne[]) => a[a.findIndex(x => x.texte.startsWith('AGENTS')) + 1];
  const racine = () => depot({ etape: 'relecture' });

  it('« ⏳ Mesure · <dépôt> · <commande> · faits/prévus · il y a <durée> », the command cut, never the figures', () => {
    const mesure = {
      depot: 'Grillhouse',
      commande: 'npm run verifier',
      faits: 51,
      prevus: 123,
      dernier: MAINTENANT - 3 * S,
    };
    const l = tete(agents(racine(), { mesure }));
    expect(l.texte.length).toBeLessThanOrEqual(LARGEUR);
    expect(l.texte).toMatch(/^⏳ Mesure · Grillhouse · npm r/);
    expect(l.texte).toMatch(/ · 51\/123 · il y a 3 s$/);
    expect(l).toMatchObject({ ton: 'actif', avancement: true });
  });

  it('past FIGEE without a sign: « ⚠ Mesure figée <durée> · … », in the tone of an alert', () => {
    const mesure = {
      depot: 'Grillhouse',
      commande: 'npm run verifier',
      faits: 51,
      prevus: 123,
      dernier: MAINTENANT - 12 * MIN,
    };
    const l = tete(agents(racine(), { mesure }));
    expect(l.texte.length).toBeLessThanOrEqual(LARGEUR);
    expect(l.texte).toMatch(/^⚠ Mesure figée 12 min · Grillhouse · /);
    expect(l.texte).toMatch(/ · 51\/123$/);
    expect(l.ton).toBe('alerte');
  });

  it('without a measure, the steps follow the title', () => {
    expect(tete(agents(racine())).texte).toMatch(/^ *0 · Exploration/);
  });
});
