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
      duree: 0,
      jetons: 0,
      resume: 'R',
    },
    'c.2': {
      numero: 'c.2',
      titre: 'Le dernier qui a bougé',
      composant: 'y',
      statut: 'open',
      duree: 0,
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
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['c.1.1:1', 'c.2:2'])
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

const REPLI = {
  lignes: [
    { texte: 'DEMO', ton: 'titre' },
    { texte: '· c.2  Le dernier', ticket: 'c.2' },
    { texte: '  + 1 autres', ton: 'discret', replie: [{ texte: '✓ c.1.1  Le moteur', ticket: 'c.1.1' }] },
  ],
  fiches: {
    ...TABLEAU.fiches,
    'c.2': { ...TABLEAU.fiches['c.2'], texte: 'Le texte entier du ticket, jusqu’à sa dernière ligne.' },
  },
  dernier: 'c.2',
}

async function monter($: never, on: never) {
  const o = on as (n: string, h: unknown) => void
  const s = $ as { session: { start: (a: object) => Promise<unknown> }; ui: { mount: (a: object) => Promise<never> } }
  o('process.run', (_: unknown, e: { argv: string[] }) => ({
    value: { exitCode: 0, stdout: e.argv[0] === 'test' ? '' : JSON.stringify(REPLI), stderr: '' },
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

test('reaching a counting line unfolds the lines it counts', async ($, on) => {
  const ui = await monter($ as never, on as never)
  const cles = async () => (await ui.findAll({ type: 'Button' })).map(b => b.key)
  expect(await cles()).not.toContain('c.1.1:2.0')
  await $.ui.press({ plugin: 'grillhouse', key: '+:2' })
  expect(await cles()).toContain('c.1.1:2.0')
  await ui.unmount()
})

test('g makes the card show the whole text, and g again brings it back', async ($, on) => {
  const ui = await monter($ as never, on as never)
  await $.ui.press({ plugin: 'grillhouse', key: 'c.2:1' })
  expect(JSON.stringify(await ui.drawn())).not.toContain('jusqu’à sa dernière ligne')
  await $.ui.press({ plugin: 'grillhouse', key: 'g' })
  expect(JSON.stringify(await ui.drawn())).toContain('jusqu’à sa dernière ligne')
  await $.ui.press({ plugin: 'grillhouse', key: 'g' })
  expect(JSON.stringify(await ui.drawn())).not.toContain('jusqu’à sa dernière ligne')
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

test('3uv.24 critère 5 : pressing a chantier line switches its status and measures again', async ($, on) => {
  const appels: string[][] = []
  const ui = await monterChantiers($ as never, on as never, appels)
  const avant = appels.filter(a => a[0] === 'node').length
  await $.ui.press({ plugin: 'grillhouse', key: 'demo-a:1' })
  await new Promise(r => setTimeout(r, 50))
  expect(appels).toContainEqual(['bd', 'update', 'demo-a', '--status', 'open'])
  expect(appels.filter(a => a[0] === 'node').length).toBeGreaterThan(avant)
  await ui.unmount()
})

test('3uv.24 critère 6 : pressing a ticket line switches nothing', async ($, on) => {
  const appels: string[][] = []
  const ui = await monterChantiers($ as never, on as never, appels)
  await $.ui.press({ plugin: 'grillhouse', key: 'c.2:2' })
  await new Promise(r => setTimeout(r, 50))
  expect(appels.some(a => a[0] === 'bd')).toBe(false)
  await ui.unmount()
})
