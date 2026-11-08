// The program of the acts of a machine of trial (GRILLHOUSE_ACTE_DU_CIRCUIT), for the test of the
// death of the worker during a session (./circuit.nuit.spec.ts, criterion 6): it answers each act of
// the circuit (scripts/faits-du-circuit.mjs, its same protocol) with a ticket of trial whose only
// session is a true one (`jusquALaFiche` of scripts/seances.mjs, out of the envelope), its agent a
// fake claude that ends at once without a sheet and leaves in its group, at its first launch, a
// process that lasts until the test writes the file `libere` beside the trace; each attempt of a
// fact (its key), each launch and each end of that process are written in the trace
// GRILLHOUSE_TRACE_D_ESSAI, with their time in ms, and the process group of each launch
// (`groupe`), which the test kills at its end, red or green.
import { appendFileSync, chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { jusquALaFiche } from '../../scripts/seances.mjs';

const dire = (genre, valeur) => process.stdout.write(`${genre} ${JSON.stringify(valeur)}\n`);
const trace = process.env.GRILLHOUSE_TRACE_D_ESSAI;
const dossier = path.dirname(trace);
const TESTS = { etape: 'testwriter', tentative: 1, rapport: null, finale: false };

async function seance(precedent, essai) {
  const faux = path.join(dossier, 'claude');
  if (!existsSync(faux)) {
    writeFileSync(
      faux,
      `#!/bin/sh\necho "lance $(($(date +%s%N)/1000000))" >> ${trace}\necho "groupe $(ps -o pgid= $$ | tr -d ' ')" >> ${trace}\nif [ ! -e ${dossier}/premier ]; then touch ${dossier}/premier; (while [ ! -e ${dossier}/libere ]; do sleep 0.2; done; echo "fin $(($(date +%s%N)/1000000))" >> ${trace}) & fi\nexit 0\n`
    );
    chmodSync(faux, 0o755);
  }
  process.env.CLAUDE_BIN = faux;
  process.env.GRILLHOUSE_REGISTRE = path.join(dossier, 'registre.jsonl');
  const ctx = {
    racine: dossier,
    copie: dossier,
    ticket: 'essai-1',
    sujet: 'essai',
    paquets: ['.'],
    tmp: dossier,
    journal: path.join(dossier, 'journal'),
    fiches: path.join(dossier, 'fiches.jsonl'),
    transcriptions: path.join(dossier, 'transcriptions'),
    immobileMs: 600_000,
    essaiDeLActe: essai ?? 1,
    bd: () => ({ status: 0, stdout: '[{}]', stderr: '' }),
  };
  try {
    return await jusquALaFiche(ctx, 'relecteur', 'consigne', {
      id: 'seance-essai',
      evenement: 'neuve',
      horsEnveloppe: true,
      prendrePlace: () => ({ rattacher: () => {}, rendre: () => {} }),
      signeDeVie: vie => dire('vie', vie),
      precedent,
    });
  } catch {
    return { statut: 'BESOIN' };
  }
}

const ACTES = {
  ouvrir: () => ({
    ouverture: {
      debut: TESTS,
      memoire: {},
      ticket: { id: 'essai-1', paquets: ['.'], sorte: null, copie: dossier },
    },
    effets: [],
  }),
  preparer: ({ etape }) => ({ memoire: {}, etat: etape, menee: null, effets: [] }),
  fait: async ({ fait, precedent, cle, essai }) => {
    if (fait === 'seance') {
      appendFileSync(trace, `tentative ${cle}\n`);
    }
    return {
      valeur: fait === 'seance' ? await seance(precedent, essai) : false,
      memoire: {},
      effets: [],
    };
  },
  effets: () => ({ effets: [] }),
  arret: ({ etat }) => ({ code: 13, nom: 'besoin', question: null, etat, effets: [] }),
  fin: () => ({ effets: [] }),
  arreter: () => ({ effets: [] }),
  effet: () => null,
};

// A worker gone closes the output: the act ends there.
process.stdout.on('error', () => process.exit(1));
const travailleur = process.ppid;
setInterval(() => {
  if (process.ppid !== travailleur) {
    process.exit(1);
  }
}, 1000).unref();
const entree = JSON.parse(readFileSync(0, 'utf8'));
dire('resultat', await ACTES[process.argv[2]](entree));
