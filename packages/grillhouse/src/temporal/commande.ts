#!/usr/bin/env node
// The subcommand `grillhouse temporal`, the account's Temporal:
//
//   grillhouse temporal installer [--archive <fichier>] [lieux]   lays down the program and the units
//   grillhouse temporal installer --programme-seul [--archive <fichier>] [--maison <dossier>]
//                                                                  lays down the program alone
//   grillhouse temporal etat [lieux]                                says whether each service runs
//
//   lieux : [--maison <dossier>] [--unites <dossier>] [--racine <dossier>] [--systemctl <programme>]
//
// - `installer` lays down the program `temporal` at its pinned version, its archive downloaded
//   from its release (or read from <fichier>) and checked against its pinned sum, writes the units
//   of the account, tells systemd, and declares TEMPORAL in `grillhouse.outils` of the project's
//   package.json (./installation.ts). An archive refused, or systemd failing: its line on the error
//   stream, exit 1. Systemd failing, the units stay written and not applied: the next run applies
//   them.
// - `installer --programme-seul` lays down the program alone, checked as above, and writes its
//   path, one line, on the standard output: no unit, no package.json, no systemctl. The CI gets the
//   pinned program so, as a user does (`TEMPORAL=$(npx grillhouse temporal installer
//   --programme-seul)`).
// - `etat` writes the state of each service on the standard output (./etat.ts); exit 0 when
//   installed, 1 when not.
// - The places: the home ($HOME), the directory of the units (<home>/.config/systemd/user), the
//   project (the working directory), and the program systemctl (`systemctl`), each an option, so
//   that a test plays under a trial home and never in the account's systemd.
// - A malformed call writes the usage on the error stream, exit 2.
import { readFileSync } from 'node:fs';
import { etat, texteDeLEtat } from './etat.js';
import { installer, lieuxDe, poserLeProgramme, systemctlDuCompte } from './installation.js';

const USAGE =
  'Usage : grillhouse temporal <installer|etat> [--programme-seul] [--archive <fichier>] ' +
  '[--maison <dossier>] [--unites <dossier>] [--racine <dossier>] [--systemctl <programme>]\n';

const OPTIONS = new Set(['--archive', '--maison', '--unites', '--racine', '--systemctl']);

// The action and the options of <args>, or null for a malformed call.
function lire(args: string[]) {
  const [action, ...reste] = args;
  if (action !== 'installer' && action !== 'etat') {
    return null;
  }
  const options: Record<string, string> = {};
  const seul = reste.indexOf('--programme-seul');
  if (seul >= 0) {
    if (action !== 'installer') {
      return null;
    }
    reste.splice(seul, 1);
  }
  for (let i = 0; i < reste.length; i += 2) {
    const [o, v] = [reste[i]!, reste[i + 1]];
    if (!OPTIONS.has(o) || v === undefined || (o === '--archive' && action !== 'installer')) {
      return null;
    }
    options[o.slice(2)] = v;
  }
  return { action, options, programmeSeul: seul >= 0 };
}

async function principal(args: string[]): Promise<number> {
  const appel = lire(args);
  if (appel === null) {
    process.stderr.write(USAGE);
    return 2;
  }
  const { action, options: o, programmeSeul } = appel;
  const lieux = lieuxDe({ maison: o.maison, unites: o.unites, racine: o.racine });
  const archive = o.archive;
  const obtenir = archive ? { obtenir: () => Promise.resolve(readFileSync(archive)) } : {};
  if (programmeSeul) {
    if (o.unites || o.racine || o.systemctl) {
      process.stderr.write(USAGE);
      return 2;
    }
    const { programme } = await poserLeProgramme({ lieux, ...obtenir });
    process.stdout.write(`${programme}\n`);
    return 0;
  }
  const systemctl = systemctlDuCompte(o.systemctl);
  if (action === 'etat') {
    const e = await etat({ lieux, systemctl });
    process.stdout.write(texteDeLEtat(e));
    return e.installe ? 0 : 1;
  }
  const r = await installer({ lieux, systemctl, ...obtenir });
  process.stdout.write(
    r.change
      ? `temporal : ${r.pose ? 'programme posé' : 'programme à jour'} (${r.programme}) ; ` +
          `unités écrites : ${r.unites.join(', ') || 'aucune'} ; ` +
          `appliquées : ${r.appliquees.join(', ') || 'aucune'} ; TEMPORAL ${r.outil ? 'déclarée' : 'à jour'}.\n`
      : 'temporal : l’installation est à jour, rien ne change.\n'
  );
  return 0;
}

principal(process.argv.slice(2)).then(
  code => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  }
);
