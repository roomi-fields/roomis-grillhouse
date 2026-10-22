# Contributing

This file says how a change reaches the frame of Roomi's Grillhouse. The rules it points to live in the repository's texts; this file names them and their address. A project created by `npm run new` receives its own contributing guide, `templates/projet/CONTRIBUTING.md`.

## 1. Where a change comes from

- **A project proposes a gap to Grillhouse**: a project that uses the frame never edits a frame file in place (the files `.claude/grillhouse/fichiers.txt` lists); it proposes the change to Grillhouse, and `npm run grillhouse:maj` brings it back to every project. Each session start names a frame file a project changed. The common charter states the rule (`.claude/grillhouse/charte.md`, introduction).
- **A ticket is born of the owner's word, or of a direct need of a project that uses the frame** (a defect it meets). A discovery of an agent is recorded in a closed ticket labelled `decouverte`. The common charter states the rule (« Le flux d'une tâche »).

## 2. How a rule is written

A rule serves an intention of the frame and names it; it is written as `METACADRE.md`, §2, says. A decision lives in the document it settles, at a single address (common charter, « Ce qui tient le dépôt droit »).

## 3. How a change is made

- **Tickets**: Beads (`bd`) holds them; their format, numbering and handoff are in `docs/agents/issue-tracker.md`.
- **The flow**: claim, architecture, tests first, then code, review, commit by the circuit (`packages/grillhouse/scripts/circuit.mjs`), entry on main by the queue. The common charter describes each step (« Le flux d'une tâche », « Le commit »).
- **The commands**: `npm test`, `npm run verifier`, `npm run lint`, `npm run typecheck`, `npm run format:check`, described in `CLAUDE.md` (« Commandes ») and the README.

## 4. What a change must pass

`npm run verifier` is green: the frame's controls, the project's own and every test, with no red admitted. A known red goes to quarantine in the test itself, with the ticket that fixes it. The common charter states the rule (« Outils », « Main reste vert »).

## 5. How a version is released

One version covers the package and its mod, released by the same commit. It is the `version` of `packages/grillhouse/package.json`, the package `@roomi-fields/grillhouse` that npm publishes, so each project knows the version it has installed; `mods/grillhouse/.claude-plugin/plugin.json` carries the same, `packages/grillhouse/tests/unit/version.spec.ts` refuses a gap, and the session start of a project names a mod installed at another version than its package, with the command that aligns them. The root `package.json` never carries it.

The versions follow semantic versioning in 0.x: a change that obliges a project to act raises the minor, a fix the patch. A version is released per lot delivered to the projects, never per commit:

1. `npx grillhouse sortie <x.y.z>` writes the version in the package's `package.json` and in `plugin.json`, and dates `CHANGELOG.md`: « [Unreleased] » becomes « [x.y.z] - <today> » and an empty « [Unreleased] » opens above it. It refuses a version not above the current one, and an empty « [Unreleased] ».
2. The release commit carries these three files.
3. `npx grillhouse sortie --etiqueter` creates the annotated tag `v<x.y.z>` on that commit, locally, once its CI is green, and names the push. It pushes nothing: the owner validates the push of the tag.
4. On the tag, `.github/workflows/release.yml` plays the CI on the tagged commit; once it is green, it checks that the tag names the version (`npx grillhouse sortie --verifier-etiquette <tag>`), publishes the package on the npm registry with the repository's secret `NPM_TOKEN`, and publishes the GitHub release.
5. The projects update to this version (`npm run grillhouse:maj`, whose report names it). The update installs the last commit of Grillhouse's default branch, not a tag.

`packages/grillhouse/scripts/sortie.mjs` is Grillhouse's own: a « - » line of `.claude/grillhouse/fichiers.txt` keeps it out of every project, and out of a new one.
