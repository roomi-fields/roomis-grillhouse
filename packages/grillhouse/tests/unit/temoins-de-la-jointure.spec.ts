// grillhouse-3dr.2.1, criteria 6 and 7 — the core asks the module typescript, and the module
// answers as the core answered before: the witnesses of tests/temoins/ were recorded on the code
// of main before the join (tests/temoins/enregistrer.mjs), as a golden file of Jest's
// `toMatchSnapshot`, and the same trials compare to them.
//
// - Criterion 6: the survey of BPScript 320.8 (composants-affectes) is the witness's, word for word.
// - Criterion 7: the rule of a test file (`estUnTest`) classes the 30 paths as the witness: what
//   the testwriter writes (`isTesterFile` before), a test file or a file of a folder of tests
//   (`isTestFile`), a test Vitest plays (its name).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { releve, texteDuReleve } from '../../scripts/composants-affectes.mjs';
import { langageDe } from '../../scripts/langages.mjs';
import { CHEMINS, depotDuClassement, depotDuReleve } from '../temoins/depots.mjs';

const TEMOINS = path.resolve(__dirname, '../temoins');
const temoin = (nom: string): unknown => JSON.parse(readFileSync(path.join(TEMOINS, nom), 'utf8'));
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'temoins-jointure-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Classe = { chemin: string; testeur: boolean; test: boolean; joue: boolean };

describe('grillhouse-3dr.2.1 — comme avant, d’après les témoins', { timeout: 60_000 }, () => {
  it('criterion 6: the survey of BPScript 320.8 is the witness’s', () => {
    const d = depotDuReleve(mkdtempSync(path.join(ESSAIS, 'releve-'))) as {
      racine: string;
      description: string;
    };
    expect(texteDuReleve(releve(d.racine, d.description))).toBe(
      (temoin('releve.json') as { texte: string }).texte
    );
  });

  const racine = depotDuClassement(mkdtempSync(path.join(ESSAIS, 'classement-'))) as string;
  const { chemins } = temoin('classement.json') as { chemins: Classe[] };

  it('the witness classes the 30 paths of the trial', () => {
    expect(chemins.map(c => c.chemin)).toEqual(CHEMINS);
    expect(chemins).toHaveLength(30);
  });

  it('criterion 7: estUnTest classes the 30 paths as the witness', () => {
    const langage = langageDe(racine);
    const classes = chemins.map(c => {
      const k = langage.estUnTest(c.chemin, racine);
      return {
        chemin: c.chemin,
        testeur: k !== null,
        test: k?.test ?? false,
        joue: k?.joue ?? false,
      };
    });
    expect(classes).toEqual(
      chemins.map(({ chemin, testeur, test, joue }) => ({ chemin, testeur, test, joue }))
    );
  });
});
