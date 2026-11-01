---
title: 'Getting started with Roomi’s Grillhouse'
description: 'Create a project with Grillhouse: install the requirements, run grillhouse init, open Claude Code and let the grill start. Or adopt Grillhouse in an existing project.'
slug: '/getting-started'
---

# Getting started

## Install the requirements

- Linux with Bubblewrap (`bwrap`), the envelope each role agent runs in:
  `sudo apt install bubblewrap`. A session start names Bubblewrap under « Manque » while it is
  absent.
- Node.js 22 or newer.
- git.
- Claude Code.

## Create a project

```bash
git clone https://github.com/roomi-fields/roomis-grillhouse
cd roomis-grillhouse
npx @roomi-fields/grillhouse init ~/dev/my-project [ticket-prefix]
```

`init` creates the project from the template of a project, then prepares it: git, Beads and its
ticket store, CodeGraph and its index, the plugins its settings declare, `npm install`, which places
the git hooks. It ends on one commit. A directory that is not empty is refused.

## Open Claude Code in it

```bash
cd ~/dev/my-project && claude
```

The session start lists what is still empty and proposes the grill. A session start names under
« Manque » each plugin still missing.

## Adopt Grillhouse in an existing project

Copy the template files into the project, then run:

```bash
npm install -D @roomi-fields/grillhouse
npx grillhouse maj
```

## Update to a new version

```bash
npm install -D @roomi-fields/grillhouse@<version>
npm run grillhouse:maj
```

The update plays each migration newer than the version the project recorded, writes what the frame
writes in a project, and ends on `npm run verifier`.
