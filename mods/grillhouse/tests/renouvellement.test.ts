import { expect, mock, test } from 'claude-code/testing'

import { PERIODE_DES_QUESTIONS_MS } from '../hooks/register'
import { projetGrillhouse, suiveurSimule } from './projet'

// The session of supervision renews itself at a milestone it declared (greffon.md, §5.1 and §5.2).
// The mod observes and acts, the frame's command judges: at each period, outside a turn, the mod asks
// `grillhouse superviseur --renouveler <dossier> <arretA> <messageA>`, where <arretA> is the time
// (ms) of the last classic.Stop of the session whose background_tasks was empty (0 when the last Stop
// left a task in flight, or none came) and <messageA> the time of the last message of the owner
// (origin `composer` or `bridge`; 0 without one). The command prints the message of resumption when
// the renewal is due; the mod then runs /clear, and submits that message. The period is moved on by
// the mocked clock, with no real wait.

const REPRISE = 'Reprends la supervision là où la note la laisse.'
const QUESTIONS = 'Question · demo-1 · 3.1 Contrôles\nQ ?'
const DEMANDE = 'Écris ta note et déclare le jalon : npx grillhouse superviseur --jalon <fichier>'

type Banc = Parameters<Parameters<typeof test>[1]>
type Tours = {
  turn: { start: (e: unknown) => Promise<unknown>; complete: (e: unknown) => Promise<unknown> }
}
type Gestes = {
  classic: { Stop: (e: unknown) => Promise<unknown> }
  prompt: { submit: (e: unknown) => Promise<unknown> }
  session: { compact: (e: unknown) => Promise<unknown> }
}

type Monde = {
  // The message of resumption the command prints for these two times; '' when nothing is due.
  renouveler?: (arretA: number, messageA: number) => string
  // The message the reading of the questions prints, by its rank from 1.
  relever?: (n: number, argv: string[]) => string
  // Whether /clear is refused, by its rank from 1.
  refus?: (n: number) => boolean
}

// A session started in the project '/p'. `faits` receives, in their order, each /clear run and each
// message the mod submits; `lectures` and `renouvellements` the argv of each command asked.
async function seance($: Banc[0], on: Banc[1], m: Monde = {}) {
  const o = on as unknown as (n: string, h: unknown) => void
  const faits: string[] = []
  const lectures: string[][] = []
  const renouvellements: string[][] = []
  const brouillon = { texte: '' }
  let efface = 0
  const renouveler = m.renouveler ?? (arretA => (arretA > 0 ? REPRISE : ''))
  suiveurSimule(o, () => ({ lignes: [], fiches: {} }))
  o('process.run', (_: unknown, e: { argv: string[] }) => {
    let stdout = ''
    if (e.argv.includes('--relever')) {
      lectures.push(e.argv)
      stdout = m.relever?.(lectures.length, e.argv) ?? ''
    }
    if (e.argv.includes('--renouveler')) {
      renouvellements.push(e.argv)
      const [arretA, messageA] = e.argv.slice(-2).map(Number)
      stdout = renouveler(arretA ?? 0, messageA ?? 0)
    }
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  o('command.run', (_: unknown, e: { command: string }) => {
    if (e.command !== 'clear') return { text: '' }
    efface++
    if (m.refus?.(efface)) throw new Error('un tour tourne')
    faits.push('/clear')
    return { text: '' }
  })
  o('prompt.read', () => ({ value: { text: brouillon.texte, cursor: brouillon.texte.length } }))
  o('prompt.submit', (_: unknown, e: { text: string; origin?: { kind: string } }) => {
    if (!e.origin || e.origin.kind === 'plugin') faits.push(e.text)
    return { text: e.text }
  })
  o('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  o('session.compact', () => ({ messages: [{ role: 'user', text: 'résumé', toolUses: [] }] }))
  o('classic.Stop', () => ({}))
  o('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  o('turn.complete', () => ({ text: '' }))
  projetGrillhouse(o)
  o('command.register', () => ({ value: undefined }))
  const horloge = mock.clock(o as never, { now: 1_000_000 })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  const g = $ as unknown as Gestes
  const t = ($ as unknown as Tours).turn
  // One period of the mod, its commands answered.
  const periode = async () => {
    await horloge.advance(PERIODE_DES_QUESTIONS_MS)
    await new Promise(r => setTimeout(r, 50))
  }
  // Time passes between two events of the session, on both clocks.
  const attendre = async () => {
    await horloge.advance(1_000)
    await new Promise(r => setTimeout(r, 10))
  }
  // The main loop stops, with the tasks still in flight.
  const arret = async (taches: unknown[] = []) => {
    await attendre()
    await g.classic.Stop({ stop_hook_active: false, background_tasks: taches })
  }
  const message = async (kind: string) => {
    await attendre()
    await g.prompt.submit({ text: 'un message', origin: { kind } })
  }
  const compacter = async (e: object = {}) => {
    await g.session.compact({
      trigger: 'auto',
      messages: [{ role: 'user', text: 'long fil', toolUses: [] }],
      ...e,
    })
    await new Promise(r => setTimeout(r, 20))
  }
  const dernier = () => (renouvellements.at(-1) ?? []).slice(-2).map(Number)
  return { faits, lectures, renouvellements, brouillon, periode, arret, message, compacter, dernier, t }
}

const tour = (turnId: string, text = '') => ({ text, turnId })
const fin = (turnId: string) => ({
  answer: '',
  durationMs: 1,
  isAborted: false,
  reason: 'answer' as const,
  turnId,
})
const TACHE = { id: 'b1', type: 'shell', status: 'running', description: 'une tâche' }

test('a declared milestone renews the session: /clear, then the message of resumption', async ($, on) => {
  const { faits, renouvellements, periode, arret } = await seance($, on)
  await arret()
  await periode()
  expect(faits).toEqual(['/clear', REPRISE])
  expect(renouvellements[0]).toContain('superviseur')
  expect(renouvellements[0]).toContain('/p')
})

test('no Stop of the session yet: the command is told of none and nothing is renewed', async ($, on) => {
  const { faits, renouvellements, periode, arret } = await seance($, on)
  await periode()
  await periode()
  expect(faits).toEqual([])
  for (const argv of renouvellements) expect(argv.slice(-2)).toEqual(['0', '0'])
  await arret()
  await periode()
  expect(faits).toEqual(['/clear', REPRISE])
})

test('a Stop that leaves a task in flight renews nothing, even after a quiet one', async ($, on) => {
  const { faits, periode, arret } = await seance($, on)
  await arret([TACHE])
  await periode()
  expect(faits).toEqual([])
  await arret()
  await arret([TACHE])
  await periode()
  await periode()
  expect(faits).toEqual([])
  await arret()
  await periode()
  expect(faits).toEqual(['/clear', REPRISE])
})

test('the command is given the time of the last quiet Stop, a later one replacing it', async ($, on) => {
  const { periode, arret, dernier } = await seance($, on, { renouveler: () => '' })
  await arret()
  await periode()
  const [premier] = dernier()
  expect(premier).toBeGreaterThan(0)
  await arret()
  await periode()
  const [second] = dernier()
  expect(second).toBeGreaterThan(premier as number)
})

test('a command that gives no message renews nothing', async ($, on) => {
  const { faits, renouvellements, periode, arret } = await seance($, on, { renouveler: () => '' })
  await arret()
  await periode()
  expect(renouvellements.length).toBeGreaterThan(0)
  expect(faits).toEqual([])
})

test('no renewal while a turn runs; the period after its end renews', async ($, on) => {
  const { faits, periode, arret, t } = await seance($, on)
  await t.start(tour('t1'))
  await arret()
  await periode()
  await periode()
  expect(faits).toEqual([])
  await t.complete(fin('t1'))
  await periode()
  expect(faits).toEqual(['/clear', REPRISE])
})

test('a draft in the prompt box holds the renewal until it is gone', async ($, on) => {
  const { faits, brouillon, periode, arret } = await seance($, on)
  brouillon.texte = 'une phrase commencée'
  await arret()
  await periode()
  await periode()
  expect(faits).toEqual([])
  brouillon.texte = ''
  await periode()
  expect(faits).toEqual(['/clear', REPRISE])
})

test('a message of questions not yet read holds the renewal until a turn reads it', async ($, on) => {
  const { faits, periode, arret, t } = await seance($, on, { relever: n => (n === 1 ? QUESTIONS : '') })
  await periode()
  expect(faits).toEqual([QUESTIONS])
  await arret()
  await periode()
  await periode()
  expect(faits).toEqual([QUESTIONS])
  await t.start(tour('t1', QUESTIONS))
  await t.complete(fin('t1'))
  await arret()
  await periode()
  expect(faits).toEqual([QUESTIONS, '/clear', REPRISE])
})

test('a refused /clear submits nothing and is tried again at a later period', async ($, on) => {
  const { faits, periode, arret } = await seance($, on, { refus: n => n === 1 })
  await arret()
  await periode()
  expect(faits).toEqual([])
  await periode()
  expect(faits).toEqual(['/clear', REPRISE])
})

for (const kind of ['composer', 'bridge']) {
  test(`a message of the owner (${kind}) is given to the command with its time`, async ($, on) => {
    const { periode, arret, message, dernier } = await seance($, on, { renouveler: () => '' })
    await arret()
    await message(kind)
    await periode()
    const [arretA, messageA] = dernier()
    expect(arretA).toBeGreaterThan(0)
    expect(messageA).toBeGreaterThan(arretA as number)
  })
}

test('a message that is not the owner’s is not given to the command as one', async ($, on) => {
  const { renouvellements, periode, arret, message, dernier } = await seance($, on, { renouveler: () => '' })
  await arret()
  for (const kind of ['task-notification', 'scheduled-trigger', 'peer-send-message', 'sdk']) await message(kind)
  await periode()
  expect(renouvellements.length).toBeGreaterThan(0)
  expect(dernier()[1]).toBe(0)
})

const compactees = (lectures: string[][]) => lectures.filter(a => a.includes('--compaction')).length

for (const trigger of ['auto', 'manual', 'plugin']) {
  test(`after a compaction (${trigger}) the next reading asks once for the note and the milestone`, async ($, on) => {
    const { faits, lectures, periode, compacter } = await seance($, on, {
      renouveler: () => '',
      relever: (_, argv) => (argv.includes('--compaction') ? DEMANDE : ''),
    })
    await periode()
    expect(compactees(lectures)).toBe(0)
    await compacter({ trigger })
    await periode()
    await periode()
    await periode()
    expect(compactees(lectures)).toBe(1)
    expect(faits).toEqual([DEMANDE])
  })
}

test('each compaction of the main conversation gives one request', async ($, on) => {
  const { lectures, periode, compacter } = await seance($, on, { renouveler: () => '' })
  await compacter()
  await periode()
  await periode()
  await compacter()
  await periode()
  await periode()
  expect(compactees(lectures)).toBe(2)
})

test('a compaction during a turn is asked after its end only', async ($, on) => {
  const { lectures, periode, compacter, t } = await seance($, on, { renouveler: () => '' })
  await t.start(tour('t1'))
  await compacter()
  await periode()
  expect(lectures).toHaveLength(0)
  await t.complete(fin('t1'))
  await periode()
  await periode()
  expect(compactees(lectures)).toBe(1)
})

test('the compaction of a subagent asks nothing, nor one computed in advance', async ($, on) => {
  const { lectures, periode, compacter } = await seance($, on, { renouveler: () => '' })
  await compacter({ agentId: 'agent-1' })
  await compacter({ trigger: 'precompute' })
  await periode()
  expect(compactees(lectures)).toBe(0)
  await compacter()
  await periode()
  expect(compactees(lectures)).toBe(1)
})
