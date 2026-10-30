// `scripts/langages/typescript/consommateurs-arbitres.mjs`: a line of a `## Consommateurs` section that a lot changes
// enters with a settled arbitrage at its ticket, which names its consumer. Decided by the owner on
// 2026-10-17 (grill, Q7): the integrateur's judgement « un consommateur nouveau a son arbitrage »
// becomes a guard of the frame.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gardesDuCadre } from '../../../../scripts/gardes-du-cadre.mjs';
import {
  juger,
  ticketDeLaBranche,
} from '../../../../scripts/langages/typescript/consommateurs-arbitres.mjs';

// The guard by its interface: the ticket read from the branch (`ticketDeLaBranche`), and the
// judgement (`juger`) on the interface's text at HEAD and in the working tree, the ticket's
// comments and plan given as bd prints them. The guard run in a git repository, bd called from the
// main tree, is the night's (packages/grillhouse-essais/tests/consommateurs-arbitres.nuit.spec.ts).

const interfaceDe = (lignes: string[], genere: string[] = []) =>
  [
    '# a',
    '',
    'Le composant a.',
    '',
    '## Consommateurs',
    '',
    ...lignes,
    '',
    ...(genere.length ? ['<!-- généré: début -->', ...genere, '<!-- généré: fin -->', ''] : []),
  ].join('\n');

// A lot whose package <paquet> holds the interface <avant> at HEAD; then, on <branche>, the working
// tree holds <apres>. Beads holds <ticket>, its <show> (the JSON of `bd show <ticket> --json`), and
// its comments <comments> (none: `bd comments` fails). `appels` records each reading of Beads.
type Lot = {
  branche: string;
  avant: string;
  apres: string;
  comments?: { text: string }[];
  show: unknown;
  ticket?: string;
  paquet?: string;
};
function depotAvec(o: Lot) {
  const { ticket = 'demo-1', paquet = 'a' } = o;
  return { ...o, ticket, paquet, appels: [] as string[] };
}

// A lot whose package `a` declares `b` as consumer at HEAD; then, on <branche>, the working tree
// adds <neuves> to that section. Beads holds demo-1, its <description> (none by default), and its
// comments <comments>.
const depot = (
  branche: string,
  neuves: string[],
  comments?: { text: string }[],
  description = ''
) =>
  depotAvec({
    branche,
    avant: interfaceDe(['- `b` : duree']),
    apres: interfaceDe(['- `b` : duree', ...neuves]),
    comments,
    show: [{ id: 'demo-1', title: 'demo-1 — un sujet — a', description }],
  });

// The guard on the lot <lot>: its exit code and its error output, as it writes them, no finding
// inscribed in a debt.
function jouer(lot: ReturnType<typeof depotAvec>) {
  const ticket = ticketDeLaBranche(lot.branche);
  const constats =
    ticket === null
      ? []
      : juger(
          ticket,
          [{ rel: `packages/${lot.paquet}/docs/INTERFACE.md`, avant: lot.avant, apres: lot.apres }],
          () => {
            lot.appels.push(`comments ${ticket} --json`);
            if (!lot.comments) {
              throw new Error('code 1');
            }
            return lot.comments;
          },
          () => {
            lot.appels.push(`show ${ticket} --json`);
            return (lot.show as unknown[])[0];
          }
        );
  return {
    status: constats.length ? 1 : 0,
    stderr: constats.map(c => `⛔ ${c.message}\n`).join(''),
  };
}

const TRANCHE = '## Arbitrage — `c` lit duree\n\n### Verdict — tranché — la spécification';

describe('consommateurs-arbitres — a changed Consommateurs line has its settled arbitrage', () => {
  it('refuses a line the lot adds without arbitrage, at its interface, naming the consumer', () => {
    const r = jouer(depot('agent/demo-1', ['- `c` : duree'], []));
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain('packages/a/docs/INTERFACE.md § Consommateurs');
    expect(r.stderr).toContain('- `c` : duree');
    expect(r.stderr).toContain('demo-1');
    expect(r.stderr).toContain('`c`');
  });

  it('passes the line with a settled « Arbitrage » at the ticket that names its consumer', () => {
    const r = jouer(depot('agent/demo-1', ['- `c` : duree'], [{ text: TRANCHE }]));
    expect(r.status, r.stderr).toBe(0);
  });

  it('refuses the line when its arbitrage is not settled', () => {
    const r = jouer(
      depot(
        'agent/demo-1',
        ['- `c` : duree'],
        [{ text: '## Arbitrage — `c` lit duree\n\nÀ voir.' }]
      )
    );
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain('change sans arbitrage tranché');
  });

  it('passes the line when the owner answered the arbitrage', () => {
    const r = jouer(
      depot(
        'agent/demo-1',
        ['- `c` : duree'],
        [{ text: '## Arbitrage — `c` lit duree' }, { text: '## Réponse du responsable\n\nOui.' }]
      )
    );
    expect(r.status, r.stderr).toBe(0);
  });

  // grillhouse-3uv.95.4: the arbitrage is the supervisor's « ## Arbitrage » comment, settled by its
  // verdict; one without its verdict settles nothing.
  it('refuses a « ## Arbitrage » written at the ticket without its verdict', () => {
    const r = jouer(
      depot('agent/demo-1', ['- `c` : duree'], [{ text: '## Arbitrage — `c`\n\n`c` lit duree.' }])
    );
    expect(r.status, r.stderr).toBe(1);
  });

  it('judges nothing out of a branch agent/…, and calls no bd', () => {
    const lot = depot('main', ['- `c` : duree']);
    const r = jouer(lot);
    expect(r.status, r.stderr).toBe(0);
    expect(lot.appels).toEqual([]);
    expect(ticketDeLaBranche('agent/demo-1.2')).toBe('demo-1.2');
    for (const b of ['main', 'HEAD', 'feature/agent/demo-1']) {
      expect(ticketDeLaBranche(b)).toBeNull();
    }
  });

  it('calls no bd when no line changes', () => {
    const lot = depot('agent/demo-1', []);
    expect(jouer(lot).status).toBe(0);
    expect(lot.appels).toEqual([]);
  });

  it('refuses when the comments of the ticket cannot be read', () => {
    const r = jouer(depot('agent/demo-1', ['- `c` : duree']));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ne se lisent pas');
  });

  // Witness: BPScript (320.2.4.5.1), a ticket born of the owner's word whose « ## Architecture »
  // fixed the consumers and their names: the guard asked an arbitrage for each, two questions to
  // the supervisor for nothing. The ticket's plan (its title, its sections « Architecture » and
  // « Noms publiés ») names the consumer and each name the lot adds to the line, word for word.
  const architecture = (texte: string) =>
    ['## Architecture', '', texte, '', "## Critères d'acceptation", '', '1. Le lot tient.'].join(
      '\n'
    );

  it('passes without arbitrage a line the ticket’s Architecture names, its consumer and each of its names', () => {
    const r = jouer(
      depot(
        'agent/demo-1',
        ['- `c` : duree, tempo'],
        [],
        architecture('Le composant `c` lit `duree` et tempo de `a`.')
      )
    );
    expect(r.status, r.stderr).toBe(0);
  });

  it('refuses a line whose names the ticket’s Architecture does not all name', () => {
    const r = jouer(
      depot(
        'agent/demo-1',
        ['- `c` : duree, tempo'],
        [],
        architecture('Le composant `c` lit `duree` de `a`.')
      )
    );
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain('- `c` : duree, tempo');
  });

  it('refuses a line whose consumer the Architecture names only inside another word', () => {
    const r = jouer(
      depot(
        'agent/demo-1',
        ['- `c` : duree'],
        [],
        architecture('Le composant `cc` lit `duree` de `a`.')
      )
    );
    expect(r.status, r.stderr).toBe(1);
  });

  it('refuses a line the ticket’s plan does not name', () => {
    const r = jouer(
      depot('agent/demo-1', ['- `c` : tempo'], [], architecture('Rien sur les consommateurs.'))
    );
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain('change sans arbitrage tranché');
  });

  // grillhouse-ybq.2 (BPScript 320.8, and 320.9 defect 26): the guard took the « Paramètres »
  // bullets of the generated part for consumers, and asked an arbitrage for lines the plan named.
  it('never takes a bullet of the generated part for a consumer, and calls no bd for it', () => {
    const entree = (nom: string, parametre: string) => [
      `### \`${nom}\``,
      '',
      '**Paramètres**',
      '',
      `- \`${parametre}\` — any value.`,
      '',
    ];
    const lot = depotAvec({
      branche: 'agent/demo-1',
      avant: interfaceDe(['- `b` : duree'], entree('duree', 'value')),
      apres: interfaceDe(
        ['- `b` : duree'],
        [...entree('duree', 'value'), ...entree('tempo', 'line')]
      ),
      show: [{ id: 'demo-1', title: '', description: '' }],
    });
    const r = jouer(lot);
    expect(r.status, r.stderr).toBe(0);
    expect(lot.appels).toEqual([]);
  });

  it('passes a line the ticket’s plan names out of its Architecture: its title, « Noms publiés »', () => {
    const r = jouer(
      depotAvec({
        branche: 'agent/demo-1',
        avant: interfaceDe(['- `b` : duree']),
        apres: interfaceDe(['- `b` : duree', '- `c` : tempo']),
        comments: [],
        show: [
          {
            id: 'demo-1',
            title: 'demo-1 — un sujet — a, c',
            description:
              '## Architecture\n\nLes composants du titre.\n\n## Noms publiés\n\n`tempo`.',
          },
        ],
      })
    );
    expect(r.status, r.stderr).toBe(0);
  });

  it('asks the plan only for the names the lot adds to a line, and says those it misses', () => {
    const lot = (description: string) =>
      jouer(
        depotAvec({
          branche: 'agent/demo-1',
          avant: interfaceDe(['- `b` : duree']),
          apres: interfaceDe(['- `b` : duree, tempo, mesure']),
          comments: [],
          show: [{ id: 'demo-1', title: 'demo-1', description }],
        })
      );
    expect(lot(architecture('`b` lit `tempo` et `mesure`.')).status).toBe(0);
    const r = lot(architecture('`b` lit `tempo`.'));
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain('- `b` : duree, tempo, mesure');
    expect(r.stderr).toContain('ne nomme pas `mesure`');
  });

  // The owner's decision (option 1): the plan is the title and the sections « Architecture » and
  // « Noms publiés », never the rest of the description, where a question or a criterion can name
  // what the ticket keeps out.
  it('refuses a line the description names only out of « Architecture » and « Noms publiés »', () => {
    const r = jouer(
      depot(
        'agent/demo-1',
        ['- `c` : tempo'],
        [],
        [
          '## Architecture',
          '',
          'Rien.',
          '',
          "## Critères d'acceptation",
          '',
          '1. `c` lit `tempo`.',
          '',
          '## Questions ouvertes',
          '',
          '1. `c` et `tempo` : à retirer ?',
        ].join('\n')
      )
    );
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain('ne nomme pas `c`, `tempo`');
  });

  // The real case: BPScript 625c8ca12, packages/000-forms/docs/INTERFACE.md (its section
  // Consommateurs and, of its generated part, the entries of the names it reads), before and after
  // the lot, and the plan of bp-mono-vbwf.320.8, without the arbitrage the supervisor wrote then.
  const CAS = path.join(__dirname, '../../../cas-reels/bp-320.8');
  const lire = (f: string) => readFileSync(path.join(CAS, f), 'utf8');
  const TICKET_320_8 = 'bp-mono-vbwf.320.8';
  // The refusals of the guard on the real case, the lot's interface changed by <changer>.
  const refus320 = (changer = (t: string) => t) => {
    const r = jouer(
      depotAvec({
        branche: `agent/${TICKET_320_8}`,
        ticket: TICKET_320_8,
        paquet: '000-forms',
        avant: lire('INTERFACE.avant.md'),
        apres: changer(lire('INTERFACE.apres.md')),
        comments: [],
        show: JSON.parse(lire('ticket.json')),
      })
    );
    return { r, refus: r.stderr.split('\n').filter(l => l.startsWith('⛔')) };
  };
  // A consumer's line of <texte> with the name <nom> added.
  const ajouter = (consommateur: string, nom: string) => (texte: string) =>
    texte.replace(new RegExp(`^(- \`${consommateur}\` : .*)$`, 'm'), `$1, ${nom}`);

  // Of its eleven changed lines, ten pass: 020-loader, 030-binder, 040-checker, 050-emitter,
  // 060-encoder, 070-deriver, 090-ranker, 110-timer, 130-projector, 900-driver; 080-aligner adds
  // `ROLE`, which the plan does not name.
  it('replays BPScript 320.8: the plan settles ten lines; only 080-aligner refuses, on `ROLE`', () => {
    const { r, refus } = refus320();
    expect(r.status, r.stderr).toBe(1);
    expect(refus, r.stderr).toHaveLength(1);
    expect(refus[0]).toContain('« - `080-aligner` :');
    expect(refus[0]).toContain('ne nomme pas `ROLE`');
  });

  // The section « Noms publiés » of 320.8 names both: « la copie de `deepEqual` de 850-mercury est
  // déjà sortie » (tests/cas-reels/bp-320.8/ticket.json, its description).
  it('replays BPScript 320.8: passes `850-mercury : deepEqual`, which « Noms publiés » names', () => {
    const { refus } = refus320(ajouter('850-mercury', 'deepEqual'));
    expect(refus).toHaveLength(1);
    expect(refus[0]).toContain('« - `080-aligner` :');
  });

  // Criterion 20 keeps `asRecord` out of the ticket.
  it('replays BPScript 320.8: refuses `100-resolver : asRecord`, which only a criterion names', () => {
    const { refus } = refus320(ajouter('100-resolver', 'asRecord'));
    expect(refus).toHaveLength(2);
    expect(refus.find(l => l.includes('« - `100-resolver` :'))).toContain(
      'ne nomme pas `asRecord`'
    );
  });

  it('the guard is among the frame’s guards', () => {
    expect(gardesDuCadre(path.resolve(__dirname, '../../../../../..'))).toContainEqual([
      path.resolve(__dirname, '../../../../scripts/langages/typescript/consommateurs-arbitres.mjs'),
    ]);
  });
});
