# Contributing

This file says how a change reaches the frame of Roomi's Grillhouse. The rules it points to live in the repository's texts; this file names them and their address. A project created by `npm run new` receives its own contributing guide, `templates/CONTRIBUTING.md`.

## 1. Where a change comes from

- **A project proposes a gap to Grillhouse**: a project that uses the frame never edits a frame file in place (the files `.claude/grillhouse/fichiers.txt` lists); it proposes the change to Grillhouse, and `npm run grillhouse:maj` brings it back to every project. Each session start names a frame file a project changed. The common charter states the rule (`.claude/grillhouse/charte.md`, introduction).
- **A ticket is born of the owner's word, or of a direct need of a project that uses the frame** (a defect it meets). A discovery of an agent is recorded in a closed ticket labelled `decouverte`. The common charter states the rule (« Le flux d'une tâche »).

## 2. How a rule is written

A rule serves an intention of the frame and names it; it is written as `METACADRE.md`, §2, says. A decision lives in the document it settles, at a single address (common charter, « Ce qui tient le dépôt droit »).

## 3. How a change is made

- **Tickets**: Beads (`bd`) holds them; their format, numbering and handoff are in `docs/agents/issue-tracker.md`.
- **The flow**: claim, architecture, tests first, then code, review, commit by the circuit (`scripts/circuit.mjs`), entry on main by the queue. The common charter describes each step (« Le flux d'une tâche », « Le commit »).
- **The commands**: `npm test`, `npm run verifier`, `npm run lint`, `npm run typecheck`, `npm run format:check`, described in `CLAUDE.md` (« Commandes ») and the README.

## 4. What a change must pass

`npm run verifier` is green: the frame's controls, the project's own and every test, with no red admitted. A known red goes to quarantine in the test itself, with the ticket that fixes it. The common charter states the rule (« Outils », « Main reste vert »).
