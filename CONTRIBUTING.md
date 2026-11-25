# Contributing

This file says how a change reaches the frame of Roomi's Grillhouse. The rules it points to live in the repository's texts; this file names them and their address. A project created by `grillhouse init` receives its own contributing guide, `templates/projet/CONTRIBUTING.md`.

## 1. Where a change comes from

- **A project proposes a gap to Grillhouse**: a project that uses the frame holds no copy of it, its scripts being the package's (`@roomi-fields/grillhouse`) and its skills, agents, hooks of Claude Code, common charter and meta-frame the plugin's (`grillhouse`), which the package carries; it proposes a change to Grillhouse, and the next version brings it back to every project. The common charter states the rule (`mods/grillhouse/charte.md`, introduction).
- **A ticket is born of the owner's word, or of a direct need of a project that uses the frame** (a defect it meets). A discovery of an agent is recorded in a closed ticket labelled `decouverte`. The common charter states the rule (« Le flux d'une tâche »).

## 2. How a rule is written

A rule serves an intention of the frame and names it; it is written as `METACADRE.md`, §2, says. A decision lives in the document it settles, at a single address (common charter, « Ce qui tient le dépôt droit »).

## 3. How a change is made

- **Tickets**: Beads (`bd`) holds them; their format, numbering and handoff are in `docs/agents/issue-tracker.md`.
- **The flow**: claim, architecture, tests first, then code, review, commit by the circuit, entry on main by the queue. The common charter states each step (« Le flux d'une tâche »); the circuit is described in `packages/grillhouse/docs/architecture/circuit.md`, the entry on main in `entree.md` beside it.
- **The commands**: `npm test`, `npm run verifier`, `npm run lint`, `npm run typecheck`, `npm run format:check`, described in `CLAUDE.md` (« Commandes ») and the README.

## 4. What a change must pass

`npm run verifier` is green: the frame's controls, the project's own and every test, with no red admitted. A known red goes to quarantine in the test itself, with the ticket that fixes it. The common charter states the rule (« Outils », « Main reste vert »).

## 5. How a version is released

One version covers the frame: the `version` of `packages/grillhouse/package.json`, the package `@roomi-fields/grillhouse` that npm publishes, so each project knows the version it has installed. The package is the frame's plugin: its prepack copies the plugin (`mods/grillhouse/`) at the package's root, whose manifest takes that version (`packages/grillhouse/scripts/cadre.mjs`); the plugin's manifest in the repository carries none, and no other publication of the plugin exists. The marketplace `roomi-fields` (`roomi-fields/claude-plugins`) names the package by its source npm, so a machine installs the version published last. The root `package.json` never carries it.

The versions follow semantic versioning in 0.x: a change that obliges a project to act raises the minor, a fix the patch. A version is released per lot delivered to the projects, never per commit. The release is described in `packages/grillhouse/docs/architecture/entree.md`, §5.4; its commands:

1. `npx grillhouse sortie <x.y.z>` writes the version in the package's `package.json`, writes it in each migration that has none, and dates `packages/grillhouse/CHANGELOG.md`: « [Unreleased] » becomes « [x.y.z] - <today> » and an empty « [Unreleased] » opens above it. It refuses a version not above the current one, and an empty « [Unreleased] ».
2. The release commit carries these files.
3. `npx grillhouse sortie --etiqueter` creates the annotated tag `v<x.y.z>` on HEAD, the release commit, once the working tree holds no change, and names the push. It pushes nothing: the owner validates the push of the tag.
4. On the tag, `.github/workflows/release.yml` calls the CI on the tagged commit; green, it checks that the tag names the version (`npx grillhouse sortie --verifier-etiquette <tag>`), publishes the package on the npm registry by trusted publishing (no token is stored), and publishes the GitHub release. A failure or a cancellation publishes nothing.
5. Once the first package carrying the plugin is published, the owner sets the plugin's entry in the marketplace `roomi-fields/claude-plugins` (`.claude-plugin/marketplace.json`) to its source npm, a public gesture of that repository: `npx grillhouse sortie --entree-du-marche` prints the entry, `{ "name": "grillhouse", "source": { "source": "npm", "package": "@roomi-fields/grillhouse" } }`. A source npm has no subdirectory: the package's root is the plugin's.
6. The projects update to this version, in four gestures, each in the project's folder, between two steps of its circuits (the update of a project: `packages/grillhouse/docs/architecture/installation.md`, §5.2–5.3; its §9.1 says where these gestures stand against it). The supervisor's announcement to the projects gives the four, once, in one message, sent when the registry serves the package (`npm view @roomi-fields/grillhouse@<x.y.z> version` answers; the archive follows the release flow by a few minutes):
   1. `npm install -D @roomi-fields/grillhouse@<x.y.z>`, then `npm run grillhouse:maj`, which brings the project to the version installed; its report names the version, the migrations and the flows.
   2. `npx grillhouse outil <x.y.z>`: the key `grillhouse.outil` of the root `package.json`, which the update leaves as it is, and the version installed under `~/.cache/grillhouse/outil/`. The key goes in the commit of the update. Until then the circuits of the project play the former version.
   3. `npx grillhouse temporal installer`: the unit of the project's worker points to the version of the key, and the queue starts again on it.
   4. `claude plugin update grillhouse@roomi-fields --scope local`: the plugin installed for the project, which carries the agents; a session of the supervisor restarts to take its hooks. A plugin left at the former version lacks the agents the new version launches.

   The supervisor checks each project after its update: the key, the `ExecStart` of its worker's unit, and the line of the project in `claude plugin list`.

7. Grillhouse itself is led by a published version (`installation.md`, §5.5). Once the version is published, `npx grillhouse outil <x.y.z>` writes `grillhouse.outil` and installs it (the key goes in a commit), `npx grillhouse temporal installer` points Grillhouse's own worker to it, and `claude plugin update grillhouse@roomi-fields --scope local` moves the plugin installed for Grillhouse; `npx grillhouse sortie --etiqueter` names the key's command and the plugin's. The supervisor proposes a release after each green night that follows deliveries; the owner decides.

`packages/grillhouse/scripts/sortie.mjs` is Grillhouse's own: a project runs none of it, and `grillhouse init` installs the template of a project alone (`templates/projet/`).
