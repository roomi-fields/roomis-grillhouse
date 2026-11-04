import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import {
  sortie,
  ecrire,
  ecrireTurbo,
  json,
  ARRETS,
  CODE_JUSTE,
  ECRIT_ROUGE,
  circuitEssai,
} from './circuit-essai.js';

// Ticket grillhouse-44b.9, critères 4, 5, 12 et 13 : la mise en forme et le lint se jouent par
// paquet ; un rouge de style qui reste à la passe finale porte le paquet de son fichier et revient
// à l'auteur du fichier, comme un test rouge, sans arrêt au superviseur ; un rouge de style d'un
// paquet hors du plan, ou d'un fichier de la racine, reste un arrêt au superviseur.
//
// Le style du dépôt d'essai : `style.mjs`, à la racine, que les scripts `lint` et `format:check`
// des paquets (et le `lint` de la racine) lancent sur leurs fichiers ; il sort rouge, son fichier
// nommé, quand le fichier contient INUTILE (lint) ou MALFORME (format:check).

// Sous la maison, pas sous /tmp : l'enveloppe de l'agent masque le dossier temporaire.
const ESSAIS = racineSousLaMaison('grillhouse-essais-style-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const {
  revenirAuDebut,
  ticket,
  scenario,
  circuit,
  sessions,
  etat,
  essai,
  historique,
  commentaires,
} = circuitEssai(ESSAIS);

const STYLE = `import { existsSync, readFileSync } from 'node:fs';
const [mode, ...fichiers] = process.argv.slice(2);
const marque = mode === 'lint' ? 'INUTILE' : 'MALFORME';
const rouges = fichiers.filter(f => existsSync(f) && readFileSync(f, 'utf8').includes(marque));
for (const f of rouges) console.error(\`\${f}:1 \${mode} — \${marque}\`);
process.exit(rouges.length ? 1 : 0);
`;
const FICHIERS = 'src/index.mjs test/mesure.test.mjs';

// La copie du ticket : les paquets portent leurs scripts de style, la racine le sien sur son
// fichier `racine.txt`, les turbo.json écrits, le tout commité.
function avecLeStyle(copie: string) {
  ecrire(path.join(copie, 'style.mjs'), STYLE);
  ecrire(path.join(copie, 'racine.txt'), 'rien\n');
  const racine = JSON.parse(readFileSync(path.join(copie, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  racine.scripts.lint = 'node style.mjs lint racine.txt';
  ecrire(path.join(copie, 'package.json'), json(racine));
  for (const [dossier, nom, champs] of [
    ['forms', '000-forms', {}],
    ['binder', '030-binder', { dependencies: { '000-forms': '*' } }],
  ] as const) {
    ecrire(
      path.join(copie, 'packages', dossier, 'package.json'),
      json({
        name: nom,
        type: 'module',
        scripts: {
          'test:unit': 'vitest run',
          lint: `node ../../style.mjs lint ${FICHIERS}`,
          'format:check': `node ../../style.mjs format ${FICHIERS}`,
        },
        ...champs,
      })
    );
  }
  ecrireTurbo(copie);
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', copie, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('add', '-A');
  git('commit', '-qm', 'style');
}

describe.runIf(canWrap)('le style des paquets au circuit', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  it('critères 4, 5, 12 — un constat de lint dans le code d’un paquet du plan revient au développeur, qui le lève : la relecture, sans arrêt de style', () => {
    const id = 'demo-style-code';
    avecLeStyle(ticket(id, '000-forms'));
    scenario(id, 'testwriter', `${ECRIT_ROUGE}passation 'Tests écrits, rouges.'\n`);
    scenario(
      id,
      'developpeur-1',
      `printf 'export const mesure = x => 2 * x; // INUTILE\\n' > $c/src/index.mjs\npassation 'Code écrit.'\n`
    );
    scenario(id, 'developpeur-2', `${CODE_JUSTE}passation 'Style levé.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'developpeur')).toBe(2);
    expect(sessions(id, 'testwriter')).toBe(1);
    // Le relevé que reçoit le développeur nomme la tâche du paquet, qui est du plan.
    const consigne = essai(id, 'developpeur-2.prompt');
    expect(consigne).toContain('000-forms#lint');
    expect(consigne).not.toContain('000-forms#format:check');
    expect(historique(id)).toContain('relecture');
    expect(etat(id)?.etape).toBe('integre');
  });

  it('critère 13 — un rouge de mise en forme dans un fichier de test revient au testwriter par le renvoi du développeur, comme un test rouge', () => {
    const id = 'demo-style-test';
    avecLeStyle(ticket(id, '000-forms'));
    scenario(
      id,
      'testwriter-1',
      `${ECRIT_ROUGE}printf '// MALFORME\\n' >> $c/test/mesure.test.mjs\npassation 'Tests écrits, rouges.'\n`
    );
    // Le développeur livre un code partiel : les contrôles sont rouges sur la mise en forme du test,
    // puis il renvoie ce rouge au testwriter (comme circuit.sessions.nuit.spec.ts, kgx.1).
    scenario(
      id,
      'developpeur-1',
      `printf 'export const mesure = x => (x === 2 ? 4 : 0);\\n' > $c/src/index.mjs\npassation 'Code écrit.'\n`
    );
    scenario(
      id,
      'developpeur-2',
      `passation 'Le rouge de mise en forme est dans le test de forms.'
fiche '{"statut":"BLOQUÉ","piece":"packages/forms/test/mesure.test.mjs:1","raison":"le test est mal formé.","renvoi":{"role":"testwriter"}}'
`
    );
    // Le testwriter remet le test en forme (vert sur le code partiel, accepté sans raison : il ne
    // porte pas le travail) et ajoute un test rouge, que sa fiche nomme dans `portent_le_travail`.
    // La fiche suit le schéma du circuit (aucune clé inconnue) : une clé étrangère la rendrait non
    // conforme, et le circuit relancerait le testwriter une troisième fois.
    scenario(
      id,
      'testwriter-2',
      `${ECRIT_ROUGE}cat >> $c/test/mesure.test.mjs <<'EOF'
it('critère 2 — mesure rend le double de trois', () => { expect(mesure(3)).toBe(6); });
EOF
passation 'Test remis en forme, un test rouge ajouté.'
fiche '{"statut":"FAIT","portent_le_travail":[{"fichier":"packages/forms/test/mesure.test.mjs","test":"critère 2 — mesure rend le double de trois"}]}'
`
    );
    scenario(id, 'developpeur-3', `${CODE_JUSTE}passation 'Code juste.'\n`);
    const r = circuit([id]);
    expect(r.status, sortie(r)).toBe(0);
    expect(sessions(id, 'testwriter')).toBe(2);
    // Le testwriter a reçu ce rouge nommé par sa tâche et son paquet, sans arrêt au superviseur.
    const consigne = essai(id, 'testwriter-2.prompt');
    expect(consigne).toContain('La sortie rouge des derniers contrôles');
    expect(consigne).toContain('000-forms#format:check');
    expect(commentaires(id).some(t => t.includes(' : arrêt '))).toBe(false);
    expect(etat(id)?.etape).toBe('integre');
  });

  it('critères 12 et 13 — un rouge de style d’un paquet hors du plan s’arrête au superviseur, le paquet et son hors-plan nommés', () => {
    const id = 'demo-style-hors-plan';
    const copie = ticket(id, '000-forms');
    avecLeStyle(copie);
    // Le lot ajoute à binder, hors du plan, un fichier qui rougit son lint.
    ecrire(path.join(copie, 'packages/binder/src/index.mjs'), '// INUTILE\n');
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id, '--depuis', 'developpeur', '--contexte', 'RENDU : le double.']);
    expect(r.status, sortie(r)).toBe(ARRETS.controles);
    const e = etat(id);
    expect(e).toMatchObject({ etape: 'controles', finale: true, raison: 'controles' });
    expect(e?.rapport).toContain('030-binder#lint');
    expect(e?.rapport).toContain('hors du plan du ticket (packages/forms)');
    expect(historique(id)).not.toContain('relecture');
  });

  it('critère 13 — un rouge de style d’un fichier de la racine s’arrête au superviseur : aucun paquet du plan ne le tient', () => {
    const id = 'demo-style-racine';
    const copie = ticket(id, '000-forms');
    avecLeStyle(copie);
    ecrire(path.join(copie, 'racine.txt'), 'INUTILE\n');
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id, '--depuis', 'developpeur', '--contexte', 'RENDU : le double.']);
    expect(r.status, sortie(r)).toBe(ARRETS.controles);
    expect(etat(id)?.rapport).toContain('//#lint');
    expect(etat(id)?.rapport).toContain('Aucun paquet du plan');
    expect(sessions(id, 'developpeur')).toBe(1);
    expect(historique(id)).not.toContain('relecture');
  });
});
