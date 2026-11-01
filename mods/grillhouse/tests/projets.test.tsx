import { expect, mock, test } from 'claude-code/testing'

import type { Tableau } from '../types'
import { PKG } from './projet'

// grillhouse-erp.1: a session that coordinates several projects keeps the usual board. The list of
// projects lives in the session (`/grillhouse ajouter <chemin>`, `/grillhouse retirer <chemin>`,
// kept for the session's folder in the mod's store); the frame's command measures their board as
// one, in the session's folder (`grillhouse tableau <dossier>…`), and the pane draws its lines as
// it draws one project's: it reads no text of the board. These tests write no file, so they hold
// no trial folder.

const fiche = (numero: string, titre: string, statut = 'in_progress') => ({
  numero,
  titre,
  composant: 'x',
  statut,
  travail: 0,
  jetons: 0,
  resume: `Résumé de ${titre}`,
})
// The width of the board's lines (LARGEUR of scripts/tableau.mjs), the pane's columns.
const LARGEUR = 52
const plein = (gauche: string, droite = '') =>
  droite ? `${gauche.padEnd(LARGEUR - droite.length - 1)} ${droite}` : gauche

// One project's board, as `grillhouse tableau` gives it in its folder: its lines are as wide as
// the pane.
const seul = (nom: string, prefixe: string): Tableau => ({
  lignes: [
    { texte: nom.toUpperCase(), ton: 'titre', section: 'agents' },
    { texte: 'AGENTS  ▶ en cours · en attente', ton: 'titre', section: 'agents' },
    { texte: '▾ 3 · Code · développeur', ton: 'titre', section: 'agents' },
    {
      texte: plein('▶ k2  le pont MIDI', '8 min · 3 k'),
      ton: 'actif',
      ticket: `${prefixe}-k2`,
      section: 'agents',
    },
    { texte: '', section: 'chantier' },
    {
      texte: plein('CHANTIER a — Le pont'),
      ton: 'titre',
      ticket: `${prefixe}-a`,
      chantier: true,
      section: 'chantier',
    },
    {
      texte: plein('   k9  un ticket du chantier', '2/3'),
      ticket: `${prefixe}-k9`,
      section: 'chantier',
    },
    { texte: '', section: 'chantier' },
    { texte: 'CHANTIERS', ton: 'titre', section: 'chantier' },
    {
      texte: plein('b  Un autre chantier', '0/4'),
      ticket: `${prefixe}-b`,
      chantier: true,
      section: 'chantier',
    },
  ],
  vueEtats: [],
  fiches: {
    [`${prefixe}-k2`]: fiche('k2', 'le pont MIDI'),
    [`${prefixe}-a`]: fiche('a', 'Le pont'),
    [`${prefixe}-k9`]: fiche('k9', 'un ticket du chantier', 'open'),
    [`${prefixe}-b`]: fiche('b', 'Un autre chantier', 'open'),
  },
  dernier: `${prefixe}-k2`,
})

const DOSSIERS = { sh: '/m/synthhub', osd: '/m/open-synth-descriptors' }

// The board of the session at /p with synthhub beside it, as `grillhouse tableau /m/synthhub`
// gives it in /p: the usual board, each line of a ticket, a chantier or an alert prefixed by its
// project, each line as wide as the pane, and the folder of each ticket's project.
const ENSEMBLE: Tableau = {
  lignes: [
    { texte: 'P + SH', ton: 'titre', section: 'agents' },
    { texte: '[P]   ▶ 1 en cours · 0 en attente · 4 faits', section: 'agents' },
    { texte: '[SH]  ▶ 1 en cours · 3 en attente · 112 faits', section: 'agents' },
    {
      texte: plein('⚠ [SH] Nuit rouge depuis le 01/11', 'SH-zq7'),
      ton: 'alerte',
      section: 'agents',
    },
    { texte: '', section: 'agents' },
    { texte: 'AGENTS  ▶ en cours · en attente', ton: 'titre', section: 'agents' },
    { texte: '▾ 1 · Plan · explorateur ⇄ questionneur', ton: 'titre', section: 'agents' },
    {
      texte: plein('[SH]  SH-13y.6  Le paquet interface', '▶ 12 min · 40 k'),
      ton: 'actif',
      ticket: 'SH-13y.6',
      section: 'agents',
    },
    { texte: '▾ 3 · Code · développeur', ton: 'titre', section: 'agents' },
    {
      texte: plein('[P]   P-k2      le pont MIDI', '▶ 8 min · 3 k'),
      ton: 'actif',
      ticket: 'P-k2',
      section: 'agents',
    },
    { texte: '', section: 'chantier' },
    {
      texte: 'CHANTIER [SH] a — Le pont',
      ton: 'titre',
      ticket: 'SH-a',
      chantier: true,
      section: 'chantier',
    },
    {
      texte: plein('   [SH] k9  un ticket du chantier', '2/3'),
      ticket: 'SH-k9',
      section: 'chantier',
    },
  ],
  vueEtats: [],
  fiches: {
    'SH-13y.6': fiche('13y.6', 'le paquet interface'),
    'P-k2': fiche('k2', 'le pont MIDI'),
    'SH-a': fiche('a', 'Le pont'),
    'SH-k9': fiche('k9', 'un ticket du chantier', 'open'),
  },
  dernier: 'SH-13y.6',
  dossiers: { 'SH-13y.6': DOSSIERS.sh, 'SH-a': DOSSIERS.sh, 'SH-k9': DOSSIERS.sh, 'P-k2': '/p' },
}

// The session at /p and the projects its store keeps; `appels` receives each command the mod runs,
// with its folder; `ecrits` each value it stores. `grillhouse tableau` answers in each folder its
// project's board, and in /p with other folders the board of them all.
type Banc = Parameters<Parameters<typeof test>[1]>
async function seance(
  $: Banc[0],
  on: Banc[1],
  o: { garde?: string[]; paquets?: Record<string, string | null>; ensemble?: Tableau | null } = {},
) {
  const appels: { argv: string[]; cwd?: string }[] = []
  const ecrits: { key: string; value: unknown }[] = []
  const seuls: Record<string, Tableau> = {
    '/p': seul('p', 'P'),
    [DOSSIERS.sh]: seul('synthhub', 'SH'),
    [DOSSIERS.osd]: seul('open-synth-descriptors', 'OSD'),
  }
  const paquets: Record<string, string | null> = { '/p': PKG, ...o.paquets }
  on('process.run', ($, e) => {
    const cwd = e.init?.cwd
    appels.push({ argv: [...e.argv], cwd })
    if (e.argv[1] === 'tableau') {
      const t = e.argv.length > 2 ? o.ensemble : seuls[cwd ?? '']
      return {
        value: t
          ? { exitCode: 0, stdout: JSON.stringify(t), stderr: '' }
          : { exitCode: 1, stdout: '', stderr: `tableau illisible à ${cwd}` },
      }
    }
    if (e.argv[0] === 'bd' && e.argv[1] === 'show') {
      return {
        value: {
          exitCode: 0,
          stdout: JSON.stringify([{ description: `Le texte entier, lu à ${cwd}` }]),
          stderr: '',
        },
      }
    }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('fs.exists', ($, e) => ({
    value: (paquets[e.path.replace(/\/package\.json$/, '')] ?? null) !== null,
  }))
  on('fs.read', ($, e) => ({ value: paquets[e.path.replace(/\/package\.json$/, '')] ?? '' }))
  on('store.get', ($, e) => ({ value: e.key === 'projets:/p' ? o.garde : undefined }))
  on('store.set', ($, e) => {
    ecrits.push({ key: e.key, value: e.value })
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  mock.clock(on)
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await new Promise(r => setTimeout(r, 50))
  const grillhouse = (args: string) =>
    $.command.run({
      command: 'grillhouse',
      args,
      presentation: { isFullscreen: true, columns: 200 },
    } as never)
  const monter = () =>
    $.ui.mount({
      plugin: 'grillhouse',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'grillhouse',
      props: {
        title: 't',
        isFocused: true,
        bodyColumns: LARGEUR,
        placement: 'dock',
        scroll: { bodyRows: 30 } as never,
        view: {} as never,
      },
    })
  const tableaux = () => appels.filter(a => a.argv[1] === 'tableau')
  return { appels, ecrits, grillhouse, monter, tableaux }
}

// The texts the pane draws, one per Text element, in their order: each a row of the pane.
type Noeud = { type?: string; props?: { children?: unknown }; children?: unknown }
const enTexte = (x: unknown): string =>
  typeof x === 'string' || typeof x === 'number'
    ? String(x)
    : Array.isArray(x)
      ? x.map(enTexte).join('')
      : x && typeof x === 'object'
        ? enTexte((x as Noeud).children ?? (x as Noeud).props?.children)
        : ''
function rangees(x: unknown, out: string[] = []): string[] {
  if (Array.isArray(x)) {
    for (const y of x) rangees(y, out)
  } else if (x && typeof x === 'object') {
    const n = x as Noeud
    if (n.type === 'Text') out.push(enTexte(n))
    else rangees(n.children ?? n.props?.children, out)
  }
  return out
}

// grillhouse-erp critère 1, kept: a command adds a project by its path, another removes it.
test('/grillhouse ajouter adds a Grillhouse project, kept for the folder, and the board of both is measured in the session', async ($, on) => {
  const { ecrits, grillhouse, tableaux } = await seance($, on, {
    paquets: { [DOSSIERS.sh]: PKG },
    ensemble: ENSEMBLE,
  })
  const r = await grillhouse(`ajouter ${DOSSIERS.sh}`)
  expect(JSON.stringify(r)).toContain(DOSSIERS.sh)
  expect(ecrits).toContainEqual({ key: 'projets:/p', value: [DOSSIERS.sh] })
  await new Promise(r => setTimeout(r, 50))
  expect(tableaux().at(-1)).toEqual({
    argv: ['node_modules/.bin/grillhouse', 'tableau', DOSSIERS.sh],
    cwd: '/p',
  })
})

test('/grillhouse retirer removes the project from the list kept for the folder', async ($, on) => {
  const { ecrits, grillhouse } = await seance($, on, {
    garde: [DOSSIERS.sh, DOSSIERS.osd],
    paquets: { [DOSSIERS.sh]: PKG, [DOSSIERS.osd]: PKG },
    ensemble: ENSEMBLE,
  })
  const r = await grillhouse(`retirer ${DOSSIERS.sh}`)
  expect(JSON.stringify(r)).toContain(DOSSIERS.sh)
  expect(ecrits).toContainEqual({ key: 'projets:/p', value: [DOSSIERS.osd] })
  await new Promise(r => setTimeout(r, 50))
})

test('a path that is not a Grillhouse project is refused by its name, nothing kept', async ($, on) => {
  const { ecrits, grillhouse } = await seance($, on, {
    paquets: { '/m/vide': null, '/m/autre': '{"devDependencies":{"vitest":"*"}}' },
  })
  for (const chemin of ['/m/vide', '/m/autre']) {
    const r = JSON.stringify(await grillhouse(`ajouter ${chemin}`))
    expect(r).toContain('Refusé')
    expect(r).toContain(chemin)
    expect(r).toContain("n'est pas un projet Grillhouse")
  }
  expect(ecrits).toEqual([])
})

test('the list kept for the folder comes back at the next session: one board of them all, measured in the session', async ($, on) => {
  const { tableaux } = await seance($, on, {
    garde: [DOSSIERS.sh, DOSSIERS.osd],
    paquets: { [DOSSIERS.sh]: PKG, [DOSSIERS.osd]: PKG },
    ensemble: ENSEMBLE,
  })
  expect(tableaux()).toEqual([
    { argv: ['node_modules/.bin/grillhouse', 'tableau', DOSSIERS.sh, DOSSIERS.osd], cwd: '/p' },
  ])
})

// grillhouse-erp.1 critères 1 et 2: the pane draws the usual board of several projects as it
// draws one project's, every line of it, in its order, and nothing else above the rule.
test('critères 1 et 2 : the pane draws the board of several projects line by line, as the board gives it', async ($, on) => {
  const { monter } = await seance($, on, {
    garde: [DOSSIERS.sh],
    paquets: { [DOSSIERS.sh]: PKG },
    ensemble: ENSEMBLE,
  })
  const ui = await monter()
  const vu = rangees(await ui.drawn())
  const n = ENSEMBLE.lignes.length
  expect(vu.slice(0, n)).toEqual(ENSEMBLE.lignes.map(l => l.texte || ' '))
  // The rule follows the board's lines: no footer between them.
  expect(vu[n]).toMatch(/^── /)
  // Each ticket's line is a button, the ring chooses it as on one board.
  const cles = (await ui.findAll({ type: 'Button' })).map(b => b.key)
  expect(cles).toEqual(expect.arrayContaining(['SH-13y.6:0', 'P-k2:0', 'SH-a:0', 'SH-k9:0']))
  await ui.unmount()
})

// grillhouse-erp.1 critère 3: the card's whole text and the chantier's switch run bd in the folder
// the board names for the ticket's project.
test("critère 3 : g reads the ticket's whole text in its project, h switches a chantier in its project", async ($, on) => {
  const { appels, monter } = await seance($, on, {
    garde: [DOSSIERS.sh],
    paquets: { [DOSSIERS.sh]: PKG },
    ensemble: ENSEMBLE,
  })
  const ui = await monter()
  const cles = (await ui.findAll({ type: 'Button' })).map(b => b.key)
  const ticket = cles.find(k => k.startsWith('SH-13y.6:'))
  const chantier = cles.find(k => k.startsWith('SH-a:'))
  expect(ticket).toBeDefined()
  expect(chantier).toBeDefined()
  await $.ui.press({ plugin: 'grillhouse', key: ticket as string })
  await $.ui.press({ plugin: 'grillhouse', key: 'g' })
  await new Promise(r => setTimeout(r, 50))
  expect(appels).toContainEqual({ argv: ['bd', 'show', 'SH-13y.6', '--json'], cwd: DOSSIERS.sh })
  expect(JSON.stringify(await ui.drawn())).toContain(`Le texte entier, lu à ${DOSSIERS.sh}`)
  await $.ui.press({ plugin: 'grillhouse', key: 'g' })
  await $.ui.press({ plugin: 'grillhouse', key: chantier as string })
  await $.ui.press({ plugin: 'grillhouse', key: 'h' })
  await new Promise(r => setTimeout(r, 50))
  expect(appels).toContainEqual({
    argv: ['bd', 'update', 'SH-a', '--status', 'open'],
    cwd: DOSSIERS.sh,
  })
  // A ticket of the session's project runs bd in the session's folder.
  await $.ui.press({ plugin: 'grillhouse', key: cles.find(k => k.startsWith('P-k2:')) as string })
  await $.ui.press({ plugin: 'grillhouse', key: 'g' })
  await new Promise(r => setTimeout(r, 50))
  expect(appels).toContainEqual({ argv: ['bd', 'show', 'P-k2', '--json'], cwd: '/p' })
  await ui.unmount()
})

// grillhouse-erp.1 critère 5: with the session's project alone, the board is measured as in 0.28.0,
// and the pane draws its lines as they are.
test("critère 5 : with the session's project alone, the pane draws its board as it is", async ($, on) => {
  const { monter, tableaux } = await seance($, on)
  expect(tableaux()).toEqual([{ argv: ['node_modules/.bin/grillhouse', 'tableau'], cwd: '/p' }])
  const ui = await monter()
  const lignes = seul('p', 'P').lignes
  expect(rangees(await ui.drawn()).slice(0, lignes.length + 1)).toEqual([
    ...lignes.map(l => l.texte || ' '),
    expect.stringMatching(/^── /),
  ])
  await ui.unmount()
})

// grillhouse-erp.1 critère 7: since 0.28.1 the pane was shifted left, a blank band on its right:
// its lines were wider than the pane. Every row the pane draws above the rule holds in its
// columns, with one project as in 0.28.0 and with several, and a line with a right part fills it.
for (const cas of ['seul', 'plusieurs'] as const) {
  test(`critère 7 : every row of the board holds in the pane's columns, a ticket's line fills them (${cas})`, async ($, on) => {
    const plusieurs = cas === 'plusieurs'
    const { monter } = await seance(
      $,
      on,
      plusieurs
        ? {
            garde: [DOSSIERS.sh, DOSSIERS.osd],
            paquets: { [DOSSIERS.sh]: PKG, [DOSSIERS.osd]: PKG },
            ensemble: ENSEMBLE,
          }
        : {},
    )
    const ui = await monter()
    const vu = rangees(await ui.drawn())
    const liste = vu.slice(
      0,
      vu.findIndex(x => x.startsWith('── ')),
    )
    expect(liste.filter(x => x.length > LARGEUR)).toEqual([])
    const tickets = (plusieurs ? ENSEMBLE : seul('p', 'P')).lignes.filter(l => l.ticket && l.section === 'agents')
    for (const l of tickets) expect(liste).toContain(l.texte)
    expect(tickets.every(l => l.texte.length === LARGEUR)).toBe(true)
    await ui.unmount()
  })
}
