// The resumption of the circuit at the step that carries a red (circuit.md §5.4 and §5.5, « renvoi
// à l'auteur du code »), with no input nor output (as
// scripts/transitions.mjs): the attribution of a red to the step that carries it and the step where
// `--depuis` resumes. Mature model: « Re-run failed jobs » of GitHub Actions (the red job and what
// depends on it replay). The fingerprint of a step, which hashes with `node:crypto`, is in
// scripts/empreinte-d-etape.mjs, on the side of the activities.
import { SUITE } from './etapes.mjs';

const etatDe = n => SUITE.find(e => e.numero === n).etat;

/**
 * The step that carries the red whose places are <lieux> (`{ paquet, fichier, gardes, nommes,
 * dansLePlan }`), by the files the red names against what the testwriter (`portes.tests`) and the
 * developpeur (`portes.code`) wrote: `{ etape, fichiers, motif? }`. A test file of the lot that a
 * guard or the style refuses (`gardes` not empty), or that the message of a failed test out of
 * the lot names (`nommes`, a guard written as a test, which lists what it finds), is the testwriter's, the
 * earliest step (the developpeur replays after him): a red goes to who writes the file it names,
 * as Gerrit gives a failed check back to the author of the file. A test that fails and names no
 * test file of the lot (no guard) and a file of code are the developpeur's. A red
 * that names no file but lies in a package of the plan (a red task: lint, format check, typing,
 * build) is the developpeur's, no file named, as a red job of a CI goes back to its author (the
 * the owner's decision); one out of the plan, or a file nobody wrote, is never
 * attributed (`etape` null, its `motif` said): it goes up.
 */
export function attribuerLeRouge({ lieux, portes }) {
  const avecFichier = (lieux ?? []).filter(l => typeof l.fichier === 'string' && l.fichier);
  const nommes = [...new Set(avecFichier.map(l => l.fichier))];
  if (!nommes.length) {
    return (lieux ?? []).some(l => l.dansLePlan)
      ? { etape: 'developpeur', fichiers: [] }
      : { etape: null, fichiers: [], motif: 'le rouge ne nomme aucun fichier du plan' };
  }
  const tests = new Set(portes.tests);
  const code = new Set(portes.code);
  const inconnus = nommes.filter(f => !tests.has(f) && !code.has(f));
  if (inconnus.length) {
    return {
      etape: null,
      fichiers: [],
      motif: `le rouge nomme ${inconnus.join(', ')}, que ni le testwriter ni le développeur ne portent`,
    };
  }
  // The test files of the lot the message of a failed test out of the lot names.
  const designes = avecFichier
    .filter(l => !tests.has(l.fichier))
    .flatMap(l => l.nommes ?? [])
    .filter(f => tests.has(f));
  // A test file of a reader package extended to its tests (`portes.lecteurs`): the testwriter
  // alone writes it, the developpeur's lock refuses it.
  const lecteurs = new Set(portes.lecteurs ?? []);
  const refuses = [
    ...new Set([
      ...nommes.filter(
        f =>
          tests.has(f) &&
          (lecteurs.has(f) || avecFichier.some(l => l.fichier === f && (l.gardes ?? []).length > 0))
      ),
      ...designes,
    ]),
  ];
  const tous = [...new Set([...nommes, ...designes])];
  return refuses.length
    ? { etape: 'testwriter', fichiers: refuses.length === tous.length ? refuses : tous }
    : { etape: 'developpeur', fichiers: nommes };
}

// The steps `--depuis` names, each with the state it resumes at.
const DEPARTS = {
  testwriter: () => ({ etape: etatDe('2'), tentative: 1, finale: false }),
  preuve: () => ({ etape: etatDe('2.1'), tentative: 1, finale: false }),
  developpeur: () => ({ etape: etatDe('3'), tentative: 1, finale: false }),
  controles: () => ({ etape: etatDe('3.1'), tentative: 0, finale: false }),
  'passe-finale': () => ({ etape: etatDe('3.1'), tentative: 0, finale: true }),
};

/** The steps `--depuis` names. */
export const ETAPES_DE_REPRISE = Object.keys(DEPARTS);

/**
 * The state `--depuis <nom>` resumes at: that step and the ones after it, no fingerprint kept
 * (`verts` empty), so nothing is read back.
 */
export function departDepuis(nom) {
  if (!Object.hasOwn(DEPARTS, nom)) {
    throw new Error(
      `--depuis attend une étape du ticket : ${ETAPES_DE_REPRISE.join(', ')} (reçu « ${nom} »).`
    );
  }
  return { ...DEPARTS[nom](), rapport: null, verts: {} };
}
