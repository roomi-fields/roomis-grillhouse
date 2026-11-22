// Le verdict durable de la nuit d'un projet (scripts/verdict-de-la-nuit.mjs) : la passe de nuit le
// note en fin de nuit sous `<dossier git commun>/nuit/`, le panneau le lit sans serveur. `vert`
// quand la passe sort 0, `rouge` pour tout code autre que 0 et 75 (un code nul compris), rien pour
// 75 (à repasser), qui laisse le verdict précédent ; une lecture qui échoue ne rend rien.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

type Verdict = 'vert' | 'rouge' | null;
let noterLeVerdict: (commun: string, code: number) => Verdict;
let lireLeVerdict: (commun: string) => Verdict;
// Le module se charge ici, non en tête : sans lui, chaque test échoue au lieu que le fichier
// ne se charge pas.
beforeEach(async () => {
  ({ lireLeVerdict, noterLeVerdict } =
    (await import('../../scripts/verdict-de-la-nuit.mjs')) as unknown as {
      lireLeVerdict: typeof lireLeVerdict;
      noterLeVerdict: typeof noterLeVerdict;
    });
});

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'verdict-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let n = 0;
// Le dossier git commun d'un projet d'essai, sans dossier `nuit/` encore.
const commun = () => {
  const d = path.join(ESSAIS, `projet-${n++}`, '.git');
  mkdirSync(d, { recursive: true });
  return d;
};

describe('le verdict de la nuit, noté en fin de nuit', () => {
  it('une passe qui sort 0 laisse le verdict vert', () => {
    const c = commun();
    noterLeVerdict(c, 0);
    expect(lireLeVerdict(c)).toBe('vert');
  });

  it('une passe qui sort 1 laisse le verdict rouge', () => {
    const c = commun();
    noterLeVerdict(c, 1);
    expect(lireLeVerdict(c)).toBe('rouge');
  });

  it('tout code autre que 0 et 75 est rouge (2, 124, 137)', () => {
    for (const code of [2, 124, 137]) {
      const c = commun();
      noterLeVerdict(c, code);
      expect(lireLeVerdict(c), String(code)).toBe('rouge');
    }
  });

  it('une passe sans code (échec sans code de sortie) est rouge', () => {
    for (const code of [null, undefined]) {
      const c = commun();
      noterLeVerdict(c, code as unknown as number);
      expect(lireLeVerdict(c), String(code)).toBe('rouge');
    }
  });

  it('une nuit à repasser (75) n’écrit aucun verdict quand il n’y en avait pas', () => {
    const c = commun();
    noterLeVerdict(c, 75);
    expect(lireLeVerdict(c)).toBeNull();
    expect(readdirSync(c)).toEqual([]);
  });

  it('une nuit à repasser (75) laisse le verdict rouge précédent', () => {
    const c = commun();
    noterLeVerdict(c, 1);
    noterLeVerdict(c, 75);
    expect(lireLeVerdict(c)).toBe('rouge');
  });

  it('une nuit à repasser (75) laisse le verdict vert précédent', () => {
    const c = commun();
    noterLeVerdict(c, 0);
    noterLeVerdict(c, 75);
    expect(lireLeVerdict(c)).toBe('vert');
  });

  it('une nuit jouée plusieurs fois laisse le verdict de la dernière', () => {
    const c = commun();
    noterLeVerdict(c, 1);
    noterLeVerdict(c, 0);
    expect(lireLeVerdict(c)).toBe('vert');
    noterLeVerdict(c, 1);
    expect(lireLeVerdict(c)).toBe('rouge');
  });
});

describe('le verdict d’un projet survit aux autres nuits', () => {
  it('le rouge d’un projet reste quand un autre projet joue sa nuit, verte ou rouge', () => {
    const a = commun();
    const b = commun();
    noterLeVerdict(a, 1);
    noterLeVerdict(b, 0);
    noterLeVerdict(b, 1);
    noterLeVerdict(b, 0);
    expect(lireLeVerdict(a)).toBe('rouge');
    expect(lireLeVerdict(b)).toBe('vert');
  });

  it('chaque lecture repart du disque : le verdict se relit tel quel, sans nouvelle écriture', () => {
    const c = commun();
    noterLeVerdict(c, 1);
    expect(lireLeVerdict(c)).toBe('rouge');
    expect(lireLeVerdict(c)).toBe('rouge');
  });

  it('un projet sans nuit jouée n’a aucun verdict', () => {
    expect(lireLeVerdict(commun())).toBeNull();
  });
});

describe('un verdict qui ne se lit pas', () => {
  it('un dossier commun absent ne rend aucun verdict et ne lève pas', () => {
    expect(lireLeVerdict(path.join(ESSAIS, 'absent', '.git'))).toBeNull();
  });

  it('un dossier commun nul ne rend aucun verdict et ne lève pas', () => {
    expect(lireLeVerdict(null as unknown as string)).toBeNull();
  });

  it('un fichier de verdict illisible (contenu étranger) ne rend aucun verdict', () => {
    const c = commun();
    noterLeVerdict(c, 1);
    const dossier = path.join(c, 'nuit');
    for (const f of readdirSync(dossier)) {
      writeFileSync(path.join(dossier, f), '\u0000{pas un verdict');
    }
    expect(lireLeVerdict(c)).toBeNull();
  });

  it('un fichier de verdict remplacé par un dossier ne rend aucun verdict et ne lève pas', () => {
    const c = commun();
    noterLeVerdict(c, 0);
    const dossier = path.join(c, 'nuit');
    for (const f of readdirSync(dossier)) {
      rmSync(path.join(dossier, f));
      mkdirSync(path.join(dossier, f));
    }
    expect(lireLeVerdict(c)).toBeNull();
  });
});

// Le verdict à deux parts : la nuit de Grillhouse se joue sur deux machines, la part de PC2
// (les tranches du flux de nuit, que PC3 lit par `gh`) et la part de PC3 (les tests du poste) ;
// `noterLeVerdict(commun, code, part)` note une part (`pc3` quand elle n'est pas nommée, la part de
// la machine qui joue), `lireLeVerdict` rend le verdict des deux, `lireLesParts` chacune.
describe('le verdict de la nuit tient compte des deux parts', () => {
  type Part = 'pc2' | 'pc3';
  type Parts = { pc2: Verdict; pc3: Verdict };
  const noter = async (c: string, code: number, part: Part) => {
    const m = (await import('../../scripts/verdict-de-la-nuit.mjs')) as unknown as {
      noterLeVerdict: (commun: string, code: number, part: Part) => Verdict;
    };
    return m.noterLeVerdict(c, code, part);
  };
  const parts = async (c: string) => {
    const m = (await import('../../scripts/verdict-de-la-nuit.mjs')) as unknown as {
      lireLesParts: (commun: string) => Parts;
    };
    return m.lireLesParts(c);
  };

  it('la part de PC2 rouge rend la nuit rouge, même quand la part de PC3 est verte', async () => {
    const c = commun();
    noterLeVerdict(c, 0);
    await noter(c, 1, 'pc2');
    expect(lireLeVerdict(c)).toBe('rouge');
  });

  it('la part de PC3 rouge rend la nuit rouge, même quand la part de PC2 est verte', async () => {
    const c = commun();
    await noter(c, 0, 'pc2');
    noterLeVerdict(c, 1);
    expect(lireLeVerdict(c)).toBe('rouge');
  });

  it('la nuit est verte quand les deux parts le sont', async () => {
    const c = commun();
    await noter(c, 0, 'pc2');
    noterLeVerdict(c, 0);
    expect(lireLeVerdict(c)).toBe('vert');
  });

  it('une part de PC2 verte seule, sans nuit de PC3 encore jouée, donne un verdict vert', async () => {
    const c = commun();
    await noter(c, 0, 'pc2');
    expect(lireLeVerdict(c)).toBe('vert');
  });

  it('la part de PC2 relevée verte lève le rouge de la nuit précédente, la part de PC3 verte', async () => {
    const c = commun();
    noterLeVerdict(c, 0);
    await noter(c, 1, 'pc2');
    await noter(c, 0, 'pc2');
    expect(lireLeVerdict(c)).toBe('vert');
  });

  it('une part à repasser (75) laisse le verdict précédent de cette part, l’autre intacte', async () => {
    const c = commun();
    await noter(c, 1, 'pc2');
    noterLeVerdict(c, 0);
    await noter(c, 75, 'pc2');
    expect(await parts(c)).toEqual({ pc2: 'rouge', pc3: 'vert' });
    expect(lireLeVerdict(c)).toBe('rouge');
  });

  it('chaque part se lit à part, null tant qu’elle n’a pas joué', async () => {
    const c = commun();
    expect(await parts(c)).toEqual({ pc2: null, pc3: null });
    await noter(c, 0, 'pc2');
    expect(await parts(c)).toEqual({ pc2: 'vert', pc3: null });
    noterLeVerdict(c, 1);
    expect(await parts(c)).toEqual({ pc2: 'vert', pc3: 'rouge' });
  });

  it('une part illisible ne rend aucun verdict pour elle et ne lève pas', async () => {
    const c = commun();
    await noter(c, 0, 'pc2');
    for (const f of readdirSync(path.join(c, 'nuit'))) {
      writeFileSync(path.join(c, 'nuit', f), '\u0000{pas un verdict');
    }
    expect(lireLeVerdict(c)).toBeNull();
    expect(await parts(c)).toEqual({ pc2: null, pc3: null });
  });
});
