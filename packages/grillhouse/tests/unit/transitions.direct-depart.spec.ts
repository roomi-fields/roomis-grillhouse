// Where a run of a direct circuit starts and resumes, and the one rule of --depuis
// (scripts/transitions.mjs `depart`, scripts/reprise.mjs `refusDeLaReprise` and `departDepuis`, the
// command line `grillhouse circuit`, src/temporal/circuit/appel.ts, and the options a run takes from
// the supervisor's answer, scripts/faits-du-circuit.mjs `optionsDe`; circuit.md §5.4).
import { describe, expect, it } from 'vitest';
import * as faitsDuCircuit from '../../scripts/faits-du-circuit.mjs';
import * as reprise from '../../scripts/reprise.mjs';
import * as transitions from '../../scripts/transitions.mjs';

interface Etat {
  etape: string;
  tentative: number;
  rapport: string | null;
  finale: boolean;
  raison?: string;
}
interface Depart {
  suivant?: Etat;
  memoire?: Record<string, unknown>;
  usage?: string;
}
const T = transitions as unknown as Record<string, string> & {
  depart: (e: object) => Depart;
  rapportDuRefus: (r: object) => string;
};
const { TESTS, CODE, CONTROLES, REFERENCES, INTEGRATION, depart } = T;
const R = reprise as unknown as {
  ETAPES_DE_REPRISE: string[];
  departDepuis: (nom: string) => object;
  refusDeLaReprise: (e: { depuis: string; circuit?: string | null }) => string | null;
};
const { optionsDe } = faitsDuCircuit as unknown as { optionsDe: (r: object) => object };

const ACCEPTEES_AU_DIRECT = ['direct', 'passe-finale'];
const REFUSEES_AU_DIRECT = ['testwriter', 'preuve', 'developpeur', 'controles'];
const ACCEPTEES_AILLEURS = ['testwriter', 'preuve', 'developpeur', 'controles', 'passe-finale'];

describe('a direct circuit starts at 3 Code', () => {
  it('without --depuis nor --reprendre, as a new run that kept nothing', () => {
    const d = depart({ ticket: 'essai-1', circuit: 'direct' });
    expect(d.suivant).toEqual({ etape: CODE, tentative: 1, rapport: null, finale: false });
    expect(d.memoire).toMatchObject({ verts: null, constats: [], refus: null });
  });

  it.each(['long', 'court', undefined])(
    'while the circuit %s starts at 2 Tests as before',
    circuit => {
      expect(depart({ ticket: 'essai-1', circuit }).suivant?.etape).toBe(TESTS);
    }
  );
});

describe('--depuis direct', () => {
  it('is a step of resumption, which replays 3 Code and those after it', () => {
    expect(R.ETAPES_DE_REPRISE).toContain('direct');
    expect(R.departDepuis('direct')).toEqual({
      etape: CODE,
      tentative: 1,
      rapport: null,
      finale: false,
      verts: {},
    });
  });

  it('starts the run at 3 Code with its counts started again', () => {
    const d = depart({
      depuis: 'direct',
      circuit: 'direct',
      etat: { etape: CONTROLES, tentative: 3, rapport: 'R', finale: true },
    });
    expect(d.suivant).toEqual({ etape: CODE, tentative: 1, rapport: null, finale: false });
    expect(d.memoire).toMatchObject({ verts: {}, reprise: null, relancesTestwriter: null });
  });

  it('after an integration stop, gives the agent direct the refusal as its report', () => {
    const refus = { rapport: 'REFUS', piece: 'P', empreinte: 'E' };
    const d = depart({
      depuis: 'direct',
      circuit: 'direct',
      etat: {
        etape: INTEGRATION,
        tentative: 1,
        rapport: null,
        finale: false,
        raison: 'integration',
      },
      refus,
    });
    expect(d.suivant).toEqual({
      etape: CODE,
      tentative: 1,
      rapport: T.rapportDuRefus(refus),
      finale: false,
    });
    expect(d.memoire?.refus).toEqual({ ...refus, lance: true, relance: false });
  });

  it('gives its --contexte to the role direct', () => {
    expect(optionsDe({ genre: 'depuis', role: 'direct', contexte: 'Corrige.' })).toEqual({
      depuis: 'direct',
      contexte: 'Corrige.',
      destinataire: 'direct',
    });
  });
});

describe('one rule accepts or refuses --depuis, from the list of the steps', () => {
  it.each(ACCEPTEES_AU_DIRECT)('accepts %s in a direct circuit', depuis => {
    expect(R.refusDeLaReprise({ depuis, circuit: 'direct' })).toBeNull();
    expect(depart({ depuis, circuit: 'direct' }).usage).toBeUndefined();
  });

  it.each(REFUSEES_AU_DIRECT)(
    'refuses %s in a direct circuit, naming the resumptions it accepts',
    depuis => {
      const refus = R.refusDeLaReprise({ depuis, circuit: 'direct' });
      expect(refus).toContain('passe-finale');
      expect(refus).toMatch(/\bdirect\b/);
      const d = depart({ depuis, circuit: 'direct' });
      expect(d.usage).toBe(refus);
      expect(d.suivant).toBeUndefined();
    }
  );

  describe.each(['long', 'court', undefined])('in the circuit %s', circuit => {
    it.each(ACCEPTEES_AILLEURS)('accepts %s as before', depuis => {
      expect(R.refusDeLaReprise({ depuis, circuit })).toBeNull();
      expect(depart({ depuis, circuit }).usage).toBeUndefined();
    });

    it('refuses direct, naming the resumptions it accepts', () => {
      const refus = R.refusDeLaReprise({ depuis: 'direct', circuit });
      for (const nom of ACCEPTEES_AILLEURS) {
        expect(refus, nom).toContain(nom);
      }
      const d = depart({ depuis: 'direct', circuit });
      expect(d.usage).toBe(refus);
      expect(d.suivant).toBeUndefined();
    });
  });
});

describe('--reprendre in a direct circuit', () => {
  const reprendre = (etat: Partial<Etat> & { etape: string }, circuit = 'direct') =>
    depart({ reprendre: true, circuit, etat: { rapport: 'R', finale: false, ...etat } }).suivant;

  it.each([
    ['3 Code', CODE, false],
    ['4.1 the final pass', CONTROLES, true],
    ['4.2 the regeneration', REFERENCES, true],
  ])('keeps the count of the sessions at %s', (_nom, etape, finale) => {
    expect(reprendre({ etape, tentative: 2, finale })).toEqual({
      etape,
      tentative: 2,
      rapport: 'R',
      finale,
    });
  });

  it.each([
    ['3 Code', CODE, false],
    ['4.1 the final pass', CONTROLES, true],
    ['4.2 the regeneration', REFERENCES, true],
  ])('keeps it on the replay « à repasser » of %s', (_nom, etape, finale) => {
    expect(reprendre({ etape, tentative: 3, finale, raison: 'a-repasser' })?.tentative).toBe(3);
  });

  it.each([
    ['controles', CONTROLES, true, 0],
    ['sans-livraison', CODE, false, 1],
  ])(
    'starts the count again after the stop « %s », as in a long or short circuit',
    (raison, etape, finale, tentative) => {
      const etat = { etape, tentative: 3, finale, raison };
      expect(reprendre(etat)?.tentative).toBe(tentative);
      expect(reprendre(etat, 'long')?.tentative).toBe(tentative);
    }
  );

  it.each(['long', 'court'])(
    'keeps the former counts of the circuit %s, whatever its stop',
    circuit => {
      expect(reprendre({ etape: CODE, tentative: 2 }, circuit)?.tentative).toBe(1);
      expect(reprendre({ etape: CONTROLES, tentative: 2, finale: true }, circuit)?.tentative).toBe(
        0
      );
    }
  );
});

describe('the command « grillhouse circuit » and --depuis direct', () => {
  const appel = () => import('../../src/temporal/circuit/appel.js');

  it('reads --depuis direct with its --contexte', async () => {
    const { lireLAppel } = await appel();
    expect(lireLAppel(['demo-1', '--depuis', 'direct', '--contexte', 'Corrige.'])).toMatchObject({
      ticket: 'demo-1',
      depuis: 'direct',
      contexte: 'Corrige.',
    });
  });

  it('names it in its usage', async () => {
    const { USAGE } = await appel();
    expect(USAGE).toMatch(/--depuis <[^>]*\bdirect\b[^>]*>/);
  });
});
