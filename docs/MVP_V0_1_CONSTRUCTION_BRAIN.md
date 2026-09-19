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


## Exporting firefly_plan.json from the Studio

The Construction Brain export package validates the canonical brain and Firefly execution plan before any production manifest is released.

The export package contains:

- `project.json`
- `construction_map.json`
- `world_state.json`
- `scenes.json`
- `firefly_plan.json`

The Studio workspace now exposes **EXPORTAR FIREFLY** when a project is open. The button downloads a validated `firefly_plan.json` directly from the active project.

The downloaded file can be passed to the local runner:

```bash
npm run firefly:prepare -- /path/to/firefly_plan.json
```

If the Construction Brain has an invalid state, dependency, scene duration, continuity contract or provider job, export is blocked instead of producing a bad execution queue.


## v0.1.1 — Stage-aware production correction

A real exported plan exposed an important production bug in v0.1.0:

- one 15-second job was being created per macro scene
- the selected Kling prompt came from the 100% stage only
- some elements being built in the current operation also leaked into forbidden-future constraints

v0.1.1 fixes this contract.

### Default long-form profile

Studio export now defaults to a 240-second / 4-minute master.

For the eight-operation cabin demo, this produces two chained clips per macro operation:

```text
ENTRY
  -> 50% target (15s Kling)
  -> previous terminal frame
  -> 100% target (15s Kling)
  -> EXIT
```

The first clip uses the canonical 50% stage prompt. The second uses the canonical 100% stage prompt.

### Stage-specific prohibitions

Each generation segment now computes forbidden elements from the state expected **after that segment**.

Elements already completed or partial at the target stage are removed from the forbidden list. This prevents contradictions such as:

```text
ACTION: install door
NEGATIVE: no door
```

ENTRY and EXIT keyframes also maintain separate future-element locks: the current component may correctly be forbidden before work starts and allowed after the operation completes.

### Stale-plan protection

The schema version is now `0.1.1`.

The local runner rejects older `0.1.0` manifests and requires:

- explicit `targetStagePercentage`
- strictly increasing target stages inside a scene
- every scene to finish at 100%

If an old plan is passed to the runner, export a fresh `firefly_plan.json` from the current Studio instead of executing it.


## v0.1.2 — Range-aware generation correction

Auditing a real v0.1.1 export exposed a second production issue: selecting only the canonical 50% and 100% stages while reusing the original stage-local prompts skipped the physical 25% and 75% work.

Example of the bad contract:

```text
ENTRY 0%
  -> prompt written as if 25% already existed
  -> target 50%

50% terminal frame
  -> prompt written as if 75% already existed
  -> target 100%
```

Some original stage prompts also embedded their own stale `no premature <current element>` text, which could contradict the work being performed even after the external constraint list had been fixed.

v0.1.2 changes each generation segment into an explicit range:

```text
0% -> 50%
50% -> 100%
```

Each range now stores both start and target world states. Its prompt is generated by the Construction Brain from the actual supplied source state instead of copying an old single-stage Kling prompt.

The 0->50 clip includes the physical/evidence milestones from 25% and 50%. The 50->100 clip includes the 75% and 100% milestones.

Final-segment acceptance is also scoped to the work that actually occurs in that segment; it no longer requires the final 15-second clip to reproduce evidence from earlier 25%/50% work.

The local runner now requires schema `0.1.2`, explicit `startStagePercentage`, and an exact stage chain. Old `0.1.1` plans are rejected.


## v0.1.3 — Continuous master chain and provider-safe prompts

Auditing a real v0.1.2 export exposed two remaining production constraints.

First, the project was continuous only inside each macro scene. The first job of every new macro scene still requested a fresh ENTRY keyframe, which could reintroduce visual drift between construction stages.

v0.1.3 makes the entire long-form master one physical frame chain:

```text
initial ENTRY keyframe
  -> job 1 terminal frame
  -> job 2 terminal frame
  -> job 3 terminal frame
  -> ...
  -> job 16 terminal frame
```

Only the very first job starts from a standalone keyframe. Every following job, including the first job of the next macro scene, starts from the immediately previous accepted terminal frame.

Second, real v0.1.2 Kling prompts exceeded the 1,400-character production limit. v0.1.3 replaces inherited verbose stage text with a compact English prompt compiler based on:

- exact source-stage percentage
- exact target-stage percentage
- global construction progress
- normalized English construction action
- one visible intermediate milestone
- target work zone
- continuity/conservation rules
- compact forbidden-future list

The Firefly validator now blocks any Kling prompt above 1,400 characters instead of allowing an unusable manifest to export.

The local runner requires schema `0.1.3` and rejects older plans.


## M3 — Construction Fiscal + retry learning loop

The Construction Brain now has a deterministic fiscal layer for generated video jobs.

The fiscal compares an observed result against the canonical Firefly job contract and can classify:

- `PROGRESS_OVERSHOOT`
- `PROGRESS_UNDERSHOOT`
- `FUTURE_ELEMENT_LEAK`
- `MISSING_EVIDENCE`
- `CHARACTER_DRIFT`
- `ENVIRONMENT_DRIFT`
- `GEOMETRY_DRIFT`
- `SOURCE_CONTINUITY_DRIFT`

A failed job receives a generated corrective retry prompt rather than being manually rewritten.

The first real regression case is the timber base/floor Job 005:

```text
expected stage: 50%
observed stage: approximately 95%
classification: PROGRESS_OVERSHOOT
action: RETRY
```

The retry directive explicitly requires the operation to stop at 50% and preserve a visibly unfinished portion for the next segment.

### Learning memory

Retry outcomes can be stored as operation-scoped production lessons.

A correction is reusable only after a retry using that correction is marked successful.

Example:

```text
operation: piso
provider: KLING
failure: PROGRESS_OVERSHOOT
successful correction:
  leave a visibly unfinished portion for the next segment
```

Future `piso + KLING` jobs can receive that successful correction proactively. The lesson is not injected into unrelated operation types such as footings or roofing.

This is operational learning, not model-weight training: the system accumulates production rules from successful corrections and uses them to reduce repeated failures.

### Next M3 integration

The fiscal decision and learning core are implemented. The next integration is an automatic visual observation provider that produces structured observations from generated video/keyframes so the fiscal can run without a human estimating progress.
