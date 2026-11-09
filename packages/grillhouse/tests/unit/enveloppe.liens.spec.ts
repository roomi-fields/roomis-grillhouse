// L'enveloppe monte la cible réelle d'un lien symbolique, comme Flatpak (`--filesystem` monte la
// cible réelle et garde le lien) : un magasin, une lecture ou une sortie écrite qui est un lien, ou
// dont un composant intermédiaire en est un, se monte à son chemin réel final, jamais à celui du
// lien (bwrap : « Can't bind mount … Unable to mount source on destination »). Chaque lien de la
// chaîne qu'un dossier vidé de la maison cache est refait en `--symlink`, par le mécanisme des
// montages de la séance. Un lien dont la chaîne casse n'est pas monté et ne lève rien.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { plan } from '../../scripts/enveloppe/enveloppe.mjs';

const pairs = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 1] ?? ''] : []));
// Les destinations (second chemin) de chaque montage d'un genre.
const destinations = (args: string[], flag: string) =>
  args.flatMap((a, i) => (a === flag ? [args[i + 2] ?? ''] : []));
const tous = (args: string[]) => [
  ...destinations(args, '--bind'),
  ...destinations(args, '--ro-bind'),
  ...destinations(args, '--tmpfs').slice(0, 0),
];

interface Disque {
  presents: string[];
  liens: Record<string, string>;
}
const sur = ({ presents, liens }: Disque) => ({
  existe: (p: string) => presents.includes(p),
  lien: (p: string) => liens[p] ?? null,
});

const base = {
  trees: ['/main', '/wt'],
  copie: '/wt',
  paquets: ['packages/a'],
  role: 'developpeur',
  paquetsDeLaCopie: [{ dossier: 'packages/a', pkg: { name: 'a' } }],
};
const MAISON_VIDEE = [{ chemin: '/h', vide: true, scelle: true }];

describe('un magasin qui est un lien symbolique se monte par sa cible', () => {
  const liens = { '/h/.cargo/registry': '/mnt/ssd/pc2/.cargo/registry' };
  const presents = [
    '/wt/.git',
    '/wt/packages/a',
    '/h/.cargo',
    '/h/.cargo/registry',
    '/mnt/ssd/pc2/.cargo/registry',
  ];
  const args =
    plan(
      {
        ...base,
        lectures: ['/h/.cargo'],
        magasins: ['/h/.cargo/registry'],
      },
      sur({ presents, liens })
    ).args ?? [];

  it('monte la cible en écriture à son propre chemin, après le dossier lu en lecture seule', () => {
    expect(pairs(args, '--ro-bind')).toContain('/h/.cargo');
    const i = args.findIndex(
      (a, k) =>
        a === '--bind' &&
        args[k + 1] === '/mnt/ssd/pc2/.cargo/registry' &&
        args[k + 2] === '/mnt/ssd/pc2/.cargo/registry'
    );
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeGreaterThan(args.indexOf('/h/.cargo'));
  });

  it('ne monte rien sur le lien lui-même', () => {
    expect(tous(args)).not.toContain('/h/.cargo/registry');
    expect(args.filter(a => a === '/h/.cargo/registry')).toEqual([]);
  });

  it('un lien relatif se résout depuis le dossier qui le porte', () => {
    const r =
      plan(
        { ...base, lectures: ['/h/.cargo'], magasins: ['/h/.cargo/registry'] },
        sur({
          presents: ['/wt/.git', '/wt/packages/a', '/h/.cargo', '/mnt/ssd/reg'],
          liens: { '/h/.cargo/registry': '../../mnt/ssd/reg' },
        })
      ).args ?? [];
    expect(pairs(r, '--bind')).toContain('/mnt/ssd/reg');
    expect(tous(r)).not.toContain('/h/.cargo/registry');
  });

  it('un magasin sans lien se monte comme avant', () => {
    const r =
      plan(
        { ...base, lectures: ['/h/.cargo'], magasins: ['/h/.cargo/git'] },
        sur({ presents: ['/wt/.git', '/wt/packages/a', '/h/.cargo', '/h/.cargo/git'], liens: {} })
      ).args ?? [];
    expect(pairs(r, '--bind')).toContain('/h/.cargo/git');
    expect(r).not.toContain('--symlink');
  });

  it('le lien, tenu par le dossier lu qui le porte, n’est pas refait quand la maison est vidée', () => {
    const r =
      plan(
        {
          ...base,
          montages: MAISON_VIDEE,
          lectures: ['/h/.cargo'],
          magasins: ['/h/.cargo/registry'],
        },
        sur({ presents, liens })
      ).args ?? [];
    expect(pairs(r, '--ro-bind')).toContain('/h/.cargo');
    expect(pairs(r, '--bind')).toContain('/mnt/ssd/pc2/.cargo/registry');
    expect(r).not.toContain('--symlink');
  });
});

describe('une lecture qui est un lien symbolique se monte par sa cible, en lecture seule', () => {
  it('monte la cible à son chemin, rien sur le lien', () => {
    const args =
      plan(
        { ...base, lectures: ['/h/.rustup'] },
        sur({
          presents: ['/wt/.git', '/wt/packages/a', '/h/.rustup', '/mnt/rustup'],
          liens: { '/h/.rustup': '/mnt/rustup' },
        })
      ).args ?? [];
    expect(pairs(args, '--ro-bind')).toContain('/mnt/rustup');
    expect(pairs(args, '--bind')).not.toContain('/mnt/rustup');
    expect(tous(args)).not.toContain('/h/.rustup');
  });
});

describe('une sortie écrite de la copie qui est un lien sortant de la copie se monte comme un magasin', () => {
  const presents = ['/wt/.git', '/wt/packages/a', '/wt/target', '/wt/dist', '/mnt/t'];
  const args =
    plan(
      { ...base, sorties: { ecrites: ['target', 'dist'], propres: [] } },
      sur({ presents, liens: { '/wt/target': '/mnt/t' } })
    ).args ?? [];

  it('monte la cible en écriture à son chemin, rien sur le lien', () => {
    expect(pairs(args, '--bind')).toContain('/mnt/t');
    expect(tous(args)).not.toContain('/wt/target');
  });

  it('les sorties sans lien se montent comme avant', () => {
    expect(pairs(args, '--bind')).toContain('/wt/dist');
  });
});

describe('un chemin dont un composant ou la chaîne est un lien se monte à son chemin réel final', () => {
  it('un composant intermédiaire qui est un lien: le chemin réel, le lien refait quand la maison est vidée', () => {
    const args =
      plan(
        { ...base, montages: MAISON_VIDEE, magasins: ['/h/lnk/sub'] },
        sur({
          presents: ['/wt/.git', '/wt/packages/a', '/h/lnk/sub', '/mnt/data/sub', '/mnt/data'],
          liens: { '/h/lnk': '/mnt/data' },
        })
      ).args ?? [];
    expect(pairs(args, '--bind')).toContain('/mnt/data/sub');
    expect(tous(args)).not.toContain('/h/lnk/sub');
    const i = args.findIndex(
      (a, k) => a === '--symlink' && args[k + 1] === '/mnt/data' && args[k + 2] === '/h/lnk'
    );
    expect(i).toBeGreaterThan(-1);
  });

  it('une chaîne de liens: chaque lien que la maison vidée cache est refait, la cible finale montée', () => {
    const args =
      plan(
        { ...base, montages: MAISON_VIDEE, magasins: ['/h/a'] },
        sur({
          presents: ['/wt/.git', '/wt/packages/a', '/h/a', '/h/b', '/mnt/c'],
          liens: { '/h/a': 'b', '/h/b': '/mnt/c' },
        })
      ).args ?? [];
    const symlinks = args.flatMap((a, k) =>
      a === '--symlink' ? [[args[k + 1], args[k + 2]]] : []
    );
    expect(symlinks).toContainEqual(['b', '/h/a']);
    expect(symlinks).toContainEqual(['/mnt/c', '/h/b']);
    expect(pairs(args, '--bind')).toContain('/mnt/c');
    expect(tous(args)).not.toContain('/h/a');
    expect(tous(args)).not.toContain('/h/b');
  });

  it('les liens sont refaits avant que la maison vidée soit scellée', () => {
    const args =
      plan(
        { ...base, montages: MAISON_VIDEE, magasins: ['/h/a'] },
        sur({
          presents: ['/wt/.git', '/wt/packages/a', '/h/a', '/mnt/c'],
          liens: { '/h/a': '/mnt/c' },
        })
      ).args ?? [];
    expect(args.indexOf('--symlink')).toBeGreaterThan(
      args.indexOf('--tmpfs', args.indexOf('/h') - 1)
    );
    expect(args.indexOf('--symlink')).toBeLessThan(args.indexOf('--remount-ro'));
  });
});

describe('un lien dont la chaîne casse n’est pas monté et ne lève rien', () => {
  const montes = (args: string[]) =>
    args.filter(a => a.startsWith('/h/') || a.startsWith('/mnt/') || a.startsWith('/gone'));
  const jouer = (disque: Disque, o: object = {}) => {
    const r = plan({ ...base, montages: MAISON_VIDEE, ...o }, sur(disque));
    expect(r.refus).toBeUndefined();
    return r.args ?? [];
  };

  it('cible absente', () => {
    const args = jouer(
      { presents: ['/wt/.git', '/wt/packages/a'], liens: { '/h/s': '/gone' } },
      { magasins: ['/h/s'] }
    );
    expect(montes(args)).toEqual([]);
  });

  it('lien cassé en cours de chaîne', () => {
    const args = jouer(
      { presents: ['/wt/.git', '/wt/packages/a'], liens: { '/h/a': '/h/b', '/h/b': '/gone' } },
      { magasins: ['/h/a'] }
    );
    expect(montes(args)).toEqual([]);
  });

  it('boucle de liens', () => {
    const args = jouer(
      { presents: ['/wt/.git', '/wt/packages/a'], liens: { '/h/a': 'b', '/h/b': 'a' } },
      { lectures: ['/h/a'], magasins: ['/h/b'] }
    );
    expect(montes(args)).toEqual([]);
  });

  it('une sortie écrite dont le lien sort de la copie vers une cible absente', () => {
    const args = jouer(
      { presents: ['/wt/.git', '/wt/packages/a', '/wt/target'], liens: { '/wt/target': '/gone' } },
      { sorties: { ecrites: ['target'], propres: [] } }
    );
    expect(args).not.toContain('/gone');
    expect(args).not.toContain(path.join('/wt', 'target'));
  });
});
