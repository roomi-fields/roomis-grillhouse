#!/usr/bin/env node
// The summary of the circuit's state of a ticket, bounded, as `kubectl describe` or `gh run view`
// give a view of an object in place of its raw record: the regulator reads the state by it (its
// instruction names it), since the state, its report carrying the detail of a final pass, can pass
// the limit of the tool Read (BPScript 320.4: 33 k tokens, past the 25 k of Read).
//
//   node scripts/etat-du-circuit.mjs <état>      <état> the path of `<copie>.circuit.json`
//
// prints, in BORNE characters at most: the step (« 2.3 Code ») and its component, its attempt and
// its loops; the stop, its name and code; the components of the title and those reached; the
// returns kept for a component; the last reds of the report (its lines `- …`); the head of the
// report; and the files: the ticket's log, its proofs (the last ones), its sheets, and what the
// copy changes against HEAD (`git status --porcelain`). Each line is cut to LIGNE characters. An
// unreadable state is said on stderr, exit 1.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { etapeDuCircuit, libelle } from './etapes.mjs';

// The bound of the summary, in characters: under the 25 000 tokens of Read at any count of
// characters per token above 1.
export const BORNE = 20_000;
const LIGNE = 300;
const ROUGES = 20;
const TETE = 30;
const PREUVES = 3;
const CHANGES = 40;

const couper = l => (l.length > LIGNE ? `${l.slice(0, LIGNE - 1)}…` : l);
// The <n> first (or, <fin>, last) items of <liste>, the rest counted.
function borner(liste, n, fin = false) {
  if (liste.length <= n) return liste;
  const reste = `… ${liste.length - n} de plus`;
  return fin ? [reste, ...liste.slice(-n)] : [...liste.slice(0, n), reste];
}

// The summary of the state in the file <fichier>; throws when it cannot be read.
export function resumeDeLEtat(fichier) {
  const etat = JSON.parse(readFileSync(fichier, 'utf8'));
  const copie = fichier.replace(/\.circuit\.json$/, '');
  const ticket = path.basename(copie);
  const e = etapeDuCircuit(etat);
  const rapport = String(etat.rapport ?? '')
    .split('\n')
    .map(l => l.trimEnd());
  const rouges = rapport.filter(l => /^\s*- /.test(l)).map(l => l.trim());
  const dossier = path.dirname(fichier);
  const preuves = existsSync(dossier)
    ? readdirSync(dossier)
        .map(f => [
          f,
          new RegExp(
            `^${ticket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.preuve-(\\d+)\\.md$`
          ).exec(f),
        ])
        .filter(([, m]) => m)
        .sort(([, a], [, b]) => Number(a[1]) - Number(b[1]))
        .map(([f]) => path.join(dossier, f))
    : [];
  const statut = existsSync(copie)
    ? spawnSync('git', ['-C', copie, 'status', '--porcelain'], { encoding: 'utf8' })
    : null;
  const changes = statut?.status === 0 ? statut.stdout.split('\n').filter(Boolean) : [];
  const renvois = Object.entries(etat.renvois ?? {}).map(
    ([c, r]) => `- ${c} → ${r?.etape ?? '?'} : ${String(r?.[r?.etape] ?? '').replace(/\s+/g, ' ')}`
  );
  const lignes = [
    `L'ÉTAT DU CIRCUIT de ${ticket} (${fichier})`,
    '',
    `Étape : ${e ? libelle(e) : etat.etape} — composant ${etat.composant ?? 'aucun'} — tentative ${etat.tentative ?? 0}${etat.boucles ? ` — boucles ${JSON.stringify(etat.boucles)}` : ''}`,
    `Arrêt : ${etat.raison ?? 'aucun'} (code ${etat.code ?? 'aucun'})`,
    `Composants du titre : ${(etat.composants ?? []).join(', ') || 'aucun'}`,
    `Atteints : ${(etat.atteints ?? []).join(', ') || 'aucun'}`,
    ...(renvois.length ? ['', 'Renvois :', ...renvois] : []),
    '',
    `Les derniers rouges du rapport (${rouges.length}) :`,
    ...(rouges.length ? borner(rouges, ROUGES, true) : ['aucun']),
    '',
    `Le rapport, sa tête (${rapport.length} lignes ; le détail est au journal) :`,
    ...borner(rapport, TETE),
    '',
    'Les fichiers :',
    `- le journal : ${etat.journal ?? `${copie}.log`}`,
    ...borner(preuves, PREUVES, true).map(p => (p.startsWith('…') ? p : `- une preuve : ${p}`)),
    `- les fiches : ${copie}.fiches.jsonl`,
    `- ce que la copie change (${changes.length}) :`,
    ...(changes.length ? borner(changes, CHANGES) : ['aucun']),
  ].map(couper);
  let texte = `${lignes.join('\n')}\n`;
  if (texte.length > BORNE) texte = `${texte.slice(0, BORNE - 2)}…\n`;
  return texte;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const fichier = process.argv[2];
  try {
    if (!fichier) throw new Error('usage : etat-du-circuit.mjs <état>');
    process.stdout.write(resumeDeLEtat(path.resolve(fichier)));
  } catch (e) {
    process.stderr.write(`etat-du-circuit.mjs : ${fichier ?? ''} illisible : ${e.message}\n`);
    process.exitCode = 1;
  }
}
