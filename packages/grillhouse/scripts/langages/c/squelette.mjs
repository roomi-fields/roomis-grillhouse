// The skeleton of a new package of the module c, the demand `squelette` of the join
// (scripts/jointure.d.ts), which `grillhouse paquet` writes (scripts/paquet.mjs), as `cmake`
// projects and `cargo new --lib` write one: no behaviour, no test.
//
// - Its name: the folder's, the name of its `project()`; its files of source are
//   `src/<nom>.h` and `src/<nom>.c`, the name with `-` and `.` read `_`.
// - Its CMakeLists.txt: C99 strict (`CMAKE_C_STANDARD 99`, required, extensions off), the warnings
//   `-Wall -Wextra -Wpedantic -Werror`, a static library of its one source, `enable_testing()` and
//   `add_subdirectory(tests)`.
// - Its `tests/CMakeLists.txt`, written once: it takes every `tests/test_*.c` present
//   (`file(GLOB … CONFIGURE_DEPENDS)`), one executable and one CTest test each, named as the file
//   without its extension; the testwriter adds a file, never edits it.
// - The workspace and the lock: none, CMake has neither; the entry of the package in the
//   `workspaces` of the root package.json is the core's (scripts/paquet-npm.mjs).
import path from 'node:path';

/** @type {import('../../jointure.js').Langage['squelette']} */
export function squelette(_racine, { chemin }) {
  const nom = path.posix.basename(chemin);
  const fichier = nom.replace(/[-.]/g, '_');
  const garde = `${fichier.toUpperCase()}_H`;
  const cmake = [
    'cmake_minimum_required(VERSION 3.16)',
    `project(${nom} C)`,
    '',
    'set(CMAKE_C_STANDARD 99)',
    'set(CMAKE_C_STANDARD_REQUIRED ON)',
    'set(CMAKE_C_EXTENSIONS OFF)',
    'add_compile_options(-Wall -Wextra -Wpedantic -Werror)',
    '',
    `add_library(${nom} STATIC src/${fichier}.c)`,
    `target_include_directories(${nom} PUBLIC src)`,
    '',
    'enable_testing()',
    'add_subdirectory(tests)',
    '',
  ].join('\n');
  const tests = [
    '# Every test_*.c of this folder is one executable and one CTest test of the same name.',
    'file(GLOB TEST_SOURCES CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/test_*.c")',
    'foreach(source IN LISTS TEST_SOURCES)',
    '  get_filename_component(test_name "${source}" NAME_WE)',
    '  add_executable(${test_name} "${source}")',
    `  target_link_libraries(\${test_name} PRIVATE ${nom})`,
    '  add_test(NAME ${test_name} COMMAND ${test_name})',
    'endforeach()',
    '',
  ].join('\n');
  return {
    fichiers: {
      [`${chemin}/CMakeLists.txt`]: cmake,
      [`${chemin}/src/${fichier}.h`]: `#ifndef ${garde}\n#define ${garde}\n\n#endif\n`,
      [`${chemin}/src/${fichier}.c`]: `#include "${fichier}.h"\n\n/* A translation unit holds one declaration (ISO C): the first function of the package replaces it. */\ntypedef int ${fichier}_sans_code;\n`,
      [`${chemin}/tests/CMakeLists.txt`]: tests,
    },
    espace: null,
    verrouiller: [],
  };
}
