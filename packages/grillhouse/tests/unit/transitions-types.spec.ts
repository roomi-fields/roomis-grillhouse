// grillhouse-4nr.6: the types of the decisions of the circuit (scripts/transitions.d.mts) declare
// every export of scripts/transitions.mjs, so that a reader in TypeScript (the workflow of a
// ticket, the tests) never reads one of them untyped, as the lint refuses.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as transitions from '../../scripts/transitions.mjs';

const TYPES = path.join(__dirname, '../../scripts/transitions.d.mts');

describe('transitions.d.mts', () => {
  it('declares every export of transitions.mjs', () => {
    const texte = readFileSync(TYPES, 'utf8');
    const declares = new Set(
      [...texte.matchAll(/^export (?:declare )?(?:const|function|let) (\w+)/gm)].map(m => m[1])
    );
    const manquants = Object.keys(transitions).filter(n => !declares.has(n));
    expect(manquants).toEqual([]);
  });
});
