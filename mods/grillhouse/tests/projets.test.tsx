import { expect, mock, test } from 'claude-code/testing'

import { fusionner } from '../hooks/register'
import type { Ligne, Tableau } from '../types'
import { PKG } from './projet'

// grillhouse-erp: a session that coordinates several projects shows them in one pane. The owner's
// maquette (2026-11-01), « fusionnés »: one list of tickets sorted by step, each line prefixed by
// its project's label, and a footer that sums up each project.
//
//   3 Code      [osc] osc-bridge-k2 — le pont MIDI
//   1 Plan      [SH]  SH-13y.6 — le paquet interface
//   ? Question  [osc] osc-bridge-k5 — …
//   ─────────────────────────────────────────────
//   osc 2▶ · SH 1▶ · OSD 0
//
// The list of projects lives in the session: `/grillhouse ajouter <chemin>` and
// `/grillhouse retirer <chemin>`, kept for the session's folder in the mod's store. These tests
// write no file, so they hold no trial folder.

const fiche = (numero: string, titre: string, statut = 'in_progress') => ({
  numero,
  titre,
  composant: 'x',
  statut,
  travail: 0,
  jetons: 0,
  resume: `Résumé de ${titre}`,
})

// The board of a project, as `grillhouse tableau` gives it: its head, its tickets in AGENTS under
// their step, its chantier, its counters and its prefix.
const OSC: Tableau = {
  prefixe: 'osc',
  global: { compteurs: { enCours: 2, enAttente: 0 } },
  lignes: [
    { texte: 'OSC-BRIDGE', ton: 'titre', section: 'agents' },
    { texte: 'AGENTS  ▶ en cours · en attente', ton: 'titre', section: 'agents' },
    { texte: '▸ 1 · Plan · explorateur ⇄ questionneur', ton: 'discret', section: 'agents' },
    { texte: '▾ 3 · Code · développeur', ton: 'titre', section: 'agents' },
    {
      texte: '▶ k2  le pont MIDI',
      ton: 'actif',
      ticket: 'osc-bridge-k2',
      section: 'agents',
      etape: { numero: '3', titre: 'Code' },
    },
    { texte: '  ⤷ Question · superviseur', ton: 'titre', section: 'agents' },
    {
      texte: '■ k5  la question',
      ton: 'attention',
      ticket: 'osc-bridge-k5',
      section: 'agents',
      etape: { numero: '3', titre: 'Code' },
      question: 'superviseur',
    },
    { texte: '', section: 'chantier' },
    { texte: 'CHANTIER a — Le pont', ton: 'titre', ticket: 'osc-bridge-a', chantier: true, section: 'chantier' },
    { texte: '   k9  un ticket du chantier', ticket: 'osc-bridge-k9', section: 'chantier' },
  ],
  vueEtats: [],
  fiches: {
    'osc-bridge-k2': fiche('k2', 'le pont MIDI'),
    'osc-bridge-k5': fiche('k5', 'la question'),
    'osc-bridge-a': fiche('a', 'Le pont'),
    'osc-bridge-k9': fiche('k9', 'un ticket du chantier', 'open'),
  },
  dernier: 'osc-bridge-k2',
}
const SH: Tableau = {
  prefixe: 'SH',
  global: { compteurs: { enCours: 1, enAttente: 3 } },
  lignes: [
    { texte: 'SYNTHHUB', ton: 'titre', section: 'agents' },
    { texte: '▾ 1 · Plan · explorateur ⇄ questionneur', ton: 'titre', section: 'agents' },
    {
      texte: '▶ 13y.6  le paquet interface',
      ton: 'actif',
      ticket: 'SH-13y.6',
      section: 'agents',
      etape: { numero: '1', titre: 'Plan' },
    },
  ],
  fiches: { 'SH-13y.6': fiche('13y.6', 'le paquet interface') },
  dernier: 'SH-13y.6',
}
const OSD: Tableau = {
  prefixe: 'OSD',
  global: { compteurs: { enCours: 0, enAttente: 0 } },
  lignes: [{ texte: 'OPEN-SYNTH-DESCRIPTORS', ton: 'titre', section: 'agents' }],
  fiches: {},
}

const DOSSIERS = { osc: '/m/osc-bridge', sh: '/m/synthhub', osd: '/m/open-synth-descriptors' }
const textes = (l: Ligne[]) => l.map(x => x.texte.trimEnd())

// grillhouse-erp critère 2: one list sorted by step, each line prefixed by its project's label.
test('critère 2 : several boards fuse into one list sorted by step, each line prefixed by its project', () => {
  const t = fusionner([
    { dossier: DOSSIERS.osc, tableau: OSC, erreur: null },
    { dossier: DOSSIERS.sh, tableau: SH, erreur: null },
    { dossier: DOSSIERS.osd, tableau: OSD, erreur: null },
  ])
  expect(textes(t.lignes).slice(0, 3)).toEqual([
    '3 Code        [osc] osc-bridge-k2 — le pont MIDI',
    '1 Plan        [SH]  SH-13y.6 — le paquet interface',
    '? Question    [osc] osc-bridge-k5 — la question',
  ])
  // Each line keeps its ticket and its tone: the ring chooses it as on one board.
  expect(t.lignes.slice(0, 3).map(l => [l.ticket, l.ton])).toEqual([
    ['osc-bridge-k2', 'actif'],
    ['SH-13y.6', 'actif'],
    ['osc-bridge-k5', 'attention'],
  ])
  // Every card of every board, and the folder of each ticket's project.
  expect(Object.keys(t.fiches).sort()).toEqual(['SH-13y.6', 'osc-bridge-a', 'osc-bridge-k2', 'osc-bridge-k5', 'osc-bridge-k9'])
  expect(t.dossiers?.['SH-13y.6']).toBe(DOSSIERS.sh)
  expect(t.dossiers?.['osc-bridge-k2']).toBe(DOSSIERS.osc)
})

// grillhouse-erp critère 2: a step stands after its sub-steps, the last step first (« 4 » is
// « 4.0 »), then the questions, then the circuits stopped after the steps.
test('critère 2 : a step sorts after its sub-steps, then the questions, then the stopped circuits', () => {
  const ligne = (id: string, numero: string | null, titre: string, question?: string): Ligne => ({
    texte: id,
    ticket: id,
    section: 'agents',
    etape: { numero, titre },
    ...(question ? { question } : {}),
  })
  const lignes = [
    ligne('d-1', '1', 'Plan'),
    ligne('d-arrete', null, ''),
    ligne('d-3', '3', 'Code'),
    ligne('d-q', '3', 'Code', 'superviseur'),
    ligne('d-31', '3.1', 'Contrôles'),
    ligne('d-4', '4', 'Passe finale et relecture'),
    ligne('d-42', '4.2', 'Régénération des références'),
    ligne('d-21', '2.1', 'Preuve du rouge'),
    ligne('d-41', '4.1', 'Passe finale'),
    ligne('d-53', '5.3', 'Tri des découvertes'),
  ]
  const fiches = Object.fromEntries(lignes.map(l => [l.ticket, fiche(l.ticket ?? '', l.ticket ?? '')]))
  const t = fusionner([
    { dossier: '/m/d', tableau: { prefixe: 'd', lignes, fiches }, erreur: null },
    { dossier: DOSSIERS.osd, tableau: OSD, erreur: null },
  ])
  expect(t.lignes.map(l => l.ticket)).toEqual([
    'd-53',
    'd-42',
    'd-41',
    'd-4',
    'd-31',
    'd-3',
    'd-21',
    'd-1',
    'd-q',
    'd-arrete',
  ])
  expect(textes(t.lignes).slice(-2)).toEqual(['? Question    [d]   d-q — d-q', '■ Arrêté      [d]   d-arrete — d-arrete'])
})

// grillhouse-erp critère 2: the footer sums up each project, its tickets in progress and waiting.
test('critère 2 : the footer sums up each project, its tickets in progress and its waits', () => {
  const t = fusionner([
    { dossier: DOSSIERS.osc, tableau: OSC, erreur: null },
    { dossier: DOSSIERS.sh, tableau: SH, erreur: null },
    { dossier: DOSSIERS.osd, tableau: OSD, erreur: null },
  ])
  expect(textes(t.pied ?? [])).toEqual(['osc 2▶ · SH 1▶ 3 en attente · OSD 0'])
})

// grillhouse-erp critère 3: a chantier of each project stays in the list, which `h` switches.
test('critère 3 : the chantiers of each project follow the tickets, prefixed by their project', () => {
  const t = fusionner([
    { dossier: DOSSIERS.osc, tableau: OSC, erreur: null },
    { dossier: DOSSIERS.sh, tableau: SH, erreur: null },
  ])
  const ch = t.lignes.find(l => l.chantier)
  expect(ch).toMatchObject({ texte: '[osc] CHANTIER a — Le pont', ticket: 'osc-bridge-a', chantier: true })
  expect(t.dossiers?.['osc-bridge-a']).toBe(DOSSIERS.osc)
  // A chantier's tree is not repeated: the list holds the tickets at a step and the chantiers.
  expect(t.lignes.some(l => l.ticket === 'osc-bridge-k9')).toBe(false)
})

// grillhouse-erp critère 4: a project whose board does not read is named in the footer with its
// fault; the others stay shown.
test('critère 4 : a board that does not read is named in the footer with its fault, the others shown', () => {
  const t = fusionner([
    { dossier: DOSSIERS.osc, tableau: OSC, erreur: null },
    { dossier: DOSSIERS.osd, tableau: null, erreur: 'bd: command not found' },
  ])
  expect(textes(t.lignes)[0]).toBe('3 Code        [osc] osc-bridge-k2 — le pont MIDI')
  expect(t.pied?.map(l => [l.texte, l.ton])).toEqual([
    ['osc 2▶', 'discret'],
    ['⚠ open-synth-descriptors : bd: command not found', 'alerte'],
  ])
})

// The session at /p, its own board and the projects its store keeps; `appels` receives each
// command the mod runs, with its folder; `ecrits` each value it stores.
type Banc = Parameters<Parameters<typeof test>[1]>
async function seance(
  $: Banc[0],
  on: Banc[1],
  o: { garde?: string[]; paquets?: Record<string, string | null>; tableaux?: Record<string, Tableau | null> } = {},
) {
  const appels: { argv: string[]; cwd?: string }[] = []
  const ecrits: { key: string; value: unknown }[] = []
  const tableaux: Record<string, Tableau | null> = {
    '/p': { ...SH, prefixe: 'P', lignes: [{ texte: 'P', ton: 'titre', section: 'agents' }], fiches: {} },
    ...o.tableaux,
  }
  const paquets: Record<string, string | null> = { '/p': PKG, ...o.paquets }
  on('process.run', ($, e) => {
    const cwd = e.init?.cwd
    appels.push({ argv: [...e.argv], cwd })
    if (e.argv[1] === 'tableau') {
      const t = tableaux[cwd ?? '']
      return {
        value: t
          ? { exitCode: 0, stdout: JSON.stringify(t), stderr: '' }
          : { exitCode: 1, stdout: '', stderr: `tableau illisible à ${cwd}` },
      }
    }
    if (e.argv[0] === 'bd' && e.argv[1] === 'show') {
      return {
        value: { exitCode: 0, stdout: JSON.stringify([{ description: `Le texte entier, lu à ${cwd}` }]), stderr: '' },
      }
    }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('fs.exists', ($, e) => ({ value: (paquets[e.path.replace(/\/package\.json$/, '')] ?? null) !== null }))
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
    $.command.run({ command: 'grillhouse', args, presentation: { isFullscreen: true, columns: 200 } } as never)
  const monter = () =>
    $.ui.mount({
      plugin: 'grillhouse',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'grillhouse',
      props: {
        title: 't',
        isFocused: true,
        bodyColumns: 52,
        placement: 'dock',
        scroll: { bodyRows: 30 } as never,
        view: {} as never,
      },
    })
  return { appels, ecrits, grillhouse, monter }
}

// grillhouse-erp critère 1: a command adds a project by its path, another removes it.
test('critère 1 : /grillhouse ajouter adds a Grillhouse project, kept for the folder, and its board is measured', async ($, on) => {
  const { appels, ecrits, grillhouse } = await seance($, on, {
    paquets: { [DOSSIERS.sh]: PKG },
    tableaux: { [DOSSIERS.sh]: SH },
  })
  const r = await grillhouse(`ajouter ${DOSSIERS.sh}`)
  expect(JSON.stringify(r)).toContain(DOSSIERS.sh)
  expect(ecrits).toContainEqual({ key: 'projets:/p', value: [DOSSIERS.sh] })
  await new Promise(r => setTimeout(r, 50))
  expect(appels).toContainEqual({ argv: ['node_modules/.bin/grillhouse', 'tableau'], cwd: DOSSIERS.sh })
})

test('critère 1 : /grillhouse retirer removes the project from the list kept for the folder', async ($, on) => {
  const { ecrits, grillhouse } = await seance($, on, {
    garde: [DOSSIERS.sh, DOSSIERS.osd],
    paquets: { [DOSSIERS.sh]: PKG, [DOSSIERS.osd]: PKG },
    tableaux: { [DOSSIERS.sh]: SH, [DOSSIERS.osd]: OSD },
  })
  const r = await grillhouse(`retirer ${DOSSIERS.sh}`)
  expect(JSON.stringify(r)).toContain(DOSSIERS.sh)
  expect(ecrits).toContainEqual({ key: 'projets:/p', value: [DOSSIERS.osd] })
  // The board is measured behind the command.
  await new Promise(r => setTimeout(r, 50))
})

test('critère 1 : a path that is not a Grillhouse project is refused by its name, nothing kept', async ($, on) => {
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

test('critère 1 : the list kept for the folder comes back at the next session, each board measured', async ($, on) => {
  const { appels } = await seance($, on, {
    garde: [DOSSIERS.sh, DOSSIERS.osd],
    paquets: { [DOSSIERS.sh]: PKG, [DOSSIERS.osd]: PKG },
    tableaux: { [DOSSIERS.sh]: SH, [DOSSIERS.osd]: OSD },
  })
  const dossiers = appels.filter(a => a.argv[1] === 'tableau').map(a => a.cwd)
  expect(dossiers).toEqual(expect.arrayContaining(['/p', DOSSIERS.sh, DOSSIERS.osd]))
})

// grillhouse-erp critères 2 et 4, in the pane: the fused list, the footer, a fault named.
test('critères 2 et 4 : the pane draws the fused list and its footer, a faulty project named in it', async ($, on) => {
  const { monter } = await seance($, on, {
    garde: [DOSSIERS.osc, DOSSIERS.osd],
    paquets: { [DOSSIERS.osc]: PKG, [DOSSIERS.osd]: PKG },
    tableaux: { [DOSSIERS.osc]: OSC, [DOSSIERS.osd]: null },
  })
  const ui = await monter()
  const vu = JSON.stringify(await ui.drawn())
  expect(vu).toContain('3 Code        [osc] osc-bridge-k2 — le pont MIDI')
  expect(vu).toContain('osc 2▶')
  expect(vu).toContain('⚠ open-synth-descriptors : tableau illisible à /m/open-synth-descriptors')
  await ui.unmount()
})

// grillhouse-erp critère 3: the card's whole text and the chantier's switch run bd in the folder of
// the ticket's project.
test("critère 3 : g reads the ticket's whole text in its project, h switches a chantier in its project", async ($, on) => {
  const { appels, monter } = await seance($, on, {
    garde: [DOSSIERS.osc],
    paquets: { [DOSSIERS.osc]: PKG },
    tableaux: { [DOSSIERS.osc]: OSC },
  })
  const ui = await monter()
  const cles = (await ui.findAll({ type: 'Button' })).map(b => b.key)
  const ticket = cles.find(k => k.startsWith('osc-bridge-k2:'))
  const chantier = cles.find(k => k.startsWith('osc-bridge-a:'))
  expect(ticket).toBeDefined()
  expect(chantier).toBeDefined()
  await $.ui.press({ plugin: 'grillhouse', key: ticket as string })
  await $.ui.press({ plugin: 'grillhouse', key: 'g' })
  await new Promise(r => setTimeout(r, 50))
  expect(appels).toContainEqual({ argv: ['bd', 'show', 'osc-bridge-k2', '--json'], cwd: DOSSIERS.osc })
  expect(JSON.stringify(await ui.drawn())).toContain(`Le texte entier, lu à ${DOSSIERS.osc}`)
  await $.ui.press({ plugin: 'grillhouse', key: 'g' })
  await $.ui.press({ plugin: 'grillhouse', key: chantier as string })
  await $.ui.press({ plugin: 'grillhouse', key: 'h' })
  await new Promise(r => setTimeout(r, 50))
  expect(appels).toContainEqual({ argv: ['bd', 'update', 'osc-bridge-a', '--status', 'open'], cwd: DOSSIERS.osc })
  await ui.unmount()
})

// grillhouse-erp critère 5: with the session's project alone, the pane stays as it is: the board's
// own lines, unprefixed, and no footer.
test("critère 5 : with the session's project alone, the pane shows its board as it is, without a footer", async ($, on) => {
  const { appels, monter } = await seance($, on, { tableaux: { '/p': OSC } })
  expect(appels.filter(a => a.argv[1] === 'tableau').map(a => a.cwd)).toEqual(['/p'])
  const ui = await monter()
  const vu = JSON.stringify(await ui.drawn())
  expect(vu).toContain('▶ k2  le pont MIDI')
  expect(vu).not.toContain('[osc]')
  expect(vu).not.toContain('osc 2▶')
  await ui.unmount()
})
