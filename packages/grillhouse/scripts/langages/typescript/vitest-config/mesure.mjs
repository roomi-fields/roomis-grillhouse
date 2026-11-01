// A test that measures time marks itself, so that its failure under load is « à repasser », not a
// red (./duree.reporter.mjs), and its file, a time witness, plays at night alone, out of the day
// (./cibles.mjs, grillhouse-bd7):
//
//   import { mesurerAuRepos } from '@roomi-fields/grillhouse/vitest-config/mesure';
//   it('rend en moins de 50 ms', ctx => mesurerAuRepos(ctx, () => { … expect(ms).toBeLessThan(50); }));
//
// `mesurerAuRepos(ctx, fn)` marks the test of the context <ctx> as a measure of time and gives back
// what <fn> returns (a promise as it is, for the test to await). A time budget bench
// (`*.budget.test.*`) needs no mark, nor a delay past in a night test.
export function mesurerAuRepos(ctx, fn) {
  ctx.task.meta.mesureDeTemps = true;
  return fn();
}
