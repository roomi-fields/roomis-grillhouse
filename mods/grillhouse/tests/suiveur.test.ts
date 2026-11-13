import { expect, test } from 'claude-code/testing'

import * as register from '../hooks/register'

// Read from the module's namespace: a name not yet exported fails its test, not the file's load.
const { attenteDeRelance, tableauDeLaLigne } = register as unknown as {
  attenteDeRelance: (echecs: number) => number
  tableauDeLaLigne: (ligne: string) => object | null
}

// The pane reads the lines of the follower (`grillhouse tableau --suivre`); it measures nothing on
// a clock of its own.

test('the pane keeps no clock of its own: no 30 s period, no 5 s clock of progress', () => {
  expect('PERIODE' in register).toBe(false)
  expect('aMesurer' in register).toBe(false)
  expect('AVANCEMENT' in register).toBe(false)
})

test('a line the follower writes is read as the board it carries', () => {
  const t = { lignes: [{ texte: 'DEMO', ton: 'titre' }], fiches: {}, etat: '🌙 1' }
  expect(tableauDeLaLigne(JSON.stringify(t))).toEqual(t)
  expect(tableauDeLaLigne(`${JSON.stringify(t)}\n`)).toEqual(t)
})

test('a line that is not a board is refused, never thrown', () => {
  expect(tableauDeLaLigne('')).toBeNull()
  expect(tableauDeLaLigne('pas du json')).toBeNull()
  expect(tableauDeLaLigne('{"fiches":{}}')).toBeNull()
  expect(tableauDeLaLigne('[1,2]')).toBeNull()
})

test('a follower that dies is started again after a growing wait, capped, never at once', () => {
  const attentes = [0, 1, 2, 3, 4, 5, 10, 50].map(attenteDeRelance)
  expect(attentes[0]).toBeGreaterThan(0)
  for (let i = 1; i < attentes.length; i++) {
    expect(attentes[i]).toBeGreaterThanOrEqual(attentes[i - 1] as number)
  }
  expect(attentes[1]).toBeGreaterThan(attentes[0] as number)
  expect(attentes[7]).toBe(attentes[6])
  expect(attentes[7]).toBeLessThanOrEqual(5 * 60_000)
})
