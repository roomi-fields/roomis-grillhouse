import { expect, test } from 'claude-code/testing'

// grillhouse-3uv.43 — the pane shares its rows among the board's sections, by the section each
// line carries (`section`: chantier, agents, faits): AGENTS whole first, CHANTIER the rows left
// with the rest folded in one counting line, FAITS AUJOURD'HUI what remains; scrolling down
// unrolls AGENTS, then FAITS. The card keeps its place below the list.
//
// The pane gives the list `bodyRows - FICHE - 1` rows (FICHE = 6): 23 rows for 30 body rows.
// The list is a window over [CHANTIER folded, AGENTS, FAITS]: the wheel (ui.scroll) moves it by
// `e.by` rows, focused or not; the arrows move the ring and the window follows it (critère 6).
// These tests write no file, so they hold no trial folder.

type L = { texte: string; ton?: string; ticket?: string; chantier?: boolean; section: string; replie?: L[] }

// A board laid out as `scripts/tableau.mjs` lays it: the head and one chantier with `n` tree
// lines (section chantier), AGENTS with `m` lines (section agents), FAITS AUJOURD'HUI with `p`
// lines (section faits, absent when `p` is 0). A blank line belongs to the section after it.
// `attente` adds to AGENTS a counting line « + N en attente » folding `attente` agents' lines.
// `o` adds CHANTIER's inner counting lines, as `scripts/tableau.mjs` lays them at each level of
// the tree: `prets` « + N prêts » after the tree line c.<apres>, folding N ready tickets one level
// deeper; `plus` « … N lignes de plus » after the tree, folding the N tree lines past its limit;
// `autres` « + N autres chantiers », folding the epics not in progress. Folded lines carry the
// section of their counting line.
type Interieur = { prets?: { apres: number; n: number }; plus?: number; autres?: number }
function tableau(n: number, m: number, p: number, attente = 0, o: Interieur = {}) {
  const arbre: L[] = Array.from({ length: n }, (_, k) => ({ texte: `· c.${k + 1}  Ticket ${k + 1}`, ticket: `c.${k + 1}`, section: 'chantier' }))
  if (o.prets) {
    const { apres, n: r } = o.prets
    arbre.splice(apres, 0, {
      texte: `  + ${r} prêts`,
      ton: 'discret',
      section: 'chantier',
      replie: Array.from({ length: r }, (_, k) => ({ texte: `  · r.${k + 1}  Prêt ${k + 1}`, ticket: `r.${k + 1}`, section: 'chantier' })),
    })
  }
  const chantier: L[] = [
    { texte: 'DEMO', ton: 'titre', section: 'chantier' },
    { texte: '▶ 1 en cours · 2 prêts · 0 bloqués · 4 faits', section: 'chantier' },
    { texte: '', section: 'chantier' },
    { texte: 'CHANTIER 1 — Le sujet', ton: 'titre', ticket: 'ch-1', chantier: true, section: 'chantier' },
    { texte: '  4/40 faits · 3 h 00 · 1,2 M jetons', ton: 'discret', section: 'chantier' },
    ...arbre,
    ...(o.plus
      ? [
          {
            texte: `  … ${o.plus} lignes de plus`,
            ton: 'discret',
            section: 'chantier',
            replie: Array.from({ length: o.plus }, (_, k) => ({ texte: `· x.${k + 1}  Suite ${k + 1}`, ticket: `x.${k + 1}`, section: 'chantier' })),
          },
        ]
      : []),
    ...(o.autres
      ? [
          {
            texte: `+ ${o.autres} autres chantiers`,
            ton: 'discret',
            section: 'chantier',
            replie: Array.from({ length: o.autres }, (_, k) => ({
              texte: `ch-${k + 2}  Autre ${k + 1}`,
              ton: 'discret',
              ticket: `ch-${k + 2}`,
              chantier: true,
              section: 'chantier',
            })),
          },
        ]
      : []),
  ]
  const agents: L[] = [
    { texte: '', section: 'agents' },
    { texte: 'AGENTS  ▶ en cours · en attente', ton: 'titre', section: 'agents' },
    ...Array.from({ length: m }, (_, k) => ({ texte: `▶ a.${k + 1}  Agent ${k + 1}`, ton: 'actif', ticket: `a.${k + 1}`, section: 'agents' })),
    ...(attente
      ? [
          {
            texte: `+ ${attente} en attente`,
            ton: 'discret',
            section: 'agents',
            replie: Array.from({ length: attente }, (_, k) => ({ texte: `◇ w.${k + 1}  Attente ${k + 1}`, ticket: `w.${k + 1}`, section: 'agents' })),
          },
        ]
      : []),
  ]
  const faits: L[] = p
    ? [
        { texte: '', section: 'faits' },
        { texte: "FAITS AUJOURD'HUI", ton: 'titre', section: 'faits' },
        ...Array.from({ length: p }, (_, k) => ({ texte: `✓ f.${k + 1}  Fait ${k + 1}`, ton: 'discret', ticket: `f.${k + 1}`, section: 'faits' })),
      ]
    : []
  const lignes = [...chantier, ...agents, ...faits]
  const fiches = Object.fromEntries(
    lignes
      .flatMap(l => [l, ...(l.replie ?? [])])
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
  // The key of a board counting line's Button: `+:<index in the board>`.
  const compte = (texte: string) => `+:${lignes.findIndex(l => l.texte === texte)}`
  const deplie = vu(agents.flatMap(l => [l, ...(l.replie ?? [])]))
  return { t: { lignes, fiches, dernier: 'a.1' }, chantier: vu(chantier), agents: vu(agents), deplie, faits: vu(faits), cle, compte }
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

// ── Critère 1 ──────────────────────────────────────────────────────────────────────────────────

test('3uv.43 critère 1 : AGENTS shows whole, CHANTIER takes the rows left and folds the rest in one counting line', async ($, on) => {
  // 23 rows: AGENTS 8, CHANTIER 35 → 14 of its lines and a line counting the 21 others; FAITS none.
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l.slice(0, 14)).toEqual(b.chantier.slice(0, 14))
  expect(l[14]).toBe('+ 21 lignes de plus')
  expect(l.slice(15)).toEqual(b.agents)
  for (const f of b.faits.filter(x => x.trim())) expect(l).not.toContain(f)
  await m.ui.unmount()
})

test('3uv.43 critère 1 : another size — 13 rows, AGENTS 5 whole, CHANTIER 7 lines and the count of the 10 others', async ($, on) => {
  const b = tableau(12, 3, 2)
  const m = await monter($ as never, on as never, b.t, { bodyRows: 20 })
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(13)
  expect(l.slice(0, 7)).toEqual(b.chantier.slice(0, 7))
  expect(l[7]).toBe('+ 10 lignes de plus')
  expect(l.slice(8)).toEqual(b.agents)
  await m.ui.unmount()
})

test('3uv.43 critère 1 : unfocused, the pane shares its rows the same way', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t, { isFocused: false })
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l.slice(15)).toEqual(b.agents)
  expect(l[14]).toBe('+ 21 lignes de plus')
  await m.ui.unmount()
})

test('3uv.43 critère 1 : CHANTIER whole and AGENTS whole leave FAITS the rows that remain', async ($, on) => {
  // 23 rows: CHANTIER 10 and AGENTS 6 whole, FAITS (12 lines) in the 7 rows left.
  const b = tableau(5, 4, 10)
  const m = await monter($ as never, on as never, b.t)
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l.slice(0, 16)).toEqual([...b.chantier, ...b.agents])
  // FAITS cut has no counting line: its 7th line takes the last row (arbitrage, cas 2).
  expect(l.slice(16)).toEqual(b.faits.slice(0, 7))
  await m.ui.unmount()
})

test('3uv.43 critère 1 : CHANTIER and AGENTS filling the rows exactly leave FAITS none and fold nothing', async ($, on) => {
  // 23 rows: CHANTIER 15, AGENTS 8.
  const b = tableau(10, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  expect(liste(await m.ui.drawn())).toEqual([...b.chantier, ...b.agents])
  await m.ui.unmount()
})

test('3uv.43 critère 1 : one row left to CHANTIER holds its counting line alone', async ($, on) => {
  // 23 rows: AGENTS 22, CHANTIER 15 → its 15 lines counted in one line.
  const b = tableau(10, 20, 0)
  const m = await monter($ as never, on as never, b.t)
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l[0]).toBe('+ 15 lignes de plus')
  expect(l.slice(1)).toEqual(b.agents)
  await m.ui.unmount()
})

test('3uv.43 critère 1 : AGENTS filling the rows exactly leaves CHANTIER none', async ($, on) => {
  const b = tableau(10, 21, 2)
  const m = await monter($ as never, on as never, b.t)
  expect(liste(await m.ui.drawn())).toEqual(b.agents)
  await m.ui.unmount()
})

// ── Critère 2 ──────────────────────────────────────────────────────────────────────────────────

test('3uv.43 critère 2 : AGENTS taller than the rows takes them all, and scrolling runs through it', async ($, on) => {
  // 23 rows, AGENTS 32 lines.
  const b = tableau(5, 30, 3)
  const m = await monter($ as never, on as never, b.t)
  expect(liste(await m.ui.drawn())).toEqual(b.agents.slice(0, 23))
  await m.defiler(1)
  expect(liste(await m.ui.drawn())).toEqual(b.agents.slice(1, 24))
  for (let i = 0; i < 8; i++) await m.defiler(1)
  expect(liste(await m.ui.drawn())).toEqual(b.agents.slice(9, 32))
  for (let i = 0; i < 9; i++) await m.defiler(-1)
  expect(liste(await m.ui.drawn())).toEqual(b.agents.slice(0, 23))
  // The start view begins at AGENTS: scrolling up from it shows no CHANTIER (arbitrage, cas 3).
  await m.defiler(-1)
  expect(liste(await m.ui.drawn())).toEqual(b.agents.slice(0, 23))
  await m.ui.unmount()
})

test('3uv.43 critère 2 : past the end of AGENTS, scrolling goes on into FAITS', async ($, on) => {
  const b = tableau(5, 30, 3)
  const m = await monter($ as never, on as never, b.t)
  for (let i = 0; i < 10; i++) await m.defiler(1)
  expect(liste(await m.ui.drawn())).toEqual([...b.agents.slice(10), b.faits[0]])
  for (let i = 0; i < 20; i++) await m.defiler(1)
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l.slice(-5)).toEqual(b.faits)
  await m.ui.unmount()
})

// ── Critère 3 ──────────────────────────────────────────────────────────────────────────────────

test('3uv.43 critère 3 : scrolling down by the wheel unrolls AGENTS then FAITS, and scrolling up comes back', async ($, on) => {
  // 23 rows: CHANTIER 35 folded, AGENTS 8 whole, FAITS 5 below.
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  const depart = liste(await m.ui.drawn())
  await m.defiler(1)
  let l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l.slice(-9)).toEqual([...b.agents, b.faits[0]])
  for (let i = 0; i < 4; i++) await m.defiler(1)
  l = liste(await m.ui.drawn())
  expect(l.slice(-13)).toEqual([...b.agents, ...b.faits])
  // At the bottom, scrolling down moves nothing.
  await m.defiler(1)
  expect(liste(await m.ui.drawn())).toEqual(l)
  for (let i = 0; i < 5; i++) await m.defiler(-1)
  expect(liste(await m.ui.drawn())).toEqual(depart)
  // At the top, scrolling up moves nothing.
  await m.defiler(-1)
  expect(liste(await m.ui.drawn())).toEqual(depart)
  await m.ui.unmount()
})

test('3uv.43 critère 3 : the arrows, moving the ring down, unroll FAITS, and moving it up bring AGENTS back', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  for (const x of ['a.1', 'a.2', 'a.3', 'a.4', 'a.5', 'a.6', 'f.1', 'f.2', 'f.3']) await m.viser(b.cle(x))
  let l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l.slice(-13)).toEqual([...b.agents, ...b.faits])
  for (const x of ['f.2', 'f.1', 'a.6', 'a.5', 'a.4', 'a.3', 'a.2', 'a.1', 'ch-1']) await m.viser(b.cle(x))
  l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l).toContain('CHANTIER 1 — Le sujet')
  for (const x of b.agents) expect(l).toContain(x)
  await m.ui.unmount()
})

test('3uv.43 critère 3 : a page down (one scroll of 30 rows) reaches FAITS in one move, a page up comes back', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  const depart = liste(await m.ui.drawn())
  await m.defiler(30, false)
  expect(liste(await m.ui.drawn()).slice(-13)).toEqual([...b.agents, ...b.faits])
  await m.defiler(-30, false)
  expect(liste(await m.ui.drawn())).toEqual(depart)
  await m.ui.unmount()
})

test('3uv.43 critère 3 : unfocused, the wheel unrolls FAITS too', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t, { isFocused: false })
  for (let i = 0; i < 5; i++) await m.defiler(1)
  expect(liste(await m.ui.drawn()).slice(-13)).toEqual([...b.agents, ...b.faits])
  await m.ui.unmount()
})

test('3uv.43 critère 3 et 6 : lines that do not fit draw only the window, with no row to spare, and the wheel still moves it', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  const arbre = (await m.ui.drawn()) as Arbre
  expect(arbre.props?.height).toBe(30)
  expect(liste(arbre)).toHaveLength(23)
  await m.defiler(1)
  const apres = (await m.ui.drawn()) as Arbre
  expect(apres.props?.height).toBe(30)
  expect(liste(apres).slice(-9)).toEqual([...b.agents, b.faits[0]])
  await m.ui.unmount()
})

// ── Critère 4 ──────────────────────────────────────────────────────────────────────────────────

test('3uv.43 critère 4 : when every line fits, the list shows them all in order, unchanged by a scroll', async ($, on) => {
  // 23 rows: CHANTIER 8, AGENTS 4, FAITS 4.
  const b = tableau(3, 2, 2)
  const m = await monter($ as never, on as never, b.t)
  const arbre = (await m.ui.drawn()) as Arbre
  expect(liste(arbre)).toEqual([...b.chantier, ...b.agents, ...b.faits])
  expect(arbre.props?.height).toBe(30)
  await m.defiler(1)
  expect(liste(await m.ui.drawn())).toEqual([...b.chantier, ...b.agents, ...b.faits])
  await m.ui.unmount()
})

test('3uv.43 critère 4 : every line filling the rows exactly still shows them all, with nothing folded', async ($, on) => {
  // 23 rows: CHANTIER 13, AGENTS 5, FAITS 5.
  const b = tableau(8, 3, 3)
  const m = await monter($ as never, on as never, b.t)
  expect(liste(await m.ui.drawn())).toEqual([...b.chantier, ...b.agents, ...b.faits])
  await m.ui.unmount()
})

test('3uv.43 critère 4 : a board without FAITS that fits shows CHANTIER then AGENTS', async ($, on) => {
  const b = tableau(4, 4, 0)
  const m = await monter($ as never, on as never, b.t)
  expect(liste(await m.ui.drawn())).toEqual([...b.chantier, ...b.agents])
  await m.ui.unmount()
})

// ── Critère 5 ──────────────────────────────────────────────────────────────────────────────────

test('3uv.43 critère 5 : the card keeps its place below the list while the list scrolls', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t, { isFocused: false })
  const avant = dessous(await m.ui.drawn())
  expect(avant.join('\n')).toContain('a.1 — Titre de a.1')
  await m.defiler(1)
  // The pane moves its own list (it draws its own rows, critère 6): the card stays put.
  const apres = await m.ui.drawn()
  expect(liste(apres).slice(-9)).toEqual([...b.agents, b.faits[0]])
  expect(dessous(apres)).toEqual(avant)
  await m.ui.unmount()
})

test('3uv.43 critère 5 : g on a shown line fills the pane with the card, a scroll brings it back and leaves the list where it was', async ($, on) => {
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

test('3uv.43 critère 5 : h on a chantier shown above the folded rows switches it', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await ($ as { ui: { press: (a: object) => Promise<unknown> } }).ui.press({ plugin: 'grillhouse', key: b.cle('ch-1') })
  await ($ as { ui: { press: (a: object) => Promise<unknown> } }).ui.press({ plugin: 'grillhouse', key: 'h' })
  await new Promise(r => setTimeout(r, 50))
  expect(m.appels).toContainEqual(['bd', 'update', 'ch-1', '--status', 'open'])
  await m.ui.unmount()
})

test('3uv.43 critère 5 : the ring moving onto a FAITS line scrolled into view keeps it shown', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  for (let i = 0; i < 5; i++) await m.defiler(1)
  await m.viser(b.cle('f.3'))
  expect(liste(await m.ui.drawn())).toContain('✓ f.3  Fait 3')
  await m.ui.unmount()
})

test('3uv.43 critère 5 : the ring moving onto an AGENTS line keeps AGENTS whole and the line shown', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await m.viser(b.cle('a.6'))
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  for (const a of b.agents) expect(l).toContain(a)
  await m.ui.unmount()
})

test('3uv.43 critère 5 : the ring moving onto a CHANTIER line shown keeps it shown and AGENTS whole', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await m.viser(b.cle('c.9'))
  const l = liste(await m.ui.drawn())
  expect(l).toContain('· c.9  Ticket 9')
  for (const a of b.agents) expect(l).toContain(a)
  await m.ui.unmount()
})

// ── Critère 6 ──────────────────────────────────────────────────────────────────────────────────

test('3uv.43 critère 6 : the wheel moves the window by e.by rows and redraws it, without passing the scroll on', async ($, on) => {
  // Virtual list 28 lines (CHANTIER 14 + count, AGENTS 8, FAITS 5) in 23 rows.
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  const depart = liste(await m.ui.drawn())
  await m.defiler(3)
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l.slice(0, 11)).toEqual(depart.slice(3, 14))
  expect(l.slice(-11)).toEqual([...b.agents, ...b.faits.slice(0, 3)])
  // The pane draws its own rows: the engine's window has nothing to move.
  expect(m.passes()).toBe(0)
  await m.defiler(-2)
  expect(liste(await m.ui.drawn()).slice(0, 12)).toEqual(depart.slice(1, 13))
  await m.ui.unmount()
})

test('3uv.43 critère 6 : unfocused, the wheel moves the window by e.by rows the same way', async ($, on) => {
  const b = tableau(5, 30, 3)
  const m = await monter($ as never, on as never, b.t, { isFocused: false })
  await m.defiler(4)
  expect(liste(await m.ui.drawn())).toEqual(b.agents.slice(4, 27))
  await m.defiler(-1)
  expect(liste(await m.ui.drawn())).toEqual(b.agents.slice(3, 26))
  await m.ui.unmount()
})

test('3uv.43 critère 6 : the ring moving past the last row drawn moves the window just enough to show it', async ($, on) => {
  // f.1 is at index 25 of the virtual list: the window moves to show it with one line below (cas 6).
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await m.viser(b.cle('f.1'))
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l.slice(-12)).toEqual([...b.agents, ...b.faits.slice(0, 4)])
  await m.ui.unmount()
})

// ── Critère 7 ──────────────────────────────────────────────────────────────────────────────────

// The key of the Button of CHANTIER's counting line: the one Button that is neither a board line's
// nor the rule's.
async function cleDuCompte(m: Monte, b: { t: { lignes: L[] } }): Promise<string | undefined> {
  const tickets = new Set(b.t.lignes.flatMap(l => [l, ...(l.replie ?? [])]).map(l => l.ticket).filter(Boolean))
  const cles = (await m.ui.findAll({ type: 'Button' })).map(x => x.key)
  return cles.find(k => k !== 'g' && k !== 'h' && !tickets.has(k.split(':')[0]) && !/^\+:\d+$/.test(k))
}

test('3uv.43 critère 7 : the CHANTIER counting line is a Button, and the ring on it unfolds the lines it counts', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  expect(liste(await m.ui.drawn())).toContain('+ 21 lignes de plus')
  const cle = await cleDuCompte(m, b)
  expect(cle).toBeDefined()
  await m.viser(cle as string)
  const l = liste(await m.ui.drawn())
  // The first line it folded now shows below it, as a Button the ring can reach.
  expect(l[l.indexOf('+ 21 lignes de plus') + 1]).toBe('· c.10  Ticket 10')
  expect((await m.ui.findAll({ type: 'Button' })).map(x => x.key).some(k => k.startsWith('c.10:'))).toBe(true)
  await m.ui.unmount()
})

test('3uv.43 critère 7 : another size — the ring on « + 10 lignes de plus » unfolds the 10 lines', async ($, on) => {
  const b = tableau(12, 3, 2)
  const m = await monter($ as never, on as never, b.t, { bodyRows: 20 })
  const cle = await cleDuCompte(m, b)
  expect(cle).toBeDefined()
  await m.viser(cle as string)
  expect(liste(await m.ui.drawn())).toContain('· c.3  Ticket 3')
  await m.ui.unmount()
})

// ── Critère 8 ──────────────────────────────────────────────────────────────────────────────────

test('3uv.43 critère 8 : the wheel can take the chosen line out of the window, and the next arrow brings it back', async ($, on) => {
  // AGENTS 32 lines in 23 rows; the ring on a.1 (line 2).
  const b = tableau(5, 30, 3)
  const m = await monter($ as never, on as never, b.t)
  await m.viser(b.cle('a.1'))
  for (let i = 0; i < 10; i++) await m.defiler(1)
  let arbre = await m.ui.drawn()
  // The window followed the wheel, not the ring; the card still shows the chosen ticket.
  expect(liste(arbre)).toEqual([...b.agents.slice(10), b.faits[0]])
  expect(liste(arbre)).not.toContain('▶ a.1  Agent 1')
  expect(dessous(arbre).join('\n')).toContain('a.1 — Titre de a.1')
  await m.viser(b.cle('a.2'))
  arbre = await m.ui.drawn()
  expect(liste(arbre)).toContain('▶ a.2  Agent 2')
  expect(liste(arbre)).toContain('▶ a.1  Agent 1')
  await m.ui.unmount()
})

test('3uv.43 critère 8 : the wheel scrolling the chosen line out, then back, keeps it chosen', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await m.viser(b.cle('ch-1'))
  for (let i = 0; i < 5; i++) await m.defiler(1)
  expect(liste(await m.ui.drawn())).not.toContain('CHANTIER 1 — Le sujet')
  for (let i = 0; i < 5; i++) await m.defiler(-1)
  const arbre = await m.ui.drawn()
  expect(liste(arbre)).toContain('CHANTIER 1 — Le sujet')
  expect(dessous(arbre).join('\n')).toContain('ch-1 — Titre de ch-1')
  await m.ui.unmount()
})

// ── Cas tranchés par le chef de chantier ───────────────────────────────────────────────────────

test('3uv.43 critère 1 (cas 4) : a counting line unfolded in AGENTS belongs to AGENTS, which stays whole with it', async ($, on) => {
  // AGENTS 9 lines, 12 unfolded: CHANTIER keeps 10 lines and counts the 25 others.
  const b = tableau(30, 6, 3, 3)
  const m = await monter($ as never, on as never, b.t)
  await m.viser(b.compte('+ 3 en attente'))
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l.slice(-12)).toEqual(b.deplie)
  expect(l[10]).toBe('+ 25 lignes de plus')
  await m.ui.unmount()
})

test('3uv.43 critère 2 (cas 8) : a very short pane gives AGENTS all its rows', async ($, on) => {
  // 9 body rows: 2 rows for the list.
  const b = tableau(10, 3, 2)
  const m = await monter($ as never, on as never, b.t, { bodyRows: 9 })
  expect(liste(await m.ui.drawn())).toEqual(b.agents.slice(0, 2))
  await m.defiler(1)
  expect(liste(await m.ui.drawn())).toEqual(b.agents.slice(1, 3))
  await m.ui.unmount()
})

test('3uv.43 critère 1 (cas 8) : AGENTS without agents is its title alone, still whole', async ($, on) => {
  // AGENTS 2 lines: CHANTIER 35 keeps 20 and counts the 15 others.
  const b = tableau(30, 0, 3)
  const m = await monter($ as never, on as never, b.t)
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l.slice(-2)).toEqual(b.agents)
  expect(l[20]).toBe('+ 15 lignes de plus')
  await m.ui.unmount()
})

// ── Critères 7 et 9 : CHANTIER unfolded by the keyboard ────────────────────────────────────────

// The keys of the Buttons drawn in the list, in order (g and h sit on the rule, below it).
async function boutons(m: Monte): Promise<string[]> {
  return (await m.ui.findAll({ type: 'Button' })).map(x => x.key).filter(k => k !== 'g' && k !== 'h')
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

// The arbitrage on an inner counting line of CHANTIER unfolded by the keyboard: it shows all its
// lines right below it, even at the edge of the fold; they push CHANTIER's fold down by as many
// rows, and « + N lignes de plus » counts the same lines as before; the window follows the ring,
// and AGENTS may go out. Each unfolded line is reached by the arrow.

test('3uv.43 critère 7 : an inner counting line unfolded above the fold pushes the fold down, its count unchanged, and the arrow reaching it unfolds CHANTIER', async ($, on) => {
  // CHANTIER 36 lines with « + 3 prêts » after c.5, AGENTS 8: 14 rows to CHANTIER (to c.8), then
  // its count of the 22 others.
  const b = tableau(30, 6, 3, 0, { prets: { apres: 5, n: 3 } })
  const m = await monter($ as never, on as never, b.t)
  expect(liste(await m.ui.drawn())[14]).toBe('+ 22 lignes de plus')
  // The arrow runs c.5, « + 3 prêts » (which unfolds r.1..r.3), r.1, r.2, r.3, c.6, c.7, c.8.
  let cle = b.cle('c.5')
  await m.viser(cle)
  cle = await bas(m, cle)
  expect(cle).toBe(b.compte('  + 3 prêts'))
  let l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l.slice(10, 19)).toEqual([
    '  + 3 prêts',
    '  · r.1  Prêt 1',
    '  · r.2  Prêt 2',
    '  · r.3  Prêt 3',
    '· c.6  Ticket 6',
    '· c.7  Ticket 7',
    '· c.8  Ticket 8',
    '+ 22 lignes de plus',
    ' ',
  ])
  for (const t of ['r.1', 'r.2', 'r.3']) {
    cle = await bas(m, cle)
    expect(cle.startsWith(`${t}:`)).toBe(true)
  }
  for (const t of ['c.6', 'c.7', 'c.8']) {
    cle = await bas(m, cle)
    expect(cle).toBe(b.cle(t))
  }
  // The next Button is CHANTIER's counting line: the ring on it unfolds CHANTIER, which keeps its
  // text, the lines it counted right below it.
  cle = await bas(m, cle)
  l = liste(await m.ui.drawn())
  const ici = l.indexOf('+ 22 lignes de plus')
  expect(ici).toBeGreaterThanOrEqual(0)
  expect(l[ici + 1]).toBe('· c.9  Ticket 9')
  expect(await boutons(m)).toContain(cle)
  expect(await bas(m, cle)).toBe(b.cle('c.9'))
  await m.ui.unmount()
})

test('3uv.43 critère 7 (cas A) : an inner counting line on the last row of the fold shows all its lines below it, the count unchanged, each reached by the arrow', async ($, on) => {
  // 17 rows: CHANTIER 16 lines (« + 2 prêts » after c.2, « … 4 lignes de plus », « + 2 autres
  // chantiers »), AGENTS 8 whole; CHANTIER keeps 8 rows, the last c.2's « + 2 prêts ».
  const b = tableau(8, 6, 3, 0, { prets: { apres: 2, n: 2 }, plus: 4, autres: 2 })
  const m = await monter($ as never, on as never, b.t, { bodyRows: 24 })
  expect(liste(await m.ui.drawn())[7]).toBe('  + 2 prêts')
  expect(liste(await m.ui.drawn())[8]).toBe('+ 8 lignes de plus')
  let cle = b.cle('c.2')
  await m.viser(cle)
  cle = await bas(m, cle)
  expect(cle).toBe(b.compte('  + 2 prêts'))
  // r.1 and r.2 come right below it and push the fold down two rows; AGENTS loses its last two.
  const l = liste(await m.ui.drawn())
  expect(l).toEqual([
    ...b.chantier.slice(0, 8),
    '  · r.1  Prêt 1',
    '  · r.2  Prêt 2',
    '+ 8 lignes de plus',
    ...b.agents.slice(0, 6),
  ])
  cle = await bas(m, cle)
  expect(cle.startsWith('r.1:')).toBe(true)
  cle = await bas(m, cle)
  expect(cle.startsWith('r.2:')).toBe(true)
  expect(liste(await m.ui.drawn())).toContain('  · r.2  Prêt 2')
  // Past r.2, the arrow reaches CHANTIER's counting line, which unfolds CHANTIER.
  cle = await bas(m, cle)
  const apres = liste(await m.ui.drawn())
  expect(apres[apres.indexOf('+ 8 lignes de plus') + 1]).toBe('· c.3  Ticket 3')
  expect(await bas(m, cle)).toBe(b.cle('c.3'))
  await m.ui.unmount()
})

test('3uv.43 critère 7 (cas B) : an inner counting line whose lines cross the fold shows them all, and the fold counts the same lines', async ($, on) => {
  // CHANTIER 36 lines with « + 3 prêts » after c.7 (row 12), AGENTS 8: 14 rows to CHANTIER (to
  // c.8), then its count of the 22 others.
  const b = tableau(30, 6, 3, 0, { prets: { apres: 7, n: 3 } })
  const m = await monter($ as never, on as never, b.t)
  let l = liste(await m.ui.drawn())
  expect(l[12]).toBe('  + 3 prêts')
  expect(l[14]).toBe('+ 22 lignes de plus')
  let cle = b.cle('c.7')
  await m.viser(cle)
  cle = await bas(m, cle)
  expect(cle).toBe(b.compte('  + 3 prêts'))
  // r.1, r.2 and r.3 come right below it; c.8 and the count follow, the count unchanged.
  l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l.slice(0, 18)).toEqual([
    ...b.chantier.slice(0, 13),
    '  · r.1  Prêt 1',
    '  · r.2  Prêt 2',
    '  · r.3  Prêt 3',
    '· c.8  Ticket 8',
    '+ 22 lignes de plus',
  ])
  expect(l.slice(18)).toEqual(b.agents.slice(0, 5))
  for (const t of ['r.1', 'r.2', 'r.3']) {
    cle = await bas(m, cle)
    expect(cle.startsWith(`${t}:`)).toBe(true)
  }
  cle = await bas(m, cle)
  expect(cle).toBe(b.cle('c.8'))
  cle = await bas(m, cle)
  const apres = liste(await m.ui.drawn())
  expect(apres[apres.indexOf('+ 22 lignes de plus') + 1]).toBe('· c.9  Ticket 9')
  expect(await bas(m, cle)).toBe(b.cle('c.9'))
  await m.ui.unmount()
})

test('3uv.43 critères 7 et 9 : every kind of inner counting line — the arrow runs through « + 2 prêts » and its lines, unfolds CHANTIER, then runs through all its lines and theirs', async ($, on) => {
  const b = tableau(8, 6, 3, 0, { prets: { apres: 2, n: 2 }, plus: 4, autres: 2 })
  const m = await monter($ as never, on as never, b.t, { bodyRows: 24 })
  expect(liste(await m.ui.drawn())[8]).toBe('+ 8 lignes de plus')
  let cle = b.cle('c.2')
  await m.viser(cle)
  cle = await bas(m, cle)
  expect(cle).toBe(b.compte('  + 2 prêts'))
  // « + 2 prêts » shows its lines; the arrow reaches each before CHANTIER's counting line.
  cle = await bas(m, cle)
  expect(cle.startsWith('r.1:')).toBe(true)
  cle = await bas(m, cle)
  expect(cle.startsWith('r.2:')).toBe(true)
  // The next Button drawn is CHANTIER's counting line: the ring on it unfolds CHANTIER.
  cle = await bas(m, cle)
  expect(liste(await m.ui.drawn())).toContain('· c.3  Ticket 3')
  // The arrow then runs through CHANTIER's lines to its last one, CHANTIER staying unfolded: each
  // inner counting line unfolds its own lines on the way.
  const vus: string[] = []
  for (let i = 0; i < 30 && cle !== b.compte('+ 2 autres chantiers'); i++) {
    cle = await bas(m, cle)
    vus.push(cle)
  }
  expect(vus.slice(0, 6)).toEqual(['c.3', 'c.4', 'c.5', 'c.6', 'c.7', 'c.8'].map(b.cle))
  expect(vus).toContain(b.compte('  … 4 lignes de plus'))
  for (const t of ['x.1', 'x.2', 'x.3', 'x.4']) expect(vus.some(k => k.startsWith(`${t}:`))).toBe(true)
  expect(vus).toContain(b.compte('+ 2 autres chantiers'))
  // On « + 2 autres chantiers », its epics show below it.
  const l = liste(await m.ui.drawn())
  expect(l[l.indexOf('+ 2 autres chantiers') + 1]).toBe('ch-2  Autre 1')
  await m.ui.unmount()
})

// From the start view of tableau(30, 6, 3), the ring on CHANTIER's counting line, then the arrow
// down to c.<jusqu'à>. Returns the ring's key.
async function deplier(m: Monte, b: ReturnType<typeof tableau>, jusqua: number): Promise<string> {
  let cle = (await cleDuCompte(m, b)) as string
  expect(cle).toBeDefined()
  await m.viser(cle)
  while (cle !== b.cle(`c.${jusqua}`)) cle = await bas(m, cle)
  return cle
}

test('3uv.43 critère 9 : CHANTIER unfolded by the keyboard stays unfolded while the ring runs through its lines; the window follows the ring and AGENTS goes out', async ($, on) => {
  // Unfolded: CHANTIER 14 lines, its count, 21 lines; AGENTS from list index 36.
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await deplier(m, b, 20)
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  // One window over CHANTIER, AGENTS and FAITS: it follows the ring (c.20 with one line below).
  expect(l.slice(-2)).toEqual(['· c.20  Ticket 20', '· c.21  Ticket 21'])
  expect(l).toContain('+ 21 lignes de plus')
  expect(l).toContain('· c.10  Ticket 10')
  for (const a of b.agents.filter(x => x.trim())) expect(l).not.toContain(a)
  await m.ui.unmount()
})

test('3uv.43 critère 9 : another place — the ring stopping on c.12 keeps CHANTIER unfolded and the window on it', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await deplier(m, b, 12)
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  const ici = l.indexOf('+ 21 lignes de plus')
  expect(l.slice(ici, ici + 4)).toEqual(['+ 21 lignes de plus', '· c.10  Ticket 10', '· c.11  Ticket 11', '· c.12  Ticket 12'])
  expect(l[l.indexOf('· c.12  Ticket 12') + 1]).toBe('· c.13  Ticket 13')
  await m.ui.unmount()
})

test('3uv.43 critère 9 : CHANTIER unfolded, the wheel brings AGENTS back whole, CHANTIER staying unfolded', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await deplier(m, b, 20)
  await m.defiler(20)
  let arbre = await m.ui.drawn()
  let l = liste(arbre)
  expect(l).toHaveLength(23)
  for (const a of b.agents) expect(l).toContain(a)
  // CHANTIER is still unfolded: its last lines show above AGENTS, not its count.
  expect(l[l.indexOf(b.agents[1] as string) - 2]).toBe('· c.30  Ticket 30')
  expect(dessous(arbre).join('\n')).toContain('c.20 — Titre de c.20')
  // The wheel back up finds the ring's line where it was, still unfolded.
  await m.defiler(-20)
  arbre = await m.ui.drawn()
  l = liste(arbre)
  expect(l).toContain('· c.20  Ticket 20')
  expect(l).toContain('+ 21 lignes de plus')
  await m.ui.unmount()
})

test('3uv.43 critère 9 : the ring leaving CHANTIER for an AGENTS line folds CHANTIER back, AGENTS whole', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await deplier(m, b, 11)
  await m.viser(b.cle('a.1'))
  const l = liste(await m.ui.drawn())
  expect(l).toHaveLength(23)
  expect(l).toContain('+ 21 lignes de plus')
  expect(l).not.toContain('· c.11  Ticket 11')
  for (const a of b.agents) expect(l).toContain(a)
  await m.ui.unmount()
})

// ── Critère 7 : the count agrees with its number ───────────────────────────────────────────────

// Arbitrage du chef de chantier (accord, 09:04): « + 1 ligne de plus », « + N lignes de plus » for
// N > 1. Folded by the rows, CHANTIER's count is at least 2; a count of 1 comes when CHANTIER,
// unfolded from its board line, is measured again shorter, its last line on the unfolded one.

// The person's `/grillhouse`, which measures the board again: `scripts/tableau.mjs` now gives `t`.
async function remesurer($: never, m: Monte, t: object) {
  m.changer(t)
  await ($ as { command: { run: (a: object) => Promise<unknown> } }).command.run({
    command: 'grillhouse',
    args: '',
    presentation: { isFullscreen: true, columns: 200 },
  })
  await new Promise(r => setTimeout(r, 50))
}

test('3uv.43 critère 7 (accord) : CHANTIER unfolded, then measured again with one line from the unfold on, counts « + 1 ligne de plus »', async ($, on) => {
  // tableau(30, 6, 3): 14 rows to CHANTIER, its count folds from board index 14 (c.10).
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  const cle = (await cleDuCompte(m, b)) as string
  expect(cle).toBeDefined()
  await m.viser(cle)
  expect(liste(await m.ui.drawn())).toContain('+ 21 lignes de plus')
  // Measured again: CHANTIER 15 lines, c.10 its last at board index 14; AGENTS 14 lines.
  const c = tableau(10, 12, 3)
  await remesurer($ as never, m, c.t)
  const l = liste(await m.ui.drawn())
  expect(l).not.toContain('+ 1 lignes de plus')
  const ici = l.indexOf('+ 1 ligne de plus')
  expect(ici).toBeGreaterThanOrEqual(0)
  expect(l[ici + 1]).toBe('· c.10  Ticket 10')
  await m.ui.unmount()
})

test('3uv.43 critère 7 (accord) : CHANTIER unfolded, then measured again with two lines from the unfold on, keeps « + 2 lignes de plus »', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  const cle = (await cleDuCompte(m, b)) as string
  expect(cle).toBeDefined()
  await m.viser(cle)
  // Measured again: CHANTIER 16 lines, c.10 and c.11 from board index 14; AGENTS 14 lines.
  const c = tableau(11, 12, 3)
  await remesurer($ as never, m, c.t)
  const l = liste(await m.ui.drawn())
  const ici = l.indexOf('+ 2 lignes de plus')
  expect(ici).toBeGreaterThanOrEqual(0)
  expect(l.slice(ici + 1, ici + 3)).toEqual(['· c.10  Ticket 10', '· c.11  Ticket 11'])
  await m.ui.unmount()
})
