// The git settings a test passes by the environment (GIT_CONFIG_COUNT, GIT_CONFIG_KEY_<n>,
// GIT_CONFIG_VALUE_<n>, git-config(1)), composed with those of the suite (grillhouse-3uv.72.1):
// the suite sets git once for all its processes, by the environment of its tests, and a test that
// adds or removes a setting keeps the others.

// A setting: its key and its value.
export type ReglageGit = readonly [cle: string, valeur: string];

// The settings that <env> passes to git by the environment, in their order.
function reglagesDe(env: NodeJS.ProcessEnv): ReglageGit[] {
  const n = Number(env.GIT_CONFIG_COUNT ?? 0);
  const reglages: ReglageGit[] = [];
  for (let i = 0; i < n; i++) {
    const cle = env[`GIT_CONFIG_KEY_${i}`];
    if (cle !== undefined) {
      reglages.push([cle, env[`GIT_CONFIG_VALUE_${i}`] ?? '']);
    }
  }
  return reglages;
}

// The variables that pass to git the settings of <env> that <garder> keeps (all by default), then
// <ajouts>: GIT_CONFIG_COUNT and its pairs, numbered from 0. Spread over an environment, they
// replace its own count and pairs; with no setting at all, there are none.
export function configGit(
  ajouts: readonly ReglageGit[] = [],
  garder: (cle: string) => boolean = () => true,
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const reglages = [...reglagesDe(env).filter(([cle]) => garder(cle)), ...ajouts];
  if (reglages.length === 0) {
    return {};
  }
  const vars: Record<string, string> = { GIT_CONFIG_COUNT: String(reglages.length) };
  reglages.forEach(([cle, valeur], i) => {
    vars[`GIT_CONFIG_KEY_${i}`] = cle;
    vars[`GIT_CONFIG_VALUE_${i}`] = valeur;
  });
  return vars;
}
