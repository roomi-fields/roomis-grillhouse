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
  grand: false,
  vue: 'tableau',
  texte: null,
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
    [f.composant, STATUTS[f.statut] ?? f.statut, duree(f.travail), `${k(f.jetons)} jetons`].filter(Boolean).join(' · '),
    f.resume,
  ].filter(Boolean)
}

// A line the pane lists, the key of its Button and `i`, its index in the lines shown.
export type Visible = { l: Ligne; cle: string | null; i: number }

// The lines the pane lists, each with the key of its Button: `<ticket>:<i>` for a ticket's line,
// none for a plain line.
export function visibles(lignes: Ligne[]): Visible[] {
  return lignes.map((l, i) => ({ l, cle: l.ticket ? `${l.ticket}:${i}` : null, i }))
}

// The first of `n` lines to show in `rangs` rows: the window stays where it was (`avant`) while the
// line at `idx` shows with the lines `haut` above and `bas` below it — the ring's next stops, one
// line away by default — and moves just enough otherwise, `idx` itself always in sight. Only the
// window's lines are drawn, so the engine has nothing to scroll and an arrow moves the ring: the
// next stop must be drawn, or the arrow skips past the lines to the rule.
export function debut(n: number, idx: number, rangs: number, avant: number, haut = idx - 1, bas = idx + 1): number {
  let p = avant
  if (haut < p) p = haut
  if (bas > p + rangs - 1) p = bas + 1 - rangs
  p = Math.min(p, idx)
  p = Math.max(p, idx + 1 - rangs)
  return Math.max(0, Math.min(p, n - rangs))
}

// What the keyboard reaching a ticket's line changes: the line chooses its ticket, and the card
// goes back to its size.
export function viser(s: Etat, element: string): Etat {
  if (element === 'g' || element === 'h' || element === 'e') return s
  const [tete] = element.split(':')
  return { ...s, element, grand: false, choisi: tete ?? null }
}

// The lines the pane shows: the board's, or the states' view.
export const lignesDe = (s: Etat): Ligne[] =>
  (s.vue === 'etats' ? s.tableau?.vueEtats : s.tableau?.lignes) ?? []

// `e` switches between the board and the states' view: the keyboard starts over in the other
// view, the card stays.
export const basculerVue = (s: Etat): Etat => ({
  ...s,
  vue: s.vue === 'etats' ? 'tableau' : 'etats',
  element: null,
  grand: false,
})

// The colour of a line's tone.
export const couleur = (ton: Ligne['ton']) =>
  ton === 'alerte' ? 'red' : ton === 'attention' ? 'yellow' : ton === 'actif' ? 'cyan' : undefined

// The session's project, and whether the board applies to it.
let cwd = ''
let actif = false
// The pane's window: its first line, the element it last followed, and the rows and focus it was
// last drawn with. The wheel moves it; the ring moving to another line makes it follow.
let fenetre = 0
let suivi: string | null = null
let cadre = { rangs: 1, focus: false }

// The lines the window runs over, every line of the board, the window placed on them: when the
// ring has moved to another line since the window last followed it, the window follows it
// (`debut`); it stays within the lines.
function placer(s: Etat, rangs: number, focus: boolean): Visible[] {
  const liste = visibles(lignesDe(s))
  const ici = liste.findIndex(x => x.cle === s.element)
  if (focus && ici >= 0 && s.element !== suivi) {
    // The ring's next stops: the nearest lines with a button, above and below.
    const avant = liste.slice(0, ici).findLastIndex(x => x.cle)
    const apres = liste.findIndex((x, j) => j > ici && x.cle)
    fenetre = debut(liste.length, ici, rangs, fenetre, avant < 0 ? ici - 1 : avant, apres < 0 ? ici + 1 : apres)
    suivi = s.element
  }
  fenetre = Math.max(0, Math.min(fenetre, liste.length - rangs))
  return liste
}

// Measures the board again and redraws the pane.
async function rafraichir($: EngineInterface) {
  if (!actif) return
  const r = await $.process.run(['node', 'scripts/tableau.mjs'], { cwd, timeoutMs: 20_000 })
  if (r.exitCode !== 0) {
    await update($, etat, s => ({ ...s, erreur: r.stderr.slice(0, 300) }))
    return
  }
  // A board past what a process returns (4 MiB) or that does not parse is said, never thrown.
  let tableau: Tableau
  try {
    if (r.isStdoutTruncated) throw new Error('la sortie de scripts/tableau.mjs dépasse 4 Mio')
    tableau = JSON.parse(r.stdout) as Tableau
  } catch (err) {
    await update($, etat, s => ({ ...s, erreur: `Tableau illisible : ${(err as Error).message}`.slice(0, 300) }))
    return
  }
  await update($, etat, s => ({ ...s, tableau, erreur: null, lu: Date.now() }))
}

// The whole text of a ticket, read from Beads when the card fills the pane: the board carries
// only each card's start.
async function lireTexte($: EngineInterface, id: string) {
  const r = await $.process.run(['bd', 'show', id, '--json'], { cwd, timeoutMs: 20_000 })
  let contenu = ''
  try {
    const lu = JSON.parse(r.stdout) as { description?: string }[] | { description?: string }
    contenu = ((Array.isArray(lu) ? lu[0] : lu)?.description ?? '').trim()
  } catch {
    contenu = ''
  }
  await update($, etat, s => ({ ...s, texte: { id, contenu } }))
}

// The status a chantier's switch gives it: in progress → open, anything else → in progress.
export const bascule = (statut: string | undefined) => (statut === 'in_progress' ? 'open' : 'in_progress')

// Switches a chantier on or off in Beads, then measures the board again.
async function basculer($: EngineInterface, id: string, statut: string | undefined) {
  const r = await $.process.run(['bd', 'update', id, '--status', bascule(statut)], { cwd, timeoutMs: 20_000 })
  if (r.exitCode !== 0) await $.ui.toast(`Le chantier n'a pas basculé : ${r.stderr.slice(0, 200)}`)
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
      description: 'Ouvre le tableau Grillhouse : le projet, les agents, le chantier en cours',
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

  // The pane draws its own rows: the wheel moves its window by `e.by` rows, within its lines, and
  // draws it again. On the whole card, a scroll brings the card back to its size.
  on('ui.scroll', async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    if ((await read($, etat)).grand) {
      await update($, etat, s => ({ ...s, grand: false }))
      return { deny: 'la fiche reprend sa taille' }
    }
    const liste = placer(await read($, etat), cadre.rangs, cadre.focus)
    fenetre = Math.max(0, Math.min(fenetre + e.by, liste.length - cadre.rangs))
    $.ui.invalidate('ui.render')
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, etat)
    const { tableau: t, erreur, choisi, element, grand } = s
    if (!t) return <Text dimColor>{erreur ?? 'Lecture du tableau…'}</Text>
    const colonnes = e.props.bodyColumns
    // Focused, the card shows the chosen ticket; otherwise the one that moved last.
    const montre = e.props.isFocused ? choisi : (t.dernier ?? choisi)
    const fiche = montre ? t.fiches[montre] : undefined
    const rangs = Math.max(1, e.props.scroll.bodyRows - FICHE - 1)
    cadre = { rangs, focus: e.props.isFocused }
    const liste = placer(s, rangs, e.props.isFocused)
    const ici = liste.findIndex(x => x.cle === element)
    // The chantier the keyboard is on, which `h` switches on or off.
    const chantier = ici >= 0 && liste[ici]?.l.chantier ? liste[ici]?.l.ticket : undefined
    // `g` on the rule makes the card fill the pane, and again brings it back; `h` switches the
    // chantier chosen; `e` switches between the board and the states' view.
    const regle = (libelle: string) =>
      e.props.isFocused ? (
        <Box flexDirection="row" width={colonnes} overflow="hidden">
          <Text dimColor>{'── '}</Text>
          <Button
            key="e"
            plain
            hotkey="e"
            onPress={() => {
              fenetre = 0
              suivi = null
              void update($, etat, basculerVue)
            }}
          >
            <Text dimColor>{`e : ${s.vue === 'etats' ? 'tableau' : 'états'} `}</Text>
          </Button>
          {fiche ? (
            <Button
              key="g"
              plain
              hotkey="g"
              onPress={() => {
                if (!grand && montre) void lireTexte($, montre)
                void update($, etat, s => ({ ...s, grand: !s.grand }))
              }}
            >
              <Text dimColor>{`· g : ${libelle} `}</Text>
            </Button>
          ) : null}
          {chantier && fiche ? (
            <Button key="h" plain hotkey="h" onPress={() => void basculer($, chantier, t.fiches[chantier]?.statut)}>
              <Text dimColor>{`· h : ${fiche.statut === 'in_progress' ? 'désactiver' : 'activer'} `}</Text>
            </Button>
          ) : null}
          <Text dimColor wrap="truncate-end">
            {'─'.repeat(colonnes)}
          </Text>
        </Box>
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
            <Text wrap="wrap">{(s.texte?.id === montre && s.texte.contenu) || fiche.resume}</Text>
          </Box>
        </Box>
      )
    }
    const premier = fenetre
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
            if (!cle || !l.ticket) return texte
            // A ticket's line is a plain button, in the hover group named by its ticket: the ring
            // chooses it, the pointer over it shows its card.
            return (
              <Box hover={{ scope: l.ticket }}>
                <Button
                  key={cle}
                  plain
                  onPress={() => void update($, etat, s => viser(s, cle))}
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
