import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Etat, Ligne, Tableau } from '../types'

// The board of a Grillhouse project: the status line holds the chantier in progress, the pane
// (/grillhouse) its three levels. The project's own `scripts/tableau.mjs` measures and lays out the
// lines; this mod shows them, every 30 s and after each `bd` or `git` command. It stays silent outside a Grillhouse project
// and inside an agent's copy (`.claude/worktrees/`).
const PANE = 'grillhouse'
const PERIODE = 30_000
// The width of the lines `scripts/tableau.mjs` lays out (its LARGEUR).
const COLONNES = 52
const DOCK = 110

// Where the pane sits, and what it takes to have it docked beside the transcript.
export function placement(p: { isFullscreen: boolean; columns: number }): string {
  if (p.isFullscreen && p.columns >= DOCK) return 'Tableau Grillhouse ouvert sur le côté.'
  const manque = [
    ...(p.isFullscreen ? [] : ["l'affichage plein écran de Claude Code (/tui fullscreen)"]),
    ...(p.columns >= DOCK ? [] : [`un terminal d'au moins ${DOCK} colonnes (il en a ${p.columns})`]),
  ]
  return `Tableau Grillhouse ouvert au-dessus de la saisie. Pour l'avoir sur le côté : ${manque.join(' et ')}.`
}
const etat = atom({ plugin: 'grillhouse', key: 'etat' } as const, {
  tableau: null,
  erreur: null,
  lu: 0,
  choisi: null,
} as Etat)

// The colour of a line's tone.
export const couleur = (ton: Ligne['ton']) =>
  ton === 'alerte' ? 'red' : ton === 'attention' ? 'yellow' : ton === 'actif' ? 'cyan' : undefined

// The session's project, and whether the board applies to it.
let cwd = ''
let actif = false

// Measures the board again and redraws the status line and the pane.
async function rafraichir($: EngineInterface) {
  if (!actif) return
  const r = await $.process.run(['node', 'scripts/tableau.mjs'], { cwd, timeoutMs: 20_000 })
  if (r.exitCode !== 0) {
    await update($, etat, s => ({ ...s, erreur: r.stderr.slice(0, 300) }))
    return
  }
  const tableau = JSON.parse(r.stdout) as Tableau
  await update($, etat, s => ({ ...s, tableau, erreur: null, lu: Date.now() }))
  $.ui.status(tableau.etat)
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    cwd = e.cwd
    const projet = await $.process.run(['test', '-f', 'scripts/tableau.mjs'], { cwd })
    actif = e.isInteractive && projet.exitCode === 0 && !cwd.includes('/.claude/worktrees/')
    if (!actif) return started
    await $.command.register({
      name: 'grillhouse',
      description: 'Ouvre le tableau Grillhouse : le projet, le chantier en cours, les agents',
    })
    void rafraichir($)
    $.clock.every(PERIODE, () => void rafraichir($))
    return started
  })

  on('command.run', { command: 'grillhouse' }, async ($, e) => {
    await rafraichir($)
    // A narrow column docked beside the transcript; a short block when seated above the prompt.
    await $.ui.open({ id: PANE, title: 'Grillhouse', columns: COLONNES, rows: 12 })
    return { text: placement(e.presentation) }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (actif && /(^|[\s;&|(])(bd|git)\s/.test(e.command)) void rafraichir($)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const { tableau: t, erreur, choisi } = await read($, etat)
    if (!t) return <Text dimColor>{erreur ?? 'Lecture du tableau…'}</Text>
    const choisir = (id: string | null) => void update($, etat, s => ({ ...s, choisi: s.choisi === id ? null : id }))
    const fiche = choisi ? t.fiches[choisi] : undefined
    return (
      <Box flexDirection="column">
        {fiche && (
          // The selected ticket's card: its whole title, its state and the start of its description.
          <Box flexDirection="column" borderStyle="round" marginBottom={1}>
            <Text bold wrap="wrap">
              {fiche.numero} — {fiche.titre}
            </Text>
            <Text dimColor>
              {[fiche.composant, fiche.statut].filter(Boolean).join(' · ')}
            </Text>
            {fiche.resume ? <Text wrap="wrap">{fiche.resume}</Text> : null}
            <Button label="fermer" role="dismiss" onPress={() => choisir(null)} />
          </Box>
        )}
        {t.lignes.map((l, i) => {
          const texte = (
            <Text bold={l.ton === 'titre'} dimColor={l.ton === 'discret'} color={couleur(l.ton)} wrap="truncate-end">
              {l.texte || ' '}
            </Text>
          )
          // A ticket's line is a button: pressed (click, or Enter once the pane holds the
          // keyboard), it shows the ticket's card above the board.
          return l.ticket ? (
            <Button key={`${l.ticket}:${i}`} onPress={() => choisir(l.ticket ?? null)}>
              {texte}
            </Button>
          ) : (
            texte
          )
        })}
      </Box>
    )
  })
}
