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
//   - `statut` (FAIT, BLOQUÉ, BESOIN), with `raison` for BLOQUÉ and `question` for BESOIN, each
//     with its `piece`: the circuit goes on, or stops at « hors-portee » or « besoin », the piece
//     with the stop (testwriter, developpeur);
//   - `verts_attendus` (`fichier` from the root, `test` its full name, or none for every green of a
//     file HEAD holds, `raison`): the proof of the red (testwriter);
//   - `renvoi` (`role` testwriter): the circuit relaunches the testwriter, then the proof and the
//     developpeur (developpeur);
//   - `hors_plan` (`critere` its number, `paquet` the package out of the plan that would hold it,
//     `piece`): each criterion the session does not hold for want of a package out of the plan; a
//     FAIT that carries one stops at « hors-portee », as a required check keeps a merge from a
//     change that does not pass it (BP 320.17: « critère 10 hors plan, non fait », in a handover
//     the circuit does not read, fell at the review) (developpeur);
//   - `reponses` (`titre` of the finding, `etat` levé or contesté, `raison` for a contesté,
//     `piece`): as the author answers in each thread of a review on GitHub or Gerrit, a FAIT
//     answers each finding of the reviewer open for him, by its title, and the circuit refuses a
//     sheet without the answer to one (`reponsesAuxConstats`), save in a run where the supervisor
//     gives the task (`--contexte`, the findings open at the run's launch then its context, the
//     ones a RENDU states within it still its task: `constatsDeLaSeance` of
//     scripts/circuit.mjs), and gives the next review each answer
//     under its finding (BP 320.21: the cause of his choice in a handover the circuit does not
//     read, three RENDU, then the stop) (developpeur);
//   - `ecarts` (`sujet`, `texte`): the body of the commit message, written by the circuit, each
//     subject once, its value from the last sheet that carries it (developpeur, reviewer);
//   - `decouvertes` (`sujet`, `corps`): each one a ticket filed closed under the ticket, labelled
//     `decouverte`, created by the circuit (every role);
//   - `verdict` (ACCEPTÉ, RENDU), `constats` (`titre`, `corps`, `piece`, `genre` bloquant or
//     remarque; a
//     blocking one with `regle`, the criterion of the plan or the rule of the frame it holds, and
//     `role` its recipient, or `critere_en_cause`): as Conventional Comments mark
//     a comment blocking or not, the circuit plays the blocking findings alone, each open until a
//     review marks it lifted, and writes the verdict at the ticket for the human, the remarks with
//     it; a RENDU carries a blocking finding, an ACCEPTÉ none (reviewer);
//   - `conformite` (`element`, `conforme` oui or non, `document` CADRE, INTERFACE or
//     ARCHITECTURE, `reference`, `piece`; a « non » with `role` its recipient):
//     one line per element of the lot (scripts/langages/typescript/elements-du-lot.mjs), its rule cited from a
//     document of its package, a new export's the entry of the INTERFACE that names it; a line
//     without its reference is refused; a « non » is a blocking finding (`bloquantsDeLaFiche`),
//     and the circuit refuses a sheet without a line for each element, or with a line on an
//     element out of the list, a file the lot changes named alone or as `<fichier>#<nom>`
//     (`conformiteDuLot`) (reviewer);
//   - `suivi` (`titre`, `etat` levé or non levé, `preuve`): after a review sent back, each finding
//     before it judged on the difference of the lot, which the circuit writes at the ticket with
//     the verdict, for the human (reviewer);
//   - `question`, with its `piece` (reviewer): what goes up to the owner, a real word of the
//     language written in the code; the circuit stops at « besoin » before it commits or
//     relaunches anyone;
//   - `criteres`, `paquets`, `questions` (each with its `motif` and its `piece`): the plan, which the circuit
//     writes at the ticket: the criteria it adds after those the ticket holds, which the circuit
//     keeps as they are; the packages in the title as it names its components (a package name or a
//     path), the list the envelope of every later session writes; the open questions, a change or
//     a removal of a criterion written among them, go up to the supervisor, each naming why: the
//     language, the architecture, a gap to the reference, or no answer (BP 328: a question the
//     ticket settled stopped the plan) (explorateur);
//   - `ecartes` (`composant`, `raison`): the components of the survey the plan does not touch,
//     which the circuit writes at the ticket; each other component of the survey the circuit
//     plays is in the packages (explorateur);
//   - `reponses` (`numero` of the question, `reponse` CHANGE or GARDE, `texte`): the explorateur's
//     one answer to the questionneur, which the circuit writes at the ticket; a question without
//     an answer stays open (explorateur);
//   - `issue` (QUESTIONS with its `questions`, each with what it aims at, `vise`, and its
//     `piece`; AUCUNE; DÉSACCORD
//     with its `desaccord`): the explorateur answers the questions, the disagreement as one, and
//     the circuit writes them at the ticket (questionneur);
//   - `verdicts` (`decouverte`, `verdict` among VERDICTS_DU_TRI, `texte`, `piece`): the tri of the
//     discoveries, the explorateur's sheet after the queue (its own schema, `tri`), one line per
//     discovery of the ticket, which the circuit writes at the ticket of each and reopens under
//     `a-valider` for an a-porter or a non-confirmee; the piece of a traitee or an a-porter, a
//     command played again on main and its output or file:line, is required, and the circuit
//     refuses a sheet without a line for each discovery, with a line on another, or two on one
//     (`conformiteDuTri`) (grillhouse-0yu.5).
//   `lireFiche` reads a session's output: the sheet and the session's id, or the error that
//   names what lacks or does not conform (no `structured_output`, a field out of the schema, a
//   status without its reason, a blocking finding without its criterion or rule, a line of
//   conformity without its rule or a « non » without its recipient, a plan without packages, a
//   fact without its piece, a piece in no form, given the copy, a file piece not in it, and, given
//   the ticket's description, a piece of the ticket whose criterion or section it lacks).
// - The piece of a fact (« la pièce »), one format, as a code review cites the line it judges: a
//   finding, a question or a stop carries it, so the agent who takes the fact up re-reads it
//   before he builds on it (BP 320.9: a line read wrong, copied by five agents up to the owner).
//   Either `<fichier>:<ligne>` or `<fichier>:<ligne>-<fin>`, the file from the root of the copy,
//   the line from 1, then, after a space, what it shows (« packages/a/src/x.ts:3 divise par sa valeur. »); or `$ <commande>` on
//   its first line and its output on the lines after (after a « \n » written in two characters,
//   in a piece written on one line); or, for what the ticket says, `ticket, critère <N>` or
//   `ticket, § <section>`, then « : » and what it shows, as a review of a specification cites its
//   section (BP 320.17: the questionneur's pieces on the plan it questions, refused). `lirePiece`
//   reads it; the circuit gives `lireFiche` the copy, where each file piece's file stands and
//   holds its line, and the ticket's description, which carries each criterion or section cited.
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
//   location, and a project's guards (its script `gardes`) import `ecrireSarif` by the package's
//   entry `@roomi-fields/grillhouse/resultats`, whose types (./resultats.d.ts) declare it alone.
// - The verdict of a run of tests, the summaries and reports its tools write in the results
//   directory, is the module of the project's language's to read (`verdict`, scripts/jointure.d.ts,
//   scripts/langages.mjs).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { paquets } from './paquets.mjs';

// The variable that names the results directory of a run.
export const RESULTATS = 'GRILLHOUSE_RESULTATS';
const SARIF = 'sarif';
// The kind of a note of a guard, no red: a key of the known debt inscribed above what the guard
// finds, which the circuit lowers (scripts/dette.mjs, scripts/circuit.mjs).
export const A_ELAGUER = 'a-elaguer';
// The kinds of a guard's finding: to fix (a developpeur's work), to settle (a person's decision),
// to lower (a note).
const GENRES = ['a-corriger', 'a-arbitrer', A_ELAGUER];
const texte = description => ({ type: 'string', description });
const liste = (items, description) => ({ type: 'array', description, items });
const objet = (properties, required = [], description) => ({
  type: 'object',
  ...(description ? { description } : {}),
  additionalProperties: false,
  required,
  properties,
});
// The description of a piece in a sheet's schema, the format `lirePiece` reads.
const PIECE =
  'fichier:ligne depuis la racine de la copie, puis ce qu’elle montre ; ou « $ <commande> » et sa sortie aux lignes suivantes ; ou, pour ce que dit le ticket, « ticket, critère <N> » ou « ticket, § <section> », puis « : » et ce qu’elle montre';
const piece = quoi => texte(`${quoi} : ${PIECE}.`);
const STATUT = {
  statut: { type: 'string', enum: ['FAIT', 'BLOQUÉ', 'BESOIN'] },
  raison: texte('BLOQUÉ : ce qui reste hors de ta portée, et où.'),
  question: texte('BESOIN : la question qui t’arrête, ses options et ta recommandation.'),
  piece: piece('BLOQUÉ ou BESOIN : la pièce de ta raison ou de ta question'),
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

// Why an open question of a plan goes up: what is the owner's (the language, the architecture, a
// gap to the mature reference), or no answer the explorateur holds.
const MOTIFS = ['langage', 'architecture', 'écart à la référence', 'sans réponse'];

// The verdicts of the tri of the discoveries (grillhouse-0yu.5), as the triage of a report of
// Chromium or Mozilla: the lot or a ticket already holds it, it repeats another, it stays out of
// the actual use, it is a defect of the actual use, or no proof could be played again. The
// verdicts that reopen their discovery under `a-valider`, for the owner.
export const VERDICTS_DU_TRI = ['traitee', 'doublon', 'sans-suite', 'a-porter', 'non-confirmee'];
export const VERDICTS_ROUVERTS = ['a-porter', 'non-confirmee'];
// The verdicts whose piece is a command played again on main and its output, or file:line.
const VERDICTS_PROUVES = ['traitee', 'a-porter'];

// The schema of the sheet of each role the circuit leads, and of the tri of the discoveries
// (`tri`), the explorateur's after the queue.
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
      ecartes: liste(
        objet(
          {
            composant: texte('Un composant du relevé, comme le relevé le nomme.'),
            raison: texte('Pourquoi le plan n’y touche pas.'),
          },
          ['composant', 'raison']
        ),
        'Les composants du relevé que le plan ne touche pas, chacun avec sa raison ; chaque autre composant du relevé est dans tes paquets.'
      ),
      questions: liste(
        objet(
          {
            question: texte('La question qui reste ouverte, ses options et ta recommandation.'),
            motif: {
              type: 'string',
              enum: MOTIFS,
              description:
                'Pourquoi elle monte : ce qui revient au responsable (le langage, l’architecture, un écart à la référence), ou « sans réponse », tu n’as pas la réponse.',
            },
            piece: piece('Sa pièce'),
          },
          ['question', 'motif', 'piece']
        ),
        'Les questions ouvertes du plan, que tu ne tranches pas ; elles montent au superviseur. Une question que tu sais trancher, tu la tranches dans le plan.'
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
      hors_plan: liste(
        objet(
          {
            critere: texte('Le numéro du critère du ticket, « 10 ».'),
            paquet: texte('Le paquet hors du plan qui le porterait, comme le titre le nomme.'),
            piece: piece('Sa pièce'),
          },
          ['critere', 'paquet', 'piece']
        ),
        'Chaque critère du ticket que tu ne tiens pas parce qu’il demande un paquet hors du plan ; le circuit monte au superviseur, qui étend le plan ou amende le critère.'
      ),
      reponses: liste(
        objet(
          {
            titre: texte('Le titre du constat, tel que ta consigne l’écrit.'),
            etat: {
              type: 'string',
              enum: ['levé', 'contesté'],
              description:
                'levé : ton lot le lève ; contesté : tu ne le lèves pas, avec ta raison.',
            },
            raison: texte('Contesté : pourquoi le lot reste tel quel.'),
            piece: piece('Sa pièce, ce qui le lève ou ce qui fonde ta raison'),
          },
          ['titre', 'etat', 'piece']
        ),
        'FAIT : ta réponse à chaque constat du relecteur ouvert pour toi, par son titre ; le relecteur la lit sous son constat. Le circuit refuse une fiche à laquelle il en manque une.'
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
            piece: piece('Sa pièce'),
            role: { type: 'string', enum: ['testwriter', 'developpeur'] },
          },
          ['element', 'conforme', 'document', 'reference', 'piece']
        ),
        'Une ligne par élément du lot, chacun une fois : sa conformité à l’architecture.'
      ),
      constats: liste(
        objet(
          {
            titre: texte('Son sujet, une ligne.'),
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
            piece: piece('Sa pièce'),
            critere_en_cause: texte('Le critère lui-même en cause, au lieu d’un destinataire.'),
          },
          ['titre', 'corps', 'genre', 'piece']
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
        'Ce qui revient au responsable (par exemple un vrai mot du langage écrit en dur) : la question et ta recommandation ; le circuit s’arrête avant de commiter ou de relancer.'
      ),
      piece: piece('question : sa pièce'),
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
            piece: piece('Sa pièce, ce qui dans la proposition ou le dépôt la fait naître'),
          },
          ['question', 'vise', 'piece']
        ),
        'QUESTIONS : tes questions.'
      ),
      desaccord: texte('DÉSACCORD : l’écart que la proposition laisse, et pourquoi.'),
    },
    ['issue']
  ),
  tri: objet(
    {
      verdicts: liste(
        objet(
          {
            decouverte: texte('L’id de la découverte, tel que ta consigne la liste.'),
            verdict: {
              type: 'string',
              enum: VERDICTS_DU_TRI,
              description:
                'traitee : le lot ou un ticket existant la couvre ; doublon : d’une autre découverte ou d’un ticket ; sans-suite : hypothétique, hors de l’usage actuel ; a-porter : un défaut de l’usage actuel ; non-confirmee : tu n’as pas pu rejouer de preuve.',
            },
            texte: texte(
              'traitee et doublon : ce qui la couvre, nommé (le lot, un ticket, une découverte) ; sans-suite : sa raison ; a-porter : le défaut ; non-confirmee : ce qui manque pour trancher.'
            ),
            piece: piece(
              'traitee et a-porter : la commande rejouée sur main et sa sortie, ou fichier:ligne'
            ),
          },
          ['decouverte', 'verdict', 'texte']
        ),
        'Une ligne par découverte de ta consigne, ni plus ni moins.'
      ),
    },
    ['verdicts']
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

// What makes the reviewer's sheet <fiche> out of conformity with the list of its lot
// (scripts/langages/typescript/elements-du-lot.mjs: <elements>, each `{ id, nom, statut, exporte }`, and <fichiers>,
// every file the lot changes), as a review asks a word on every changed element: an element
// without its line, a line on an element out of the list, a new export whose rule does not name
// its entry in the INTERFACE of its package. A line on a changed file, a source or not, names it
// alone or one of its parts, `<fichier>#<nom>`, as a review on GitHub or Gerrit accepts a comment
// on any line of any changed file (BP 320.17: lines on an INTERFACE.md, a CADRE.md and a ceiling
// the commit changes, refused); a changed file asks no line. The fault, or null.
export function conformiteDuLot(fiche, { elements, fichiers }) {
  const lignes = fiche.conformite ?? [];
  const ids = new Set(elements.map(e => e.id));
  const hors = new Set(fichiers ?? []);
  const duLot = element => {
    if (ids.has(element) || hors.has(element)) return true;
    const diese = element.lastIndexOf('#');
    return diese > 0 && diese < element.length - 1 && hors.has(element.slice(0, diese));
  };
  const fautes = [];
  const sans = elements.filter(e => !lignes.some(l => l.element === e.id)).map(e => e.id);
  if (sans.length) fautes.push(`conformite : sans ligne pour ${sans.join(', ')}`);
  for (const [i, l] of lignes.entries()) {
    if (!duLot(l.element)) {
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

// What makes the explorateur's answer <fiche> out of conformity with the <posees> questions put to
// it, as a reviewer gives a line to each element of its lot: each question without its line of
// `reponses`, by its number. The fault, or null.
export function reponsesAuxQuestions(fiche, posees) {
  const numeros = new Set((fiche.reponses ?? []).map(r => Number(r.numero)));
  const sans = Array.from({ length: posees }, (_, i) => i + 1).filter(n => !numeros.has(n));
  return sans.length ? `reponses : sans ligne pour les questions ${sans.join(', ')}` : null;
}

// What makes the developpeur's sheet <fiche> out of conformity with the findings open for him
// (<titres>), as the author answers in each thread of a review: a FAIT without the answer to one,
// by its title (a BLOQUÉ or a BESOIN stops the circuit before any review). The fault, or null.
export function reponsesAuxConstats(fiche, titres) {
  if (fiche.statut !== 'FAIT') return null;
  const repondus = new Set((fiche.reponses ?? []).map(r => r.titre));
  const sans = titres.filter(t => !repondus.has(t)).map(t => `« ${t} »`);
  if (!sans.length) return null;
  return `reponses : sans réponse ${sans.length > 1 ? 'aux constats' : 'au constat'} ${sans.join(', ')}`;
}

// What makes the sheet of the tri <fiche> out of conformity with the discoveries <decouvertes> of
// the ticket (their ids), as a reviewer gives a line to each element of its lot: a discovery
// without its line, a line on an id out of the list, a discovery with two lines. The fault, or
// null.
export function conformiteDuTri(fiche, decouvertes) {
  const lignes = (fiche.verdicts ?? []).map(l => l.decouverte);
  const fautes = [];
  const sans = decouvertes.filter(d => !lignes.includes(d));
  if (sans.length) fautes.push(`verdicts : sans ligne pour ${sans.join(', ')}`);
  for (const d of new Set(lignes)) {
    if (!decouvertes.includes(d)) fautes.push(`verdicts : ${d} n'est pas une découverte du ticket`);
    else if (lignes.filter(x => x === d).length > 1) fautes.push(`verdicts : ${d} a deux lignes`);
  }
  return fautes.length ? fautes.join(' ; ') : null;
}

// The piece of a fact <texte>: `{ fichier, ligne }` for « <fichier>:<ligne> », `{ fichier, ligne,
// fin }` for « <fichier>:<ligne>-<fin> » (as SARIF's region has a start line and an optional end
// line), then what it shows after a space, the place in backquotes or followed by punctuation
// read the same; `{ commande, sortie }` for « $ <commande> » and its output on the lines after,
// a « \n » written in two characters read as the line break of a piece written on one line (BP
// 320.3.9: a BESOIN refused on it); `{ critere }` for « ticket, critère <N> » and `{ section }`
// for « ticket, § <section> » (in « » or up to « : »), what the ticket says, as a review of a
// specification cites its section (« RFC 9110 § 15.5 »; BP 320.17: three sheets of the
// questionneur refused for a piece on the plan they question); null for a text in no form.
export function lirePiece(texte) {
  const t = String(texte ?? '').trim();
  const ticket = /^ticket\s*,\s*/i.exec(t);
  if (ticket) return pieceDuTicket(t.slice(ticket[0].length));
  if (t.startsWith('$ ')) {
    const vrai = t.indexOf('\n');
    const saut = vrai < 0 ? t.indexOf('\\n') : vrai;
    const commande = saut < 0 ? '' : t.slice(2, saut).trim();
    const sortie = saut < 0 ? '' : t.slice(saut + (vrai < 0 ? 2 : 1)).trim();
    return commande && sortie ? { commande, sortie } : null;
  }
  let lieu = t.split(/\s/)[0];
  while (lieu && '`.,;:)'.includes(lieu.at(-1))) lieu = lieu.slice(0, -1);
  while (lieu.startsWith('`')) lieu = lieu.slice(1);
  const deux = lieu.lastIndexOf(':');
  const [debut, fin, ...reste] = lieu.slice(deux + 1).split('-');
  const nombre = n => (/^\d+$/.test(n ?? '') && Number(n) >= 1 ? Number(n) : null);
  const ligne = nombre(debut);
  if (deux < 1 || !ligne || reste.length) return null;
  if (fin === undefined) return { fichier: lieu.slice(0, deux), ligne };
  if (!nombre(fin) || nombre(fin) < ligne) return null;
  return { fichier: lieu.slice(0, deux), ligne, fin: nombre(fin) };
}

// The piece of the ticket <reste>, what follows « ticket, »: `{ critere }` for « critère <N> »,
// `{ section }` for « § <section> », the section in « » or up to « : » or the end; else null. A
// piece cites one criterion: « critère 1 et 7 » is none.
function pieceDuTicket(reste) {
  const critere = /^critère\s+([1-9]\d*)(?!\d)(?!\s*(?:et|,)\s*\d)(?:$|[\s.,;:])/i.exec(reste);
  if (critere) return { critere: Number(critere[1]) };
  if (!reste.startsWith('§')) return null;
  const apres = reste.slice(1).trim();
  const cite = /^«\s*([^»]*?)\s*»/.exec(apres);
  const section = (cite ? cite[1] : apres.split(/\s:(?:\s|$)|:$/)[0]).trim();
  return section ? { section } : null;
}

// The pieces of the sheet <f>, each `[son chemin, son texte]`: of the stop it carries (a status,
// a reviewer's question), of its findings, of its lines of conformity, of its questions, of its
// criteria out of the plan, of the verdicts of a tri, of the developpeur's answers.
const piecesDe = f => [
  ...('piece' in f ? [['piece', f.piece]] : []),
  ...['constats', 'conformite', 'questions', 'hors_plan', 'verdicts', 'reponses'].flatMap(k =>
    (f[k] ?? []).map((x, i) => [`${k}[${i}].piece`, x.piece]).filter(([, p]) => p !== undefined)
  ),
];

// What makes a file piece of the sheet <f> not found in the copy <copie>: a file absent from it,
// or out of it, or a line (the end of a range) past its end; each fault, naming its piece.
function introuvables(f, copie) {
  const out = [];
  const racine = path.resolve(copie);
  for (const [ou, p] of piecesDe(f)) {
    const lu = lirePiece(p);
    if (!lu?.fichier) continue;
    const abs = path.resolve(racine, lu.fichier);
    const lieu = `${lu.fichier}:${lu.ligne}${lu.fin ? `-${lu.fin}` : ''}`;
    if (!abs.startsWith(`${racine}${path.sep}`) || !existsSync(abs) || !statSync(abs).isFile()) {
      out.push(`${ou} : ${lieu} introuvable dans la copie : pas de tel fichier`);
      continue;
    }
    const contenu = readFileSync(abs, 'utf8');
    const lignes = contenu.split('\n').length - (contenu.endsWith('\n') ? 1 : 0);
    if ((lu.fin ?? lu.ligne) > lignes) {
      out.push(`${ou} : ${lieu} introuvable dans la copie : le fichier a ${lignes} lignes`);
    }
  }
  return out;
}

// A heading of a description, without its marks and its case, as a piece of the ticket names it.
const titreLu = titre => titre.replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr');

// What makes a piece of the ticket of the sheet <f> absent from the description <description>: a
// criterion no numbered line of its section of criteria (a heading that begins with « Critères »)
// carries, a section no heading names (its title, or its beginning); each fault, naming its piece.
function horsDuTicket(f, description) {
  const titres = [];
  const criteres = new Set();
  let dedans = false;
  for (const ligne of String(description).split('\n')) {
    const tete = /^#{1,6}\s+(.*)$/.exec(ligne);
    if (tete) {
      titres.push(titreLu(tete[1]));
      dedans = /^Critères\b/i.test(tete[1].trim());
      continue;
    }
    const numero = /^\s*(\d+)[.)]\s/.exec(ligne);
    if (dedans && numero) criteres.add(Number(numero[1]));
  }
  const out = [];
  for (const [ou, p] of piecesDe(f)) {
    const lu = lirePiece(p);
    if (lu?.critere && !criteres.has(lu.critere)) {
      out.push(
        `${ou} : ticket, critère ${lu.critere} : la description du ticket n'a pas de critère ${lu.critere}`
      );
    }
    if (lu?.section && !titres.some(x => x.startsWith(titreLu(lu.section)))) {
      out.push(
        `${ou} : ticket, § ${lu.section} : la description du ticket n'a pas de section « ${lu.section} »`
      );
    }
  }
  return out;
}

// What a sheet of <role> needs beyond its schema: the reason of a BLOQUÉ, the question of a
// BESOIN, the number of each criterion out of the plan, the reason of a developpeur's answer
// contesté, the packages of a plan and the number of each answer, the questions of a QUESTIONS, the text of a
// DÉSACCORD, the criterion or rule of a blocking finding, the reference of the rule each line of
// a reviewer's conformity cites in its document and the recipient of a « non », and a reviewer's verdict that follows its blocking findings, its « non » among them
// (RENDU with one, ACCEPTÉ without), the piece of a BLOQUÉ, a BESOIN and a reviewer's question,
// the text of each verdict of a tri and the piece of a traitee or an a-porter, and each piece in
// one of its forms (`lirePiece`).
function manques(role, f) {
  const out = [];
  const plein = k => typeof f[k] === 'string' && f[k].trim() !== '';
  if (f.statut === 'BLOQUÉ' && !plein('raison')) out.push('raison : manque, pour BLOQUÉ');
  if (f.statut === 'BESOIN' && !plein('question')) out.push('question : manque, pour BESOIN');
  if (['BLOQUÉ', 'BESOIN'].includes(f.statut) && !('piece' in f)) {
    out.push(`piece : manque, pour ${f.statut}`);
  }
  if (role === 'relecteur' && 'question' in f && !('piece' in f)) {
    out.push('piece : manque, pour la question');
  }
  for (const [ou, p] of piecesDe(f)) {
    if (!lirePiece(p)) {
      out.push(
        `${ou} : « ${p} » n'est pas une pièce (fichier:ligne, « $ <commande> » et sa sortie, ou « ticket, critère <N> » ou « ticket, § <section> »)`
      );
    }
  }
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
  for (const [i, h] of (f.hors_plan ?? []).entries()) {
    if (!/^[1-9]\d*$/.test(h.critere)) {
      out.push(`hors_plan[${i}].critere : « ${h.critere} » n'est pas le numéro d'un critère`);
    }
  }
  if (role === 'developpeur') {
    for (const [i, r] of (f.reponses ?? []).entries()) {
      if (r.etat === 'contesté' && !(typeof r.raison === 'string' && r.raison.trim())) {
        out.push(`reponses[${i}].raison : manque, pour contesté`);
      }
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
  if (role === 'tri') {
    for (const [i, l] of (f.verdicts ?? []).entries()) {
      if (!l.texte.trim()) out.push(`verdicts[${i}].texte : manque, pour ${l.verdict}`);
      if (VERDICTS_PROUVES.includes(l.verdict) && !('piece' in l)) {
        out.push(
          `verdicts[${i}].piece : manque, pour ${l.verdict} : « $ <commande> » rejouée sur main et sa sortie, ou fichier:ligne ; sans elle, le verdict est non-confirmee`
        );
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
// seance }`, or `{ erreur }` naming what lacks or does not conform; with <copie>, the directory
// of the copy, each file piece of the sheet stands in it, its file and its line; with <ticket>,
// the description of the ticket, each piece of the ticket names a criterion or a section of it.
export function lireFiche(role, sortie, { copie, ticket } = {}) {
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
  if (!fautes.length && copie) fautes.push(...introuvables(fiche, copie));
  if (!fautes.length && typeof ticket === 'string') fautes.push(...horsDuTicket(fiche, ticket));
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
// message, regle, niveau, genre, trouve }`, all but the message optional (`trouve`, the count a
// note of the debt finds).
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
            ...(c.trouve !== undefined ? { trouve: c.trouve } : {}),
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
// genre }`, `fichier`, `ligne`, `regle` and `paquet` null when the guard gave none, and `trouve`,
// the count a note of the debt finds, when it carries one.
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
          ...(r.properties?.trouve !== undefined ? { trouve: r.properties.trouve } : {}),
        });
      }
    }
  }
  return { gardes: [...gardes].sort(), constats };
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
