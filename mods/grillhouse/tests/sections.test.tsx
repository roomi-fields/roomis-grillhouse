import { expect, mock, test } from 'claude-code/testing'

import { enLignes, memoire } from '../hooks/register'
import { projetGrillhouse } from './projet'

// The pane lists every line of the board, in the board's order — the head, AGENTS, CHANTIER, then
// FAITS AUJOURD'HUI — and folds none to save rows: its window runs over them all, moved by the
// wheel (ui.scroll, by `e.by` rows, focused or not) and following the ring the arrows move. The
// card keeps its place below the list.
//
// The pane gives the list `bodyRows - FICHE - 1` rows (FICHE = 6): 23 rows for 30 body rows.
// These tests write no file, so they hold no trial folder.

type L = { texte: string; ton?: string; ticket?: string; chantier?: boolean; section: string }

// A board laid out as `grillhouse tableau` lays it: the head and AGENTS with `m` agents' lines
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
        { numero: l.ticket, titre: `Titre de ${l.ticket}`, composant: 'x', statut: 'in_progress', travail: 0, jetons: 0, resume: 'R' },
      ]),
  )
  // The pane draws an empty line as one space.
  const vu = (ls: L[]) => ls.map(l => l.texte || ' ')
  // The key of a ticket line's Button: `<ticket>:<n>`, its n-th line on the board (here its only one).
  const cle = (ticket: string) => `${ticket}:0`
  // The states' view: a state, its meaning, its tickets one per line.
  const vueEtats: L[] = [
    { texte: 'EN ATTENTE — ton go, prêt à partir', ton: 'titre', section: 'etats' },
    { texte: '  w.1  Attente 1', ticket: 'w.1', section: 'etats' },
    { texte: '  w.2  Attente 2', ticket: 'w.2', section: 'etats' },
  ]
  for (const l of vueEtats.filter(l => l.ticket)) {
    fiches[l.ticket as string] = { numero: l.ticket, titre: `Titre de ${l.ticket}`, composant: 'x', statut: 'open', travail: 0, jetons: 0, resume: 'R' }
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
  // How many scrolls the pane let through to the engine's own window, and where it put it.
  passes: () => number
  decalages: number[]
  appels: string[][]
  // The board `grillhouse tableau` gives from now on, at its next measure.
  changer: (t: object) => void
  // The pane's next periodic measure of the board (PERIODE, 30 s, on the mocked clock).
  mesurer: () => Promise<void>
  // How many times the mod has read its state (`etat`) so far.
  lectures: () => number
  // From now on the mod reads the board retouched (« ✎ » after each line's text and card's title),
  // its revision unchanged: what the pane shows retouched it computed again.
  retoucher: () => void
  // The pane drawn again at another width.
  largeur: (colonnes: number) => Promise<void>
}

async function monter(
  $: never,
  on: never,
  t: object,
  o: { bodyRows?: number; isFocused?: boolean; texte?: (id: string) => string; offset?: number } = {},
): Promise<Monte> {
  const bodyRows = o.bodyRows ?? 30
  const h = on as (n: string, f: unknown) => void
  const s = $ as {
    session: { start: (a: object) => Promise<unknown> }
    ui: { mount: (a: object) => Promise<never>; scroll: (a: object) => Promise<{ deny?: string }>; focus: (a: object) => Promise<unknown> }
  }
  const appels: string[][] = []
  let passes = 0
  const decalages: number[] = []
  let courant = t
  h('process.run', (_: unknown, e: { argv: string[] }) => {
    appels.push(e.argv)
    // The board from `grillhouse tableau`; a ticket's whole text from Beads (`bd show <id> --json`).
    const stdout =
      e.argv[1] === 'tableau'
        ? JSON.stringify(courant)
        : e.argv[0] === 'bd' && e.argv[1] === 'show'
          ? JSON.stringify([{ id: e.argv[2], description: o.texte?.(e.argv[2] as string) ?? `Le texte entier de ${e.argv[2]}.` }])
          : ''
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  h('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  projetGrillhouse(h)
  h('command.register', () => ({ value: undefined }))
  const horloge = mock.clock(h as never)
  let lectures = 0
  let retouche = false
  // The board as the mod reads it once retouched: each line's text and each card's title end in
  // « ✎ », its revision unchanged, so only a computation made again from the state shows it.
  type T = { lignes: { texte: string }[]; fiches: Record<string, { titre: string }> }
  const retoucher = (tableau: T): T => ({
    ...tableau,
    lignes: tableau.lignes.map(l => ({ ...l, texte: `${l.texte} ✎` })),
    fiches: Object.fromEntries(Object.entries(tableau.fiches).map(([id, f]) => [id, { ...f, titre: `${f.titre} ✎` }])),
  })
  h('state.get', async (_: unknown, e: { plugin: string; key: string }, next: (e: unknown) => unknown) => {
    if (e.plugin !== 'grillhouse' || e.key !== 'etat') return next(e)
    lectures++
    // The answer of an op is `{ value }`, a read `{ value, version }`.
    const r = (await next(e)) as { value?: { value?: { tableau?: T | null } } }
    const lu = r.value
    const tableau = lu?.value?.tableau
    return retouche && lu && tableau ? { ...r, value: { ...lu, value: { ...lu.value, tableau: retoucher(tableau) } } } : r
  })
  h('ui.scroll', (_: unknown, e: { offset: number }) => {
    passes++
    decalages.push(e.offset)
    return {}
  })
  // The focus the test moves carries the pane's plugin, another than the test's: answered for every plugin.
  ;(on as (n: string, m: object, f: unknown) => void)('ui.focus', { plugin: '*' }, () => ({}))
  h('ui.open', () => ({ value: undefined }))
  await s.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  const props = {
    title: 't',
    isFocused: o.isFocused ?? true,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { bodyRows, offset: o.offset ?? 0 } as never,
    view: {} as never,
  }
  const ui = (await s.ui.mount({
    plugin: 'grillhouse',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'grillhouse',
    props,
  })) as Monte['ui'] & { redraw: (p: object) => Promise<void> }
  const largeur = (colonnes: number) => ui.redraw({ ...props, bodyColumns: colonnes })
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
  const mesurer = async () => {
    await horloge.advance(30_000)
    await new Promise(r => setTimeout(r, 50))
  }
  return { ui, defiler, viser, passes: () => passes, decalages, appels, changer, mesurer, lectures: () => lectures,
    retoucher: () => {
      retouche = true
    },
    largeur,
  }
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
  // The rule and the card shown, before the hidden cards the pointer brings up.
  const carte = (arbre: unknown) => {
    const d = dessous(arbre)
    return d.slice(0, d.findIndex(x => x === ' '.repeat(50)))
  }
  const avant = carte(await m.ui.drawn())
  expect(avant.join('\n')).toContain('a.1 — Titre de a.1')
  await m.defiler(1)
  const apres = await m.ui.drawn()
  expect(liste(apres)).toEqual(b.tout.slice(1, 24))
  expect(carte(apres)).toEqual(avant)
  await m.ui.unmount()
})

// A ticket's whole text of 80 lines, « ligne 1 » to « ligne 80 ».
const long = () => Array.from({ length: 80 }, (_, i) => `ligne ${i + 1}`).join('\n')
// The text rows the whole card shows: the « ligne <n> » rows drawn.
const rangees = (arbre: unknown) => textes(arbre).filter(x => /^ligne \d+$/.test(x))

test('g on a shown line fills the pane with the card, g again brings it back and leaves the list where it was', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  const press = ($ as { ui: { press: (a: object) => Promise<unknown> } }).ui.press
  await m.defiler(1)
  const avant = liste(await m.ui.drawn())
  await press({ plugin: 'grillhouse', key: b.cle('a.2') })
  await press({ plugin: 'grillhouse', key: 'g' })
  expect(textes(await m.ui.drawn()).join('\n')).toContain('Le texte entier de a.2.')
  await press({ plugin: 'grillhouse', key: 'g' })
  const apres = await m.ui.drawn()
  expect(textes(apres).join('\n')).not.toContain('Le texte entier de a.2.')
  expect(liste(apres)).toEqual(avant)
  await m.ui.unmount()
})

test('the whole card scrolls its text: an arrow down or up a row, a page key a page, the wheel its rows', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t, { texte: long })
  const press = ($ as { ui: { press: (a: object) => Promise<unknown> } }).ui.press
  await press({ plugin: 'grillhouse', key: b.cle('a.2') })
  await press({ plugin: 'grillhouse', key: 'g' })
  // 30 rows: a spare row, the rule, the title, the state, then 26 rows of text.
  expect(rangees(await m.ui.drawn())).toEqual(Array.from({ length: 26 }, (_, i) => `ligne ${i + 1}`))
  // An arrow down: the scroll keys, one row.
  await m.defiler(1, false)
  expect(rangees(await m.ui.drawn())[0]).toBe('ligne 2')
  // A page down: the page key, bodyRows rows.
  await m.defiler(30, false)
  expect(rangees(await m.ui.drawn())[0]).toBe('ligne 32')
  // An arrow up.
  await m.defiler(-1, false)
  expect(rangees(await m.ui.drawn())[0]).toBe('ligne 31')
  // The wheel, three rows up.
  await m.defiler(-3)
  expect(rangees(await m.ui.drawn())[0]).toBe('ligne 28')
  // The end holds the last row in sight, the top the first.
  await m.defiler(500, false)
  const fin = rangees(await m.ui.drawn())
  expect(fin.at(-1)).toBe('ligne 80')
  expect(fin).toHaveLength(26)
  await m.defiler(-500, false)
  expect(rangees(await m.ui.drawn())[0]).toBe('ligne 1')
  // The card stays whole all along, and the rule says where the text stands.
  expect(textes(await m.ui.drawn()).join('')).toContain('g : retour · 1-26/80')
  await m.ui.unmount()
})

for (const offset of [0, 1]) {
  test(`the whole card draws the same rows with the engine window on its row ${offset}, every text row in sight`, async ($, on) => {
    const b = tableau(30, 6, 3)
    const m = await monter($ as never, on as never, b.t, { texte: long, offset })
    const press = ($ as { ui: { press: (a: object) => Promise<unknown> } }).ui.press
    await press({ plugin: 'grillhouse', key: b.cle('a.2') })
    await press({ plugin: 'grillhouse', key: 'g' })
    const arbre = await m.ui.drawn()
    // A spare row above the rule at either row of the window, so no row moves when the engine
    // scrolls; then the rule, the title, the state, and 26 text rows, all within the window.
    expect(textes(arbre)[0]).toBe(' ')
    expect(rangees(arbre)).toEqual(Array.from({ length: 26 }, (_, i) => `ligne ${i + 1}`))
    await m.ui.unmount()
  })
}

test('the whole card holds the engine window on its second row, so the arrows scroll both ways', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t, { texte: long })
  const press = ($ as { ui: { press: (a: object) => Promise<unknown> } }).ui.press
  await press({ plugin: 'grillhouse', key: b.cle('a.2') })
  await press({ plugin: 'grillhouse', key: 'g' })
  await m.defiler(1, false)
  await m.defiler(-1, false)
  expect(m.decalages).toEqual([1, 1])
  await m.ui.unmount()
})

test('the rows of a text: wrapped at its spaces, indentation kept, a long word cut, an empty line kept', () => {
  expect(enLignes('un deux trois quatre', 9)).toEqual(['un deux', 'trois', 'quatre'])
  expect(enLignes('  - un deux trois', 10)).toEqual(['  - un', 'deux trois'])
  expect(enLignes('abcdefghijkl', 5)).toEqual(['abcde', 'fghij', 'kl'])
  expect(enLignes('a\n\nb', 5)).toEqual(['a', '', 'b'])
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
  expect(await boutons(m)).toEqual(['w.1:0', 'w.2:0'])
  await press({ plugin: 'grillhouse', key: 'w.2:0' })
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

// ── The wheel and the keyboard on a large board (grillhouse-a0v) ─────────────────────────────

// A board of BPScript's size, as `grillhouse tableau` gave it on 2026-11-01: 87 lines, 761 cards
// (the board's tickets, and those of the states' view and the folded groups).
function grand() {
  const b = tableau(60, 20, 0)
  const fiches: Record<string, object> = { ...b.t.fiches }
  for (let k = 0; Object.keys(fiches).length < 761; k++) {
    fiches[`x.${k}`] = {
      numero: `x.${k}`,
      titre: `Titre de x.${k}`,
      composant: 'x',
      statut: 'open',
      travail: 0,
      jetons: 0,
      resume: 'Un résumé de ticket sur une ligne.',
    }
  }
  return { ...b, t: { ...b.t, fiches } }
}

test('critère 2 : notches received before the next render move nothing on their own, the render moves the window by them all', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await m.ui.drawn()
  const avant = m.lectures()
  for (let i = 0; i < 5; i++) await m.defiler(1)
  // The notches read no state and place no window: the render does, once for them all.
  expect(m.lectures() - avant).toBe(0)
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(5, 28))
  expect(m.lectures() - avant).toBeGreaterThanOrEqual(1)
  await m.ui.unmount()
})

test('critère 4 : notches drawn one by one show the lines they show today, at the edges too', async ($, on) => {
  // 48 lines in 23 rows: the window runs from 0 to 25.
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  const vus: string[][] = []
  for (const by of [-1, -1, 3, 30, -2, 1, -40, 2]) {
    await m.defiler(by)
    vus.push(liste(await m.ui.drawn()))
  }
  expect(vus).toEqual([0, 0, 3, 25, 23, 24, 0, 2].map(p => b.tout.slice(p, p + 23)))
  await m.ui.unmount()
})

test('critère 4 : the same notches in bursts end on the windows the notches one by one end on', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  for (const by of [-1, -1, 3, 30, -2, 1]) await m.defiler(by)
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(24, 47))
  for (const by of [-40, 2]) await m.defiler(by)
  expect(liste(await m.ui.drawn())).toEqual(b.tout.slice(2, 25))
  await m.ui.unmount()
})

test('critère 3 : a value kept from its inputs is computed again only when one of them changes', () => {
  let calculs = 0
  const double = memoire((a: number, b: string) => {
    calculs++
    return { a: a * 2, b }
  })
  const premier = double(1, 'x')
  expect(double(1, 'x')).toBe(premier)
  expect(calculs).toBe(1)
  expect(double(2, 'x')).toEqual({ a: 4, b: 'x' })
  expect(double(2, 'y')).toEqual({ a: 4, b: 'y' })
  expect(calculs).toBe(3)
})

test('critère 3 : the wheel alone computes neither the lines nor the cards again; a new measure or another width does', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t, { isFocused: false })
  // A first round trip of the wheel draws the cards of every line it shows.
  for (const by of [5, -5]) {
    await m.defiler(by)
    await m.ui.drawn()
  }
  const retouche = (arbre: unknown) => textes(arbre).filter(x => x.includes('✎'))
  m.retoucher()
  // The board and the width unchanged, a scroll computes nothing: no line nor card retouched.
  for (const [by, p] of [
    [5, 5],
    [-5, 0],
    [3, 3],
    [-3, 0],
  ] as const) {
    await m.defiler(by)
    const arbre = await m.ui.drawn()
    expect(liste(arbre)).toEqual(b.tout.slice(p, p + 23))
    expect(retouche(arbre)).toEqual([])
  }
  // Another width draws the cards again, not the lines.
  await m.largeur(40)
  let arbre = await m.ui.drawn()
  expect(liste(arbre).filter(x => x.includes('✎'))).toEqual([])
  expect(dessous(arbre).join('\n')).toContain('a.1 — Titre de a.1 ✎')
  // A new measure computes the lines again.
  await m.mesurer()
  arbre = await m.ui.drawn()
  expect(liste(arbre)[0]).toBe('DEMO ✎')
  await m.ui.unmount()
})

test('critère 5 : on a board of BPScript size, each arrow moves the choice one button line in one press, the drawing whole', async ($, on) => {
  const b = grand()
  expect(b.tout).toHaveLength(87)
  const m = await monter($ as never, on as never, b.t)
  let cle = b.cle('a.1')
  await m.viser(cle)
  for (let i = 2; i <= 12; i++) {
    cle = await bas(m, cle)
    expect(cle).toBe(b.cle(`a.${i}`))
    expect(dessous(await m.ui.drawn()).join('\n')).toContain(`a.${i} — Titre de a.${i}`)
  }
  // A tree draws the first 100,000 characters of its texts: the pane's stay below.
  expect(textes(await m.ui.drawn()).join('').length).toBeLessThan(100_000)
  await m.ui.unmount()
})

test('critère 6 : while the keyboard runs the board, a new measure moves neither the window nor the chosen line, nor the card', async ($, on) => {
  const b = tableau(30, 6, 3)
  const m = await monter($ as never, on as never, b.t)
  await m.viser(b.cle('c.20'))
  const avant = liste(await m.ui.drawn())
  const rang = avant.indexOf('· c.20  Ticket 20')
  expect(rang).toBeGreaterThanOrEqual(0)
  // The board gains two agents above, and another ticket moved last.
  const apres = tableau(30, 8, 3)
  m.changer({ ...apres.t, dernier: 'c.5' })
  const mesures = m.appels.filter(a => a[1] === 'tableau').length
  await m.mesurer()
  expect(m.appels.filter(a => a[1] === 'tableau').length).toBeGreaterThan(mesures)
  const arbre = await m.ui.drawn()
  // The window shows the same lines, two lines further down the new board.
  expect(liste(arbre)).toEqual(apres.tout.slice(13, 36))
  expect(liste(arbre)).toEqual(avant)
  expect(liste(arbre).indexOf('· c.20  Ticket 20')).toBe(rang)
  expect(await boutons(m)).toContain(b.cle('c.20'))
  expect(dessous(arbre).join('\n')).toContain('c.20 — Titre de c.20')
  await m.ui.unmount()
})
