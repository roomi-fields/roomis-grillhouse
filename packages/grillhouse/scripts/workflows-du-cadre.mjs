// The frame's workflows of GitHub Actions in a project, as a generator rewrites the file whose
// header says it generated it (the « Généré par … ; ne pas éditer » of the frame's generated files):
// the CI of a lot (`ci.yml`) and the night of a shared machine (`nuit.yml`), the template's
// `.github/workflows/` (templates/projet), which `grillhouse init` copies and `grillhouse maj`
// keeps (scripts/grillhouse-maj.mjs).
//
// - A workflow of the frame bears MARQUE on its first line. The update rewrites each workflow of the
//   template that the project holds with it, when its text differs; one without it is the project's,
//   and stays as it is.
// - A project that holds a workflow of the frame has adopted the frame's CI: it receives each
//   workflow of the template it lacks (the night, for a project that adopted the CI alone). A
//   project that holds none receives none: the update starts no CI on its repository.
// - The machine of the jobs is the repository's variable RUNNER (`vars.RUNNER`), which lives in the
//   settings of the repository on GitHub, never in a file: the template writes no value of it.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The directory of the workflows, in a project as in the template. */
export const WORKFLOWS = '.github/workflows';
/** The template whose workflows are the frame's, from the frame's files. */
export const GABARIT_DES_WORKFLOWS = path.join('templates', 'projet', WORKFLOWS);
/** The head of the first line of a workflow the frame writes. */
export const MARQUE = '# Généré par `npx grillhouse maj`';

/** Whether the text <texte> of a workflow is the frame's: its first line begins with MARQUE. */
export const estDuCadre = texte => texte.split(/\r?\n/, 1)[0].startsWith(MARQUE);

const ESTUN_WORKFLOW = /\.ya?ml$/;

// The names of the workflows of the directory <dossier>, sorted; none when it does not exist.
const workflowsDe = dossier =>
  existsSync(dossier)
    ? readdirSync(dossier)
        .filter(f => ESTUN_WORKFLOW.test(f))
        .sort()
    : [];

/**
 * Whether the project at <projet> holds a workflow of the frame: it has adopted the frame's CI.
 * @param {string} projet
 */
export function aLaCiDuCadre(projet) {
  const dossier = path.join(projet, WORKFLOWS);
  return workflowsDe(dossier).some(f => estDuCadre(readFileSync(path.join(dossier, f), 'utf8')));
}

/**
 * Brings the frame's workflows of the project at <projet> to the template of the frame's files at
 * <source> (see the header). Returns the names of the workflows written, from the project's root,
 * none when nothing changes.
 * @param {string} projet
 * @param {string} source
 * @returns {string[]}
 */
export function poserLesWorkflows(projet, source) {
  const modeles = path.join(source, GABARIT_DES_WORKFLOWS);
  const dossier = path.join(projet, WORKFLOWS);
  if (!aLaCiDuCadre(projet)) {
    return [];
  }
  const ecrits = [];
  for (const nom of workflowsDe(modeles)) {
    const voulu = readFileSync(path.join(modeles, nom), 'utf8');
    const f = path.join(dossier, nom);
    const actuel = existsSync(f) ? readFileSync(f, 'utf8') : null;
    if (actuel === voulu || (actuel !== null && !estDuCadre(actuel))) {
      continue;
    }
    mkdirSync(dossier, { recursive: true });
    writeFileSync(f, voulu);
    ecrits.push(`${WORKFLOWS}/${nom}`);
  }
  return ecrits;
}

