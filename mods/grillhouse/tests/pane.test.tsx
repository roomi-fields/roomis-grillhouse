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
