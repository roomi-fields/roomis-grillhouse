// What the instruction of a session carries (scripts/seances.mjs, `seance`, the template of
// mods/grillhouse/skills/pitmaster/references/consigne-agent.md): the last handover of its role,
// never the reviewer's verdict, and its own findings alone; the description of the ticket as it is
// at its launch, and its notes when it has some. A test of size medium: the launcher is a
// stand-in that keeps the instruction it receives (./seance-d-essai.ts).
// The task the supervisor gives a role is proved in circuit.contexte.spec.ts.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as activites from '../../scripts/activites.mjs';
import * as seances from '../../scripts/seances.mjs';
import { depotDeReferences } from './references-essai.js';
import { DESCRIPTION, monde, type Monde } from './seance-d-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'consigne-de-la-seance-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const lesReferences = activites.lesReferences as (
  ctx: object
) => { nom: string; fichiers: string[] }[];

const seance = seances.seance as unknown as (
  ctx: object,
  role: string,
  options: object
) => Promise<{ fiche: Record<string, unknown> }>;
const PLACE = () => ({ rattacher: () => {}, rendre: () => {} });

interface Constat {
  titre: string;
  genre: string;
  regle: string;
  role: string;
  corps: string;
  piece: string;
}
// The session of <role> in the envelope, its sheet the stand-in's, the findings open <constats>.
const jouer = (m: Monde, role: string, constats: Constat[] = []) =>
  m.jouer(() =>
    seance(m.ctx, role, {
      tentative: 1,
      derniere: false,
      seanceId: `seance-${role}`,
      constats,
      lectures: { lots: () => [], references: () => [] },
      prendrePlace: PLACE,
      signeDeVie: () => {},
    })
  );
// The section « LA DERNIÈRE PASSATION » of an instruction: the text the circuit fills it with.
const passationDe = (consigne: string) =>
  /LA DERNIÈRE PASSATION[^\n]*\n\n([\s\S]*?)\n\nLe circuit joue/.exec(consigne)?.[1] ?? null;

const CONSTAT_DU_TESTWRITER: Constat = {
  titre: 'packages/forms/test/mesure.test.mjs',
  genre: 'bloquant',
  regle: 'critère 1',
  role: 'testwriter',
  corps: 'Constat adressé au testwriter.',
  piece: 'packages/forms/test/mesure.test.mjs:1',
};
const CONSTAT_DU_DEVELOPPEUR: Constat = {
  titre: 'packages/binder/src/index.mjs',
  genre: 'bloquant',
  regle: 'critère 1',
  role: 'developpeur',
  corps: 'Constat adressé au développeur.',
  piece: 'packages/binder/src/index.mjs:1',
};
const REPONSE_AU_CONSTAT = [
  { titre: CONSTAT_DU_DEVELOPPEUR.titre, etat: 'levé', piece: '$ git diff\nle correctif' },
];
const VERDICT =
  'RENDU\n\n### Constat 1 — packages/forms/test/mesure.test.mjs\nBloquant : critère 1';

describe('la dernière passation que porte la consigne', () => {
  it('est « aucune » pour la première séance du testwriter', async () => {
    const m = monde();
    m.fiche({ statut: 'FAIT' });
    await jouer(m, 'testwriter');
    expect(passationDe(m.prompt(1))).toBe('aucune');
  });

  it('est celle du testwriter pour un développeur qui n’en a pas encore', async () => {
    const m = monde();
    m.passations([{ author: 'testwriter', text: 'Passation du testwriter.' }]);
    m.fiche({ statut: 'FAIT' });
    await jouer(m, 'developpeur');
    expect(passationDe(m.prompt(1))).toBe('Passation du testwriter.');
  });

  it('est la sienne pour un développeur qui en a une, jamais celle du testwriter ni le verdict du relecteur', async () => {
    const m = monde();
    m.passations([
      { author: 'testwriter', text: 'Passation du testwriter.' },
      { author: 'developpeur', text: 'Code écrit.' },
      { author: 'relecteur', text: VERDICT },
      { author: 'testwriter', text: 'Rendu traité par le testwriter.' },
    ]);
    m.fiche({ statut: 'FAIT' });
    await jouer(m, 'developpeur');
    const consigne = m.prompt(1);
    expect(passationDe(consigne)).toBe('Code écrit.');
    expect(consigne).not.toContain('Rendu traité par le testwriter.');
    expect(consigne).not.toContain(VERDICT);
  });

  it('est celle du testwriter pour le testwriter, jamais le verdict', async () => {
    const m = monde();
    m.passations([
      { author: 'testwriter', text: 'Passation du testwriter.' },
      { author: 'relecteur', text: VERDICT },
    ]);
    m.fiche({ statut: 'FAIT' });
    await jouer(m, 'testwriter');
    expect(passationDe(m.prompt(1))).toBe('Passation du testwriter.');
    expect(m.prompt(1)).not.toContain(VERDICT);
  });
});

describe('les constats du relecteur que porte la consigne', () => {
  it('chaque agent reçoit les siens seuls : le testwriter ceux qui lui sont adressés', async () => {
    const m = monde();
    m.fiche({ statut: 'FAIT' });
    await jouer(m, 'testwriter', [CONSTAT_DU_TESTWRITER, CONSTAT_DU_DEVELOPPEUR]);
    const consigne = m.prompt(1);
    expect(consigne).toContain('Constat adressé au testwriter.');
    expect(consigne).not.toContain('Constat adressé au développeur.');
  });

  it('chaque agent reçoit les siens seuls : le développeur ceux qui lui sont adressés, avec son plan', async () => {
    const m = monde();
    m.ctx.paquets = ['packages/forms', 'packages/binder'];
    m.fiche({ statut: 'FAIT', reponses: REPONSE_AU_CONSTAT });
    await jouer(m, 'developpeur', [CONSTAT_DU_TESTWRITER, CONSTAT_DU_DEVELOPPEUR]);
    const consigne = m.prompt(1);
    expect(consigne).toContain('TON PLAN : packages/forms, packages/binder');
    expect(consigne).toContain('Constat adressé au développeur.');
    expect(consigne).not.toContain('Constat adressé au testwriter.');
  });
});

describe('la description du ticket que porte la consigne', () => {
  it('est celle du ticket au lancement de la séance, et ses notes quand il en a', async () => {
    const m = monde();
    m.fiche({ statut: 'FAIT' });
    await jouer(m, 'testwriter');
    const avant = m.prompt(1);
    expect(avant).toContain('1. `mesure` rend le double de sa valeur.');
    expect(avant).not.toContain('2. `mesure` de 0 rend 0.');
    expect(avant).not.toContain('LES NOTES DU TICKET');
    // The supervisor adds a criterion and the notes to the ticket before the next session.
    m.ticket({
      description: `${DESCRIPTION}\n2. \`mesure\` de 0 rend 0.`,
      notes: 'Fait : le double. Reste : le cas de zéro.',
    });
    m.fiche({ statut: 'FAIT' });
    await jouer(m, 'developpeur');
    const apres = m.prompt(2);
    expect(apres).toContain('2. `mesure` de 0 rend 0.');
    expect(apres).toMatch(
      /LES NOTES DU TICKET[^\n]*\n\nFait : le double\. Reste : le cas de zéro\.\n/
    );
  });
});

describe('les références que la consigne nomme', () => {
  // La section des références d'une consigne : les lignes dont le circuit la remplit.
  const referencesDe = (consigne: string) =>
    /LES RÉFÉRENCES QUE LE CIRCUIT RÉGÉNÈRE[^\n]*\n\n([\s\S]*?)\n\n/.exec(consigne)?.[1] ?? null;

  it.each(['testwriter', 'developpeur'])(
    'celle du %s nomme les fichiers des références du projet et du cadre : la référence, l’index des interfaces, la dette des gardes',
    async role => {
      const ctx = depotDeReferences(ESSAIS, [
        {
          nom: 'la référence de la mesure',
          commande: 'node regenerer.mjs',
          fichiers: ['reference.txt'],
        },
      ]);
      const m = monde();
      m.fiche({ statut: 'FAIT' });
      await m.jouer(() =>
        seance(m.ctx, role, {
          tentative: 1,
          derniere: false,
          seanceId: `seance-${role}`,
          constats: [],
          lectures: { lots: () => [], references: () => lesReferences(ctx) },
          prendrePlace: PLACE,
          signeDeVie: () => {},
        })
      );
      const section = referencesDe(m.prompt(1));
      expect(section).toContain('- la référence de la mesure : `reference.txt`');
      expect(section).toContain("- l'index des interfaces : `docs/agents/index-des-interfaces.md`");
      expect(section).toContain('- la dette des gardes : `grillhouse-dette.json`');
    }
  );
});
