import { expect, mock, test } from 'claude-code/testing'

import { bascule, commenceParCd, couleur, debut, declareLePaquet, ficheLignes, placement } from '../hooks/register'
import type { Tableau } from '../types'
import { projetGrillhouse } from './projet'

const TABLEAU: Tableau = {
  lignes: [
    { texte: 'DEMO', ton: 'titre', section: 'agents' },
    { texte: '⚠ 1 ticket(s) attendent ta décision', ton: 'attention', section: 'agents' },
    { texte: '4 développeur  ▶ c.1.1  Écrit', ton: 'actif', section: 'agents' },
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
    lance(e.argv.join(' '))
    return { value: { exitCode: 0, stdout: JSON.stringify(TABLEAU), stderr: '' } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  projetGrillhouse(on)
  on('command.register', () => ({ value: undefined }))
  mock.clock(on)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  expect(await mesure).toBe('node_modules/.bin/grillhouse tableau')
  await new Promise(r => setTimeout(r, 50))
})

// grillhouse-3uv.84.2 critère 5: a Grillhouse project is known by its dependency on the package.
test('a package.json declares the package in its dependencies or devDependencies', () => {
  expect(declareLePaquet('{"devDependencies":{"@roomi-fields/grillhouse":"*"}}')).toBe(true)
  expect(declareLePaquet('{"dependencies":{"@roomi-fields/grillhouse":"^0.23.0"}}')).toBe(true)
  expect(declareLePaquet('{"devDependencies":{"vitest":"*"}}')).toBe(false)
  expect(declareLePaquet('pas du JSON')).toBe(false)
  expect(declareLePaquet(null)).toBe(false)
})

for (const [cas, cwd, pkg, isInteractive] of [
  ["in an agent's copy", '/p/.claude/worktrees/demo-1', undefined, true],
  ['outside a Grillhouse project (no package.json)', '/hors', null, true],
  ['in a project that does not declare the package', '/hors', '{"devDependencies":{"vitest":"*"}}', true],
] as const) {
  test(`${cas}, the mod measures nothing`, async ($, on) => {
    const lances: string[] = []
    on('process.run', ($, e) => {
      lances.push(e.argv.join(' '))
      return { value: { exitCode: 0, stdout: JSON.stringify(TABLEAU), stderr: '' } }
    })
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    projetGrillhouse(on, pkg)
    on('command.register', () => ({ value: undefined }))
    mock.clock(on)
    await $.session.start({ cwd, surface: isInteractive ? 'terminal' : null, isInteractive })
    expect(lances).not.toContain('node_modules/.bin/grillhouse tableau')
  })
}

// grillhouse-jqp: a session of the desktop app's Code tab starts as the SDK does, headless (no
// surface, no person at the prompt), and the app then attaches to it (session.attach). The command
// and the board come with that attachment; a run nothing attaches to (claude -p, the SDK without a
// display) has neither, nor has an agent's copy.
type Banc = Parameters<Parameters<typeof test>[1]>
async function seance($: Banc[0], on: Banc[1], cwd: string, attache: 'desktop' | null) {
  const lances: string[] = []
  const commandes: string[] = []
  on('process.run', ($, e) => {
    lances.push(e.argv.join(' '))
    return { value: { exitCode: 0, stdout: JSON.stringify(TABLEAU), stderr: '' } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.attach', ($, e) => ({ clientId: e.clientId }))
  projetGrillhouse(on)
  on('command.register', ($, e) => {
    commandes.push(e.name)
    return { value: undefined }
  })
  mock.clock(on)
  await $.session.start({ cwd, surface: null, isInteractive: false })
  if (attache) await $.session.attach({ surface: attache, clientId: `${attache}:default` })
  await new Promise(r => setTimeout(r, 50))
  return { lances, commandes }
}

// grillhouse-jqp critères 1 et 3: in the desktop app, /grillhouse registers, the board is
// measured, and the pane draws on the terminal and on the desktop alike.
test("in the desktop app's Code tab, /grillhouse registers and the pane draws on every surface", async ($, on) => {
  const { lances, commandes } = await seance($, on, '/p', 'desktop')
  expect(commandes).toEqual(['grillhouse'])
  expect(lances).toContain('node_modules/.bin/grillhouse tableau')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'grillhouse',
      surface,
      component: 'Pane',
      requestId: 'grillhouse',
      props: {
        title: 'Grillhouse',
        isFocused: false,
        bodyColumns: 52,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 20 },
        view: {} as never,
      },
    })
    expect((await ui.find({ type: 'Text', text: /DEMO/ }))?.text).toBe('DEMO')
    await ui.unmount()
  }
})

// grillhouse-jqp critère 2: a run nobody attaches to, and an agent's copy the desktop app attaches
// to, register no command and measure nothing.
for (const [cas, cwd, attache] of [
  ['in a claude -p run or the SDK without a display', '/p', null],
  ["in an agent's copy the desktop app attaches to", '/p/.claude/worktrees/demo-1', 'desktop'],
] as const) {
  test(`${cas}, /grillhouse does not register`, async ($, on) => {
    const { lances, commandes } = await seance($, on, cwd, attache)
    expect(commandes).toEqual([])
    expect(lances).not.toContain('node_modules/.bin/grillhouse tableau')
  })
}

// grillhouse-9cv critère 1: a command that runs cd at the head of a subcommand is recognized.
test('a command with cd at the head of a subcommand starts with cd', () => {
  for (const c of [
    'cd /p/copie && npm test -- a.spec.ts > log; echo $?',
    'cd /p/copie; npm test',
    'cd /p/copie',
    'cd',
    '  cd /p && ls',
    'npm test && cd /p',
    'ls; cd /p',
    'ls | cd /p',
    'ls\ncd /p',
  ])
    expect(commenceParCd(c)).toBe(true)
})

// grillhouse-9cv critère 2: cd elsewhere than at the head of a command is not a cd.
test('a command with cd as an argument, in a path or in a word does not start with cd', () => {
  for (const c of [
    'echo cd',
    'ls ./src/cd/x',
    'ls /home/cd/x && npm test',
    'abcd /p',
    'git -C /p log',
    'env -C /p npm test',
    'cdk deploy',
    'bd show abc-cd',
  ])
    expect(commenceParCd(c)).toBe(false)
})

// grillhouse-9cv critères 1 et 3: the refusal holds in the main session and in an agent's copy,
// with or without a screen, and names env -C and git -C; another command runs.
for (const [cas, cwd, isInteractive] of [
  ['in the main session', '/p', true],
  ["in an agent's copy, without screen", '/p/.claude/worktrees/demo-1', false],
] as const) {
  test(`${cas}, a command that starts with cd is refused, and another one runs`, async ($, on) => {
    const lances: string[] = []
    on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify(TABLEAU), stderr: '' } }))
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    projetGrillhouse(on)
    on('command.register', () => ({ value: undefined }))
    on('tool.call', ($, e) => {
      lances.push(e.tool === 'Bash' ? e.command : e.tool)
      return { result: {} }
    })
    mock.clock(on)
    await $.session.start({ cwd, surface: isInteractive ? 'terminal' : null, isInteractive })
    const refus = await $.tool.call({ tool: 'Bash', command: 'cd /p/copie && npm test' })
    expect(refus.deny).toMatch(/env -C/)
    expect(refus.deny).toMatch(/git -C/)
    await $.tool.call({ tool: 'Bash', command: 'env -C /p/copie npm test' })
    expect(lances).toEqual(['env -C /p/copie npm test'])
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
      travail: 12 * 60_000,
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

test('the window keeps the ring\'s next stop in sight, past the lines without a button', () => {
  // The ring on line 25; the next line with a button is 31, three plain lines after the window's end.
  expect(debut(50, 25, 10, 20, 24, 31)).toBe(22)
  // Going up, the previous stop 17 comes into sight.
  expect(debut(50, 22, 10, 22, 17, 23)).toBe(17)
  // A stop too far to show with the ring: the ring stays in sight, at the window's edge.
  expect(debut(50, 25, 10, 20, 24, 40)).toBe(25)
  // Both stops cannot show with the ring: the one below wins, the window going down.
  expect(debut(50, 25, 10, 25, 10, 26)).toBe(17)
})

test('3uv.24 critère 5 : the switch gives in progress → open, anything else → in progress', () => {
  expect(bascule('in_progress')).toBe('open')
  expect(bascule('open')).toBe('in_progress')
  expect(bascule(undefined)).toBe('in_progress')
})
