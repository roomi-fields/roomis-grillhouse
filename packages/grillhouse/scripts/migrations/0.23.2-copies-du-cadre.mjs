// The frame's copies leave a project in 0.22.x: the package carries the scripts, its plugin the
// skills, agents, charter and meta-frame, so the copies the former update placed
// (`.claude/grillhouse/fichiers.txt`, each file's SHA-256 in `.claude/grillhouse/empreintes.json`)
// are what this version replaces, as a codemod of `@turbo/codemod` removes what a version replaces.
// The list says what to remove: nothing is guessed.
//
// - Each file `empreintes.json` records that a line of `fichiers.txt` keeps (the file itself, or a
//   directory « …/ » above it; a line « - … » keeps none) goes when its bytes have the recorded
//   SHA-256 (as the former update computed it), or had it before the migration 0.23.0 of Vitest
//   rewrote its import of the base (`formesAnterieures`, below); a directory
//   it leaves empty goes with it. A file the template of a project holds at the same path
//   (`tsdoc.json`, `docs/agents/issue-tracker.md`) is the project's own since 0.23.0, as
//   `grillhouse init` places it, and stays.
// - Under a directory the list keeps that is no workspace of the project (scripts/paquets.mjs), a
//   file the former generator of the packages' turbo.json wrote (its first line « // Généré par
//   `…turbo-des-paquets…` ») goes too: it belonged to the former workspace of a copy.
// - A file whose bytes differ (the project modified it) stays: the migration leaves it to the
//   project (`{ aFaire }`), with the command that removes it, and the update's exit code is
//   non-zero; an npm script that runs it is named with it, since its removal breaks that script.
//   While one stays, the list and the fingerprints stay, so that the next update names it again;
//   once none stays, `.claude/grillhouse/` goes whole (the list, the fingerprints, the version, the
//   former charter). A modified copy of a role 0.24.0 removes stays too, but is named by that
//   migration alone (`deRoleSupprime` of 0.24.0-circuit-simplifie.mjs), once.
// - Each root npm script that runs a copy removed (`node scripts/<chemin>`, `bash scripts/<chemin>`,
//   its arguments kept) runs its subcommand, `grillhouse <sous-commande>`, by the table of
//   scripts/sous-commandes.mjs; a script that still names a copy removed (no subcommand runs it) is
//   named, not rewritten.
// - A dependency of the project's root that a copy removed imported, that the package declares in
//   its own `dependencies`, that the template of a project does not declare, and that no source of
//   the project still imports, is named, not removed: the project decides. API Extractor is named
//   by the migration of 0.24.2 alone (`DU_PAQUET` of 0.24.2-api-extractor-du-paquet.mjs), once.
// - A project without `fichiers.txt` and `empreintes.json` is not written: a second pass finds
//   neither, or finds only the copies left to the project, which it names again.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CADRE, PAQUET } from '../cadre.mjs';
import { paquets } from '../paquets.mjs';
import { importe, sources } from '../sources.mjs';
import { scriptsDesSousCommandes } from '../sous-commandes.mjs';
import { deRoleSupprime } from './0.24.0-circuit-simplifie.mjs';
import { dependanceDuPaquet, DU_PAQUET } from './0.24.2-api-extractor-du-paquet.mjs';

export const version = '0.23.2';
export const nom = 'copies du cadre';

const DOSSIER = '.claude/grillhouse';
const LISTE = `${DOSSIER}/fichiers.txt`;
const EMPREINTES = `${DOSSIER}/empreintes.json`;
const GABARIT = 'templates/projet';
const CHAMPS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const CODE = /\.(?:[mc]?ts|[mc]?js)$/;
// A call of a script of the frame's former copies in an npm script: its runner, then its path.
const APPEL = /(^|[\s;&|(])(?:node|bash)\s+(?:\.\/)?(scripts\/[^\s'";&|)]+)/g;
// The first line of a file the generator of the packages' turbo.json wrote.
const GENERE = /^\/\/ Généré par `[^`\n]*turbo-des-paquets[^`\n]*`/;

// What the migration of 0.23.0 of Vitest (the module typescript's) wrote in a copy: a quoted name
// of the package's base, in place of the former package's or of a former path of the base.
const ECRIT = /(['"])@roomi-fields\/grillhouse\/vitest-config(\/mesure)?\1/g;
const ANCIEN = '@grillhouse/vitest-config';
const ANCIENS_CHEMINS = [
  './scripts/vitest-config/base.mjs',
  './packages/grillhouse/scripts/vitest-config/base.mjs',
];

// The texts <texte> may have held before the migration of 0.23.0 rewrote it: each name it wrote
// back to the former package's, or each name of the base back to one former path; none when it
// wrote nothing.
function formesAnterieures(texte) {
  if (texte.search(ECRIT) < 0) return [];
  return [
    texte.replace(ECRIT, (_, q, mesure) => `${q}${ANCIEN}${mesure ?? ''}${q}`),
    ...ANCIENS_CHEMINS.map(c =>
      texte.replace(ECRIT, (tout, q, mesure) => (mesure ? tout : `${q}${c}${q}`))
    ),
  ];
}

const hacher = octets => createHash('sha256').update(octets).digest('hex');
const lireJson = f => JSON.parse(readFileSync(f, 'utf8'));

// The subcommand that runs each script of the package, by the path of its former copy.
const parCopie = projet =>
  new Map(Object.entries(scriptsDesSousCommandes(projet)).map(([n, s]) => [`scripts/${s}`, n]));

// The lines of the list that keep a path: a file, or a directory « …/ ».
const gardees = texte =>
  texte
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '' && !l.startsWith('#') && !l.startsWith('-'));
const couvert = (lignes, f) => lignes.some(l => (l.endsWith('/') ? f.startsWith(l) : f === l));

// Whether the file at <absolu> has the fingerprint <attendue>, as copied or as 0.23.0 rewrote it.
function intacte(absolu, attendue) {
  const octets = readFileSync(absolu);
  if (hacher(octets) === attendue) return true;
  return formesAnterieures(octets.toString('utf8')).some(t => hacher(t) === attendue);
}

// The files under the directory <rel> of <projet>, as paths from it.
function fichiersSous(projet, rel) {
  const absolu = path.join(projet, rel);
  if (!existsSync(absolu)) return [];
  return readdirSync(absolu, { withFileTypes: true }).flatMap(e => {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) return fichiersSous(projet, r);
    return e.isFile() ? [r] : [];
  });
}

// Removes each directory above <f> (a path from <projet>) that is left empty.
function viderDossiers(projet, f) {
  for (let d = path.dirname(f); d !== '.'; d = path.dirname(d)) {
    const absolu = path.join(projet, d);
    if (!existsSync(absolu) || readdirSync(absolu).length > 0) return;
    rmSync(absolu, { recursive: true });
  }
}

/** Takes the frame's former copies off the project at <projet>; returns what it did. */
export function migrer(projet) {
  const liste = path.join(projet, LISTE);
  const fEmpreintes = path.join(projet, EMPREINTES);
  if (!existsSync(liste) || !existsSync(fEmpreintes)) return [];
  const lignes = gardees(readFileSync(liste, 'utf8'));
  const enregistres = Object.entries(lireJson(fEmpreintes).fichiers ?? {}).filter(
    ([f]) =>
      couvert(lignes, f) &&
      !f.startsWith(`${DOSSIER}/`) &&
      !existsSync(path.join(CADRE, GABARIT, f))
  );
  const sortie = [];
  const retires = new Map();
  const restes = [];
  const retirer = (f, ligne) => {
    const absolu = path.join(projet, f);
    retires.set(f, CODE.test(f) ? readFileSync(absolu, 'utf8') : '');
    rmSync(absolu);
    viderDossiers(projet, f);
    sortie.push(ligne);
  };
  for (const [f, attendue] of enregistres) {
    if (!existsSync(path.join(projet, f))) continue;
    if (intacte(path.join(projet, f), attendue)) {
      retirer(f, `${f} : copie du cadre retirée, que le paquet porte`);
    } else if (!deRoleSupprime(f)) {
      restes.push(f);
      sortie.push({
        aFaire: `${f} : copie du cadre modifiée par le projet, laissée en place ; \`git rm ${f}\` la retire, le paquet porte le cadre`,
      });
    }
  }
  const espaces = new Set(paquets(projet).map(p => p.dossier));
  for (const d of lignes.filter(l => l.endsWith('/') && !l.startsWith(`${DOSSIER}/`))) {
    const dossier = d.replace(/\/$/, '');
    if (espaces.has(dossier)) continue;
    for (const f of fichiersSous(projet, dossier)) {
      if (!GENERE.test(readFileSync(path.join(projet, f), 'utf8'))) continue;
      retirer(f, `${f} : fichier engendré pour l'ancien espace de travail ${dossier}, retiré`);
    }
  }
  if (restes.length === 0) {
    rmSync(path.join(projet, DOSSIER), { recursive: true, force: true });
    viderDossiers(projet, DOSSIER);
    sortie.push(`${DOSSIER}/ : retiré (la liste et les empreintes des copies du cadre)`);
  } else {
    for (const e of readdirSync(path.join(projet, DOSSIER))) {
      if (`${DOSSIER}/${e}` !== LISTE && `${DOSSIER}/${e}` !== EMPREINTES) {
        retirer(`${DOSSIER}/${e}`, `${DOSSIER}/${e} : retiré`);
      }
    }
  }

  const fPkg = path.join(projet, 'package.json');
  if (!existsSync(fPkg)) return sortie;
  const pkg = lireJson(fPkg);
  const par = parCopie(projet);
  let reecrit = false;
  for (const [n, script] of Object.entries(pkg.scripts ?? {})) {
    if (typeof script !== 'string') continue;
    const neuf = script.replace(APPEL, (tout, avant, f) =>
      retires.has(f) && par.has(f) ? `${avant}grillhouse ${par.get(f)}` : tout
    );
    if (neuf !== script) {
      pkg.scripts[n] = neuf;
      reecrit = true;
      sortie.push(`package.json : le script ${n} lance \`${neuf}\``);
    }
    for (const f of retires.keys()) {
      if (neuf.includes(f)) {
        sortie.push(
          `package.json : le script ${n} nomme ${f}, copie retirée qu'aucune sous-commande ne remplace ; à réécrire`
        );
      }
    }
    for (const f of restes.filter(r => neuf.includes(r))) {
      const sous = par.get(f);
      sortie.push({
        aFaire: `package.json : le script ${n} lance ${f}, copie modifiée laissée en place ; son \`git rm\` le casse : ${sous ? `\`grillhouse ${sous}\` le remplace` : 'à réécrire'}`,
      });
    }
  }
  if (reecrit) writeFileSync(fPkg, `${JSON.stringify(pkg, null, 2)}\n`);

  const duPaquet = Object.keys(lireJson(path.join(PAQUET, 'package.json')).dependencies ?? {});
  const gabarit = lireJson(path.join(CADRE, GABARIT, 'package.json'));
  const textes = sources(projet).map(f => readFileSync(path.join(projet, f), 'utf8'));
  for (const dep of duPaquet.filter(d => d !== DU_PAQUET)) {
    if (!CHAMPS.some(c => pkg[c]?.[dep] !== undefined)) continue;
    if (CHAMPS.some(c => gabarit[c]?.[dep] !== undefined)) continue;
    if (![...retires.values()].some(t => importe(t, dep))) continue;
    if (textes.some(t => importe(t, dep))) continue;
    sortie.push(dependanceDuPaquet(dep));
  }
  return sortie;
}
