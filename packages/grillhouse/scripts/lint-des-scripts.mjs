// The guard `lint-des-scripts`, proper to the grillhouse package (it is in no project's list of
// guards): ESLint runs on `packages/grillhouse/scripts` of the working directory, and each error is
// counted per file and rule against the debt of `grillhouse-dette.json` (`trancher`, dette.mjs).
// An error beyond the inscribed count refuses with the file, the rule and the counts.
// ESLint is the repository's own tool, played by its executable (the package does not depend on it).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MODE, trancher } from './dette.mjs';

const DOSSIER = 'packages/grillhouse/scripts';
// The executable of ESLint in the repository's node_modules, from this file (packages/grillhouse/scripts).
const ESLINT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../node_modules/eslint/bin/eslint.js'
);

// The ESLint errors of the scripts of <racine>, as `{ fichier, regle, ligne, message }`.
export async function verifier(racine) {
  const r = spawnSync(process.execPath, [ESLINT, DOSSIER, '--ext', '.mjs', '-f', 'json'], {
    cwd: racine,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  let resultats;
  try {
    resultats = JSON.parse(r.stdout);
  } catch {
    throw new Error(`ESLint n'a pas rendu de JSON : ${r.stderr || r.error?.message || r.stdout}`);
  }
  const constats = [];
  for (const r of resultats) {
    const fichier = path.relative(racine, r.filePath).split(path.sep).join('/');
    for (const m of r.messages.filter(m => m.severity === 2)) {
      constats.push({
        fichier,
        regle: m.ruleId ?? 'parse',
        ligne: m.line,
        message: `${fichier}:${m.line} ${m.ruleId ?? 'parse'} — ${m.message}`,
      });
    }
  }
  return constats;
}

// The report of the check at <racine>: `lignes`, what the command writes on stderr (each refusal
// prefixed with `⛔`, then the debt's lines), and `code`, its exit code (1 on a refusal). The
// functional core of the command: it runs ESLint and reads the project's debt, and writes nothing to
// the standard streams; the command below is its shell. The refusals reach SARIF through `trancher`
// under the results directory <env> names (scripts/resultats.mjs); without it none is written, and
// the debt's mode is <env>'s `GRILLHOUSE_DETTE`.
export async function rapport(racine, env = process.env) {
  const { refus, lignes } = trancher(
    racine,
    'lint-des-scripts',
    await verifier(racine),
    env[MODE] || undefined,
    env
  );
  return {
    lignes: [...refus.map(r => `⛔ ${r.message}`), ...lignes],
    code: refus.length ? 1 : 0,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // The root of the repository: the first argument (the script `lint` of the package passes it),
  // the working directory otherwise.
  const racine = path.resolve(process.argv[2] ?? process.cwd());
  const { lignes, code } = await rapport(racine);
  for (const l of lignes) {
    process.stderr.write(`${l}\n`);
  }
  process.exitCode = code;
}
