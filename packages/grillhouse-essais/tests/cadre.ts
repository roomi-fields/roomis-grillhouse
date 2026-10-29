import { spawnSync } from 'node:child_process';
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
