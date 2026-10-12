export type Ton = 'titre' | 'alerte' | 'attention' | 'actif' | 'discret'
// `ticket`: the id of the ticket a line names, which makes the line selectable. `chantier`: the line is an epic's, which the pane switches on or off. `section`: the board's
// section the line belongs to.
export type Section = 'agents' | 'chantier' | 'faits' | 'etats'
export type Ligne = {
  texte: string
  ton?: Ton
  ticket?: string
  chantier?: boolean
  section: Section
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
// What the mod reads of `scripts/tableau.mjs`: the board's lines, laid out there, the states' view
// (`vueEtats`: each state, its meaning, its tickets), their cards, and the ticket that moved last.
export type Tableau = {
  lignes: Ligne[]
  vueEtats?: Ligne[]
  fiches: Record<string, Fiche>
  dernier?: string | null
}
// `choisi`: the ticket whose card the pane shows; `element`: the line the keyboard is on; `grand`:
// the card fills the pane; `vue`: the lines shown, the board's or the states' view; `texte`: the
// whole text of the ticket the filled card shows, read from Beads.
export type Etat = {
  tableau: Tableau | null
  erreur: string | null
  lu: number
  choisi: string | null
  element: string | null
  grand: boolean
  vue: 'tableau' | 'etats'
  texte: { id: string; contenu: string } | null
}

declare module 'claude-code' {
  interface PluginState {
    grillhouse: { etat: Etat }
  }
}
