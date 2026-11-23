// When the trial server of Temporal may be stopped without losing a task (./repos-d-essai.ts,
// `estAuRepos`, which `attendreLeRepos` of ./essai.ts follows): a workflow is at rest once the
// server holds for it no workflow task and no activity, scheduled or started.
import { describe, expect, it } from 'vitest';
import { estAuRepos } from './repos-d-essai.js';

describe('le déroulé au repos, que l’arrêt du serveur d’essai attend', () => {
  it('un déroulé sans tâche de déroulé ni activité en attente est au repos', () => {
    expect(estAuRepos({})).toBe(true);
    expect(estAuRepos({ pendingWorkflowTask: null, pendingActivities: null })).toBe(true);
    expect(estAuRepos({ pendingWorkflowTask: null, pendingActivities: [] })).toBe(true);
  });

  it('une tâche de déroulé planifiée ou démarrée le tient hors du repos', () => {
    expect(
      estAuRepos({ pendingWorkflowTask: { state: 'PENDING_WORKFLOW_TASK_STATE_SCHEDULED' } })
    ).toBe(false);
    expect(
      estAuRepos({ pendingWorkflowTask: { state: 'PENDING_WORKFLOW_TASK_STATE_STARTED' } })
    ).toBe(false);
  });

  it('une activité que le serveur dit démarrée le tient hors du repos, même sans tâche de déroulé : sa remise au travailleur peut être en vol', () => {
    expect(
      estAuRepos({
        pendingWorkflowTask: null,
        pendingActivities: [{ activityType: { name: 'mesurerLaCopieDuTicket' }, state: 2 }],
      })
    ).toBe(false);
  });
});
