// Le verrou npm (package-lock.json) est une référence que le cadre engendre en entier, pour un
// projet de TypeScript, sans clé `grillhouse.engendres` : à l'avance d'une copie sur main, son lot
// n'applique pas le verrou, la copie prend celui de main, puis `npm install --package-lock-only`
// le réécrit sur le lot appliqué (scripts/enveloppe/travail-de-la-copie.mjs). Témoin : BPScript,
// 2026-11-22, bp-mono-vbwf.320.6.2.2, un lot entré sur main avec deux devDependencies et un verrou
// en retard de 12 lignes, que le développeur ne pouvait pas écrire.
//
// Des tests moyens : le vrai git et le vrai npm dans un dépôt d'essai dont les seules dépendances
// sont des paquets du dépôt (npm n'interroge aucun registre), le verrou de main écrit à la main.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { architecture } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as travail from '../../scripts/enveloppe/travail-de-la-copie.mjs';

interface Rendu {
  ok: boolean;
  message: string;
}
const avancer = travail.avancer as unknown as (copie: string, cible: string, o?: object) => Rendu;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verrou-npm-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};
const poser = (dossier: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(dossier, f)), { recursive: true });
  writeFileSync(path.join(dossier, f), texte);
};
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

const LOCK = 'package-lock.json';
const MOTEUR = 'packages/moteur/package.json';
const SITE = 'packages/site/package.json';
type Manifeste = { name: string; version: string; devDependencies?: Record<string, string> };
const manifeste = (nom: string, devDependencies?: Record<string, string>): Manifeste => ({
  name: nom,
  version: '1.0.0',
  ...(devDependencies ? { devDependencies } : {}),
});
/** Le verrou que npm écrit pour les deux paquets, leurs devDependencies <moteur> et <site>. */
const verrou = (moteur?: Record<string, string>, site?: Record<string, string>) =>
  json({
    name: 'p',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': { name: 'p', workspaces: ['packages/*'] },
      'node_modules/moteur': { resolved: 'packages/moteur', link: true },
      'node_modules/site': { resolved: 'packages/site', link: true },
      'packages/moteur': { version: '1.0.0', ...(moteur ? { devDependencies: moteur } : {}) },
      'packages/site': { version: '1.0.0', ...(site ? { devDependencies: site } : {}) },
    },
  });

// Un projet de TypeScript de deux paquets, sans dépendance, son verrou à jour commité, et la copie
// de demo-1 à son HEAD.
function projet(cle?: object) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  git(racine, 'init', '-q', '-b', 'main');
  git(racine, 'config', 'user.email', 'essai@example.com');
  git(racine, 'config', 'user.name', 'essai');
  poser(racine, '.gitignore', '.claude/worktrees/\n');
  poser(
    racine,
    'package.json',
    json({
      name: 'p',
      private: true,
      workspaces: ['packages/*'],
      ...(cle ? { grillhouse: cle } : {}),
    })
  );
  poser(racine, 'docs/ARCHITECTURE.md', architecture({ moteur: 'typescript', site: 'typescript' }));
  poser(racine, MOTEUR, json(manifeste('moteur')));
  poser(racine, SITE, json(manifeste('site')));
  poser(racine, 'packages/site/docs/INTERFACE.md', '# site\n\nLe site.\n');
  poser(racine, 'packages/moteur/docs/INTERFACE.md', '# moteur\n\nLe moteur.\n');
  poser(racine, 'docs/agents/index-des-interfaces.md', '# Index des interfaces\n');
  poser(racine, 'notes.txt', 'base\n');
  poser(racine, 'a.txt', 'base\n');
  poser(racine, LOCK, verrou());
  git(racine, 'add', '-A');
  git(racine, 'commit', '-q', '-m', 'base');
  const copie = path.join(racine, '.claude/worktrees/demo-1');
  git(racine, 'worktree', 'add', '-q', '-b', 'agent/demo-1', copie, 'HEAD');
  const lire = (dossier: string, f: string) => readFileSync(path.join(dossier, f), 'utf8');
  const surMain = (f: string, texte: string) => {
    poser(racine, f, texte);
    git(racine, 'add', '-A');
    git(racine, 'commit', '-qm', `main ${f}`);
    return git(racine, 'rev-parse', 'HEAD');
  };
  return { racine, copie, lire, surMain };
}
const dependancesDeSite = (texte: string) =>
  (
    JSON.parse(texte) as {
      packages: Record<string, { devDependencies?: Record<string, string> }>;
    }
  ).packages['packages/site']!.devDependencies;

describe('le verrou npm, référence que le cadre engendre en entier', () => {
  it('un lot qui ajoute une devDependency entre avec son verrou à jour, sans que le lot écrive le verrou', () => {
    const p = projet();
    poser(p.copie, SITE, json(manifeste('site', { moteur: '*' })));
    const main = p.surMain('notes.txt', 'main\n');
    const r = avancer(p.copie, main);
    expect(r, r.message).toEqual({ ok: true, message: '' });
    expect(dependancesDeSite(p.lire(p.copie, LOCK))).toEqual({ moteur: '*' });
    expect(git(p.copie, 'diff', '--name-only', '--diff-filter=U')).toBe('');
  });

  it('le verrou en retard d’un lot et celui que main a changé se rejoignent sans conflit, les deux dépendances écrites', () => {
    const p = projet();
    poser(p.copie, SITE, json(manifeste('site', { moteur: '*' })));
    poser(p.racine, MOTEUR, json(manifeste('moteur', { site: '*' })));
    const main = p.surMain(LOCK, verrou({ site: '*' }));
    const r = avancer(p.copie, main);
    expect(r, r.message).toEqual({ ok: true, message: '' });
    const lock = JSON.parse(p.lire(p.copie, LOCK)) as {
      packages: Record<string, { devDependencies?: Record<string, string> }>;
    };
    expect(lock.packages['packages/site']!.devDependencies).toEqual({ moteur: '*' });
    expect(lock.packages['packages/moteur']!.devDependencies).toEqual({ site: '*' });
    expect(p.lire(p.copie, LOCK)).not.toMatch(/^(<{7}|>{7}) /m);
  });

  it('un lot qui ne touche aucun package.json laisse le verrou tel que main l’a, la commande non rejouée', () => {
    const p = projet();
    // Le verrou de main porte une dépendance que son package.json ne déclare pas : npm l'ôterait.
    const enRetard = verrou(undefined, { moteur: '*' });
    poser(p.copie, 'a.txt', 'copie\n');
    const main = p.surMain(LOCK, enRetard);
    const r = avancer(p.copie, main);
    expect(r, r.message).toEqual({ ok: true, message: '' });
    expect(p.lire(p.copie, LOCK)).toBe(enRetard);
    expect(p.lire(p.copie, 'a.txt')).toBe('copie\n');
  });

  it('un projet qui déclare lui-même package-lock.json garde sa commande, celle du cadre non jouée', () => {
    const p = projet({
      engendres: {
        verrou: {
          commande: 'node ecrire-verrou.mjs',
          fichiers: [LOCK],
          lit: ['package.json', '**/package.json'],
        },
      },
    });
    poser(
      p.racine,
      'ecrire-verrou.mjs',
      "import fs from 'node:fs';\nfs.writeFileSync('package-lock.json', 'du projet\\n');\n"
    );
    git(p.racine, 'add', '-A');
    git(p.racine, 'commit', '-qm', 'verrou du projet');
    git(p.copie, 'merge', '-q', '--ff-only', 'main');
    poser(p.copie, SITE, json(manifeste('site', { moteur: '*' })));
    const main = p.surMain('notes.txt', 'main\n');
    const r = avancer(p.copie, main);
    expect(r, r.message).toEqual({ ok: true, message: '' });
    expect(p.lire(p.copie, LOCK)).toBe('du projet\n');
  });
});
