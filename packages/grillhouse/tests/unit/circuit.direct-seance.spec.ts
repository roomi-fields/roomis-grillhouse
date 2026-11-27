// The session of the agent direct in the circuit (scripts/seances.mjs, `seance`), its sheet
// (scripts/resultats.mjs, the schema `direct`) and the review of its lot (scripts/activites.mjs,
// `relire`). A test of size medium: a trial git repository, claude and the launcher stand-ins
// (./seance-d-essai.ts).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import { consigneDuRelecteurDuDirect } from '../../scripts/direct.mjs';
import { lireFiche, schemaDeFiche } from '../../scripts/resultats.mjs';
import * as seances from '../../scripts/seances.mjs';
import { monde, type Monde } from './seance-d-essai.js';

const seance = seances.seance as unknown as (
  ctx: object,
  role: string,
  options: object
) => Promise<{ fiche: Record<string, unknown>; constats: Record<string, unknown>[] }>;
const constatsDeLaSeance = seances.constatsDeLaSeance as unknown as (
  contexte: string | null,
  constats: object[],
  role: string
) => {
  valider: (f: object) => string | null;
  repondre: (tous: object[], f: object) => Record<string, unknown>[];
};
const relire = activites.relire as unknown as (
  ctx: object,
  options: { constats: object[] }
) => Promise<{ verdict: string }>;
const relectureEntiere = activites.relectureEntiere as unknown as (c: object[]) => string;

const CONSTAT = {
  titre: 'packages/forms/src/index.mjs — la mesure',
  genre: 'bloquant',
  regle: 'critère 1',
  role: 'direct',
  corps: 'Constat adressé à l’agent direct.',
  piece: 'packages/forms/src/index.mjs:1',
};
const LEVE = [{ titre: CONSTAT.titre, etat: 'levé', piece: '$ git diff\nle correctif' }];
const ROUGE = 'La passe finale est rouge : le test de la mesure échoue.';

const jouer = (m: Monde, constats: object[] = [CONSTAT]) => {
  m.ctx.circuit = 'direct';
  m.ctx.contexte = 'CONTEXTE DU SUPERVISEUR : relis la mesure.';
  return m.jouer(() =>
    seance(m.ctx, 'direct', {
      tentative: 1,
      derniere: false,
      seanceId: 'seance-direct',
      rapport: ROUGE,
      constats,
      lectures: { lots: () => [], references: () => [] },
      prendrePlace: () => ({ rattacher: () => {}, rendre: () => {} }),
      signeDeVie: () => {},
    })
  );
};

describe('la séance de l’agent direct à 3 Code', () => {
  it('se lance sous enveloppe, au rôle direct, sur les paquets du plan', async () => {
    const m = monde();
    m.fiche({ statut: 'FAIT', reponses: LEVE });
    const r = await jouer(m);
    expect(r.fiche.statut).toBe('FAIT');
    expect(m.args(1)).toContain('direct');
    expect(m.prompt(1)).toContain('packages/forms');
  });

  it('porte le ticket, les constats ouverts pour lui, le contexte du superviseur et le rouge à lever', async () => {
    const m = monde();
    m.fiche({ statut: 'FAIT', reponses: LEVE });
    await jouer(m, [
      CONSTAT,
      { ...CONSTAT, titre: 'autre', role: 'developpeur', corps: 'Pas à lui.' },
    ]);
    const consigne = m.prompt(1);
    expect(consigne).toContain('demo-1');
    expect(consigne).toContain('`mesure` rend le double de sa valeur.');
    expect(consigne).toContain('Constat adressé à l’agent direct.');
    expect(consigne).not.toContain('Pas à lui.');
    expect(consigne).toContain('CONTEXTE DU SUPERVISEUR : relis la mesure.');
    expect(consigne).toContain(ROUGE);
  });

  it('refuse puis redemande une fiche FAIT à laquelle manque la réponse à un constat en tâche', async () => {
    const m = monde();
    m.fiche({ statut: 'FAIT' });
    m.fiche({ statut: 'FAIT', reponses: LEVE });
    m.ctx.circuit = 'direct';
    const r = await m.jouer(() =>
      seance(m.ctx, 'direct', {
        tentative: 1,
        derniere: false,
        seanceId: 'seance-direct',
        constats: [CONSTAT],
        lectures: { lots: () => [], references: () => [] },
        prendrePlace: () => ({ rattacher: () => {}, rendre: () => {} }),
        signeDeVie: () => {},
      })
    );
    expect(m.appels()).toBe(2);
    expect(r.constats[0]).toMatchObject({ reponse: { etat: 'levé' } });
  });
});

describe('les constats de l’agent direct', () => {
  it('une fiche FAIT sans réponse à un constat en tâche est refusée, le constat nommé', () => {
    const s = constatsDeLaSeance(null, [CONSTAT], 'direct');
    expect(s.valider({ statut: 'FAIT' })).toContain(CONSTAT.titre);
    expect(s.valider({ statut: 'FAIT', reponses: LEVE })).toBeNull();
    expect(s.valider({ statut: 'BLOQUÉ' })).toBeNull();
  });

  it('chaque réponse reste jointe à son constat, que la relecture suivante lit', () => {
    const s = constatsDeLaSeance(null, [CONSTAT], 'direct');
    const apres = s.repondre([CONSTAT], {
      statut: 'FAIT',
      reponses: [
        {
          titre: `Constat 1 — ${CONSTAT.titre}`,
          etat: 'contesté',
          raison: 'voulu',
          piece: 'packages/forms/src/index.mjs:1 x',
        },
      ],
    });
    expect(apres[0]).toMatchObject({ reponse: { etat: 'contesté', raison: 'voulu' } });
    expect(relectureEntiere(apres)).toContain('contesté — voulu');
  });

  it('un constat donné en contexte n’exige aucune réponse', () => {
    const s = constatsDeLaSeance('tâche', [{ ...CONSTAT, enContexte: true }], 'direct');
    expect(s.valider({ statut: 'FAIT' })).toBeNull();
  });
});

describe('la fiche de l’agent direct a son schéma, validé comme celle du développeur', () => {
  const lire = (fiche: object) =>
    lireFiche('direct', JSON.stringify({ session_id: 's', structured_output: fiche })) as {
      erreur?: string;
      fiche?: object;
    };

  it('a un schéma `direct`', () => {
    expect(schemaDeFiche('direct')).not.toBeNull();
  });

  it('accepte FAIT avec ses réponses et ses écarts', () => {
    const fiche = {
      statut: 'FAIT',
      reponses: LEVE,
      ecarts: [{ sujet: 'Plafond', texte: 'abaissé' }],
    };
    expect(lire(fiche).fiche).toEqual(fiche);
  });

  it.each([
    [
      'un contesté sans raison',
      {
        statut: 'FAIT',
        reponses: [{ titre: 't', etat: 'contesté', piece: 'ticket, critère 1 : x' }],
      },
      /raison/,
    ],
    ['un BLOQUÉ sans raison', { statut: 'BLOQUÉ', piece: 'ticket, critère 1 : x' }, /raison/],
    ['un BESOIN sans question', { statut: 'BESOIN', piece: 'ticket, critère 1 : x' }, /question/],
    [
      'un critère hors du plan sans numéro',
      {
        statut: 'FAIT',
        hors_plan: [{ critere: 'un', paquet: 'p', piece: 'ticket, critère 1 : x' }],
      },
      /critere/,
    ],
    ['un champ hors du schéma', { statut: 'FAIT', verdict: 'ACCEPTÉ' }, /non conforme/],
  ])('refuse %s', (_nom, fiche, motif) => {
    expect(lire(fiche).erreur).toMatch(motif);
  });
});

const lot = (m: Monde) => {
  for (const [rel, texte] of [
    ['packages/forms/test/mesure.test.mjs', 'it("x", () => {});\n'],
    ['packages/forms/src/index.mjs', 'export const mesure = x => 2 * x;\n'],
  ]) {
    mkdirSync(path.dirname(path.join(m.ctx.copie, rel!)), { recursive: true });
    writeFileSync(path.join(m.ctx.copie, rel!), texte!);
  }
};
const consigneDeLaRelecture = async (c: string) => {
  const m = monde({ copie: true });
  lot(m);
  m.ctx.circuit = c;
  m.fiche({ verdict: 'ACCEPTÉ' });
  await m.jouer(() => relire(m.ctx, { constats: [] }));
  return m.prompt(1);
};
const exigence = (texte: string) =>
  texte.split('\n\n').filter(p => /un test qui le reproduit|destinataire est `direct`/.test(p));

describe('la consigne du relecteur d’un lot direct', () => {
  it('porte l’exigence du direct : le relecteur tient la preuve du rouge', async () => {
    const texte = await consigneDeLaRelecture('direct');
    expect(texte).toMatch(/un test qui le reproduit/);
    expect(texte).toMatch(/preuve du rouge[^.]*pas jouée/i);
    expect(texte).toMatch(/destinataire[^.\n]*`direct`/);
  });

  it('ne dit pas le lot mené hors du circuit', async () => {
    const texte = await consigneDeLaRelecture('direct');
    expect(exigence(texte).join('\n')).not.toMatch(/hors du circuit/);
    expect(exigence(texte).join('\n')).not.toMatch(/destinataire[^.\n]*`developpeur`/);
  });

  it('est écrite une fois : la voie de secours la reprend et ajoute ce qui lui est propre', async () => {
    const circuitDirect = await consigneDeLaRelecture('direct');
    const secours = consigneDuRelecteurDuDirect({});
    expect(exigence(circuitDirect).length).toBeGreaterThan(0);
    for (const p of exigence(circuitDirect)) {
      expect(secours).toContain(p.trim());
    }
    expect(secours).toMatch(/voie de secours/);
    expect(secours).not.toMatch(/hors du circuit/);
  });

  it('écrit le verdict de la relecture une seule fois au ticket', async () => {
    const m = monde({ copie: true });
    lot(m);
    m.ctx.circuit = 'direct';
    m.fiche({ verdict: 'ACCEPTÉ' });
    await m.jouer(() =>
      relire(m.ctx, { constats: [], consigneDuRelecteur: consigneDuRelecteurDuDirect })
    );
    expect(m.commentaires().filter(c => c.startsWith('ACCEPTÉ'))).toHaveLength(1);
  });

  it.each(['long', 'court'])('d’un circuit %s ne la porte pas', async c => {
    const texte = await consigneDeLaRelecture(c);
    expect(exigence(texte)).toEqual([]);
    expect(texte).not.toMatch(/preuve du rouge[^.]*pas jouée/i);
  });
});
