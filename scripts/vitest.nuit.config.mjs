// The night tests of a project: the files `*.nuit.test.*` and `*.nuit.spec.*`, too long for the
// day, and its time budget benches (`*.budget.test.*`, `*.budget.spec.*`), whose measures move with
// the load of the day; `npm test`, `npm run verifier` and the integration leave them out (the
// frame's base configuration of the day, the package @grillhouse/vitest-config, which every day
// configuration extends, excludes both). The night (scripts/nuit.sh) plays them with this
// configuration, from the root of its copy (`vitest run --root <copy> --config <this file>`),
// after a green full pass (`npm run verifier -- --force`) and before the project's night script.
// It reads no day configuration of the project, whether the project has one at its root or one
// per package; it takes the common environment (git's settings) from the base configuration.
import base from './vitest-config/base.mjs';

export default {
  test: {
    env: base.test.env,
    environment: base.test.environment,
    include: ['**/*.{nuit,budget}.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    watch: false,
  },
};
