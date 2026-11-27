// Une écriture hors du plan échoue sur le montage et la séance va jusqu'à sa fiche : la fiche
// `BESOIN` d'un rôle qui écrit nomme dans `manque` le fichier hors du plan qui lui manque (document
// du circuit, §5.5). Un fichier que la description du ticket nomme étend le plan à son paquet, un
// fichier de test d'un paquet lecteur demandé par le testwriter l'étend à ses seuls tests, et la
// séance reprend ; sinon la question monte, le paquet et `--etendre` nommés. La marque
// `hors-plan` et son arrêt n'existent plus.
import { describe, expect, it } from 'vitest';
import { ARRETS, MONTEES } from '../../scripts/etapes.mjs';
import { schemaDeFiche } from '../../scripts/resultats.mjs';
import * as seances from '../../scripts/seances.mjs';
import { monde, type Monde } from './seance-d-essai.js';

interface Extension {
  paquet: string;
  chemin: string;
  piece: string;
}
const seance = seances.seance as (
  ctx: object,
  role: string,
  options: object
) => Promise<{ fiche: { statut: string } }>;
const lancee = seances.seanceLancee as (ctx: object, role: string, r: object) => unknown;
const arretDuStatut = seances.arretDuStatut as unknown as (
  ctx: object,
  role: string,
  tentative: number,
  fiche: object
) => { nom: string; message: string; question?: string };

const FICHIER = 'packages/binder/src/index.mjs';
const TEST_DU_LECTEUR = 'packages/binder/tests/lecteur.spec.ts';
const besoin = (manque: string) => ({
  statut: 'BESOIN',
  question: `Il me manque ${manque}.`,
  piece: 'ticket, critère 1',
  manque,
});
const description = (adresse: string) =>
  [
    '## Architecture',
    '',
    `- Adresse : \`${adresse}\`.`,
    '',
    "## Critères d'acceptation",
    '',
    '1. La mesure double sa valeur.',
  ].join('\n');

let numero = 0;
// One session of &lt;role&gt; whose calls answer &lt;fiches&gt; in their order, on a ticket whose
// description names &lt;nomme&gt;; the extensions of the plan it asked of the circuit.
async function jouer(role: string, fiches: object[], nomme = 'packages/forms/src/index.mjs') {
  const m: Monde = monde({ copie: true });
  m.ticket({ description: description(nomme) });
  const etendus: Extension[] = [];
  const tests: Extension[] = [];
  m.ctx.etendreEnVol = (e: Extension) => etendus.push(e);
  m.ctx.etendreTestsEnVol = (e: Extension) => tests.push(e);
  fiches.forEach(f => m.fiche(f));
  const { fiche } = await m.jouer(() =>
    seance(m.ctx, role, {
      tentative: 1,
      derniere: false,
      seanceId: `b-${++numero}`,
      reprise: null,
      rapport: null,
      constats: [],
      lectures: { lots: () => [], references: () => [] },
      retenir: () => {},
    })
  );
  return { m, fiche, etendus, tests };
}

describe('la fiche BESOIN d’un rôle qui écrit nomme le fichier hors du plan qui lui manque', () => {
  it.each(['testwriter', 'developpeur', 'direct'])(
    'le schéma de la fiche du %s porte le champ « manque »',
    role => {
      const schema = schemaDeFiche(role) as unknown as { properties: Record<string, unknown> };
      expect(schema.properties).toHaveProperty('manque');
    }
  );

  it.each(['testwriter', 'developpeur'])(
    '%s : un fichier que la description du ticket nomme étend le plan à son paquet, et la séance reprend sans question',
    async role => {
      const { m, fiche, etendus } = await jouer(
        role,
        [besoin(FICHIER), { statut: 'FAIT' }],
        FICHIER
      );
      expect(etendus).toEqual([
        { paquet: 'packages/binder', chemin: FICHIER, piece: 'ticket, § Architecture' },
      ]);
      expect(fiche.statut).toBe('FAIT');
      expect(m.appels()).toBe(2);
      expect(m.prompt(2)).toContain('packages/binder');
    }
  );

  it('testwriter : un fichier de test d’un paquet lecteur étend le plan aux seuls tests de ce paquet', async () => {
    const { fiche, etendus, tests } = await jouer('testwriter', [
      besoin(TEST_DU_LECTEUR),
      { statut: 'FAIT' },
    ]);
    expect(etendus).toEqual([]);
    expect(tests).toEqual([
      expect.objectContaining({ paquet: 'packages/binder', chemin: TEST_DU_LECTEUR }),
    ]);
    expect(fiche.statut).toBe('FAIT');
  });

  it.each([
    ['developpeur', TEST_DU_LECTEUR, 'un fichier de test du lecteur'],
    ['testwriter', FICHIER, 'un code que le ticket ne nomme pas'],
  ])('%s, %s (%s) : la question monte, aucun plan étendu', async (role, manque) => {
    const { m, fiche, etendus, tests } = await jouer(role, [besoin(manque)]);
    expect(fiche.statut).toBe('BESOIN');
    expect([...etendus, ...tests]).toEqual([]);
    expect(m.appels()).toBe(1);
  });

  it.each([
    'package.json',
    'packages/binder/docs/ARCHITECTURE.md',
    'packages/binder/docs/CADRE.md',
    'packages/binder/docs/INTERFACE.md',
  ])(
    '%s, même nommé au ticket, monte : la racine et les documents du responsable',
    async manque => {
      const { fiche, etendus, tests } = await jouer('developpeur', [besoin(manque)], manque);
      expect(fiche.statut).toBe('BESOIN');
      expect([...etendus, ...tests]).toEqual([]);
    }
  );

  it('l’arrêt « besoin » pose la question avec le paquet du fichier et la commande qui l’étend', () => {
    const m = monde({ copie: true });
    const arret = arretDuStatut(m.ctx, 'developpeur', 1, besoin(FICHIER));
    expect(arret.nom).toBe('besoin');
    expect(arret.question).toContain('--etendre packages/binder');
  });
});

describe('une écriture hors du plan échoue sur le montage et la séance continue', () => {
  it('le circuit n’a ni arrêt « hors-plan » ni question à son nom', () => {
    expect(Object.keys(ARRETS)).not.toContain('hors-plan');
    expect(Object.keys(MONTEES)).not.toContain('hors-plan');
  });

  it('une séance finie normalement n’est arrêtée par aucune marque d’écriture', () => {
    const ctx = { paquets: ['packages/forms'], ticket: 'demo-1', journal: '/nonexistent' };
    expect(
      lancee(ctx, 'developpeur', {
        seance: 0,
        code: 0,
        horsPlan: '⛔ hors-plan — packages/binder/src/index.mjs',
        ecriture: { chemin: FICHIER, paquet: 'packages/binder', racine: false },
      })
    ).toBeUndefined();
  });
});
