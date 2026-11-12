// The reading of the command line of `grillhouse circuit` (./commande.ts runs it): its options, their
// combinations, and the text of the refusal of a fresh launch after `--arreter`.
import { ETAPES_DE_REPRISE } from './contrat.js';

export const USAGE =
  'usage: npx grillhouse circuit <ticket> [--reprendre [--contexte <texte>] | ' +
  '--depuis <testwriter|preuve|developpeur|controles|passe-finale> --contexte <texte> | ' +
  '--etendre <paquet>[,<paquet>…] [--contexte <texte>] | --arreter [--contexte <motif>] | ' +
  '--reporter <heure> [--contexte <motif>] | ' +
  '--recommencer]\n';

/** A malformed call, by its reason. */
export class Usage extends Error {}

/** What the command line asks. */
export interface Appel {
  ticket: string;
  reprendre: boolean;
  depuis: (typeof ETAPES_DE_REPRISE)[number] | null;
  etendre: string[] | null;
  arreter: boolean;
  /** The hour its question waits for (`bd update --defer`), the circuit left in its wait. */
  reporter: string | null;
  recommencer: boolean;
  contexte: string | null;
}

/** The refusal of a fresh launch of <ticket> whose circuit was stopped on the supervisor's word. */
export const refusDuLancementApresArret = (ticket: string): string =>
  `le circuit de ${ticket} est arrêté sur le mot du superviseur : \`--reprendre\`, ` +
  `\`--depuis <testwriter|developpeur> --contexte <texte>\` ou \`--recommencer\` (copie fraîche, ` +
  'départ du testwriter) le rouvre.';

/** The call <argv> read, or a Usage, by the rules of the circuit's options. */
export function lireLAppel(argv: string[]): Appel {
  let ticket: string | null = null;
  const o: Omit<Appel, 'ticket'> = {
    reprendre: false,
    depuis: null,
    etendre: null,
    arreter: false,
    reporter: null,
    recommencer: false,
    contexte: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const suivant = argv[i + 1];
    if (a === '--reprendre') {
      o.reprendre = true;
    } else if (a === '--arreter') {
      o.arreter = true;
    } else if (a === '--reporter') {
      if (suivant === undefined || suivant.startsWith('-')) {
        throw new Usage('--reporter attend son heure (+6h, demain, 2026-11-13 08:00).');
      }
      o.reporter = suivant;
      i++;
    } else if (a === '--recommencer') {
      o.recommencer = true;
    } else if (a === '--etendre') {
      const liste = String(suivant ?? '')
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);
      if (!liste.length || suivant!.startsWith('-')) {
        throw new Usage('--etendre attend les paquets que le plan gagne.');
      }
      o.etendre = liste;
      i++;
    } else if (a === '--depuis') {
      if (!ETAPES_DE_REPRISE.includes(suivant as (typeof ETAPES_DE_REPRISE)[number])) {
        throw new Usage(`--depuis attend une étape du ticket : ${ETAPES_DE_REPRISE.join(', ')}.`);
      }
      o.depuis = suivant as (typeof ETAPES_DE_REPRISE)[number];
      i++;
    } else if (a === '--contexte') {
      if (suivant === undefined) {
        throw new Usage('--contexte attend son texte.');
      }
      o.contexte = suivant;
      i++;
    } else if (a.startsWith('-')) {
      throw new Usage(`option inconnue : ${a}`);
    } else if (ticket) {
      throw new Usage(`un seul ticket : ${ticket}, puis ${a}.`);
    } else {
      ticket = a;
    }
  }
  if (!ticket) {
    throw new Usage('le ticket manque.');
  }
  if (o.reporter && (o.reprendre || o.depuis || o.etendre || o.arreter || o.recommencer)) {
    throw new Usage('--reporter va seule, son motif en --contexte : le circuit reste en attente.');
  }
  if (o.recommencer && (o.reprendre || o.depuis || o.etendre || o.arreter)) {
    throw new Usage('--recommencer va seule : le circuit repart à neuf, sans réponse ni contexte.');
  }
  if (o.depuis && o.reprendre) {
    throw new Usage('--depuis et --reprendre ne vont pas ensemble.');
  }
  if (o.depuis && o.contexte === null) {
    throw new Usage('--depuis attend son --contexte : la tâche de chaque agent du lot.');
  }
  if (o.etendre && (o.reprendre || o.depuis || o.arreter)) {
    throw new Usage(
      '--etendre va seule, avec son --contexte : le circuit reprend sur le plan étendu.'
    );
  }
  if (o.arreter && (o.reprendre || o.depuis)) {
    throw new Usage('--arreter va seule, son motif en --contexte.');
  }
  return { ticket, ...o };
}
