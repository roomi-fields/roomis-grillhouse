// The circuit of 0.24.0 has no regulator and no technical referent: the circuit makes the mechanical
// gestures, and any other question goes up to the supervisor with its piece, who takes to the owner
// what is his. What a project holds of the former circuit is rewritten here, as a codemod of
// `@turbo/codemod` rewrites what a version changes, and nothing else.
//
// - The rubric « Ce qui monte au superviseur » of the project's CLAUDE.md: the paragraph of the
//   template of 0.22.x and 0.23.x (« Le fonctionnel que le régulateur ne tranche jamais seul : <la
//   liste>. Le cadre et l'architecture montent toujours (charte commune). »), its list as the
//   project filled it, becomes the paragraph of the template of 0.24.0, the list kept, wrapped at
//   100 columns; the rest of the rubric stays. A rubric the project wrote itself that still names
//   a removed role is left to the project (`{ aFaire }`); one that names none is left silently.
// - `docs/agents/issue-tracker.md`, the project's own since 0.23.0 (`grillhouse init` places it):
//   a file whose bytes are those of the template of 0.21.0 to 0.22.x, or of 0.23.x (their SHA-256
//   in FORMES), becomes the template's; a file the project modified that names a removed role is
//   left to the project.
// - A copy of a removed role (`.claude/agents/<rôle>.md`, `.claude/skills/<rôle>/`) still in the
//   project is one the migration of the copies (0.23.2-copies-du-cadre.mjs, played before) could
//   not know as the frame's: the project modified it, or no list named it. It is left to the
//   project, with the command that removes it; the migration of the copies leaves it to this one
//   (deRoleSupprime), so that it is named once.
// - What stays to the project (`restes`, which the update plays after its own update and its
//   regeneration, so that it sees the final state): a tracked file of the project (`git ls-files`,
//   node_modules and the changelogs aside) that still calls or names a script of the frame at its former address under `scripts/`
//   (`node scripts/<script>`, `$RACINE/scripts/<script>`, `file://$1/scripts/<script>`,
//   `path.join(…, '..', 'scripts', '<dossier>', '<script>')`, found by its words, sousScripts; a
//   `scripts/` under a literal directory, a package of the project or the installed package, is
//   another's, `.` and `..` naming none; a tracked path that is no regular file, a submodule or a
//   link, is skipped), where the project holds no such file any more, is named with its file:line
//   and what replaces it: the subcommand (`SOUS_COMMANDES` of scripts/sous-commandes.mjs), the hook
//   (`grillhouse hook <nom>`, `CROCHETS` of scripts/crochets.mjs) or the named entry (the
//   `exports` of the package). A script of the package that has none of them is named with « aucune
//   entrée publiée ne la remplace ». The project's scripts are its own: none is rewritten, and the
//   lines are a report, which never holds back the version the project records, as a codemod
//   reports what it leaves without failing.
// - No version of the update wrote a setting of a role in `.claude/settings.json` or under
//   `grillhouse` of the package.json (the update of 0.22.x wrote the hooks, the status line and the
//   plugins; the rights of a role are given on the command line of its session, scripts/droits.mjs):
//   the migration writes neither.
// - A project already in the new form is not written, and a second pass reports only what it left
//   to the project.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CADRE, PAQUET } from '../cadre.mjs';
import { CROCHETS } from '../crochets.mjs';
import { scriptsDesSousCommandes } from '../sous-commandes.mjs';

export const version = '0.24.0';
export const nom = 'circuit simplifié';

const SUPPRIMES = ['regulateur', 'referent-technique'];

/** Whether <f>, a path from a project's root, is in a copy of a removed role, which this migration names. */
export const deRoleSupprime = f =>
  SUPPRIMES.some(r => f === `.claude/agents/${r}.md` || f.startsWith(`.claude/skills/${r}/`));
// A removed role named in a text, in its words or by its name.
const NOMME_UN_SUPPRIME = /r[ée]gulat(?:eur|rice)|referent-technique|r[ée]f[ée]rents? techniques?/i;

const RUBRIQUE = 'Ce qui monte au superviseur';
// The section of the rubric, its title line apart, up to the next section or the end.
const SECTION = new RegExp(`^(## ${RUBRIQUE}[ \\t]*\\n)([^]*?)(?=^## |(?![^]))`, 'm');
// The paragraph of the former template, its list captured, as a paragraph of its own.
const ANCIEN =
  /(^\n*|\n\n)Le\s+fonctionnel\s+que\s+le\s+régulateur\s+ne\s+tranche\s+jamais\s+seul\s+:\s+([^]*?)\.\s+Le\s+cadre\s+et\s+l'architecture\s+montent\s+toujours\s+\(charte\s+commune\)\.(?=\n\n|\n?$)/;
const NEUF = liste =>
  `Une question qu'aucun geste du circuit ne tranche monte au superviseur, avec sa pièce. Il monte au responsable le fonctionnel, qu'il ne tranche jamais seul : ${liste}. Le cadre et l'architecture montent toujours (charte commune).`;
const COLONNES = 100;

const SUIVI = 'docs/agents/issue-tracker.md';
// The SHA-256 of the guide of the issue tracker as the template held it: 0.21.0 to 0.22.6 (the
// copy the update placed), 0.23.0 and 0.23.1 (the template `grillhouse init` places).
const FORMES = new Set([
  '2b7c70b22001c83009887372f2bc5b04509e8e4dbc14f1e647df2c686b0ba5e0',
  'a6d6e9ecbb75b82dad9c6adadd310fe1047c4a5f83d4d789718cd921eda6b258',
]);

const hacher = octets => createHash('sha256').update(octets).digest('hex');

// The words of <texte> in lines of at most COLONNES characters.
function replier(texte) {
  const lignes = [];
  for (const mot of texte.split(/\s+/).filter(Boolean)) {
    const l = lignes.length - 1;
    if (l >= 0 && lignes[l].length + 1 + mot.length <= COLONNES) {
      lignes[l] += ` ${mot}`;
    } else {
      lignes.push(mot);
    }
  }
  return lignes.join('\n');
}

// The rubric of the CLAUDE.md of <projet>.
function rubrique(projet) {
  const fichier = path.join(projet, 'CLAUDE.md');
  if (!existsSync(fichier)) {
    return [];
  }
  const texte = readFileSync(fichier, 'utf8');
  const s = SECTION.exec(texte);
  if (!s) {
    return [];
  }
  const [tout, titre, corps] = s;
  if (ANCIEN.test(corps)) {
    const neuf = corps.replace(ANCIEN, (_, avant, liste) => `${avant}${replier(NEUF(liste))}`);
    writeFileSync(
      fichier,
      texte.replace(tout, () => `${titre}${neuf}`)
    );
    return [
      `CLAUDE.md : la rubrique « ${RUBRIQUE} » dit le circuit de la 0.24.0 (une question qu'aucun geste ne tranche monte au superviseur, avec sa pièce), sa liste gardée`,
    ];
  }
  if (!NOMME_UN_SUPPRIME.test(corps)) {
    return [];
  }
  return [
    {
      aFaire: `CLAUDE.md : la rubrique « ${RUBRIQUE} », que le projet a écrite, nomme un rôle que la 0.24.0 supprime (le régulateur ou le référent technique) ; à réécrire : une question qu'aucun geste du circuit ne tranche monte au superviseur, avec sa pièce, et il monte au responsable ce que la rubrique nomme`,
    },
  ];
}

// The guide of the issue tracker of <projet>.
function suivi(projet) {
  const fichier = path.join(projet, SUIVI);
  if (!existsSync(fichier)) {
    return [];
  }
  const octets = readFileSync(fichier);
  if (FORMES.has(hacher(octets))) {
    writeFileSync(fichier, readFileSync(path.join(CADRE, 'templates/projet', SUIVI)));
    return [`${SUIVI} : le guide du gabarit, qui dit le circuit de la 0.24.0`];
  }
  if (!NOMME_UN_SUPPRIME.test(octets.toString('utf8'))) {
    return [];
  }
  return [
    {
      aFaire: `${SUIVI} : modifié par le projet, il nomme un rôle que la 0.24.0 supprime ; le gabarit du paquet (templates/projet/${SUIVI}) dit le circuit neuf`,
    },
  ];
}

// The copies of the removed roles left in <projet>.
function copies(projet) {
  return SUPPRIMES.flatMap(r => [
    { f: `.claude/agents/${r}.md`, rm: 'git rm' },
    { f: `.claude/skills/${r}`, rm: 'git rm -r' },
  ])
    .filter(({ f }) => existsSync(path.join(projet, f)))
    .map(({ f, rm }) => ({
      aFaire: `${f} : copie d'un rôle que la 0.24.0 supprime (le circuit ne le lance plus), laissée en place ; \`${rm} ${f}\` la retire`,
    }));
}

// The path under `scripts/` where the frame of a former version kept the script <s> of the package
// (a path under `scripts/`): a script of a module of language lay where its module's folder now
// holds it, directly under `scripts/` (grillhouse-3dr.2.2).
const ancienne = s => s.replace(/^langages\/[^/]+\//, '');

// What replaces each script of the frame, by its path under `scripts/`: its subcommand, its hook,
// its named entry; none for a script of the package that has none of them.
function remplacants(projet) {
  const r = new Map();
  const ajouter = (script, quoi) => r.set(script, [...(r.get(script) ?? []), quoi]);
  for (const [n, s] of Object.entries(scriptsDesSousCommandes(projet))) {
    ajouter(s, `\`grillhouse ${n}\``);
  }
  for (const [n, c] of Object.entries(CROCHETS)) {
    ajouter(c.garde, `\`grillhouse hook ${n}\``);
  }
  const { name, exports = {} } = JSON.parse(
    readFileSync(path.join(PAQUET, 'package.json'), 'utf8')
  );
  for (const [entree, cible] of Object.entries(exports)) {
    const d = typeof cible === 'string' ? cible : cible?.default;
    if (typeof d === 'string' && d.startsWith('./scripts/')) {
      ajouter(ancienne(d.slice('./scripts/'.length)), `\`${name}${entree.slice(1)}\``);
    }
  }
  const scripts = path.join(PAQUET, 'scripts');
  for (const e of readdirSync(scripts, { recursive: true, withFileTypes: true })) {
    const s = ancienne(
      path.relative(scripts, path.join(e.parentPath, e.name)).split(path.sep).join('/')
    );
    if (e.isFile() && SCRIPT.test(s) && !r.has(s)) {
      r.set(s, []);
    }
  }
  return r;
}
const SCRIPT = /\.(?:mjs|sh)$/;
const SANS = /(^|\/)(?:node_modules\/|CHANGELOG\.md$)/;
// What separates the words of a line, and the arguments of a call.
const BLANCS = /[\s'"`();|&<>=,]+/;
const APPELS = /[();]/;
const cite = a => a.length >= 2 && /^['"`]$/.test(a[0]) && a.at(-1) === a[0];
// Whether a piece of a path names a directory: `.` and `..` name none, only a step.
const dossier = m => m !== '.' && m !== '..';

// The paths under `scripts/` that the line <ligne> names at a project's root, each as its pieces
// after `scripts`: a word cut at its `/` (`scripts/x.mjs`, `./scripts/x.mjs`, `../scripts/x.mjs`,
// `$RACINE/scripts/x.mjs`, `file://$1/scripts/x.mjs`), whose piece before `scripts` is none, a
// step (`.`, `..`) or a variable; the arguments of a call (`path.join(RACINE, 'scripts', 'd',
// 'x.mjs')`, `path.join(dir, '..', 'scripts', 'x.mjs')`), whose argument before `'scripts'` is
// none, no literal or a step, the literals after it its pieces. A `scripts/` under a literal
// directory (`packages/a/scripts/`, the installed package) is another's.
function sousScripts(ligne) {
  const chemins = [];
  for (const mot of ligne.split(BLANCS)) {
    const p = mot.split('/');
    p.forEach((m, i) => {
      if (m === 'scripts' && (i === 0 || !dossier(p[i - 1]) || p[i - 1].startsWith('$'))) {
        chemins.push(p.slice(i + 1));
      }
    });
  }
  for (const appel of ligne.split(APPELS)) {
    const a = appel.split(',').map(x => x.trim());
    a.forEach((x, i) => {
      const avant = a[i - 1];
      const libre = i === 0 || !cite(avant) || !dossier(avant.slice(1, -1));
      if (cite(x) && x.slice(1, -1) === 'scripts' && libre) {
        const suite = a.slice(i + 1);
        const fin = suite.findIndex(y => !cite(y));
        chemins.push(suite.slice(0, fin === -1 ? suite.length : fin).map(y => y.slice(1, -1)));
      }
    });
  }
  return chemins;
}

/** The lines of the tracked files of <projet> that still reach a script of the frame at its former address. */
export function restes(projet) {
  let suivis;
  try {
    suivis = execFileSync('git', ['-C', projet, 'ls-files', '-z'], { encoding: 'utf8' })
      .split('\0')
      .filter(f => f && !SANS.test(f));
  } catch {
    return [];
  }
  const par = remplacants(projet);
  const sortie = [];
  for (const f of suivis) {
    const absolu = path.join(projet, f);
    // A submodule, a link, a file gone from the disk: no text of the project to read.
    if (!existsSync(absolu) || !lstatSync(absolu).isFile()) {
      continue;
    }
    const texte = readFileSync(absolu, 'utf8');
    if (texte.includes('\0')) {
      continue;
    }
    texte.split('\n').forEach((ligne, i) => {
      const scripts = sousScripts(ligne).flatMap(pieces =>
        pieces.map((_, n) => pieces.slice(0, n + 1).join('/')).filter(s => par.has(s))
      );
      for (const s of new Set(scripts)) {
        const quoi = par.get(s);
        if (existsSync(path.join(projet, 'scripts', s))) {
          continue;
        }
        const suite =
          quoi.length > 0
            ? `${quoi.join(' ou ')} la remplace`
            : 'aucune entrée publiée ne la remplace';
        sortie.push(`${f}:${i + 1} : appelle scripts/${s}, copie du cadre retirée ; ${suite}`);
      }
    });
  }
  return sortie;
}

/** Rewrites in the project at <projet> what the circuit of 0.24.0 changes; returns what it did. */
export function migrer(projet) {
  return [...rubrique(projet), ...suivi(projet), ...copies(projet)];
}
