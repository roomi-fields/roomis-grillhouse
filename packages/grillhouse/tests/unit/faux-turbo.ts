import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Le Turborepo des tests (grillhouse-44b.5), premier sur le PATH, sur le modèle du faux cargo
// (./langages/cargo/faux-cargo.ts) : un script de Node nommé `turbo`, et un `npx` qui lui passe la
// main (`npx --no-install turbo …`), pour qu'un test lise l'appel que le module fait sans jouer la
// tâche.
//
// - Chaque appel est une ligne JSON du journal `FAUX_TURBO_JOURNAL` : `{ args, tests, tmpdir }`, ses
//   arguments, la variable des chemins nommés `GRILLHOUSE_TESTS` (null si absente) et le dossier
//   temporaire `TMPDIR`.
// - Avec `--dry=json`, il écrit `{ "tasks": [] }` et sort avec `FAUX_TURBO_CODE_DRY`, 0 sans elle.
// - Avec `--summarize` et `FAUX_TURBO_RESUME`, il écrit ce texte en résumé `.turbo/runs/faux-resume.json`
//   du dossier courant, comme Turborepo.
// - Sinon il écrit `FAUX_TURBO_SORTIE` et sort avec `FAUX_TURBO_CODE`, 0 sans elle.
const SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.FAUX_TURBO_JOURNAL) {
  fs.appendFileSync(process.env.FAUX_TURBO_JOURNAL, JSON.stringify({ args, tests: process.env.GRILLHOUSE_TESTS ?? null, tmpdir: process.env.TMPDIR ?? null }) + '\\n');
}
if (args.includes('--dry=json')) {
  process.stdout.write(JSON.stringify({ tasks: [] }));
  process.exit(Number(process.env.FAUX_TURBO_CODE_DRY || 0));
}
if (process.env.FAUX_TURBO_RESUME && args.includes('--summarize')) {
  fs.mkdirSync('.turbo/runs', { recursive: true });
  fs.writeFileSync('.turbo/runs/faux-resume.json', process.env.FAUX_TURBO_RESUME);
}
if (process.env.FAUX_TURBO_SORTIE) process.stdout.write(process.env.FAUX_TURBO_SORTIE);
process.exit(Number(process.env.FAUX_TURBO_CODE || 0));
`;
const NPX = `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2).filter(a => a !== '--no-install');
const [outil, ...reste] = args;
const r = spawnSync(outil, reste, { stdio: 'inherit' });
process.exit(r.status ?? 1);
`;

/** Écrit le faux Turborepo et le faux npx dans un nouveau dossier sous <dans> : ce dossier. */
export function installerFauxTurbo(dans: string): string {
  const dossier = mkdtempSync(path.join(dans, 'faux-turbo-'));
  for (const [nom, texte] of [
    ['turbo', SCRIPT],
    ['npx', NPX],
  ] as const) {
    writeFileSync(path.join(dossier, nom), texte);
    chmodSync(path.join(dossier, nom), 0o755);
  }
  return dossier;
}

export type AppelTurbo = { args: string[]; tests: string | null; tmpdir: string | null };

/** Les appels du journal <journal>, dans l'ordre. */
export function appelsDeTurbo(journal: string): AppelTurbo[] {
  return readFileSync(journal, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as AppelTurbo);
}
