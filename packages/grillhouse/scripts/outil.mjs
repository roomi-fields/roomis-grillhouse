#!/usr/bin/env node
// The installation of the published version that leads the frame's repository
// (scripts/aiguillage.mjs, the key `grillhouse.outil`, the cache, the switch).
//
//   npx grillhouse outil            installs the version the key names, nothing when it is there
//   npx grillhouse outil <x.y.z>    writes the key, then installs that version
//
// - The key is written in the package.json of the working directory, its other fields and its
//   indentation kept; a version is installed under ~/.cache/grillhouse/outil/<version>/.
// - Without the key and without a version, the command says so, exit 2; a faulty key or argument
//   too; a failed installation, exit 1. Changing the published version is this one gesture, which
//   the release proposes (`grillhouse sortie --etiqueter`).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CLE, installer, NOM_DU_PAQUET, versionDeLOutil, X_Y_Z } from './aiguillage.mjs';

// Writes <version> as the key of the package.json at <racine>, its other fields and its
// indentation kept.
function ecrireLaCle(racine, version) {
  const f = path.join(racine, 'package.json');
  const texte = readFileSync(f, 'utf8');
  const pkg = JSON.parse(texte);
  pkg.grillhouse = { ...(pkg.grillhouse ?? {}), outil: version };
  const retrait = /^\{\n([ \t]+)/.exec(texte)?.[1] ?? '  ';
  writeFileSync(f, `${JSON.stringify(pkg, null, retrait)}\n`);
}

const USAGE = 'Usage : npx grillhouse outil [<x.y.z>]\n';

// The version to install in <racine>: <args>[0] written as the key, else the key's; the exit code
// 2 and its message for a faulty argument or key, or a key absent.
function versionAInstaller(racine, args) {
  if (args.length > 1 || (args[0] !== undefined && !X_Y_Z.test(args[0]))) {
    return { refus: USAGE };
  }
  if (!existsSync(path.join(racine, 'package.json'))) {
    return {
      refus: `⛔ grillhouse outil : aucun package.json dans ${racine} ; la clé ${CLE} s'écrit au package.json racine du dépôt.\n`,
    };
  }
  if (args[0] !== undefined) {
    ecrireLaCle(racine, args[0]);
  }
  try {
    const version = versionDeLOutil(racine);
    return version === null
      ? {
          refus: `⛔ la clé ${CLE} manque au package.json : \`npx grillhouse outil <x.y.z>\` l'écrit et installe la version.\n`,
        }
      : { version };
  } catch (e) {
    return { refus: `⛔ grillhouse outil : ${e.message}\n` };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { version, refus } = versionAInstaller(process.cwd(), process.argv.slice(2));
  if (refus) {
    process.stderr.write(refus);
    process.exitCode = 2;
  } else {
    try {
      // Asked by hand: a failure kept by a launch does not stop it.
      const r = installer(version, { retenue: 0 });
      process.stdout.write(
        `✓ ${NOM_DU_PAQUET}@${version} ${r.installe ? 'installé' : 'déjà installé'} sous ${r.dossier}.\n`
      );
    } catch (e) {
      process.stderr.write(`⛔ grillhouse outil : ${e.message}\n`);
      process.exitCode = 1;
    }
  }
}
