// The program of the acts of a machine of trial (GRILLHOUSE_ACTE_DU_CIRCUIT), for the test of an
// act stopped while its command runs (./circuit.nuit.spec.ts): it answers each act of the circuit
// (scripts/faits-du-circuit.mjs, its same protocol) with a ticket of trial, and its first fact
// launches a command in its own process group, as a rebase or a verification runs under an act,
// which ignores SIGTERM and writes its pid in GRILLHOUSE_TRACE_D_ESSAI; the fact never answers.
import { spawn } from 'node:child_process';

const dire = (genre, valeur) => process.stdout.write(`${genre} ${JSON.stringify(valeur)}\n`);
const trace = process.env.GRILLHOUSE_TRACE_D_ESSAI;
const TESTS = { etape: 'testwriter', tentative: 1, rapport: null, finale: false };

const ACTES = {
  ouvrir: () => ({
    ouverture: {
      debut: TESTS,
      memoire: {},
      ticket: { id: 'essai-1', paquets: ['.'], sorte: null, copie: process.cwd() },
    },
    effets: [],
  }),
  preparer: ({ etape }) => ({ memoire: {}, etat: etape, menee: null, effets: [] }),
  fait: () => {
    spawn('sh', ['-c', `trap '' TERM; echo $$ > ${trace}; while :; do sleep 0.2; done`], {
      stdio: 'ignore',
    });
    return new Promise(() => {});
  },
  effets: () => ({ effets: [] }),
  arret: ({ etat }) => ({ code: 13, nom: 'besoin', question: null, etat, effets: [] }),
  fin: () => ({ effets: [] }),
  arreter: () => ({ effets: [] }),
  effet: () => null,
};

let entree = '';
process.stdin.on('data', d => (entree += d));
process.stdin.on('end', async () =>
  dire('resultat', await ACTES[process.argv[2]](JSON.parse(entree)))
);
