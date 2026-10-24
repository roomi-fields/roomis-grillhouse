export type Ton = 'titre' | 'alerte' | 'attention' | 'actif' | 'discret'
// `ticket`: the id of the ticket a line names, which makes the line selectable. `chantier`: the line is an epic's, which the pane switches on or off. `section`: the board's
// section the line belongs to. `groupe`: the key of the folded group the line stands for, which `o`
// opens.
export type Section = 'agents' | 'chantier' | 'faits' | 'etats'
export type Ligne = {
  texte: string
  ton?: Ton
  ticket?: string
  chantier?: boolean
  section: Section
  groupe?: string
  avancement?: boolean
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
// cards, and the ticket that moved last.
export type Tableau = {
  lignes: Ligne[]
  vueEtats?: Ligne[]
  groupes?: Record<string, Ligne[]>
  fiches: Record<string, Fiche>
  dernier?: string | null
}
// `choisi`: the ticket whose card the pane shows; `element`: the line the keyboard is on; `grand`:
// the card fills the pane; `vue`: the lines shown, the board's, the states' view or one folded
// group's (`groupe`, its key); `texte`: the
// whole text of the ticket the filled card shows, read from Beads.
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
}

declare module 'claude-code' {
  interface PluginState {
    grillhouse: { etat: Etat }
  }
}
