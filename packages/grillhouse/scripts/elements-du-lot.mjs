// The elements of a lot: each function, class, type, interface, enum, constant at the top of a
// module and export the lot adds, changes or removes, with its package, its file and line, and
// whether its package's entry exports it. As API Extractor's report and its diff, read line by
// line, and a review that asks a word on every changed file, the circuit gives this list to the
// reviewer (`relire` of scripts/circuit.mjs), whose sheet holds one line of conformity per element
// (scripts/resultats.mjs, `conformiteDuLot`).
//
// - The lot is the difference between two commits of the copy (<avant>, its HEAD, and <apres>,
//   the lot the circuit keeps): its changed files by `git diff --name-status -z`, the text of a
//   file before by `git show <avant>:<fichier>`.
// - The declarations are read by TypeScript's language service over the components'
//   `tsconfig.json` (`leService` of scripts/references-par-les-types.mjs): the production
//   sources it reads, the tests and the declaration files left out; the file before, by
//   TypeScript's parser. A declaration of the lot is new when its name is not in the file before,
//   removed when it is not in the file after, and changed when its text differs (its TSDoc
//   comment included), as the declarations of the reports are compared.
// - An element is exported when the entry of its package exports it (the service's symbols), or
//   when the API report of its package names it (`docs/INTERFACE.api.md`, which
//   scripts/interfaces-contre-code.mjs writes): after the lot for a new or changed one, before
//   it for a removed one. A declaration of a report that the lot adds, changes or removes, and
//   that no element of its package's sources already names (a type that changed through another),
//   is an element of the report itself, exported.
// - A changed source that the service does not read (a package without `tsconfig.json`) is named
//   in `horsDuService`: the reviewer surveys its elements himself, each named `<fichier>#<nom>`.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { composants } from './consommateurs.mjs';
import { estTest, leService } from './references-par-les-types.mjs';

const requis = createRequire(import.meta.url);
const SOURCE = /\.[cm]?[jt]sx?$/;
const RAPPORT = path.join('docs', 'INTERFACE.api.md');
const CLOTURE = '```';

const git = (copie, ...a) =>
  spawnSync('git', ['-C', copie, ...a], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const enPosix = f => f.split(path.sep).join('/');

// The text of <fichier> (from the copy) at the commit <rev>, or null when it does not hold it.
function aLa(copie, rev, fichier) {
  const r = git(copie, 'show', `${rev}:${enPosix(fichier)}`);
  return r.status === 0 ? r.stdout : null;
}

// The declarations at the top of the source file <sf>: Map nom → `{ nom, genre, ligne, noeud,
// texte }`, `noeud` its name, `texte` its text with its TSDoc comment (an overloaded function, a
// merged interface: the texts of all its declarations).
function declarationsDe(ts, sf) {
  const out = new Map();
  const ajouter = (nom, genre, noeud, porteur) => {
    const debut = porteur.getStart(sf, true);
    const texte = sf.text.slice(debut, porteur.getEnd());
    const d = out.get(nom);
    if (d) {
      d.texte += `\n${texte}`;
    } else {
      const ligne = sf.getLineAndCharacterOfPosition(debut).line + 1;
      out.set(nom, { nom, genre, ligne, noeud, texte });
    }
  };
  const noms = n =>
    ts.isIdentifier(n)
      ? [n]
      : n.elements.flatMap(e => (ts.isOmittedExpression(e) ? [] : noms(e.name)));
  const GENRES = [
    [ts.isFunctionDeclaration, 'fonction'],
    [ts.isClassDeclaration, 'classe'],
    [ts.isInterfaceDeclaration, 'interface'],
    [ts.isTypeAliasDeclaration, 'type'],
    [ts.isEnumDeclaration, 'enum'],
    [ts.isModuleDeclaration, 'espace'],
  ];
  for (const st of sf.statements) {
    const genre = GENRES.find(([est]) => est(st))?.[1];
    if (genre) {
      ajouter(st.name ? st.name.text : 'default', genre, st.name ?? null, st);
    } else if (ts.isVariableStatement(st)) {
      const decls = st.declarationList.declarations;
      for (const d of decls) {
        for (const n of noms(d.name)) ajouter(n.text, 'constante', n, decls.length > 1 ? d : st);
      }
    } else if (ts.isExportDeclaration(st)) {
      const clause = st.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        for (const s of clause.elements) ajouter(s.name.text, 'export', s.name, st);
      } else if (clause) {
        ajouter(clause.name.text, 'export', clause.name, st);
      } else {
        ajouter(`* from ${st.moduleSpecifier.text}`, 'export', null, st);
      }
    } else if (ts.isExportAssignment(st)) {
      ajouter('default', 'export', null, st);
    }
  }
  return out;
}

// The declarations of an API report's text <texte>, as declarationsDe gives them, each line that
// of the report file; an empty Map without a report.
function declarationsDuRapport(ts, texte) {
  if (texte === null) return new Map();
  const lignes = texte.split('\n');
  const debut = lignes.indexOf(`${CLOTURE}ts`);
  if (debut < 0) return new Map();
  const fin = lignes.indexOf(CLOTURE, debut + 1);
  const code = lignes.slice(debut + 1, fin < 0 ? undefined : fin).join('\n');
  const sf = ts.createSourceFile('rapport.d.ts', code, ts.ScriptTarget.Latest, true);
  const decls = declarationsDe(ts, sf);
  for (const d of decls.values()) {
    d.ligne += debut + 1;
  }
  return decls;
}

// The elements the lot of the copy <copie> adds, changes or removes between the commits <avant>
// and <apres>: `{ etat: 'fait', raison: null, elements, horsDuService, service }`, each element
// `{ id, nom, genre, statut, paquet, fichier, ligne, exporte }` (`id` `<fichier>#<nom>`, `statut`
// neuf, changé or supprimé, `fichier` from the copy, `ligne` in the file after, or before for a
// removed one), sorted by file, line and name, `horsDuService` the changed sources the language
// service does not read, `service` null when it ran, else why it could not (no `tsconfig.json`
// in the components); or `{ etat: 'impossible', raison, elements: [], horsDuService: [] }`.
export function elementsDuLot(copie, { avant, apres }) {
  try {
    return calculer(copie, avant, apres);
  } catch (e) {
    return impossible(`erreur : ${e.message.split('\n')[0]}`);
  }
}

const impossible = raison => ({ etat: 'impossible', raison, elements: [], horsDuService: [] });

function calculer(copie, avant, apres) {
  const r = git(copie, 'diff', '--name-status', '-z', '--no-renames', avant, apres);
  if (r.status !== 0) {
    return impossible(`git diff ${avant} ${apres} : ${r.stderr.trim().split('\n')[0]}`);
  }
  const champs = r.stdout.split('\0').filter(Boolean);
  const changes = [];
  for (let i = 0; i + 1 < champs.length; i += 2) {
    changes.push({ fichier: champs[i + 1], supprime: champs[i] === 'D' });
  }
  const ts = requis('typescript');
  const tous = composants(copie);
  const dirs = [...tous].sort((a, b) => b.dir.length - a.dir.length);
  const composantDe = f => dirs.find(c => path.resolve(copie, f).startsWith(c.dir + path.sep));
  const s = changes.length ? leService(copie, tous) : {};
  const lus = new Map((s.sources ?? []).map(x => [path.resolve(x.sf.fileName), x]));
  const nomDe = c => c.paquet ?? enPosix(path.relative(copie, c.dir));

  // The reports of a component, before and after the lot, read once.
  const rapports = new Map();
  const rapportsDe = c => {
    if (!rapports.has(c)) {
      const f = path.relative(copie, path.join(c.dir, RAPPORT));
      rapports.set(c, {
        fichier: enPosix(f),
        avant: declarationsDuRapport(ts, aLa(copie, avant, f)),
        apres: declarationsDuRapport(ts, aLa(copie, apres, f)),
      });
    }
    return rapports.get(c);
  };

  const elements = [];
  const horsDuService = [];
  for (const { fichier, supprime } of changes) {
    const c = composantDe(fichier);
    const abs = path.resolve(copie, fichier);
    if (!c || !SOURCE.test(fichier) || estTest(c, abs)) continue;
    const lu = supprime ? null : lus.get(abs);
    const lisible = supprime
      ? !s.raison && existsSync(path.join(c.dir, 'tsconfig.json'))
      : Boolean(lu);
    if (!lisible) {
      horsDuService.push(enPosix(fichier));
      continue;
    }
    const texteAvant = aLa(copie, avant, fichier);
    const decAvant =
      texteAvant === null
        ? new Map()
        : declarationsDe(ts, ts.createSourceFile(abs, texteAvant, ts.ScriptTarget.Latest, true));
    const decApres = lu ? declarationsDe(ts, lu.sf) : new Map();
    const { avant: rapportAvant, apres: rapportApres } = rapportsDe(c);
    const element = (d, statut, exporte) =>
      elements.push({
        id: `${enPosix(fichier)}#${d.nom}`,
        nom: d.nom,
        genre: d.genre,
        statut,
        paquet: nomDe(c),
        fichier: enPosix(fichier),
        ligne: d.ligne,
        exporte,
      });
    const exporteApres = d =>
      rapportApres.has(d.nom) || (d.noeud ? s.publie(c, d.noeud) : abs === s.entree(c));
    for (const d of decApres.values()) {
      const avantLui = decAvant.get(d.nom);
      if (!avantLui) element(d, 'neuf', exporteApres(d));
      else if (avantLui.texte !== d.texte) element(d, 'changé', exporteApres(d));
    }
    for (const d of decAvant.values()) {
      if (!decApres.has(d.nom)) element(d, 'supprimé', rapportAvant.has(d.nom));
    }
  }

  // The declarations of the reports the lot changes that no element of their sources names.
  const changesEnSet = new Set(changes.map(x => enPosix(x.fichier)));
  for (const c of tous) {
    const { fichier, avant: a, apres: p } = rapportsDe(c);
    if (!changesEnSet.has(fichier)) continue;
    const nommes = new Set(elements.filter(e => e.paquet === nomDe(c)).map(e => e.nom));
    const ajouter = (d, statut) =>
      nommes.has(d.nom) ||
      elements.push({
        id: `${fichier}#${d.nom}`,
        nom: d.nom,
        genre: d.genre,
        statut,
        paquet: nomDe(c),
        fichier,
        ligne: d.ligne,
        exporte: true,
      });
    for (const d of p.values()) {
      const avantLui = a.get(d.nom);
      if (!avantLui) ajouter(d, 'neuf');
      else if (avantLui.texte !== d.texte) ajouter(d, 'changé');
    }
    for (const d of a.values()) if (!p.has(d.nom)) ajouter(d, 'supprimé');
  }

  elements.sort(
    (x, y) => x.fichier.localeCompare(y.fichier) || x.ligne - y.ligne || x.nom.localeCompare(y.nom)
  );
  return {
    etat: 'fait',
    raison: null,
    elements,
    horsDuService: horsDuService.sort(),
    service: s.raison ?? null,
  };
}
