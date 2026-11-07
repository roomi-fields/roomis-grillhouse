import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The frame's package of the same tree, as the tests of this package reach it: `CADRE`,
// packages/grillhouse beside this package, never the one a resolution by its name would reach (in
// a copy without its own install, main's). A test launches its scripts in processes, as
// turborepo-tests launch the binary of turbo built in their own tree, and imports none of them in
// its own process: a function or a value of a script is read in a process of its own.

// The root of the tree.
export const RACINE = path.resolve(__dirname, '../../..');
// The directory of the frame's package, in the same tree.
export const CADRE = path.join(RACINE, 'packages/grillhouse');
// The lines of the key issue-prefix in the .beads/config.yaml that `bd init` of bd 1.2.2 writes:
// the key commented out, the prefix kept in the database of Beads.
export const DE_BD_INIT = `# Issue prefix for this repository (used by bd init)
# Example: issue-prefix: "myproject" creates issues like "myproject-1", "myproject-2", etc.
# issue-prefix: ""
`;

// The function <nom> of the frame's script <script> (from the package's directory), called in a
// process of its own: its arguments and its result pass as JSON, a promise awaited; a throw
// becomes an error that carries what the process wrote on its error output.
export function enProcessus<T>(script: string, nom: string): (...args: unknown[]) => T {
  const module = pathToFileURL(path.join(CADRE, script)).href;
  const code = `const m = await import(${JSON.stringify(module)});
process.stdout.write(JSON.stringify(await m[${JSON.stringify(nom)}](...JSON.parse(process.argv[1]))) ?? 'null');`;
  return (...args) => {
    const r = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', code, JSON.stringify(args)],
      {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      }
    );
    if (r.status !== 0) {
      throw new Error(`${script} ${nom} : ${r.stderr}`);
    }
    return JSON.parse(r.stdout) as T;
  };
}

// The values <noms> the frame's script <script> exports, read in a process of its own; empty when
// the script does not load.
export function valeursDe(script: string, noms: string[]): Record<string, unknown> {
  const module = pathToFileURL(path.join(CADRE, script)).href;
  const code = `const m = await import(${JSON.stringify(module)});
process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(noms)}.map(n => [n, m[n]]))));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  return r.status === 0 ? (JSON.parse(r.stdout) as Record<string, unknown>) : {};
}

// The frame's scripts, from the package's directory.
const SCRIPTS = path.join(CADRE, 'scripts');

// The modules under scripts/ that the module <fichier> imports by a relative path, static or
// dynamic (`from './x.mjs'`, `import './x.mjs'`, `import('./x.mjs')`); an import out of scripts/
// (the built `dist/`) is left out.
function importsDe(fichier: string): string[] {
  const texte = readFileSync(fichier, 'utf8');
  const motif = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
  return [...texte.matchAll(motif)]
    .map(m => path.resolve(path.dirname(fichier), m[1]!))
    .filter(f => !path.relative(SCRIPTS, f).startsWith('..') && existsSync(f));
}

/**
 * Copies the frame's scripts <entrees> (paths under scripts/) and every module they import, through
 * the graph of their relative imports, under <dossier>, each at its path under scripts/, and the
 * frame's package.json beside <dossier> when none is there (a script reads it at its load): a
 * project of trial holds what the scripts it runs load, never a list that a new import leaves
 * short.
 */
export function copierLesScripts(entrees: string[], dossier: string): void {
  const manifeste = path.join(dossier, '..', 'package.json');
  if (!existsSync(manifeste)) {
    mkdirSync(path.dirname(manifeste), { recursive: true });
    copyFileSync(path.join(CADRE, 'package.json'), manifeste);
  }
  const vus = new Set<string>();
  const aVoir = entrees.map(e => path.join(SCRIPTS, e));
  while (aVoir.length) {
    const f = aVoir.pop()!;
    if (vus.has(f)) {
      continue;
    }
    vus.add(f);
    const cible = path.join(dossier, path.relative(SCRIPTS, f));
    mkdirSync(path.dirname(cible), { recursive: true });
    copyFileSync(f, cible);
    aVoir.push(...importsDe(f));
  }
}
