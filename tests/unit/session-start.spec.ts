import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Ticket grillhouse-3uv.8.4: the index is for the roles that see the whole repository (charter,
// « L'index d'abord »); in an agent's copy (`.claude/worktrees/`), the session start asks neither
// to install nor to make the index of CodeGraph. In a project tree, it still does.
const SCRIPT = path.resolve(__dirname, '../../scripts/session-start.sh');
const BASH = execFileSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim();
const racine = mkdtempSync(path.join(tmpdir(), 'session-start-'));
afterAll(() => rmSync(racine, { recursive: true, force: true }));

// An executable stub in a PATH directory.
const stub = (bin: string, nom: string, corps: string) => {
  writeFileSync(path.join(bin, nom), `#!/bin/sh\n${corps}\n`);
  chmodSync(path.join(bin, nom), 0o755);
};

// A PATH holding the tools the script reads, with a codegraph or without one. The ticket tool is
// a stub with no ticket: the real one, run with the test root as its home, leaves a process that
// writes there while the root is removed.
const outils = (avecCodegraph: boolean) => {
  const bin = mkdtempSync(path.join(racine, 'bin-'));
  stub(bin, 'bd', 'echo "[]"');
  for (const outil of ['node', 'grep', 'sed', 'ls', 'basename', 'dirname', 'cat', 'git']) {
    const r = spawnSync('bash', ['-c', `command -v ${outil}`], { encoding: 'utf8' });
    if (r.status === 0) {
      symlinkSync(r.stdout.trim(), path.join(bin, outil));
    }
  }
  if (avecCodegraph) {
    stub(bin, 'codegraph', 'exit 0');
  }
  return bin;
};
const avec = outils(true);
const sans = outils(false);

// A project with its own git repository, and agent copies of it as the launcher makes them.
const projet = (nom: string) => {
  const p = path.join(racine, nom);
  mkdirSync(p, { recursive: true });
  writeFileSync(path.join(p, 'LISEZMOI'), 'projet');
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', p, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
  git('init', '-q');
  git('add', '.');
  git('commit', '-qm', 'init');
  const copie = (id: string) => {
    const c = path.join(p, '.claude/worktrees', id);
    git('worktree', 'add', '-q', '-b', `agent/${id}`, c);
    return c;
  };
  return { racine: p, copie };
};

const demarrer = (dir: string, bin: string) =>
  spawnSync(BASH, [SCRIPT], {
    encoding: 'utf8',
    env: { HOME: racine, PATH: bin, CLAUDE_PROJECT_DIR: dir },
  });

const p = projet('projet');
const dansUnDossierWorktrees = projet('worktrees/projet');

describe('the session start and the index of CodeGraph', () => {
  it('asks a project tree without index for the index of CodeGraph', () => {
    const r = demarrer(p.racine, avec);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("l'index CodeGraph");
  });
  it('asks a project tree without codegraph for the tool', () => {
    expect(demarrer(p.racine, sans).stdout).toContain("l'outil CodeGraph");
  });
  it('asks a project whose path holds a worktrees directory, outside .claude, for the index', () => {
    expect(demarrer(dansUnDossierWorktrees.racine, avec).stdout).toContain("l'index CodeGraph");
  });
  it('asks an agent copy without index neither for the index nor the tool of CodeGraph', () => {
    for (const id of ['grillhouse-1', 'proj-3uv.8.4']) {
      const c = p.copie(id);
      for (const bin of [avec, sans]) {
        const r = demarrer(c, bin);
        expect(r.status, `${id}: ${r.stderr}`).toBe(0);
        expect(r.stdout, id).not.toMatch(/CodeGraph|codegraph/);
      }
    }
  });
  it('asks the copy of a project in a worktrees directory neither for the index', () => {
    const c = dansUnDossierWorktrees.copie('demo-1');
    expect(demarrer(c, avec).stdout).not.toMatch(/CodeGraph|codegraph/);
  });
});

// Ticket grillhouse-3uv.27: the session start reads docs/agents/hors-cadre.txt as every check
// does (« <package> <reason> », first word = a directory under packages/ or src/), and refuses a
// line that names no directory, so that a typo does not pass in silence.
describe('the session start and the packages out of the frame', () => {
  const SCRIPTS = path.resolve(__dirname, '../../scripts');
  // A project with packages a, v1 and v10, none with its three documents, the frame's scripts
  // installed, and the given list out of the frame.
  const avecPaquets = (liste: string | null) => {
    const dir = mkdtempSync(path.join(racine, 'paquets-'));
    symlinkSync(SCRIPTS, path.join(dir, 'scripts'));
    for (const nom of ['a', 'v1', 'v10']) {
      mkdirSync(path.join(dir, 'packages', nom, 'src'), { recursive: true });
    }
    mkdirSync(path.join(dir, 'src', 'gele'), { recursive: true });
    if (liste !== null) {
      mkdirSync(path.join(dir, 'docs', 'agents'), { recursive: true });
      writeFileSync(path.join(dir, 'docs', 'agents', 'hors-cadre.txt'), liste);
    }
    const r = demarrer(dir, avec);
    expect(r.status, r.stderr).toBe(0);
    return r.stdout;
  };
  const docs = (nom: string) =>
    ['ARCHITECTURE', 'CADRE', 'INTERFACE'].map(d => `packages/${nom}/docs/${d}.md`);

  it('critère 5 — does not ask the three documents of a package out of the frame', () => {
    const sortie = avecPaquets('v1 version gelée\n');
    for (const d of docs('v1')) {
      expect(sortie).not.toContain(d);
    }
    for (const d of [...docs('a'), ...docs('v10')]) {
      expect(sortie).toContain(d);
    }
  });
  it('critère 5 — reads the first word as every check does: a tab or a bare name', () => {
    for (const liste of ['v1\tversion gelée\n', 'v1\n', 'v1   version gelée\n']) {
      const sortie = avecPaquets(liste);
      for (const d of docs('v1')) {
        expect(sortie, JSON.stringify(liste)).not.toContain(d);
      }
      for (const d of docs('v10')) {
        expect(sortie, JSON.stringify(liste)).toContain(d);
      }
    }
  });
  it('critère 6 — without hors-cadre.txt, asks the three documents of every package', () => {
    const sortie = avecPaquets(null);
    for (const d of [...docs('a'), ...docs('v1'), ...docs('v10')]) {
      expect(sortie).toContain(d);
    }
  });
  it('critère 6 — a blank line or a line starting with # leaves out no package', () => {
    const sortie = avecPaquets('# v1 version gelée\n\n   \n#v10\n');
    for (const d of [...docs('a'), ...docs('v1'), ...docs('v10')]) {
      expect(sortie).toContain(d);
    }
    expect(sortie).not.toMatch(/hors-cadre\.txt/);
  });
  it('critère 7 — a line naming no directory under packages/ or src/ is reported', () => {
    const sortie = avecPaquets('v1 version gelée\nv2 faute de frappe\n');
    expect(sortie).toMatch(/hors-cadre\.txt/);
    expect(sortie).toMatch(/\bv2\b/);
  });
  it('critère 7 — a line naming a directory under src/ is not reported', () => {
    const sortie = avecPaquets('gele module gelé\nv1 version gelée\n');
    expect(sortie).not.toMatch(/hors-cadre\.txt/);
  });
});

// Ticket grillhouse-3uv.31: the project declares its own session-start check in the grillhouse
// section of its package.json (`"grillhouse": { "demarrage": "<npm script>" }`); the session start
// plays `npm run --silent <script>` at the root, within 10 s, and each non-blank line it writes
// joins the list « Pas encore renseignés ».
describe('the session start plays the check the project declares', () => {
  // The ticket tool is a stub with no ticket; every other tool, npm included, is the machine's.
  const bin = mkdtempSync(path.join(racine, 'bin-demarrage-'));
  stub(bin, 'bd', 'echo "[]"');
  const PATH = `${bin}:${process.env.PATH ?? ''}`;
  const ailleurs = mkdtempSync(path.join(racine, 'ailleurs-'));

  // A project whose package.json holds the given scripts and grillhouse section; the session
  // starts from another directory, so that the check runs at the root only if it is sent there.
  const lancer = (scripts: Record<string, string>, grillhouse?: Record<string, unknown>) => {
    const dir = mkdtempSync(path.join(racine, 'demarrage-'));
    mkdirSync(path.join(dir, 'node_modules'));
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'demo',
        version: '1.0.0',
        scripts,
        ...(grillhouse ? { grillhouse } : {}),
      })
    );
    const debut = Date.now();
    const r = spawnSync(BASH, [SCRIPT], {
      cwd: ailleurs,
      encoding: 'utf8',
      timeout: 30_000,
      env: { HOME: racine, PATH, CLAUDE_PROJECT_DIR: dir },
    });
    expect(r.error, 'la séance a gelé').toBeUndefined();
    expect(r.status, r.stderr).toBe(0);
    return { sortie: r.stdout, dir, duree: Date.now() - debut };
  };
  // The items of the list « Pas encore renseignés », one per « - » line.
  const elements = (sortie: string) => {
    const bloc = sortie.split('Pas encore renseignés :\n')[1] ?? '';
    return bloc
      .split('\n')
      .filter(l => l.startsWith('- '))
      .map(l => l.slice(2));
  };

  it('critère 1 — each line of the declared script joins the list as an item to deal with', () => {
    const { sortie } = lancer(
      { verifier: 'echo "le sous-module natif à vérifier"; echo "le corpus contre natif"' },
      { demarrage: 'verifier' }
    );
    const liste = elements(sortie);
    expect(liste).toContain('le sous-module natif à vérifier');
    expect(liste).toContain('le corpus contre natif');
    // the frame's own items stay in the list
    expect(liste).toContain('docs/ARCHITECTURE.md');
  });
  it('critère 1 — another script name, blank lines left out, npm stays silent', () => {
    const { sortie } = lancer(
      { 'controle:ouverture': 'echo; echo "  "; echo "une seule ligne"; echo' },
      { demarrage: 'controle:ouverture' }
    );
    const liste = elements(sortie);
    expect(liste).toContain('une seule ligne');
    expect(liste.filter(l => l.trim() === '')).toEqual([]);
    // `npm run --silent`: no banner « > demo@1.0.0 controle:ouverture » in the list
    expect(sortie).not.toMatch(/controle:ouverture\n|^> /m);
  });
  it('critère 1 — the script runs at the root of the project', () => {
    const { sortie, dir } = lancer({ ou: 'echo "racine: $(pwd)"' }, { demarrage: 'ou' });
    expect(elements(sortie)).toContain(`racine: ${dir}`);
  });
  it('critère 2 — a failing script adds a line that says so, and the session start goes on', () => {
    const { sortie } = lancer({ casse: 'echo "avant la panne"; exit 3' }, { demarrage: 'casse' });
    const ligne = sortie.split('\n').find(l => /casse/.test(l) && /échou/i.test(l));
    expect(ligne, sortie).toBeDefined();
    expect(elements(sortie)).toContain('docs/ARCHITECTURE.md');
    expect(sortie).toContain('À brancher');
  });
  it('critère 2 — a key naming a script absent from package.json fails the same way', () => {
    const { sortie } = lancer({ autre: 'echo autre' }, { demarrage: 'absent' });
    const ligne = sortie.split('\n').find(l => /absent/.test(l) && /échou/i.test(l));
    expect(ligne, sortie).toBeDefined();
    expect(elements(sortie)).toContain('docs/ARCHITECTURE.md');
  });
  it('critère 3 — a script still running after 10 s is stopped, with a line that says so', () => {
    const { sortie, duree } = lancer(
      { lent: 'echo "début"; sleep 40; echo "fin"' },
      { demarrage: 'lent' }
    );
    expect(duree).toBeLessThan(20_000);
    expect(sortie).not.toContain('- fin');
    const ligne = sortie.split('\n').find(l => /lent/.test(l) && /interrompu|10 s/i.test(l));
    expect(ligne, sortie).toBeDefined();
    expect(elements(sortie)).toContain('docs/ARCHITECTURE.md');
  }, 40_000);
  it('critère 4 — without the key, the session start is unchanged', () => {
    const scripts = { verifier: 'echo "le sous-module natif à vérifier"' };
    const sansCle = lancer(scripts).sortie;
    const sansScript = lancer({}).sortie;
    expect(sansCle).not.toContain('le sous-module natif à vérifier');
    expect(sansCle.replaceAll(/demarrage-\w+/g, 'X')).toBe(
      sansScript.replaceAll(/demarrage-\w+/g, 'X')
    );
    // another grillhouse key alone changes nothing either
    expect(lancer(scripts, { roles: 'x' }).sortie).not.toContain('le sous-module natif à vérifier');
  });
  it('critère 4 — a declared script that writes only blank lines adds nothing', () => {
    const vide = lancer({ rien: 'echo; echo "   "' }, { demarrage: 'rien' }).sortie;
    const sansCle = lancer({ rien: 'echo; echo "   "' }).sortie;
    expect(vide.replaceAll(/demarrage-\w+/g, 'X')).toBe(sansCle.replaceAll(/demarrage-\w+/g, 'X'));
  });
  // Arbitrage of the supervisor: the failure or stop line goes in the same report as the script's
  // lines, after them.
  const apres = (sortie: string, avant: string, motif: RegExp) => {
    const lignes = sortie.split('\n');
    const i = lignes.indexOf(`- ${avant}`);
    const j = lignes.findIndex(l => motif.test(l));
    expect(i, sortie).toBeGreaterThanOrEqual(0);
    expect(j, sortie).toBeGreaterThan(i);
  };
  it('critère 7 — the lines written before a failure stay, followed by the failure line', () => {
    const { sortie } = lancer(
      { panne: 'echo "premier constat"; echo "second constat"; exit 1' },
      { demarrage: 'panne' }
    );
    const liste = elements(sortie);
    expect(liste).toContain('premier constat');
    expect(liste).toContain('second constat');
    apres(sortie, 'second constat', /panne.*échou|échou.*panne/i);
  });
  it('critère 7 — the lines written before a stop stay, followed by the stop line', () => {
    const { sortie } = lancer(
      { attente: 'echo "constat avant attente"; sleep 40; echo "jamais"' },
      { demarrage: 'attente' }
    );
    expect(elements(sortie)).toContain('constat avant attente');
    expect(sortie).not.toContain('jamais');
    apres(sortie, 'constat avant attente', /attente.*interrompu|interrompu.*attente/i);
  }, 40_000);
  // Criterion 9: a value of grillhouse.demarrage that is not a non-empty string runs nothing, and
  // a line naming the key says so. Each npm script the value could name once turned into a string
  // leaves a mark if it runs.
  const marque = path.join(racine, 'demarrage-joue');
  const marqueurs = Object.fromEntries(
    ['false', 'true', '0', '42', '', '  ', 'x', '[object Object]'].map(n => [
      n,
      `touch ${marque}; echo "joué ${n}"`,
    ])
  );
  // Arbitrage of the supervisor: a string made only of spaces is signalled like the empty string.
  for (const valeur of [false, true, 0, 42, '', '  ', ['x'], { script: 'x' }]) {
    it(`critère 9 — the value ${JSON.stringify(valeur)} runs nothing and adds a line that says so`, () => {
      rmSync(marque, { force: true });
      const { sortie } = lancer(marqueurs, { demarrage: valeur });
      expect(existsSync(marque), sortie).toBe(false);
      expect(sortie).not.toContain('joué');
      const ligne = sortie.split('\n').find(l => /grillhouse\.demarrage/.test(l));
      expect(ligne, sortie).toBeDefined();
      // the session start goes on
      expect(elements(sortie)).toContain('docs/ARCHITECTURE.md');
    });
  }
  // Arbitrage of the supervisor: null is worth an absent key.
  it('critère 9 — the value null is worth an absent key: nothing runs, the start is unchanged', () => {
    rmSync(marque, { force: true });
    const avecNull = lancer(marqueurs, { demarrage: null }).sortie;
    expect(existsSync(marque), avecNull).toBe(false);
    expect(avecNull).not.toMatch(/grillhouse\.demarrage/);
    const sansCle = lancer(marqueurs).sortie;
    expect(avecNull.replaceAll(/demarrage-\w+/g, 'X')).toBe(
      sansCle.replaceAll(/demarrage-\w+/g, 'X')
    );
  });
  it('critère 9 — a non-empty string adds no line about the value', () => {
    const { sortie } = lancer({ ok: 'echo "constat"' }, { demarrage: 'ok' });
    expect(elements(sortie)).toContain('constat');
    expect(sortie).not.toMatch(/grillhouse\.demarrage/);
  });

  // Criterion 8: in an agent's copy (the same detection as for the index of CodeGraph: a git
  // worktree under .claude/worktrees/), the project's check is not played.
  const projetDeclare = (nom: string) => {
    const dir = path.join(racine, nom);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'demo',
        version: '1.0.0',
        scripts: { verifier: `touch "${marque}"; echo "contrôle du projet joué"` },
        grillhouse: { demarrage: 'verifier' },
      })
    );
    const git = (...a: string[]) =>
      execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]);
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'init');
    const copie = (id: string) => {
      const c = path.join(dir, '.claude/worktrees', id);
      git('worktree', 'add', '-q', '-b', `agent/${id}`, c);
      mkdirSync(path.join(c, 'node_modules'));
      return c;
    };
    mkdirSync(path.join(dir, 'node_modules'));
    return { racine: dir, copie };
  };
  const ouvrir = (dir: string) => {
    rmSync(marque, { force: true });
    const r = spawnSync(BASH, [SCRIPT], {
      cwd: ailleurs,
      encoding: 'utf8',
      timeout: 30_000,
      env: { HOME: racine, PATH, CLAUDE_PROJECT_DIR: dir },
    });
    expect(r.error, 'la séance a gelé').toBeUndefined();
    expect(r.status, r.stderr).toBe(0);
    return { sortie: r.stdout, joue: existsSync(marque) };
  };
  it('critère 8 — in an agent copy, the project check is not played', () => {
    const projet8 = projetDeclare('controle-copie');
    for (const id of ['grillhouse-3uv.31', 'demo-7']) {
      const { sortie, joue } = ouvrir(projet8.copie(id));
      expect(joue, `${id}\n${sortie}`).toBe(false);
      expect(sortie, id).not.toContain('contrôle du projet joué');
      expect(sortie, id).not.toMatch(/grillhouse\.demarrage/);
    }
  });
  it('critère 8 — the project tree of the same project still plays it', () => {
    const { sortie, joue } = ouvrir(projetDeclare('controle-arbre').racine);
    expect(joue, sortie).toBe(true);
    expect(elements(sortie)).toContain('contrôle du projet joué');
  });
  it('critère 8 — a project under a .claude/worktrees path that is no git worktree plays it', () => {
    // the detection is the CodeGraph one: the path alone does not make an agent copy
    const { sortie, joue } = ouvrir(projetDeclare('hote/.claude/worktrees/projet').racine);
    expect(joue, sortie).toBe(true);
    expect(elements(sortie)).toContain('contrôle du projet joué');
  });
  it('critère 6 — the session start describes the key grillhouse.demarrage', () => {
    const texte = readFileSync(SCRIPT, 'utf8');
    const commentaires = texte
      .split('\n')
      .filter(l => l.trimStart().startsWith('#'))
      .join('\n');
    expect(commentaires).toContain('grillhouse.demarrage');
    expect(commentaires).toMatch(/10 s/);
  });
});
