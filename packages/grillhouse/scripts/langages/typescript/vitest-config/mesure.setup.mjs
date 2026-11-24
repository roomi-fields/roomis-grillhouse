// The setup file of the base configuration: notes the CPU pressure (./pression.mjs) at the start
// and at the end of each test in its `task.meta`, which reaches the duration reporter
// (./duree.reporter.mjs). The end is noted after a delay past too: Vitest plays `afterEach` then.
// Mechanism: packages/grillhouse/docs/architecture/tests.md, §3.3.
import { afterEach, beforeEach } from 'vitest';
import { lirePression } from '../../../services-du-noyau.mjs';

beforeEach(({ task }) => {
  task.meta.pressionDebut = lirePression();
});
afterEach(({ task }) => {
  task.meta.pressionFin = lirePression();
});
