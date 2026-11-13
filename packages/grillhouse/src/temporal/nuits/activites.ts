// The activities of the nights of the machine (./deroule.ts): the choice of the projects of the
// register (./choix.ts), the note of a skip in the journal of the night of its project and in the
// register of the machine, the pass of the night of a project, and the request of the scheduled
// nights, which the workflow the schedule starts plays.
//
// - The pass is `node_modules/.bin/grillhouse nuit` in the main tree of the project, the command
//   of the version of the frame the project installs (scripts/nuit.sh, unchanged), in a process
//   group of its own, as the table of tasks launched it. While it plays, the activity sends a
//   heartbeat with its process; an attempt played again after its worker died ends the group of
//   the dead attempt first (`finirLaTentativeMorte` of ../acte.ts), so that two nights never run
//   at once. A cancellation sends SIGTERM to the group, then SIGKILL 10 s later.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Context } from '@temporalio/activity';
import { departDe, signalerGroupe } from '../../../scripts/mesure-de-la-machine.mjs';
import { espacementDe, VARIABLE_JETON } from '../../../scripts/regles-des-places.mjs';
import { ecrire, ligneDeNuit, REGISTRE } from '../../../scripts/registre.mjs';
import { finirLaTentativeMorte } from '../acte.js';
import { ouvrirLeClient } from '../client.js';
import { choisir, marqueurDeLaNuit, projetsDuRegistre } from './choix.js';
import {
  battreLaReservation,
  demarrerLesPlaces,
  leverLaReservation,
  lireLesPlaces,
  reserverLaMachineEntiere,
} from '../places/client.js';
import { demanderDesNuits } from './client.js';
import type { ActivitesDesNuits, ChoixDesNuits, Saut } from './contrat.js';

// How often a night in progress sends its heartbeat.
const BATTEMENT_MS = 30_000;
// How often the wait of the stages under way reads the phase of the night again.
const ATTENTE_DES_ETAPES_MS = 5_000;
// How long a cancelled night's group has after SIGTERM, before SIGKILL.
const GRACE_MS = 10_000;

// The date and the time of <d>, in local time, as the night writes them (`date +%Y-%m-%d %H:%M`).
function local(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  const jour = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return { jour, heure: `${jour} ${p(d.getHours())}:${p(d.getMinutes())}` };
}

export function choisirLesNuits(): Promise<ChoixDesNuits> {
  const texte = existsSync(REGISTRE) ? readFileSync(REGISTRE, 'utf8') : '';
  return Promise.resolve(choisir(projetsDuRegistre(texte)));
}

/** Writes the skip <saut> at <maintenant> in the journal of its night and in the register. */
export function noterLeSautA(saut: Saut, maintenant: Date): void {
  const { jour, heure } = local(maintenant);
  const marqueur = marqueurDeLaNuit(saut.racine);
  if (marqueur) {
    const dossier = path.dirname(marqueur);
    mkdirSync(dossier, { recursive: true });
    appendFileSync(
      path.join(dossier, `${jour}.log`),
      `— la nuit du ${heure} sur ${saut.sommet.slice(0, 7)} : sautée, ${saut.raison} ` +
        `(sommet ${saut.sommet}, référence ${saut.reference}).\n`
    );
  }
  ecrire(
    ligneDeNuit({
      projet: saut.racine,
      quand: maintenant.toISOString(),
      raison: saut.raison,
      sommet: saut.sommet,
      reference: saut.reference,
    })
  );
}

export function noterLeSaut(saut: Saut): Promise<void> {
  noterLeSautA(saut, new Date());
  return Promise.resolve();
}

/** The details of a heartbeat of a night: the process group of its pass. */
interface Battement {
  processus: { pid: number; depart: string | null };
}

/** The environment of the passes of the night: <env> with the jeton of the reservation of the machine. */
export function environnementDeLaNuit(
  env: Record<string, string | undefined>,
  jeton: string
): Record<string, string | undefined> {
  return { ...env, [VARIABLE_JETON]: jeton };
}

// Renews the reservation <jeton> of the machine, which the places lift once its beat is PERIME_MS
// old; a beat that fails is the next one's to renew.
async function battreLaReservationDe(jeton: string): Promise<void> {
  const c = ouvrirLeClient();
  try {
    await battreLaReservation(c.client, jeton);
  } catch {
    // The next beat renews it.
  } finally {
    await c.fermer();
  }
}

export async function reserverLaMachine({ jeton }: { jeton: string }): Promise<void> {
  const contexte = Context.current();
  const c = ouvrirLeClient();
  try {
    await demarrerLesPlaces(c.client, { espacementMs: espacementDe(process.env), veilleMs: 1_000 });
    await reserverLaMachineEntiere(c.client, { jeton });
    // The stages under way finish: the nights start once no place is held but the night's.
    for (;;) {
      if ((await lireLesPlaces(c.client)).nuit?.phase === 'en cours') {
        return;
      }
      contexte.heartbeat();
      await battreLaReservation(c.client, jeton);
      await contexte.sleep(ATTENTE_DES_ETAPES_MS);
    }
  } finally {
    await c.fermer();
  }
}

export async function leverLaMachine({ jeton }: { jeton: string }): Promise<void> {
  const c = ouvrirLeClient();
  try {
    await leverLaReservation(c.client, jeton);
  } finally {
    await c.fermer();
  }
}

export async function jouerLaNuit({
  racine,
  jeton,
}: {
  racine: string;
  jeton: string;
}): Promise<number> {
  const contexte = Context.current();
  const avant = contexte.info.heartbeatDetails as Battement | undefined;
  finirLaTentativeMorte(avant?.processus);
  const enfant = spawn(path.join(racine, 'node_modules/.bin/grillhouse'), ['nuit'], {
    cwd: racine,
    stdio: 'ignore',
    env: environnementDeLaNuit(process.env, jeton),
    detached: true,
  });
  const fin = new Promise<number>((ok, ko) => {
    enfant.on('error', ko);
    enfant.on('close', (code, signal) => ok(code ?? (signal ? 128 : 1)));
  });
  const moi = { pid: enfant.pid!, depart: enfant.pid ? departDe(enfant.pid) : null };
  const battre = () => {
    contexte.heartbeat({ processus: moi } satisfies Battement);
    void battreLaReservationDe(jeton);
  };
  battre();
  const minuteur = setInterval(battre, BATTEMENT_MS);
  let tuer: NodeJS.Timeout | null = null;
  const annuler = () => {
    signalerGroupe(moi.pid, 'SIGTERM');
    tuer = setTimeout(() => signalerGroupe(moi.pid, 'SIGKILL'), GRACE_MS);
  };
  contexte.cancellationSignal.addEventListener('abort', annuler);
  try {
    const code = await fin;
    // What remains of the group ends before the activity does.
    while (contexte.cancellationSignal.aborted && signalerGroupe(moi.pid, 0)) {
      await new Promise(ok => setTimeout(ok, 200));
    }
    return code;
  } finally {
    if (tuer) {
      clearTimeout(tuer);
    }
    clearInterval(minuteur);
    contexte.cancellationSignal.removeEventListener('abort', annuler);
  }
}

export async function demanderLesNuitsPlanifiees(): Promise<void> {
  const c = ouvrirLeClient();
  try {
    await demanderDesNuits(c.client, { planifiee: true });
  } finally {
    await c.fermer();
  }
}

// The activities match their contract.
export const activitesDesNuits: ActivitesDesNuits = {
  choisirLesNuits,
  noterLeSaut,
  reserverLaMachine,
  leverLaMachine,
  jouerLaNuit,
  demanderLesNuitsPlanifiees,
};
