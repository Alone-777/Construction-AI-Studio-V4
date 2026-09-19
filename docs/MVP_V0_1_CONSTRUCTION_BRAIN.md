# Construction Brain MVP v0.1

## Objective

Turn the existing deterministic Construction AI Studio V4 core into a provider-independent production brain for realistic AI construction timelapse videos.

The first production target is a **16:9 YouTube master**. The current execution providers are:

- **Kling** — maximum 15 seconds per generation.
- **Veo Fast** — maximum 8 seconds per generation.

Providers execute scenes. They do not define construction logic.

## Canonical artifacts

The MVP compiles every internal `Project` into four stable artifacts:

1. `project.json` — project identity, 16:9 master specification, provider limits and global rules.
2. `construction_map.json` — components, dependencies, operations and deterministic execution order.
3. `world_state.json` — initial world state plus auditable before/after stage snapshots.
4. `scenes.json` — scene actions, execution evidence, future-element prohibitions, preserved zones, prompts and provider-safe generation segments.

## Invariant

Every accepted construction change must follow:

```
BEFORE STATE
  -> VISIBLE PHYSICAL ACTION
  -> EXECUTION PROOF
  -> AFTER STATE
  -> PERSISTENCE INTO THE NEXT STATE
```

A component cannot appear without a causal operation. A completed component cannot disappear without an explicit removal operation. Materials, tools, residues and workers cannot teleport.

## What is reused from V4

MVP v0.1 intentionally reuses the existing deterministic foundation:

- dependency graph
- conservation engine
- execution proof
- Physical Action IR
- visual state snapshots
- prompt generation
- visual/video validation
- retry/correction foundations

This new module is a stable production contract over those systems, not a rewrite.

## Provider segmentation

Generation duration is compiled into safe segments:

- 0–8 seconds: fits Veo Fast.
- 8–15 seconds: fits Kling.
- more than 15 seconds: automatically split into multiple provider-safe generation segments.

This decision is based on duration compatibility only. Future versions can add quality/cost routing without changing the canonical scene contract.

## Milestones

### M0 — Canonical brain contracts
Implemented in `src/core/construction-brain`.

### M1 — Keyframe specification
Implemented.

Each scene now carries deterministic ENTRY and EXIT keyframe specifications with:

- expected construction/world-state digest
- INITIAL and FINAL global reference slots
- PREVIOUS_ACCEPTED reference from the second scene onward
- worker identity lock
- completed-component persistence locks
- permanent-object and terrain locks
- preserved-zone constraints
- forbidden future elements
- required visible evidence
- an approval checklist designed for the future Fiscal

The validator also checks continuity across scene boundaries so completed components, permanent objects, worker identity and construction progress cannot silently regress.

### M2 — Firefly execution bridge
Bridge core implemented; local/browser runner remains next.

The Construction Brain now derives a portable Firefly execution plan with one job per canonical video segment.

Each job contains:

- selected model: KLING or VEO_FAST
- provider-safe duration
- 16:9 / 1920x1080 master format
- deterministic source binding
- video prompt and negative constraints
- continuity locks
- acceptance checklist
- output video slot
- terminal-frame slot for chaining

For multi-segment scenes, the first job starts from the ENTRY keyframe. Every following job starts from the previous segment's terminal frame. The final job is bound to the scene EXIT keyframe.

Example: a 23-second scene becomes KLING 15s -> previous last frame -> VEO_FAST 8s.

Next step inside M2 is the local Firefly runner/adapter that consumes this manifest without moving construction logic into browser automation.

### M3 — Fiscal
Compare expected state against generated image/video results and emit PASS / RETRY / REJECT.

### M4 — Assembly
Select approved ranges, assemble the long-form master and later derive vertical edits.

## Non-goals of v0.1

- automatic publishing
- platform analytics learning
- road-repair / renovation / restoration domain packs
- paid cloud infrastructure
- binding the project to one generation model


## Local Firefly runner

The repository now includes `tools/firefly-local-runner.mjs`.

It intentionally does not automate the browser yet. Its job is to materialize a deterministic local queue from `firefly_plan.json` so browser automation remains a replaceable execution adapter.

### Prepare a workspace

```bash
npm run firefly:prepare -- ./firefly_plan.json
```

This creates:

```text
.firefly/<project-id>/
  manifest.json
  queue.json
  inputs/
    keyframes/
  jobs/
    001__.../
      job.json
      prompt.txt
      negative.txt
      checklist.txt
      source.json
      state.json
  outputs/
```

For the first segment of a scene, `source.json` points to the approved ENTRY keyframe.

For every later segment in the same scene, `source.json` points to the previous job's terminal frame.

### Inspect the queue

```bash
npm run firefly:status -- ./.firefly/<project-id>
```

A job becomes runnable only when its required source image exists.

### Complete a job

After the generated video and terminal frame have been placed in the expected output slots:

```bash
npm run firefly:complete -- ./.firefly/<project-id> "<job-id>"
```

The runner refuses to mark a job complete if either the video file or terminal frame is missing. This prevents a broken chain from silently advancing.

### Safety boundary

The local runner never decides construction logic and never marks visual quality as approved. It only coordinates files and execution state. Construction logic remains in the Construction Brain; visual approval remains the future Fiscal's responsibility.
