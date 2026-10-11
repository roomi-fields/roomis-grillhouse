// The night tests of a project: the files `*.nuit.test.*` and `*.nuit.spec.*`, too long for the
// day, which `npm test` and the integration leave out. The night (scripts/nuit.sh) plays them with
// this configuration, from the root of its copy (`vitest run --root <copy> --config <this file>`),
// after a green `npm test` and before the project's night script. It stands alone: it reads no
// day configuration of the project.
export default {
  test: {
    environment: 'node',
    include: ['**/*.nuit.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    watch: false,
  },
};
