import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Etat, Fiche, Ligne, Tableau } from '../types'

// The board of a Grillhouse project, in the pane (/grillhouse) on its three levels. The frame's
// command of the project (`node_modules/.bin/grillhouse tableau`, the package
// @roomi-fields/grillhouse) measures and lays out the lines, and writes the status line for the
// person's status line command; this mod shows the lines, every 30 s (every 10 s while a line of
// progress shows) and after each `bd` or `git` command. A Grillhouse project is one whose
// package.json declares the package (`dependencies` or `devDependencies`); the mod stays silent
// outside one, inside an agent's copy (`.claude/worktrees/`), and in a run nobody sees (claude -p,
// the SDK without a display): the board comes with the terminal's prompt, or with a surface that
// attaches, as the desktop app's Code tab does (`activer`). In a Grillhouse project, every
// session, an agent's copy included, has a Bash command that starts with cd refused, with the
// form to take (`env -C`, `git -C`).
const PANE = 'grillhouse'
// The frame's command, which the project's `npm install` links, and its package.
const GRILLHOUSE = 'node_modules/.bin/grillhouse'
const PAQUET = '@roomi-fields/grillhouse'

// Whether a package.json's text declares the frame's package.
export function declareLePaquet(texte: string | null): boolean {
  try {
    const p = JSON.parse(texte ?? '') as { dependencies?: object; devDependencies?: object }
    return Object.hasOwn(p.dependencies ?? {}, PAQUET) || Object.hasOwn(p.devDependencies ?? {}, PAQUET)
  } catch {
    return false
  }
}
// Whether a shell command runs `cd` at the head of one of its subcommands (the line's start, or
// after `&&`, `||`, `;`, `|`, `(` or a newline). Claude Code asks a person to approve such a
// command, even where it asks nothing else, and the session waits on it.
export function commenceParCd(commande: string): boolean {
  return /(^|[;&|(\n])\s*cd(\s|$)/.test(commande)
}
// The refusal of a command that starts with cd: the agent takes the form it names and goes on.
export const REFUS_CD =
  "Refusé : une commande qui commence par cd (seule ou composée) attend la validation d'une personne et bloque la séance. " +
  "Écris `env -C <dossier> <commande>`, `git -C <dossier> <sous-commande>`, ou la commande seule si le dossier courant est déjà le bon."
const PERIODE = 30_000
// The width of the lines `grillhouse tableau` lays out (its LARGEUR).
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
  groupe: null,
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

// The rows a text takes in `largeur` columns: each of its lines wrapped at its spaces, its
// indentation kept (up to half the width), a word longer than a row cut across rows; an empty line
// stays an empty row.
export function enLignes(texte: string, largeur: number): string[] {
  const out: string[] = []
  for (const para of texte.replace(/\t/g, '  ').split('\n')) {
    const retrait = (/^ */.exec(para)?.[0] ?? '').slice(0, Math.floor(largeur / 2))
    let ligne = retrait
    let debut = true
    for (let mot of para.trimStart().split(/ +/)) {
      while (mot) {
        const sep = debut ? '' : ' '
        if ((ligne + sep + mot).length <= largeur) {
          ligne += sep + mot
          debut = false
          mot = ''
        } else if (debut) {
          const place = largeur - ligne.length
          out.push(ligne + mot.slice(0, place))
          mot = mot.slice(place)
          ligne = ''
        } else {
          out.push(ligne)
          ligne = ''
          debut = true
        }
      }
    }
    out.push(ligne)
  }
  return out
}

// The first row of the whole card's text to show: `avant` moved by `by` rows, within the text's
// `n` rows shown `rangs` at a time.
export const defiler = (avant: number, by: number, n: number, rangs: number) =>
  Math.max(0, Math.min(avant + by, n - rangs))

// A line the pane lists, the key of its Button and `i`, its index in the lines shown.
export type Visible = { l: Ligne; cle: string | null; i: number }

// The lines the pane lists, each with the key of its Button: `<ticket>:<i>` for a ticket's line,
// `>:<i>` for a folded group's title, none for a plain line.
export function visibles(lignes: Ligne[]): Visible[] {
  return lignes.map((l, i) => ({ l, cle: l.ticket ? `${l.ticket}:${i}` : l.groupe ? `>:${i}` : null, i }))
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
  if (element === 'g' || element === 'h' || element === 'e' || element === 'o') return s
  const [tete] = element.split(':')
  if (tete === '>') return { ...s, element, grand: false }
  return { ...s, element, grand: false, choisi: tete ?? null }
}

// The lines the pane shows: the board's, the states' view, or one folded group's, whole.
export const lignesDe = (s: Etat): Ligne[] =>
  (s.vue === 'etats'
    ? s.tableau?.vueEtats
    : s.vue === 'groupe'
      ? s.tableau?.groupes?.[s.groupe ?? '']
      : s.tableau?.lignes) ?? []

// `e` switches between the board and the states' view: the keyboard starts over in the other
// view, the card stays.
export const basculerVue = (s: Etat): Etat => ({
  ...s,
  vue: s.vue === 'tableau' ? 'etats' : 'tableau',
  element: null,
  grand: false,
})

// `o` on a folded group's title opens that group alone, whole; `o` again comes back to the board.
export const ouvrirGroupe = (s: Etat, groupe: string | undefined): Etat =>
  s.vue === 'groupe'
    ? { ...s, vue: 'tableau', groupe: null, element: null, grand: false }
    : groupe
      ? { ...s, vue: 'groupe', groupe, element: null, grand: false }
      : s

// While the board shows a line of progress (`avancement`: an automatic pass, « il y a 8 s »), it is
// measured again every AVANCEMENT ms instead of every PERIODE: `aMesurer` says when, at the pane's
// clock.
export const AVANCEMENT = 10_000
export const aMesurer = (s: Etat, maintenant: number) =>
  maintenant - s.lu >= AVANCEMENT && lignesDe(s).some(l => l.avancement === true)

// The colour of a line's tone.
export const couleur = (ton: Ligne['ton']) =>
  ton === 'alerte' ? 'red' : ton === 'attention' ? 'yellow' : ton === 'actif' ? 'cyan' : undefined

// The session's project, whether it is a Grillhouse project, whether the board applies to it, and
// whether the board is on.
let cwd = ''
let projet = false
let eligible = false
let actif = false
// The pane's window: its first line, the element it last followed, and the rows and focus it was
// last drawn with. The wheel moves it; the ring moving to another line makes it follow.
let fenetre = 0
let suivi: string | null = null
let cadre = { rangs: 1, focus: false }
// The whole card's window: the first row of its text shown, and, while it is drawn, the text's
// rows and the rows it shows them in.
let ligneTexte = 0
let texteDessine: { n: number; rangs: number } | null = null

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
// One board at a time: a refresh asked while one runs is folded into a single next one, so a
// loop of commands never stacks boards, each reading every ticket.
let enCours: Promise<void> | null = null
let encore = false
function rafraichir($: EngineInterface): Promise<void> {
  if (enCours) {
    encore = true
    return enCours
  }
  enCours = (async () => {
    try {
      do {
        encore = false
        await mesurer($)
      } while (encore)
    } finally {
      enCours = null
    }
  })()
  return enCours
}

// After a `bd` or `git` command, one refresh REBOND ms after the first of a burst.
const REBOND = 3_000
let attend = false
async function bientot($: EngineInterface) {
  if (attend) return
  attend = true
  try {
    await $.clock.sleep(REBOND)
  } finally {
    attend = false
  }
  await rafraichir($)
}

async function mesurer($: EngineInterface) {
  if (!actif) return
  const r = await $.process.run([GRILLHOUSE, 'tableau'], { cwd, timeoutMs: 20_000 })
  if (r.exitCode !== 0) {
    await update($, etat, s => ({ ...s, erreur: r.stderr.slice(0, 300) }))
    return
  }
  // A board past what a process returns (4 MiB) or that does not parse is said, never thrown.
  let tableau: Tableau
  try {
    if (r.isStdoutTruncated) throw new Error('la sortie de grillhouse tableau dépasse 4 Mio')
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

// The board applies to a Grillhouse project outside an agent's copy (`eligible`), once someone can
// see it: a person at the terminal's prompt from the start (`isInteractive`), or a surface that
// attaches later — the desktop app's Code tab, whose session starts headless, as the SDK's does,
// and which then attaches (`session.attach`). A run nothing attaches to (claude -p, the SDK
// without a display) has no command and no board. Registers the command and starts the clocks,
// once.
async function activer($: EngineInterface) {
  if (!eligible || actif) return
  actif = true
  await $.command.register({
    name: 'grillhouse',
    description: 'Ouvre le tableau Grillhouse : le projet, les agents, le chantier en cours',
  })
  void rafraichir($)
  $.clock.every(PERIODE, () => void rafraichir($))
  // A line of progress has the board measured again, by the clock of half its period.
  $.clock.every(AVANCEMENT / 2, () => {
    void read($, etat).then(s => {
      if (aMesurer(s, Date.now())) void rafraichir($)
    })
  })
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    cwd = e.cwd
    const pkg = `${cwd}/package.json`
    const texte = (await $.fs.exists(pkg)) ? String(await $.fs.read(pkg)) : null
    projet = declareLePaquet(texte)
    eligible = projet && !cwd.includes('/.claude/worktrees/')
    if (e.isInteractive) await activer($)
    return started
  })

  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    await activer($)
    return attached
  })

  // The command answers at once and the board is measured behind it: a measure takes seconds on a
  // large project, and a hook past its budget (10 s) is skipped, its command answered by the engine.
  on('command.run', { command: 'grillhouse' }, async ($, e) => {
    void rafraichir($)
    // A narrow column docked beside the transcript; a short block when seated above the prompt.
    await $.ui.open({ id: PANE, title: 'Grillhouse', columns: COLONNES, rows: 12 })
    return { text: placement(e.presentation) }
  })

  // In a Grillhouse project, a command that starts with cd is refused at once, in every session
  // and every agent's copy, before the engine's prompt: a refusal never waits, a prompt does.
  on('tool.call', { tool: 'Bash' }, ($, e, next) =>
    projet && commenceParCd(e.command) ? { deny: REFUS_CD } : next(e),
  ).catch(($, e, next) => (next.called ? next(e) : { deny: REFUS_CD }))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (actif && /(^|[\s;&|(])(bd|git)\s/.test(e.command)) void bientot($)
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
  // draws it again. On the whole card, the wheel, the arrows and the page keys move its text by
  // `e.by` rows, and the engine's window is held on the row under the card's spare top row, so an
  // arrow up scrolls as an arrow down does, wherever the text stands.
  on('ui.scroll', async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    if (texteDessine) {
      ligneTexte = defiler(ligneTexte, e.by, texteDessine.n, texteDessine.rangs)
      $.ui.invalidate('ui.render')
      return next({ ...e, offset: 1 })
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
    // The folded group the keyboard is on, which `o` opens.
    const groupe = ici >= 0 ? liste[ici]?.l.groupe : undefined
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
            <Text dimColor>{`e : ${s.vue === 'tableau' ? 'états' : 'tableau'} `}</Text>
          </Button>
          {groupe || s.vue === 'groupe' ? (
            <Button
              key="o"
              plain
              hotkey="o"
              onPress={() => {
                fenetre = 0
                suivi = null
                void update($, etat, x => ouvrirGroupe(x, groupe))
              }}
            >
              <Text dimColor>{`· o : ${s.vue === 'groupe' ? 'retour' : 'ouvrir'} `}</Text>
            </Button>
          ) : null}
          {fiche ? (
            <Button
              key="g"
              plain
              hotkey="g"
              onPress={() => {
                if (!grand && montre) void lireTexte($, montre)
                ligneTexte = 0
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
    texteDessine = null
    if (grand && e.props.isFocused && fiche) {
      const [titre = '', etatDuTicket] = ficheLignes(fiche)
      const lignesDuTitre = enLignes(titre, colonnes)
      const corps = enLignes((s.texte?.id === montre && s.texte.contenu) || fiche.resume, colonnes)
      // A spare row, the rule, the title and the state above the text; the text in the rows left,
      // less one, so the window shows it whole on either of its rows.
      const rangsTexte = Math.max(1, e.props.scroll.bodyRows - lignesDuTitre.length - 3)
      ligneTexte = defiler(ligneTexte, 0, corps.length, rangsTexte)
      texteDessine = { n: corps.length, rangs: rangsTexte }
      const fin = Math.min(corps.length, ligneTexte + rangsTexte)
      const position = corps.length > rangsTexte ? ` · ${ligneTexte + 1}-${fin}/${corps.length}` : ''
      // Two spare rows, one above and one below the card, the engine's window held on the second
      // row: an arrow up and an arrow down both have a row to scroll, and raise `ui.scroll`. The
      // spare row above is always drawn, so no row moves when the window does.
      return (
        <Box flexDirection="column" height={e.props.scroll.bodyRows + 2}>
          <Text> </Text>
          {regle(`retour${position}`)}
          {lignesDuTitre.map(l => (
            <Text bold wrap="truncate-end">
              {l || ' '}
            </Text>
          ))}
          <Text dimColor wrap="truncate-end">
            {etatDuTicket}
          </Text>
          {corps.slice(ligneTexte, fin).map(l => (
            <Text wrap="truncate-end">{l || ' '}</Text>
          ))}
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
            if (cle && l.groupe) {
              return (
                <Button key={cle} plain onPress={() => void update($, etat, s => viser(s, cle))}>
                  {texte}
                </Button>
              )
            }
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
