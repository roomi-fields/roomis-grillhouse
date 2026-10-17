import { expect, test } from 'claude-code/testing'

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
  on('process.run', ($, e) => ({
    value: { exitCode: 0, stdout: e.argv[0] === 'test' ? '' : JSON.stringify(TABLEAU), stderr: '' },
  }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('clock.every', () => ({ value: { cancel: () => undefined } }))
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
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['c.1.1:1', 'c.2:2', 'e'])
  expect(JSON.stringify(await ui.drawn())).toContain(' '.repeat(50))
  await ui.unmount()
})

test('unfocused, the card shows the ticket that moved last', async ($, on) => {
  on('process.run', ($, e) => ({
    value: { exitCode: 0, stdout: e.argv[0] === 'test' ? '' : JSON.stringify(TABLEAU), stderr: '' },
  }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('clock.every', () => ({ value: { cancel: () => undefined } }))
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
  o('process.run', (_: unknown, e: { argv: string[] }) => ({
    value: {
      exitCode: 0,
      stdout:
        e.argv[0] === 'test'
          ? ''
          : e.argv[0] === 'bd'
            ? JSON.stringify([{ id: e.argv[2], description: 'Le texte entier du ticket, jusqu’à sa dernière ligne.' }])
            : JSON.stringify(ENTIER),
      stderr: '',
    },
  }))
  o('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  o('command.register', () => ({ value: undefined }))
  o('clock.every', () => ({ value: { cancel: () => undefined } }))
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
  await $.ui.press({ plugin: 'grillhouse', key: 'c.2:1' })
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

async function monterChantiers($: never, on: never, appels: string[][]) {
  const o = on as (n: string, h: unknown) => void
  const s = $ as { session: { start: (a: object) => Promise<unknown> }; ui: { mount: (a: object) => Promise<never> } }
  o('process.run', (_: unknown, e: { argv: string[] }) => {
    appels.push(e.argv)
    return { value: { exitCode: 0, stdout: e.argv[0] === 'node' ? JSON.stringify(CHANTIERS) : '', stderr: '' } }
  })
  o('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  o('command.register', () => ({ value: undefined }))
  o('clock.every', () => ({ value: { cancel: () => undefined } }))
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

test('3uv.24 critère 5 : h on the chosen chantier switches its status and measures again', async ($, on) => {
  const appels: string[][] = []
  const ui = await monterChantiers($ as never, on as never, appels)
  const avant = appels.filter(a => a[0] === 'node').length
  await $.ui.press({ plugin: 'grillhouse', key: 'demo-a:1' })
  await new Promise(r => setTimeout(r, 50))
  expect(appels.some(a => a[0] === 'bd')).toBe(false)
  await $.ui.press({ plugin: 'grillhouse', key: 'h' })
  await new Promise(r => setTimeout(r, 50))
  expect(appels).toContainEqual(['bd', 'update', 'demo-a', '--status', 'open'])
  expect(appels.filter(a => a[0] === 'node').length).toBeGreaterThan(avant)
  await ui.unmount()
})

test('3uv.24 critère 6 : on a ticket line, h is not drawn and nothing switches', async ($, on) => {
  const appels: string[][] = []
  const ui = await monterChantiers($ as never, on as never, appels)
  await $.ui.press({ plugin: 'grillhouse', key: 'c.2:2' })
  await new Promise(r => setTimeout(r, 50))
  await expect($.ui.press({ plugin: 'grillhouse', key: 'h' })).rejects.toBeDefined()
  expect(appels.some(a => a[0] === 'bd')).toBe(false)
  await ui.unmount()
})

test('a board past what a process returns opens the pane on a message, not on a failure', async ($, on) => {
  on('process.run', ($, e) => ({
    value: {
      exitCode: 0,
      stdout: e.argv[0] === 'test' ? '' : JSON.stringify(TABLEAU).slice(0, 40),
      stderr: '',
      isStdoutTruncated: e.argv[0] !== 'test',
    },
  }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('clock.every', () => ({ value: { cancel: () => undefined } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  const r = await $.command.run({ command: 'grillhouse', presentation: { isFullscreen: true, columns: 200 } } as never)
  expect(JSON.stringify(r)).toContain('Tableau Grillhouse')
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

test('refreshes asked while a board is read fold into one more, never one board each', async ($, on) => {
  let tableaux = 0
  on('process.run', async ($, e) => {
    if (e.argv[0] === 'node') {
      tableaux++
      await new Promise(r => setTimeout(r, 30))
    }
    return { value: { exitCode: 0, stdout: e.argv[0] === 'test' ? '' : JSON.stringify(TABLEAU), stderr: '' } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('clock.every', () => ({ value: { cancel: () => undefined } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 100))
  const avant = tableaux
  const run = () => $.command.run({ command: 'grillhouse', presentation: { isFullscreen: true, columns: 200 } } as never)
  await Promise.all([run(), run(), run(), run(), run()])
  expect(tableaux - avant).toBeLessThanOrEqual(2)
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
  on('process.run', ($, e) => ({
    value: { exitCode: 0, stdout: e.argv[0] === 'test' ? '' : JSON.stringify(REPLIE), stderr: '' },
  }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('clock.every', () => ({ value: { cancel: () => undefined } }))
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
  await $.ui.press({ plugin: 'grillhouse', key: '>:1' })
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toContain('o')
  await $.ui.press({ plugin: 'grillhouse', key: 'o' })
  expect(await vu()).toContain('Le neuvième, caché')
  expect(await vu()).not.toContain('· c.2  Le dernier')
  await $.ui.press({ plugin: 'grillhouse', key: 'o' })
  expect(await vu()).not.toContain('Le neuvième, caché')
  expect(await vu()).toContain('· c.2  Le dernier')
  await ui.unmount()
})
