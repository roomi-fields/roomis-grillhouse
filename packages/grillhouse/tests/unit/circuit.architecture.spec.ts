// The circuit refuses at its start a ticket whose description has no « ## Architecture » section,
// by the rule the developer's write lock reads (scripts/verrous/verrou.mjs), as a CI validates its
// configuration before it runs its jobs (grillhouse-d57).
// Witness: OSC Bridge, circuit OB-vch.1.3 under 0.25.3 (2026-10-30): the ticket had no
// « ## Architecture » section; the circuit led step 1 (plan, questioner) and step 2 (testwriter),
// then the developer's lock refused it at step 3, two steps of sessions lost.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import {
  DepartRefuse,
  ticketAuDepart,
  ticketAuLancement,
} from '../../scripts/depart-du-ticket.mjs';
import { refusal, sansArchitecture } from '../../scripts/verrous/verrou.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-architecture-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const montre = (description: string) =>
  JSON.stringify([{ id: 'OB-vch.1.3', title: '1.3 — sujet — osc-bridge', description }]);

const SANS = '## Besoin\n\nUn besoin.\n\n## Critères\n\n1. Un critère.\n';
const AVEC = '## Besoin\n\nUn besoin.\n\n## Architecture\n\nLe mécanisme commun.\n';

describe('grillhouse-d57, critère 1 — le circuit refuse dès son départ un ticket sans Architecture', () => {
  it('a ticket without « ## Architecture » is refused, with the reason of the lock', () => {
    const raison = sansArchitecture('OB-vch.1.3', SANS);
    expect(raison).toContain('« ## Architecture »');
    expect(() => {
      ticketAuDepart('OB-vch.1.3', montre(SANS));
    }).toThrow(raison as string);
  });

  it('the reason is the one the developer’s lock gives', () => {
    const transcript = path.join(ESSAIS, 'transcript.jsonl');
    const lancement = { type: 'user', message: { content: 'TON TICKET : OB-vch.1.3' } };
    writeFileSync(transcript, `${JSON.stringify(lancement)}\n`);
    const input = {
      tool_name: 'Write',
      tool_input: { file_path: path.resolve(__dirname, '../../scripts/circuit.mjs') },
      cwd: path.resolve(__dirname, '../..'),
      transcript_path: transcript,
    };
    const raison = refusal('developpeur', input, { describe: () => SANS });
    expect(raison).toBe(sansArchitecture('OB-vch.1.3', SANS));
  });

  it('a ticket with its « ## Architecture » section starts', () => {
    expect(sansArchitecture('OB-vch.1.3', AVEC)).toBeNull();
    expect(ticketAuDepart('OB-vch.1.3', montre(AVEC))).toMatchObject({ id: 'OB-vch.1.3' });
  });

  // The supervisor's stop does not depend on the ticket's content, as GitLab cancels a pipeline
  // whatever its configuration; --reprendre and --etendre keep the check.
  it('--arreter passes on a ticket without « ## Architecture »', () => {
    expect(ticketAuDepart('OB-vch.1.3', montre(SANS), { arreter: true })).toMatchObject({
      id: 'OB-vch.1.3',
    });
    expect(() => {
      ticketAuDepart('OB-vch.1.3', montre(SANS), { arreter: false });
    }).toThrow('« ## Architecture »');
  });
});

// The launch reads the ticket by Beads (`ticketAuLancement`): a title without its components is
// refused by its name, and a launch that does not check the title (`arreter`, which `--etendre`
// takes to resolve its packages) keeps it whole, with no plan.
describe('le départ d’un ticket lit son titre, sauf l’arrêt du superviseur', () => {
  const RACINE = mkdtempSync(path.join(ESSAIS, 'depot-'));
  mkdirSync(path.join(RACINE, 'docs'));
  writeFileSync(path.join(RACINE, 'docs', 'ARCHITECTURE.md'), architecture());
  // A Beads that shows the ticket titled <titre>, its description <description>.
  const bd =
    (titre: string, description = AVEC) =>
    () => ({
      status: 0,
      stdout: JSON.stringify([{ id: 'demo-1', title: titre, description }]),
      stderr: '',
    });
  it('a title that names no component is refused at the launch, named', () => {
    expect(() => ticketAuLancement(RACINE, 'demo-1', { bd: bd('un sujet seul') })).toThrow(
      new DepartRefuse('le titre de demo-1 ne nomme pas ses composants.')
    );
  });
  it('a launch that does not check the title keeps it whole: no plan, no refusal', () => {
    expect(
      ticketAuLancement(RACINE, 'demo-1', { arreter: true, bd: bd('un sujet seul', SANS) })
    ).toMatchObject({ sujet: 'un sujet seul', plan: [] });
  });
});

describe('grillhouse-d57, critère 2 — la règle vit à une seule adresse', () => {
  it('only the lock’s module holds the expression of the section', () => {
    const lire = (rel: string) =>
      readFileSync(path.resolve(__dirname, '../../scripts', rel), 'utf8');
    expect(lire('circuit.mjs')).not.toContain('Architecture\\b');
    expect(lire('verrous/verrou.mjs').split('##\\s+Architecture').length - 1).toBe(1);
  });
});
