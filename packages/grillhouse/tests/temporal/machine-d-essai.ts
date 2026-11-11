// The machine of trial of the places (scripts/places-de-la-machine.mjs), shared by their tests: a
// server of its own, the frame's worker on the task queue of the machine under a ceiling
// (GRILLHOUSE_PLACES, which the workflow reads from it), its workflow started with a fixed measure (the load of the workstation does not decide), and the environment
// the module reads it under (GRILLHOUSE_PLACES_D_ESSAI, the server of the places of a trial
// machine). Each machine is closed after its test.
import path from 'node:path';
import { afterEach } from 'vitest';
import { ATTRIBUTS_DE_RECHERCHE, ouvrirLeClient } from '../../src/temporal/client.js';
import { FILE_DE_LA_MACHINE } from '../../src/temporal/installation.js';
import { demarrerLesPlaces } from '../../src/temporal/places/client.js';
import {
  demarrerLeServeur,
  demarrerLeTravailleur,
  dossier,
  portLibre,
  programmeTemporal,
} from './essai.js';

const GO = 1024 ** 3;
const arrets: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const a of arrets.splice(0)) {
    await a();
  }
});

/**
 * A machine of trial of <plafond> places whose load is <charge> on 12 cores: the environment its
 * places are read under, and the killing of its server.
 */
export async function machineDesPlaces({ plafond = 2, charge = 1 } = {}) {
  const s = await demarrerLeServeur(
    programmeTemporal(),
    path.join(dossier('machine-des-places'), 'temporal.db'),
    await portLibre(),
    ATTRIBUTS_DE_RECHERCHE
  );
  arrets.push(() => s.tuer());
  const t = await demarrerLeTravailleur(s.adresse, FILE_DE_LA_MACHINE, {
    GRILLHOUSE_PLACES: String(plafond),
  });
  arrets.unshift(() => t.tuer());
  const c = ouvrirLeClient({ adresse: s.adresse });
  arrets.unshift(() => c.fermer());
  await demarrerLesPlaces(
    c.client,
    {
      espacementMs: 0,
      veilleMs: 300,
      mesureFixe: { coeurs: 12, charge, memoireLibre: 16 * GO },
    },
    { file: FILE_DE_LA_MACHINE }
  );
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    GRILLHOUSE_VERROU_MACHINE: process.env.GRILLHOUSE_VERROU_MACHINE ?? '',
    GRILLHOUSE_TEMPORAIRE_LIBRE: process.env.GRILLHOUSE_TEMPORAIRE_LIBRE ?? '0',
    GRILLHOUSE_COPIE_LIBRE: process.env.GRILLHOUSE_COPIE_LIBRE ?? '0',
    GRILLHOUSE_PLACES_D_ESSAI: s.adresse,
  };
  return { env, tuerLeServeur: () => s.tuer() };
}
