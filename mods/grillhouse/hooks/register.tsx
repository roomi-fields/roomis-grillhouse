import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Compteurs, Etat, Liste, Tableau } from '../types'

// The board of a Grillhouse project: the status line holds the epic in progress, the pane
// (/grillhouse) the detail. The project's own `scripts/tableau.mjs` measures; this mod draws it,
// every 30 s and after each `bd` or `git` command. It stays silent outside a Grillhouse project
// and inside an agent's copy (`.claude/worktrees/`).
const PANE = 'grillhouse'
const PERIODE = 30_000
const COLONNES = 52
const DOCK = 110

// Where the pane sits, and what it takes to have it docked beside the transcript.
export function placement(p: { isFullscreen: boolean; columns: number }): string {
  if (p.isFullscreen && p.columns >= DOCK) return 'Tableau Grillhouse ouvert sur le côté.'
  const manque = [
    ...(p.isFullscreen ? [] : ["l'affichage plein écran (sans tmux, et sans CLAUDE_CODE_NO_FLICKER=0)"]),
    ...(p.columns >= DOCK ? [] : [`un terminal d'au moins ${DOCK} colonnes (il en a ${p.columns})`]),
  ]
  return `Tableau Grillhouse ouvert au-dessus de la saisie. Pour l'avoir sur le côté : ${manque.join(' et ')}.`
}
const etat = atom({ plugin: 'grillhouse', key: 'etat' } as const, {
  tableau: null,
  erreur: null,
  lu: 0,
} as Etat)

export const k = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : `${n}`
export const duree = (ms: number) => {
  const min = Math.round(ms / 60_000)
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}
export const compteurs = (c: Compteurs) =>
  `${c.enCours} en cours · ${c.prets} prêts · ${c.bloques} bloqués · ${c.aValider} à valider · ${c.reportes} reportés · ${c.fermes} fermés`

// The status line: the epic(s) in progress and their counts, alerts first.
export function ligneEtat(t: Tableau): string {
  const alerte = t.alertes.length ? `⚠ ${t.alertes.length} · ` : ''
  const encours = t.epopees.filter(e => e.enCours)
  if (encours.length === 0) return `${alerte}Grillhouse : ${compteurs(t.projet)}`
  return (
    alerte +
    encours
      .map(e => {
        const c = e.compteurs
        return `${e.id} : ${c.enCours} en cours · ${c.prets + c.bloques + c.aValider} en attente · ${c.fermes} fermés · ${k(e.jetons)} jetons`
      })
      .join(' | ')
  )
}

// The session's project, and whether the board applies to it.
let cwd = ''
let actif = false

// Measures the board again and redraws the status line and the pane.
async function rafraichir($: EngineInterface) {
  if (!actif) return
  const r = await $.process.run(['node', 'scripts/tableau.mjs'], { cwd, timeoutMs: 20_000 })
  if (r.exitCode !== 0) {
    await update($, etat, s => ({ ...s, erreur: r.stderr.slice(0, 300) }))
    return
  }
  const tableau = JSON.parse(r.stdout) as Tableau
  await update($, etat, () => ({ tableau, erreur: null, lu: Date.now() }))
  $.ui.status(ligneEtat(tableau))
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    cwd = e.cwd
    const projet = await $.process.run(['test', '-f', 'scripts/tableau.mjs'], { cwd })
    actif = e.isInteractive && projet.exitCode === 0 && !cwd.includes('/.claude/worktrees/')
    if (!actif) return started
    await $.command.register({
      name: 'grillhouse',
      description: "Ouvre le tableau Grillhouse : épopées, tickets, ordre, jetons et temps, ce qui tourne",
    })
    void rafraichir($)
    $.clock.every(PERIODE, () => void rafraichir($))
    return started
  })

  on('command.run', { command: 'grillhouse' }, async ($, e) => {
    await rafraichir($)
    // A narrow column docked beside the transcript; a short block when seated above the prompt.
    await $.ui.open({ id: PANE, title: 'Grillhouse', columns: COLONNES, rows: 12 })
    return { text: placement(e.presentation) }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (actif && /(^|[\s;&|(])(bd|git)\s/.test(e.command)) void rafraichir($)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { tableau: t, erreur } = await read($, etat)
    if (!t) return <Text dimColor>{erreur ?? 'Lecture du tableau…'}</Text>
    const noms = (l: Liste, n = 6) =>
      l.length === 0
        ? '—'
        : l
            .slice(0, n)
            .map(x => x.id)
            .join(', ') + (l.length > n ? ` (+${l.length - n})` : '')
    const mesure = (id: string) => {
      const m = t.tickets[id]
      return m
        ? ` — ${duree(m.duree)} (agents ${duree(m.travail)}) · ${k(m.jetons)} jetons`
        : ''
    }
    return (
      <Box flexDirection="column">
        {t.alertes.map(a => (
          <Text color={a.niveau === 'rouge' ? 'red' : 'yellow'}>⚠ {a.texte}</Text>
        ))}
        <Text bold>Projet : {compteurs(t.projet)}</Text>
        {t.epopees
          .filter(ep => ep.enCours)
          .map(ep => (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="cyan">
                ▶ {ep.id} — {ep.titre}
              </Text>
              <Text>
                {'  '}
                {compteurs(ep.compteurs)} · {k(ep.jetons)} jetons
              </Text>
              {ep.tickets.enCours.map(x => (
                <Text wrap="truncate-end">
                  {'  ◐ '}
                  {x.id} {x.titre}
                  {mesure(x.id)}
                </Text>
              ))}
              <Text dimColor wrap="truncate-end">
                {'  '}prêts : {noms(ep.tickets.prets)}
              </Text>
              <Text dimColor wrap="truncate-end">
                {'  '}bloqués : {noms(ep.tickets.bloques)}
              </Text>
              <Text color={ep.tickets.aValider.length ? 'yellow' : undefined} wrap="truncate-end">
                {'  '}à valider : {noms(ep.tickets.aValider)}
              </Text>
              <Text dimColor wrap="truncate-end">
                {'  '}reportés : {noms(ep.tickets.reportes)}
              </Text>
              {ep.tickets.fermes.slice(-5).map(x => (
                <Text dimColor wrap="truncate-end">
                  {'  ✓ '}
                  {x.id}
                  {mesure(x.id)}
                </Text>
              ))}
            </Box>
          ))}
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Ordre de passage</Text>
          <Text wrap="truncate-end">
            {'  '}tickets : {noms(t.suivants, 5)}
          </Text>
          <Text wrap="truncate-end">
            {'  '}épopées : {noms(t.epopeesSuivantes, 5)}
          </Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Autres épopées</Text>
          {t.epopees
            .filter(ep => !ep.enCours)
            .map(ep => (
              <Text dimColor wrap="truncate-end">
                {'  '}
                {ep.id} : {compteurs(ep.compteurs)}
              </Text>
            ))}
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Ce qui tourne</Text>
          {t.vivant.length === 0 && <Text dimColor>{'  '}rien</Text>}
          {t.vivant.map(v => (
            <Text>
              {'  ● '}
              {v.type}
              {v.ticket ? ` ${v.ticket}` : ''} depuis {duree(Date.now() - v.depuis)}
            </Text>
          ))}
          <Text dimColor>
            {'  '}supervision : {k(t.supervision.jetons)} jetons
          </Text>
        </Box>
      </Box>
    )
  })
}
