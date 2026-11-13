// A Grillhouse project for the mod's tests: the package.json of its directory declares the frame's
// package, as the project's `npm install` reads it.
export const PKG = JSON.stringify({ devDependencies: { '@roomi-fields/grillhouse': '*' } })

// Answers the mod's reading of the project's package.json with <pkg> (none when null), by the hook
// function `on` of a test.
export function projetGrillhouse(on: unknown, pkg: string | null = PKG): void {
  const o = on as (n: string, h: (_: unknown, e: { path: string }) => unknown) => void
  o('fs.exists', (_, e) => ({ value: pkg !== null && e.path.endsWith('/package.json') }))
  o('fs.read', () => ({ value: pkg ?? '' }))
}

type Requete = { argv: string[]; cwd?: string }
type Ligne = object | string
export type SuiveurSimule = {
  // Each start of the follower, with its argv and its folder.
  lancements: Requete[]
}

// The follower of the board (`grillhouse tableau --suivre`) as the engine's `process.spawn` runs it,
// by the hook function `on` of a test: it writes `premiere(requete)` as its only line (an object is
// written as JSON; null is a follower that dies at once on stderr, code 1), then ends with code 0
// (`vivant`: it stays pending instead).
// A stream that stays pending holds the test bench's chain, so a new measure is the next start: the
// pane starts the follower again after its wait, which the test moves on with the mocked clock, and
// `premiere` answers the board of that moment.
export function suiveurSimule(on: unknown, premiere: (r: Requete) => Ligne | null | Promise<Ligne | null>,
  vivant = false,
): SuiveurSimule {
  const lancements: Requete[] = []
  const enLigne = (l: Ligne) => `${typeof l === 'string' ? l : JSON.stringify(l)}\n`
  const o = on as (n: string, h: unknown) => void
  o('process.spawn', async function* (_: unknown, e: Requete) {
    lancements.push({ argv: [...e.argv], cwd: e.cwd })
    const debut = await premiere(e)
    if (debut === null) {
      yield { stream: 'stderr', text: `tableau illisible à ${e.cwd}\n` }
      return { value: { code: 1, signal: null } }
    }
    yield { stream: 'stdout', text: enLigne(debut) }
    // A follower that lives on keeps its line as the last word of the pane, with no "stopped" message;
    // it holds the bench's chain, so only a test of that message asks for it.
    while (vivant) await new Promise(r => setTimeout(r, 20))
    return { value: { code: 0, signal: null } }
  })
  return { lancements }
}
