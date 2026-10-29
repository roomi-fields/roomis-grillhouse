import path from 'node:path';

// The frame's envelope of an agent (scripts/enveloppe/enveloppe.mjs), which its tests
// (tests/unit/enveloppe*.spec.ts) launch; their trial directories come from the shared material
// (`enveloppeEssai`). The tests of its launcher (scripts/enveloppe/lancer.sh) are night tests of
// packages/grillhouse-essais.
export const SCRIPT = path.resolve(__dirname, '../../scripts/enveloppe/enveloppe.mjs');
