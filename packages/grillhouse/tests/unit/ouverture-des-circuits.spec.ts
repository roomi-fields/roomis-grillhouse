// The circuits a session of supervision finds at its opening (grillhouse-mwz, scripts/superviseur.mjs,
// played by the session start): each circuit still running, with the command that attaches to it
// (`--rattacher`), and each circuit dead without a final state (its process gone, no stop
// written), with the command that resumes it (`--reprendre`), which the supervisor launches
// without waiting for the owner's word. Witness: on 2026-11-01, the circuits of BPScript killed
// with their supervisor's session (bp-mono-vbwf.320.11, 320.7.11) were taken up again an hour later,
// and SyntHub's SH-br0.1 only on a word of Romain.
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
  'demo-3': { etape: 'controles', code: 14, raison: 'controles' },
  'demo-4': { etape: 'integre', code: 0 },
  'demo-5': { etape: 'testwriter' },
  'demo-6': { etape: 'developpeur', code: 0, raison: 'arrete' },
};

describe('the circuits at the opening of a session of supervision', () => {
  it('grillhouse-mwz critère 2 — names each running circuit with --rattacher and each dead one without a final state with --reprendre', () => {
    const racine = depot(ETATS, 'demo-1');
    const texte = circuitsALOuverture(racine, { fermes: () => new Set(['demo-5']) });
    expect(texte).toMatch(/^## Circuits à rattacher ou à reprendre\n/);
    expect(texte).toContain('sans attendre le mot du responsable');
    expect(texte).toMatch(
      /- demo-1 tourne\b.*3\.1 Contrôles.*`npx grillhouse circuit demo-1 --rattacher`/
    );
    expect(texte).toMatch(
      /- demo-2 est mort sans état final .*2\.1 Preuve du rouge.*`npx grillhouse circuit demo-2 --reprendre`/
    );
    // A circuit stopped on a question (its ticket open) is named, to attach to: its stop goes up.
    expect(texte).toMatch(/- demo-3 .*`npx grillhouse circuit demo-3 --rattacher`/);
    // A circuit ended, stopped by the supervisor, or whose ticket is closed is not named.
    expect(texte).not.toContain('demo-4');
    expect(texte).not.toContain('demo-5');
    expect(texte).not.toContain('demo-6');
  });

  it('grillhouse-mwz critère 1 — a circuit stopped on a question whose ticket is closed is not named', () => {
    const racine = depot({ 'demo-3': ETATS['demo-3'] });
    expect(circuitsALOuverture(racine, { fermes: () => new Set(['demo-3']) })).toBe('');
  });

  it('grillhouse-mwz critère 2 — says nothing when no circuit runs and none died without a final state', () => {
    // Only an integrated circuit, one whose ticket is closed and one stopped by the supervisor.
    const racine = depot({
      'demo-4': ETATS['demo-4'],
      'demo-5': ETATS['demo-5'],
      'demo-6': ETATS['demo-6'],
    });
    expect(circuitsALOuverture(racine, { fermes: () => new Set(['demo-5']) })).toBe('');
  });
});
