// What the circuit reads for a direct circuit (scripts/circuit.mjs, `ctx.circuit`): the reviewer's
// findings go to the agent direct (`constatsOuverts`, the schema of its sheet,
// scripts/resultats.mjs), the stops of its session name it (`arretDe`), and the state written at the
// final pass counts the sessions of its code (`commencerLEtape`).
import { describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';
import { schemaDeFiche } from '../../scripts/resultats.mjs';
import * as transitions from '../../scripts/transitions.mjs';

interface Arret {
  nom: string;
  rapport: string;
  question: string | null;
}
const constatsOuverts = circuit.constatsOuverts as (
  ctx: object,
  fiche: object,
  texte: string
) => { role: string }[];
const arretDe = circuit.arretDe as (ctx: object, a: object) => Arret;
const commencerLEtape = circuit.commencerLEtape as unknown as (
  ctx: object,
  debut: object
) => { etat: { boucles: Record<string, number> | null } };
const T = transitions as unknown as Record<string, string> & {
  transition: (e: object) => { besoin?: { fait: string }; arret?: object };
};

const constat = (role: string) => ({
  titre: 'packages/forms/src/index.mjs — un constat',
  genre: 'bloquant',
  piece: 'packages/forms/src/index.mjs:1',
  regle: 'critère 1',
  role,
  corps: 'Le corps.',
});
const lire = (role: string, circuitDuTicket?: string) =>
  constatsOuverts(
    { constats: [], circuit: circuitDuTicket },
    { verdict: 'RENDU', constats: [constat(role)] },
    'LE VERDICT'
  );
const arretDeLaRelecture = (role: string, c?: string) => {
  try {
    lire(role, c);
  } catch (e) {
    return e as Arret;
  }
  throw new Error('aucun arrêt');
};

describe('the recipient of a blocking finding is one of the agents of its circuit', () => {
  it('opens a finding to the agent direct in a direct circuit', () => {
    expect(lire('direct', 'direct').map(c => c.role)).toEqual(['direct']);
  });

  it.each(['testwriter', 'developpeur', 'relecteur'])(
    'stops at « relecture-arret » on a finding to %s in a direct circuit',
    role => {
      const a = arretDeLaRelecture(role, 'direct');
      expect(a.nom).toBe('relecture-arret');
      expect(a.rapport).toContain(`il nomme « ${role} »`);
      expect(a.rapport).toContain('Le verdict :\n\nLE VERDICT');
    }
  );

  it.each(['long', 'court', undefined])(
    'stops at « relecture-arret » on a finding to the agent direct in the circuit %s',
    c => {
      expect(arretDeLaRelecture('direct', c).nom).toBe('relecture-arret');
    }
  );

  it.each(['testwriter', 'developpeur'])('opens a finding to %s in a long circuit', role => {
    expect(lire(role, 'long').map(c => c.role)).toEqual([role]);
  });

  it('is admitted by the schema of the reviewer’s sheet, in a finding and a non-conforming element', () => {
    const schema = schemaDeFiche('relecteur') as unknown as {
      properties: Record<string, { items: { properties: { role: { enum: string[] } } } }>;
    };
    for (const liste of ['constats', 'conformite']) {
      expect(schema.properties[liste]!.items.properties.role.enum, liste).toEqual(
        expect.arrayContaining(['testwriter', 'developpeur', 'direct'])
      );
    }
  });
});

describe('a stop of the session of the agent direct names it', () => {
  const FAITS: Record<string, unknown> = {
    empreinteAvant: 'A',
    empreinte: 'B',
    renvoi: null,
    lecture: null,
    mecanique: false,
    sansTests: false,
  };
  // The stop the rule gives for the sheet `fiche` of the session at 3 Code.
  const arretDeLaFiche = (fiche: object) => {
    const lus: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) {
      const d = T.transition({
        etat: { etape: T.CODE, tentative: 1, rapport: null, finale: false },
        ticket: {
          id: 'essai-1',
          paquets: ['packages/forms'],
          sorte: null,
          copie: '/copie',
          circuit: 'direct',
        },
        faits: lus,
      });
      if (!d.besoin) {
        const ctx = {
          ticket: 'essai-1',
          circuit: 'direct',
          rendus: [],
          bd: () => ({
            status: 0,
            stdout: JSON.stringify([{ author: 'direct', text: 'LA PASSATION' }]),
            stderr: '',
          }),
        };
        return arretDe(ctx, d.arret!);
      }
      lus[d.besoin.fait] = d.besoin.fait === 'seance' ? fiche : FAITS[d.besoin.fait];
    }
    throw new Error('trop de faits');
  };

  it.each([
    ['BESOIN', 'besoin', { statut: 'BESOIN', question: 'Laquelle ?', piece: 'p' }],
    ['BLOQUÉ', 'hors-portee', { statut: 'BLOQUÉ', raison: 'Hors portée.', piece: 'p' }],
    [
      'FAIT with a criterion out of the plan',
      'hors-portee',
      { statut: 'FAIT', hors_plan: [{ critere: '1', paquet: '030-binder', piece: 'p' }] },
    ],
  ])('on a sheet %s, with its handover', (_nom, arret, fiche) => {
    const a = arretDeLaFiche(fiche);
    expect(a.nom).toBe(arret);
    expect(a.rapport).toMatch(/\bdirect\b/);
    expect(a.rapport).toContain('LA PASSATION');
    expect(`${a.rapport}\n${a.question ?? ''}`).not.toMatch(/développeur/i);
  });
});

describe('the state written at the final pass', () => {
  const etatDe = (c: string, finale: boolean) =>
    commencerLEtape(
      { ticket: 'essai-1', circuit: c, paquets: [], rendus: [], journal: '/journal' },
      { etape: T.CONTROLES, tentative: 2, rapport: null, finale }
    ).etat;

  it('counts the sessions of the code of a direct circuit', () => {
    expect(etatDe('direct', true).boucles).toEqual({ code: 2 });
  });

  it.each(['long', 'court'])('counts none in a %s circuit', c => {
    expect(etatDe(c, true).boucles).toBeNull();
  });
});
