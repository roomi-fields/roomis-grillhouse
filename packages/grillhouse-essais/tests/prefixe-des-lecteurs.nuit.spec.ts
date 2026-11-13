// Chaque lecteur du préfixe des tickets qui lance git le prend dans la clé `issue-prefix` de
// `.beads/config.yaml` (`prefixe` de scripts/prefixe-des-tickets.mjs), jamais par
// `bd config get issue_prefix` (absent en CI) : le crochet un-commit-par-ticket, l'intégrateur appelé
// sans lot et nuit.sh, chacun lancé comme processus dans un dépôt d'essai. Un faux `bd` en tête du
// PATH note ses appels et échoue sur `config` : un lecteur qui lit encore le préfixe par bd le montre.
// Les cas de ticket.sh, qui ne demandent pas git, sont de jour (ticket-sh-prefixe.spec.ts).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CADRE } from './cadre.js';

const SCRIPTS = path.join(CADRE, 'scripts');
const CROCHET = path.join(SCRIPTS, 'un-commit-par-ticket.mjs');
const INTEGRER = path.join(SCRIPTS, 'integration/integrer.mjs');
const NUIT_SH = path.join(SCRIPTS, 'nuit.sh');

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'prefixe-des-lecteurs-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const AVEC_CLE = (valeur: string) => `issue-prefix: "${valeur}"\n`;
const SANS_CLE = '# issue-prefix: ""\n';
// Les deux refus de `prefixe`, qui nomment le fichier ou la clé.
const CLE_ABSENTE = /\.beads\/config\.yaml n'a pas la clé `issue-prefix`/;
const FICHIER_ABSENT = /\.beads\/config\.yaml manque/;

// Un dépôt d'essai (un commit par message de <messages>) dont `.beads/config.yaml` vaut <config>
// (absent quand null), et un faux bd : `create` rend <creation>, `config` échoue, `show` échoue
// (Beads ne répond pas), tout appel est noté dans <appels>.
function monde(config: string | null, messages: string[] = ['base'], creation = 'demo-7') {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  const appels = path.join(bin, 'appels');
  writeFileSync(
    path.join(bin, 'bd'),
    [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> '${appels}'`,
      'case "$1" in',
      '  config) echo "bd config appelé" >&2; exit 9;;',
      '  show) exit 1;;',
      `  create) echo ${creation};;`,
      "  list) echo '[]';;",
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 }
  );
  if (config !== null) {
    mkdirSync(path.join(racine, '.beads'));
    writeFileSync(path.join(racine, '.beads/config.yaml'), config);
  }
  const git = (...a: string[]) =>
    spawnSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    });
  git('init', '-q', '-b', 'main');
  messages.forEach((m, i) => {
    writeFileSync(path.join(racine, `f${i}.txt`), `${m}\n`);
    git('add', '-A');
    git('commit', '-q', '-m', m);
  });
  const lancer = (commande: string, args: string[]) =>
    spawnSync(commande, args, {
      cwd: racine,
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
  const lesAppels = () => {
    try {
      return readFileSync(appels, 'utf8').split('\n').filter(Boolean);
    } catch {
      return [];
    }
  };
  return { racine, bin, git, lancer, lesAppels };
}

describe('le crochet un-commit-par-ticket lit le préfixe dans .beads/config.yaml', () => {
  const message = (dossier: string, texte: string) => {
    const f = path.join(dossier, 'MSG');
    writeFileSync(f, texte);
    return f;
  };

  it('compte pour ticket un mot du préfixe de la clé : un ticket déjà livré est refusé, sans bd pour le préfixe', () => {
    const m = monde(AVEC_CLE('autre'), ['base', 'feat: un lot (autre-1)']);
    const r = m.lancer('node', [CROCHET, message(m.bin, 'fix: encore (autre-1)\n')]);
    expect(r.status, r.stderr).toBe(1);
    expect(r.stderr).toContain('autre-1 a déjà son commit');
    expect(m.lesAppels().filter(l => l.startsWith('config'))).toEqual([]);
  });

  it('laisse passer un titre qui ne nomme aucun ticket du préfixe de la clé', () => {
    const m = monde(AVEC_CLE('autre'), ['base', 'feat: un lot (demo-1)']);
    const r = m.lancer('node', [CROCHET, message(m.bin, 'fix: encore (demo-1)\n')]);
    expect(r.status, r.stderr).toBe(0);
  });

  it('refuse par le message nommé de prefixe quand la clé manque, au lieu de laisser passer tout commit', () => {
    const m = monde(SANS_CLE, ['base', 'feat: un lot (demo-1)']);
    const r = m.lancer('node', [CROCHET, message(m.bin, 'fix: encore (demo-1)\n')]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(CLE_ABSENTE);
  });

  it('refuse par le message nommé de prefixe, le fichier nommé, quand .beads/config.yaml manque', () => {
    const m = monde(null);
    const r = m.lancer('node', [CROCHET, message(m.bin, 'feat: x (demo-1)\n')]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(FICHIER_ABSENT);
  });
});

describe('l’intégrateur appelé sans lot reconnaît le lot sur main avec le préfixe de .beads/config.yaml', () => {
  const appel = (m: ReturnType<typeof monde>, ticket: string) => {
    const f = path.join(m.bin, 'msg');
    writeFileSync(f, `feat: x (${ticket})\n`);
    return m.lancer('node', [INTEGRER, '--ticket', ticket, '--message', f]);
  };

  it('sort à 0, rien fait, quand un commit de main livre le ticket sous le préfixe de la clé, bd sans appel de préfixe', () => {
    const m = monde(AVEC_CLE('autre'), ['base', 'feat(outil): le lot (autre-4)']);
    const r = appel(m, 'autre-4');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('déjà sur main');
    expect(m.lesAppels().filter(l => l.startsWith('config'))).toEqual([]);
  });

  it('garde le refus lot-absent quand main ne porte pas le lot, la clé étant là', () => {
    const m = monde(AVEC_CLE('autre'), ['base', 'feat: autre chose (autre-2)']);
    const r = appel(m, 'autre-4');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('lot-absent');
  });

  it('refuse par « ⛔ <message de prefixe> », code 1, quand la clé manque, jamais par lot-absent', () => {
    const m = monde(SANS_CLE, ['base', 'feat(outil): le lot (demo-4)']);
    const r = appel(m, 'demo-4');
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^⛔ \.beads\/config\.yaml n'a pas la clé `issue-prefix`/);
    expect(r.stdout).not.toContain('lot-absent');
  });

  it('refuse par le message de prefixe, le fichier nommé, quand .beads/config.yaml manque', () => {
    const m = monde(null);
    const r = appel(m, 'demo-4');
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^⛔ \.beads\/config\.yaml manque/);
  });
});

describe('nuit.sh lit le préfixe par prefixe, sans bd', () => {
  // Une nuit de trois outils faux dont la construction échoue : elle est rouge avant la passe, et
  // signale sa cause par un ticket neuf (bd create), que `signaler` titre alors.
  function nuit(config: string | null) {
    const m = monde(config, ['base'], 'autre-9');
    writeFileSync(
      path.join(m.racine, 'package.json'),
      JSON.stringify({ name: 'essai', private: true, workspaces: ['packages/*'] })
    );
    mkdirSync(path.join(m.racine, 'packages/grillhouse'), { recursive: true });
    writeFileSync(
      path.join(m.racine, 'packages/grillhouse/package.json'),
      JSON.stringify({
        name: '@roomi-fields/grillhouse',
        version: '0.0.0',
        scripts: { build: 'x' },
      })
    );
    m.git('add', '-A');
    m.git('commit', '-q', '-m', 'le paquet');
    for (const nom of ['npm', 'npx', 'turbo']) {
      writeFileSync(
        path.join(m.bin, nom),
        `#!/bin/sh\ncase " $* " in *" build "*|*" build:"*) echo 'construction refusée' >&2; exit 1;; esac\nexit 0\n`,
        { mode: 0o755 }
      );
    }
    writeFileSync(
      path.join(m.bin, 'node'),
      `#!/bin/sh\nif [ "\${1##*/}" = "grillhouse.mjs" ]; then exit 0; fi\nexec '${process.execPath}' "$@"\n`,
      { mode: 0o755 }
    );
    m.lancer('bash', [NUIT_SH]);
    const dossier = path.join(m.racine, '.git', 'nuit');
    const journal = readdirSync(dossier)
      .filter(f => f.endsWith('.log'))
      .map(f => readFileSync(path.join(dossier, f), 'utf8'))
      .join('\n');
    return { m, journal };
  }

  it('titre le ticket neuf sans le préfixe de la clé, bd sans appel de préfixe', () => {
    const { m, journal } = nuit(AVEC_CLE('autre'));
    const appels = m.lesAppels();
    expect(appels.some(l => l.startsWith('create '))).toBe(true);
    expect(
      appels.some(l => /^update autre-9 --title 9 — /.test(l)),
      appels.join('\n')
    ).toBe(true);
    expect(appels.filter(l => l.startsWith('config'))).toEqual([]);
    expect(journal).toContain('ticket autre-9');
  });

  it('écrit le message de prefixe dans le journal de la nuit sans renommer le ticket neuf quand la clé manque', () => {
    const { m, journal } = nuit(SANS_CLE);
    expect(journal).toMatch(CLE_ABSENTE);
    const appels = m.lesAppels();
    expect(appels.some(l => l.startsWith('create '))).toBe(true);
    expect(appels.filter(l => l.startsWith('update'))).toEqual([]);
  });
});
