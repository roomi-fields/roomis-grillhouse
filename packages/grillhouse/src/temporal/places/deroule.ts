// The workflow of the machine, which holds its places (grillhouse-4nr.7, decision D2), as the job
// server of GNU make shares its slots between every make of a build, and as the semaphore of
// Temporal's samples (samples-typescript « mutex ») grants its leases: one workflow for the machine
// (ID_DES_PLACES), the one state of the places, which every pass and session of the machine reads
// (scripts/places-de-la-machine.mjs). A circuit draws its rank of arrival at its launch by the
// update TIRER_UN_RANG; a session asks for a place by the update PRENDRE, which records its request and returns at once;
// the main loop grants the places, and the session learns its grant by the query LA_DEMANDE, so no
// handler stays open while a request waits, and a request lives in the state a Continue-As-New
// carries. The signal RENDRE gives a place back or withdraws a request, RATTACHER names the process
// that holds a place; the query LES_PLACES gives the board the places and the requests that wait.
// The queue of the tickets of each project gives its circuits alive and the tickets it would start
// by the update RESERVER, and starts only those the machine lets start: the circuits of every
// project hold at most the ceiling, granted in the order of arrival of every project, as Buildkite
// bounds its pipelines in one fleet of agents. A grant passes by the rule of the places (`refusDeLaPlace` of
// scripts/regles-des-places.mjs): a free place under the ceiling (a configuration of the poste,
// read again by an activity at each judgement, so that a ceiling
// changed counts without restarting the workflow), the turn of its rank of arrival
// between projects, the admission at the load and the memory (measured by an activity, once per
// judgement and only when the place and the turn pass), the spacing of the starts. The requests
// are judged again at each change and every `veilleMs`; a place or a request whose process is gone
// (one activity for all of them) is removed for good then. Past its length of history
// (`continueAsNewSuggested`, or `limiteDHistoire`), the workflow continues as new with its state.
// Deterministic: it imports the workflow API, the contract and the pure rule.
import { ApplicationFailure } from '@temporalio/common';
import {
  allHandlersFinished,
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  defineUpdate,
  proxyActivities,
  setHandler,
  uuid4,
  workflowInfo,
} from '@temporalio/workflow';
import {
  decisionDeFermeture,
  decisionDeReouverture,
} from '../../../scripts/fermeture-de-la-machine.mjs';
import {
  phaseDeLaNuit,
  phaseDeLaReservation,
  refusDeLaPlace,
  reservationPerimee,
  reserverDesCircuits,
} from '../../../scripts/regles-des-places.mjs';
import type * as activites from './activites.js';
import {
  BATTRE_LA_RESERVATION,
  FERMER_LA_MACHINE,
  ROUVRIR_LA_MACHINE,
  type IssueDeLaFermeture,
  type IssueDeLaReouverture,
  type PriseDeLaMachine,
  LA_DEMANDE,
  LEVER_LA_RESERVATION,
  RESERVER_LA_MACHINE,
  LES_PLACES,
  PRENDRE,
  RATTACHER,
  RENDRE,
  RESERVER,
  TIRER_UN_RANG,
  type CircuitsDuProjet,
  type DemandeDePlace,
  type EntreeDesPlaces,
  type EtatDeLaDemande,
  type EtatDesPlaces,
  type Mesure,
  type PlaceDonnee,
  type Rattachement,
  type VueDesPlaces,
} from './contrat.js';

const { mesurerLaMachine, plafondDeLaMachine, processusVivants } = proxyActivities<
  typeof activites
>({
  startToCloseTimeout: '30 seconds',
  retry: { initialInterval: '1 second', maximumAttempts: 5 },
});

const prendre = defineUpdate<PlaceDonnee, [DemandeDePlace]>(PRENDRE);
const tirerUnRang = defineUpdate<number, []>(TIRER_UN_RANG);
const reserver = defineUpdate<string[], [CircuitsDuProjet]>(RESERVER);
const reserverLaMachine = defineUpdate<PriseDeLaMachine, [string]>(RESERVER_LA_MACHINE);
const fermerLaMachine = defineUpdate<IssueDeLaFermeture, []>(FERMER_LA_MACHINE);
const rouvrirLaMachine = defineUpdate<IssueDeLaReouverture, []>(ROUVRIR_LA_MACHINE);
const battreLaReservation = defineUpdate<void, [string]>(BATTRE_LA_RESERVATION);
const leverLaReservation = defineUpdate<void, [string]>(LEVER_LA_RESERVATION);
const rendre = defineSignal<[string]>(RENDRE);
const rattacher = defineSignal<[Rattachement]>(RATTACHER);
const lesPlaces = defineQuery<VueDesPlaces>(LES_PLACES);
const laDemande = defineQuery<EtatDeLaDemande, [string]>(LA_DEMANDE);

// The measure the rule asks for, which the workflow reads by its activity.
class BesoinDeLaMesure extends Error {}

const LIMITE_D_HISTOIRE = 2000;
// The ceiling before the first reading of a run with none in its entry.
const PLAFOND_AVANT_LECTURE = 3;

/** The places of the machine, until the next Continue-As-New. */
export async function placesDeLaMachine(entree: EntreeDesPlaces): Promise<void> {
  const etat: EtatDesPlaces = entree.etat ?? { rang: 0, dernier: 0, prises: [], attentes: [] };
  // Each change of the places, which wakes the main loop.
  let version = 0;
  const changer = () => {
    version += 1;
  };
  // The ceiling last read from the poste, and the fault of that reading; a faulty value keeps the
  // ceiling read before.
  let plafond = entree.plafond ?? PLAFOND_AVANT_LECTURE;
  let faute: string | null = null;
  const lireLePlafond = async () => {
    const r = await plafondDeLaMachine();
    faute = r.faute;
    if (r.plafond !== null) {
      plafond = r.plafond;
    }
  };

  // Removes the places and the requests whose process is gone, by one activity for all of them. A
  // place or a request attached to another process while the lives are read (`rattacher`, handled
  // during the await) is judged on that process at the next reading, not on the one read.
  const purger = async () => {
    const tous = [...etat.prises, ...etat.attentes].map(x => ({
      id: x.id,
      pid: x.pid,
      depart: x.depart,
    }));
    if (!tous.length) {
      return;
    }
    const vivants = await processusVivants(tous.map(x => ({ pid: x.pid, depart: x.depart })));
    const actuel = new Map([...etat.prises, ...etat.attentes].map(x => [x.id, x]));
    const morts = new Set(
      tous
        .filter((x, i) => {
          const a = actuel.get(x.id);
          return vivants[i] === false && a?.pid === x.pid && a.depart === x.depart;
        })
        .map(x => x.id)
    );
    if (!morts.size) {
      return;
    }
    etat.prises = etat.prises.filter(p => !morts.has(p.id));
    etat.attentes = etat.attentes.filter(a => !morts.has(a.id));
    changer();
  };

  // Grants the requests in their order of arrival, each by the rule; the machine measured at most
  // once, when a request passes the place and the turn. A request withdrawn while the measure is
  // read (the signal RENDRE, handled during its await) is judged no more.
  const juger = async () => {
    let mesure: Mesure | null = entree.mesureFixe ?? null;
    const encore = (id: string) => etat.attentes.some(x => x.id === id);
    for (const a of [...etat.attentes].sort((x, y) => x.rang - y.rang)) {
      if (!encore(a.id)) {
        continue;
      }
      const regle = (m: () => Mesure) =>
        refusDeLaPlace(etat, {
          id: a.id,
          rang: a.rang,
          plafond,
          espacementMs: entree.espacementMs,
          maintenant: Date.now(),
          mesurer: m,
          jeton: a.jeton ?? null,
        });
      let raison: string | null;
      try {
        raison = regle(() => {
          if (mesure) {
            return mesure;
          }
          throw new BesoinDeLaMesure();
        });
      } catch (e) {
        if (!(e instanceof BesoinDeLaMesure)) {
          throw e;
        }
        mesure = await mesurerLaMachine();
        if (!encore(a.id)) {
          continue;
        }
        const m = mesure;
        raison = regle(() => m);
      }
      if (raison === null) {
        etat.attentes = etat.attentes.filter(x => x.id !== a.id);
        etat.prises.push({
          id: a.id,
          pid: a.pid,
          depart: a.depart,
          ticket: a.ticket,
          racine: a.racine ?? null,
          ...(a.jeton ? { jeton: a.jeton } : {}),
          rang: a.rang,
          depuis: Date.now(),
        });
        etat.dernier = Date.now();
        changer();
      } else if (a.raison !== raison) {
        a.raison = raison;
      }
    }
  };

  setHandler(prendre, demande => {
    const connue =
      etat.prises.find(p => p.id === demande.id) ?? etat.attentes.find(a => a.id === demande.id);
    if (connue) {
      return { id: connue.id, rang: connue.rang };
    }
    const rang = demande.rang ?? etat.rang + 1;
    etat.rang = Math.max(etat.rang, rang);
    etat.attentes.push({
      id: demande.id,
      pid: demande.pid,
      depart: demande.depart,
      ticket: demande.ticket ?? null,
      racine: demande.racine ?? null,
      ...(demande.jeton ? { jeton: demande.jeton } : {}),
      rang,
      raison: 'pas encore jugée',
      depuis: Date.now(),
    });
    changer();
    return { id: demande.id, rang };
  });
  // The circuits of a project (`reserverDesCircuits` of scripts/regles-des-places.mjs): its
  // circuits alive hold their place, the tickets it would start wait for one in the order of
  // arrival of every project, under the ceiling; it gives back the candidates that hold a place.
  setHandler(reserver, demande => {
    const r = reserverDesCircuits(etat.circuits ?? [], demande, {
      rang: etat.rang,
      plafond,
      maintenant: Date.now(),
      reservee: Boolean(etat.reservation),
    });
    etat.circuits = r.circuits;
    etat.rang = r.rang;
    return r.accordes;
  });
  // The reservation of the whole machine by the night (`reservation` of the state): while it
  // stands, only the requests that carry its jeton are given a place (`refusDeLaPlace`), the
  // circuits of the queues get none new (`reserverDesCircuits`), the places taken finish.
  // A night that asks while the supervisor's closure stands does not take the machine and does not
  // fail: it learns it is not taken, and is skipped (src/temporal/nuits/).
  setHandler(reserverLaMachine, jeton => {
    if (etat.reservation?.auteur === 'superviseur') {
      return { prise: false };
    }
    if (etat.reservation && etat.reservation.jeton !== jeton) {
      throw ApplicationFailure.nonRetryable(
        'la machine est déjà réservée par une autre nuit',
        'ReservationTenue'
      );
    }
    if (!etat.reservation) {
      etat.reservation = { auteur: 'nuit', jeton, depuis: Date.now(), battement: Date.now() };
      changer();
    }
    return { prise: true };
  });
  // The closure of the supervisor (`cordon`): the same reservation, its author and a jeton of its
  // own that no pass nor session carries, no beat, so it never goes out of date. A night that
  // holds the machine keeps its reservation: no second one is taken.
  setHandler(fermerLaMachine, () => {
    const decision = decisionDeFermeture(etat.reservation);
    if (decision !== 'fermer') {
      return decision;
    }
    etat.reservation = { auteur: 'superviseur', jeton: uuid4(), depuis: Date.now() };
    changer();
    return 'fermee';
  });
  setHandler(rouvrirLaMachine, () => {
    const decision = decisionDeReouverture(etat.reservation);
    if (decision !== 'rouvrir') {
      return decision === 'deja-ouverte' ? 'deja-ouverte' : 'nuit-tient';
    }
    etat.reservation = null;
    changer();
    return 'rouverte';
  });
  setHandler(battreLaReservation, jeton => {
    if (etat.reservation?.jeton === jeton) {
      etat.reservation.battement = Date.now();
    }
  });
  setHandler(leverLaReservation, jeton => {
    if (etat.reservation?.jeton === jeton) {
      etat.reservation = null;
      changer();
    }
  });
  setHandler(tirerUnRang, () => {
    etat.rang += 1;
    return etat.rang;
  });
  setHandler(rendre, id => {
    const n = etat.prises.length + etat.attentes.length;
    etat.prises = etat.prises.filter(p => p.id !== id);
    etat.attentes = etat.attentes.filter(a => a.id !== id);
    if (etat.prises.length + etat.attentes.length !== n) {
      changer();
    }
  });
  setHandler(rattacher, ({ id, pid, depart }) => {
    const p = etat.prises.find(x => x.id === id) ?? etat.attentes.find(x => x.id === id);
    if (p) {
      p.pid = pid;
      p.depart = depart;
      changer();
    }
  });
  setHandler(lesPlaces, () => ({
    plafond,
    faute,
    circuits: [...(etat.circuits ?? [])].sort((a, b) => a.rang - b.rang),
    prises: etat.prises,
    attentes: [...etat.attentes].sort((a, b) => a.rang - b.rang),
    nuit:
      etat.reservation && etat.reservation.auteur !== 'superviseur'
        ? {
            phase: phaseDeLaNuit(etat) ?? 'en cours',
            depuis: etat.reservation.depuis,
            battement: etat.reservation.battement ?? etat.reservation.depuis,
          }
        : null,
    fermeture: etat.reservation
      ? {
          auteur: etat.reservation.auteur ?? 'nuit',
          depuis: etat.reservation.depuis,
          phase: phaseDeLaReservation(etat) ?? 'en cours',
        }
      : null,
  }));
  setHandler(laDemande, id => {
    const p = etat.prises.find(x => x.id === id);
    if (p) {
      return { etat: 'donnee', rang: p.rang };
    }
    const a = etat.attentes.find(x => x.id === id);
    return a ? { etat: 'attend', rang: a.rang, raison: a.raison } : { etat: 'inconnue' };
  });

  const limite = entree.limiteDHistoire ?? LIMITE_D_HISTOIRE;
  const aContinuer = () =>
    workflowInfo().continueAsNewSuggested || workflowInfo().historyLength >= limite;
  // The version the last judgement started from: a change during it (a request, a place given
  // back, its own grants) wakes the next one at once.
  let jugee = -1;
  if (entree.plafond === undefined) {
    await lireLePlafond();
  }
  for (;;) {
    await condition(() => version !== jugee || aContinuer(), entree.veilleMs);
    jugee = version;
    // A reservation whose night no longer beats is lifted, as a place of a circuit is gone.
    if (etat.reservation && reservationPerimee(etat.reservation, Date.now())) {
      etat.reservation = null;
      changer();
    }
    if (etat.prises.length || etat.attentes.length) {
      await purger();
      await lireLePlafond();
      await juger();
    }
    if (aContinuer()) {
      // Every handler returns at once: none holds the run open.
      await condition(allHandlersFinished);
      // The ceiling is read from the poste from then on, never carried.
      const { plafond: _lu, ...suite } = entree;
      await continueAsNew<typeof placesDeLaMachine>({ ...suite, etat });
    }
  }
}
