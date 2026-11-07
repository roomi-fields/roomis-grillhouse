// The state of the account's Temporal (`grillhouse temporal etat`): for the server, the worker of
// the project and the worker of the machine, whether each runs (`systemctl --user is-active`), the
// version of the program laid down (`temporal --version`), and whether the server answers (the
// common client library, ./client.ts). Without an installation (the program of the pinned version
// or a unit missing), it says what is missing, and the command fails.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { sansReponseEn } from '../../scripts/sans-reponse.mjs';
import { DELAI_JOIGNABLE_MS, serveurJoignable } from './client.js';
import {
  cheminsDe,
  EPINGLE,
  type Epingle,
  type Lieux,
  type Systemctl,
  unitesDe,
} from './installation.js';

/** A service of the account and whether it runs. */
interface EtatDuService {
  role: 'serveur' | 'travailleur du projet' | 'travailleur de la machine';
  unite: string;
  actif: boolean;
}

/** The state of the account's Temporal. */
export interface Etat {
  installe: boolean;
  /** The program or the units missing, by their paths. */
  manques: string[];
  programme: { chemin: string; version: string | null };
  services: EtatDuService[];
  /** Whether the server answers; null without an installation. */
  joignable: boolean | null;
}

/** The version that the program <programme> says (`temporal version <v> (…)`), or null. */
function versionDuProgramme(programme: string): string | null {
  const r = spawnSync(programme, ['--version'], { encoding: 'utf8' });
  return /temporal version (\S+)/.exec(r.stdout ?? '')?.[1] ?? null;
}

const ROLES: EtatDuService['role'][] = [
  'serveur',
  'travailleur du projet',
  'travailleur de la machine',
];

/** What the state receives; each reading but the places and systemctl has its default. */
export interface OptionsDeLEtat {
  lieux: Lieux;
  systemctl: Systemctl;
  epingle?: Epingle;
  versionDe?: (programme: string) => string | null;
  joindre?: () => Promise<boolean>;
}

/** The state of the account's Temporal at the places <lieux>. */
export async function etat({
  lieux,
  systemctl,
  epingle = EPINGLE,
  versionDe = versionDuProgramme,
  joindre = () => serveurJoignable(),
}: OptionsDeLEtat): Promise<Etat> {
  const { programme } = cheminsDe(lieux, epingle.version);
  const unites = unitesDe(lieux.racine);
  const manques = [programme, ...unites.map(u => path.join(lieux.unites, u))].filter(
    f => !existsSync(f)
  );
  const installe = manques.length === 0;
  return {
    installe,
    manques,
    programme: { chemin: programme, version: existsSync(programme) ? versionDe(programme) : null },
    services: unites.map((unite, i) => ({
      role: ROLES[i]!,
      unite,
      actif: systemctl(['is-active', unite]).stdout.trim() === 'active',
    })),
    joignable: installe ? await joindre() : null,
  };
}

/** The state <e> in a few lines, for the standard output. */
export function texteDeLEtat(e: Etat): string {
  const lignes = e.installe
    ? [
        `Temporal est installé : temporal ${e.programme.version ?? '(version illisible)'}, ${e.programme.chemin}`,
      ]
    : [
        'Temporal n’est pas installé : `npx grillhouse temporal installer` le pose. Il manque :',
        ...e.manques.map(m => `  ${m}`),
      ];
  for (const s of e.services) {
    lignes.push(`${s.role} (${s.unite}) : ${s.actif ? 'tourne' : 'arrêté'}`);
  }
  if (e.joignable !== null) {
    // The server read by `serveurJoignable`, within its delay: the text of every reader.
    lignes.push(e.joignable ? 'le serveur répond' : sansReponseEn(DELAI_JOIGNABLE_MS));
  }
  return `${lignes.join('\n')}\n`;
}
