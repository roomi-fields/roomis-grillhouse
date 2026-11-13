// grillhouse-wui: the lock of the machine on the board (scripts/tableau.mjs). Whoever holds it, a
// pass out of a ticket or the circuit of a ticket of any project of the machine, has its line 🔒
// at the head of AGENTS; each pass that waits for it, or for room under /tmp, its line ⏳; a
// circuit that waits shows ⏸ on its ticket's line (AGENTS signs a ticket by ▶, ⏸ and ⛔ alone), and
// keeps ▶ while it waits for nothing.
// Each sign keeps one sense: ⏸ a stopped circuit (in place of ■), 💤 a ticket claimed with
// nothing running, 🌙 a red night, ⚠ the alerts without a kind of their own. Witness: Romain,
// 2026-11-01 at 17 h, the verification of Grillhouse waiting behind the circuit of BPScript
// 320.11, which the board did not show. The owner's maquette (2026-11-01, « oui »):
//
//   ROOMIS-GRILLHOUSE + BP-MONO
//   [grillhouse] ▶ 1 en cours · 0 en attente · 374 faits
//   [bp-mono]    ▶ 2 en cours · 0 en attente · 1910 fai…
//   💤 [grillhouse] bd7 en cours sans rien qui tourne
//   🌙 [bp-mono] Nuit rouge depuis le 29/10  bp-mono-905n
//
//   AGENTS  ▶ en cours · en attente
//   🔒 Mesure · roomis-grillhouse · 124/190 · 8 min
//   ⏳ Contrôles · bp-mono · vbwf.3.11 · attend · 2 min
//   ▾ 1 · Plan · explorateur ⇄ questionneur
//     ⤷ Question · superviseur
//   [bp-mono]    bp-mono-vbwf.320.6.2.1… ⏸ 3 min · 135 k
//   ▾ 3 · Code · développeur
//     3.1 · Contrôles · auto
//   [bp-mono]    bp-mono-vbwf.3.11  … ⏳ 4 h 59 · 1,2 M
//
// The reading of the lock itself (scripts/verrou-de-machine.mjs) is tests/unit/verrou-de-machine.spec.ts's.
import { describe, expect, it } from 'vitest';
import {
  assembler,
  ensemble,
  LARGEUR,
  ligneEtat,
  lignes,
  nommerLesProjets,
} from '../../scripts/tableau.mjs';

const S = 1_000;
const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-01T17:00:00Z');

interface Ligne {
  texte: string;
  ton?: string;
  ticket?: string;
  section?: string;
  avancement?: boolean;
}

// The columns a line takes in a terminal: the signs 🔒 ⏳ 💤 🌙 take two.
const colonnes = (s: string) => [...s].length + (s.match(/[🔒⏳💤🌙]/gu)?.length ?? 0);

const T = (id: string, titre: string, o: object = {}) => ({
  id,
  title: `${id.slice(id.lastIndexOf('-') + 1)} — ${titre} — packages/x`,
  status: 'in_progress',
  priority: 2,
  issue_type: 'task',
  started_at: '2026-11-01T16:50:00Z',
  labels: ['circuit'],
  ...o,
});
const circuit = (ticket: string, o: object = {}) => ({
  ticket,
  etape: 'controles',
  tentative: 1,
  finale: false,
  code: null,
  arret: null,
  raison: null,
  question: null,
  qui: null,
  questionnement: null,
  boucles: {},
  mene: null,
  avancement: null,
  vivant: true,
  ...o,
});
// The lock of the machine as the board receives it.
type Machine = Parameters<typeof assembler>[0]['machine'];
const plateau = (
  prefix: string,
  tous: object[],
  o: { circuits?: object[]; machine?: Machine } = {}
) =>
  assembler({
    tous,
    prefix,
    registre: [],
    vivants: [],
    circuits: o.circuits ?? [],
    maintenant: MAINTENANT,
    jour: MAINTENANT - 12 * 60 * MIN,
    machine: o.machine ?? null,
  });

const MESURE = {
  projet: 'roomis-grillhouse',
  ticket: null,
  sorte: 'Mesure',
  depuis: MAINTENANT - 8 * MIN,
  avancement: { faits: 124, prevus: 190, debut: MAINTENANT - 9 * MIN, dernier: MAINTENANT - 3 * S },
};
const ATTENTE = {
  projet: 'bp-mono',
  ticket: 'bp-mono-vbwf.3.11',
  sorte: 'Contrôles',
  depuis: MAINTENANT - 2 * MIN,
  quoi: 'verrou',
};

// The lines of AGENTS of one project's board under <machine>, its circuits <circuits>.
const agents = (machine: Machine, circuits: object[] = [], tous: object[] = []) =>
  (lignes(plateau('demo', tous, { circuits, machine }), 'depot') as Ligne[]).filter(
    l => l.section === 'agents'
  );
const tete = (a: Ligne[]) =>
  a.slice(a.findIndex(x => x.texte.startsWith('AGENTS')) + 1) as [Ligne, ...Ligne[]];

describe('critère 1 : the holder of the lock has its line 🔒 at the head of AGENTS', () => {
  it('a pass out of a ticket: « 🔒 Mesure · <projet> · faits/prévus · <durée> », its time since it took the lock', () => {
    const [l] = tete(agents({ detenteur: MESURE, attentes: [] }));
    expect(l.texte).toBe('🔒 Mesure · roomis-grillhouse · 124/190 · 8 min');
    expect(l).toMatchObject({ ton: 'actif', avancement: true });
  });

  it('the circuit of a ticket of another project: its kind, its project, its ticket, without figures when it has none', () => {
    const detenteur = {
      projet: 'bp-mono',
      ticket: 'bp-mono-vbwf.3.11',
      sorte: 'Contrôles',
      depuis: MAINTENANT - 7 * MIN,
      avancement: null,
    };
    const [l] = tete(agents({ detenteur, attentes: [] }));
    expect(l.texte).toBe('🔒 Contrôles · bp-mono · vbwf.3.11 · 7 min');
  });

  it('a ticket without children under its prefix keeps its own name: « grillhouse-wui » shows « wui »', () => {
    const detenteur = {
      ...MESURE,
      ticket: 'grillhouse-wui',
      sorte: 'Preuve du rouge',
      avancement: null,
    };
    expect(tete(agents({ detenteur, attentes: [] }))[0].texte).toBe(
      '🔒 Preuve du rouge · roomis-grillhouse · wui · 8 min'
    );
  });

  it('past 5 min without a sign: « ⚠ <sorte> figée <durée> · <projet> · faits/prévus », in the tone of an alert', () => {
    const detenteur = {
      ...MESURE,
      avancement: { ...MESURE.avancement, faits: 51, prevus: 123, dernier: MAINTENANT - 12 * MIN },
    };
    const [l] = tete(agents({ detenteur, attentes: [] }));
    expect(l.texte).toBe('⚠ Mesure figée 12 min · roomis-grillhouse · 51/123');
    expect(l.ton).toBe('alerte');
  });

  it('the project is cut, never the figures nor the time, and the line holds in the width', () => {
    const detenteur = {
      ...MESURE,
      projet: 'un-depot-au-nom-tres-long-qui-ne-tient-pas-dans-la-ligne',
    };
    const [l] = tete(agents({ detenteur, attentes: [] }));
    expect(colonnes(l.texte)).toBeLessThanOrEqual(LARGEUR);
    expect(l.texte).toMatch(/^🔒 Mesure · un-depot.*… · 124\/190 · 8 min$/);
  });

  it('without a holder nor a wait, the steps follow the title', () => {
    expect(tete(agents({ detenteur: null, attentes: [] }))[0].texte).toMatch(/^ *[▸▾]? ?1 · Plan/);
    expect(tete(agents(null))[0].texte).toMatch(/^ *[▸▾]? ?1 · Plan/);
  });
});

describe('critère 1 : the line of the lock names each project as the board names it', () => {
  // BPScript's folder is « BPScript », its label on the board « bp-mono » (its prefix).
  const machine = {
    detenteur: { ...MESURE, depot: '/dev/roomis-grillhouse' },
    attentes: [{ ...ATTENTE, depot: '/dev/music/BPScript', projet: 'BPScript' }],
  };

  it('a project of the board takes its name there, not its folder', () => {
    const noms = new Map([
      ['/dev/roomis-grillhouse', 'roomis-grillhouse'],
      ['/dev/music/BPScript', 'bp-mono'],
    ]);
    expect(
      tete(agents(nommerLesProjets(machine, noms)))
        .slice(0, 2)
        .map(l => l.texte)
    ).toEqual([
      '🔒 Mesure · roomis-grillhouse · 124/190 · 8 min',
      '⏳ Contrôles · bp-mono · vbwf.3.11 · attend · 2 min',
    ]);
  });

  it('a project out of the board keeps its folder', () => {
    const noms = new Map([['/dev/roomis-grillhouse', 'roomis-grillhouse']]);
    expect(tete(agents(nommerLesProjets(machine, noms)))[1].texte).toBe(
      '⏳ Contrôles · BPScript · vbwf.3.11 · attend · 2 min'
    );
  });
});

describe('critère 2 : each pass that waits has its line ⏳, after the holder', () => {
  it('« ⏳ <sorte> · <projet> · <ticket> · attend · <durée> », the oldest wait first', () => {
    const plusVieille = {
      projet: 'roomis-grillhouse',
      ticket: null,
      sorte: 'Mesure',
      depuis: MAINTENANT - 5 * MIN,
      quoi: 'place',
    };
    const a = tete(agents({ detenteur: MESURE, attentes: [ATTENTE, plusVieille] }));
    expect(a.slice(0, 3).map(l => l.texte)).toEqual([
      '🔒 Mesure · roomis-grillhouse · 124/190 · 8 min',
      '⏳ Mesure · roomis-grillhouse · attend · 5 min',
      '⏳ Contrôles · bp-mono · vbwf.3.11 · attend · 2 min',
    ]);
    expect(a[1]).toMatchObject({ avancement: true });
  });

  it('a wait under a minute counts its seconds', () => {
    const attente = { ...ATTENTE, depuis: MAINTENANT - 20 * S };
    expect(tete(agents({ detenteur: null, attentes: [attente] }))[0].texte).toBe(
      '⏳ Contrôles · bp-mono · vbwf.3.11 · attend · 20 s'
    );
  });

  it('a circuit that waits shows ⏸ on its ticket line; the one that holds the lock keeps ▶', () => {
    const tous = [T('demo-12', 'Le sujet de demo-12'), T('demo-13', 'Le sujet de demo-13')];
    const machine = {
      detenteur: { ...MESURE, projet: 'depot', ticket: 'demo-13', sorte: 'Contrôles' },
      attentes: [{ ...ATTENTE, projet: 'depot', ticket: 'demo-12' }],
    };
    const a = agents(machine, [circuit('demo-12'), circuit('demo-13')], tous);
    expect(a.find(l => l.ticket === 'demo-12')?.texte).toMatch(/^⏸ 12 {2}Le sujet de demo-12/);
    expect(a.find(l => l.ticket === 'demo-13')?.texte).toMatch(/^▶ 13 {2}Le sujet/);
  });
});

describe('critère 5 : one sign per kind of state, on the board of several projects too', () => {
  const GH = plateau(
    'grillhouse',
    [
      T('grillhouse-bd7', 'Les mesures de temps', {
        started_at: '2026-11-01T15:00:00Z',
      }),
    ],
    { machine: { detenteur: MESURE, attentes: [ATTENTE] } }
  );
  const BP = plateau(
    'bp-mono',
    [
      T('bp-mono-vbwf.320.6.2.1', 'Le binder garde ses portées'),
      T('bp-mono-vbwf.3.11', 'Le checker refuse les gabarits'),
      T('bp-mono-905n', 'La nuit est rouge', {
        status: 'open',
        labels: ['nuit'],
        created_at: '2026-10-29T03:00:00',
      }),
    ],
    {
      circuits: [
        circuit('bp-mono-vbwf.320.6.2.1', {
          vivant: false,
          etape: 'developpeur',
          code: 1,
          arret: 'controles',
        }),
        circuit('bp-mono-vbwf.3.11'),
      ],
      machine: { detenteur: MESURE, attentes: [ATTENTE] },
    }
  );
  const deux = () =>
    lignes(
      ensemble([
        { etiquette: 'grillhouse', t: GH },
        { etiquette: 'bp-mono', t: BP },
      ]),
      'roomis-grillhouse + bp-mono'
    ) as Ligne[];

  it('💤 a ticket claimed with nothing running, in orange; 🌙 a red night, in red', () => {
    const l = deux();
    const zzz = l.find(x => x.texte.startsWith('💤'));
    expect(zzz?.texte).toMatch(/^💤 \[grillhouse\] bd7 en cours sans rien qui tourne *$/);
    expect(zzz?.ton).toBe('attention');
    const lune = l.find(x => x.texte.startsWith('🌙'));
    expect(lune?.texte).toMatch(/^🌙 \[bp-mono\] Nuit rouge depuis le 29\/10 +bp-mono-905n$/);
    expect(lune?.ton).toBe('alerte');
    expect(l.some(x => x.texte.startsWith('⚠ '))).toBe(false);
  });

  it('the lock at the head of AGENTS, ⏸ a stopped circuit and the circuit that waits, ▶ the ticket in direct; ■ is gone', () => {
    const a = tete(deux().filter(x => x.section === 'agents'));
    expect(a[0].texte).toBe('🔒 Mesure · roomis-grillhouse · 124/190 · 8 min');
    expect(a[1].texte).toMatch(/^\[grillhouse\] grillhouse-bd7 +· en direct +▶$/);
    expect(a[2].texte).toMatch(/^▸ 1 · Plan/);
    // Its id whole: the wait of the lock gives way when the line lacks room.
    expect(a.find(x => x.ticket === 'bp-mono-vbwf.3.11')?.texte).toMatch(
      /^\[bp-mono\] +bp-mono-vbwf\.3\.11 +· verrou co/
    );
    expect(a.find(x => x.ticket === 'bp-mono-vbwf.320.6.2.1')?.texte).toMatch(/ ⏸$| ⏸ /);
    expect(a.find(x => x.ticket === 'bp-mono-vbwf.3.11')?.texte).toMatch(/ ⏸$| ⏸ /);
    expect(deux().some(x => x.texte.includes('■'))).toBe(false);
  });

  it('each line holds in the width, a wide sign counted for its two columns, its right part ending at the edge', () => {
    for (const l of deux()) {
      expect(colonnes(l.texte), l.texte).toBeLessThanOrEqual(LARGEUR);
    }
    const attend = deux().find(x => x.ticket === 'bp-mono-vbwf.3.11')!;
    const stoppe = deux().find(x => x.ticket === 'bp-mono-vbwf.320.6.2.1')!;
    expect(colonnes(attend.texte)).toBe(colonnes(stoppe.texte));
  });
});

describe('critère 4 : the status line says the same', () => {
  it('the alerts by their signs, then the holder of the lock and the count of its waits', () => {
    const t = plateau(
      'demo',
      [
        T('demo-7', 'Pris sans rien', { started_at: '2026-11-01T15:00:00Z' }),
        T('demo-9', 'La nuit est rouge', {
          status: 'open',
          labels: ['nuit'],
          created_at: '2026-10-29T03:00:00',
        }),
      ],
      { machine: { detenteur: MESURE, attentes: [ATTENTE] } }
    );
    expect(ligneEtat(t)).toMatch(
      /^🌙 1 · 💤 1 · 🔒 Mesure · roomis-grillhouse · ⏳ 1 · Grillhouse : /
    );
  });

  it('without alerts nor lock, the status line is the counters alone', () => {
    expect(ligneEtat(plateau('demo', []))).toMatch(/^Grillhouse : /);
  });

  it('the alerts of the other projects of the board count beside the session’s, its counters kept', () => {
    const nuitRouge = (id: string) =>
      T(id, 'La nuit est rouge', {
        status: 'open',
        labels: ['nuit'],
        created_at: '2026-10-29T03:00:00',
      });
    const ici = plateau('demo', []);
    const voisins = [plateau('osd', [nuitRouge('osd-1')]), plateau('sh', [nuitRouge('sh-1')])];
    expect(ligneEtat(ici, voisins)).toMatch(/^🌙 2 · Grillhouse : /);
    expect(ligneEtat(ici, voisins)).toContain(ligneEtat(ici));
  });
});

// grillhouse-6ay: the line of the lock names the phase and the ticket of the verification it
// shows. The owner's decision (2026-11-02): the ticket loses only the prefix of its project, already
// on the line, « SH-ae6.5 » → « ae6.5 », « grillhouse-527.1.1 » → « 527.1.1 ».
describe('grillhouse-6ay critères 1, 6 et 11 : la ligne du verrou porte la phase et le ticket court', () => {
  const inscrit = (sorte: string, ticket: string | null, projet = 'synthhub') => ({
    projet,
    ticket,
    sorte,
    depuis: MAINTENANT - 34 * S,
    avancement: null,
  });
  const premiere = (machine: Machine) => tete(agents(machine))[0].texte;

  it('critère 1 : « 🔒 Intégration · synthhub · ae6.5 · 34 s » depuis le ticket SH-ae6.5', () => {
    expect(premiere({ detenteur: inscrit('Intégration', 'SH-ae6.5'), attentes: [] })).toBe(
      '🔒 Intégration · synthhub · ae6.5 · 34 s'
    );
  });

  it('critère 11 : un identifiant à préfixe long garde sa partie d’épopée (« synthhub-ae6.5 » → « ae6.5 »)', () => {
    expect(premiere({ detenteur: inscrit('Intégration', 'synthhub-ae6.5'), attentes: [] })).toBe(
      '🔒 Intégration · synthhub · ae6.5 · 34 s'
    );
  });

  it('critère 11 : « grillhouse-527.1.1 » → « 527.1.1 », « grillhouse-wui » → « wui »', () => {
    expect(
      premiere({ detenteur: inscrit('File', 'grillhouse-527.1.1', 'grillhouse'), attentes: [] })
    ).toBe('🔒 File · grillhouse · 527.1.1 · 34 s');
    expect(
      premiere({ detenteur: inscrit('File', 'grillhouse-wui', 'grillhouse'), attentes: [] })
    ).toBe('🔒 File · grillhouse · wui · 34 s');
  });

  it('critère 1 : une attente de la file : « ⏳ File · bpscript · <ticket> · attend · 1 min »', () => {
    const attente = {
      ...inscrit('File', 'synthhub-ae6.5', 'bpscript'),
      depuis: MAINTENANT - MIN,
      quoi: 'verrou',
    };
    expect(premiere({ detenteur: null, attentes: [attente] })).toBe(
      '⏳ File · bpscript · ae6.5 · attend · 1 min'
    );
  });

  it('critères 2 et 3 : sans ticket, la ligne porte la phase seule (Nuit, Vérification)', () => {
    expect(premiere({ detenteur: inscrit('Nuit', null, 'grillhouse'), attentes: [] })).toBe(
      '🔒 Nuit · grillhouse · 34 s'
    );
    expect(premiere({ detenteur: inscrit('Vérification', null), attentes: [] })).toBe(
      '🔒 Vérification · synthhub · 34 s'
    );
  });

  it('critère 4 : le circuit garde son nom d’étape et son ticket', () => {
    expect(
      premiere({ detenteur: inscrit('Preuve du rouge', 'synthhub-cgi.15'), attentes: [] })
    ).toBe('🔒 Preuve du rouge · synthhub · cgi.15 · 34 s');
  });
});

// The owner's decision (2026-11-11, grillhouse-bf5.5.1): the holder or a wait of a circuit AGENTS
// shows stands on that circuit's line, one line per ticket; any other keeps its line, named by its
// ticket, else by the folder of its copy; its project is named only when it is not the board's.
describe('the lock on the line of its circuit, and the lines of the lock out of a circuit', () => {
  const COPIES = '/dev/roomis-grillhouse/.claude/worktrees';
  const SUJET = 'Le journal du ticket garde chaque étape du circuit et sa reprise';
  const tous = [T('demo-5hn', SUJET), T('demo-6', 'Le sujet de demo-6')];
  const PASSE = {
    projet: 'depot',
    ticket: 'demo-5hn',
    sorte: 'Passe finale',
    depuis: MAINTENANT - 2 * MIN,
    avancement: {
      faits: 54,
      prevus: 311,
      debut: MAINTENANT - 2 * MIN,
      dernier: MAINTENANT - 3 * S,
    },
  };
  // The circuit of 5hn at its final pass, whose own progress the lock replaces.
  const finale = circuit('demo-5hn', {
    finale: true,
    avancement: { faits: 65, prevus: 311, debut: MAINTENANT - 2 * MIN, dernier: MAINTENANT - S },
  });
  const VERIFICATION = {
    depot: '/dev/roomis-grillhouse',
    copie: `${COPIES}/direct-panneau-file`,
    projet: 'roomis-grillhouse',
    ticket: null,
    sorte: 'Vérification',
    depuis: MAINTENANT - MIN,
    quoi: 'verrou',
  };
  const lesLignes = (machine: Machine, circuits: object[] = [], largeur = LARGEUR) =>
    (lignes(plateau('demo', tous, { circuits, machine }), 'depot', largeur) as Ligne[]).filter(
      l => l.section === 'agents'
    );

  it('the holder of a circuit shown stands on its line: « · <sorte> faits/prévus · <durée> », no line of its own', () => {
    const a = lesLignes({ detenteur: PASSE, attentes: [] }, [finale]);
    expect(a.filter(l => l.texte.includes('passe finale'))).toHaveLength(1);
    const l = a.find(x => x.ticket === 'demo-5hn')!;
    expect(l.texte).toMatch(/^▶ 5hn {2}Le journal.*… · passe finale 54\/311 · 2 min$/);
    expect(l.texte).not.toContain('65/311');
    expect(l).toMatchObject({ ton: 'actif', avancement: true });
  });

  it('a wait of a circuit shown stands on its line: ⏸ « · verrou <sorte> · <durée> », no line of its own', () => {
    const attente = { ...ATTENTE, projet: 'depot', ticket: 'demo-6', sorte: 'Contrôles' };
    const a = lesLignes({ detenteur: null, attentes: [attente] }, [circuit('demo-6')]);
    expect(a.filter(l => l.texte.includes('attend'))).toEqual([]);
    expect(a.filter(l => l.ticket === 'demo-6')).toHaveLength(1);
    // Its number in the column of 5hn's, worked in direct.
    expect(a.find(l => l.ticket === 'demo-6')?.texte).toMatch(
      /^⏸ 6 {4}Le sujet de demo-6 · verrou contrôles · 2 min/
    );
  });

  it('a pass without a ticket in a copy of the board’s project is named by its copy, without the project, « attend » left out when it does not hold', () => {
    const a = tete(lesLignes({ detenteur: null, attentes: [{ ...VERIFICATION, ici: true }] }));
    expect(a[0].texte).toBe('⏳ Vérification · direct-panneau-file · 1 min');
  });

  it('the same pass in the main tree of the board’s project is named by its folder', () => {
    const principal = { ...VERIFICATION, copie: VERIFICATION.depot, ici: true };
    expect(tete(lesLignes({ detenteur: null, attentes: [principal] }))[0].texte).toBe(
      '⏳ Vérification · roomis-grillhouse · attend · 1 min'
    );
  });

  it('the project is named only when it is not the board’s: nommerLesProjets marks the board’s', () => {
    const autre = {
      ...VERIFICATION,
      depot: '/dev/music/BPScript',
      copie: '/dev/music/BPScript/.claude/worktrees/bp-1',
      projet: 'BPScript',
    };
    const noms = new Map([
      ['/dev/roomis-grillhouse', 'roomis-grillhouse'],
      ['/dev/music/BPScript', 'bp-mono'],
    ]);
    const machine = nommerLesProjets(
      { detenteur: null, attentes: [VERIFICATION, autre] },
      noms,
      '/dev/roomis-grillhouse'
    );
    expect(
      tete(lesLignes(machine))
        .slice(0, 2)
        .map(l => l.texte)
    ).toEqual([
      '⏳ Vérification · direct-panneau-file · 1 min',
      '⏳ Vérification · bp-mono · bp-1 · attend · 1 min',
    ]);
  });

  it('a narrow pane cuts the subject, then the project, then the copy last, never the kind, the figures nor the time', () => {
    const etroit = 44;
    const l = lesLignes({ detenteur: PASSE, attentes: [] }, [finale], etroit).find(
      x => x.ticket === 'demo-5hn'
    )!;
    expect(colonnes(l.texte)).toBeLessThanOrEqual(etroit);
    expect(l.texte).toContain('… · passe finale 54/311 · 2 min');
    expect(l.texte).toMatch(/^▶ 5hn {2}L/);
    const loin = {
      ...VERIFICATION,
      projet: 'un-projet-au-nom-tres-long-qui-ne-tient-pas',
      depuis: MAINTENANT - 8 * MIN,
      avancement: {
        faits: 124,
        prevus: 190,
        debut: MAINTENANT - 9 * MIN,
        dernier: MAINTENANT - 3 * S,
      },
    };
    const [d] = tete(lesLignes({ detenteur: loin, attentes: [] }, [], 64));
    expect(colonnes(d.texte)).toBeLessThanOrEqual(64);
    expect(d.texte).toMatch(/^🔒 Vérification · un-.*… · direct-panneau-file · 124\/190 · 8 min$/);
    const [e] = tete(lesLignes({ detenteur: loin, attentes: [] }, [], etroit));
    expect(colonnes(e.texte)).toBeLessThanOrEqual(etroit);
    expect(e.texte).toMatch(/^🔒 Vérification · direct-.*… · 124\/190 · 8 min$/);
  });
});
