// The steps of a ticket, numbered one by one, the automatic ones included, as a pipeline of
// GitLab CI or Zuul numbers and names each of its stages: the one list, which the circuit
// (scripts/circuit.mjs), the board (scripts/tableau.mjs) and the texts read.
//
// - A step: its number, its title, who works there (`qui`: the role agents, or AUTOMATIQUE for a
//   step the circuit leads itself), whether it runs for each component of the ticket's title
//   (`parComposant`) or once, and the step of the circuit's state it is (`etat`: the `etape` of
//   `.claude/worktrees/<ticket>.circuit.json`, the final pass being the checks once `finale`),
//   null for a step out of the circuit.
// - The arbitrage has two roles: the technical referent settles a design question, the regulator
//   a stop of the circuit.
// - A step that runs a bounded loop declares it (`boucle`: its label and its maximum, the pass
//   that stops it): the testeur's sessions after a refused proof, the developpeur's sessions, the
//   reviews, the same stop come back after a RELANCE of the regulator. The circuit stops each loop
//   at its maximum and writes its count in its state (`boucles`, by step number); the board shows
//   « <label> <n>/<max> » on the ticket's line from the second pass.

// Who works at a step the circuit leads itself, with no agent.
export const AUTOMATIQUE = 'automatique';

export const ETAPES = [
  { numero: 1, titre: 'Exploration', qui: ['explorateur'], parComposant: false, etat: null },
  {
    numero: 2,
    titre: 'Arbitrage',
    qui: ['referent-technique', 'regulateur'],
    parComposant: false,
    etat: null,
    boucle: { libelle: 'arrêt', max: 3 },
  },
  {
    numero: 3,
    titre: 'Tests',
    qui: ['testeur'],
    parComposant: true,
    etat: 'testeur',
    boucle: { libelle: 'essai', max: 3 },
  },
  { numero: 4, titre: 'Preuve du rouge', qui: [AUTOMATIQUE], parComposant: true, etat: 'preuve' },
  {
    numero: 5,
    titre: 'Code',
    qui: ['developpeur'],
    parComposant: true,
    etat: 'developpeur',
    boucle: { libelle: 'essai', max: 3 },
  },
  { numero: 6, titre: 'Contrôles', qui: [AUTOMATIQUE], parComposant: true, etat: 'controles' },
  {
    numero: 7,
    titre: 'Passe finale',
    qui: [AUTOMATIQUE],
    parComposant: false,
    etat: 'controles',
    finale: true,
  },
  {
    numero: 8,
    titre: 'Relecture',
    qui: ['relecteur'],
    parComposant: false,
    etat: 'relecture',
    boucle: { libelle: 'tour', max: 3 },
  },
  { numero: 9, titre: 'Intégration', qui: [AUTOMATIQUE], parComposant: false, etat: 'integration' },
  {
    numero: 10,
    titre: 'File : main, poussée, CI',
    qui: [AUTOMATIQUE],
    parComposant: false,
    etat: 'file',
  },
];

// The role that settles a stop of the circuit.
export const REGULATEUR = 'regulateur';

// A role in words.
const NOMS = {
  'referent-technique': 'référent technique',
  regulateur: 'régulateur',
  developpeur: 'développeur',
};
export const nomDuRole = role => NOMS[role] ?? role;

// The step <e> in words, « 5 Code ».
export const libelle = e => `${e.numero} ${e.titre}`;

// The step of a circuit's state (`etape`, `finale`), or null (« integre », an unknown step).
export const etapeDuCircuit = ({ etape, finale }) =>
  ETAPES.find(
    e => e.etat === etape && Boolean(e.finale) === (etape === 'controles' && finale === true)
  ) ?? null;

// The step where the role agent <role> works, or null for any other agent.
export const etapeDuRole = role =>
  role === AUTOMATIQUE ? null : (ETAPES.find(e => e.qui.includes(role)) ?? null);

// The step where the technical referent and the regulator work.
export const ARBITRAGE = ETAPES.find(e => e.qui.includes(REGULATEUR));
