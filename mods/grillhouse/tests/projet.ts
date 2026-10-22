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
