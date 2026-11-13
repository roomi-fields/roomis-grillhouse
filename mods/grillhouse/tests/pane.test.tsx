import { expect, mock, test } from 'claude-code/testing'

import * as register from '../hooks/register'
import { projetGrillhouse, suiveurSimule } from './projet'

const TABLEAU = {
  lignes: [
    { texte: 'DEMO', ton: 'titre' },
    { texte: '4 développeur  ▶ c.1.1 moteur', ton: 'actif', ticket: 'c.1.1' },
    { texte: '· c.2  Le dernier', ticket: 'c.2' },
  ],
  fiches: {
    'c.1.1': {
      numero: 'c.1.1',
      titre: 'Le moteur',
      composant: 'x',
      statut: 'in_progress',
      travail: 0,
      jetons: 0,
      resume: 'R',
    },
    'c.2': {
      numero: 'c.2',
      titre: 'Le dernier qui a bougé',
      composant: 'y',
      statut: 'open',
      travail: 0,
      jetons: 0,
      resume: 'D',
    },
  },
  dernier: 'c.2',
}

test('the pane draws each ticket line as a button, and a hidden card per ticket on a blank', async ($, on) => {
  suiveurSimule(on, () => TABLEAU)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  projetGrillhouse(on)
  on('command.register', () => ({ value: undefined }))
  mock.clock(on)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  const ui = await $.ui.mount({
    plugin: 'grillhouse',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'grillhouse',
    props: {
      title: 't',
      isFocused: true,
      bodyColumns: 50,
      placement: 'dock',
      scroll: { bodyRows: 30 } as never,
      view: {} as never,
    },
  })
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['c.1.1:0', 'c.2:0', 'e'])
  expect(JSON.stringify(await ui.drawn())).toContain(' '.repeat(50))
  await ui.unmount()
})

test('unfocused, the card shows the ticket that moved last', async ($, on) => {
  suiveurSimule(on, () => TABLEAU)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  projetGrillhouse(on)
  on('command.register', () => ({ value: undefined }))
  mock.clock(on)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  const props = {
    title: 't',
    bodyColumns: 50,
    placement: 'dock' as const,
    scroll: { bodyRows: 30 } as never,
    view: {} as never,
  }
  const ui = await $.ui.mount({
    plugin: 'grillhouse',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'grillhouse',
    props: { ...props, isFocused: false },
  })
  // The visible card is the one drawn outside the hover overlays: its title comes first.
  const texte = JSON.stringify(await ui.drawn())
  expect(texte.indexOf('c.2 — Le dernier qui a bougé')).toBeLessThan(texte.indexOf('c.1.1 — Le moteur'))
  await ui.redraw({ ...props, isFocused: true })
  expect(JSON.stringify(await ui.drawn())).toMatch(/alt\+g/)
  await ui.unmount()
})

const ENTIER = {
  lignes: [
    { texte: 'DEMO', ton: 'titre' },
    { texte: '· c.2  Le dernier', ticket: 'c.2' },
    { texte: '✓ c.1.1  Le moteur', ticket: 'c.1.1' },
  ],
  fiches: {
    ...TABLEAU.fiches,
  },
  dernier: 'c.2',
}

async function monter($: never, on: never) {
  const o = on as (n: string, h: unknown) => void
  const s = $ as { session: { start: (a: object) => Promise<unknown> }; ui: { mount: (a: object) => Promise<never> } }
  // The whole text comes from Beads (`bd show <id> --json`), not from the board.
  suiveurSimule(o, () => ENTIER)
  o('process.run', (_: unknown, e: { argv: string[] }) => ({
    value: {
      exitCode: 0,
      stdout: JSON.stringify([{ id: e.argv[2], description: 'Le texte entier du ticket, jusqu’à sa dernière ligne.' }]),
      stderr: '',
    },
  }))
  o('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  projetGrillhouse(o)
  o('command.register', () => ({ value: undefined }))
  mock.clock(o as never)
  await s.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  return s.ui.mount({
    plugin: 'grillhouse',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'grillhouse',
    props: {
      title: 't',
      isFocused: true,
      bodyColumns: 50,
      placement: 'dock',
      scroll: { bodyRows: 30 } as never,
      view: {} as never,
    },
  }) as Promise<{
    findAll: (q: object) => Promise<{ key: string }[]>
    drawn: () => Promise<unknown>
    unmount: () => Promise<void>
  }>
}

test('g makes the card show the whole text, and g again brings it back', async ($, on) => {
  const ui = await monter($ as never, on as never)
  await $.ui.press({ plugin: 'grillhouse', key: 'c.2:0' })
  expect(JSON.stringify(await ui.drawn())).not.toContain('Le texte entier du ticket')
  await $.ui.press({ plugin: 'grillhouse', key: 'g' })
  expect(JSON.stringify(await ui.drawn())).toContain('Le texte entier du ticket')
  await $.ui.press({ plugin: 'grillhouse', key: 'g' })
  expect(JSON.stringify(await ui.drawn())).not.toContain('Le texte entier du ticket')
  await ui.unmount()
})

const CHANTIERS = {
  lignes: [
    { texte: 'DEMO', ton: 'titre' },
    { texte: 'CHANTIER a — Premier', ton: 'titre', ticket: 'demo-a', chantier: true },
    { texte: '· c.2  Le dernier', ticket: 'c.2' },
  ],
  fiches: {
    ...TABLEAU.fiches,
    'demo-a': { ...TABLEAU.fiches['c.2'], numero: 'a', statut: 'in_progress' },
  },
  dernier: 'c.2',
}

let lancements: { argv: string[] }[] = []
async function monterChantiers($: never, on: never, appels: string[][]) {
  const suiveur = suiveurSimule(on, () => CHANTIERS)
  lancements = suiveur.lancements
  const o = on as (n: string, h: unknown) => void
  const s = $ as { session: { start: (a: object) => Promise<unknown> }; ui: { mount: (a: object) => Promise<never> } }
  o('process.run', (_: unknown, e: { argv: string[] }) => {
    appels.push(e.argv)
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  o('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  projetGrillhouse(o)
  o('command.register', () => ({ value: undefined }))
  mock.clock(o as never)
  await s.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  return s.ui.mount({
    plugin: 'grillhouse',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'grillhouse',
    props: { title: 't', isFocused: true, bodyColumns: 50, placement: 'dock', scroll: { bodyRows: 30 } as never, view: {} as never },
  }) as Promise<{ unmount: () => Promise<void> }>
}

test('h on the chosen chantier switches its status and leaves the measure to the follower', async ($, on) => {
  const appels: string[][] = []
  const ui = await monterChantiers($ as never, on as never, appels)
  const avant = lancements.length
  await $.ui.press({ plugin: 'grillhouse', key: 'demo-a:0' })
  await new Promise(r => setTimeout(r, 50))
  expect(appels.some(a => a[0] === 'bd')).toBe(false)
  await $.ui.press({ plugin: 'grillhouse', key: 'h' })
  await new Promise(r => setTimeout(r, 50))
  expect(appels).toContainEqual(['bd', 'update', 'demo-a', '--status', 'open'])
  expect(appels.some(a => a[1] === 'tableau')).toBe(false)
  expect(lancements.length).toBe(avant)
  await ui.unmount()
})

test('on a ticket line, h is not drawn and nothing switches', async ($, on) => {
  const appels: string[][] = []
  const ui = await monterChantiers($ as never, on as never, appels)
  await $.ui.press({ plugin: 'grillhouse', key: 'c.2:0' })
  await new Promise(r => setTimeout(r, 50))
  await expect($.ui.press({ plugin: 'grillhouse', key: 'h' })).rejects.toBeDefined()
  expect(appels.some(a => a[0] === 'bd')).toBe(false)
  await ui.unmount()
})

test('a line of the follower that is not a board opens the pane on a message, not on a failure', async ($, on) => {
  suiveurSimule(on, () => JSON.stringify(TABLEAU).slice(0, 40), true)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  projetGrillhouse(on)
  on('command.register', () => ({ value: undefined }))
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  const r = await $.command.run({ command: 'grillhouse', presentation: { isFullscreen: true, columns: 200 } } as never)
  expect(JSON.stringify(r)).toContain('Tableau Grillhouse')
  // The board comes from the follower's line, behind the command.
  await new Promise(r => setTimeout(r, 50))
  const ui = await $.ui.mount({
    plugin: 'grillhouse',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'grillhouse',
    props: {
      title: 't',
      isFocused: true,
      bodyColumns: 50,
      placement: 'dock',
      scroll: { bodyRows: 30 } as never,
      view: {} as never,
    },
  })
  expect(JSON.stringify(await ui.drawn())).toContain('Tableau illisible')
  await ui.unmount()
})

test('the command answers and opens the pane before the board is read', async ($, on) => {
  let lire = () => undefined as void
  const lu = new Promise<void>(r => (lire = r))
  let ouvert = false
  suiveurSimule(on, async () => {
    await lu
    return TABLEAU
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  projetGrillhouse(on)
  on('command.register', () => ({ value: undefined }))
  mock.clock(on)
  on('ui.open', () => {
    ouvert = true
    return { value: { isPlaced: true } }
  })
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  const r = await $.command.run({ command: 'grillhouse', presentation: { isFullscreen: true, columns: 200 } } as never)
  expect(JSON.stringify(r)).toContain('Tableau Grillhouse')
  expect(ouvert).toBe(true)
  lire()
  await new Promise(r => setTimeout(r, 50))
})

test('the command run again starts no other follower: one follower per session, whatever the commands', async ($, on) => {
  const suiveur = suiveurSimule(on, () => TABLEAU)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  projetGrillhouse(on)
  on('command.register', () => ({ value: undefined }))
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 100))
  expect(suiveur.lancements).toHaveLength(1)
  const run = () => $.command.run({ command: 'grillhouse', presentation: { isFullscreen: true, columns: 200 } } as never)
  await Promise.all([run(), run(), run(), run(), run()])
  await new Promise(r => setTimeout(r, 200))
  expect(suiveur.lancements).toHaveLength(1)
})

const REPLIE = {
  lignes: [
    { texte: 'DEMO', ton: 'titre' },
    { texte: '  sans go ›  2', ton: 'titre', groupe: 'c/sansGo' },
    { texte: '· c.2  Le dernier', ticket: 'c.2' },
  ],
  groupes: {
    'c/sansGo': [
      { texte: '  sans go  2', ton: 'titre' },
      { texte: '   c.1.1  Le moteur', ticket: 'c.1.1' },
      { texte: '   c.9  Le neuvième, caché', ticket: 'c.9' },
    ],
  },
  fiches: TABLEAU.fiches,
  dernier: 'c.2',
}

test('o on a folded group opens it alone and whole, and o again comes back to the board', async ($, on) => {
  suiveurSimule(on, () => REPLIE)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  projetGrillhouse(on)
  on('command.register', () => ({ value: undefined }))
  mock.clock(on)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  const ui = await $.ui.mount({
    plugin: 'grillhouse',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'grillhouse',
    props: {
      title: 't',
      isFocused: true,
      bodyColumns: 50,
      placement: 'dock',
      scroll: { bodyRows: 30 } as never,
      view: {} as never,
    },
  })
  const vu = async () => JSON.stringify(await ui.drawn())
  expect(await vu()).not.toContain('Le neuvième, caché')
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).not.toContain('o')
  await $.ui.press({ plugin: 'grillhouse', key: '>:c/sansGo' })
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toContain('o')
  await $.ui.press({ plugin: 'grillhouse', key: 'o' })
  expect(await vu()).toContain('Le neuvième, caché')
  expect(await vu()).not.toContain('· c.2  Le dernier')
  await $.ui.press({ plugin: 'grillhouse', key: 'o' })
  expect(await vu()).not.toContain('Le neuvième, caché')
  expect(await vu()).toContain('· c.2  Le dernier')
  await ui.unmount()
})

// grillhouse-3uv.95.6: no component is a unit of the circuit any more; the line of a ticket in a
// circuit gives its subject alone, and the pane alternates no other text with it.
test('the pane alternates no text: a line shows its text, which the board gives alone', () => {
  expect(register).not.toHaveProperty('ALTERNANCE')
  expect(register).not.toHaveProperty('texteDe')
})
