// The program of the acts of a machine of trial (GRILLHOUSE_ACTE_DU_CIRCUIT), for the test of an
// effect whose writing fails (./circuit.nuit.spec.ts, renvoi de 92dead5): it answers each act of the
// circuit (scripts/faits-du-circuit.mjs, its same protocol and its same errors, `erreurDeLActe`)
// with a ticket of trial whose opening gives back one comment; the act `effet` writes it by the
// circuit's own writer (`ecrireLEffet` of scripts/effets.mjs) under a bd that fails at the
// attempts up to GRILLHOUSE_PANNES_D_ESSAI; GRILLHOUSE_EFFET_D_ESSAI names its sort when it is not
// a comment (`plan`, an effect that stops; `autre`, an effect the circuit does not know). Each
// attempt of the effect, and the start of the step that follows, are written in
// GRILLHOUSE_TRACE_D_ESSAI; the fact never answers.
import { appendFileSync } from 'node:fs';
import { ecrireLEffet } from '../../scripts/effets.mjs';
import { erreurDeLActe } from '../../scripts/faits-du-circuit.mjs';

const dire = (genre, valeur) => process.stdout.write(`${genre} ${JSON.stringify(valeur)}\n`);
const trace = process.env.GRILLHOUSE_TRACE_D_ESSAI;
const pannes = Number(process.env.GRILLHOUSE_PANNES_D_ESSAI ?? 0);
const TESTS = { etape: 'testwriter', tentative: 1, rapport: null, finale: false };
const EFFETS = {
  commentaire: { genre: 'commentaire', ticket: 'essai-1', texte: 'ouvert', auteur: 'circuit' },
  plan: { genre: 'plan', titre: 'un titre', description: null },
  autre: { genre: 'autre' },
};

const ACTES = {
  ouvrir: () => ({
    ouverture: {
      debut: TESTS,
      memoire: {},
      ticket: { id: 'essai-1', paquets: ['.'], sorte: null, copie: process.cwd() },
    },
    effets: [EFFETS[process.env.GRILLHOUSE_EFFET_D_ESSAI ?? 'commentaire']],
  }),
  preparer: ({ etape }) => {
    appendFileSync(trace, 'preparer\n');
    return { memoire: {}, etat: etape, menee: null, effets: [] };
  },
  fait: () => new Promise(() => {}),
  effets: () => ({ effets: [] }),
  // A stop written: its name, « inattendu » for an act that failed, and its question.
  arret: ({ etat, arret }) => {
    const nom = arret?.inattendu ? 'inattendu' : 'besoin';
    return {
      code: 13,
      nom,
      question: { arret: nom, fait: nom, piece: null, question: 'que faire ?', qui: 'superviseur' },
      etat,
      effets: [],
    };
  },
  fin: () => ({ effets: [] }),
  arreter: () => ({ effets: [] }),
  effet: ({ effet, cle, essai, derniere }) => {
    const panne = essai <= pannes;
    const ctx = {
      ticket: 'essai-1',
      bd: (...a) =>
        panne
          ? { status: 1, stdout: '', stderr: 'bd en panne' }
          : { status: 0, stdout: a[1] === 'add' ? '' : '[]', stderr: '' },
    };
    try {
      const r = ecrireLEffet(ctx, effet, cle, { reessayer: derniere === false });
      appendFileSync(trace, `effet ${essai} ${r.status === 0 ? 'ecrit' : 'averti'}\n`);
      return null;
    } catch (e) {
      appendFileSync(trace, `effet ${essai} panne\n`);
      throw e;
    }
  },
};

let entree = '';
process.stdin.on('data', d => (entree += d));
process.stdin.on('end', async () => {
  try {
    dire('resultat', await ACTES[process.argv[2]](JSON.parse(entree)));
  } catch (e) {
    dire('erreur', erreurDeLActe(e));
  }
});
