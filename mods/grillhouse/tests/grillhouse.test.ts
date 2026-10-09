import { expect, test } from 'claude-code/testing'

import { compteurs, duree, ligneEtat, placement } from '../hooks/register'
import type { Tableau } from '../types'

const vide = { enCours: [], prets: [], bloques: [], aValider: [], reportes: [], fermes: [] }
const TABLEAU: Tableau = {
  projet: { enCours: 1, prets: 2, bloques: 1, aValider: 1, reportes: 3, fermes: 5 },
  epopees: [
    {
      id: 'demo-e',
      titre: 'E',
      priorite: 1,
      enCours: true,
      compteurs: { enCours: 1, prets: 2, bloques: 1, aValider: 1, reportes: 3, fermes: 5 },
      tickets: { ...vide, enCours: [{ id: 'demo-1', titre: 'Un', priorite: 1 }] },
      jetons: 41_000,
    },
  ],
  suivants: [],
  epopeesSuivantes: [],
  tickets: {},
  supervision: { jetons: 0, cache: 0, travail: 0 },
  vivant: [],
  alertes: [{ niveau: 'decision', texte: '1 ticket(s) attendent ta décision' }],
}

test('the status line holds the epic in progress, its waiting tickets in one count, alerts first', () => {
  expect(ligneEtat(TABLEAU)).toBe('⚠ 1 · demo-e : 1 en cours · 4 en attente · 5 fermés · 41 k jetons')
})

test('without epic in progress, the status line holds the project', () => {
  const t = { ...TABLEAU, alertes: [], epopees: [] }
  expect(ligneEtat(t)).toBe(`Grillhouse : ${compteurs(TABLEAU.projet)}`)
})

test('durations read in minutes, then hours', () => {
  expect(duree(5 * 60_000)).toBe('5 min')
  expect(duree(125 * 60_000)).toBe('2 h 05')
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
  expect(await statut).toBe(ligneEtat(TABLEAU))
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
