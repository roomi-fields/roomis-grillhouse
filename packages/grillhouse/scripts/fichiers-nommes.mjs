// The files a ticket's description names: a path written from the root, between backticks or bare,
// in its « Architecture » section or in an acceptance criterion. A file named there is one the
// ticket's plan covers by its own word: a write out of the plan in it extends the plan, with the
// piece that names it. A parent directory, a base name alone, another section, and the documents
// the responsable owns (ARCHITECTURE.md, CADRE.md, INTERFACE.md) are not named.

const DOCUMENTS_DU_RESPONSABLE = /(^|\/)(ARCHITECTURE|CADRE|INTERFACE)\.md$/;

// The path <chemin> as a token of <ligne>: delimited by a space, a backtick, a quote, a bracket or
// a comma around it, or by a closing full stop, a colon or a semicolon after it.
function figureDans(ligne, chemin) {
  const echappe = chemin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[\\s\`'"(\\[,])${echappe}($|[\\s\`'")\\],;:]|\\.(\\s|$))`).test(ligne);
}

/**
 * The piece (`{ piece }`, « ticket, § Architecture » or « ticket, critère N ») by which the
 * description <description> names the file <chemin>, or null when it does not.
 */
export function fichierNommeAuTicket(description, chemin) {
  if (!chemin || DOCUMENTS_DU_RESPONSABLE.test(chemin)) {
    return null;
  }
  let section = null;
  let critere = null;
  for (const ligne of String(description ?? '').split('\n')) {
    const titre = /^#{1,6}\s+(.*?)\s*$/.exec(ligne);
    if (titre) {
      const t = titre[1].toLowerCase();
      section = t.startsWith('architecture')
        ? 'architecture'
        : t.startsWith('crit')
          ? 'criteres'
          : null;
      critere = null;
      continue;
    }
    if (section === 'criteres') {
      const numero = /^\s{0,3}(\d+)[.)]\s/.exec(ligne);
      if (numero) {
        critere = numero[1];
      }
    }
    if (!figureDans(ligne, chemin)) {
      continue;
    }
    if (section === 'architecture') {
      return { piece: 'ticket, § Architecture' };
    }
    if (section === 'criteres' && critere) {
      return { piece: `ticket, critère ${critere}` };
    }
  }
  return null;
}
