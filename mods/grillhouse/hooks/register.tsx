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
  element: null,
  ouvert: null,
  grand: false,
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
  if (!f) return ['alt+g (ou ctrl+x tab), puis tab : la fiche du ticket choisi ; Échap : le prompt.']
  return [
    `${f.numero} — ${f.titre}`,
    [f.composant, STATUTS[f.statut] ?? f.statut, duree(f.duree), `${k(f.jetons)} jetons`].filter(Boolean).join(' · '),
    f.resume,
  ].filter(Boolean)
}

// The lines the pane lists: the board's, the counting line `ouvert` unfolded below itself. Each
// carries the key of its Button: `<ticket>:<i>`, `<ticket>:<i>.<j>` for a folded line, `+:<i>` for
// a counting line; none for a plain line.
export function visibles(lignes: Ligne[], ouvert: number | null): { l: Ligne; cle: string | null }[] {
  return lignes.flatMap((l, i) => {
    const ici = [{ l, cle: l.ticket ? `${l.ticket}:${i}` : l.replie?.length ? `+:${i}` : null }]
    if (i !== ouvert || !l.replie) return ici
    return [...ici, ...l.replie.map((r, j) => ({ l: r, cle: r.ticket ? `${r.ticket}:${i}.${j}` : null }))]
  })
}

// The first of `n` lines to show in `rangs` rows: the window stays where it was (`avant`) while the
// line at `idx` shows with one line above and one below it, and moves just enough otherwise. Only
// the window's lines are drawn, so the engine has nothing to scroll and an arrow moves the ring.
export function debut(n: number, idx: number, rangs: number, avant: number): number {
  let p = avant
  if (idx - 1 < p) p = idx - 1
  if (idx + 1 > p + rangs - 1) p = idx + 2 - rangs
  return Math.max(0, Math.min(p, n - rangs))
}

// What the keyboard reaching an element changes: a ticket's line chooses its ticket, a counting
// line or one of its folded lines keeps it unfolded, and the card goes back to its size.
export function viser(s: Etat, element: string): Etat {
  if (element === 'g') return s
  const [tete, pos = ''] = element.split(':')
  const ouvert = tete === '+' ? Number(pos) : pos.includes('.') ? Number(pos.split('.')[0]) : null
  return { ...s, element, ouvert, grand: false, choisi: tete === '+' ? s.choisi : (tete ?? null) }
}

// The colour of a line's tone.
export const couleur = (ton: Ligne['ton']) =>
  ton === 'alerte' ? 'red' : ton === 'attention' ? 'yellow' : ton === 'actif' ? 'cyan' : undefined

// The session's project, and whether the board applies to it.
let cwd = ''
let actif = false
// The first line the pane's window showed last.
let fenetre = 0

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

// The status a chantier's switch gives it: in progress → open, anything else → in progress.
export const bascule = (statut: string | undefined) => (statut === 'in_progress' ? 'open' : 'in_progress')

// Switches a chantier on or off in Beads, then measures the board again.
async function basculer($: EngineInterface, id: string, statut: string | undefined) {
  await $.process.run(['bd', 'update', id, '--status', bascule(statut)], { cwd, timeoutMs: 20_000 })
  await rafraichir($)
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

  // The ring that moves onto a line acts on it (`viser`).
  on('ui.focus', async ($, e, next) => {
    const r = await next(e)
    if (e.requestId === PANE && e.element) {
      const element = e.element
      await update($, etat, s => viser(s, element))
    }
    return r
  })

  // An arrow, or the wheel, brings the whole card back to its size.
  on('ui.scroll', async ($, e, next) => {
    if (e.requestId !== PANE || !(await read($, etat)).grand) return next(e)
    await update($, etat, s => ({ ...s, grand: false }))
    return { deny: 'la fiche reprend sa taille' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const { tableau: t, erreur, choisi, element, ouvert, grand } = await read($, etat)
    if (!t) return <Text dimColor>{erreur ?? 'Lecture du tableau…'}</Text>
    const colonnes = e.props.bodyColumns
    // Focused, the card shows the chosen ticket; otherwise the one that moved last.
    const montre = e.props.isFocused ? choisi : (t.dernier ?? choisi)
    const fiche = montre ? t.fiches[montre] : undefined
    // `g` on the rule makes the card fill the pane, and again brings it back.
    const regle = (libelle: string) =>
      e.props.isFocused && fiche ? (
        <Button key="g" plain hotkey="g" onPress={() => void update($, etat, s => ({ ...s, grand: !s.grand }))}>
          <Text dimColor wrap="truncate-end">
            {`── g : ${libelle} ${'─'.repeat(colonnes)}`}
          </Text>
        </Button>
      ) : (
        <Text dimColor>{'─'.repeat(colonnes)}</Text>
      )
    if (grand && e.props.isFocused && fiche) {
      const [titre, etatDuTicket] = ficheLignes(fiche)
      // One row more than the pane, so an arrow scrolls, which brings the card back.
      return (
        <Box flexDirection="column" height={e.props.scroll.bodyRows + 1}>
          {regle('retour')}
          <Text bold wrap="wrap">
            {titre}
          </Text>
          <Text dimColor wrap="truncate-end">
            {etatDuTicket}
          </Text>
          <Box flexDirection="column" flexGrow={1} overflow="hidden">
            <Text wrap="wrap">{fiche.texte || fiche.resume}</Text>
          </Box>
        </Box>
      )
    }
    const liste = visibles(t.lignes, e.props.isFocused ? ouvert : null)
    const rangs = Math.max(1, e.props.scroll.bodyRows - FICHE - 1)
    const ici = liste.findIndex(x => x.cle === element)
    const premier = e.props.isFocused && ici >= 0 ? debut(liste.length, ici, rangs, fenetre) : 0
    fenetre = premier
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
          {liste.slice(premier, premier + rangs).map(({ l, cle }) => {
            const texte = (
              <Text bold={l.ton === 'titre'} dimColor={l.ton === 'discret'} color={couleur(l.ton)} wrap="truncate-end">
                {l.texte || ' '}
              </Text>
            )
            if (!cle) return texte
            if (!l.ticket) {
              // A counting line: the ring on it unfolds the lines it counts.
              return (
                <Button key={cle} plain onPress={() => void update($, etat, s => viser(s, cle))}>
                  {texte}
                </Button>
              )
            }
            // A ticket's line is a plain button, in the hover group named by its ticket: the ring
            // chooses it, the pointer over it shows its card.
            return (
              <Box hover={{ scope: l.ticket }}>
                <Button
                  key={cle}
                  plain
                  onPress={() => {
                    void update($, etat, s => ({ ...s, choisi: l.ticket ?? null }))
                    if (l.chantier && l.ticket) void basculer($, l.ticket, t.fiches[l.ticket]?.statut)
                  }}
                >
                  {texte}
                </Button>
              </Box>
            )
          })}
        </Box>
        {regle('tout le texte')}
        <Box flexDirection="column" height={FICHE} flexShrink={0}>
          {carte(fiche)}
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
