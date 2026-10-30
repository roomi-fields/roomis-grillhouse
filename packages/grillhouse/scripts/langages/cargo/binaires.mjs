#!/usr/bin/env node
// The installation of the binaries of the module cargo (./binaires.json), the commands its share
// of the update describes (`miseAJour.installation`, scripts/jointure.d.ts), which the core runs.
//
//   node binaires.mjs liste                       the binaries installed, JSON on the standard output
//   node binaires.mjs installer <nom>@<version>   installs one binary at its version
//
// - `liste`: what `cargo install --list` lists, `{ <nom>: <version> }` (its lines `<nom> v<version>:`,
//   which cargo-binstall's installations also write). Cargo absent or failing: a line on the error
//   stream, named, and the code 1.
// - `installer`: `cargo binstall --no-confirm --locked <nom>@<version>`, its output this process's
//   error stream, its code this process's; a failure names on the error stream the command to type
//   and how cargo-binstall installs itself.
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** The binaries cargo lists as installed: `{ <nom>: <version> }`; throws, named, on a failure. */
export function installes() {
  const r = spawnSync('cargo', ['install', '--list'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    const cause = r.error ? r.error.message : (r.stderr ?? '').trim() || `code ${r.status}`;
    throw new Error(
      `⛔ \`cargo install --list\` échoue (${cause}) ; installe Rust (rustup), puis relance \`npx grillhouse maj\`.`
    );
  }
  return Object.fromEntries(
    [...r.stdout.matchAll(/^(\S+) v(\S+):/gm)].map(([, nom, version]) => [nom, version])
  );
}

/** Installs <cible> (`<nom>@<version>`): the exit code of cargo binstall. */
export function installer(cible) {
  const args = ['binstall', '--no-confirm', '--locked', cible];
  const r = spawnSync('cargo', args, { stdio: ['ignore', 2, 2] });
  const code = r.error ? 127 : (r.status ?? 1);
  if (code !== 0) {
    const cause = r.error ? r.error.message : `code ${code}`;
    process.stderr.write(
      `⛔ \`cargo ${args.join(' ')}\` échoue (${cause}) ; lance-la (cargo-binstall s'installe par \`cargo install cargo-binstall\`).\n`
    );
  }
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [nom, cible] = process.argv.slice(2);
  if (nom === 'liste') {
    try {
      process.stdout.write(`${JSON.stringify(installes())}\n`);
    } catch (e) {
      process.stderr.write(`${e.message}\n`);
      process.exitCode = 1;
    }
  } else if (nom === 'installer' && cible) {
    process.exitCode = installer(cible);
  } else {
    process.stderr.write('usage: binaires.mjs liste | installer <nom>@<version>\n');
    process.exitCode = 2;
  }
}
