// A refused sheet names every fault of it in one refusal: what the sheet lacks (scripts/resultats.mjs
// `lireFiche`) and what its session's own validation refuses (`valider` of `jusquALaFiche`), since
// a session is taken up once on a refused sheet, as a linter reports every finding in one run.
// Witness: SyntHub SH-ae6.6.1 under 0.40.0, the reviewer on a lot without a defect: its first sheet
// refused for « RENDU sans constat bloquant », its second for « conformite : sans ligne pour
// crates/service/Cargo.toml#service », a fault the first refusal did not name — the stop
// « sans-fiche », two sessions lost.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lireFiche } from '../../scripts/resultats.mjs';
import * as seances from '../../scripts/seances.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'fautes-d-une-fiche-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const jusquALaFiche = seances.jusquALaFiche as (
  ctx: object,
  role: string,
  texte: string,
  options: object
) => Promise<unknown>;

// What claude prints for the sheet <fiche>.
const sortie = (fiche: unknown) =>
  JSON.stringify({ type: 'result', subtype: 'success', session_id: 'abc', structured_output: fiche });
// A reviewer's sheet that holds its schema and lacks its blocking finding.
const RENDU_SANS_BLOQUANT = { verdict: 'RENDU' };
const SANS_LIGNE = 'conformite : sans ligne pour crates/service/Cargo.toml#service';

describe('une fiche refusée dit toutes ses fautes à la fois', () => {
  it('a sheet that holds its schema comes back beside its faults; one that does not, alone', () => {
    const lu = lireFiche('relecteur', sortie(RENDU_SANS_BLOQUANT)) as {
      erreur?: string;
      lue?: unknown;
      fiche?: unknown;
    };
    expect(lu.erreur).toMatch(/verdict : RENDU sans constat bloquant/);
    expect(lu.lue).toEqual(RENDU_SANS_BLOQUANT);
    expect(lu.fiche).toBeUndefined();
    const horsSchema = lireFiche('relecteur', sortie({ verdict: 'PEUT-ÊTRE' })) as { lue?: unknown };
    expect(horsSchema.lue).toBeUndefined();
  });

  it('the session’s own validation names its faults in the same refusal', async () => {
    const dossier = mkdtempSync(path.join(ESSAIS, 'essai-'));
    const faux = path.join(dossier, 'claude');
    writeFileSync(faux, `#!/bin/sh\ncat <<'FICHE'\n${sortie(RENDU_SANS_BLOQUANT)}\nFICHE\n`);
    chmodSync(faux, 0o755);
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
    const env: Record<string, string> = {
      CLAUDE_BIN: faux,
      GRILLHOUSE_REGISTRE: path.join(dossier, 'registre.jsonl'),
    };
    const avant = { ...process.env };
    Object.assign(process.env, env);
    const juges: unknown[] = [];
    try {
      await expect(
        jusquALaFiche(ctx, 'relecteur', 'consigne', {
          evenement: 'relecture',
          id: 'seance-essai',
          horsEnveloppe: true,
          prendrePlace: () => ({ rattacher: () => {}, rendre: () => {} }),
          signeDeVie: () => {},
          valider: (f: unknown) => {
            juges.push(f);
            return SANS_LIGNE;
          },
        })
      ).rejects.toMatchObject({
        nom: 'sans-fiche',
        rapport: expect.stringMatching(
          /verdict : RENDU sans constat bloquant.* ; conformite : sans ligne pour crates\/service\/Cargo\.toml#service/
        ) as unknown,
      });
    } finally {
      for (const k of Object.keys(env)) {
        if (avant[k] === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = avant[k];
        }
      }
    }
    // The validation judged the sheet of each of the two launches, refused for what it lacks.
    expect(juges).toEqual([RENDU_SANS_BLOQUANT, RENDU_SANS_BLOQUANT]);
  });
});
