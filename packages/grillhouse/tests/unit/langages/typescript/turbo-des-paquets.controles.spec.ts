import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { afterAll, describe, expect, it } from 'vitest';
import { ecrire, verifier } from '../../../../scripts/langages/typescript/turbo-des-paquets.mjs';

// grillhouse-61z, critères 5 et 6: `grillhouse maj` écrit (ecrire) dans le turbo.json racine les
// tâches //#lint et //#format:check des scripts que la racine porte, et la vérification (verifier)
// refuse leur absence en les nommant ; un script absent n'est pas exigé (comme `gardes`).

const DEPOT = path.resolve(__dirname, '../../../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'turbo-controles-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrireFichier = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

function depot(scripts: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  ecrireFichier(
    r,
    'package.json',
    json({
      name: 'essai',
      private: true,
      workspaces: ['packages/*'],
      packageManager: 'npm@10.9.8',
      scripts,
    })
  );
  ecrireFichier(
    r,
    'turbo.json',
    readFileSync(path.join(DEPOT, 'templates/turbo/paquets.json'), 'utf8')
  );
  ecrireFichier(
    r,
    'packages/a/package.json',
    json({ name: 'a', scripts: { build: 'tsc', 'test:unit': 'vitest run' } })
  );
  return r;
}
const taches = (r: string) =>
  (
    parseJsonc(readFileSync(path.join(r, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, unknown>;
    }
  ).tasks;
const refusDeControle = (r: string) => verifier(r).filter(l => /lint|format:check/.test(l));

describe('turbo-des-paquets : tâches des contrôles de la racine (61z, critères 5 et 6)', () => {
  it('critère 6 : verifier refuse, en les nommant, //#lint et //#format:check absents du turbo.json', () => {
    const r = depot({ lint: 'eslint .', 'format:check': 'prettier --check .' });
    const refus = refusDeControle(r);
    expect(refus.some(l => l.includes('//#lint'))).toBe(true);
    expect(refus.some(l => l.includes('//#format:check'))).toBe(true);
  });

  it('critère 5 : ecrire ajoute //#lint et //#format:check, puis verifier ne les refuse plus', () => {
    const r = depot({ lint: 'eslint .', 'format:check': 'prettier --check .' });
    ecrire(r);
    expect(Object.keys(taches(r))).toEqual(expect.arrayContaining(['//#lint', '//#format:check']));
    expect(refusDeControle(r)).toEqual([]);
  });

  it('critère 5 : ecrire rejoué ne change rien', () => {
    const r = depot({ lint: 'eslint .', 'format:check': 'prettier --check .' });
    ecrire(r);
    const avant = readFileSync(path.join(r, 'turbo.json'), 'utf8');
    ecrire(r);
    expect(readFileSync(path.join(r, 'turbo.json'), 'utf8')).toBe(avant);
  });

  it('critère 6 : un script absent n’est pas exigé ni écrit', () => {
    const r = depot({ lint: 'eslint .' });
    expect(refusDeControle(r).some(l => l.includes('format:check'))).toBe(false);
    ecrire(r);
    const t = Object.keys(taches(r));
    expect(t).toContain('//#lint');
    expect(t).not.toContain('//#format:check');
  });

  it('critère 6 : sans aucun script de contrôle, aucune tâche de contrôle', () => {
    const r = depot({});
    expect(refusDeControle(r)).toEqual([]);
    ecrire(r);
    const t = Object.keys(taches(r));
    expect(t).not.toContain('//#lint');
    expect(t).not.toContain('//#format:check');
  });
});
