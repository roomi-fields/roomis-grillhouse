// The names of the tests of HEAD's version of a test file of Rust that cargo cannot play twice in
// one run, read without playing them (the join, `testsDeHead`; the owner's decision on
// grillhouse-3e2): a unit test file of `src/` (`src/**/tests.rs`, a file of a folder `tests/` under
// `src/`), compiled as a module of its crate, and each file of a test target
// `tests/<dossier>/main.rs`, its root or one of its modules (`tests/it/foo.rs`, grillhouse-pkl.9);
// and a target `tests/<nom>.rs` whose sibling no longer compiles, read with its modules beside it
// (grillhouse-3e2.2). The proof of the red holds each name for a green HEAD already holds.
//
// - A name is the one the verdict gives (./verdict.mjs), the path nextest reports: the module path
//   of the test in its binary, `<module>::…::<fn>` (tried on 2026-11-02:
//   `access::engines::tests::groupe::interne` for `src/access/engines/tests.rs`, `m::dedans` and
//   `aide::aidant` for `tests/scenario/main.rs` and its `mod aide;`).
// - A test is a function under an attribute `#[test]`, or `#[<chemin>::test]` (`#[tokio::test]`),
//   in the inline modules that hold it (`mod <nom> { … }`); comments, strings and character
//   literals are read as blanks, so that their braces do not count.
// - A unit test file of `src/`: its module path is its path under `src/` (`mod.rs` its folder's);
//   the verdict gives each of its out-of-line modules (`mod <nom>;`) to its own file, so they are
//   not read here. A file of a target `tests/<dossier>/main.rs` likewise: its module path is its
//   path under `tests/<dossier>/` (`main.rs` none, `mod.rs` its folder's). A target
//   `tests/<nom>.rs`: the verdict gives it all its binary's tests, so its out-of-line modules are
//   read too, as rustc finds them (`<nom>.rs` beside it or `<nom>/mod.rs`, a module of `<f>.rs`
//   under `<f>/`).
import path from 'node:path';

// The text <t> with its comments, strings and character literals read as blanks.
export function sansLitteraux(t) {
  let out = '';
  let i = 0;
  while (i < t.length) {
    if (t.startsWith('//', i)) {
      const fin = t.indexOf('\n', i);
      i = fin < 0 ? t.length : fin;
      continue;
    }
    if (t.startsWith('/*', i)) {
      let profondeur = 0;
      do {
        if (t.startsWith('/*', i)) {
          profondeur++;
          i += 2;
        } else if (t.startsWith('*/', i)) {
          profondeur--;
          i += 2;
        } else {
          i++;
        }
      } while (profondeur > 0 && i < t.length);
      out += ' ';
      continue;
    }
    const brute = /^b?r(#*)"/.exec(t.slice(i, i + 260));
    if (brute && !/\w/.test(t[i - 1] ?? '')) {
      const fin = t.indexOf(`"${brute[1]}`, i + brute[0].length);
      i = fin < 0 ? t.length : fin + 1 + brute[1].length;
      out += ' ';
      continue;
    }
    if (t[i] === '"') {
      i++;
      while (i < t.length && t[i] !== '"') {
        i += t[i] === '\\' ? 2 : 1;
      }
      i++;
      out += ' ';
      continue;
    }
    if (t[i] === "'") {
      const car = /^'(?:\\(?:u\{[0-9a-fA-F]+\}|x[0-9a-fA-F]{2}|.)|[^\\'])'/.exec(
        t.slice(i, i + 16)
      );
      if (car) {
        i += car[0].length;
        out += ' ';
        continue;
      }
    }
    out += t[i];
    i++;
  }
  return out;
}

// What the text <texte> of a file of Rust holds: `tests`, each test's module path within the
// file and its name, and `externes`, each out-of-line module's path within the file.
export function lireLeFichier(texte) {
  const t = sansLitteraux(texte);
  const tests = [];
  const externes = [];
  const pile = [];
  let marque = false;
  const jeton = /#!?\s*\[|\bmod\s+([A-Za-z_]\w*)\s*([{;])|\bfn\s+([A-Za-z_]\w*)|[{}]/g;
  const ici = () => pile.filter(Boolean);
  let m;
  while ((m = jeton.exec(t))) {
    const j = m[0];
    if (j.startsWith('#')) {
      let profondeur = 1;
      let k = jeton.lastIndex;
      while (k < t.length && profondeur > 0) {
        if (t[k] === '[') {
          profondeur++;
        } else if (t[k] === ']') {
          profondeur--;
        }
        k++;
      }
      const attribut = t.slice(jeton.lastIndex, k - 1).trim();
      if (/^(?:\w+\s*::\s*)*test$/.test(attribut)) {
        marque = true;
      }
      jeton.lastIndex = k;
    } else if (m[1]) {
      if (m[2] === '{') {
        pile.push(m[1]);
      } else {
        externes.push([...ici(), m[1]]);
      }
      marque = false;
    } else if (m[3]) {
      if (marque) {
        tests.push([...ici(), m[3]]);
      }
      marque = false;
    } else if (j === '{') {
      pile.push(null);
    } else {
      pile.pop();
    }
  }
  return { tests, externes };
}

/**
 * The names of the tests of HEAD's version of the test file <chemin> (from the root), as the
 * verdict names them: with <module>, a unit test file of `src/` or a file of a target
 * `tests/<dossier>/main.rs`, its module path; without (null), a target `tests/<nom>.rs`, its
 * out-of-line modules read too. <lire>
 * gives HEAD's text of a file from the root, null for none. Null when HEAD does not hold <chemin>.
 * @param {string} chemin
 * @param {string[] | null} module
 * @param {(f: string) => string | null} lire
 * @returns {string[] | null}
 */
export function nomsDeHead(chemin, module, lire) {
  const texte = lire(chemin);
  if (texte === null) {
    return null;
  }
  if (module) {
    return lireLeFichier(texte).tests.map(t => [...module, ...t].join('::'));
  }
  const noms = [];
  const vus = new Set();
  // The file <f> of text <tx>, its modules under <dossier>, its tests under <prefixe>.
  const parcourir = (f, tx, dossier, prefixe) => {
    if (vus.has(f)) {
      return;
    }
    vus.add(f);
    const { tests, externes } = lireLeFichier(tx);
    noms.push(...tests.map(t => [...prefixe, ...t].join('::')));
    for (const e of externes) {
      const base = path.posix.join(dossier, ...e);
      for (const [g, sous] of [
        [`${base}.rs`, base],
        [path.posix.join(base, 'mod.rs'), base],
      ]) {
        const txg = lire(g);
        if (txg !== null) {
          parcourir(g, txg, sous, [...prefixe, ...e]);
          break;
        }
      }
    }
  };
  parcourir(chemin, texte, path.posix.dirname(chemin), []);
  return noms;
}
