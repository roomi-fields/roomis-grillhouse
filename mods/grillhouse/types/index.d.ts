export type Ton = 'titre' | 'alerte' | 'attention' | 'actif' | 'discret'
export type Ligne = { texte: string; ton?: Ton }
// What the mod reads of `scripts/tableau.mjs`: the board's lines, laid out there, and the status line.
export type Tableau = { lignes: Ligne[]; etat: string }
export type Etat = { tableau: Tableau | null; erreur: string | null; lu: number }

declare module 'claude-code' {
  interface PluginState {
    grillhouse: { etat: Etat }
  }
}
