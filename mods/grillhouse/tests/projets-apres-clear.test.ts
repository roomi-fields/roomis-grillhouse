import { expect, mock, test } from 'claude-code/testing'

import { PKG, projetGrillhouse, suiveurSimule } from './projet'

// A /clear ends the conversation and empties the state the mod keeps for the session, while the mod
// stays loaded and no session.start comes: the pane takes its projects again from the mod's store
// (greffon.md, §4.1). The state is held here by the test, which empties it at the /clear.

const GARDE = ['/m/synthhub', '/m/open-synth-descriptors']
const NEUF = '/m/bpscript'

type Banc = Parameters<Parameters<typeof test>[1]>

async function seanceApresClear($: Banc[0], on: Banc[1]) {
  const o = on as unknown as (n: string, h: unknown) => void
  const ecrits: unknown[] = []
  const reperes: (string | undefined)[] = []
  const magasin = new Map<string, unknown>([['projets:/p', GARDE]])
  const etat = new Map<string, { value: unknown; version: number }>()
  const suiveur = suiveurSimule(o, () => ({ lignes: [], fiches: {} }))
  o('process.run', (_: unknown, e: { argv: string[]; init?: { cwd?: string } }) => {
    if (e.argv.includes('newday')) reperes.push(e.init?.cwd)
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  o('state.get', (_: unknown, e: { plugin: string; key: string }) => ({
    value: etat.get(`${e.plugin}:${e.key}`) ?? { value: undefined, version: 0 },
  }))
  o('state.set', (_: unknown, e: { plugin: string; key: string; value: unknown }) => {
    const cle = `${e.plugin}:${e.key}`
    const version = (etat.get(cle)?.version ?? 0) + 1
    etat.set(cle, { value: e.value, version })
    return { value: { isSet: true, version } }
  })
  o('store.get', (_: unknown, e: { key: string }) => ({ value: magasin.get(e.key) }))
  o('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    magasin.set(e.key, e.value)
    ecrits.push(e.value)
    return { value: undefined }
  })
  projetGrillhouse(o, PKG)
  o('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  o('session.end', (_: unknown, e: { sessionId: string }) => ({ sessionId: e.sessionId }))
  o('classic.SessionStart', () => ({}))
  o('command.register', () => ({ value: undefined }))
  mock.clock(o as never)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  const s = $ as unknown as {
    session: { end: (e: unknown) => Promise<unknown> }
    classic: { SessionStart: (e: unknown) => Promise<unknown> }
  }
  // The /clear of the session: the conversation ends, the state is emptied, the next one starts.
  await s.session.end({ reason: 'clear', sessionId: 'avant', resume: { id: 'avant' } })
  etat.clear()
  await s.classic.SessionStart({ source: 'clear' })
  await new Promise(r => setTimeout(r, 50))
  const grillhouse = async (args: string) => {
    const r = await $.command.run({
      command: 'grillhouse',
      args,
      presentation: { isFullscreen: true, columns: 200 },
    } as never)
    await new Promise(x => setTimeout(x, 50))
    return JSON.stringify(r)
  }
  return { ecrits, reperes, grillhouse, suiveur }
}

test('after a /clear, /grillhouse ajouter completes the list kept, and the follower measures it all', async ($, on) => {
  const { ecrits, grillhouse, suiveur } = await seanceApresClear($, on)
  await grillhouse(`ajouter ${NEUF}`)
  expect(ecrits.at(-1)).toEqual([...GARDE, NEUF])
  expect(suiveur.lancements.at(-1)?.argv).toEqual([
    'node_modules/.bin/grillhouse',
    'tableau',
    '--suivre',
    ...GARDE,
    NEUF,
  ])
})

test('after a /clear, /grillhouse newday sets the marker of each project of the pane', async ($, on) => {
  const { reperes, grillhouse } = await seanceApresClear($, on)
  await grillhouse('newday')
  expect(reperes).toEqual(['/p', ...GARDE])
})

test('after a /clear, a project already kept is still known to the pane', async ($, on) => {
  const { ecrits, grillhouse } = await seanceApresClear($, on)
  expect(await grillhouse(`ajouter ${GARDE[0]}`)).toContain('déjà au tableau')
  expect(ecrits).toEqual([])
})
