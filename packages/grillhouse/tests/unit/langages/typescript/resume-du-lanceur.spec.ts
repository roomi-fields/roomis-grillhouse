// Le résumé d'un lancement de Turborepo (`--summarize`) se lit et se range une seule fois, dans le
// module typescript, qui pilote Turborepo ; la jointure le sert aux modules cargo et python (un
// membre de `Langage`, scripts/jointure.d.ts). Un lancement par `lancerLesTaches`
// (scripts/taches-du-graphe.mjs) en demande toujours le résumé, et nomme chaque tâche rouge.
// Joué contre le faux Turborepo (../../faux-turbo.ts).
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import typescript from '../../../../scripts/langages/typescript/index.mjs';
import { lancerLesTaches } from '../../../../scripts/taches-du-graphe.mjs';
import { appelsDeTurbo, installerFauxTurbo } from '../../faux-turbo.js';

const PAQUET = path.resolve(__dirname, '../../../..');
// Les membres du module, lus à l'appel : leur absence rougit les tests qui les appellent, sans
// empêcher le fichier de se charger.
type Membres = {
  lireLesResumes: (
    dossier: string
  ) => { tache: string; tests: boolean; code: number | null; cache: string | null }[];
  garderLesResumes: (
    racine: string,
    avant: Set<string>,
    env: NodeJS.ProcessEnv
  ) => { tache: string; code: number | null }[];
  resumesDuLancement: (racine: string) => Set<string>;
};
const module = () => typescript as unknown as Membres;
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'resume-du-lanceur-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
let turbo: string;
beforeAll(() => {
  turbo = path.join(installerFauxTurbo(ESSAIS), 'turbo');
});

const dossier = (nom: string) => mkdtempSync(path.join(ESSAIS, `${nom}-`));
const resume = (taches: unknown[]) => JSON.stringify({ tasks: taches });
const tache = (id: string, extra: Record<string, unknown> = {}) => {
  const [paquet, script] = id.split('#');
  return {
    taskId: id,
    task: script,
    package: paquet,
    directory: `crates/${paquet}`,
    logFile: `crates/${paquet}/.turbo/turbo-${script}.log`,
    ...extra,
  };
};

describe('la lecture du résumé de Turborepo', () => {
  it('lit chaque tâche du dossier de résultats, dans l’ordre des résumés', () => {
    const d = dossier('lecture');
    mkdirSync(path.join(d, 'turbo'));
    writeFileSync(
      path.join(d, 'turbo', 'a.json'),
      resume([tache('x#build', { execution: { exitCode: 1 }, cache: { status: 'MISS' } })])
    );
    writeFileSync(
      path.join(d, 'turbo', 'b.json'),
      resume([tache('y#test:unit', { execution: { exitCode: 0 }, cache: { status: 'HIT' } })])
    );
    expect(
      module()
        .lireLesResumes(d)
        .map(t => [t.tache, t.tests, t.code, t.cache])
    ).toEqual([
      ['x#build', false, 1, 'MISS'],
      ['y#test:unit', true, 0, 'HIT'],
    ]);
  });

  it('un dossier sans résumé ne donne aucune tâche', () => {
    expect(module().lireLesResumes(dossier('vide'))).toEqual([]);
  });
});

describe('le rangement du résumé de Turborepo', () => {
  const racineAvecResume = (nom: string) => {
    const racine = dossier(nom);
    mkdirSync(path.join(racine, '.turbo', 'runs'), { recursive: true });
    return racine;
  };

  it('range dans le dossier de résultats le résumé neuf, et le retire de `.turbo/runs`', () => {
    const racine = racineAvecResume('range');
    const resultats = dossier('resultats');
    writeFileSync(path.join(racine, '.turbo/runs/neuf.json'), resume([tache('a#test:unit')]));
    module().garderLesResumes(racine, new Set(), { GRILLHOUSE_RESULTATS: resultats });
    expect(
      module()
        .lireLesResumes(resultats)
        .map(t => t.tache)
    ).toEqual(['a#test:unit']);
    expect(existsSync(path.join(racine, '.turbo/runs'))).toBe(false);
  });

  it('laisse en place un résumé d’avant le lancement', () => {
    const racine = racineAvecResume('avant');
    const resultats = dossier('resultats');
    writeFileSync(path.join(racine, '.turbo/runs/ancien.json'), resume([tache('a#build')]));
    writeFileSync(path.join(racine, '.turbo/runs/neuf.json'), resume([tache('b#test:unit')]));
    module().garderLesResumes(racine, new Set(['ancien.json']), {
      GRILLHOUSE_RESULTATS: resultats,
    });
    expect(readdirSync(path.join(racine, '.turbo/runs'))).toEqual(['ancien.json']);
    expect(
      module()
        .lireLesResumes(resultats)
        .map(t => t.tache)
    ).toEqual(['b#test:unit']);
  });

  it('sans dossier de résultats, retire le résumé neuf sans le garder', () => {
    const racine = racineAvecResume('sans');
    writeFileSync(path.join(racine, '.turbo/runs/neuf.json'), resume([tache('a#test:unit')]));
    module().garderLesResumes(racine, new Set(), {});
    expect(existsSync(path.join(racine, '.turbo/runs'))).toBe(false);
  });

  it('nomme les résumés présents avant un lancement, aucun sans `.turbo/runs`', () => {
    const racine = racineAvecResume('presents');
    writeFileSync(path.join(racine, '.turbo/runs/un.json'), resume([]));
    writeFileSync(path.join(racine, '.turbo/runs/deux.json'), resume([]));
    expect([...module().resumesDuLancement(racine)].sort()).toEqual(['deux.json', 'un.json']);
    expect([...module().resumesDuLancement(dossier('nu'))]).toEqual([]);
  });
});

describe('la lecture du résumé vit une seule fois, au module typescript', () => {
  const lire = (f: string) => readFileSync(path.join(PAQUET, f), 'utf8');

  it('aucun verdict n’en garde une copie, et le noyau n’a plus de module du résumé', () => {
    for (const f of ['typescript', 'cargo', 'python']) {
      expect(lire(`scripts/langages/${f}/verdict.mjs`), f).not.toMatch(
        /function (lireResumes|lireLesResumes|garderLesResumes)/
      );
    }
    expect(existsSync(path.join(PAQUET, 'scripts/resume-turbo.mjs'))).toBe(false);
  });

  it('les verdicts de cargo et de python prennent leurs tâches du service du noyau', () => {
    for (const f of ['cargo', 'python']) {
      expect(lire(`scripts/langages/${f}/verdict.mjs`), f).toMatch(
        /tachesDuVerdict[\s\S]*services-du-noyau\.mjs/
      );
    }
  });

  it('les modules cargo et python ne lisent pas le résumé eux-mêmes', () => {
    for (const langage of ['cargo', 'python']) {
      const texte = lire(`scripts/langages/${langage}/verdict.mjs`);
      expect(texte, langage).not.toMatch(/\.turbo|'turbo'/);
    }
  });
});

describe('le lancement des tâches demande le résumé', () => {
  const lancer = (racine: string, env: NodeJS.ProcessEnv) => {
    const journal = path.join(racine, 'journal');
    writeFileSync(journal, '');
    const code = lancerLesTaches({
      outil: turbo,
      racine,
      taches: ['test:unit'],
      noms: ['a'],
      env: {
        ...process.env,
        FAUX_TURBO_JOURNAL: journal,
        FAUX_TURBO_RESUME: resume([tache('a#test:unit', { cache: { status: 'HIT' } })]),
        ...env,
      },
    });
    return { code, appels: appelsDeTurbo(journal) };
  };

  it('avec un dossier de résultats, passe --summarize et range le résumé dans ce dossier', () => {
    const racine = dossier('avec');
    const resultats = dossier('resultats');
    const r = lancer(racine, { GRILLHOUSE_RESULTATS: resultats });
    expect(r.code).toBe(0);
    expect(r.appels[0]!.args).toContain('--summarize');
    expect(
      module()
        .lireLesResumes(resultats)
        .map(t => [t.tache, t.cache])
    ).toEqual([['a#test:unit', 'HIT']]);
    expect(existsSync(path.join(racine, '.turbo/runs'))).toBe(false);
  });

  it('sans dossier de résultats, ne laisse aucun résumé sous `.turbo/runs`', () => {
    const racine = dossier('sans');
    const r = lancer(racine, { GRILLHOUSE_RESULTATS: '' });
    expect(r.code).toBe(0);
    const runs = path.join(racine, '.turbo/runs');
    expect(existsSync(runs) ? readdirSync(runs) : []).toEqual([]);
  });

  it('rouge, nomme chaque tâche dont le code n’est pas 0, même sans dossier de résultats', () => {
    const racine = dossier('rouge');
    const journal = path.join(racine, 'journal');
    writeFileSync(journal, '');
    const lignes: string[] = [];
    const code = lancerLesTaches({
      outil: turbo,
      racine,
      taches: ['test:unit'],
      env: {
        ...process.env,
        GRILLHOUSE_RESULTATS: '',
        FAUX_TURBO_JOURNAL: journal,
        FAUX_TURBO_CODE: '1',
        FAUX_TURBO_RESUME: resume([
          tache('a#test:unit', { execution: { exitCode: 0 } }),
          tache('b#test:unit', { execution: { exitCode: 1 } }),
          tache('c#test:unit', {}),
        ]),
      },
      dire: l => lignes.push(l),
    });
    expect(code).toBe(1);
    expect(appelsDeTurbo(journal)[0]!.args).toContain('--summarize');
    expect(lignes).toEqual(['⛔ b#test:unit (code 1)', '⛔ c#test:unit (code absent)']);
  });

  it('garde les résumés d’avant le lancement, et rend le code de l’outil', () => {
    const racine = dossier('avant');
    mkdirSync(path.join(racine, '.turbo/runs'), { recursive: true });
    writeFileSync(path.join(racine, '.turbo/runs/ancien.json'), resume([]));
    const r = lancer(racine, { GRILLHOUSE_RESULTATS: dossier('resultats'), FAUX_TURBO_CODE: '1' });
    expect(r.code).toBe(1);
    expect(readdirSync(path.join(racine, '.turbo/runs'))).toEqual(['ancien.json']);
  });
});
