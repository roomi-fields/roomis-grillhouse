// What a session of supervision receives at its opening (grillhouse-mwz, grillhouse-pq6,
// grillhouse-4nr.10, scripts/superviseur.mjs, played by the session start): the wait of the
// questions to launch in the background, the one way a question of a circuit wakes it; then, the
// circuits read from the Temporal server in one call (here a reading injected), each circuit still
// running, named; each circuit stopped on a question, with its question and the command that
// answers it; each circuit ended without its issue, with the command that resumes it
// (`--reprendre`), which the supervisor launches without waiting for the owner's word. Witness: on
// 2026-11-01, the circuits of BPScript killed with their supervisor's session
// (bp-mono-vbwf.320.11, 320.7.11) were taken up again an hour later, and SyntHub's SH-br0.1 only on
// a word of Romain; SH-ae6.5.2, SH-ae6.5.6 and SH-br0.1.5 waited hours on their question.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ClientNonConstruit, ServeurMuet } from '../../scripts/circuits-du-serveur.mjs';
import { circuitsALOuverture } from '../../scripts/superviseur.mjs';
import { circuitLu } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ouverture-des-circuits-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A repository, its folder of the circuits made.
const depot = () => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  mkdirSync(path.join(racine, '.claude', 'worktrees'), { recursive: true });
  return racine;
};
const CIRCUITS = [
  circuitLu('demo-1', { etape: 'controles', vivant: true }),
  circuitLu('demo-2', {
    etape: 'preuve',
    interrompu: true,
    reponse: `npx grillhouse circuit demo-2 --reprendre\` ou \`--depuis <testwriter|developpeur> --contexte <texte>`,
    question: 'Le déroulé du circuit a fini sans son issue (TERMINATED), aucun arrêt écrit.',
    qui: 'superviseur',
  }),
  circuitLu('demo-3', {
    etape: 'controles',
    code: 14,
    arret: 'controles',
    question: 'Quel paquet lève ce rouge ?',
    qui: 'superviseur',
    numero: 1,
  }),
  circuitLu('demo-5', { etape: 'testwriter' }),
  circuitLu('demo-6', { code: 0, arret: 'arrete' }),
];
const lus =
  (c = CIRCUITS) =>
  () =>
    Promise.resolve(c);
const ATTENTE = "## L'attente des questions\n";

describe('the opening of a session of supervision', () => {
  it('asks to launch the wait of the questions, the one way a question wakes the session', async () => {
    const texte = await circuitsALOuverture(depot(), {
      fermes: () => new Set(),
      circuitsDe: lus([]),
    });
    expect(texte.startsWith(ATTENTE)).toBe(true);
    expect(texte).toContain('sans attendre le mot du responsable');
    expect(texte).toContain('`npx grillhouse superviseur --attendre`');
    expect(texte).not.toContain('--rattacher');
    expect(texte).not.toContain('## Les circuits du dépôt');
  });

  it('names each running circuit, each stopped one with its question and its answer, each ended one with --reprendre', async () => {
    const texte = await circuitsALOuverture(depot(), {
      fermes: () => new Set(['demo-5']),
      circuitsDe: lus(),
    });
    expect(texte.startsWith(ATTENTE)).toBe(true);
    expect(texte).toContain('\n## Les circuits du dépôt\n');
    expect(texte).toContain('- demo-1 tourne, à 3.1 Contrôles.');
    expect(texte).toMatch(
      /- demo-2 a fini sans son issue .*2\.1 Preuve du rouge.*`npx grillhouse circuit demo-2 --reprendre`/
    );
    expect(texte).toMatch(
      /- demo-3 est arrêté sur une question \(controles\), à 3\.1 Contrôles, au superviseur : Quel paquet lève ce rouge \?\n {2}La réponse : `npx grillhouse circuit demo-3 --reprendre`/
    );
    expect(texte).not.toContain('--rattacher');
    // A circuit stopped by the supervisor, or whose ticket is closed, is not named.
    expect(texte).not.toContain('demo-5');
    expect(texte).not.toContain('demo-6');
  });

  it('a circuit stopped on a question whose ticket is closed is not named', async () => {
    const texte = await circuitsALOuverture(depot(), {
      fermes: () => new Set(['demo-3']),
      circuitsDe: lus([CIRCUITS[2]!]),
    });
    expect(texte).not.toContain('demo-3');
  });

  it('a server that does not answer is said, and no question goes up', async () => {
    const texte = await circuitsALOuverture(depot(), {
      fermes: () => new Set(),
      circuitsDe: () =>
        Promise.reject(
          new ServeurMuet('127.0.0.1:7233', new Error('14 UNAVAILABLE: No connection established'))
        ),
    });
    expect(texte).toContain(
      'Temporal ne répond pas en 5 s sur 127.0.0.1:7233 : les circuits ne se lisent pas.'
    );
  });

  it('another fault of the reading is said for what it is, not as a silent server', async () => {
    const texte = await circuitsALOuverture(depot(), {
      fermes: () => new Set(),
      circuitsDe: () => Promise.reject(new Error('mémo illisible\nla suite')),
    });
    expect(texte).toContain('Les circuits ne se lisent pas : mémo illisible.');
    expect(texte).not.toContain('Temporal ne répond pas');
  });

  it('a client not built is said for what it is, with the command that builds it', async () => {
    const texte = await circuitsALOuverture(depot(), {
      fermes: () => new Set(),
      circuitsDe: () => Promise.reject(new ClientNonConstruit()),
    });
    expect(texte).toContain(
      "Les circuits ne se lisent pas : le client Temporal n'est pas construit"
    );
    expect(texte).toContain('`npm run build --workspace @roomi-fields/grillhouse`');
    expect(texte).not.toContain('Temporal ne répond pas');
  });
});

describe('the opening names the tickets of the queue without their architecture', () => {
  const ticket = (id: string, description: string) => ({
    id,
    status: 'open',
    labels: ['circuit'],
    description,
  });

  it('names each ticket of the queue whose description has no section « ## Architecture »', async () => {
    const texte = await circuitsALOuverture(depot(), {
      fermes: () => new Set(),
      circuitsDe: lus([circuitLu('demo-4', { etape: 'controles', vivant: true })]),
      ticketsDe: () => [
        ticket('demo-1', '## Besoin\n\nUn besoin.'),
        ticket('demo-2', '## Architecture\n\n- Adresse.'),
        ticket('demo-3', ''),
        ticket('demo-4', '## Besoin'),
      ],
    });
    expect(texte).toContain(
      '\n## La file des tickets\nEn file sans architecture : demo-1, demo-3.'
    );
  });

  it('says nothing of the queue when each ticket has its section, or when Beads fails', async () => {
    const avec = await circuitsALOuverture(depot(), {
      fermes: () => new Set(),
      circuitsDe: lus([]),
      ticketsDe: () => [ticket('demo-2', '## Architecture\n\n- Adresse.')],
    });
    const panne = await circuitsALOuverture(depot(), {
      fermes: () => new Set(),
      circuitsDe: lus([]),
      ticketsDe: () => {
        throw new Error('les tickets ne se lisent pas (bd list) : base illisible');
      },
    });
    expect(avec).not.toContain('## La file des tickets');
    expect(panne).not.toContain('## La file des tickets');
  });
});
