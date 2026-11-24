// Le lint typé lit les types que la construction écrit (`dist/`) : dans le graphe des tâches de
// Turborepo, la tâche `lint` d'un paquet attend son `build` et celui de ses dépendances, comme
// `typecheck`. Lu dans le turbo.json de la racine du dépôt.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(import.meta.dirname, '../../../..');

describe('le graphe des tâches fait passer build avant lint', () => {
  it('le turbo.json de la racine', () => {
    const { tasks } = JSON.parse(readFileSync(path.join(RACINE, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { dependsOn?: string[] }>;
    };
    expect(tasks.lint?.dependsOn).toEqual(['build', '^build']);
  });
});
