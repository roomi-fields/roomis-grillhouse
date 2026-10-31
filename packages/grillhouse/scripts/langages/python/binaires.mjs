#!/usr/bin/env node
// The installation of uv, the binary of the module python (./binaires.json), by the commands its
// share of the update describes (`miseAJour.installation`, scripts/jointure.d.ts), which the core
// runs.
//
//   node binaires.mjs liste                       the binaries installed, JSON on the standard output
//   node binaires.mjs installer <nom>@<version>   installs one binary at its version
//
// - `liste`: `{ "uv": <version> }` from `uv --version` (`uv 0.10.4 (…)`); `{}` when uv is absent
//   or fails, so that the update installs it.
// - `installer`: the standalone installer of Astral at the version, as uv's documentation gives it
//   (`curl -LsSf https://astral.sh/uv/<version>/install.sh | sh`), its output this process's
//   error stream, its code this process's, the profiles of the shell left as they are
//   (UV_NO_MODIFY_PATH); a failure names on the error stream the command to type.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** The binaries installed: `{ uv: <version> }`, `{}` without uv. */
export function installes() {
  const r = spawnSync('uv', ['--version'], { encoding: 'utf8' });
  const m = r.status === 0 ? /^uv (\S+)/.exec(r.stdout ?? '') : null;
  return m ? { uv: m[1] } : {};
}

/** The command of the shell that installs uv at <version>. */
export const commandeDInstallation = version =>
  `curl -LsSf https://astral.sh/uv/${version}/install.sh | sh`;

/** Installs <cible> (`uv@<version>`): the exit code of the installer. */
export function installer(cible) {
  const [nom, version] = cible.split('@');
  if (nom !== 'uv' || !version) {
    process.stderr.write(`⛔ binaire inconnu du module python : ${cible} (uv@<version>)\n`);
    return 2;
  }
  const commande = commandeDInstallation(version);
  const r = spawnSync('sh', ['-c', commande], {
    stdio: ['ignore', 2, 2],
    env: { ...process.env, UV_NO_MODIFY_PATH: '1' },
  });
  const code = r.error ? 127 : (r.status ?? 1);
  if (code !== 0) {
    const cause = r.error ? r.error.message : `code ${code}`;
    process.stderr.write(`⛔ \`${commande}\` échoue (${cause}) ; lance-la.\n`);
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
