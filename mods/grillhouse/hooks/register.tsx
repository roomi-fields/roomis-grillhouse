import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Etat, Fiche, Ligne, Tableau } from '../types'

// The board of a Grillhouse project, in the pane (/grillhouse) on its three levels. The frame's
// follower (`node_modules/.bin/grillhouse tableau --suivre`, the package @roomi-fields/grillhouse)
// measures on events, lays out the lines and writes the status line for the person's status line
// command from the same measure; this mod starts it, keeps it alive and shows each line it
// gives, on no clock of its own. A Grillhouse project is one whose
// package.json declares the package (`dependencies` or `devDependencies`); the mod stays silent
// outside one, inside an agent's copy (`.claude/worktrees/`), and in a run nobody sees (claude -p,
// the SDK without a display): the board comes with the terminal's prompt, or with a surface that
// attaches, as the desktop app's Code tab does (`activer`). In a Grillhouse project, every
// session, an agent's copy included, has a Bash command that starts with cd refused, with the
// form to take (`env -C`, `git -C`). A session that coordinates several projects adds them to its
// pane (`/grillhouse ajouter <chemin>`, `/grillhouse retirer <chemin>`), as a multi-root workspace
// of VS Code lists its folders: the list is kept for the session's folder in the mod's store, and
// the frame's command measures their board as one (`grillhouse tableau <dossier>…`), which the
// pane draws as it draws one project's. `/grillhouse newday` sets the day's marker to now
// (`grillhouse newday`): FAITS AUJOURD'HUI and the « rejetés »/« validés » cases restart from zero.
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
  revision: 0,
  choisi: null,
  element: null,
  grand: false,
  vue: 'tableau',
  groupe: null,
  texte: null,
  projets: [],
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

// The lines the pane lists, each with the key of its Button: `<ticket>:<n>` for the n-th line of a
// ticket (from 0), `>:<groupe>` for a folded group's title, none for a plain line. A key names its
// line by what it shows, never by its place, as React's keys do: a new measure that adds lines
// above keeps the key the ring holds.
export function visibles(lignes: Ligne[]): Visible[] {
  const vus = new Map<string, number>()
  return lignes.map((l, i) => {
    if (l.ticket) {
      const n = vus.get(l.ticket) ?? 0
      vus.set(l.ticket, n + 1)
      return { l, cle: `${l.ticket}:${n}`, i }
    }
    return { l, cle: l.groupe ? `>:${l.groupe}` : null, i }
  })
}

// A computation kept from its last inputs, as React's useMemo keeps it from its dependencies:
// called with the same dependencies (each the same value; by default every argument), it gives
// the last result again without computing it.
export function memoire<A extends unknown[], R>(
  calcul: (...a: A) => R,
  dependances: (...a: A) => unknown[] = (...a) => a,
): (...a: A) => R {
  let dernier: { d: unknown[]; r: R } | null = null
  return (...a: A) => {
    const d = dependances(...a)
    const avant = dernier
    if (avant && avant.d.length === d.length && d.every((x, j) => Object.is(x, avant.d[j]))) return avant.r
    const r = calcul(...a)
    dernier = { d, r }
    return r
  }
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

// The board a line of the follower carries, or null when the line is not a board (empty, not JSON,
// no lines): never thrown.
export function tableauDeLaLigne(ligne: string): Tableau | null {
  try {
    const t = JSON.parse(ligne) as Tableau
    return t && typeof t === 'object' && Array.isArray(t.lignes) ? t : null
  } catch {
    return null
  }
}

// The wait before the follower that died is started again, after `echecs` deaths in a row: 1 s,
// doubling, capped at 5 minutes, so a follower that dies at once never loops tight.
export const attenteDeRelance = (echecs: number) => Math.min(1_000 * 2 ** Math.max(0, echecs), 300_000)

// The colour of a line's tone.
export const couleur = (ton: Ligne['ton']) =>
  ton === 'alerte' ? 'red' : ton === 'attention' ? 'yellow' : ton === 'actif' ? 'cyan' : undefined

// The key of the mod's store that keeps the projects a session in <dossier> shows beside its own.
export const cleProjets = (dossier: string) => `projets:${dossier}`

// The folder <chemin> names from the session's folder <dossier>: absolute, `~/` under the home
// <maison>, or relative; its `.` and `..` resolved, no slash at its end.
export function dossierDe(chemin: string, dossier: string, maison = ''): string {
  const brut = chemin.startsWith('/')
    ? chemin
    : chemin === '~' || chemin.startsWith('~/')
      ? `${maison}${chemin.slice(1)}`
      : `${dossier}/${chemin}`
  const parts: string[] = []
  for (const p of brut.split('/')) {
    if (!p || p === '.') continue
    if (p === '..') parts.pop()
    else parts.push(p)
  }
  return `/${parts.join('/')}`
}

// The session's project, whether it is a Grillhouse project, whether the board applies to it, and
// whether the board is on.
let cwd = ''
let projet = false
let eligible = false
let actif = false
// The pane's window: its first line, the element it last followed and that element's line, and
// the wheel's notches not drawn yet. The wheel moves it; the ring moving to another line makes it
// follow.
let fenetre = 0
let suivi: string | null = null
let ligneSuivie = -1
let crans: number[] = []
// The whole card's window: the first row of its text shown, and, while it is drawn, the text's
// rows and the rows it shows them in.
let ligneTexte = 0
let texteDessine: { n: number; rangs: number } | null = null
// The lines the pane lists, kept until the board or the view changes.
const listeDe = memoire(
  (s: Etat) => visibles(lignesDe(s)),
  s => [s.revision, s.vue, s.groupe],
)
// The cards the pane has drawn, by their key, kept until the board, the width or the surface's
// elements change.
const cartesGardees = memoire(
  (_revision: number, _colonnes: number, _elements: unknown) => new Map<string, JSX.Element>(),
)

// The lines the window runs over, every line of the board, the window placed on them. A board
// measured again keeps the followed line on its row, as a browser's scroll anchoring keeps the
// line in view where it was. When the ring has moved to another line since the window last
// followed it, the window follows it (`debut`). Then the wheel's notches move it, one by one,
// each within the lines.
function placer(liste: Visible[], element: string | null, rangs: number, focus: boolean): void {
  const ici = liste.findIndex(x => x.cle === element)
  if (focus && ici >= 0 && element === suivi && ligneSuivie >= 0) fenetre += ici - ligneSuivie
  if (focus && ici >= 0 && element !== suivi) {
    // The ring's next stops: the nearest lines with a button, above and below.
    const avant = liste.slice(0, ici).findLastIndex(x => x.cle)
    const apres = liste.findIndex((x, j) => j > ici && x.cle)
    fenetre = debut(liste.length, ici, rangs, fenetre, avant < 0 ? ici - 1 : avant, apres < 0 ? ici + 1 : apres)
    suivi = element
  }
  ligneSuivie = ici
  fenetre = Math.max(0, Math.min(fenetre, liste.length - rangs))
  for (const by of crans) fenetre = Math.max(0, Math.min(fenetre + by, liste.length - rangs))
  crans = []
}

// Another view starts its window over: at its first line, following nothing, no notch kept.
function recommencer(): void {
  fenetre = 0
  suivi = null
  ligneSuivie = -1
  crans = []
}

// The follower the pane starts (`grillhouse tableau --suivre`): one JSON board per line on its
// standard output, which the pane reads as it comes. The engine's `process.spawn` starts it.
// `spawn` returns a stream of `{ stream, text }` chunks, then `{ code, signal }`; leaving the loop
// (`return()`) stops the child.
type Morceau = { stream: 'stdout' | 'stderr'; text: string }
type Flux = AsyncGenerator<Morceau, { code: number | null; signal: string | null }>
type Lanceur = { spawn: (r: { argv: readonly string[]; cwd?: string }) => Flux }
type Suiveur = { kill: () => void }
let suiveur: Suiveur | null = null
// A generation per start: a follower that dies after it was replaced or stopped is not started again.
let generation = 0
let echecs = 0

// Updates the pane with the board a line carries; a line that is not a board is said, never thrown.
async function lireLaLigne($: EngineInterface, ligne: string) {
  if (!ligne.trim()) return
  const tableau = tableauDeLaLigne(ligne)
  if (!tableau) {
    await update($, etat, s => ({ ...s, erreur: `Tableau illisible : ${ligne.slice(0, 200)}` }))
    return
  }
  echecs = 0
  await update($, etat, s => ({ ...s, tableau, erreur: null, lu: Date.now(), revision: (s.revision || 0) + 1 }))
}

// Starts the follower for the session's project and the projects the pane shows beside it, after
// stopping the one that runs; one that dies is started again after a growing wait.
async function demarrer($: EngineInterface): Promise<void> {
  if (!actif) return
  arreter()
  const moi = ++generation
  const { projets } = await read($, etat)
  let flux: Flux
  try {
    flux = ($.process as unknown as Lanceur).spawn({ argv: [GRILLHOUSE, 'tableau', '--suivre', ...projets], cwd })
  } catch (err) {
    suiveur = null
    await update($, etat, s => ({ ...s, erreur: `Suiveur impossible à lancer : ${(err as Error).message}`.slice(0, 300) }))
    return
  }
  suiveur = { kill: () => void flux.return({ code: null, signal: null }).catch(() => undefined) }
  void suivre($, flux, moi).catch(() => undefined)
}

// Reads the follower's chunks as they come, a line at a time, until it ends; then, unless the pane
// stopped or replaced it, says it and starts it again after its growing wait.
async function suivre($: EngineInterface, flux: Flux, moi: number): Promise<void> {
  let reste = ''
  let code: number | null = null
  try {
    for (;;) {
      const pas = await flux.next()
      if (pas.done) {
        code = pas.value?.code ?? null
        break
      }
      if (moi !== generation) return
      if (pas.value.stream !== 'stdout') continue
      const morceaux = (reste + pas.value.text).split('\n')
      reste = morceaux.pop() ?? ''
      for (const ligne of morceaux) await lireLaLigne($, ligne)
    }
  } catch (err) {
    if (moi !== generation) return
    await update($, etat, s => ({ ...s, erreur: `Suiveur interrompu : ${(err as Error).message}`.slice(0, 300) }))
  }
  if (moi !== generation) return
  suiveur = null
  await update($, etat, s => ({ ...s, erreur: `Le suiveur du tableau s'est arrêté (code ${code ?? '?'}).` }))
  await $.clock.sleep(attenteDeRelance(echecs++))
  if (moi === generation) await demarrer($)
}

// Stops the follower, with no restart.
function arreter(): void {
  generation++
  try {
    suiveur?.kill()
  } catch {
    // A follower already gone.
  }
  suiveur = null
}

// The folder of the project the ticket <id> belongs to, which the board names beside the
// session's (`dossiers`); the session's otherwise.
const dossierDu = (t: Tableau | null, id: string) => t?.dossiers?.[id] ?? cwd

// The whole text of a ticket, read from Beads in its project when the card fills the pane: the
// board carries only each card's start.
async function lireTexte($: EngineInterface, id: string, dossier: string) {
  const r = await $.process.run(['bd', 'show', id, '--json'], { cwd: dossier, timeoutMs: 20_000 })
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

// Switches a chantier on or off in Beads, in its project, then measures the board again.
async function basculer($: EngineInterface, id: string, statut: string | undefined, dossier: string) {
  const r = await $.process.run(['bd', 'update', id, '--status', bascule(statut)], {
    cwd: dossier,
    timeoutMs: 20_000,
  })
  // The change under `.beads/` is the follower's event: it measures, the pane reads the line.
  if (r.exitCode !== 0) await $.ui.toast(`Le chantier n'a pas basculé : ${r.stderr.slice(0, 200)}`)
}

// The projects the store keeps for the session's folder; none when it holds nothing readable.
async function lireLaListe($: EngineInterface): Promise<string[]> {
  try {
    const v = await $.store.get(cleProjets(cwd))
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// Adds a project to the pane or removes it, by its path; a path that is not a Grillhouse project
// is refused by its name. The list is kept for the session's folder, and the board measured again.
async function changerLaListe($: EngineInterface, geste: 'ajouter' | 'retirer', chemin: string): Promise<string> {
  if (!chemin) return `Usage : /grillhouse ${geste} <chemin>.`
  const maison = chemin.startsWith('~') ? ((await $.env.get('HOME')) ?? '') : ''
  const dossier = dossierDe(chemin, cwd, maison)
  const { projets } = await read($, etat)
  let liste: string[]
  if (geste === 'ajouter') {
    if (dossier === cwd || projets.includes(dossier)) return `${dossier} est déjà au tableau.`
    const pkg = `${dossier}/package.json`
    const texte = (await $.fs.exists(pkg)) ? String(await $.fs.read(pkg)) : null
    if (!declareLePaquet(texte)) {
      return `Refusé : ${dossier} n'est pas un projet Grillhouse (son package.json ne déclare pas ${PAQUET}).`
    }
    liste = [...projets, dossier]
  } else {
    if (!projets.includes(dossier)) return `${dossier} n'est pas au tableau.`
    liste = projets.filter(p => p !== dossier)
  }
  await $.store.set(cleProjets(cwd), liste)
  await update($, etat, s => ({ ...s, projets: liste }))
  void demarrer($)
  return geste === 'ajouter' ? `Projet ajouté au tableau : ${dossier}.` : `Projet retiré du tableau : ${dossier}.`
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
    argumentHint: '[newday|ajouter|retirer <chemin>]',
  })
  void demarrer($)
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    cwd = e.cwd
    const pkg = `${cwd}/package.json`
    const texte = (await $.fs.exists(pkg)) ? String(await $.fs.read(pkg)) : null
    projet = declareLePaquet(texte)
    eligible = projet && !cwd.includes('/.claude/worktrees/')
    if (eligible) {
      const garde = await lireLaListe($)
      if (garde.length) await update($, etat, s => ({ ...s, projets: garde }))
    }
    if (e.isInteractive) await activer($)
    return started
  })

  on('session.attach', async ($, e, next) => {
    const attached = await next(e)
    await activer($)
    return attached
  })

  // The command answers at once; the board comes from the follower's lines.
  // `ajouter <chemin>` and `retirer <chemin>` change the projects the pane shows.
  on('command.run', { command: 'grillhouse' }, async ($, e) => {
    const [geste = '', ...reste] = (e.args ?? '').trim().split(/\s+/)
    if (geste === 'ajouter' || geste === 'retirer') return { text: await changerLaListe($, geste, reste.join(' ')) }
    // newday sets the day's marker to now: FAITS AUJOURD'HUI and the « rejetés »/« validés » cases
    // of the board restart from zero (grillhouse-3uv.96).
    if (geste === 'newday') {
      const r = await $.process.run([GRILLHOUSE, 'newday'], { cwd, timeoutMs: 20_000 })
      // The follower watches the marker's file and measures again.
      return { text: `${r.stdout || ''}${r.stderr || ''}`.trim() || 'Repère de journée posé.' }
    }
    if (geste) return { text: 'Usage : /grillhouse, /grillhouse newday, /grillhouse ajouter <chemin>, /grillhouse retirer <chemin>.' }
    // A narrow column docked beside the transcript; a short block when seated above the prompt.
    await $.ui.open({ id: PANE, title: 'Grillhouse', columns: COLONNES, rows: 12 })
    return { text: placement(e.presentation) }
  })

  // In a Grillhouse project, a command that starts with cd is refused at once, in every session
  // and every agent's copy, before the engine's prompt: a refusal never waits, a prompt does.
  on('tool.call', { tool: 'Bash' }, ($, e, next) =>
    projet && commenceParCd(e.command) ? { deny: REFUS_CD } : next(e),
  ).catch(($, e, next) => (next.called ? next(e) : { deny: REFUS_CD }))

  // The ring that moves onto a line acts on it (`viser`).
  on('ui.focus', async ($, e, next) => {
    const r = await next(e)
    if (e.requestId === PANE && e.element) {
      const element = e.element
      await update($, etat, s => viser(s, element))
    }
    return r
  })

  // The pane draws its own rows: each notch of the wheel is kept, and the next render moves the
  // window by every notch kept, one by one within its lines, as a browser folds the scroll events
  // of one frame into one paint: a notch reads nothing and computes nothing. On the whole card,
  // the wheel, the arrows and the page keys move its text by `e.by` rows, and the engine's window is held on the row under the card's spare top row, so an
  // arrow up scrolls as an arrow down does, wherever the text stands.
  on('ui.scroll', async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    if (texteDessine) {
      ligneTexte = defiler(ligneTexte, e.by, texteDessine.n, texteDessine.rangs)
      $.ui.invalidate('ui.render')
      return next({ ...e, offset: 1 })
    }
    crans.push(e.by)
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
    const liste = listeDe(s)
    placer(liste, element, rangs, e.props.isFocused)
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
              recommencer()
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
                recommencer()
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
                if (!grand && montre) void lireTexte($, montre, dossierDu(t, montre))
                ligneTexte = 0
                void update($, etat, s => ({ ...s, grand: !s.grand }))
              }}
            >
              <Text dimColor>{`· g : ${libelle} `}</Text>
            </Button>
          ) : null}
          {chantier && fiche ? (
            <Button
              key="h"
              plain
              hotkey="h"
              onPress={() => void basculer($, chantier, t.fiches[chantier]?.statut, dossierDu(t, chantier))}
            >
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
    const montrees = liste.slice(premier, premier + rangs)
    // A card fills the pane's last rows: the whole title on as many lines as it takes, then the
    // component, state, duration and tokens, then the description in the rows left. Each card is
    // drawn once for a board, a width and a surface, and kept.
    const gardees = cartesGardees(s.revision, colonnes, Box)
    const garder = (cle: string, dessin: () => JSX.Element) => {
      const deja = gardees.get(cle)
      if (deja) return deja
      const neuf = dessin()
      gardees.set(cle, neuf)
      return neuf
    }
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
          {montrees.map(({ l, cle }) => {
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
          {garder(`carte:${montre ?? ''}`, () => carte(fiche))}
          {[...new Set(montrees.map(x => x.l.ticket))].map(id => {
            const f = id ? t.fiches[id] : undefined
            // The card of the ticket under the pointer, drawn over the chosen one on a blank of its
            // size, so no character of the chosen card shows through: one for each ticket of the
            // lines in the window, the only ones the pointer can be over.
            return id && f
              ? garder(`survol:${id}`, () => (
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
                ))
              : null
          })}
        </Box>
      </Box>
    )
  })
}
