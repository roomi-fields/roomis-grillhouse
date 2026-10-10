import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Etat, Fiche, Ligne, Tableau } from '../types'

// The board of a Grillhouse project, in the pane (/grillhouse) on its three levels. The project's
// own `scripts/tableau.mjs` measures and lays out the lines, and writes the status line for the
// person's status line command; this mod shows the lines, every 30 s and after each `bd` or `git`
// command. It stays silent outside a Grillhouse project and inside an agent's copy
// (`.claude/worktrees/`).
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

export const k = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : `${n}`
export const duree = (ms: number) => {
  const min = Math.round(ms / 60_000)
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}
const STATUTS: Record<string, string> = {
  open: 'ouvert',
  in_progress: 'en cours',
  blocked: 'bloqué',
  deferred: 'reporté',
  closed: 'fait',
}
// The card's lines, below its rule: number and whole title, then component, state, duration and
// tokens, then the start of the description. The pane gives it its last rows.
export const FICHE = 6
export function ficheLignes(f: Fiche | undefined): string[] {
  if (!f) return ['ctrl+x tab, puis tab : la fiche du ticket choisi ; Échap : le prompt.']
  return [
    `${f.numero} — ${f.titre}`,
    [f.composant, STATUTS[f.statut] ?? f.statut, duree(f.duree), `${k(f.jetons)} jetons`].filter(Boolean).join(' · '),
    f.resume,
  ].filter(Boolean)
}

// The colour of a line's tone.
export const couleur = (ton: Ligne['ton']) =>
  ton === 'alerte' ? 'red' : ton === 'attention' ? 'yellow' : ton === 'actif' ? 'cyan' : undefined

// The session's project, and whether the board applies to it.
let cwd = ''
let actif = false

// Measures the board again and redraws the pane.
async function rafraichir($: EngineInterface) {
  if (!actif) return
  const r = await $.process.run(['node', 'scripts/tableau.mjs'], { cwd, timeoutMs: 20_000 })
  if (r.exitCode !== 0) {
    await update($, etat, s => ({ ...s, erreur: r.stderr.slice(0, 300) }))
    return
  }
  const tableau = JSON.parse(r.stdout) as Tableau
  await update($, etat, s => ({ ...s, tableau, erreur: null, lu: Date.now() }))
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

  // The ring that moves onto a ticket's line chooses that ticket.
  on('ui.focus', async ($, e, next) => {
    const r = await next(e)
    if (e.requestId === PANE && e.element) {
      const ticket = e.element.split(':')[0] ?? null
      await update($, etat, s => ({ ...s, choisi: ticket }))
    }
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const { tableau: t, erreur, choisi } = await read($, etat)
    if (!t) return <Text dimColor>{erreur ?? 'Lecture du tableau…'}</Text>
    const colonnes = e.props.bodyColumns
    // A card fills the pane's last rows: the whole title on as many lines as it takes, then the
    // component, state, duration and tokens, then the description in the rows left.
    const carte = (f: Fiche | undefined) => {
      const [titre, etatDuTicket, resume] = ficheLignes(f)
      return (
        <Box flexDirection="column" width={colonnes} height={FICHE}>
          <Box flexShrink={0}>
            <Text bold={!!f} dimColor={!f} wrap="wrap">
              {titre}
            </Text>
          </Box>
          {etatDuTicket ? (
            <Box flexShrink={0}>
              <Text dimColor wrap="truncate-end">
                {etatDuTicket}
              </Text>
            </Box>
          ) : null}
          {resume ? (
            <Box flexGrow={1} overflow="hidden">
              <Text wrap="wrap">{resume}</Text>
            </Box>
          ) : null}
        </Box>
      )
    }
    return (
      <Box flexDirection="column" height={e.props.scroll.bodyRows}>
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {t.lignes.map((l, i) => {
            const texte = (
              <Text bold={l.ton === 'titre'} dimColor={l.ton === 'discret'} color={couleur(l.ton)} wrap="truncate-end">
                {l.texte || ' '}
              </Text>
            )
            if (!l.ticket) return texte
            // A ticket's line is a plain button, in the hover group named by its ticket: the ring
            // chooses it, the pointer over it shows its card.
            return (
              <Box hover={{ scope: l.ticket }}>
                <Button
                  key={`${l.ticket}:${i}`}
                  plain
                  onPress={() => void update($, etat, s => ({ ...s, choisi: l.ticket ?? null }))}
                >
                  {texte}
                </Button>
              </Box>
            )
          })}
        </Box>
        <Text dimColor>{'─'.repeat(colonnes)}</Text>
        <Box flexDirection="column" height={FICHE} flexShrink={0}>
          {carte(choisi ? t.fiches[choisi] : undefined)}
          {Object.entries(t.fiches).map(([id, f]) => (
            // The card of the ticket under the pointer, drawn over the chosen one on a blank of its
            // size, so no character of the chosen card shows through.
            <Box position="absolute" top={0} left={0} display="none" hover={{ scope: id, display: 'flex' }}>
              <Box flexDirection="column">
                {Array.from({ length: FICHE }, () => (
                  <Text>{' '.repeat(colonnes)}</Text>
                ))}
              </Box>
              <Box position="absolute" top={0} left={0}>
                {carte(f)}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
