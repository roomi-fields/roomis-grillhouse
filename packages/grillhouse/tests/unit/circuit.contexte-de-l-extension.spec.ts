// The context `--etendre` gives the sessions of the run it resumes is the supervisor's answer to
// the stop, never the stop itself.
// Witness: OSD-bac.3, SH-2hb.3 and grillhouse-3uv.112 (2026-11): after `--etendre`, the reviewer
// received under « CONTEXTE » the fact and the piece of the stop out of the plan (the lock's
// message, « ta séance s'arrête là »), read it as the supervisor's word, and stopped the circuit
// on a file the extended plan held.
import { describe, expect, it } from 'vitest';
import { contexteDeLExtension } from '../../scripts/circuit.mjs';

const QUESTION = {
  fait: 'deny.toml est dans la racine du dépôt, hors du plan du ticket (ses paquets : crates/service, site).',
  piece:
    '⛔ hors-plan — deny.toml est dans la racine du dépôt, hors des paquets du plan (crates/service, site) : ta séance s’arrête là, et le superviseur étend le plan ou refuse l’écriture.',
};

describe('le contexte d’une extension du plan dit la réponse du superviseur', () => {
  it('nomme les paquets gagnés et le plan étendu, sans le fait ni la pièce de l’arrêt', () => {
    const contexte = contexteDeLExtension({
      question: QUESTION,
      etendus: ['.'],
      plan: 'crates/service, site, .',
      contexte: null,
    });
    expect(contexte).toContain('Le superviseur a étendu le plan à .');
    expect(contexte).toContain('crates/service, site, .');
    expect(contexte).not.toContain('⛔');
    expect(contexte).not.toMatch(/s.arrête/);
    expect(contexte).not.toContain('(ses paquets : crates/service, site)');
    expect(contexte).not.toContain('hors des paquets du plan');
  });

  it('fait suivre la réponse du texte du superviseur', () => {
    const contexte = contexteDeLExtension({
      question: QUESTION,
      etendus: ['.'],
      plan: 'crates/service, site, .',
      contexte: 'Écris deny.toml.',
    });
    expect(contexte?.endsWith('\n\nÉcris deny.toml.')).toBe(true);
    expect(contexte?.startsWith('Le superviseur a étendu le plan')).toBe(true);
  });

  it('sans question à l’arrêt, rend le seul texte du superviseur, ou rien', () => {
    const sans = { question: null, etendus: ['.'], plan: 'site, .' };
    expect(contexteDeLExtension({ ...sans, contexte: 'Écris deny.toml.' })).toBe(
      'Écris deny.toml.'
    );
    expect(contexteDeLExtension({ ...sans, contexte: null })).toBeNull();
  });
});
