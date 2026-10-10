export type Ton = 'titre' | 'alerte' | 'attention' | 'actif' | 'discret'
// `ticket`: the id of the ticket a line names, which makes the line selectable. `replie`: the
// lines a counting line (« + 3 en attente ») folds, which the pane unfolds when it is reached.
export type Ligne = { texte: string; ton?: Ton; ticket?: string; replie?: Ligne[] }
export type Fiche = {
  numero: string
  titre: string
  composant: string
  statut: string
  duree: number
  jetons: number
  resume: string
  texte?: string
}
// What the mod reads of `scripts/tableau.mjs`: the board's lines, laid out there, their cards, and
// the ticket that moved last.
export type Tableau = { lignes: Ligne[]; fiches: Record<string, Fiche>; dernier?: string | null }
// `choisi`: the ticket whose card the pane shows; `element`: the line the keyboard is on;
// `ouvert`: the counting line unfolded, by its index; `grand`: the card fills the pane.
export type Etat = {
  tableau: Tableau | null
  erreur: string | null
  lu: number
  choisi: string | null
  element: string | null
  ouvert: number | null
  grand: boolean
}

declare module 'claude-code' {
  interface PluginState {
    grillhouse: { etat: Etat }
  }
}
