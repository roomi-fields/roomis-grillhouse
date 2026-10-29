// The arbitrages of a ticket, read in its comments (Beads' JSON, in their order): a question of
// conception the supervisor settles in a comment « ## Arbitrage… », as he writes it (the skill
// pitmaster, « Une question de conception se tranche par les règles »). The integration
// (scripts/integration/integrer.mjs) holds a lot whose arbitrage is not settled, and a module of
// language reads them by the join (scripts/langages.mjs), the guard of the consumers' arbitrages
// of the module typescript among them.

// True when the text <text> of a comment is an arbitrage: a « ## Arbitrage… » comment.
export const estArbitrage = text => /^\s*## Arbitrage\b/.test(String(text ?? ''));

// True when the text <text> of a comment is the owner's answer, « ## Réponse du responsable — <la
// question> », as the supervisor writes it (the skill pitmaster).
export const estReponseDuResponsable = text =>
  /^\s*## Réponse du responsable\b/.test(String(text ?? ''));

// True when the arbitrage <a> of <comments> (Beads' JSON, in their order) is settled: a line
// `### Verdict — tranché`, or a « ## Réponse du responsable » comment after it.
export function arbitrageTranche(comments, a) {
  const tranche = /^### Verdict\s*—\s*tranché/m.test(a.text);
  return (
    tranche || comments.slice(comments.indexOf(a) + 1).some(c => estReponseDuResponsable(c.text))
  );
}
