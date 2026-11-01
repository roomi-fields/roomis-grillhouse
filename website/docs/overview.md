---
title: 'Roomi’s Grillhouse — an elephant–goldfish framework for Claude Code agents'
description: 'Roomi’s Grillhouse grills you on what a project must be, writes its charter and reference documents, then runs every ticket through a circuit of fresh Claude Code agents: tests first, then code, then an adversarial review.'
slug: '/'
sidebar_position: 1
---

# Roomi’s Grillhouse

**An elephant–goldfish framework for building with Claude Code agents.**

You create a project, open Claude Code in it, and the session grills you on what the project must
be: its goals, the mature products it should measure itself against, its components and their
interfaces. It then writes the project's charter and reference documents, opens the first tickets,
and runs the work through a supervisor and fresh agents, each ticket reviewed before it closes.

Grillhouse is published on npm as `@roomi-fields/grillhouse`: one package that carries the frame's
command, `grillhouse <sous-commande>`, and its Claude Code plugin. The skills speak French; this
site is in English.

## What it does

| Moment              | What happens                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `grillhouse init`   | Creates a project from the template: git, the ticket store, the code index, the plugins.      |
| Every session start | A hook lists the key elements still empty and proposes to grill them.                         |
| The grill           | Round by round, the owner decides goals, references, components, interfaces, architecture.    |
| Every message       | A hook sends any structure question (packages, modules, interfaces, boundaries) to the grill. |
| Daily work          | The supervisor keeps the ticket queue and hands each ticket to its circuit of fresh agents.   |

## What every rule serves

The metaframe (`METACADRE.md`, in the frame's plugin) fixes six intentions, and every rule of the
framework names the one it serves:

1. a mature, professional product;
2. the architecture decides and the code follows;
3. from the broadest to the most specific;
4. proof before assertion;
5. agents within a frame;
6. the owner settles what matters.

## How decisions are arbitrated

Every recommendation answers three questions, in order:

1. What does the mature reference of the domain do (a mature compiler, a professional DAW…)?
2. What already exists and can be reused (standards, off-the-shelf tools, the author's own
   conventions)?
3. What does the domain demand (for example, speed for live coding)?

The project's answers live in its charter, `CLAUDE.md`.

## What it builds on

Grillhouse invents as little as possible; it wires existing tools together: Claude Code (skills,
hooks, plugins, sub-agents), bubblewrap (the envelope each agent runs in), Beads (the ticket store),
RTFM and CodeGraph (the indexes), TypeScript, Vitest, Turborepo, ESLint, Prettier, and GitHub
Actions.

## Links

- Source code: [github.com/roomi-fields/roomis-grillhouse](https://github.com/roomi-fields/roomis-grillhouse)
- npm package: [@roomi-fields/grillhouse](https://www.npmjs.com/package/@roomi-fields/grillhouse)
- Project page: [roomi-fields.com/projects/grillhouse](https://roomi-fields.com/projects/grillhouse/)
- Licence: MIT
