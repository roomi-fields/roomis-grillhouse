export type Liste = { id: string; titre: string; priorite: number }[]
export type Compteurs = { enCours: number; prets: number; bloques: number; aValider: number; fermes: number }
export type Epopee = {
  id: string
  titre: string
  priorite: number
  enCours: boolean
  compteurs: Compteurs
  tickets: { enCours: Liste; prets: Liste; bloques: Liste; aValider: Liste; fermes: Liste }
  jetons: number
}
export type Mesure = { duree: number; travail: number; jetons: number; cache: number }
export type Vivant = { type: string; ticket?: string; pid?: number; depuis: number; silence?: number | null }
export type Tableau = {
  projet: Compteurs
  epopees: Epopee[]
  suivants: Liste
  epopeesSuivantes: Liste
  tickets: Record<string, Mesure>
  supervision: { jetons: number; cache: number; travail: number }
  vivant: Vivant[]
  alertes: { niveau: string; texte: string }[]
}
export type Etat = { tableau: Tableau | null; erreur: string | null; lu: number }

declare module 'claude-code' {
  interface PluginState {
    grillhouse: { etat: Etat }
  }
}
