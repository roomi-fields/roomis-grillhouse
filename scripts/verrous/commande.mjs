#!/usr/bin/env node
// The lock of the commands of a role that writes (the testeur, the developpeur): a PreToolUse hook
// on Bash, which the settings of its session declare (scripts/droits.mjs). It reads the hook's JSON
// on stdin and refuses, exit code 2 and its reason on stderr, a command whose shell writes a file
// out of the session's temporary directory: an output redirection (`>`, `>>`, `>|`, `&>`, `1>`…)
// or `tee`. A file of the repository is written by the tools of writing (Write, Edit), which the
// role's write lock (verrou.mjs) judges; a rule of Claude Code does not see a redirection, and a
// session in its envelope runs without the check of writes.
//
// - Allowed targets: the null and standard devices (`/dev/null`, `/dev/stdout`, `/dev/stderr`,
//   `/dev/fd/…`), a duplication of a descriptor (`2>&1`, `>&2`), and a path under the temporary
//   directory (`os.tmpdir()`, the envelope's TMPDIR), written plainly or by `$TMPDIR`/`${TMPDIR}`.
//   A relative path is judged from the command's working directory (the input's `cwd`). A target
//   that names any other variable or a substitution cannot be judged, and is refused.
// - What quotes hold, and the body of a here-document, is text: a `>` there redirects nothing.
// - An input it cannot read, or another tool, passes: a hook never stops the session on its own
//   failure.
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PERIPHERIQUES = /^\/dev\/(null|stdout|stderr|tty|fd\/\d+)$/;

// The targets of the files <commande> writes by the shell, `$TMPDIR` read as <tmp>: each
// `{ cible, brute }`, `cible` the word once its quotes are read, null when a variable or a
// substitution keeps it unknown.
function ecrituresDuShell(commande, tmp = tmpdir()) {
  const out = [];
  const n = commande.length;
  let i = 0;
  // The here-documents whose bodies start at the next line.
  let documents = [];
  // A word from <j>: its text with quotes read, whether it holds an expansion, and where it ends.
  const mot = j => {
    let texte = '';
    let inconnu = false;
    while (j < n && /\s/.test(commande[j]) && commande[j] !== '\n') j++;
    while (j < n && !/[\s;&|<>()]/.test(commande[j])) {
      const c = commande[j];
      if (c === "'") {
        const f = commande.indexOf("'", j + 1);
        texte += commande.slice(j + 1, f < 0 ? n : f);
        j = f < 0 ? n : f + 1;
      } else if (c === '"') {
        let k = j + 1;
        while (k < n && commande[k] !== '"') {
          if (commande[k] === '\\') k++;
          else if (commande[k] === '$' || commande[k] === '`') inconnu = true;
          texte += commande[k] ?? '';
          k++;
        }
        j = k + 1;
      } else if (c === '\\') {
        texte += commande[j + 1] ?? '';
        j += 2;
      } else {
        if (c === '$' || c === '`') inconnu = true;
        texte += c;
        j++;
      }
    }
    return { texte, inconnu, fin: j };
  };
  const cible = w => {
    const variable = /^\$(\{TMPDIR\}|TMPDIR)(\/.*)?$/.exec(w.texte);
    if (variable) return { cible: path.join(tmp, variable[2] ?? ''), brute: w.texte };
    return { cible: w.inconnu ? null : w.texte, brute: w.texte };
  };
  while (i < n) {
    const c = commande[i];
    if (c === '\n' && documents.length) {
      // The bodies of the here-documents opened on the line just ended.
      let j = i + 1;
      for (const fin of documents) {
        while (j < n) {
          const e = commande.indexOf('\n', j);
          const ligne = commande.slice(j, e < 0 ? n : e);
          j = e < 0 ? n : e + 1;
          if (ligne.replace(/^\t+/, '') === fin) break;
        }
      }
      documents = [];
      i = j;
      continue;
    }
    if (c === "'") {
      const f = commande.indexOf("'", i + 1);
      i = f < 0 ? n : f + 1;
      continue;
    }
    if (c === '"') {
      let k = i + 1;
      while (k < n && commande[k] !== '"') k += commande[k] === '\\' ? 2 : 1;
      i = k + 1;
      continue;
    }
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '<' && commande[i + 1] === '<' && commande[i + 2] !== '<') {
      const w = mot(i + (commande[i + 2] === '-' ? 3 : 2));
      if (w.texte) documents.push(w.texte);
      i = w.fin;
      continue;
    }
    if (c === '>') {
      let j = i + 1;
      if (commande[j] === '>' || commande[j] === '|') j++;
      // A duplication of a descriptor, `>&2`, writes no file.
      if (commande[j] === '&') {
        i = j + 1;
        continue;
      }
      const w = mot(j);
      if (w.texte) out.push(cible(w));
      i = w.fin;
      continue;
    }
    if (c === '&' && commande[i + 1] === '>') {
      const w = mot(i + (commande[i + 2] === '>' ? 3 : 2));
      if (w.texte) out.push(cible(w));
      i = w.fin;
      continue;
    }
    // `tee` as a command word: each of its operands is a file it writes.
    if (/[a-z]/.test(c) && (i === 0 || /[\s;&|(]/.test(commande[i - 1]))) {
      const w = mot(i);
      if (w.texte === 'tee') {
        let j = w.fin;
        for (;;) {
          const a = mot(j);
          if (!a.texte) break;
          if (!a.texte.startsWith('-')) out.push(cible(a));
          j = a.fin;
        }
        i = j;
      } else {
        i = Math.max(w.fin, i + 1);
      }
      continue;
    }
    i++;
  }
  return out;
}

// The reason the command of this hook input is refused, or null when it passes.
export function refusDeCommande(input, { tmp = tmpdir() } = {}) {
  if (input?.tool_name !== 'Bash') return null;
  const commande = String(input.tool_input?.command ?? '');
  const cwd = input.cwd ?? process.cwd();
  const interieur = f => {
    const rel = path.relative(path.resolve(tmp), f);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  };
  const enTrop = ecrituresDuShell(commande, tmp).filter(({ cible }) => {
    if (cible === null) return true;
    if (PERIPHERIQUES.test(cible)) return false;
    const absolu = path.resolve(cwd, cible);
    return !interieur(absolu);
  });
  if (!enTrop.length) return null;
  return `Le shell n'écrit pas les fichiers du dépôt (${enTrop.map(e => e.brute).join(', ')}) : un fichier s'écrit par l'outil Write ou Edit, que le verrou de ton rôle juge ; un fichier temporaire va dans ${tmp}.`;
}

const direct = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (direct) {
  let raison = null;
  try {
    raison = refusDeCommande(JSON.parse(readFileSync(0, 'utf8')));
  } catch {
    // An input it cannot read passes.
  }
  if (raison) {
    process.stderr.write(`${raison}\n`);
    process.exit(2);
  }
}
