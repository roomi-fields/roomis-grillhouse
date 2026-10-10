import { expect, test } from 'claude-code/testing'

import { couleur, placement } from '../hooks/register'
import type { Tableau } from '../types'

const TABLEAU: Tableau = {
  lignes: [
    { texte: 'DEMO', ton: 'titre' },
    { texte: '⚠ 1 ticket(s) attendent ta décision', ton: 'attention' },
    { texte: '4 développeur  ▶ c.1.1 moteur ⌁', ton: 'actif' },
  ],
  etat: '⚠ 1 · c 1/5 · ▶ 1 en cours · 1 k aujourd\'hui',
}

test('each tone has its colour, the plain and quiet lines none', () => {
  expect(couleur('alerte')).toBe('red')
  expect(couleur('attention')).toBe('yellow')
  expect(couleur('actif')).toBe('cyan')
  expect(couleur('discret')).toBeUndefined()
  expect(couleur(undefined)).toBeUndefined()
})

test('in a Grillhouse project, the session start measures the board and writes the status line', async ($, on) => {
  let ecrit: (texte: string | undefined) => void = () => undefined
  const statut = new Promise<string | undefined>(r => (ecrit = r))
  on('process.run', ($, e) =>
    e.argv[0] === 'test'
      ? { value: { exitCode: 0, stdout: '', stderr: '' } }
      : { value: { exitCode: 0, stdout: JSON.stringify(TABLEAU), stderr: '' } },
  )
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('clock.every', () => ({ value: { cancel: () => undefined } }))
  on('ui.status', ($, e) => {
    ecrit(e.text)
    return { value: undefined }
  })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  expect(await statut).toBe(TABLEAU.etat)
})

for (const [cas, cwd, estProjet, isInteractive] of [
  ["in an agent's copy", '/p/.claude/worktrees/demo-1', true, true],
  ['outside a Grillhouse project', '/hors', false, true],
  ['in a session without screen', '/p', true, false],
] as const) {
  test(`${cas}, the mod measures nothing`, async ($, on) => {
    const lances: string[] = []
    on('process.run', ($, e) => {
      lances.push(e.argv.join(' '))
      const code = e.argv[0] === 'test' && !estProjet ? 1 : 0
      return { value: { exitCode: code, stdout: JSON.stringify(TABLEAU), stderr: '' } }
    })
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', () => ({ value: undefined }))
    on('clock.every', () => ({ value: { cancel: () => undefined } }))
    on('ui.status', () => ({ value: undefined }))
    await $.session.start({ cwd, surface: isInteractive ? 'terminal' : null, isInteractive })
    expect(lances).not.toContain('node scripts/tableau.mjs')
  })
}

test('the pane says where it sits, and what docking it beside the transcript takes', () => {
  expect(placement({ isFullscreen: true, columns: 140 })).toBe('Tableau Grillhouse ouvert sur le côté.')
  expect(placement({ isFullscreen: true, columns: 80 })).toMatch(/au moins 110 colonnes \(il en a 80\)/)
  expect(placement({ isFullscreen: false, columns: 200 })).toMatch(/\/tui fullscreen/)
})
