// La lecture de la ligne de commande de `grillhouse circuit` (src/temporal/circuit/appel.ts,
// `lireLAppel`) : un seul tableau de cas pour chaque appel refusé, son motif dit. Un test petit :
// la fonction est appelée par son interface, sans serveur ni processus.
import { describe, expect, it } from 'vitest';

// Le module de l'appel se charge à l'usage : sans lui, chaque test rougit, le fichier se charge.
const appel = () => import('../../src/temporal/circuit/appel.js');

const REFUS: [string, string[], RegExp][] = [
  // Le ticket.
  ['aucun ticket', [], /le ticket manque/],
  ['des options sans ticket', ['--reprendre'], /le ticket manque/],
  ['un deuxième ticket', ['demo-1', 'demo-2'], /un seul ticket : demo-1, puis demo-2/],
  [
    'un composant après l’étape de --depuis',
    ['demo-1', '--depuis', 'testwriter', 'packages/forms'],
    /un seul ticket : demo-1, puis packages\/forms/,
  ],
  // Les options inconnues, dont les anciennes réponses.
  [
    '--reponse, qui n’est plus une option',
    ['demo-1', '--reponse', 'oui'],
    /option inconnue : --reponse/,
  ],
  [
    '--decision, qui n’est plus une option',
    ['demo-1', '--decision', 'oui'],
    /option inconnue : --decision/,
  ],
  ['une option inventée', ['demo-1', '--bidule'], /option inconnue : --bidule/],
  ['--contexte sans son texte', ['demo-1', '--contexte'], /--contexte attend son texte/],
  // --depuis.
  ['--depuis sans étape', ['demo-1', '--depuis'], /--depuis attend une étape du ticket/],
  [
    '--depuis d’une étape que le ticket n’a pas',
    ['demo-1', '--depuis', 'integration', '--contexte', 'x'],
    /--depuis attend une étape du ticket : testwriter, preuve, developpeur/,
  ],
  [
    '--depuis sans --contexte',
    ['demo-1', '--depuis', 'developpeur'],
    /--depuis attend son --contexte/,
  ],
  [
    '--depuis d’une étape de preuve sans --contexte',
    ['demo-1', '--depuis', 'preuve'],
    /--depuis attend son --contexte/,
  ],
  [
    '--depuis avec --reprendre',
    ['demo-1', '--depuis', 'testwriter', '--reprendre'],
    /--depuis et --reprendre ne vont pas ensemble/,
  ],
  [
    '--reprendre avant --depuis',
    ['demo-1', '--reprendre', '--depuis', 'testwriter', '--contexte', 'x'],
    /--depuis et --reprendre ne vont pas ensemble/,
  ],
  // --etendre.
  ['--etendre sans paquet', ['demo-1', '--etendre'], /--etendre attend les paquets/],
  [
    '--etendre suivi d’une autre option',
    ['demo-1', '--etendre', '--reprendre'],
    /--etendre attend les paquets/,
  ],
  [
    '--etendre avec --reprendre',
    ['demo-1', '--etendre', '030-binder', '--reprendre'],
    /--etendre va seule/,
  ],
  [
    '--etendre avec --arreter',
    ['demo-1', '--etendre', '030-binder', '--arreter'],
    /--etendre va seule/,
  ],
  [
    '--etendre avec --depuis',
    ['demo-1', '--etendre', '030-binder', '--depuis', 'testwriter', '--contexte', 'x'],
    /--etendre va seule/,
  ],
  // --arreter.
  ['--arreter avec --reprendre', ['demo-1', '--arreter', '--reprendre'], /--arreter va seule/],
  [
    '--arreter avec --depuis',
    ['demo-1', '--arreter', '--depuis', 'developpeur', '--contexte', 'x'],
    /--arreter va seule/,
  ],
  // --mecanique.
  ['--mecanique sans --contexte', ['demo-1', '--mecanique'], /--mecanique attend son --contexte/],
  [
    '--mecanique avec une commande et sans --contexte',
    ['demo-1', '--mecanique', 'mv a b'],
    /--mecanique attend son --contexte/,
  ],
  [
    '--mecanique avec un --contexte blanc',
    ['demo-1', '--mecanique', '--contexte', '  '],
    /--mecanique attend son --contexte/,
  ],
  ...(
    [
      ['--reprendre', ['--reprendre']],
      ['--arreter', ['--arreter']],
      ['--recommencer', ['--recommencer']],
      ['--reporter', ['--reporter', '+6h']],
      ['--depuis', ['--depuis', 'testwriter']],
      ['--etendre', ['--etendre', '030-binder']],
    ] as [string, string[]][]
  ).map(([nom, autre]): [string, string[], RegExp] => [
    `--mecanique avec ${nom}`,
    ['demo-1', '--mecanique', '--contexte', 'une raison', ...autre],
    /--mecanique va seule/,
  ]),
  // --reporter.
  ['--reporter sans heure', ['demo-1', '--reporter'], /--reporter attend son heure/],
  [
    '--reporter suivi d’une autre option',
    ['demo-1', '--reporter', '--contexte', 'ce soir'],
    /--reporter attend son heure/,
  ],
  ...(
    [
      ['--reprendre', ['--reprendre']],
      ['--arreter', ['--arreter']],
      ['--recommencer', ['--recommencer']],
      ['--depuis', ['--depuis', 'testwriter', '--contexte', 'x']],
      ['--etendre', ['--etendre', '030-binder']],
    ] as [string, string[]][]
  ).map(([nom, autre]): [string, string[], RegExp] => [
    `--reporter avec ${nom}`,
    ['demo-1', '--reporter', '+6h', ...autre],
    /--reporter va seule/,
  ]),
  // --recommencer.
  ...(
    [
      ['--reprendre', ['--reprendre']],
      ['--arreter', ['--arreter']],
      ['--depuis', ['--depuis', 'testwriter']],
      ['--etendre', ['--etendre', '030-binder']],
    ] as [string, string[]][]
  ).map(([nom, autre]): [string, string[], RegExp] => [
    `--recommencer avec ${nom}`,
    ['demo-1', '--recommencer', ...autre],
    /--recommencer va seule/,
  ]),
];

describe('la ligne de commande du circuit refuse un appel mal formé', () => {
  it.each(REFUS)('%s : un refus d’usage qui dit son motif', async (_cas, argv, motif) => {
    const { Usage, lireLAppel } = await appel();
    expect(() => lireLAppel(argv)).toThrow(Usage);
    expect(() => lireLAppel(argv)).toThrow(motif);
  });
});

describe('la ligne de commande du circuit lit un appel bien formé', () => {
  it('lit --etendre seul, ses paquets séparés par une virgule, son contexte gardé', async () => {
    const { lireLAppel } = await appel();
    expect(
      lireLAppel(['demo-1', '--etendre', '000-forms, 030-binder', '--contexte', 'le lecteur'])
    ).toMatchObject({
      ticket: 'demo-1',
      etendre: ['000-forms', '030-binder'],
      contexte: 'le lecteur',
      reprendre: false,
      arreter: false,
    });
  });

  it('lit --arreter seul avec son motif', async () => {
    const { lireLAppel } = await appel();
    expect(
      lireLAppel(['demo-1', '--arreter', '--contexte', 'Le ticket change de plan.'])
    ).toMatchObject({
      arreter: true,
      contexte: 'Le ticket change de plan.',
      etendre: null,
      depuis: null,
    });
  });

  it('lit --depuis avec son étape et son contexte', async () => {
    const { lireLAppel } = await appel();
    expect(
      lireLAppel(['demo-1', '--depuis', 'developpeur', '--contexte', 'Reprends le code.'])
    ).toMatchObject({ depuis: 'developpeur', contexte: 'Reprends le code.', reprendre: false });
  });

  it('lit le ticket où qu’il soit parmi les options', async () => {
    const { lireLAppel } = await appel();
    expect(lireLAppel(['--reprendre', 'demo-1'])).toMatchObject({
      ticket: 'demo-1',
      reprendre: true,
    });
  });
});
