#!/usr/bin/env node
// The formats of the results the circuit decides on, in one module, which the circuit
// (scripts/circuit.mjs), the guards and the tests read; as Bazel's Build Event Protocol and the
// JUnit reports carry the outcome of a build, no reader reads an output meant for the human.
//
//   npx grillhouse resultats --schema <rôle>      prints the JSON schema of a role's sheet
//
// - The sheet of the end of a session (« la fiche ») of the explorateur, the questionneur, the
//   testwriter, the developpeur and the reviewer: the schema of each role (FICHES), which the session receives
//   (`claude -p --output-format json --json-schema <schéma>`) and fills as its last act; claude
//   writes it in the field `structured_output` of its result (Claude Code, « headless »). A field
//   exists only when a reader reads it:
//   - `statut` (FAIT, BLOQUÉ, BESOIN), with `raison` for BLOQUÉ and `question` for BESOIN: the
//     circuit goes on, or stops at « hors-portee » or « besoin » (testwriter, developpeur);
//   - `verts_attendus` (`fichier` from the root, `test` its full name, or none for every green of a
//     file HEAD holds, `raison`): the proof of the red (testwriter);
//   - `renvoi` (`role` testwriter): the circuit relaunches the testwriter, then the proof and the
//     developpeur (developpeur);
//   - `ecarts` (`sujet`, `texte`): the body of the commit message, written by the circuit, each
//     subject once, its value from the last sheet that carries it (developpeur, reviewer);
//   - `decouvertes` (`sujet`, `corps`): each one a ticket filed closed under the ticket, labelled
//     `decouverte`, created by the circuit (every role);
//   - `verdict` (ACCEPTÉ, RENDU), `constats` (`titre`, `corps`, `genre` bloquant or remarque; a
//     blocking one with `regle`, the criterion of the plan or the rule of the frame it holds, and
//     `role` its recipient, or `critere_en_cause`): as Conventional Comments mark
//     a comment blocking or not, the circuit plays the blocking findings alone, each open until a
//     review marks it lifted, and writes the verdict at the ticket for the human, the remarks with
//     it; a RENDU carries a blocking finding, an ACCEPTÉ none (reviewer);
//   - `conformite` (`element`, `conforme` oui or non, `document` CADRE, INTERFACE or
//     ARCHITECTURE, `reference`, `piece`; a « non » with `role` its recipient):
//     one line per element of the lot (scripts/elements-du-lot.mjs), its rule cited from a
//     document of its package, a new export's the entry of the INTERFACE that names it; a line
//     without its reference is refused; a « non » is a blocking finding (`bloquantsDeLaFiche`),
//     and the circuit refuses a sheet without a line for each element (`conformiteDuLot`)
//     (reviewer);
//   - `suivi` (`titre`, `etat` levé or non levé, `preuve`): after a review sent back, each finding
//     before it judged on the difference of the lot, which the circuit writes at the ticket with
//     the verdict, for the human (reviewer);
//   - `question` (reviewer): what goes up to the owner, a real word of the language written in the
//     code; the circuit stops at « besoin » before it commits or relaunches anyone;
//   - `criteres`, `paquets`, `questions` (each with its `piece`): the plan, which the circuit
//     writes at the ticket: the criteria it adds after those the ticket holds, which the circuit
//     keeps as they are; the packages in the title as it names its components (a package name or a
//     path), the list the envelope of every later session writes; the open questions, a change or
//     a removal of a criterion written among them, go up to the supervisor (explorateur);
//   - `reponses` (`numero` of the question, `reponse` CHANGE or GARDE, `texte`): the explorateur's
//     one answer to the questionneur, which the circuit writes at the ticket; a question without
//     an answer stays open (explorateur);
//   - `issue` (QUESTIONS with its `questions`, each with what it aims at, `vise`; AUCUNE; DÉSACCORD
//     with its `desaccord`): the explorateur answers the questions, the disagreement as one, and
//     the circuit writes them at the ticket (questionneur).
//   `lireFiche` reads a session's output: the sheet and the session's id, or the error that
//   names what lacks or does not conform (no `structured_output`, a field out of the schema, a
//   status without its reason, a blocking finding without its criterion or rule, a line of
//   conformity without its rule or a « non » without its recipient, a plan without packages).
// - The findings of a guard, in SARIF 2.1.0 (OASIS), beside its output for the human: one run per
//   guard, `tool.driver.name` the guard; each finding a result, `ruleId` the guard, `level`
//   (error by default), `message.text`, its file and line as its location when it has them, and its
//   properties: `regle` (the guard's own rule), `paquet` (the directory of the package that holds
//   the file, null without a file) and `genre` (`a-corriger` by default, or `a-arbitrer`: a
//   finding a person settles, never a developpeur). A guard writes them by `ecrireSarif` while the
//   run names its results directory (RESULTATS, `<dossier>/sarif/<garde>-<pid>-<n>.sarif`), and
//   nothing without it; a green guard writes its run, empty, so a reader knows it played. The
//   frame's guards write through the known debt (scripts/dette.mjs), their runner
//   (scripts/gardes-du-cadre.mjs) writes for a red guard that wrote none a finding without
//   location, and a project's guards (its script `gardes`) import `ecrireSarif` from this module.
// - The summary of a run of Turborepo (`turbo run … --summarize`, `.turbo/runs/<id>.json`):
//   `garderLesResumes` moves the summaries a run wrote into `<dossier>/turbo/`, and `lireResumes`
//   gives each task, its package and directory, its script, its exit code, its cache status and
//   its log file (from the root).
// - The JSON report of Vitest, which the frame's base configuration writes under
//   `<dossier>/vitest/` while the variable is set (scripts/vitest-config/resultats.mjs):
//   `lireRapportsVitest` gives each test file, its status, the message of a file that does not
//   load, and each test, its title, its full name, its status and its first message.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { paquets } from './paquets.mjs';
import { RESULTATS, VITEST } from './vitest-config/resultats.mjs';

export { RESULTATS };
const SARIF = 'sarif';
const TURBO = 'turbo';
// The kinds of a guard's finding: to fix (a developpeur's work), to settle (a person's decision).
const GENRES = ['a-corriger', 'a-arbitrer'];
const texte = description => ({ type: 'string', description });
const liste = (items, description) => ({ type: 'array', description, items });
const objet = (properties, required = [], description) => ({
  type: 'object',
  ...(description ? { description } : {}),
  additionalProperties: false,
  required,
  properties,
});
const STATUT = {
  statut: { type: 'string', enum: ['FAIT', 'BLOQUÉ', 'BESOIN'] },
  raison: texte('BLOQUÉ : ce qui reste hors de ta portée, et où.'),
  question: texte('BESOIN : la question qui t’arrête, ses options et ta recommandation.'),
};
const DECOUVERTES = {
  decouvertes: liste(
    objet({ sujet: texte('Son sujet, une ligne.'), corps: texte('Son exemple et son adresse.') }, [
      'sujet',
      'corps',
    ]),
    'Chaque découverte hors des critères du ticket ; le circuit la consigne fermée sous le ticket.'
  ),
};
const ECARTS = {
  ecarts: liste(
    objet(
      {
        sujet: texte(
          'Ce qui s’écarte (une référence, un test, un plafond), nommé comme une fiche d’avant le nomme.'
        ),
        texte: texte('L’écart tel que le lot le laisse, sa cause et le ticket qui le referme.'),
      },
      ['sujet', 'texte']
    ),
    'Ce que le message de commit nomme, une fois par sujet, de la dernière fiche qui le porte.'
  ),
};

// The documents a line of a reviewer's conformity cites its rule from.
const DOCUMENTS = ['CADRE', 'INTERFACE', 'ARCHITECTURE'];

// The schema of the sheet of each role the circuit leads.
const FICHES = {
  explorateur: objet(
    {
      criteres: liste(
        texte('Un critère, sans son numéro : un comportement que ses tests mesurent.'),
        'Les critères que le plan ajoute, dans leur ordre ; le circuit garde tels quels ceux que le ticket porte et écrit les tiens après eux. Changer ou retirer un critère écrit est une question ouverte.'
      ),
      paquets: liste(
        texte('Un paquet, comme le titre le nomme : le nom de son paquet, ou son chemin.'),
        'Les paquets à toucher, le fournisseur d’abord ; le circuit les écrit au titre, et chaque séance n’écrit qu’eux.'
      ),
      questions: liste(
        objet(
          {
            question: texte('La question qui reste ouverte, ses options et ta recommandation.'),
            piece: texte('Sa pièce : fichier:ligne, ou la commande et sa sortie.'),
          },
          ['question', 'piece']
        ),
        'Les questions ouvertes du plan, que tu ne tranches pas ; elles montent au superviseur.'
      ),
      reponses: liste(
        objet(
          {
            numero: texte('Le numéro de la question, « 1 ».'),
            reponse: { type: 'string', enum: ['CHANGE', 'GARDE'] },
            texte: texte('CHANGE : ce que le plan devient ; GARDE : pourquoi il reste tel quel.'),
          },
          ['numero', 'reponse', 'texte']
        ),
        'Ta réponse, une fois, à chaque question du questionneur.'
      ),
      ...DECOUVERTES,
    },
    ['criteres', 'paquets', 'questions']
  ),
  testwriter: objet(
    {
      ...STATUT,
      verts_attendus: liste(
        objet(
          {
            fichier: texte('Le fichier de tests, depuis la racine du dépôt.'),
            test: texte(
              'Le nom complet du test ; absent, chaque vert du fichier, s’il est un fichier que HEAD tient.'
            ),
            raison: texte('Pourquoi ce test passe avant le code.'),
          },
          ['fichier', 'raison']
        ),
        'Chaque test vert avant le code, que la preuve du rouge admet.'
      ),
      ...DECOUVERTES,
    },
    ['statut']
  ),
  developpeur: objet(
    {
      ...STATUT,
      renvoi: objet(
        { role: { type: 'string', enum: ['testwriter'] } },
        ['role'],
        'Le rouge qui reste est dans les tests du lot : le circuit relance le testwriter.'
      ),
      ...ECARTS,
      ...DECOUVERTES,
    },
    ['statut']
  ),
  relecteur: objet(
    {
      verdict: { type: 'string', enum: ['ACCEPTÉ', 'RENDU'] },
      conformite: liste(
        objet(
          {
            element: texte('L’élément, tel que la liste des éléments du lot l’écrit.'),
            conforme: {
              type: 'string',
              enum: ['oui', 'non'],
              description: 'non : il rend le lot, à son destinataire.',
            },
            document: {
              type: 'string',
              enum: DOCUMENTS,
              description:
                'Le document de son paquet dont la règle est citée ; un export neuf, l’INTERFACE.',
            },
            reference: texte(
              'La règle dans ce document (« 000-forms, R2 », « § Les frontières ») ; un export neuf, le nom de son entrée.'
            ),
            piece: texte('Sa pièce : fichier:ligne, et ce qu’elle montre.'),
            role: { type: 'string', enum: ['testwriter', 'developpeur'] },
          },
          ['element', 'conforme', 'document', 'reference', 'piece']
        ),
        'Une ligne par élément du lot, chacun une fois : sa conformité à l’architecture.'
      ),
      constats: liste(
        objet(
          {
            titre: texte('Son adresse : fichier et ligne.'),
            genre: {
              type: 'string',
              enum: ['bloquant', 'remarque'],
              description:
                'bloquant : il rend le lot ; remarque : écrite au ticket, elle ne rend pas le lot.',
            },
            regle: texte(
              'Bloquant : le critère du plan (« critère 2 ») ou la règle du cadre (son document et sa règle) qu’il tient.'
            ),
            role: {
              type: 'string',
              enum: ['testwriter', 'developpeur'],
              description: 'Bloquant : l’agent qui écrit la correction, à qui le circuit le rend.',
            },
            corps: texte('Sa preuve : son exemple et ce qu’il montre.'),
            critere_en_cause: texte('Le critère lui-même en cause, au lieu d’un destinataire.'),
          },
          ['titre', 'corps', 'genre']
        ),
        'Chaque constat, bloquant ou remarque ; un verdict RENDU en porte au moins un bloquant, un verdict ACCEPTÉ aucun.'
      ),
      suivi: liste(
        objet(
          {
            titre: texte('Le titre du constat d’avant.'),
            etat: { type: 'string', enum: ['levé', 'non levé'] },
            preuve: texte('Ce que la différence du lot en montre.'),
          },
          ['titre', 'etat']
        ),
        'Relecture bornée : chaque constat de la relecture d’avant, levé ou non.'
      ),
      question: texte(
        'Ce qui revient au responsable (par exemple un vrai mot du langage écrit en dur) : la question, ses pièces et ta recommandation ; le circuit s’arrête avant de commiter ou de relancer.'
      ),
      ...ECARTS,
      ...DECOUVERTES,
    },
    ['verdict']
  ),
  questionneur: objet(
    {
      issue: { type: 'string', enum: ['QUESTIONS', 'AUCUNE', 'DÉSACCORD'] },
      questions: liste(
        objet(
          {
            question: texte('Ta question, dans les mots de la proposition.'),
            vise: { type: 'string', enum: ['flou', 'intention', 'référence', 'règle', 'critère'] },
          },
          ['question', 'vise']
        ),
        'QUESTIONS : tes questions.'
      ),
      desaccord: texte('DÉSACCORD : l’écart que la proposition laisse, et pourquoi.'),
    },
    ['issue']
  ),
};

// The schema of the sheet of <role>, or null for a role the circuit does not lead.
export const schemaDeFiche = role => FICHES[role] ?? null;

// The errors of <valeur> against <schema>, each naming its field by its path <ou>.
function erreurs(schema, valeur, ou) {
  const nom = ou || 'la fiche';
  if (schema.type === 'object') {
    if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur))
      return [`${nom} : un objet`];
    const out = [];
    for (const k of schema.required ?? []) {
      if (!(k in valeur)) out.push(`${ou ? `${ou}.` : ''}${k} : manque`);
    }
    for (const [k, v] of Object.entries(valeur)) {
      const sous = schema.properties[k];
      const chemin = `${ou ? `${ou}.` : ''}${k}`;
      if (!sous) out.push(`${chemin} : hors du schéma`);
      else out.push(...erreurs(sous, v, chemin));
    }
    return out;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(valeur)) return [`${nom} : une liste`];
    return valeur.flatMap((v, i) => erreurs(schema.items, v, `${ou}[${i}]`));
  }
  if (typeof valeur !== 'string') return [`${nom} : un texte`];
  if (schema.enum && !schema.enum.includes(valeur)) {
    return [`${nom} : « ${valeur} » n'est pas l'un de ${schema.enum.join(', ')}`];
  }
  return [];
}

// The rule a line of conformity <l> cites: its document and its reference.
export const regleDeLaLigne = l => `${l.document} ${l.reference}`;

// The blocking findings of a reviewer's sheet <fiche>, the ones that send the lot back: its
// findings of `genre` bloquant, then each line of its conformity that says « non », as a finding
// on its element, its rule, its recipient and its piece.
export const bloquantsDeLaFiche = fiche => [
  ...(fiche.constats ?? []).filter(c => c.genre === 'bloquant'),
  ...(fiche.conformite ?? [])
    .filter(l => l.conforme === 'non')
    .map(l => ({
      titre: l.element,
      genre: 'bloquant',
      regle: regleDeLaLigne(l),
      role: l.role,
      corps: `Non conforme : ${l.piece}`,
    })),
];

// What makes the reviewer's sheet <fiche> out of conformity with the elements of its lot
// <elements> (scripts/elements-du-lot.mjs: `{ id, nom, statut, exporte }`), as a review asks a
// word on every changed file: an element without its line, a line on an element out of the list,
// a new export whose rule does not name its entry in the INTERFACE of its package. The fault, or
// null.
export function conformiteDuLot(fiche, elements) {
  const lignes = fiche.conformite ?? [];
  const ids = new Set(elements.map(e => e.id));
  const fautes = [];
  const sans = elements.filter(e => !lignes.some(l => l.element === e.id)).map(e => e.id);
  if (sans.length) fautes.push(`conformite : sans ligne pour ${sans.join(', ')}`);
  for (const [i, l] of lignes.entries()) {
    if (!ids.has(l.element)) {
      fautes.push(`conformite[${i}].element : ${l.element} n'est pas un élément du lot`);
    }
  }
  for (const e of elements.filter(x => x.statut === 'neuf' && x.exporte)) {
    for (const l of lignes.filter(x => x.element === e.id)) {
      if (!(l.document === 'INTERFACE' && l.reference.includes(e.nom))) {
        fautes.push(
          `conformite : ${e.id} est un export neuf ; sa règle nomme son entrée « ${e.nom} » dans l'INTERFACE de son paquet`
        );
      }
    }
  }
  return fautes.length ? fautes.join(' ; ') : null;
}

// What a sheet of <role> needs beyond its schema: the reason of a BLOQUÉ, the question of a
// BESOIN, the packages of a plan and the number of each answer, the questions of a QUESTIONS, the text of a
// DÉSACCORD, the criterion or rule of a blocking finding, the reference of the rule each line of
// a reviewer's conformity cites in its document and the recipient of a « non », and a reviewer's verdict that follows its blocking findings, its « non » among them
// (RENDU with one, ACCEPTÉ without).
function manques(role, f) {
  const out = [];
  const plein = k => typeof f[k] === 'string' && f[k].trim() !== '';
  if (f.statut === 'BLOQUÉ' && !plein('raison')) out.push('raison : manque, pour BLOQUÉ');
  if (f.statut === 'BESOIN' && !plein('question')) out.push('question : manque, pour BESOIN');
  if (role === 'relecteur') {
    const constats = f.constats ?? [];
    for (const [i, c] of constats.entries()) {
      if (c.genre === 'bloquant' && !(typeof c.regle === 'string' && c.regle.trim())) {
        out.push(`constats[${i}].regle : manque, pour un constat bloquant`);
      }
    }
    for (const [i, l] of (f.conformite ?? []).entries()) {
      if (!l.reference.trim()) {
        out.push(`conformite[${i}].reference : manque, la règle citée dans le ${l.document}`);
      }
      if (l.conforme === 'non') {
        if (!(typeof l.role === 'string' && l.role.trim())) {
          out.push(`conformite[${i}].role : manque, pour un élément non conforme`);
        }
      }
    }
    const bloque = bloquantsDeLaFiche(f).length > 0;
    if (f.verdict === 'RENDU' && !bloque) {
      out.push('verdict : RENDU sans constat bloquant ; un lot sans constat bloquant est ACCEPTÉ');
    }
    if (f.verdict === 'ACCEPTÉ' && bloque) {
      out.push('verdict : ACCEPTÉ avec un constat bloquant, qui rend le lot');
    }
  }
  if (role === 'explorateur') {
    if (!(f.paquets ?? []).length) out.push('paquets : manque, pour un plan');
    for (const [i, r] of (f.reponses ?? []).entries()) {
      if (!/^[1-9]\d*$/.test(r.numero)) {
        out.push(`reponses[${i}].numero : « ${r.numero} » n'est pas le numéro d'une question`);
      }
    }
  }
  if (role === 'questionneur' && f.issue === 'QUESTIONS' && !(f.questions ?? []).length) {
    out.push('questions : manque, pour QUESTIONS');
  }
  if (role === 'questionneur' && f.issue === 'DÉSACCORD' && !plein('desaccord')) {
    out.push('desaccord : manque, pour DÉSACCORD');
  }
  return out;
}

// The sheet of <role> in <sortie>, what claude prints with `--output-format json`: `{ fiche,
// seance }`, or `{ erreur }` naming what lacks or does not conform.
export function lireFiche(role, sortie) {
  const schema = schemaDeFiche(role);
  if (!schema) return { erreur: `le rôle ${role} n'a pas de fiche` };
  let resultat;
  try {
    resultat = JSON.parse(String(sortie ?? ''));
  } catch {
    return { erreur: 'la sortie de la séance n’est pas le résultat JSON de claude' };
  }
  if (!resultat || typeof resultat !== 'object' || !('structured_output' in resultat)) {
    return { erreur: 'le résultat de la séance n’a pas de structured_output : aucune fiche' };
  }
  const fiche = resultat.structured_output;
  const fautes = erreurs(schema, fiche, '');
  if (!fautes.length) fautes.push(...manques(role, fiche));
  if (fautes.length) return { erreur: `fiche non conforme : ${fautes.join(' ; ')}` };
  return { fiche, seance: resultat.session_id ?? null };
}

// The directory of the package of <racine> that holds <fichier> (from the root), null for none.
function paquetDe(racine, fichier) {
  if (!fichier) return null;
  const p = paquets(racine)
    .filter(({ dossier }) => fichier === dossier || fichier.startsWith(`${dossier}/`))
    .sort((a, b) => b.dossier.length - a.dossier.length)[0];
  return p ? p.dossier : null;
}

// The SARIF 2.1.0 of the findings <constats> of <garde> in <racine>: each `{ fichier, ligne,
// message, regle, niveau, genre }`, all but the message optional.
export function sarif({ garde, constats, racine = process.cwd() }) {
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: garde } },
        results: constats.map(c => ({
          ruleId: garde,
          level: c.niveau ?? 'error',
          message: { text: String(c.message ?? '') },
          ...(c.fichier
            ? {
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: c.fichier },
                      ...(c.ligne ? { region: { startLine: c.ligne } } : {}),
                    },
                  },
                ],
              }
            : {}),
          properties: {
            ...(c.regle ? { regle: c.regle } : {}),
            paquet: paquetDe(racine, c.fichier),
            genre: c.genre ?? GENRES[0],
          },
        })),
      },
    ],
  };
}

let numero = 0;
// Writes the SARIF of the findings <constats> of <garde> under the results directory <env> names:
// its path, or null without the variable.
export function ecrireSarif({ garde, constats, racine = process.cwd(), env = process.env }) {
  const dossier = env[RESULTATS];
  if (!dossier) return null;
  const f = path.join(dossier, SARIF, `${garde}-${process.pid}-${++numero}.sarif`);
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, `${JSON.stringify(sarif({ garde, constats, racine }), null, 2)}\n`);
  return f;
}

const fichiers = (dossier, extension) =>
  existsSync(dossier)
    ? readdirSync(dossier)
        .filter(f => f.endsWith(extension))
        .sort()
        .map(f => path.join(dossier, f))
    : [];
const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// The guards that wrote their SARIF under the results directory <dossier>, and their findings:
// `{ gardes, constats }`, each finding `{ garde, regle, fichier, ligne, niveau, message, paquet,
// genre }`, `fichier`, `ligne`, `regle` and `paquet` null when the guard gave none.
export function lireSarif(dossier) {
  const gardes = new Set();
  const constats = [];
  for (const f of fichiers(path.join(dossier, SARIF), '.sarif')) {
    for (const run of lireJson(f)?.runs ?? []) {
      const garde = run.tool?.driver?.name ?? path.basename(f);
      gardes.add(garde);
      for (const r of run.results ?? []) {
        const lieu = r.locations?.[0]?.physicalLocation;
        constats.push({
          garde: r.ruleId ?? garde,
          regle: r.properties?.regle ?? null,
          fichier: lieu?.artifactLocation?.uri ?? null,
          ligne: lieu?.region?.startLine ?? null,
          niveau: r.level ?? 'error',
          message: String(r.message?.text ?? ''),
          paquet: r.properties?.paquet ?? null,
          genre: r.properties?.genre ?? GENRES[0],
        });
      }
    }
  }
  return { gardes: [...gardes].sort(), constats };
}

// Moves the summaries of Turborepo that a run in <racine> wrote (`.turbo/runs/*.json` absent from
// <avant>, the names there before it) into the results directory <env> names; removes them
// without it. `.turbo/runs` goes too when the run created it (<avant> empty) and it is left empty.
export function garderLesResumes(racine, avant, env = process.env) {
  const runs = path.join(racine, '.turbo', 'runs');
  const neufs = (existsSync(runs) ? readdirSync(runs) : []).filter(
    f => !avant.has(f) && f.endsWith('.json')
  );
  const dossier = env[RESULTATS];
  for (const f of neufs) {
    if (dossier) {
      mkdirSync(path.join(dossier, TURBO), { recursive: true });
      // The results directory may lie on another file system: a copy, then the removal.
      copyFileSync(path.join(runs, f), path.join(dossier, TURBO, f));
      rmSync(path.join(runs, f), { force: true });
    } else rmSync(path.join(runs, f), { force: true });
  }
  if (neufs.length && !avant.size && existsSync(runs) && readdirSync(runs).length === 0) {
    rmdirSync(runs);
  }
}

// The tasks of the summaries of Turborepo under the results directory <dossier>, in their order:
// `{ tache, paquet, dossier, script, code, cache, journal }`, `dossier` « . » for the root,
// `code` null for a task that did not run.
export function lireResumes(dossier) {
  return fichiers(path.join(dossier, TURBO), '.json').flatMap(f =>
    (lireJson(f)?.tasks ?? []).map(t => ({
      tache: t.taskId,
      paquet: t.package,
      dossier: t.directory || '.',
      script: t.task,
      code: t.execution?.exitCode ?? null,
      cache: t.cache?.status ?? null,
      journal: t.logFile ?? null,
    }))
  );
}

// The test files of the reports of Vitest under the results directory <dossier>: `{ fichier,
// etat, message, tests }`, `fichier` its absolute path, each test `{ titre, nom, etat, message }`.
export function lireRapportsVitest(dossier) {
  return fichiers(path.join(dossier, VITEST), '.json').flatMap(f =>
    (lireJson(f)?.testResults ?? []).map(r => ({
      fichier: r.name,
      etat: r.status,
      message: String(r.message ?? ''),
      tests: (r.assertionResults ?? []).map(a => ({
        titre: a.title,
        nom: a.fullName || a.title,
        etat: a.status,
        message: String(a.failureMessages?.[0] ?? ''),
      })),
    }))
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [option, role] = process.argv.slice(2);
  const schema = option === '--schema' ? schemaDeFiche(role) : null;
  if (schema) process.stdout.write(`${JSON.stringify(schema)}\n`);
  else {
    process.stderr.write(
      option === '--schema'
        ? `⛔ le rôle ${role} n'a pas de fiche.\n`
        : 'usage: resultats.mjs --schema <rôle>\n'
    );
    process.exitCode = 1;
  }
}
