import { expect, test } from 'claude-code/testing'

// The pane lists every line of the board, in the board's order — the head, AGENTS, CHANTIER, then
// FAITS AUJOURD'HUI — and folds none to save rows: its window runs over them all, moved by the
// wheel (ui.scroll, by `e.by` rows, focused or not) and following the ring the arrows move. The
// card keeps its place below the list.
//
// The pane gives the list `bodyRows - FICHE - 1` rows (FICHE = 6): 23 rows for 30 body rows.
// These tests write no file, so they hold no trial folder.

type L = { texte: string; ton?: string; ticket?: string; chantier?: boolean; section: string }

// A board laid out as `scripts/tableau.mjs` lays it: the head and AGENTS with `m` agents' lines
// (section agents), one chantier with `n` tree lines (section chantier), FAITS AUJOURD'HUI with `p`
// lines (section faits, absent when `p` is 0). A blank line belongs to the section after it.
function tableau(n: number, m: number, p: number) {
  const tete: L[] = [
    { texte: 'DEMO', ton: 'titre', section: 'agents' },
    { texte: '▶ 1 en cours · 2 en attente · 0 bloqués · 4 faits', section: 'agents' },
  ]
  const agents: L[] = [
    { texte: '', section: 'agents' },
    { texte: 'AGENTS  ▶ en cours · en attente', ton: 'titre', section: 'agents' },
    ...Array.from({ length: m }, (_, k) => ({ texte: `▶ a.${k + 1}  Agent ${k + 1}`, ton: 'actif', ticket: `a.${k + 1}`, section: 'agents' })),
  ]
  const arbre: L[] = Array.from({ length: n }, (_, k) => ({ texte: `· c.${k + 1}  Ticket ${k + 1}`, ticket: `c.${k + 1}`, section: 'chantier' }))
  const chantier: L[] = [
    { texte: '', section: 'chantier' },
    { texte: 'CHANTIER 1 — Le sujet', ton: 'titre', ticket: 'ch-1', chantier: true, section: 'chantier' },
    { texte: '  4/40 faits · 3 h 00 · 1,2 M jetons', ton: 'discret', section: 'chantier' },
    ...arbre,
  ]
  const faits: L[] = p
    ? [
        { texte: '', section: 'faits' },
        { texte: "FAITS AUJOURD'HUI", ton: 'titre', section: 'faits' },
        ...Array.from({ length: p }, (_, k) => ({ texte: `✓ f.${k + 1}  Fait ${k + 1}`, ton: 'discret', ticket: `f.${k + 1}`, section: 'faits' })),
      ]
    : []
  const lignes = [...tete, ...agents, ...chantier, ...faits]
  const fiches = Object.fromEntries(
    lignes
      .filter(l => l.ticket)
      .map(l => [
        l.ticket,
        { numero: l.ticket, titre: `Titre de ${l.ticket}`, composant: 'x', statut: 'in_progress', duree: 0, jetons: 0, resume: 'R', texte: `Le texte entier de ${l.ticket}.` },
      ]),
  )
  // The pane draws an empty line as one space.
  const vu = (ls: L[]) => ls.map(l => l.texte || ' ')
  // The key of a ticket line's Button: `<ticket>:<index in the board>`.
  const cle = (ticket: string) => `${ticket}:${lignes.findIndex(l => l.ticket === ticket)}`
  // The states' view: a state, its meaning, its tickets one per line.
  const vueEtats: L[] = [
    { texte: 'EN ATTENTE — ton go, prêt à partir', ton: 'titre', section: 'etats' },
    { texte: '  w.1  Attente 1', ticket: 'w.1', section: 'etats' },
    { texte: '  w.2  Attente 2', ticket: 'w.2', section: 'etats' },
  ]
  for (const l of vueEtats.filter(l => l.ticket)) {
    fiches[l.ticket as string] = { numero: l.ticket, titre: `Titre de ${l.ticket}`, composant: 'x', statut: 'open', duree: 0, jetons: 0, resume: 'R', texte: `Le texte entier de ${l.ticket}.` }
  }
  return { t: { lignes, vueEtats, fiches, dernier: 'a.1' }, tout: vu(lignes), tete: vu(tete), agents: vu(agents), chantier: vu(chantier), faits: vu(faits), cle }
}

type Arbre = { type?: string; props?: { height?: number }; children?: unknown[] }

// Every text the drawing shows, in document order.
function textes(n: unknown): string[] {
  if (typeof n === 'string') return [n]
  if (!n || typeof n !== 'object') return []
  return ((n as Arbre).children ?? []).flatMap(textes)
}
// The list's rows: the texts drawn above the rule (`──`).
function liste(arbre: unknown): string[] {
  const tout = textes(arbre)
  const regle = tout.findIndex(s => s.startsWith('──'))
  return regle < 0 ? tout : tout.slice(0, regle)
}
// The texts drawn below the rule: the rule itself and the card.
function dessous(arbre: unknown): string[] {
  const tout = textes(arbre)
  return tout.slice(tout.findIndex(s => s.startsWith('──')))
}

type Monte = {
  ui: { drawn: () => Promise<unknown>; unmount: () => Promise<void>; findAll: (q: object) => Promise<{ key: string }[]> }
  // The person's scroll on the pane: `by` rows, by the wheel (with a pointer) or the keys.
  defiler: (by: number, roue?: boolean) => Promise<{ deny?: string }>
  // The person's ring moving onto the element keyed `element`.
  viser: (element: string) => Promise<unknown>
  // How many scrolls the pane let through to the engine's own window.
  passes: () => number
  appels: string[][]
  // The board `scripts/tableau.mjs` gives from now on, at its next measure.
  changer: (t: object) => void
}

async function monter($: never, on: never, t: object, o: { bodyRows?: number; isFocused?: boolean } = {}): Promise<Monte> {
  const bodyRows = o.bodyRows ?? 30
  const h = on as (n: string, f: unknown) => void
  const s = $ as {
    session: { start: (a: object) => Promise<unknown> }
    ui: { mount: (a: object) => Promise<never>; scroll: (a: object) => Promise<{ deny?: string }>; focus: (a: object) => Promise<unknown> }
  }
  const appels: string[][] = []
  let passes = 0
  let courant = t
  h('process.run', (_: unknown, e: { argv: string[] }) => {
    appels.push(e.argv)
    return { value: { exitCode: 0, stdout: e.argv[0] === 'node' ? JSON.stringify(courant) : '', stderr: '' } }
  })
  h('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  h('command.register', () => ({ value: undefined }))
  h('clock.every', () => ({ value: { cancel: () => undefined } }))
  h('ui.scroll', () => {
    passes++
    return {}
  })
  h('ui.focus', () => ({}))
  h('ui.open', () => ({ value: undefined }))
  await s.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  const ui = (await s.ui.mount({
    plugin: 'grillhouse',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'grillhouse',
    props: {
      title: 't',
      isFocused: o.isFocused ?? true,
      bodyColumns: 50,
      placement: 'dock',
      scroll: { bodyRows, offset: 0 } as never,
      view: {} as never,
    },
  })) as Monte['ui']
  const defiler = (by: number, roue = true) =>
    s.ui.scroll({
      component: 'Pane',
      requestId: 'grillhouse',
      offset: Math.max(0, Math.min(1, by)),
      by,
      bodyRows,
      contentRows: bodyRows + 1,
      origin: { kind: 'person' },
      ...(roue ? { pointer: { column: 3, row: 2 } } : {}),
    })
  const viser = (element: string) =>
    s.ui.focus({ component: 'Pane', requestId: 'grillhouse', plugin: 'grillhouse', element, origin: { kind: 'person' } })
  const changer = (x: object) => {
    courant = x
  }
  return { ui, defiler, viser, passes: () => passes, appels, changer }
}

// The keys of the Buttons drawn in the list, in order (g and h sit on the rule, below it).
async function boutons(m: Monte): Promise<string[]> {
  return (await m.ui.findAll({ type: 'Button' })).map(x => x.key).filter(k => k !== 'g' && k !== 'h' && k !== 'e')
}
// The arrow down: the ring, on the drawn line keyed `cle`, moves onto the next Button drawn.
async function bas(m: Monte, cle: string): Promise<string> {
  const cles = await boutons(m)
  expect(cles).toContain(cle)
  const suivante = cles[cles.indexOf(cle) + 1]
  expect(suivante).toBeDefined()
  await m.viser(suivante as string)
  return suivante as string
}

// ── Every line, in the board's order ──────────────────────────────────────────────────────────

test('the pane lists the head, then AGENTS, then CHANTIER, then FAITS, unchanged by a scroll', async ($, on) => {
  // 16 lines in 23 rows.
  const b = tableau(3, 2, 2)
  const m = await monter($ as never, on as never, b.t)
  const arbre = (await m.ui.drawn()) as Arbre
  expect(liste(arbre)).toEqual([...b.tete, ...b.agents, ...b.chantier, ...b.faits])
  expect(liste(arbre).indexOf('AGENTS  ▶ en cours · en attente')).toBeLessThan(liste(arbre).indexOf('CHANTIER 1 — Le sujet'))
  expect(arbre.props?.height).toBe(30)
  await m.defiler(1)
  expect(liste(await m.ui.drawn())).toEqual(b.tout)
  await m.ui.unmount()
})

test('a board longer than the rows folds no line: the window shows its first rows, the wheel runs to its last line', async ($, on) => {
  // 48 lines in 23 rows: the head 2, AGENTS 8, CHANTIER 33, FAITS 5.
  const b = tableau(30, 6, 3)
  expect(b.tout).toHaveLength(48)
  const m = await monter($ as never, on as never, b.t)
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(0, 23))
  await m.defiler(25)
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(25, 48))
  // At the bottom, scrolling down moves nothing; no line counts lines it does not show.
  await m.defiler(1)
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(25, 48))
  for (let i = 0; i < 25; i++) await m.defiler(-1)
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(0, 23))
  // At the top, scrolling up moves nothing.
  await m.defiler(-1)
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(0, 23))
  await m.ui.unmount()
})

test('a long AGENTS shows whole above CHANTIER, the wheel running through it', async ($, on) => {
  // 23 rows, AGENTS 32 lines below the head.
  const b = tableau(5, 30, 3)
  const m = await monter($ as never, on as never, b.t)
  expect(liste(await m.ui.drawn())).toEqual([...b.tete, ...b.agents.slice(0, 21)])
  await m.defiler(20)
  const l = liste(await m.ui.drawn())
  expect(l).toEqual(b.tout.slice(20, 43))
  expect(l.slice(0, 14)).toEqual(b.agents.slice(18))
  expect(l.slice(14, 22)).toEqual(b.chantier)
  await m.ui.unmount()
})

test('unfocused, the pane lists every line the same way, and the wheel moves its window', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t, { isFocused: false })
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(0, 23))
  await m.defiler(4)
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(4, 27))
  await m.defiler(-1)
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(3, 26))
  await m.ui.unmount()
})

// ── The window ───────────────────────────────────────────────────────────────────────────────

test('the wheel moves the window by e.by rows and redraws it, without passing the scroll on', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await m.defiler(3)
  const arbre = (await m.ui.drawn()) as Arbre
  expect(arbre.props?.height).toBe(30)
  expect(liste(arbre)).toEqual(b.tout.slice(3, 26))
  // The pane draws its own rows: the engine's window has nothing to move.
  expect(m.passes()).toBe(0)
  await m.defiler(-2)
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(1, 24))
  await m.ui.unmount()
})

test('a page down (one scroll of 30 rows) reaches the end in one move, a page up comes back', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await m.defiler(30, false)
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(25, 48))
  await m.defiler(-30, false)
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(0, 23))
  await m.ui.unmount()
})

test('a very short pane gives the list its two rows, and the wheel moves them', async ($, on) => {
  // 9 body rows: 2 rows for the list.
  const b = tableau(10, 3, 2)
  const m = await monter($ as never, on as never, b.t, { bodyRows: 9 })
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(0, 2))
  await m.defiler(1)
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(1, 3))
  await m.ui.unmount()
})

test('the ring moving past the last row drawn moves the window just enough to show it, with its next stop', async ($, on) => {
  // c.20 is at index 32 of the list, c.21 at 33: the window moves to start at 11.
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await m.viser(b.cle('c.20'))
  const l = liste(await m.ui.drawn())
  expect(l).toEqual(b.tout.slice(11, 34))
  expect(l.slice(-2)).toEqual(['· c.20  Ticket 20', '· c.21  Ticket 21'])
  await m.ui.unmount()
})

test('the ring moving down to FAITS brings it into the window, and back up to AGENTS brings AGENTS back', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await m.viser(b.cle('f.3'))
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(25, 48))
  await m.viser(b.cle('a.1'))
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  for (const a of b.agents.filter(x => x.trim())) expect(l).toContain(a)
  await m.ui.unmount()
})

test('the wheel can take the chosen line out of the window, and the next arrow brings it back', async ($, on) => {
  const b = tableau(5, 30, 3)
  const m = await monter($ as never, on as never, b.t)
  await m.viser(b.cle('a.1'))
  for (let i = 0; i < 10; i++) await m.defiler(1)
  let arbre = await m.ui.drawn()
  // The window followed the wheel, not the ring; the card still shows the chosen ticket.
  expect(liste(arbre)).toEqual(b.tout.slice(10, 33))
  expect(liste(arbre)).not.toContain('▶ a.1  Agent 1')
  expect(dessous(arbre).join('\n')).toContain('a.1 — Titre de a.1')
  await m.viser(b.cle('a.2'))
  arbre = await m.ui.drawn()
  expect(liste(arbre)).toContain('▶ a.2  Agent 2')
  expect(liste(arbre)).toContain('▶ a.1  Agent 1')
  await m.ui.unmount()
})

// ── The card ─────────────────────────────────────────────────────────────────────────────────

test('the card keeps its place below the list while the list scrolls', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t, { isFocused: false })
  const avant = dessous(await m.ui.drawn())
  expect(avant.join('\n')).toContain('a.1 — Titre de a.1')
  await m.defiler(1)
  const apres = await m.ui.drawn()
  expect(liste(apres)).toEqual(b.tout.slice(1, 24))
  expect(dessous(apres)).toEqual(avant)
  await m.ui.unmount()
})

test('g on a shown line fills the pane with the card, a scroll brings it back and leaves the list where it was', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await m.defiler(1)
  const avant = liste(await m.ui.drawn())
  await ($ as { ui: { press: (a: object) => Promise<unknown> } }).ui.press({ plugin: 'grillhouse', key: b.cle('a.2') })
  await ($ as { ui: { press: (a: object) => Promise<unknown> } }).ui.press({ plugin: 'grillhouse', key: 'g' })
  expect(textes(await m.ui.drawn()).join('\n')).toContain('Le texte entier de a.2.')
  await m.defiler(1)
  const apres = await m.ui.drawn()
  expect(textes(apres).join('\n')).not.toContain('Le texte entier de a.2.')
  expect(liste(apres)).toEqual(avant)
  await m.ui.unmount()
})

test('h on a chantier switches it', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await ($ as { ui: { press: (a: object) => Promise<unknown> } }).ui.press({ plugin: 'grillhouse', key: b.cle('ch-1') })
  await ($ as { ui: { press: (a: object) => Promise<unknown> } }).ui.press({ plugin: 'grillhouse', key: 'h' })
  await new Promise(r => setTimeout(r, 50))
  expect(m.appels).toContainEqual(['bd', 'update', 'ch-1', '--status', 'open'])
  await m.ui.unmount()
})

test('e switches to the states view, its tickets chosen by the ring and g shows their card, e again comes back', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  const press = ($ as { ui: { press: (a: object) => Promise<unknown> } }).ui.press
  await press({ plugin: 'grillhouse', key: 'e' })
  expect(liste(await m.ui.drawn()).slice(0, 3)).toEqual(['EN ATTENTE — ton go, prêt à partir', '  w.1  Attente 1', '  w.2  Attente 2'])
  expect(await boutons(m)).toEqual(['w.1:1', 'w.2:2'])
  await press({ plugin: 'grillhouse', key: 'w.2:2' })
  expect(dessous(await m.ui.drawn()).join('\n')).toContain('w.2 — Titre de w.2')
  await press({ plugin: 'grillhouse', key: 'g' })
  expect(textes(await m.ui.drawn()).join('\n')).toContain('Le texte entier de w.2.')
  await press({ plugin: 'grillhouse', key: 'e' })
  expect(liste(await m.ui.drawn()).slice(0, 2)).toEqual(b.tout.slice(0, 2))
  await m.ui.unmount()
})

test('the rule names e and what it switches to', async ($, on) => {
  const b = tableau(3, 2, 2)
  const m = await monter($ as never, on as never, b.t)
  expect(dessous(await m.ui.drawn()).slice(0, 3).join('')).toContain('e : états')
  await ($ as { ui: { press: (a: object) => Promise<unknown> } }).ui.press({ plugin: 'grillhouse', key: 'e' })
  expect(dessous(await m.ui.drawn()).slice(0, 3).join('')).toContain('e : tableau')
  await m.ui.unmount()
})
