import { expect, mock, test } from 'claude-code/testing'

import { PERIODE_DES_QUESTIONS_MS } from '../hooks/register'
import { projetGrillhouse, suiveurSimule } from './projet'

// The questions of the circuits reach the session of supervision by a push of the greffon: at each
// period it asks one reading of the circuits of its project (`grillhouse superviseur --relever`)
// and submits what it prints, in one message, to the session; while a turn of the session runs it
// asks no reading. The greffon launches no wait of its own: the reading is the only process it asks
// for. The period is moved on by the mocked clock, with no real wait.

type Lecture = { exitCode: number; stdout: string; stderr: string }
type Banc = Parameters<Parameters<typeof test>[1]>

// A session started in the project '/p', the reading answered by <lecture> (its rank from 1);
// returns the readings asked (argv), the messages submitted, what the pane's state received, and
// the clock.
async function seance($: Banc[0], on: Banc[1], lecture: (n: number) => Lecture | Promise<Lecture>) {
  const o = on as unknown as (n: string, h: unknown) => void
  const lectures: string[][] = []
  const messages: string[] = []
  const etats: string[] = []
  const lues: string[][] = []
  suiveurSimule(o, () => ({ lignes: [], fiches: {} }))
  o('process.run', async (_: unknown, e: { argv: string[] }) => {
    if (e.argv.includes('--lue')) lues.push(e.argv)
    if (!e.argv.includes('--relever')) return { value: { exitCode: 0, stdout: '', stderr: '' } }
    lectures.push(e.argv)
    return { value: await lecture(lectures.length) }
  })
  o('prompt.submit', (_: unknown, e: { text: string }) => {
    messages.push(e.text)
    return { text: e.text }
  })
  o('state.get', async (_: unknown, e: { plugin: string; key: string }, next: (e: unknown) => unknown) => {
    const r = await next(e)
    if (e.plugin === 'grillhouse') etats.push(JSON.stringify(r))
    return r
  })
  o('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  o('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  o('turn.complete', () => ({ text: '' }))
  projetGrillhouse(o)
  o('command.register', () => ({ value: undefined }))
  const horloge = mock.clock(o as never)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  return { lectures, lues, messages, etats, horloge }
}

const attendre = () => new Promise(r => setTimeout(r, 50))
const ok = (stdout: string): Lecture => ({ exitCode: 0, stdout, stderr: '' })

test('a reading that gives text is submitted once to the session, in one message', async ($, on) => {
  const { lectures, messages, horloge } = await seance($, on, () =>
    ok('- demo-1, à 3.1 Contrôles, au superviseur : Q ?\n  La réponse : cmd\n- demo-2, à X, au superviseur : R ?\n')
  )
  await horloge.advance(PERIODE_DES_QUESTIONS_MS)
  await attendre()
  expect(lectures).toHaveLength(1)
  expect(lectures[0]).toContain('superviseur')
  expect(lectures[0]).toContain('--relever')
  expect(lectures[0]).toContain('/p')
  expect(messages).toHaveLength(1)
  expect(messages[0]).toContain('demo-1')
  expect(messages[0]).toContain('demo-2')
})

test('an empty reading submits nothing', async ($, on) => {
  const { lectures, messages, horloge } = await seance($, on, () => ok('  \n'))
  await horloge.advance(PERIODE_DES_QUESTIONS_MS)
  await attendre()
  expect(lectures).toHaveLength(1)
  expect(messages).toEqual([])
})

test('a reading that fails with no text submits nothing and notes its error', async ($, on) => {
  const { messages, etats, horloge } = await seance($, on, () => ({
    exitCode: 1,
    stdout: '',
    stderr: 'grillhouse.rappel vaut 0, pas un nombre > 0.',
  }))
  await horloge.advance(PERIODE_DES_QUESTIONS_MS)
  await attendre()
  expect(messages).toEqual([])
  expect(etats.join('\n')).toContain('grillhouse.rappel vaut 0')
})

test('a reading that gives text beside a fault submits the text and notes the fault', async ($, on) => {
  const { messages, etats, horloge } = await seance($, on, () => ({
    exitCode: 1,
    stdout: '[BON] Question · bon-1 · 3.1 Contrôles\nQ ?\n',
    stderr: 'voisin : grillhouse.rappel vaut 0, pas un nombre > 0.\n',
  }))
  await horloge.advance(PERIODE_DES_QUESTIONS_MS)
  await attendre()
  expect(messages).toHaveLength(1)
  expect(messages[0]).toContain('bon-1')
  expect(messages[0]).not.toContain('grillhouse.rappel')
  expect(etats.join('\n')).toContain('voisin : grillhouse.rappel vaut 0')
})

test('the questions of a text submitted beside a fault are read by the turn that starts with it', async ($, on) => {
  const { lues, messages, horloge } = await seance($, on, () => ({
    exitCode: 1,
    stdout: 'Question · bon-1\n',
    stderr: 'voisin : faute\n',
  }))
  await horloge.advance(PERIODE_DES_QUESTIONS_MS)
  await attendre()
  await ($ as unknown as Tours).turn.start({ text: messages[0] ?? 'aucun message', turnId: 't1' })
  await attendre()
  expect(lues).toHaveLength(1)
  expect(lues[0]).toContain('/p')
})

test('two readings that overlap launch one only, and the next period reads again', async ($, on) => {
  let liberer: () => void = () => undefined
  const bloquee = new Promise<void>(r => (liberer = r))
  const { lectures, messages, horloge } = await seance($, on, async n => {
    if (n === 1) await bloquee
    return ok('- demo-1 : Q ?\n')
  })
  await horloge.advance(PERIODE_DES_QUESTIONS_MS)
  await horloge.advance(PERIODE_DES_QUESTIONS_MS)
  await attendre()
  expect(lectures).toHaveLength(1)
  liberer()
  await attendre()
  expect(messages).toHaveLength(1)
  await horloge.advance(PERIODE_DES_QUESTIONS_MS)
  await attendre()
  expect(lectures).toHaveLength(2)
})

test('the clock asks for a reading at each period, and for no wait', async ($, on) => {
  const { lectures, messages, horloge } = await seance($, on, () => ok('- demo-1 : Q ?\n'))
  expect(lectures).toHaveLength(0)
  await horloge.advance(PERIODE_DES_QUESTIONS_MS)
  await attendre()
  expect(lectures).toHaveLength(1)
  expect(messages).toHaveLength(1)
  await horloge.advance(PERIODE_DES_QUESTIONS_MS)
  await attendre()
  expect(lectures).toHaveLength(2)
  expect(messages).toHaveLength(2)
  for (const argv of lectures) expect(argv).not.toContain('--attendre')
})

// A message submitted while the session works waits in its queue until the end of the turn, and
// nothing takes it back once its question is answered: a long turn piled up one message per
// reminder (Grillhouse and SyntHub, 2026-11-22, grillhouse-3uv.164). While a turn of the main loop
// runs the greffon asks no reading; the first period after its end reads the circuits as they are.
// The engine raises `turn.start` for the main loop alone; a subagent's run ends on a
// `turn.complete` that carries its `agentId`, with no start.
const tour = (turnId: string) => ({ text: '', turnId })
const fin = (turnId: string, agentId?: string) => ({
  answer: '',
  durationMs: 1,
  isAborted: false,
  reason: 'answer' as const,
  turnId,
  ...(agentId ? { agentId } : {}),
})
type Tours = { turn: { start: (e: unknown) => Promise<unknown>; complete: (e: unknown) => Promise<unknown> } }

test('while a turn of the main loop runs no reading is asked; the period after its end reads', async ($, on) => {
  const { lectures, messages, horloge } = await seance($, on, () => ok('- demo-1 : Q ?\n'))
  const t = ($ as unknown as Tours).turn
  await t.start(tour('t1'))
  for (let i = 0; i < 4; i++) await horloge.advance(PERIODE_DES_QUESTIONS_MS)
  await attendre()
  expect(lectures).toHaveLength(0)
  expect(messages).toEqual([])
  await t.complete(fin('t1'))
  await horloge.advance(PERIODE_DES_QUESTIONS_MS)
  await attendre()
  expect(lectures).toHaveLength(1)
  expect(messages).toHaveLength(1)
})

test('the end of a subagent’s run frees no reading while the turn of the main loop runs', async ($, on) => {
  const { lectures, messages, horloge } = await seance($, on, () => ok('- demo-1 : Q ?\n'))
  const t = ($ as unknown as Tours).turn
  await t.start(tour('t1'))
  await t.complete(fin('a1', 'agent-1'))
  await horloge.advance(PERIODE_DES_QUESTIONS_MS)
  await attendre()
  expect(lectures).toHaveLength(0)
  expect(messages).toEqual([])
  await t.complete(fin('t1'))
  await horloge.advance(PERIODE_DES_QUESTIONS_MS)
  await attendre()
  expect(lectures).toHaveLength(1)
})
