export type Ton = 'titre' | 'alerte' | 'attention' | 'actif' | 'discret'
// `ticket`: the id of the ticket a line names, which makes the line selectable. `replie`: the
// lines a counting line (« + 2 prêts ») folds, which the pane unfolds when it is reached.
// `chantier`: the line is an epic's, which the pane switches on or off. `section`: the board's
// section the line belongs to.
export type Section = 'agents' | 'chantier' | 'faits'
export type Ligne = {
  texte: string
  ton?: Ton
  ticket?: string
  replie?: Ligne[]
  chantier?: boolean
  section: Section
}
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
// `ouverts`: the counting lines unfolded, by the key of their Button, the widest first; `grand`:
// the card fills the pane.
export type Etat = {
  tableau: Tableau | null
  erreur: string | null
  lu: number
  choisi: string | null
  element: string | null
  ouverts: string[]
  grand: boolean
}

declare module 'claude-code' {
  interface PluginState {
    grillhouse: { etat: Etat }
  }
}
