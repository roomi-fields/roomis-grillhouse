// The call of the subcommand `grillhouse nuit` (./commande.ts): what its command line asks, and the
// main tree of the project it names.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

/** What the command line asks. */
export type Appel =
  | { quoi: 'passe' }
  | { quoi: 'aide' }
  | { quoi: 'planifier'; heure: number | null }
  | { quoi: 'demander'; projet: string }
  | { quoi: 'faute'; raison: string };

/** The call <argv> read. */
export function lireLAppel(argv: string[]): Appel {
  if (argv.length === 0) {
    return { quoi: 'passe' };
  }
  if (argv.some(a => a === '-h' || a === '--help')) {
    return argv.length === 1 ? { quoi: 'aide' } : { quoi: 'faute', raison: 'l’aide va seule.' };
  }
  if (argv[0] === '--planifier') {
    if (argv.length === 1) {
      return { quoi: 'planifier', heure: null };
    }
    const [, option, valeur, ...reste] = argv;
    const heure = Number(valeur);
    if (option !== '--heure' || reste.length || !/^\d{1,2}$/.test(valeur ?? '') || heure > 23) {
      return { quoi: 'faute', raison: '--planifier prend au plus --heure <0-23>.' };
    }
    return { quoi: 'planifier', heure };
  }
  if (argv.length > 1) {
    return { quoi: 'faute', raison: `un seul argument : ${argv.join(' ')}.` };
  }
  const [a] = argv as [string];
  if (a.startsWith('-')) {
    return { quoi: 'faute', raison: `argument inconnu : ${a}` };
  }
  return { quoi: 'demander', projet: a };
}

/** The main tree of the repository that holds <dossier>, or the reason it is none. */
export function arbrePrincipalDe(dossier: string): { racine: string } | { raison: string } {
  const r = spawnSync(
    'git',
    ['-C', dossier, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    { encoding: 'utf8' }
  );
  return r.status === 0
    ? { racine: path.dirname(r.stdout.trim()) }
    : { raison: `${dossier} n’est pas dans un dépôt git` };
}
