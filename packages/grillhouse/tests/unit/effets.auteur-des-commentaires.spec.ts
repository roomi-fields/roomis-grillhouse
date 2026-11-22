// The author each write at the ticket carries (scripts/effets.mjs): a comment the circuit emits is
// written under the author the effect names (the reviewer for its verdict), under « circuit »
// without one; a discovery the circuit files is filed under « circuit ». A session writes under its
// own role (scripts/seances.mjs): the variable of the author holds the role of the session.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { ecrireLEffet } from '../../scripts/effets.mjs';
import * as seances from '../../scripts/seances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'auteur-des-commentaires-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = ecrireLEffet as (
  ctx: object,
  effet: object,
  cle: string | null
) => { status: number };

// A context whose bd keeps each call and the author it was made under.
const contexte = () => {
  const appels: { auteur: string | null; args: string[] }[] = [];
  const ok = { status: 0, stdout: '[]', stderr: '' };
  return {
    appels,
    ctx: {
      ticket: 'demo-1',
      racine: ESSAIS,
      bd: (...args: string[]) => {
        appels.push({ auteur: null, args });
        return ok;
      },
      bdSous: (auteur: string, ...args: string[]) => {
        appels.push({ auteur, args });
        return ok;
      },
    },
  };
};

describe('l’auteur des commentaires écrits au ticket', () => {
  it('un commentaire que le circuit émet sans auteur s’écrit sous « circuit »', () => {
    const { ctx, appels } = contexte();
    ecrire(ctx, { genre: 'commentaire', ticket: 'demo-1', texte: 'Circuit · plan : x' }, null);
    expect(appels).toEqual([
      { auteur: 'circuit', args: ['comments', 'add', 'demo-1', 'Circuit · plan : x'] },
    ]);
  });

  it('le verdict s’écrit sous l’auteur que l’effet nomme, le relecteur', () => {
    const { ctx, appels } = contexte();
    ecrire(
      ctx,
      { genre: 'commentaire', ticket: 'demo-1', texte: 'ACCEPTÉ', auteur: 'relecteur' },
      null
    );
    expect(appels.map(a => a.auteur)).toEqual(['relecteur']);
  });
});

describe('l’auteur d’une séance', () => {
  const jusquALaFiche = seances.jusquALaFiche as (
    ctx: object,
    role: string,
    texte: string,
    options: object
  ) => Promise<unknown>;
  const environnement = { ...process.env };
  afterEach(() => {
    for (const k of ['CLAUDE_BIN', 'GRILLHOUSE_REGISTRE']) {
      if (environnement[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = environnement[k];
      }
    }
  });

  it.each(['testwriter', 'developpeur', 'relecteur'])(
    'la séance du %s reçoit son rôle pour auteur de ses écritures',
    async role => {
      const dossier = mkdtempSync(path.join(ESSAIS, 'essai-'));
      const faux = path.join(dossier, 'claude');
      const vu = path.join(dossier, 'auteur');
      const fiche = role === 'relecteur' ? { verdict: 'ACCEPTÉ' } : { statut: 'FAIT' };
      const sortie = JSON.stringify({
        type: 'result',
        subtype: 'success',
        session_id: 'abc',
        structured_output: fiche,
      });
      writeFileSync(
        faux,
        `#!/bin/sh\nprintf '%s' "$BEADS_ACTOR" > '${vu}'\ncat <<'FICHE'\n${sortie}\nFICHE\n`
      );
      chmodSync(faux, 0o755);
      process.env.CLAUDE_BIN = faux;
      process.env.GRILLHOUSE_REGISTRE = path.join(dossier, 'registre.jsonl');
      const ctx = {
        racine: dossier,
        copie: dossier,
        ticket: 'demo-1',
        sujet: 'essai',
        paquets: ['.'],
        tmp: dossier,
        journal: path.join(dossier, 'journal'),
        fiches: path.join(dossier, 'fiches.jsonl'),
        transcriptions: path.join(dossier, 'transcriptions'),
        immobileMs: 60_000,
        bd: () => ({ status: 0, stdout: '[{}]', stderr: '' }),
      };
      await jusquALaFiche(ctx, role, 'consigne', {
        evenement: role,
        id: 'seance-essai',
        horsEnveloppe: true,
        prendrePlace: () => ({ rattacher: () => {}, rendre: () => {} }),
        signeDeVie: () => {},
      });
      expect(readFileSync(vu, 'utf8')).toBe(role);
    }
  );
});
