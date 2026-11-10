// The types of the shared test material the package's typed tests read
// (`@roomi-fields/grillhouse-matiere/test-fixtures`, which publishes its source, not a built
// declaration): tsconfig.json maps the entry here, so the typing of this package stays on its own
// files. Only the names these tests import are declared.

/** Writes at <repo> the docs/ARCHITECTURE.md of <paquets>: a list of languages (a package each,
 * `paquet-<n>`), or a record of package name to language. */
export function declarerLesLangages(
  repo: string,
  paquets?: string[] | Record<string, string>
): void;
