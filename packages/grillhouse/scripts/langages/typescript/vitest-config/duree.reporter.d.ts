// The types of ./duree.reporter.mjs, for a strict TypeScript Vitest configuration that names
// `@roomi-fields/grillhouse/vitest-config/duree` in its reporters.
import type { Reporter } from 'vitest/reporters';

// The duration reporter: Vitest's exit code becomes 75 when every failure depends on a duration and
// one took place under load.
export default class DureeReporter implements Reporter {
  onInit: Reporter['onInit'];
  onFinished: Reporter['onFinished'];
}
