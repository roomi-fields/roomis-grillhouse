// What a session of supervision receives at its opening (grillhouse-mwz, grillhouse-pq6,
// scripts/superviseur.mjs, played by the session start): the wait of the questions to launch in
// the background, the one way a question of a circuit wakes it; then each circuit still running,
// named; each circuit stopped on a question, with its question and the command that answers it;
// each circuit dead without a final state (its process gone, no stop written), with the command
// that resumes it (`--reprendre`), which the supervisor launches without waiting for the owner's
// word. Witness: on 2026-11-01, the circuits of BPScript killed with their supervisor's session
// (bp-mono-vbwf.320.11, 320.7.11) were taken up again an hour later, and SyntHub's SH-br0.1 only on
// a word of Romain; SH-ae6.5.2, SH-ae6.5.6 and SH-br0.1.5 waited hours on their question.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { circuitsALOuverture } from '../../scripts/superviseur.mjs';
import { rendreVivant } from './tableau-essai.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'ouverture-des-circuits-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A repository with the state of each circuit <etats> names, as scripts/circuit.mjs writes
// it, those of <vivants> running.
const depot = (etats: Record<string, object>, ...vivants: string[]) => {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const dossier = path.join(racine, '.claude', 'worktrees');
  mkdirSync(dossier, { recursive: true });
  for (const [ticket, e] of Object.entries(etats)) {
    writeFileSync(
      path.join(dossier, `${ticket}.circuit.json`),
      JSON.stringify({ etape: 'developpeur', tentative: 1, code: null, raison: null, ...e })
    );
  }
  for (const ticket of vivants) {
    rendreVivant(racine, ticket);
  }
  return racine;
};
const ETATS = {
  'demo-1': { etape: 'controles' },
  'demo-2': { etape: 'preuve' },
  'demo-3': {
    etape: 'controles',
    code: 14,
    raison: 'controles',
    question: {
      arret: 'controles',
      fait: 'rouge',
      piece: 'p',
      question: 'Quel paquet lève ce rouge ?',
      qui: 'superviseur',
    },
  },
  'demo-4': { etape: 'integre', code: 0 },
  'demo-5': { etape: 'testwriter' },
  'demo-6': { etape: 'developpeur', code: 0, raison: 'arrete' },
};
const ATTENTE = "## L'attente des questions\n";

describe('the opening of a session of supervision', () => {
  it('grillhouse-pq6 — asks to launch the wait of the questions, the one way a question wakes the session', () => {
    const texte = circuitsALOuverture(depot({}), { fermes: () => new Set() });
    expect(texte.startsWith(ATTENTE)).toBe(true);
    expect(texte).toContain('sans attendre le mot du responsable');
    expect(texte).toContain('`npx grillhouse superviseur --attendre`');
    expect(texte).not.toContain('--rattacher');
    expect(texte).not.toContain('## Les circuits du dépôt');
  });

  it('grillhouse-mwz critère 2, grillhouse-pq6 — names each running circuit, each stopped one with its question and its answer, each dead one with --reprendre', () => {
    const racine = depot(ETATS, 'demo-1');
    const texte = circuitsALOuverture(racine, { fermes: () => new Set(['demo-5']) });
    expect(texte.startsWith(ATTENTE)).toBe(true);
    expect(texte).toContain('\n## Les circuits du dépôt\n');
    expect(texte).toContain('- demo-1 tourne, à 3.1 Contrôles.');
    expect(texte).toMatch(
      /- demo-2 est mort sans état final .*2\.1 Preuve du rouge.*`npx grillhouse circuit demo-2 --reprendre`/
    );
    expect(texte).toMatch(
      /- demo-3 est arrêté sur une question \(controles\), à 3\.1 Contrôles, au superviseur : Quel paquet lève ce rouge \?\n {2}La réponse : `npx grillhouse circuit demo-3 --reprendre`/
    );
    expect(texte).not.toContain('--rattacher');
    // A circuit ended, stopped by the supervisor, or whose ticket is closed is not named.
    expect(texte).not.toContain('demo-4');
    expect(texte).not.toContain('demo-5');
    expect(texte).not.toContain('demo-6');
  });

  it('grillhouse-mwz critère 1 — a circuit stopped on a question whose ticket is closed is not named', () => {
    const racine = depot({ 'demo-3': ETATS['demo-3'] });
    expect(circuitsALOuverture(racine, { fermes: () => new Set(['demo-3']) })).not.toContain(
      'demo-3'
    );
  });
});
