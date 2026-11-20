#!/usr/bin/env node
// The installation of the binaries of the module c, the commands its share of the update describes
// (`miseAJour.installation`, scripts/jointure.d.ts), which the core runs.
//
//   node binaires.mjs liste                       the binaries installed, JSON on the standard output
//   node binaires.mjs installer <nom>@<version>   installs one binary at its version
//
// - The binaries: uv, at the version of the module python's binaires.json (one source), then
//   clang-format and clang-tidy at the versions of ./binaires.json, the wheels of PyPI that uv
//   installs.
// - `liste`: `{ "uv": <version> }` from `uv --version`, with the tools `uv tool list` prints
//   (`<nom> v<version>`); `{}` without uv, so that the update installs uv first.
// - `installer`: uv by the installer of the module python (../python/binaires.mjs); a clang tool by
//   `uv tool install <nom>==<version>`, its output this process's error stream, its code this
//   process's; a failure names on the error stream the command to type.
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OUTILS = ['clang-format', 'clang-tidy'];
// The script of the module python, which installs and lists uv: played, never imported (a module
// of language imports nothing from another).
const SCRIPT_UV = fileURLToPath(new URL('../python/binaires.mjs', import.meta.url));

const uvInstalle = () => {
  const r = spawnSync(process.execPath, [SCRIPT_UV, 'liste'], { encoding: 'utf8' });
  try {
    return r.status === 0 ? JSON.parse(r.stdout) : {};
  } catch {
    return {};
  }
};
const installerUv = cible =>
  spawnSync(process.execPath, [SCRIPT_UV, 'installer', cible], { stdio: ['ignore', 2, 2] })
    .status ?? 1;

/** The binaries installed: uv, and the clang tools uv lists. */
export function installes() {
  const out = uvInstalle();
  if (!out.uv) {
    return out;
  }
  const r = spawnSync('uv', ['tool', 'list'], { encoding: 'utf8' });
  if (r.status === 0) {
    for (const [, nom, version] of (r.stdout ?? '').matchAll(/^(\S+) v(\S+)\s*$/gm)) {
      if (OUTILS.includes(nom)) {
        out[nom] = version;
      }
    }
  }
  return out;
}

/** Installs <cible> (`<nom>@<version>`): its exit code. */
export function installer(cible) {
  const [nom, version] = cible.split('@');
  if (nom === 'uv') {
    return installerUv(cible);
  }
  if (!OUTILS.includes(nom) || !version) {
    process.stderr.write(`⛔ binaire inconnu du module c : ${cible} (<nom>@<version>)\n`);
    return 2;
  }
  const args = ['tool', 'install', `${nom}==${version}`];
  const r = spawnSync('uv', args, { stdio: ['ignore', 2, 2] });
  const code = r.error ? 127 : (r.status ?? 1);
  if (code !== 0) {
    const cause = r.error ? r.error.message : `code ${code}`;
    process.stderr.write(`⛔ \`uv ${args.join(' ')}\` échoue (${cause}) ; lance-la.\n`);
  }
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [nom, cible] = process.argv.slice(2);
  if (nom === 'liste') {
    process.stdout.write(`${JSON.stringify(installes())}\n`);
  } else if (nom === 'installer' && cible) {
    process.exitCode = installer(cible);
  } else {
    process.stderr.write('usage: binaires.mjs liste | installer <nom>@<version>\n');
    process.exitCode = 2;
  }
}
