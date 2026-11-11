// The client of the nights of the machine (./deroule.ts): it asks for nights (the signal DEMANDER,
// the workflow of the nights started when none runs), reads them (the query L_ETAT_DES_NUITS), and
// creates or updates the one schedule of the machine, which starts the workflow NUIT_PLANIFIEE
// every day at its hour, and reads that hour back.
import {
  ScheduleAlreadyRunning,
  ScheduleNotFoundError,
  type Client,
  type ScheduleOptions,
  type ScheduleOptionsStartWorkflowAction,
} from '@temporalio/client';
import { FILE_DE_LA_MACHINE } from '../installation.js';
import {
  DEMANDER,
  ID_DE_LA_NUIT_PLANIFIEE,
  ID_DE_LA_PLANIFICATION,
  ID_DES_NUITS,
  L_ETAT_DES_NUITS,
  NUIT_PLANIFIEE,
  NUITS,
  RATTRAPAGE,
  type DemandeDeNuit,
  type EntreeDesNuits,
  type VueDesNuits,
} from './contrat.js';

/** Asks the workflow of the nights for <demande>, started on <file> when none runs. */
export async function demanderDesNuits(
  client: Client,
  demande: DemandeDeNuit,
  { file = FILE_DE_LA_MACHINE, id = ID_DES_NUITS }: { file?: string; id?: string } = {}
): Promise<void> {
  await client.workflow.signalWithStart(NUITS, {
    workflowId: id,
    taskQueue: file,
    args: [{} satisfies EntreeDesNuits],
    signal: DEMANDER,
    signalArgs: [demande],
  });
}

/** The nights as the workflow gives them. */
export async function lireLesNuits(client: Client, id = ID_DES_NUITS): Promise<VueDesNuits> {
  return client.workflow.getHandle(id).query<VueDesNuits>(L_ETAT_DES_NUITS);
}

/** The hour of the schedule when none is given and none exists: 1 h, the earliest of the former nights. */
export const HEURE_PAR_DEFAUT = 1;

/**
 * The schedule of the machine at <heure> (0 to 23) in the time zone <fuseau>: every day at that
 * hour, the workflow NUIT_PLANIFIEE on <file>; overlap SKIP, a firing missed taken within 24 h,
 * once. The hour belongs to the schedule, one for the machine, apart from the night of each
 * project that the bilan counts (`grillhouse.plageDeNuit`).
 */
export function optionsDeLaPlanification(
  heure: number,
  fuseau: string,
  { file = FILE_DE_LA_MACHINE, id = ID_DE_LA_PLANIFICATION }: { file?: string; id?: string } = {}
): ScheduleOptions<ScheduleOptionsStartWorkflowAction<() => Promise<void>>> {
  return {
    scheduleId: id,
    spec: {
      calendars: [{ hour: heure, minute: 0, comment: 'les nuits de la machine' }],
      timezone: fuseau,
    },
    action: {
      type: 'startWorkflow',
      workflowType: NUIT_PLANIFIEE,
      workflowId: ID_DE_LA_NUIT_PLANIFIEE,
      taskQueue: file,
      args: [],
    },
    policies: { overlap: 'SKIP', catchupWindow: RATTRAPAGE },
  };
}

/** The hour of the schedule <id> as the server keeps it, or null when it does not exist. */
export async function heureDeLaPlanification(
  client: Client,
  id = ID_DE_LA_PLANIFICATION
): Promise<number | null> {
  try {
    const d = await client.schedule.getHandle(id).describe();
    const h = d.spec.calendars?.[0]?.hour?.[0]?.start;
    return typeof h === 'number' ? h : null;
  } catch (e) {
    if (e instanceof ScheduleNotFoundError) {
      return null;
    }
    throw e;
  }
}

/**
 * Creates the schedule <options>, or updates the one that exists to them: played again, it leaves
 * one schedule. Whether it was created.
 */
export async function planifierLesNuits(
  client: Client,
  options: ReturnType<typeof optionsDeLaPlanification>
): Promise<boolean> {
  try {
    await client.schedule.create(options);
    return true;
  } catch (e) {
    if (!(e instanceof ScheduleAlreadyRunning)) {
      throw e;
    }
  }
  await client.schedule.getHandle(options.scheduleId).update(avant => ({
    ...avant,
    spec: options.spec,
    action: options.action,
    policies: { ...avant.policies, ...options.policies },
  }));
  return false;
}
