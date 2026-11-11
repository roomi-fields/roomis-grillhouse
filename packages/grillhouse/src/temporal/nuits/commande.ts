#!/usr/bin/env node
// The subcommand `grillhouse nuit`, the night of a project and the client of the nights of the
// machine (./client.ts):
//
//   grillhouse nuit                the pass of the night of the project of the working directory
//                                  (scripts/nuit.sh), which the workflow of the nights launches
//   grillhouse nuit <projet>       asks for the night of <projet> (a folder of its repository)
//   grillhouse nuit --planifier [--heure <0-23>]
//                                  creates or updates the one schedule of the machine
//   grillhouse nuit --help         the usage on the output (also -h), exit 0
//
// - Alone, it plays the pass (scripts/nuit.sh, with this process's streams; its exit code is the
//   command's): the workflow of the nights runs it in each project, as the table of tasks did.
// - With a project, the night of its main tree goes to the workflow of the nights, which plays
//   it in its turn, its marker unread; a project already in its queue or under way is not put in
//   twice. A project left out of the nights (its root gone, no night wired: ./choix.ts) is
//   refused, by its reason, exit 2.
// - `--planifier` creates the schedule of the machine, or updates the one that exists (one, id
//   fixed, overlap SKIP, a missed firing taken within 24 h): every day at <heure>, in the time zone
//   of the machine; without `--heure`, the hour the schedule already has, 1 h for a new one. Played
//   again, it leaves one schedule.
// - A server that does not answer is said on the error stream, exit 1; a malformed call writes the
//   usage on the error stream, exit 2.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sansReponseEn } from '../../../scripts/sans-reponse.mjs';
import {
  DELAI_JOIGNABLE_MS,
  adresseDuServeur,
  ouvrirLeClient,
  serveurJoignable,
} from '../client.js';
import { arbrePrincipalDe, lireLAppel } from './appel.js';
import { ecartDuProjet } from './choix.js';
import {
  demanderDesNuits,
  HEURE_PAR_DEFAUT,
  heureDeLaPlanification,
  optionsDeLaPlanification,
  planifierLesNuits,
} from './client.js';

const PASSE = fileURLToPath(new URL('../../../scripts/nuit.sh', import.meta.url));

const USAGE =
  'Usage : grillhouse nuit [<projet> | --planifier [--heure <0-23>]]\n' +
  'Seule, la passe de nuit du projet du dossier courant (la passe complète jouée pour de vrai,\n' +
  'puis les tests de nuit et les bancs de temps), que le déroulé des nuits lance.\n' +
  '  <projet>     demande la nuit de ce projet au déroulé des nuits, qui la joue à son tour\n' +
  '  --planifier  crée ou met à jour la planification des nuits de la machine, chaque jour\n' +
  '               à --heure (0-23) ; sans elle, l’heure qu’elle a déjà, 1 h pour une neuve\n' +
  '  -h, --help   affiche cette aide\n';

// The pass of the night, with this process's streams: its exit code.
function jouerLaPasse(): Promise<number> {
  const enfant = spawn('bash', [PASSE], { stdio: 'inherit' });
  const relais = (s: NodeJS.Signals) => enfant.kill(s);
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(s, relais);
  }
  return new Promise(ok => enfant.on('close', (code, signal) => ok(code ?? (signal ? 128 : 1))));
}

async function principal(argv: string[]): Promise<number> {
  const appel = lireLAppel(argv);
  if (appel.quoi === 'passe') {
    return jouerLaPasse();
  }
  if (appel.quoi === 'aide') {
    process.stdout.write(USAGE);
    return 0;
  }
  if (appel.quoi === 'faute') {
    process.stderr.write(`⛔ grillhouse nuit : ${appel.raison}\n${USAGE}`);
    return 2;
  }
  let racine: string | null = null;
  if (appel.quoi === 'demander') {
    const arbre = arbrePrincipalDe(path.resolve(appel.projet));
    const raison = 'raison' in arbre ? arbre.raison : ecartDuProjet(arbre.racine);
    if (raison !== null) {
      process.stderr.write(`⛔ grillhouse nuit : pas de nuit pour ${appel.projet} : ${raison}.\n`);
      return 2;
    }
    racine = (arbre as { racine: string }).racine;
  }
  const adresse = adresseDuServeur();
  if (!(await serveurJoignable(adresse))) {
    process.stderr.write(
      `⛔ ${sansReponseEn(DELAI_JOIGNABLE_MS)} sur ${adresse} : \`npx grillhouse temporal etat\` dit l'état du service.\n`
    );
    return 1;
  }
  const c = ouvrirLeClient();
  try {
    if (racine !== null) {
      await demanderDesNuits(c.client, { projet: racine });
      process.stdout.write(
        `▶ la nuit de ${racine} est demandée : le déroulé des nuits la joue à son tour, après celle en cours.\n`
      );
      return 0;
    }
    const heure =
      (appel.quoi === 'planifier' ? appel.heure : null) ??
      (await heureDeLaPlanification(c.client)) ??
      HEURE_PAR_DEFAUT;
    const fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const cree = await planifierLesNuits(c.client, optionsDeLaPlanification(heure, fuseau));
    process.stdout.write(
      `▶ la planification des nuits est ${cree ? 'créée' : 'à jour'} : chaque jour à ${heure} h (${fuseau}), ` +
        'les projets du registre qui ont bougé depuis leur dernière nuit verte, l’un après l’autre.\n'
    );
    return 0;
  } finally {
    await c.fermer();
  }
}

// The message of <e> and of each of its causes, as Temporal wraps a failure in its own.
const raisons = (e: unknown): string =>
  e instanceof Error
    ? [e.message, ...(e.cause === undefined ? [] : [raisons(e.cause)])].join(' : ')
    : String(e);

principal(process.argv.slice(2)).then(
  code => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`⛔ grillhouse nuit : ${raisons(e)}\n`);
    process.exitCode = 1;
  }
);
