// The script of the tests is named `test:unit`, the same for every language. Mechanism:
// installation.md §5.4 (packages/grillhouse/docs/architecture/).
//
// - Each package.json of the root and of the frame's packages (scripts/paquets.mjs) holding
//   `test:vitest` has it named `test:unit`, command and place kept; with a `test:unit` of another
//   command, nothing is written (`aFaire`).
// - Each turbo.json(c) naming the task `test:vitest` (a task, `^test:vitest`, `<paquet>#test:vitest`)
//   names `test:unit`; one naming both is left to the project.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { paquets } from '../paquets.mjs';

export const version = '0.25.0';
export const nom = 'nom du script des tests';

const ANCIEN = 'test:vitest';
const NOUVEAU = 'test:unit';
// The task of the former name in the text of a turbo.json: a key or an entry of `dependsOn`.
const TACHE = /(?<=["^#])test:vitest(?=")/g;
const TACHE_NEUVE = /(?<=["^#])test:unit(?=")/;

const lireJson = f => JSON.parse(readFileSync(f, 'utf8'));
const ecrireJson = (f, v) => writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`);

// The directories of the project at <projet> whose files this migration reads: the root, then
// each package of the frame.
const dossiers = projet => [
  '.',
  ...paquets(projet)
    .filter(p => !p.hors)
    .map(p => p.dossier),
];

// The script of the package.json <rel> of <projet>; what it did, or what it leaves.
function renommerLeScript(projet, rel) {
  const f = path.join(projet, rel);
  if (!existsSync(f)) {
    return [];
  }
  const pkg = lireJson(f);
  const scripts = pkg.scripts;
  if (!scripts || !Object.hasOwn(scripts, ANCIEN)) {
    return [];
  }
  if (Object.hasOwn(scripts, NOUVEAU) && scripts[NOUVEAU] !== scripts[ANCIEN]) {
    return [
      {
        aFaire: `${rel} : ${ANCIEN} et ${NOUVEAU} y portent deux commandes (« ${scripts[ANCIEN]} », « ${scripts[NOUVEAU]} ») ; garder la bonne sous ${NOUVEAU} et retirer ${ANCIEN}.`,
      },
    ];
  }
  const double = Object.hasOwn(scripts, NOUVEAU);
  pkg.scripts = Object.fromEntries(
    Object.entries(scripts).flatMap(([k, v]) => {
      if (k !== ANCIEN) {
        return [[k, v]];
      }
      return double ? [] : [[NOUVEAU, v]];
    })
  );
  ecrireJson(f, pkg);
  return [`${rel} : le script ${ANCIEN} devient ${NOUVEAU}`];
}

// The task of the turbo.json <rel> of <projet>; what it did, or what it leaves.
function renommerLaTache(projet, rel) {
  const f = path.join(projet, rel);
  if (!existsSync(f)) {
    return [];
  }
  const texte = readFileSync(f, 'utf8');
  if (texte.search(TACHE) < 0) {
    return [];
  }
  if (TACHE_NEUVE.test(texte)) {
    return [
      {
        aFaire: `${rel} : les tâches ${ANCIEN} et ${NOUVEAU} y sont toutes deux ; garder ${NOUVEAU} et retirer ${ANCIEN}.`,
      },
    ];
  }
  writeFileSync(f, texte.replace(TACHE, NOUVEAU));
  return [`${rel} : la tâche ${ANCIEN} devient ${NOUVEAU}`];
}

/** Names `test:unit` the script and the task of the tests of the project; returns what it did. */
export function migrer(projet) {
  const ds = dossiers(projet);
  const rel = (d, n) => (d === '.' ? n : path.posix.join(d, n));
  return [
    ...ds.flatMap(d => renommerLeScript(projet, rel(d, 'package.json'))),
    ...ds.flatMap(d =>
      ['turbo.json', 'turbo.jsonc'].flatMap(n => renommerLaTache(projet, rel(d, n)))
    ),
  ];
}
