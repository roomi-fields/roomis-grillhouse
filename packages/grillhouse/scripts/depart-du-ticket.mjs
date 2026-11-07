// The ticket a circuit starts on, read before any work, as a CI validates its configuration before
// it runs its jobs: `npx grillhouse circuit` refuses at the door what the circuit could not run
// (src/temporal/circuit/commande.ts), and the opening of each act of the circuit reads its plan
// the same way (scripts/circuit.mjs `contexte`).
//
// - The ticket is read by `bd show <id> --json` in the main tree; one Beads cannot show is refused.
// - Its description holds a « ## Architecture » section, by the rule of the developer's lock
//   (`sansArchitecture` of ./verrous/verrou.mjs): the code waits for the architecture. The
//   supervisor's stop (`--arreter`) reads neither it nor the title: it does not depend on the
//   ticket's content, as GitLab cancels a pipeline whatever its configuration; its plan is empty.
// - Its title names its plan after its last « — », separated by commas: each one a path
//   (`packages/<nom>`, or `.`), or the name of a package, which becomes its directory, read in the
//   ticket's copy when it exists, else in the main tree (`composantsDe`). A title without it, and
//   a component that names neither, are refused by their name. An act after the opening is given
//   the plan its workflow holds (<plan>) and reads only the subject of the title: the integration
//   removes the ticket's copy while the circuit still runs, and a component the lot creates is in
//   neither tree then.
// Each refusal is a `DepartRefuse`, its reason its message.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { composantsDe } from './ticket-du-circuit.mjs';
import { sansArchitecture } from './verrous/verrou.mjs';

/** A ticket a circuit cannot start on, by its reason. */
export class DepartRefuse extends Error {
  constructor(message) {
    super(message);
    this.name = 'DepartRefuse';
  }
}

/**
 * The directory of the component <nom> of a title among <liste> (`composantsDe` of the repository
 * at <base>): `.` itself; a component by its path or its name; else a path of the repository; or a
 * refusal.
 */
export function resoudreComposant(liste, base, nom) {
  const brut = path.normalize(nom);
  const norme = brut.endsWith('/') ? brut.slice(0, -1) : brut;
  if (norme === '.') {
    return '.';
  }
  if (liste.some(p => p.dossier === norme)) {
    return norme;
  }
  const parNom = liste.find(p => p.pkg.name === nom);
  if (parNom) {
    return parNom.dossier;
  }
  if (!norme.startsWith('..') && existsSync(path.join(base, norme))) {
    return norme;
  }
  throw new DepartRefuse(
    `le composant « ${nom} » du titre ne nomme ni un paquet ni un chemin du dépôt.`
  );
}

/**
 * The ticket <id> as `bd show --json` gives it in <sortie>, refused when its description holds no
 * « ## Architecture » section, unless the call is the supervisor's stop (<arreter>).
 */
export function ticketAuDepart(id, sortie, { arreter = false } = {}) {
  const t = JSON.parse(sortie)[0];
  const refus = arreter ? null : sansArchitecture(id, t?.description);
  if (refus) {
    throw new DepartRefuse(refus);
  }
  return t;
}

// The subject of the title cut at its « — » into <parts>: what stands between the number and the
// components, or the first part of a title of two.
const sujetDe = parts => (parts.length > 2 ? parts.slice(1, -1).join(' — ') : parts[0]);

/**
 * The subject and the plan of the title <titre> of the ticket <id>, « numéro — sujet —
 * composants », each component resolved by <resoudre>; or a refusal.
 */
export function leTitre(id, titre, resoudre) {
  const parts = String(titre ?? '').split(' — ');
  if (parts.length < 2) {
    throw new DepartRefuse(`le titre de ${id} ne nomme pas ses composants.`);
  }
  return {
    sujet: sujetDe(parts),
    plan: parts
      .at(-1)
      .split(',')
      .map(c => c.trim())
      .filter(Boolean)
      .map(resoudre),
  };
}

/**
 * The ticket <id> of the repository whose main tree is <racine>, read before any work: the ticket
 * as Beads shows it, the tree its components are read in (`base`, its copy when it exists), the
 * components of that tree, the resolver of a component, the subject and the plan of its title (the
 * title whole and no plan for the supervisor's stop, <arreter>; the plan <plan> an act after the
 * opening is given, its components not resolved again); or a refusal. <bd> runs bd in the main
 * tree, `bd` by default.
 */
export function ticketAuLancement(racine, id, { arreter = false, bd = null, plan = null } = {}) {
  const show = (
    bd ??
    ((...a) => spawnSync('bd', a, { cwd: racine, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }))
  )('show', id, '--json');
  if (show.status !== 0) {
    throw new DepartRefuse(`ticket ${id} illisible : ${show.stderr}`);
  }
  const ticket = ticketAuDepart(id, show.stdout, { arreter });
  const copie = path.join(racine, '.claude', 'worktrees', id);
  const base = existsSync(copie) ? copie : racine;
  const liste = composantsDe(base);
  const resoudre = nom => resoudreComposant(liste, base, nom);
  // The supervisor's stop reads neither the ticket's « ## Architecture » section nor its title.
  const titre = arreter
    ? { sujet: String(ticket?.title ?? id), plan: [] }
    : plan
      ? { sujet: sujetDe(String(ticket?.title ?? '').split(' — ')), plan }
      : leTitre(id, ticket?.title, resoudre);
  return { ticket, base, liste, resoudre, ...titre };
}
