// A test that measures time marks itself, so that its failure under load is « à repasser », not a
// red (./duree.reporter.mjs):
//
//   import { mesurerAuRepos } from '@roomi-fields/grillhouse/vitest-config/mesure';
//   it('rend en moins de 50 ms', ctx => mesurerAuRepos(ctx, () => { … expect(ms).toBeLessThan(50); }));
//
// `mesurerAuRepos(ctx, fn)` marks the test of the context <ctx> as a measure of time and gives back
// what <fn> returns (a promise as it is, for the test to await). A time budget bench
// (`*.budget.test.*`) and a delay past need no mark.
export function mesurerAuRepos(ctx, fn) {
  ctx.task.meta.mesureDeTemps = true;
  return fn();
}
