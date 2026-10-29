// Whether the permission rule <regle> covers the call <appel> (a command, or a tool's name), as
// Claude Code matches it: `*` any text, and a final ` *` also nothing. Shared by the tests of the
// rights of a role (packages/grillhouse/tests/unit/droits.spec.ts) and of the tri of the discoveries
// (packages/grillhouse-essais/tests/circuit.tri.nuit.spec.ts).
export function couvre(regle: string, appel: string): boolean {
  const m = /^Bash\((.*)\)$/.exec(regle);
  if (!m) {
    return regle === appel;
  }
  const motif = m[1];
  const final = motif.endsWith(' *');
  const corps = (final ? motif.slice(0, -2) : motif)
    .split('*')
    .map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${corps}${final ? '( .*)?' : ''}$`, 's').test(appel);
}
