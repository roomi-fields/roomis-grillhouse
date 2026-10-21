#!/usr/bin/env node
// The formats of the results the circuit decides on, in one module, which the circuit
// (scripts/circuit.mjs), the guards and the tests read; as Bazel's Build Event Protocol and the
// JUnit reports carry the outcome of a build, no reader reads an output meant for the human.
//
//   node scripts/resultats.mjs --schema <rôle>      prints the JSON schema of a role's sheet
//
// - The sheet of the end of a session (« la fiche ») of the testeur, the developpeur, the reviewer,
//   the regulator, the questionneur and the technical referent: the schema of each role (FICHES), which the session receives
//   (`claude -p --output-format json --json-schema <schéma>`) and fills as its last act; claude
//   writes it in the field `structured_output` of its result (Claude Code, « headless »). A field
//   exists only when a reader reads it:
//   - `statut` (FAIT, BLOQUÉ, BESOIN), with `raison` for BLOQUÉ and `question` for BESOIN: the
//     circuit goes on, or stops at « hors-portee » or « besoin » (testeur, developpeur);
//   - `verts_attendus` (`fichier` from the root, `test` its full name, or none for every green of a
//     file HEAD holds, `raison`): the proof of the red (testeur);
//   - `renvoi` (`role` testeur, `composant`): the circuit plays that component from its testeur
//     (developpeur);
//   - `ecarts`: the body of the commit message, written by the circuit (developpeur, reviewer);
//   - `decouvertes` (`sujet`, `corps`): each one a ticket filed closed under the ticket, labelled
//     `decouverte`, created by the circuit (every role);
//   - `verdict` (ACCEPTÉ, RENDU), `constats` (`titre`, `corps`, `role` and `composant` its
//     recipient, or `critere_en_cause`), `remarques`: the circuit plays the findings and writes the
//     verdict at the ticket for the human (reviewer);
//   - `suivi` (`titre`, `etat` levé or non levé, `preuve`): after a review sent back, each finding
//     before it judged on the difference of the lot, which the circuit writes at the ticket with
//     the verdict, for the human (reviewer);
//   - `question` (reviewer): what goes up to the owner, a real word of the language written in the
//     code; the circuit stops at « besoin » before it commits or relaunches anyone;
//   - `decision` (« RELANCE --reprendre », « RELANCE --depuis » with `depuis`, « MONTE » with
//     `question`), `contexte`: what the circuit applies (regulator);
//   - `faits` (`sujet` of SUJETS_DES_FAITS, `composant`): the facts of the state the decision
//     rests on, which the circuit checks before it applies the decision, and compares with the
//     facts of the RELANCE before on the same stop (regulator);
//   - `issue` (QUESTIONS with its `questions`, each with what it aims at, `vise`; AUCUNE; DÉSACCORD
//     with its `desaccord`): the circuit hands the questions to the author, ends the questioning,
//     or sends it up to the supervisor, and writes the exchange at the ticket (questionneur);
//   - `reponses` (`question`, `choix` CHANGE or GARDE, `texte`: what the proposal becomes, or why
//     it stays): the circuit hands them to the questionneur and writes them at the ticket (the
//     regulator, the technical referent);
//   - `titre`, `description`: the plan as an answer changes it, which the circuit writes to the
//     ticket (`bd update`) (technical referent).
//   `lireFiche` reads a session's output: the sheet and the session's id, or the error that
//   names what lacks or does not conform (no `structured_output`, a field out of the schema, a
//   status without its reason).
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
// The subjects of the facts a regulator's decision rests on, which the circuit checks on its
// state (scripts/circuit.mjs, `faitFaux`): all but sous-charge name their component.
export const SUJETS_DES_FAITS = [
  'au-titre',
  'hors-titre',
  'rouge-de',
  'sans-changement',
  'sous-charge',
];

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
    texte('Un écart, sa cause et le ticket qui le referme.'),
    'Ce que le message de commit nomme : un rouge de structure, un écart voulu.'
  ),
};

// The answers of an author to the questions of the questionneur.
const REPONSES = {
  reponses: liste(
    objet(
      {
        question: texte('La question, telle que le questionneur l’a posée.'),
        choix: { type: 'string', enum: ['CHANGE', 'GARDE'] },
        texte: texte('CHANGE : ce que ta proposition devient ; GARDE : pourquoi elle reste.'),
      },
      ['question', 'choix', 'texte']
    ),
    'Ta réponse à chaque question du questionneur.'
  ),
};

// The schema of the sheet of each role the circuit leads.
const FICHES = {
  testeur: objet(
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
        { role: { type: 'string', enum: ['testeur'] }, composant: texte('Un composant du titre.') },
        ['role', 'composant'],
        'Le rouge qui reste est dans les tests de ce composant, le tien ou un d’avant.'
      ),
      ...ECARTS,
      ...DECOUVERTES,
    },
    ['statut']
  ),
  relecteur: objet(
    {
      verdict: { type: 'string', enum: ['ACCEPTÉ', 'RENDU'] },
      constats: liste(
        objet(
          {
            titre: texte('Son adresse : fichier et ligne.'),
            role: { type: 'string', enum: ['testeur', 'developpeur'] },
            composant: texte('Le composant du titre où la correction s’écrit.'),
            corps: texte('Sa preuve et la règle qu’il enfreint.'),
            critere_en_cause: texte('Le critère lui-même en cause, au lieu d’un destinataire.'),
          },
          ['titre', 'corps']
        ),
        'Chaque constat d’un verdict RENDU.'
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
      remarques: liste(texte('Une remarque, nommée, qui ne rend pas le lot.')),
      question: texte(
        'Ce qui revient au responsable (par exemple un vrai mot du langage écrit en dur) : la question, ses pièces et ta recommandation ; le circuit s’arrête avant de commiter ou de relancer.'
      ),
      ...ECARTS,
      ...DECOUVERTES,
    },
    ['verdict']
  ),
  regulateur: objet(
    {
      decision: { type: 'string', enum: ['RELANCE --reprendre', 'RELANCE --depuis', 'MONTE'] },
      depuis: objet(
        {
          role: { type: 'string', enum: ['testeur', 'developpeur'] },
          composant: texte('Un composant du titre.'),
        },
        ['role', 'composant'],
        'RELANCE --depuis : l’agent qui reprend le lot.'
      ),
      contexte: texte('RELANCE : ce que l’agent relancé fait dans son composant.'),
      question: texte('MONTE : la question, ses pièces et ta recommandation.'),
      faits: liste(
        objet(
          {
            sujet: { type: 'string', enum: SUJETS_DES_FAITS },
            composant: texte('Le composant ou le paquet du fait ; sans objet pour sous-charge.'),
          },
          ['sujet']
        ),
        'Chaque fait de l’état sur lequel ta décision s’appuie : au-titre et hors-titre (un composant au titre ou non), rouge-de (un rouge de l’arrêt dans ce composant ou ce paquet), sans-changement (la copie ne change rien de ce composant), sous-charge (une commande de l’arrêt à repasser, sous charge). Le circuit vérifie chacun sur l’état avant d’appliquer ta décision, et refuse une décision qui s’appuie sur un fait faux.'
      ),
      ...REPONSES,
      ...DECOUVERTES,
    },
    ['decision']
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
        'QUESTIONS : tes questions de ce tour.'
      ),
      desaccord: texte(
        'DÉSACCORD : ce qui reste, que la réponse de l’auteur ne lève pas, et pourquoi.'
      ),
    },
    ['issue']
  ),
  'referent-technique': objet(
    {
      ...REPONSES,
      titre: texte('Le titre du ticket que ta réponse change, entier.'),
      description: texte('La description du ticket que ta réponse change, entière.'),
      ...DECOUVERTES,
    },
    ['reponses']
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

// What a sheet of <role> needs beyond its schema: the reason of a BLOQUÉ, the question of a
// BESOIN or a MONTE, the agent of a RELANCE --depuis, the component of a fact, the questions of a
// QUESTIONS, the text of a DÉSACCORD, the plan an answer CHANGE gives.
function manques(role, f) {
  const out = [];
  const plein = k => typeof f[k] === 'string' && f[k].trim() !== '';
  if (f.statut === 'BLOQUÉ' && !plein('raison')) out.push('raison : manque, pour BLOQUÉ');
  if (f.statut === 'BESOIN' && !plein('question')) out.push('question : manque, pour BESOIN');
  if (role === 'regulateur' && f.decision === 'MONTE' && !plein('question')) {
    out.push('question : manque, pour MONTE');
  }
  if (role === 'regulateur' && f.decision === 'RELANCE --depuis' && !f.depuis) {
    out.push('depuis : manque, pour RELANCE --depuis');
  }
  for (const [i, x] of (role === 'regulateur' ? (f.faits ?? []) : []).entries()) {
    if (x.sujet !== 'sous-charge' && !(typeof x.composant === 'string' && x.composant.trim())) {
      out.push(`faits[${i}].composant : manque, pour ${x.sujet}`);
    }
  }
  if (role === 'questionneur' && f.issue === 'QUESTIONS' && !(f.questions ?? []).length) {
    out.push('questions : manque, pour QUESTIONS');
  }
  if (role === 'questionneur' && f.issue === 'DÉSACCORD' && !plein('desaccord')) {
    out.push('desaccord : manque, pour DÉSACCORD');
  }
  if (
    role === 'referent-technique' &&
    (f.reponses ?? []).some(r => r.choix === 'CHANGE') &&
    !plein('titre') &&
    !plein('description')
  ) {
    out.push('titre ou description : manque, pour une réponse CHANGE');
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
