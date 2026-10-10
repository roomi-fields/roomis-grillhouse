export type Ton = 'titre' | 'alerte' | 'attention' | 'actif' | 'discret'
// `ticket`: the id of the ticket a line names, which makes the line selectable.
export type Ligne = { texte: string; ton?: Ton; ticket?: string }
export type Fiche = {
  numero: string
  titre: string
  composant: string
  statut: string
  duree: number
  jetons: number
  resume: string
}
// What the mod reads of `scripts/tableau.mjs`: the board's lines, laid out there, and their cards.
export type Tableau = { lignes: Ligne[]; fiches: Record<string, Fiche> }
// `choisi`: the ticket whose card the pane shows.
export type Etat = { tableau: Tableau | null; erreur: string | null; lu: number; choisi: string | null }

declare module 'claude-code' {
  interface PluginState {
    grillhouse: { etat: Etat }
  }
}
