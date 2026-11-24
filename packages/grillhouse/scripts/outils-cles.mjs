// The reading of the `grillhouse.outils` key of a package.json, the tools of the project:
// `{ "<VARIABLE>": "<chemin>" }`, each path absolute or under `~`. The envelope
// (scripts/enveloppe/enveloppe.mjs) mounts each path read-only and passes each variable to
// the session; the circuit's passes (scripts/circuit.mjs), `npm run verifier`
// (bin/grillhouse.mjs) and the night (scripts/nuit.sh) play with the same variables, so that every
// one of them sees the same tool, whatever its launcher's environment. Architecture:
// docs/architecture/machine.md (§1, §5.5).
//
// - The key is absent, null or an object; each name is a variable's (`[A-Za-z_][A-Za-z0-9_]*`),
//   each value a string, a path absolute or under `~` (the home), that exists. Every fault is named
//   with its key; a faulty key gives no variable.
// - A tool never undoes the envelope: a path is refused, its variable and its path named, when it
//   is `/`, the home or a path that holds it, a path that holds a mount of the envelope (the main
//   tree and its copies, `/tmp` and the temporary directories, and the mounts the envelope names:
//   `~/.claude`, the scratchpads, the npm cache, the session directories), or a path under a hidden
//   directory of the first level of the home (`~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.config`…), where
//   the machine keeps its credentials, but `~/.local` and `~/.cache`; nor under or holding
//   `~/.local/share/keyrings`, the keyrings of the machine's credentials. A path that is a link is
//   judged by its target too, which the envelope mounts with it.
// - A tool is a string path (unhashed) or `{ "chemin": "<chemin>", "contenu": true }`: hashed by
//   content. Its fingerprint
//   (`empreinteDeLOutil`, `empreintesDe`) is given to every pass as `<VARIABLE>_EMPREINTE`, which
//   the root turbo.json's `globalEnv` names so that Turborepo hashes its value. Any other object
//   form is refused, its key named; a hashed tool absent, unreadable or special is refused too.
// - The key is read from the package.json of the main tree of the repository (`outilsDe`), never of
//   a copy: an agent never opens a path for its next session.
// - `node outils-cles.mjs <dir>` writes one line `export VARIABLE='chemin'` per tool of the project
//   that holds <dir>, the path resolved and quoted for the shell (`exportsDesOutils`), which the
//   night evaluates, exit 0; a faulty key writes its faults on stderr, exit 1.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const NOM = /^[A-Za-z_][A-Za-z0-9_]*$/;
// The hidden directories of the first level of the home that a tool may lie under.
const CACHES_PERMIS = ['.local', '.cache'];
// The keyrings of credentials inside them, as paths relative to the home.
const TROUSSEAUX = ['.local/share/keyrings'];

// Whether <enfant> is <parent> or lies under it.
const sous = (enfant, parent) => {
  const rel = path.relative(parent, enfant);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// The refusal of the path <chemin> of the tool <cle>, or null, the home <maison> and the mounts
// <montages> of the envelope (see the header).
function refusDuChemin(cle, chemin, maison, montages) {
  if (chemin === path.parse(chemin).root) {
    return `la clé ${cle} nomme ${chemin}, la racine : un outil ne montre pas toute la machine.`;
  }
  if (sous(maison, chemin)) {
    return `la clé ${cle} nomme ${chemin}, qui contient la maison ${maison} : un outil ne montre pas ses identifiants.`;
  }
  const couvert = montages.find(m => sous(path.resolve(m), chemin));
  if (couvert) {
    return `la clé ${cle} nomme ${chemin}, qui contient ${path.resolve(couvert)}, un montage de l'enveloppe.`;
  }
  const premier = sous(chemin, maison) ? path.relative(maison, chemin).split(path.sep)[0] : '';
  if (premier.startsWith('.') && !CACHES_PERMIS.includes(premier)) {
    return `la clé ${cle} nomme ${chemin}, sous ~/${premier}, un dossier caché de la maison où la machine garde ses identifiants (seuls ~/.local et ~/.cache portent un outil).`;
  }
  const trousseau = TROUSSEAUX.map(t => path.join(maison, t)).find(
    t => sous(chemin, t) || sous(t, chemin)
  );
  if (trousseau) {
    return `la clé ${cle} nomme ${chemin}, qui touche ${trousseau}, le trousseau où la machine garde ses identifiants.`;
  }
  return null;
}

// The real path of <p>, its links followed; <p> itself when it does not resolve.
const realpath = p => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

/**
 * The tools that the package.json <pkg> declares: `outils`, each variable and its path resolved
 * (`~` from <maison>), none when a fault is found; `fautes`, one sentence per fault, naming its key.
 * <montages> are the paths a tool must not hold (see the header); a path that exists is judged
 * again by its real path, `reel` (its links followed), which the envelope mounts with it.
 * @param {any} pkg the parsed package.json
 * @param {{ maison?: string, existe?: (p: string) => boolean, reel?: (p: string) => string, montages?: string[] }} [o]
 * @returns {{ outils: Record<string, string>, fautes: string[] }}
 */
export function lireOutils(
  pkg,
  { maison = os.homedir(), existe = existsSync, reel = realpath, montages = [] } = {}
) {
  const o = pkg?.grillhouse?.outils;
  if (o === undefined || o === null) {
    return { outils: {}, contenu: [], fautes: [] };
  }
  if (typeof o !== 'object' || Array.isArray(o)) {
    return {
      outils: {},
      contenu: [],
      fautes: [
        `la clé grillhouse.outils vaut ${JSON.stringify(o)}, pas un objet { VARIABLE: chemin }.`,
      ],
    };
  }
  /** @type {string[]} */
  const fautes = [];
  /** @type {Record<string, string>} */
  const outils = {};
  /** @type {string[]} */
  const contenu = [];
  for (const [nom, forme] of Object.entries(o)) {
    const cle = `grillhouse.outils.${nom}`;
    let v = forme;
    let haché = false;
    let faute = null;
    if (forme !== null && typeof forme === 'object' && !Array.isArray(forme)) {
      const inconnue = Object.keys(forme).find(k => k !== 'chemin' && k !== 'contenu');
      if (inconnue !== undefined) {
        faute = `la clé ${cle} nomme « ${inconnue} », une clé inconnue (seuls « chemin » et « contenu » existent).`;
      } else if (typeof forme.chemin !== 'string') {
        faute = `la clé ${cle}.chemin vaut ${JSON.stringify(forme.chemin)}, pas un chemin.`;
      } else if ('contenu' in forme && typeof forme.contenu !== 'boolean') {
        faute = `la clé ${cle}.contenu vaut ${JSON.stringify(forme.contenu)}, pas un booléen.`;
      } else {
        v = forme.chemin;
        haché = forme.contenu === true;
      }
    }
    if (faute) {
      fautes.push(faute);
    } else if (!NOM.test(nom)) {
      fautes.push(`la clé grillhouse.outils nomme « ${nom} », pas un nom de variable.`);
    } else if (typeof v !== 'string') {
      fautes.push(`la clé ${cle} vaut ${JSON.stringify(v)}, pas un chemin.`);
    } else if (!path.isAbsolute(v) && v !== '~' && !v.startsWith('~/')) {
      fautes.push(`la clé ${cle} vaut « ${v} », ni un chemin absolu ni un chemin sous ~.`);
    } else {
      const chemin = path.resolve(v.startsWith('~') ? path.join(maison, v.slice(1)) : v);
      const refus = refusDuChemin(cle, chemin, path.resolve(maison), montages);
      // The envelope mounts what a link leads to: its target is judged as the path.
      const cible = !refus && existe(chemin) ? reel(chemin) : chemin;
      const refusDeLaCible =
        cible !== chemin ? refusDuChemin(cle, cible, path.resolve(maison), montages) : null;
      if (refus) {
        fautes.push(refus);
      } else if (refusDeLaCible) {
        fautes.push(`${refusDeLaCible} (la cible du lien ${chemin})`);
      } else if (existe(chemin)) {
        outils[nom] = chemin;
        if (haché) {
          contenu.push(nom);
        }
      } else {
        fautes.push(`la clé ${cle} nomme ${chemin}, qui n'existe pas.`);
      }
    }
  }
  return fautes.length ? { outils: {}, contenu: [], fautes } : { outils, contenu, fautes };
}

// The directories the fingerprint of a directory tool leaves out: the compilation caches an
// interpreter writes when used.
const SANS_EMPREINTE = new Set(['__pycache__']);

// The entries of the tool <racine> as lines [relative path, type, executable bit, content digest],
// the directory walked in the order of the bytes of the names.
function entreesDe(racine, rel, lignes, nomme) {
  const dossier = path.join(racine, rel);
  let noms;
  try {
    noms = readdirSync(dossier, { encoding: 'buffer' }).sort(Buffer.compare);
  } catch (e) {
    throw new Error(`${nomme} : ${dossier} est illisible (${/** @type {Error} */ (e).message}).`);
  }
  for (const buf of noms) {
    const nom = buf.toString('utf8');
    const r = rel ? path.join(rel, nom) : nom;
    const p = path.join(racine, r);
    const st = lstatSync(p);
    if (st.isDirectory()) {
      if (!SANS_EMPREINTE.has(nom)) {
        entreesDe(racine, r, lignes, nomme);
      }
    } else if (st.isSymbolicLink()) {
      lignes.push(['l', r, '0', readlinkSync(p)]);
    } else if (st.isFile()) {
      lignes.push(['f', r, st.mode & 0o111 ? '1' : '0', contenuDe(p, nomme)]);
    } else {
      throw new Error(`${nomme} : ${p} est un fichier spécial (ni fichier, ni dossier, ni lien).`);
    }
  }
}

// The SHA-256 of the file <p>, the tool <nomme> named when it is unreadable.
function contenuDe(p, nomme) {
  try {
    return createHash('sha256').update(readFileSync(p)).digest('hex');
  } catch (e) {
    throw new Error(`${nomme} : ${p} est illisible (${/** @type {Error} */ (e).message}).`);
  }
}

/**
 * The fingerprint of the tool at <chemin>: for a file, the SHA-256 of its content; for a
 * directory, the SHA-256 of the list of its entries sorted by the bytes of their relative path,
 * each by its path, its type, its executable bit and its content (a link by the text of its target,
 * never followed); the `__pycache__` directories are left out; no date, owner or absolute path
 * enters it, so a directory moved or touched keeps it.
 * @param {string} chemin
 * @param {string} [nomme] what an error names (the tool), the path by default
 * @returns {string} a hex digest
 * @throws {Error} an unreadable file or a special file, named
 */
export function empreinteDeLOutil(chemin, nomme = chemin) {
  // The tool itself, a link or not, is read through (the envelope mounts what it leads to).
  const st = statSync(chemin);
  if (!st.isDirectory()) {
    return contenuDe(chemin, nomme);
  }
  /** @type {string[][]} */
  const lignes = [];
  entreesDe(chemin, '', lignes, nomme);
  const h = createHash('sha256');
  for (const l of lignes) {
    // Each field is prefixed by its length: the boundaries of names and contents count.
    for (const champ of l) {
      const b = Buffer.from(champ, 'utf8');
      h.update(`${b.length}:`).update(b);
    }
    h.update('\n');
  }
  return h.digest('hex');
}

// The main tree of the repository that holds <dir>, from git's common directory; <dir> itself out
// of a repository.
export function arbrePrincipal(dir) {
  const r = spawnSync(
    'git',
    ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    {
      encoding: 'utf8',
    }
  );
  return r.status === 0 ? path.dirname(r.stdout.trim()) : path.resolve(dir);
}

/**
 * The tools of the project that holds <dir>, from the package.json of its main tree, never of a
 * copy, so that an agent never opens a path for its next session (none without one); no path
 * holding the main tree, `/tmp`, the temporary directories, nor one of <montages>.
 * @param {string} dir a directory of the project: its main tree or a copy
 * @param {{ montages?: string[] }} [o]
 * @returns {Record<string, string>}
 * @throws {Error} the faults of the key, one per line
 */
export function outilsDe(dir, { montages = [] } = {}) {
  return lectureDuProjet(dir, montages).outils;
}

// The reading of the key of the project that holds <dir>: `outils` and the variables hashed by
// content, `contenu`; throws the faults of the key.
function lectureDuProjet(dir, montages = []) {
  const racine = arbrePrincipal(dir);
  const f = path.join(racine, 'package.json');
  if (!existsSync(f)) {
    return { outils: {}, contenu: [] };
  }
  const temporaires = [process.env.CLAUDE_CODE_TMPDIR, os.tmpdir(), '/tmp'].filter(Boolean);
  const { outils, contenu, fautes } = lireOutils(JSON.parse(readFileSync(f, 'utf8')), {
    montages: [racine, ...temporaires, ...montages],
  });
  if (fautes.length) {
    throw new Error(fautes.join('\n'));
  }
  return { outils, contenu };
}

/**
 * The fingerprints of the tools of the project that holds <dir> declared hashed by content
 * (`{ chemin, contenu: true }`): `<VARIABLE>_EMPREINTE` and the SHA-256 of the tool
 * (`empreinteDeLOutil`), read again at each call; none for a tool of the short form.
 * @param {string} dir a directory of the project: its main tree or a copy
 * @param {{ montages?: string[] }} [o]
 * @returns {Record<string, string>}
 * @throws {Error} the faults of the key, or a hashed tool unreadable, its variable named
 */
export function empreintesDe(dir, { montages = [] } = {}) {
  const { outils, contenu } = lectureDuProjet(dir, montages);
  return Object.fromEntries(
    contenu.map(nom => [
      `${nom}_EMPREINTE`,
      empreinteDeLOutil(outils[nom], `la clé grillhouse.outils.${nom}`),
    ])
  );
}

/**
 * The environment <env> of a pass with the tools <outils> (`outilsDe`) and the fingerprints
 * <empreintes> (`empreintesDe`), the key winning.
 * @param {Record<string, string>} outils
 * @param {Record<string, string | undefined>} env
 * @param {Record<string, string>} [empreintes]
 */
export function avecLesOutils(outils, env, empreintes = {}) {
  return { ...env, ...outils, ...empreintes };
}

// The shell's text that exports the tools <outils> (`outilsDe`) and the fingerprints
// <empreintes> (`empreintesDe`), one `export VARIABLE='valeur'` per line, each value quoted for
// the shell: what the night evaluates before its commands.
export const exportsDesOutils = (outils, empreintes = {}) =>
  Object.entries({ ...outils, ...empreintes })
    .map(([n, c]) => `export ${n}='${c.replaceAll("'", "'\\''")}'\n`)
    .join('');

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const dir = path.resolve(process.argv[2] ?? '.');
    process.stdout.write(exportsDesOutils(outilsDe(dir), empreintesDe(dir)));
  } catch (e) {
    process.stderr.write(`${/** @type {Error} */ (e).message}\n`);
    process.exitCode = 1;
  }
}
