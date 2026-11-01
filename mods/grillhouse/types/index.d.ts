export type Ton = 'titre' | 'alerte' | 'attention' | 'actif' | 'discret'
// `ticket`: the id of the ticket a line names, which makes the line selectable. `chantier`: the line is an epic's, which the pane switches on or off. `section`: the board's
// section the line belongs to. `groupe`: the key of the folded group the line stands for, which `o`
// opens. `etape`: the step a ticket's line of AGENTS stands under (its `numero`, null after the
// steps); `question`: who must answer the question its circuit stopped on.
export type Section = 'agents' | 'chantier' | 'faits' | 'etats'
export type Ligne = {
  texte: string
  ton?: Ton
  ticket?: string
  chantier?: boolean
  section: Section
  groupe?: string
  avancement?: boolean
  etape?: { numero: string | null; titre: string }
  question?: string
}
export type Fiche = {
  numero: string
  titre: string
  composant: string
  statut: string
  travail: number
  jetons: number
  resume: string
}
// What the mod reads of `grillhouse tableau`: the board's lines, laid out there, the states' view
// (`vueEtats`: each state, its meaning, its tickets), each folded group whole (`groupes`), their
// cards, the ticket that moved last, the project's ticket prefix (`prefixe`) and its counters
// (`global.compteurs`). A board fused from several projects' adds its footer (`pied`: a summary of
// each project, a line per project whose board does not read) and the folder of each ticket's
// project (`dossiers`).
export type Tableau = {
  lignes: Ligne[]
  vueEtats?: Ligne[]
  groupes?: Record<string, Ligne[]>
  fiches: Record<string, Fiche>
  dernier?: string | null
  prefixe?: string
  global?: { compteurs: { enCours: number; enAttente: number } }
  pied?: Ligne[]
  dossiers?: Record<string, string>
}
// A project's board as the pane read it in its folder: the board, or the fault that kept it out.
export type Lu = { dossier: string; tableau: Tableau | null; erreur: string | null }
// `choisi`: the ticket whose card the pane shows; `element`: the line the keyboard is on; `grand`:
// the card fills the pane; `vue`: the lines shown, the board's, the states' view or one folded
// group's (`groupe`, its key); `texte`: the
// whole text of the ticket the filled card shows, read from Beads; `projets`: the folders of the
// projects the pane shows beside the session's, kept for the session's folder.
export type Etat = {
  tableau: Tableau | null
  erreur: string | null
  lu: number
  choisi: string | null
  element: string | null
  grand: boolean
  vue: 'tableau' | 'etats' | 'groupe'
  groupe: string | null
  texte: { id: string; contenu: string } | null
  projets: string[]
}

declare module 'claude-code' {
  interface PluginState {
    grillhouse: { etat: Etat }
  }
}
