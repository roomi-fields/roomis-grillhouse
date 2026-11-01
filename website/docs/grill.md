---
title: "The grill — how Grillhouse decides a project's architecture"
description: 'The grill is the interview in which the owner decides what a project must be: goals, mature references, components, interfaces, architecture. Grillhouse then writes the charter and the reference documents every agent reads.'
slug: '/grill'
---

# The grill

The grill is where the owner decides what the project must be, before the code needs it. It is the
human step of the elephant–goldfish model: the owner approves the design before any code.

## When it runs

- **At the first session of a new project**, or of an existing project that adopts the framework.
- **At every session start** a hook lists the key elements still empty (arbitration criteria,
  charter fields, architecture, frame, interfaces, lexicon), and the session proposes to grill
  them, each with its recommendation, until they are filled.
- **On every structure question.** A hook sends any question of packages, modules, interfaces or
  boundaries back to the grill. A decision of structure passes by the grill; the architecture
  decides the structure, and the code follows it.

## How it runs

A structural survey of the code comes first. Then the grill goes round by round: goals, mature
references and domain demands, owner, consumers, data representations, axes of change, components,
interfaces, architecture, lexicon, first milestone.

- **A proposal to correct.** Each question arrives with its proposal, drawn from the project and its
  domain. For the arbitration criteria, the session looks for the mature products that do the same
  work, the standards and tools in use, the measurable demands of the domain, and names them. The
  owner corrects a proposal and keeps his time for the real decisions.
- **Evidence first.** Each recommendation rests on a reading of how the code is built, with its
  files and symbols. A count of lines, files or imports grounds no recommendation; nothing is
  decided on the size of the code.
- **A small project is structured like a large one.** Its components, boundaries and interfaces are
  decided on its goals and on how its code is built.
- **A postponed question names its fact**: the fact that will reopen it, and what it will cost then.

## What it writes

| Document               | What it fixes                                                          |
| ---------------------- | ---------------------------------------------------------------------- |
| `CLAUDE.md`            | The project's charter: owner, what decides, how to arbitrate, commands |
| `docs/ARCHITECTURE.md` | How the project is built, and why                                      |
| `docs/CADRE.md`        | Each component's role, its boundary, what it refuses                   |
| `docs/INTERFACE.md`    | What crosses each boundary, and the guard that holds it                |
| `CONTEXT.md`           | The domain lexicon                                                     |

The charter imports the common charter of the frame, the same in every project. The owner validates
the architecture, the frame and the interfaces. The grill then opens the first tickets.
