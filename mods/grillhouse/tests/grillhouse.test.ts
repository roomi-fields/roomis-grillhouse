import { expect, test } from 'claude-code/testing'

import { bascule, couleur, debut, ficheLignes, placement } from '../hooks/register'
import type { Tableau } from '../types'

const TABLEAU: Tableau = {
  lignes: [
    { texte: 'DEMO', ton: 'titre' },
    { texte: '⚠ 1 ticket(s) attendent ta décision', ton: 'attention' },
    { texte: '4 développeur  ▶ c.1.1  Écrit', ton: 'actif' },
  ],
  fiches: {},
}

test('each tone has its colour, the plain and quiet lines none', () => {
  expect(couleur('alerte')).toBe('red')
  expect(couleur('attention')).toBe('yellow')
  expect(couleur('actif')).toBe('cyan')
  expect(couleur('discret')).toBeUndefined()
  expect(couleur(undefined)).toBeUndefined()
})

test('in a Grillhouse project, the session start measures the board', async ($, on) => {
  let lance: (argv: string) => void = () => undefined
  const mesure = new Promise<string>(r => (lance = r))
  on('process.run', ($, e) => {
    if (e.argv[0] !== 'test') lance(e.argv.join(' '))
    return { value: { exitCode: 0, stdout: JSON.stringify(TABLEAU), stderr: '' } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('clock.every', () => ({ value: { cancel: () => undefined } }))
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  expect(await mesure).toBe('node scripts/tableau.mjs')
  await new Promise(r => setTimeout(r, 50))
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
    await $.session.start({ cwd, surface: isInteractive ? 'terminal' : null, isInteractive })
    expect(lances).not.toContain('node scripts/tableau.mjs')
  })
}

test('the pane says where it sits, and what docking it beside the transcript takes', () => {
  expect(placement({ isFullscreen: true, columns: 140 })).toBe('Tableau Grillhouse ouvert sur le côté.')
  expect(placement({ isFullscreen: true, columns: 80 })).toMatch(/au moins 110 colonnes \(il en a 80\)/)
  expect(placement({ isFullscreen: false, columns: 200 })).toMatch(/\/tui fullscreen/)
})

test("the card says the chosen ticket's whole title, its state, duration, tokens and summary", () => {
  expect(
    ficheLignes({
      numero: '320.2.1',
      titre: "Publie l'objet de la scène",
      composant: '030-binder',
      statut: 'in_progress',
      duree: 12 * 60_000,
      jetons: 310_000,
      resume: 'Le résumé.',
    }),
  ).toEqual(["320.2.1 — Publie l'objet de la scène", '030-binder · en cours · 12 min · 310 k jetons', 'Le résumé.'])
  expect(ficheLignes(undefined)[0]).toMatch(/ctrl\+x tab/)
})

test('the window stays put while the line keeps one line above and below, and moves at its edges', () => {
  // 50 lines in 10 rows, the window showing lines 20 to 29.
  expect(debut(50, 25, 10, 20)).toBe(20)
  expect(debut(50, 28, 10, 20)).toBe(20)
  expect(debut(50, 29, 10, 20)).toBe(21)
  expect(debut(50, 21, 10, 20)).toBe(20)
  expect(debut(50, 20, 10, 20)).toBe(19)
  expect(debut(50, 0, 10, 20)).toBe(0)
  expect(debut(50, 49, 10, 20)).toBe(40)
})

test('3uv.24 critère 5 : the switch gives in progress → open, anything else → in progress', () => {
  expect(bascule('in_progress')).toBe('open')
  expect(bascule('open')).toBe('in_progress')
  expect(bascule(undefined)).toBe('in_progress')
})
