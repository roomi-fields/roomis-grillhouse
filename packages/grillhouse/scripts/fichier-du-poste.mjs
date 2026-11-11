// The variables of the poste a tool of a language reads: a file of the poste, out of every
// repository, under the frame's directory of configuration (`$XDG_CONFIG_HOME/grillhouse/`,
// `~/.config/grillhouse/` without it, as the XDG Base Directory Specification places a user's
// configuration), whose name the module of the language gives (`environnementDuPoste`,
// scripts/jointure.d.ts): the server of a remote cache, its token, which never enter a
// repository.
//
// - The file holds one `VARIABLE=valeur` per line, as a `.env` of the shell: `export ` before the
//   name, a value between quotes, a blank line and a line of comment (`#`) are read too; any
//   other line is passed over.
// - The caller decides: when the environment already holds one of the file's variables (a CI
//   that names its own server, empty or not), the file is not applied, and the environment stays
//   as it is. Otherwise the file's variables enter, then the additions of the module (the cache
//   read-only).
// - A file absent or unreadable, an environment without HOME nor XDG_CONFIG_HOME (the session of
//   an agent, whose home the envelope empties, has no such file): the environment stays as it
//   is.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const NOM = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The frame's directory of configuration on the poste, from <env>: `$XDG_CONFIG_HOME/grillhouse`,
 * `$HOME/.config/grillhouse` without it; null without either.
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
export function configurationDuPoste(env) {
  const base = env.XDG_CONFIG_HOME || (env.HOME ? path.join(env.HOME, '.config') : '');
  return base ? path.join(base, 'grillhouse') : null;
}

/**
 * The variables of the text <texte> of a file of the poste (see the header).
 * @param {string} texte
 * @returns {Record<string, string>}
 */
export function variablesDuTexte(texte) {
  /** @type {Record<string, string>} */
  const variables = {};
  for (const brute of texte.split('\n')) {
    const ligne = brute.trim().replace(/^export\s+/, '');
    const egal = ligne.indexOf('=');
    if (ligne.startsWith('#') || egal <= 0) {
      continue;
    }
    const nom = ligne.slice(0, egal).trim();
    let valeur = ligne.slice(egal + 1).trim();
    if (/^(['"]).*\1$/.test(valeur) && valeur.length >= 2) {
      valeur = valeur.slice(1, -1);
    }
    if (NOM.test(nom)) {
      variables[nom] = valeur;
    }
  }
  return variables;
}

// The text of <fichier>, or null when it does not read.
const lireLeFichier = fichier => {
  try {
    return readFileSync(fichier, 'utf8');
  } catch {
    return null;
  }
};

/**
 * The environment <env> with the variables of the file <fichier> of the poste, then <ajouts>; <env>
 * itself when the file is absent, holds no variable, or names one that <env> already holds (see
 * the header).
 * @template {Record<string, string | undefined>} T
 * @param {T} env
 * @param {{ fichier: string, ajouts?: Record<string, string>, lire?: (f: string) => string | null }} o
 * @returns {T}
 */
export function avecLeFichierDuPoste(env, { fichier, ajouts = {}, lire = lireLeFichier }) {
  const dossier = configurationDuPoste(env);
  const texte = dossier === null ? null : lire(path.join(dossier, fichier));
  const variables = texte === null ? {} : variablesDuTexte(texte);
  const noms = Object.keys(variables);
  if (noms.length === 0 || noms.some(n => env[n] !== undefined)) {
    return env;
  }
  return { ...env, ...variables, ...ajouts };
}
