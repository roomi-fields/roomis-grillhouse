import { expect, test } from 'claude-code/testing'

const TABLEAU = {
  lignes: [
    { texte: 'DEMO', ton: 'titre' },
    { texte: '4 développeur  ▶ c.1.1 moteur', ton: 'actif', ticket: 'c.1.1' },
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
  },
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
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['c.1.1:1'])
  expect(JSON.stringify(await ui.drawn())).toContain(' '.repeat(50))
  await ui.unmount()
})
