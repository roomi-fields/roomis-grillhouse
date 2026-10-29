// The setup file of the base configuration: notes the CPU pressure (./pression.mjs) at the start
// and at the end of each test in its `task.meta`, which reaches the duration reporter
// (./duree.reporter.mjs). The end is noted after a delay past too: Vitest plays `afterEach` then.
import { afterEach, beforeEach } from 'vitest';
import { lirePression } from '../mesure/pression.mjs';

beforeEach(({ task }) => {
  task.meta.pressionDebut = lirePression();
});
afterEach(({ task }) => {
  task.meta.pressionFin = lirePression();
});
