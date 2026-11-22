// The sheet that ends a session (scripts/seances.mjs, `jusquALaFiche`, `seance`, `garder`): each
// session out of the envelope receives the schema of its role's sheet and claude's JSON output; a
// session that ends without a sheet that conforms is resumed once, the same session, with the
// short instruction that names what lacks; the handover at the ticket decides nothing; each
// discovery of a sheet is filed closed under the ticket. A test of size medium: the sessions are
// stand-ins for claude and for the launcher (./seance-d-essai.ts).
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { jouerLEffet } from '../../scripts/effets.mjs';
import { schemaDeFiche } from '../../scripts/resultats.mjs';
import * as seances from '../../scripts/seances.mjs';
import { monde, type Monde } from './seance-d-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'fiche-de-fin-de-seance-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const PLACE = () => ({ rattacher: () => {}, rendre: () => {} });
const jusquALaFiche = seances.jusquALaFiche as unknown as (
  ctx: object,
  role: string,
  texte: string,
  options: object
) => Promise<Record<string, unknown>>;
const seance = seances.seance as unknown as (
  ctx: object,
  role: string,
  options: object
) => Promise<{ fiche: Record<string, unknown> }>;

// The whole instruction of a session: far longer than the short one of a resumption.
const CONSIGNE_ENTIERE = `${'Une ligne de la consigne entière de la séance.\n'.repeat(40)}`;
// The session of <role> out of the envelope, as the circuit plays the reviewer's.
const horsEnveloppe = (m: Monde, role: string, options: object = {}) =>
  m.jouer(() =>
    jusquALaFiche(m.ctx, role, CONSIGNE_ENTIERE, {
      evenement: 'essai',
      id: 'seance-essai',
      horsEnveloppe: true,
      prendrePlace: PLACE,
      signeDeVie: () => {},
      ...options,
    })
  );
// The session of the developpeur in the envelope, its launcher the stand-in.
const developpeur = (m: Monde) =>
  m.jouer(() =>
    seance(m.ctx, 'developpeur', {
      tentative: 1,
      derniere: false,
      seanceId: 'seance-developpeur',
      constats: [],
      lectures: { lots: () => [], references: () => [] },
      prendrePlace: PLACE,
      signeDeVie: () => {},
    })
  );
const valeur = (a: string[], option: string) => a[a.indexOf(option) + 1];

const FICHES: Record<string, object> = {
  explorateur: { criteres: [], paquets: ['000-forms'], questions: [] },
  questionneur: { issue: 'AUCUNE' },
  relecteur: { verdict: 'ACCEPTÉ' },
};

describe('la fiche qui finit une séance hors de l’enveloppe', () => {
  it.each(Object.keys(FICHES))(
    'le %s reçoit le schéma de la fiche de son rôle et la sortie JSON de claude',
    async role => {
      const m = monde();
      m.fiche(FICHES[role]);
      await horsEnveloppe(m, role);
      const a = m.args(1);
      expect(valeur(a, '--agent')).toBe(role);
      expect(valeur(a, '--output-format')).toBe('json');
      expect(JSON.parse(valeur(a, '--json-schema'))).toEqual(schemaDeFiche(role));
    }
  );

  it('le schéma d’une fiche qui n’est pas celle du rôle est celui que la séance nomme', async () => {
    const m = monde();
    m.fiche({ decouvertes: [] });
    await horsEnveloppe(m, 'explorateur', { fiche: 'tri' }).catch(() => null);
    expect(JSON.parse(valeur(m.args(1), '--json-schema'))).toEqual(schemaDeFiche('tri'));
  });

  it('sans fiche, la séance reprend une fois, la même, avec l’instruction courte qui nomme ce qui manque, puis la fiche est lue', async () => {
    const m = monde();
    // The first session ends without a sheet; the resumption gives one.
    m.fiche('');
    m.fiche({ verdict: 'ACCEPTÉ' });
    const fiche = await horsEnveloppe(m, 'relecteur');
    expect(fiche).toEqual({ verdict: 'ACCEPTÉ' });
    expect(m.appels()).toBe(2);
    expect(valeur(m.args(2), '--resume')).toBe(valeur(m.args(1), '--session-id'));
    expect(m.prompt(2)).toContain('sans fiche conforme');
    expect(m.prompt(2)).toContain('la sortie de la séance n’est pas le résultat JSON de claude');
    expect(m.prompt(2)).toContain('Rends ta fiche, selon ton schéma, sans refaire ton travail.');
    expect(m.prompt(2).length).toBeLessThan(m.prompt(1).length / 2);
    expect(m.commentaires()).toContainEqual(
      expect.stringMatching(/^Circuit · relecteur : séance finie sans fiche conforme/)
    );
  });

  it('une fiche hors de son schéma est reprise une fois, sa faute nommée', async () => {
    const m = monde();
    m.fiche({ verdict: 'PEUT-ÊTRE' });
    m.fiche({ verdict: 'ACCEPTÉ' });
    await horsEnveloppe(m, 'relecteur');
    expect(m.appels()).toBe(2);
    expect(m.prompt(2)).toContain('verdict');
    expect(m.prompt(2)).toContain('PEUT-ÊTRE');
  });

  it('une fiche dont la pièce n’est pas dans la copie est reprise une fois, la pièce nommée', async () => {
    const m = monde();
    m.fiche({
      statut: 'BESOIN',
      question: 'que rend mesure de 0 ?',
      piece: 'packages/forms/src/native.ts:234',
    });
    m.fiche({ statut: 'FAIT' });
    const fiche = await horsEnveloppe(m, 'developpeur');
    expect(fiche).toEqual({ statut: 'FAIT' });
    expect(m.prompt(2)).toContain(
      'piece : packages/forms/src/native.ts:234 introuvable dans la copie'
    );
    expect(m.commentaires()).toContainEqual(
      expect.stringMatching(/^Circuit · developpeur : séance finie sans fiche conforme/)
    );
  });
});

describe('la séance de l’enveloppe, de son lanceur à sa fiche', () => {
  it('rend la fiche que le lanceur a rangée, sans demander à claude un schéma qui n’est pas celui de son rôle', async () => {
    const m = monde();
    m.fiche({ statut: 'FAIT' });
    const { fiche } = await developpeur(m);
    expect(fiche).toEqual({ statut: 'FAIT' });
    expect(m.args(1)).not.toContain('--fiche');
  });

  it('la dernière passation au ticket ne décide rien : une ligne de statut qu’elle porte n’est pas lue', async () => {
    const m = monde();
    m.passations([
      {
        author: 'developpeur',
        text: 'Tests écrits.\nSTATUT : BESOIN — une question écrite au ticket seulement.',
      },
    ]);
    m.fiche({ statut: 'FAIT' });
    const { fiche } = await developpeur(m);
    expect(fiche).toEqual({ statut: 'FAIT' });
    expect(m.prompt(1)).toContain('STATUT : BESOIN');
  });
});

describe('une découverte de la fiche', () => {
  // A stand-in for bd on the PATH, for scripts/ticket.mjs: each call written in <journal>, the
  // ticket it creates « demo-9 ».
  function fauxBd() {
    const dossier = mkdtempSync(path.join(ESSAIS, 'bd-'));
    const journal = path.join(dossier, 'bd.log');
    const bin = path.join(dossier, 'bin');
    mkdirSync(bin);
    writeFileSync(
      path.join(bin, 'bd'),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> ${journal}\ncase "$1" in create) echo demo-9;; list) echo '[]';; esac\n`
    );
    chmodSync(path.join(bin, 'bd'), 0o755);
    return { journal, bin };
  }

  it('est consignée fermée sous le ticket, étiquetée decouverte, titrée de son sujet et des composants du plan', async () => {
    const m = monde();
    m.fiche({
      statut: 'FAIT',
      decouvertes: [
        { sujet: 'La mesure de zéro', corps: 'mesure(0) rend 0 : packages/forms/src/index.mjs:1' },
      ],
    });
    await developpeur(m);
    const [effet] = m.ctx.rendus.filter(e => e.genre === 'decouverte');
    expect(effet).toEqual({
      genre: 'decouverte',
      role: 'circuit',
      sujet: 'La mesure de zéro',
      corps: 'mesure(0) rend 0 : packages/forms/src/index.mjs:1',
      composants: '000-forms',
    });
    // Played, the effect files the ticket under its mother, labelled, then closes it.
    const { journal, bin } = fauxBd();
    const avant = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${avant ?? ''}`;
    try {
      jouerLEffet(m.ctx, effet, null);
    } finally {
      process.env.PATH = avant;
    }
    const appels = readFileSync(journal, 'utf8').split('\n');
    expect(appels).toContain(
      'create La mesure de zéro --parent demo-1 --no-inherit-labels -t task -l decouverte -d mesure(0) rend 0 : packages/forms/src/index.mjs:1 --silent'
    );
    expect(appels).toContain('update demo-9 --title 9 — La mesure de zéro — 000-forms');
    expect(appels).toContain('close demo-9 -r découverte consignée');
  });
});
