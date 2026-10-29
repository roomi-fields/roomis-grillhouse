// grillhouse-3dr.2.1, criterion 5 — `grillhouse tests` and `grillhouse verifier` run the commands
// the module of the project's language describes (`commandes`), and the core reads their verdict
// through it (`verdict`): the same codes as before, 0, 1 and 75, and the same tasks and test files,
// as the witness recorded on the code of main before the join (tests/temoins/verdicts.json,
// tests/temoins/enregistrer.mjs). The trials play the real Turborepo and the real Vitest of the
// repository: a large test, which the night plays.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { langageDe } from '../../scripts/langages.mjs';
import {
  depotDeVerdict,
  tenirLaMachine,
  VERDICTS,
  verdictStable,
} from '../temoins/depots-de-verdict.mjs';

const PAQUET = path.resolve(__dirname, '../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verdicts-jointure-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { verdicts } = JSON.parse(
  readFileSync(path.join(PAQUET, 'tests/temoins/verdicts.json'), 'utf8')
) as { verdicts: { commande: string; sorte: string; pression: number }[] };

describe('grillhouse-3dr.2.1 — les verdicts comme avant', { timeout: 300_000 }, () => {
  it('the witness holds each verdict of the trials', () => {
    expect(
      verdicts.map(({ commande, sorte, pression }) => ({ commande, sorte, pression }))
    ).toEqual(VERDICTS);
  });

  it.each(verdicts.map(v => [`${v.commande} ${v.sorte}`, v] as const))(
    'criterion 5: grillhouse %s gives the witness’s code and verdict',
    async (_nom, v) => {
      const d = depotDeVerdict(mkdtempSync(path.join(ESSAIS, 'depot-')), v.sorte, {
        base: path.join(PAQUET, 'scripts/langages/typescript/vitest-config/base.mjs'),
        pression: v.pression,
      }) as { racine: string; env: Record<string, string> };
      const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
      const tenu =
        v.sorte === 'tenu'
          ? tenirLaMachine(path.join(PAQUET, 'scripts/verrou-de-machine.mjs'), d.env, d.racine)
          : null;
      await tenu?.pret;
      const r = spawnSync(process.execPath, [path.join(PAQUET, 'bin/grillhouse.mjs'), v.commande], {
        cwd: d.racine,
        env: { ...d.env, GRILLHOUSE_RESULTATS: resultats, GRILLHOUSE_ATTENTE_MACHINE_MS: '1500' },
        encoding: 'utf8',
      });
      tenu?.liberer();
      await tenu?.fin;
      expect({
        ...v,
        ...verdictStable(d.racine, r.status, langageDe(d.racine).verdict(resultats)),
      }).toEqual(v);
    }
  );
});
