// The module a test file imports that Vitest did not find, read from the message of its load
// failure: the path the import names, resolved from the test file. A test written before its code
// imports the module the ticket creates; that load failure is its red, as a test target that does
// not compile is in a compiled language (`echecDeCompilation` of cargo and c). An import of a
// package (a bare name) is no module of the project: null.
import path from 'node:path';

const DE_VITEST = /Failed to load url (\S+) \(resolved id: [^)]*\)/;
const DE_NODE = /Cannot find module '([^']+)'/;

/**
 * The absolute path of the module the load failure <message> of the test file <fichier> names as
 * absent, or null when the message names none or names a package.
 * @param {string} message
 * @param {string} fichier
 * @returns {string | null}
 */
export function moduleAbsent(message, fichier) {
  const nomme = (DE_VITEST.exec(message) ?? DE_NODE.exec(message))?.[1];
  if (!nomme || !(nomme.startsWith('.') || path.isAbsolute(nomme))) {
    return null;
  }
  return path.resolve(path.dirname(fichier), nomme);
}
