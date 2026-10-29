#!/usr/bin/env node
// Records the witnesses of « as before » (grillhouse-3dr.2.1) on the code of a commit, before the
// join of the languages, as a golden file of Jest's `toMatchSnapshot` is written once and compared
// since:
//
//   node packages/grillhouse/tests/temoins/enregistrer.mjs <commit>
//
// - The code measured is `packages/grillhouse` of <commit> (`git archive`), in a directory of its
//   own beside the repository's node_modules; the trials are those of ./depots.mjs. <commit> comes
//   before the join (c31dd7d for the witnesses of grillhouse-3dr.2.1): the scripts and functions
//   read below are that commit's, where `consommateurs.mjs` and `vitest-config/` lay directly under
//   `scripts/` and `resultats.mjs` still read the summaries; no later commit has them.
// - releve.json: the survey of BPScript 320.8 (`texteDuReleve` of composants-affectes.mjs).
// - classement.json: each path of `CHEMINS`, whether the testwriter writes it (`isTesterFile`), a
//   test file (`isTestFile`), a test Vitest plays (its name), and the right of each role to write
//   it (`refusal` of verrous/verrou.mjs, the developpeur's ticket with its section Architecture).
// - entrees.json: the text of the declarations of the named entries the join leaves as they are.
// - verdicts.json: each verdict of `VERDICTS`, `grillhouse tests` or `grillhouse verifier` by the
//   command of the package, its code and what its results hold (`verdictStable`).
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHEMINS, DEPOT, depotDuClassement, depotDuReleve } from './depots.mjs';
import { depotDeVerdict, tenirLaMachine, VERDICTS, verdictStable } from './depots-de-verdict.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const [commit] = process.argv.slice(2);
if (!commit) {
  process.stderr.write('usage: node enregistrer.mjs <commit>\n');
  process.exit(2);
}
const essais = mkdtempSync(path.join(tmpdir(), 'temoins-'));
const arbre = path.join(essais, 'arbre');
mkdirSync(arbre);
const archive = execFileSync('git', ['-C', DEPOT, 'archive', commit, 'packages/grillhouse'], {
  maxBuffer: 256 * 1024 * 1024,
});
execFileSync('tar', ['-x', '-C', arbre], { input: archive });
symlinkSync(path.join(DEPOT, 'node_modules'), path.join(arbre, 'node_modules'), 'dir');
const paquet = path.join(arbre, 'packages/grillhouse');
const module = rel => import(pathToFileURL(path.join(paquet, 'scripts', rel)).href);
const ecrire = (nom, valeur) =>
  writeFileSync(path.join(ICI, nom), `${JSON.stringify(valeur, null, 2)}\n`);

try {
  ecrire('entrees.json', {
    commit,
    'scripts/resultats.d.ts': readFileSync(path.join(paquet, 'scripts/resultats.d.ts'), 'utf8'),
  });
  const { releve, texteDuReleve } = await module('composants-affectes.mjs');
  const d = depotDuReleve(mkdtempSync(path.join(essais, 'releve-')));
  ecrire('releve.json', { commit, texte: texteDuReleve(releve(d.racine, d.description)) });

  const { isTestFile, isTesterFile, refusal } = await module('verrous/verrou.mjs');
  const { NOM_DE_TEST } = await module('consommateurs.mjs');
  const racine = depotDuClassement(mkdtempSync(path.join(essais, 'classement-')));
  const transcription = path.join(essais, 'transcription.jsonl');
  writeFileSync(
    transcription,
    `${JSON.stringify({ type: 'user', message: { content: 'TON TICKET : essai-1' } })}\n`
  );
  const droit = (role, chemin) =>
    refusal(
      role,
      {
        tool_name: 'Write',
        tool_input: { file_path: path.join(racine, chemin) },
        cwd: racine,
        transcript_path: transcription,
      },
      { tmp: path.join(essais, 'aucun'), describe: () => '## Architecture\n' }
    ) === null;
  ecrire('classement.json', {
    commit,
    chemins: CHEMINS.map(chemin => ({
      chemin,
      testeur: isTesterFile(chemin, racine),
      test: isTestFile(chemin),
      joue: NOM_DE_TEST.test(path.basename(chemin)),
      testwriter: droit('testwriter', chemin),
      developpeur: droit('developpeur', chemin),
    })),
  });

  const { lireRapportsVitest, lireResumes } = await module('resultats.mjs');
  const base = path.join(paquet, 'scripts/vitest-config/base.mjs');
  const verrou = path.join(paquet, 'scripts/verrou-de-machine.mjs');
  const verdicts = [];
  for (const v of VERDICTS) {
    const d = depotDeVerdict(mkdtempSync(path.join(essais, `${v.commande}-${v.sorte}-`)), v.sorte, {
      base,
      pression: v.pression,
    });
    const resultats = mkdtempSync(path.join(essais, 'resultats-'));
    const env = {
      ...d.env,
      GRILLHOUSE_RESULTATS: resultats,
      GRILLHOUSE_ATTENTE_MACHINE_MS: '1500',
    };
    const tenu = v.sorte === 'tenu' ? tenirLaMachine(verrou, d.env, d.racine) : null;
    await tenu?.pret;
    const r = spawnSync(process.execPath, [path.join(paquet, 'bin/grillhouse.mjs'), v.commande], {
      cwd: d.racine,
      env,
      encoding: 'utf8',
    });
    tenu?.liberer();
    await tenu?.fin;
    verdicts.push({
      ...v,
      ...verdictStable(d.racine, r.status, {
        taches: lireResumes(resultats),
        rapports: lireRapportsVitest(resultats),
      }),
    });
  }
  ecrire('verdicts.json', { commit, verdicts });
} finally {
  rmSync(essais, { recursive: true, force: true });
}
