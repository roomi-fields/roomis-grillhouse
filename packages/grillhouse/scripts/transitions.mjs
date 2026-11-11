// The decisions of the circuit of a ticket (scripts/circuit.mjs), with no input nor output, as a
// workflow of Temporal decides on the results of its activities and a reducer of Redux on its
// actions: from the state of the run, the circuit's memory and the facts read so far, the step
// that follows. The circuit reads the facts and interprets what this module returns; this module
// reads no file, launches no process and imports no module that does (a guard holds it:
// tests/unit/transitions.spec.ts).
//
// `transition({ etat, memoire, ticket, reprend, faits })`:
//
// - `etat`, the run at its step: `{ etape, tentative, rapport, finale, relanceSurLeRefus }`;
// - `memoire`, what the circuit keeps between steps (`controlesRouges`, `renvoiAuTestwriter`,
//   `refus`, `rienALivrer`, `regeneration`, `regenereSur`, `aRegenerer`, `verifie`, `constats`);
// - `ticket`, `{ id, paquets, sorte, copie }`;
// - `reprend`, whether this step is the first of a `--reprendre`;
// - `faits`, the facts read for this step, by their name.
//
// It returns either the next fact to read, `{ besoin: { fait, ...parametres }, effets, memoire }` (a
// session, a pass, a reading of the copy), which the circuit reads and gives back in `faits` with
// the same call, `effets` and `memoire` what the step decided before it, so that an engine applies
// them before the fact and loses none when the fact fails; or the decision: `{ suivant, memoire, effets, arret, fin, usage }`, `suivant` the state of
// the next step, `memoire` what changes in the circuit's memory, `effets` in their order (a line
// at the ticket `{ genre: 'commenter', etape, texte }`, a gesture `{ genre: 'geste', nom }`, a
// report `{ genre: 'rapport', etape, texte, resultat, rapport }`, a result kept
// `{ genre: 'inscrire', entree, evenement }`, its event named), then a stop `arret` (its name `nom` and its `rapport`, with the
// options of an Arret of the circuit: `piece`, `question`, `qui`, `rouges`, `motif`, `resultat`,
// `etape`; or `{ nom, statut: { role, tentative, fiche } }` and `{ nom, horsDuPlan: { tentative,
// fiche } }`, which the circuit builds with the agent's handover), the end of the run `fin`, or a
// step the list does not hold `usage`. Each call is played again from the start of its step with
// the facts read so far, as Temporal replays a workflow on its history: the same facts give the
// same decision.
import { ARRETS, boucle, RESPONSABLE, SUITE } from './etapes.mjs';
import { attribuerLeRouge } from './reprise.mjs';

// The steps of the circuit's state, read from the list of the steps.
const etatDe = n => SUITE.find(e => e.numero === n).etat;
export const [
  GESTE,
  TESTS,
  PREUVE,
  CODE,
  CONTROLES,
  REFERENCES,
  RELECTURE,
  INTEGRATION,
  EN_FILE,
  TRI,
] = ['1.1', '2', '2.1', '3', '3.1', '4.2', '4.3', '5.1', '5.2', '5.3'].map(etatDe);

// The bounded loops, each declared with its step (scripts/etapes.mjs, `boucles`): the testwriter is
// relaunched twice at most after a failed proof (three sessions); the developpeur has three
// sessions, the last on the strong model; the third RENDU of one ticket stops the circuit.
export const RELANCES_TESTWRITER = boucle('tests').max - 1;
export const SEANCES_DEVELOPPEUR = boucle('code').max;
export const RELECTURES = boucle('relecture').max;

// What changed for a developpeur relaunched on the integration's refusal of the lot he left as it was.
export const CHANGE_DU_REFUS =
  'l’intégration refuse ton lot, et ta séance n’a changé aucun fichier du plan : son refus, dans le rapport ci-dessous, est le rouge à lever';

// The developpeur's report on the integration's refusal <refus>: the red to lift, which the checks
// of the copy, green, do not see.
export const rapportDuRefus = refus =>
  `L’intégration refuse ce lot : son refus, ci-dessous, est le rouge à lever ; les contrôles de ta copie, verts, ne le voient pas, et le lot ne repasse à l’intégration qu’avec un changement.\n\n${refus.rapport}`;

// The step after the plan of sort <sorte> (null when the path is not mechanical): the gesture of
// a mechanical ticket (1.1), in place of the testwriter, the proof and the developpeur; the
// developpeur of a plan without tests (<sansTests>); else the testwriter.
export const etapeApresLePlan = ({ sorte, sansTests }) =>
  sorte?.genre === 'mécanique' ? GESTE : sansTests ? CODE : TESTS;

// The step after a proof that passes: the developpeur on a red (<rouges>), on a finding of the
// reviewer still open for him (<pourLeDeveloppeur>), or under a plan « comportement inchangé »
// (<inchange>), whose lot has code to write though nothing turns red, as a reorganisation does
// (decision 3, amended by the owner on 2026-11-01); else the checks, a lot of tests alone, with
// no session of the developpeur.
export const apresLaPreuve = ({ rouges, pourLeDeveloppeur, inchange }) =>
  rouges > 0 || pourLeDeveloppeur || inchange ? CODE : CONTROLES;

// What follows a red of the reading of the copy after the session <tentative> of <role>: the agent
// again, one attempt used as a red build uses it, or, the attempts used up, the stop « controles »
// as the red checks.
export function suiteDuRougeDeLecture(role, tentative) {
  const max = boucle(role === 'testwriter' ? 'tests' : 'code').max;
  return tentative < max ? { etape: role, tentative: tentative + 1 } : { arret: 'controles' };
}

// The findings of the reviewer open for <role> among <constats>, in their order.
export const ouverts = (constats, role) => (constats ?? []).filter(c => c.role === role);

// The stop for the findings open (<constats>) that go to the testwriter when the plan skips him
// (<sansTests>), or null: no new pass treats them, as a CI fails fast on a step it cannot run
// (grillhouse-26x). A stop `relecture-arret` whose report names each finding, the role skipped
// and why, then the verdict <texte>; its piece, the findings' pieces; its question, declare the
// tests of the package or settle the finding.
export function arretDuTestwriterSaute({ constats, sansTests, paquets }, texte) {
  const auTestwriter = ouverts(constats, 'testwriter');
  if (!auTestwriter.length || !sansTests) {
    return null;
  }
  const titres = auTestwriter.map(c => `« ${c.titre} »`).join(', ');
  const plan = paquets.join(', ');
  return {
    nom: 'relecture-arret',
    rapport: `Le relecteur adresse au testwriter ${titres}, quand le plan saute le testwriter : aucun paquet du plan ne joue de tests (${plan}).\n\nLe verdict :\n\n${texte}`,
    piece: auTestwriter.map(c => c.piece ?? c.titre).join('\n'),
    question: `Le constat ${titres} va au testwriter, que le plan (${plan}) saute : déclarer les tests du paquet au cadre, puis \`--reprendre\`, ou trancher le constat (\`--depuis developpeur --contexte\`, ou \`--arreter\`).`,
  };
}

// The stop for a RENDU of a mechanical lot (<mecanique>), or null: no testwriter nor developpeur
// wrote it, so no relaunch treats its findings (<constats>). A stop `relecture-arret`, the verdict
// <texte> in its report, the findings' pieces as its piece; its question, have the lot corrected
// by the developpeur or stop the circuit.
export function arretDuGesteMecanique({ constats, mecanique, sorte }, texte) {
  if (!mecanique) {
    return null;
  }
  const pieces = (constats ?? []).map(c => c.piece ?? c.titre).join('\n');
  return {
    nom: 'relecture-arret',
    rapport: `Le relecteur rend un lot mécanique (${sorte.raison}), que la commande du plan a fait sans testwriter ni développeur : le circuit ne relance personne.\n\nLe verdict :\n\n${texte}`,
    piece: pieces || null,
    question: `Le lot mécanique est rendu : le faire corriger par le développeur (\`--depuis developpeur --contexte\`), ou arrêter le circuit (\`--arreter\`) et changer le plan.`,
  };
}

// The last <n> lines of <t>, a text the circuit gives without its colours.
const fin = (t, n) =>
  String(t ?? '')
    .split('\n')
    .slice(-n)
    .join('\n');

// A fact the decision has not read yet: its name and what reads it.
class Besoin {
  constructor(fait, parametres) {
    this.fait = fait;
    this.parametres = parametres;
  }
}

// The plan of a ticket, its decisions as the circuit and the workflow of a ticket take them
// (grillhouse-4nr.6.3): the step of the plan that follows its state <e> (`{ plan, lu, posees,
// reponse }`, the explorateur's sheet, the questionneur's, the questions put, the explorateur's
// answer): `explorateur`, `questionneur`, `reponse` (questions were put), then `conclure`.
export const pasDuPlan = e =>
  !e.plan
    ? 'explorateur'
    : !e.lu
      ? 'questionneur'
      : e.posees.length && !e.reponse
        ? 'reponse'
        : 'conclure';

// The questions the explorateur answers in the questionneur's sheet <lu>: its questions, or its
// disagreement as one; none for « AUCUNE ».
export const questionsPosees = lu =>
  lu.issue === 'AUCUNE'
    ? []
    : lu.issue === 'DÉSACCORD'
      ? [lu.desaccord]
      : lu.questions.map(q => q.question);

// What stays open of the plan <plan> once the explorateur answered <reponses> to the questions
// <posees>: the plan's own questions, then each question put left without its answer.
export const ouvertesDuPlan = (plan, posees, reponses) => [
  ...plan.questions,
  ...posees
    .filter((_q, i) => !reponses.some(r => Number(r.numero) === i + 1))
    .map(question => ({ question, piece: 'question du questionneur, sans réponse' })),
];

// The effects <effets> an act gave back as the workflow plays them (scripts/effets.mjs), in their
// order: a state followed by another state is not played, since the state is written whole and
// nothing reads it between the two.
export const effetsAJouer = effets =>
  effets.filter((e, i) => !(e.genre === 'etat' && effets[i + 1]?.genre === 'etat'));

// The text <t> without the escape sequences of a terminal (colours, ECMA-48 CSI and OSC), as
// `stripVTControlCharacters` of node:util removes them; written here, since the workflow of a
// ticket imports this module and a workflow imports no module of node.
const SEQUENCES = new RegExp(
  String.raw`\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])`,
  'g'
);
const sansLesCodes = t => String(t ?? '').replace(SEQUENCES, '');

// The stop « inattendu » at the step <etat> that no act could write at the ticket (the act of the
// stop itself failed, its message <message>), as the workflow of a ticket under Temporal publishes
// it in its memo alone (src/temporal/circuit/deroule.ts): `{ code, nom, question, etat }`. Its
// question names the cause, the first line of <message>, since it is all the supervisor reads;
// the codes of colour of a command's output go (`sansLesCodes`).
export const arretSansActe = (etat, message, ou) => ({
  code: ARRETS.inattendu,
  nom: 'inattendu',
  question: {
    arret: 'inattendu',
    fait: `L'arrêt de l'étape « ${etat.etape} » ne s'écrit pas au ticket : ${sansLesCodes(message)}`,
    piece: ou,
    question: `L'arrêt de l'étape « ${etat.etape} » ne s'écrit pas au ticket : ${
      sansLesCodes(message)
        .split('\n')
        .find(l => l.trim())
        ?.trim() ?? 'sans message'
    }. Lever la cause, puis reprendre le circuit (--reprendre) ou l’arrêter (--arreter).`,
    qui: 'superviseur',
  },
  etat: { ...etat, raison: 'inattendu' },
});

// The decision of the step of <entree> (see the header), or the next fact it needs.
export function transition(entree) {
  const faits = entree.faits ?? {};
  const lire = (fait, parametres = {}) => {
    if (fait in faits) {
      return faits[fait];
    }
    throw new Besoin(fait, parametres);
  };
  // What the step decided before the fact it needs.
  const partiel = { effets: [], maj: {} };
  try {
    return decider(entree, lire, partiel);
  } catch (e) {
    if (e instanceof Besoin) {
      return {
        besoin: { fait: e.fait, ...e.parametres },
        effets: [...partiel.effets],
        memoire: { ...partiel.maj },
      };
    }
    throw e;
  }
}

function decider({ etat, memoire = {}, ticket, reprend = false }, lire, partiel) {
  let { etape, tentative, rapport, finale } = etat;
  let relanceSurLeRefus = Boolean(etat.relanceSurLeRefus);
  const maj = {};
  // The memory as this decision leaves it so far.
  const m = cle => (cle in maj ? maj[cle] : (memoire[cle] ?? null));
  const effets = [];
  partiel.effets = effets;
  partiel.maj = maj;
  const commenter = (lieu, texte) => effets.push({ genre: 'commenter', etape: lieu, texte });
  const geste = nom => effets.push({ genre: 'geste', nom });
  const ecrireRapport = (lieu, texte, resultat, r = texte) =>
    effets.push({ genre: 'rapport', etape: lieu, texte, resultat, rapport: r });
  const inscrire = (entree, evenement) => effets.push({ genre: 'inscrire', entree, evenement });
  // The last green of a step (`verts`: the fingerprint of its inputs, its duration, what it
  // needs to be read back) kept in the memory, or dropped (<vert> null): only a step green keeps
  // one, as a task of Turborepo caches only its success.
  const garderLeVert = (nom, vert) => {
    const verts = { ...(m('verts') ?? {}) };
    if (vert) {
      verts[nom] = vert;
    } else {
      delete verts[nom];
    }
    maj.verts = verts;
  };
  // A step whose inputs are those of its last green: its result is read back, its duration
  // (<ms>) the one the bilan counts as not replayed (scripts/bilan.mjs).
  const releve = (nom, ms) => {
    const lieu = nom === 'passe-finale' ? 'controles' : nom;
    commenter(
      lieu,
      `${nom} relue sans se rejouer : ses entrées (fichiers, commande) sont celles de son dernier vert.`
    );
    inscrire({ etape: nom, relue: { ms: ms ?? 0 } }, 'relue');
  };
  const decision = (extra = {}) => ({
    suivant: { etape, tentative, rapport, finale, relanceSurLeRefus },
    memoire: maj,
    effets,
    ...extra,
  });
  const arreter = (nom, r, options = {}) => decision({ arret: { nom, rapport: r, ...options } });
  // A session relaunched on a conflict of the copy's advance (the gesture `conflit-de-l-avance`,
  // `retourDuConflit`) comes back to the pass that met it, not to the step that follows its role:
  // the pass prepares the copy again, and relaunches the other role while one of its files keeps
  // its marks. Whether the decision went back to it.
  const auRetourDuConflit = role => {
    const retour = m('retourDuConflit');
    if (!retour) {
      return false;
    }
    maj.retourDuConflit = null;
    commenter(
      role,
      `séance ${tentative} finie sur le conflit de l'avance : le circuit revient à la passe.`
    );
    ({ etape, tentative, rapport, finale } = retour);
    relanceSurLeRefus = Boolean(retour.relanceSurLeRefus);
    return true;
  };
  const plan = ticket.paquets.join(', ');

  // After the plan: the gesture of a mechanical ticket, the developpeur of a plan without tests,
  // else the testwriter.
  const route =
    etape === TESTS
      ? etapeApresLePlan({
          sorte: lire('mecanique') ? ticket.sorte : null,
          sansTests: lire('sansTests'),
        })
      : null;
  if (route === GESTE) {
    geste('mecanique');
    etape = GESTE;
    tentative = 1;
    return decision();
  }
  if (etape === GESTE) {
    if (reprend && lire('livreAvant')) {
      // The copy already carries the gesture (the supervisor played the command himself).
      commenter(
        'mecanique',
        'la copie porte déjà un changement du plan : le geste ne rejoue pas, aux contrôles.'
      );
    } else {
      const fiche = lire('seanceDuGeste');
      if (fiche.statut !== 'FAIT') {
        return decision({
          arret: { nom: nomDuStatut(fiche), statut: { role: 'explorateur', tentative, fiche } },
        });
      }
      if (!lire('livre')) {
        return arreter(
          'sans-livraison',
          `Le geste mécanique ne change aucun fichier du plan (${plan}) : la commande du plan, \`${ticket.sorte.commande}\`, n'a rien changé dans la copie.`,
          { piece: `$ ${ticket.sorte.commande}\naucun fichier du plan changé dans ${ticket.copie}` }
        );
      }
      commenter('mecanique', 'la commande du plan a joué dans la copie : aux contrôles.');
    }
    etape = CONTROLES;
    tentative = 0;
    return decision();
  }
  if (route === CODE) {
    commenter(
      'testwriter',
      'aucun test dans le plan (aucun paquet qui joue des tests ne le tient) : ni testwriter ni preuve, le développeur directement.'
    );
    rapport = [
      `Le plan (${plan}) ne porte aucun test (aucun paquet qui joue des tests ne le tient) : le circuit te lance sans testwriter ni preuve. Tu écris le ticket d'après ses critères ; les contrôles suivent ta séance.`,
      rapport,
    ]
      .filter(Boolean)
      .join('\n\n');
    etape = CODE;
    tentative = 1;
    return decision();
  }
  if (etape === TESTS) {
    const reprise = m('reprise');
    const fiche = lire('seance', {
      role: 'testwriter',
      tentative,
      rapport,
      derniere: tentative > RELANCES_TESTWRITER,
      ...(reprise ? { fichiers: reprise.fichiers } : {}),
    });
    // A testwriter who declares himself blocked or in need of an answer goes up to the supervisor.
    if (fiche.statut !== 'FAIT') {
      return decision({
        arret: { nom: nomDuStatut(fiche), statut: { role: 'testwriter', tentative, fiche } },
      });
    }
    // No checks have run since this session.
    maj.controlesRouges = null;
    commenter('testwriter', `séance ${tentative} finie, sa fiche lue.`);
    // A copy the module of the language no longer reads is a red of the testwriter.
    const illisible = lire('lecture');
    if (illisible) {
      const suite = suiteDuRougeDeLecture('testwriter', tentative);
      if (suite.arret) {
        return arreter(suite.arret, illisible.rapport);
      }
      commenter(
        'testwriter',
        `la copie ne se lit plus ; testwriter relancé (séance ${suite.tentative}).\n\n${illisible.rapport}`
      );
      etape = TESTS;
      tentative = suite.tentative;
      rapport = illisible.rapport;
      return decision();
    }
    if (auRetourDuConflit('testwriter')) {
      return decision();
    }
    etape = PREUVE;
    return decision();
  }
  if (etape === PREUVE) {
    const reprise = m('reprise');
    // A finding of the reviewer still open for the developpeur launches him, red or not.
    const pourLui = ouverts(m('constats'), 'developpeur').length > 0;
    const inchange = Boolean(ticket.sorte?.inchange);
    const vert = m('verts')?.preuve;
    if (vert && !reprise && lire('empreinteEtape', { etape: 'preuve' }) === vert.empreinte) {
      // The proof's inputs are those of its last green: its result is read back, not played.
      releve('preuve', vert.ms);
      rapport = vert.texte ?? null;
      const auDeveloppeur =
        apresLaPreuve({ rouges: vert.rouges, pourLeDeveloppeur: pourLui, inchange }) === CODE;
      etape = auDeveloppeur ? CODE : CONTROLES;
      tentative = auDeveloppeur ? 1 : 0;
      return decision();
    }
    const p = lire('preuve', reprise ? { fichiers: reprise.fichiers } : {});
    rapport = p.texte;
    if (p.ok) {
      // Resumed at a red, a proof restricted to the file the red names goes to the checks.
      const auDeveloppeur = reprise
        ? false
        : apresLaPreuve({ rouges: p.rouges, pourLeDeveloppeur: pourLui, inchange }) === CODE;
      const suite = reprise
        ? 'reprise à un rouge : aux contrôles'
        : p.rouges
          ? 'au développeur'
          : pourLui
            ? 'aucun rouge ; au développeur, que nomme un constat du relecteur'
            : inchange
              ? 'aucun rouge : le plan dit « comportement inchangé », au développeur'
              : 'aucun rouge : un lot de tests seul, aux contrôles';
      ecrireRapport('preuve', `${p.resume} ; ${suite}.\n\n${p.texte}`, p.resultat);
      if (!reprise && p.empreinte) {
        garderLeVert('preuve', {
          empreinte: p.empreinte,
          rouges: p.rouges,
          ms: p.ms,
          texte: p.texte,
        });
      }
      etape = auDeveloppeur ? CODE : CONTROLES;
      tentative = auDeveloppeur ? 1 : 0;
      return decision();
    }
    garderLeVert('preuve', null);
    if (tentative <= RELANCES_TESTWRITER) {
      ecrireRapport(
        'preuve',
        `${p.resume} ; testwriter relancé (séance ${tentative + 1}).\n\n${p.texte}`,
        p.resultat
      );
      etape = TESTS;
      tentative++;
      return decision();
    }
    return arreter('preuve', p.texte, { resultat: p.resultat });
  }
  if (etape === CODE) {
    return code();
  }
  if (etape === CONTROLES) {
    return controles();
  }
  if (etape === REFERENCES) {
    return references();
  }
  if (etape === RELECTURE) {
    return relecture();
  }
  if (etape === INTEGRATION) {
    const r = lire('integration');
    if (r.nom) {
      // The resumption stops under a name (`lot-absent`, `copie-gardee`), at the code of the
      // integration stop (17, scripts/etapes.mjs), its piece the output.
      return arreter(r.nom, fin(r.sortie, 60), { piece: fin(r.sortie, 30) });
    }
    if (r.code !== 0) {
      return refuser(
        `Le script d'intégration refuse le lot (code ${r.code}).\n\n${fin(r.sortie, 60)}`,
        `$ ${r.commande}\n${fin(r.sortie, 30)}`
      );
    }
    maj.refus = null;
    if (r.deja && !r.enFile) {
      // The lot is already on main: nothing waits for the queue, the ticket goes straight to its
      // tri of discoveries and finishes at integre, as a merge queue closes an entry already merged.
      commenter(
        'integration',
        'le commit est déjà sur main ; la copie et son dossier de travail sont retirés.'
      );
      lire('tri');
      return decision({ fin: { code: 0 } });
    }
    const branche = `agent/${ticket.id}`;
    const commit = lire('commit');
    commenter(
      'integration',
      `${commit ? `commit ${commit} sur ${branche}` : 'lot commité'} ; la branche est en file.`
    );
    etape = EN_FILE;
    return decision();
  }
  if (etape === EN_FILE) {
    const f = lire('file');
    if (f.etat === 'ferme') {
      commenter('file', `${f.raison}.`);
      etape = TRI;
      return decision();
    }
    if (f.etat === 'en-file') {
      return arreter('a-repasser', f.raison);
    }
    return refuser(`La file rouvre le ticket.\n\n${f.raison}`, f.raison);
  }
  if (etape === TRI) {
    // The lot is on main: the tri of its discoveries, which neither stops nor undoes it.
    lire('tri');
    return decision({ fin: { code: 0 } });
  }
  return decision({ usage: `étape inconnue dans l'état : ${etape}` });

  // The stop « integration » of the motive <motif> and the piece <piece>, the refusal of the lot
  // kept in the memory (`refus`: `{ rapport, piece, empreinte, lance, relance }`, the fingerprint
  // of the plan refused, whether a --depuis developpeur launched the developpeur on it, and whether
  // a session so launched already left it unchanged once), which --depuis developpeur gives the
  // developpeur.
  function refuser(motif, piece) {
    maj.refus = {
      rapport: motif,
      piece,
      empreinte: lire('empreinte'),
      lance: false,
      relance: false,
    };
    return arreter('integration', motif, { piece });
  }

  function code() {
    const fort = tentative >= SEANCES_DEVELOPPEUR;
    const avant = lire('empreinteAvant');
    const fiche = lire('seance', {
      role: 'developpeur',
      tentative,
      rapport,
      fort,
      derniere: fort,
      change: relanceSurLeRefus ? CHANGE_DU_REFUS : undefined,
    });
    relanceSurLeRefus = false;
    const fortement = fort ? ' (opus)' : '';
    // A question goes up to the supervisor; a red out of reach, to the testwriter its sheet sends
    // it to, else up to the supervisor.
    if (fiche.statut === 'BESOIN') {
      return decision({
        arret: { nom: 'besoin', statut: { role: 'developpeur', tentative, fiche } },
      });
    }
    const renvoi = lire('renvoi');
    if (renvoi) {
      // The red that remains lies in the tests of the lot: the gesture `renvoi-au-testwriter`,
      // the testwriter, the sending and the handover as its report, then the proof and the
      // developpeur. `renvoiAuTestwriter` keeps the red output of the checks the sending before
      // carried ('' for none), null after green checks: the same output twice in a row is a
      // round trip without a new fact.
      const sortie = m('controlesRouges') ?? '';
      if (m('renvoiAuTestwriter') === sortie) {
        if (lire('empreinte') === avant) {
          inscrire({ etape: CODE, inchange: true }, 'inchange');
        }
        return arreter(
          'sans-livraison',
          `La fiche de la séance ${tentative} du développeur renvoie une deuxième fois de suite au testwriter, sur la même sortie rouge des contrôles que le premier renvoi (aucune, ou la même), sans contrôles verts entre eux : le testwriter n'a pas levé ce rouge.\n\n${renvoi}`
        );
      }
      maj.renvoiAuTestwriter = sortie;
      if (m('retourDuConflit')) {
        // The testwriter the sending relaunches goes on to the proof, not back to a pass.
        maj.retourDuConflit = null;
      }
      commenter(
        'developpeur',
        `séance ${tentative}${fortement} finie ; sa fiche renvoie le rouge au testwriter : le circuit relance le testwriter, puis la preuve et le développeur.`
      );
      geste('renvoi-au-testwriter');
      etape = TESTS;
      tentative = 1;
      rapport = renvoi;
      finale = false;
      return decision();
    }
    if (fiche.statut === 'BLOQUÉ') {
      return decision({
        arret: { nom: 'hors-portee', statut: { role: 'developpeur', tentative, fiche } },
      });
    }
    if (fiche.hors_plan?.length) {
      return decision({ arret: { nom: 'hors-portee', horsDuPlan: { tentative, fiche } } });
    }
    // A copy the module of the language no longer reads is a red of the developpeur.
    const illisible = lire('lecture');
    if (illisible) {
      const suite = suiteDuRougeDeLecture('developpeur', tentative);
      if (suite.arret) {
        return arreter(suite.arret, illisible.rapport);
      }
      commenter(
        'developpeur',
        `séance ${tentative} finie ; la copie ne se lit plus, développeur relancé (séance ${suite.tentative}).\n\n${illisible.rapport}`
      );
      tentative = suite.tentative;
      rapport = illisible.rapport;
      return decision();
    }
    const inchangee = lire('empreinte') === avant;
    const refus = m('refus');
    if (inchangee && refus?.lance && refus.empreinte === avant) {
      // The lot the integration refused, unchanged: as a merge queue lets a lot pass again only
      // with a change, neither the gesture `rien-a-livrer` nor the checks of the copy, which
      // the refusal does not see; the developpeur relaunched once with the refusal, then the
      // stop goes up.
      inscrire({ etape: CODE, inchange: true }, 'inchange');
      if (refus.relance) {
        return arreter(
          'sans-livraison',
          `La séance ${tentative} du développeur ne change aucun fichier du plan (${plan}), une seconde fois sur le lot que l'intégration refuse.\n\n${refus.rapport}`,
          { piece: refus.piece }
        );
      }
      maj.refus = { ...refus, relance: true };
      commenter(
        'developpeur',
        `séance ${tentative}${fortement} finie sans changement, sur le lot que l'intégration refuse : le circuit le relance une fois, le refus comme rapport.`
      );
      tentative++;
      rapport = rapportDuRefus(refus);
      relanceSurLeRefus = true;
      return decision();
    }
    if (inchangee && reprend && lire('livre')) {
      // A resumed developpeur that finds the lot delivered: the checks judge it.
      commenter(
        'developpeur',
        `séance ${tentative} reprise sans changement, le plan garde la livraison d'avant : aux contrôles.`
      );
      inscrire({ etape: CODE, inchange: true }, 'inchange');
    } else if (inchangee) {
      // Nothing to deliver: the gesture `rien-a-livrer`, the checks judge the lot; red, the
      // stop goes up.
      geste('rien-a-livrer');
      inscrire({ etape: CODE, inchange: true }, 'inchange');
      maj.rienALivrer = `La séance ${tentative} du développeur ne change aucun fichier du plan (${plan}), et les contrôles restent rouges. Sa passation au ticket dit pourquoi :\n\n${lire('passation') ?? 'aucune'}`;
    }
    if (auRetourDuConflit('developpeur')) {
      return decision();
    }
    commenter('developpeur', `séance ${tentative}${fortement} finie, sa fiche lue.`);
    etape = CONTROLES;
    return decision();
  }

  function controles() {
    const passeFinale = finale;
    // The final pass: after a regeneration of the references, restricted to what it changed,
    // the reds of the pass before it carried (none plays when it changed nothing); else the band
    // of the lot, its base and its dependents. The checks of the plan after a
    // regeneration that changed nothing: none plays, the reds of the checks before standing.
    const regeneration = m('regeneration');
    maj.regeneration = null;
    const nomEtape = passeFinale ? 'passe-finale' : 'controles';
    const reprise = m('reprise');
    const vert = m('verts')?.[nomEtape];
    if (
      vert &&
      !reprise &&
      !regeneration &&
      lire('empreinteEtape', { etape: nomEtape }) === vert.empreinte
    ) {
      // The step's inputs are those of its last green: its result is read back, not played.
      releve(nomEtape, vert.ms);
      maj.controlesRouges = null;
      if (!passeFinale) {
        etape = CONTROLES;
        tentative = 0;
        finale = true;
        return decision();
      }
      maj.verifie = vert.arbre;
      etape = lire('lotAccepte', { arbre: vert.arbre }) ? INTEGRATION : RELECTURE;
      return decision();
    }
    const passe = !passeFinale
      ? { arbre: null, restreinte: null }
      : regeneration
        ? { arbre: lire('arbreAvant'), restreinte: regeneration.restreinte }
        : lire('passeFinale');
    const k = lire('controles', {
      finale: passeFinale,
      restreinte: passe.restreinte,
      reportes: regeneration?.reportes ?? null,
      ...(reprise ? { fichiers: reprise.fichiers } : {}),
    });
    if (k.rouge || k.aRepasser) {
      garderLeVert(nomEtape, null);
    }
    // The output of these checks, red, which a sending to the testwriter carries.
    maj.controlesRouges = k.rouge ? k.texte : null;
    // The outcome the bilan reads (scripts/bilan.mjs): with the reds, each its place and its
    // text, by which it knows two checks that measured the same thing.
    const resultat = issue => ({
      issue,
      finale: passeFinale,
      rouges: k.rouges.map(r => `${r.paquet} : ${r.texte}`),
    });
    rapport = k.texte;
    // A developpeur who had nothing to deliver before these checks.
    const rien = m('rienALivrer');
    maj.rienALivrer = null;
    // A stop of the checks: <phrase>, then the report, its reds also kept apart, as its piece;
    // the stop kept at the checks keeps their outcome.
    const arret = (nom, phrase, lieu = null) => {
      const avant = phrase ? `${phrase}\n\n` : '';
      return arreter(nom, `${avant}${k.complet}`, {
        rouges: k.rouges,
        motif: `${avant}${k.sansListe}`,
        etape: lieu,
        resultat: lieu ? null : resultat(nom === 'a-repasser' ? 'a-repasser' : 'rouge'),
      });
    };
    const suivante = tentative + 1;
    const regenereSur = m('regenereSur');
    // A final pass with a red of a reference, mixed with others or not, or a debt the lot
    // lowers: their regeneration, once for this pass, but for a reference the checks had
    // regenerated on this same tree, whose inputs have not changed since; the reds that remain
    // then go each to its owner.
    const dejaRegenerees = regenereSur && regenereSur.arbre === passe.arbre ? regenereSur.noms : [];
    const aRegenerer =
      passeFinale && !regeneration && (k.rouge || k.notes.length > 0)
        ? lire('referencesDesRouges', { lieux: k.lieux, aElaguer: k.notes.length > 0 }).filter(
            r => !dejaRegenerees.includes(r.nom)
          )
        : [];
    // The checks of the plan with a red of a reference, mixed with others or not: its
    // regeneration before any red goes to the developpeur, as Bazel builds a genrule before the
    // tests that read it, but for a reference regenerated on this same tree; mixed with other
    // reds, the checks of the plan play again on the regenerated tree, which judges a test
    // that reads the reference; alone, the final pass that is due (BPScript 320.6.5: a test
    // that reads the turbo.json, red beside their guard, sent to the developpeur, who could not
    // write them).
    // The debt the lot lowers, seen at the checks of the plan by its notes (`a-elaguer`), is the
    // red of a reference too: regenerated before the checks judge the lot again, whether the
    // developpeur delivered or not (the regeneration only lowers the keys noted, it hides no
    // defect).
    const dette =
      !passeFinale && k.notes.length > 0
        ? lire('referencesDesRouges', { lieux: [], aElaguer: true })
        : [];
    const regenereesAuxControles =
      !passeFinale &&
      (k.references.length || k.notes.length) &&
      regenereSur?.arbre === lire('arbreApres')
        ? regenereSur.noms
        : [];
    const avantLesControles = passeFinale
      ? []
      : [...k.references, ...dette.filter(d => !k.references.some(r => r.nom === d.nom))].filter(
          r => !regenereesAuxControles.includes(r.nom)
        );
    if (avantLesControles.length) {
      const noms = avantLesControles.map(r => r.nom);
      const deLaDette = dette.some(d => noms.includes(d.nom));
      const meles = k.rouge || k.aRepasser || deLaDette;
      geste('regeneration');
      const phrase = `${k.resume} ; ${deLaDette ? 'la dette des gardes baisse, ou des rouges sont ceux de références' : 'des rouges sont ceux de références'} (${noms.join(', ')}) : à leur régénération, puis ${meles ? 'les contrôles du plan' : 'la passe finale'}.`;
      ecrireRapport(
        'controles',
        phrase,
        resultat(meles ? 'rouge' : 'vert'),
        meles ? `${k.texte}${k.avertissements}` : `${phrase}${k.avertissements}`
      );
      // Mixed, the developpeur who had nothing to deliver, for the checks of the plan that
      // follow; green, the final pass, its sessions counted apart, which a developpeur with
      // nothing to deliver before green checks does not concern.
      if (meles) {
        maj.rienALivrer = rien;
      } else {
        maj.renvoiAuTestwriter = null;
        tentative = 0;
      }
      // The report of the reds of the plan, which go to the developpeur when a command of the
      // project refuses the lot, as at the final pass (BPScript 320.10).
      maj.aRegenerer = {
        noms,
        notes: k.notes,
        suite: meles ? 'controles' : 'passe',
        rouges: meles ? k.tous : [],
        auDeveloppeur: meles && k.auDeveloppeur && !k.arbitrer ? k.texte : null,
      };
      etape = REFERENCES;
      finale = true;
      return decision();
    }
    if (aRegenerer.length) {
      const noms = aRegenerer.map(r => r.nom);
      geste('regeneration');
      ecrireRapport(
        'controles',
        `${k.resume} ; ${k.rouge ? 'des rouges sont ceux de références' : 'la dette des gardes baisse'} (${noms.join(', ')}) : à leur régénération.`,
        resultat(k.rouge ? 'rouge' : 'vert'),
        `${k.texte}${k.avertissements}`
      );
      // The report of the reds of the plan, which go to the developpeur when a command of the
      // project refuses the lot.
      maj.aRegenerer = {
        noms,
        rouges: k.tous,
        notes: k.notes,
        auDeveloppeur: k.auDeveloppeur && !k.arbitrer ? k.texte : null,
      };
      etape = REFERENCES;
      finale = true;
      return decision();
    }
    if (k.rouge && passeFinale && k.horsTitre.length) {
      return arret(
        'controles',
        `La passe finale est rouge dans ${k.horsTitre.join(', ')}, hors du plan du ticket (${plan}) : le développeur n'est pas relancé. Le superviseur étend le plan à ce paquet (\`--etendre\`), le rouge allant ensuite au développeur, ou fait corriger le lot (\`--depuis developpeur\`, le rouge en \`--contexte\`).`
      );
    }
    if (k.rouge && !k.auDeveloppeur) {
      return arret(
        'controles',
        `Aucun paquet du plan (${plan}) ne tient ce rouge de la passe finale (un rouge de la racine, ou que rien ne situe).`
      );
    }
    if (k.rouge && k.arbitrer) {
      return arret(
        'controles',
        'Les rouges du plan sont des constats à arbitrer : aucun développeur ne les tranche.'
      );
    }
    if (k.rouge && lire('mecanique')) {
      // A mechanical lot: no testwriter nor developpeur lifts the red of its command.
      return arret(
        'controles',
        `Le ticket est mécanique (${ticket.sorte.raison}) : ni testwriter ni développeur ne lève ce rouge du lot de sa commande. Le superviseur fait corriger le lot (\`--depuis developpeur\`, le rouge en \`--contexte\`), corrige le geste dans la copie puis \`--reprendre\`, ou arrête le circuit (\`--arreter\`).`
      );
    }
    // The stop stands at the developpeur's step, which a resumption plays again.
    if (k.rouge && rien) {
      return arret('sans-livraison', rien, CODE);
    }
    if (k.rouge && suivante <= SEANCES_DEVELOPPEUR) {
      // The red goes back to the step that carries it, by the files it names (scripts/reprise.mjs).
      const portes = lire('portes', { lieux: k.lieux });
      const a = attribuerLeRouge({ lieux: k.lieux, portes });
      if (!a.etape) {
        return arret('controles', `Le rouge n'est attribué à aucune étape : ${a.motif}.`);
      }
      if (a.etape === 'testwriter') {
        const relances = (m('relancesTestwriter') ?? 0) + 1;
        if (relances > RELANCES_TESTWRITER + 1) {
          return arret('controles', null);
        }
        maj.relancesTestwriter = relances;
        // The final pass red in one test file alone: that file is replayed, then the checks and
        // the final pass restricted to what it reaches, with no session for the rest of the lot.
        maj.reprise =
          passeFinale && a.fichiers.length === 1 && portes.tests.includes(a.fichiers[0])
            ? { fichiers: a.fichiers }
            : null;
        ecrireRapport(
          'controles',
          `${k.resume} ; le rouge nomme ${a.fichiers.join(', ')} : testwriter relancé (séance 1).`,
          resultat('rouge'),
          `${k.texte}${k.avertissements}`
        );
        etape = TESTS;
        tentative = 1;
        finale = false;
        return decision();
      }
      maj.reprise = null;
      ecrireRapport(
        'controles',
        `${k.resume} ; développeur relancé (séance ${suivante}).`,
        resultat('rouge'),
        `${k.texte}${k.avertissements}`
      );
      etape = CODE;
      tentative = suivante;
      return decision();
    }
    if (k.rouge) {
      return arret('controles', null);
    }
    if (k.aRepasser) {
      return arret('a-repasser', null);
    }
    ecrireRapport('controles', `${k.resume}.`, resultat('vert'), `${k.resume}.${k.avertissements}`);
    // Green checks: a sending of the developpeur to the testwriter may come again.
    maj.renvoiAuTestwriter = null;
    maj.relancesTestwriter = 0;
    const entierement = !reprise && !regeneration;
    if (!passeFinale) {
      if (entierement && k.empreinte) {
        garderLeVert('controles', { empreinte: k.empreinte, ms: k.ms });
      }
      // The checks green: the final pass, its sessions counted apart.
      etape = CONTROLES;
      tentative = 0;
      finale = true;
      return decision();
    }
    // The whole pass green on this lot; the lot the last review accepted goes to the
    // integration, any other to the review.
    // A final pass green on the band of the lot (after a regeneration, on what it changed, or not
    // played when it changed nothing) verifies its tree: the lot accepted on it goes to the
    // integration.
    if (passe.arbre) {
      maj.verifie = passe.arbre;
    }
    if (entierement && k.empreinte) {
      garderLeVert('passe-finale', { empreinte: k.empreinte, arbre: passe.arbre, ms: k.ms });
    }
    if (reprise) {
      // The restricted pass is green: the resumption ends.
      maj.reprise = null;
    }
    etape = lire('lotAccepte', { arbre: passe.arbre }) ? INTEGRATION : RELECTURE;
    return decision();
  }

  function references() {
    // The references to regenerate and the reds of the pass before, kept in the state from
    // the pass that called for them (the checks of the plan, `suite`, or the final pass), so
    // that a regeneration resumed knows them.
    const a = m('aRegenerer');
    if (!a) {
      return arreter(
        'references',
        "L'état du circuit ne garde pas les références à régénérer : la passe finale les redonne (`--depuis developpeur`)."
      );
    }
    // A command of the project that refuses beside reds of the plan, within the developpeur's
    // sessions: the copy restored, those reds go to him with its output, then the pass that
    // called for the regeneration, the checks of the plan or the final pass.
    const suivante = tentative + 1;
    const auLot = Boolean(a.auDeveloppeur) && suivante <= SEANCES_DEVELOPPEUR;
    const g = lire('regeneration', {
      noms: a.noms,
      notes: a.notes,
      suite: a.suite ?? null,
      refusAuLot: auLot,
    });
    if (g.refus) {
      const texte = [
        `La régénération des références refuse le lot ; la copie est rendue telle qu'avant elle, et les rouges du plan vont au développeur (séance ${suivante}).`,
        '',
        ...g.refus,
      ].join('\n');
      ecrireRapport('references', texte, { regenerees: [], fichiers: [] });
      rapport = `${texte}\n\n${a.auDeveloppeur}`;
      maj.aRegenerer = null;
      maj.rienALivrer = null;
      etape = CODE;
      tentative = suivante;
      finale = a.suite !== 'controles';
      return decision();
    }
    ecrireRapport('references', g.texte, { regenerees: g.regenerees, fichiers: g.fichiers });
    // After the checks, the pass that judges the regenerated tree, which does not regenerate
    // again the references just regenerated on it: beside other reds, the checks of the plan
    // again (none plays when the regeneration changed nothing, the reds of the checks before
    // standing); without, the final pass that is due. After a final pass, the pass restricted
    // to what the regeneration changed, with the reds of the pass before.
    maj.regenereSur = a.suite ? { arbre: lire('arbreApres'), noms: a.noms } : null;
    maj.regeneration =
      a.suite === 'passe'
        ? null
        : a.suite === 'controles'
          ? g.fichiers.length
            ? null
            : { reportes: { rouges: a.rouges, rejouee: false } }
          : {
              restreinte: g.restreinte,
              reportes: { rouges: a.rouges, rejouee: g.fichiers.length > 0 },
            };
    maj.aRegenerer = null;
    etape = CONTROLES;
    finale = a.suite !== 'controles';
    return decision();
  }

  function relecture() {
    const v = lire('relecture');
    // A question for the owner: nothing is committed nor relaunched before his answer.
    if (v.fiche.question) {
      return arreter(
        'besoin',
        `Le relecteur attend une réponse : ${v.fiche.question}\n\nLe verdict :\n\n${v.texte}`,
        {
          piece: v.fiche.piece,
          question: `Le relecteur demande : ${v.fiche.question}`,
          qui: RESPONSABLE,
        }
      );
    }
    if (v.verdict === 'ACCEPTÉ') {
      // The review that accepts the lot closes every finding, each one it judged lifted
      // (`suiviDesConstats`).
      maj.constats = [];
      if (!v.arbre || m('verifie') === v.arbre) {
        commenter('relecture', 'ACCEPTÉ ; le lot va à l’intégration.');
        etape = INTEGRATION;
        return decision();
      }
      // The final pass has not played on the lot accepted: its band plays once, then the
      // integration.
      commenter(
        'relecture',
        'ACCEPTÉ ; la passe finale sur la bande du lot (sa base et ses dépendants), qui n’a pas joué sur ce lot, puis l’intégration.'
      );
      etape = CONTROLES;
      tentative = 0;
      finale = true;
      return decision();
    }
    // The reviews since the last ACCEPTÉ: a lot the queue sent back starts a new count.
    const rendus = lire('rendus');
    if (rendus >= RELECTURES) {
      return arreter(
        'relecture-arret',
        `${rendus} relectures ont rendu le lot : le circuit s'arrête à la troisième.\n\nLe dernier verdict :\n\n${v.texte}`
      );
    }
    // The findings still open once the sheet is read (`constatsOuverts` of scripts/circuit.mjs),
    // or its stop for a finding without a valid recipient.
    const lus = lire('constats');
    if (lus.arret) {
      return decision({ arret: lus.arret });
    }
    maj.constats = lus.constats;
    const saute =
      arretDuTestwriterSaute(
        {
          constats: lus.constats,
          sansTests: ouverts(lus.constats, 'testwriter').length > 0 && lire('sansTests'),
          paquets: ticket.paquets,
        },
        v.texte
      ) ??
      arretDuGesteMecanique(
        { constats: lus.constats, mecanique: lire('mecanique'), sorte: ticket.sorte },
        v.texte
      );
    if (saute) {
      return decision({ arret: saute });
    }
    const auTestwriter = ouverts(lus.constats, 'testwriter').length > 0;
    etape = auTestwriter ? TESTS : CODE;
    tentative = 1;
    rapport = null;
    finale = false;
    commenter(
      'relecture',
      `RENDU (relecture ${rendus}) ; le circuit relance ${auTestwriter ? 'le testwriter' : 'le développeur'}, ses ${lus.constats.length} constat(s) ouvert(s) dans la consigne de chaque séance, puis la passe finale sur la bande du lot (sa base et ses dépendants), et le relecteur sur la différence.`
    );
    return decision();
  }
}

// The name of the stop of an agent's sheet that is not FAIT: « besoin » for a question, else
// « hors-portee ».
const nomDuStatut = fiche => (fiche.statut === 'BESOIN' ? 'besoin' : 'hors-portee');
