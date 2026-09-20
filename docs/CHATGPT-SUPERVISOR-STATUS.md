# ChatGPT Supervisor Status

This document tracks the local-supervision integration for Construction AI Studio V4.

## Scope

Firefly browser automation is intentionally excluded.

The supported model is:

```text
manual Firefly generation/download
        ↓
Construction AI Studio workspace
        ↓
Construction Local Bridge
        ↓
private GitHub Relay
        ↓
ChatGPT visual + state supervision
        ↓
guarded PASS / RETRY writeback
```

## Implemented

- authenticated loopback bridge on `127.0.0.1`
- strict read/write operation allowlists
- no arbitrary shell
- secret redaction and sensitive path blocking
- supervisor snapshot and supervisor bundle
- visual review bundle with source frame + chronological 2x2 contact sheet
- guarded external RETRY bound to exact attempt + contact-sheet SHA-256
- guarded external PASS bound to exact attempt + contact-sheet SHA-256 + continuity/evidence confirmations
- manual candidate MP4 ingest from workspace `incoming/` only
- local FFmpeg contact-sheet generation without visual-provider API calls
- deterministic retry prompt generation
- canonical last-frame extraction on PASS
- downstream dependency locking/unlocking
- Git push remains separately disabled
- CI for bridge tests + smoke test

## Current real project state

The active cabana workspace has already exercised:

```text
REVIEW_REQUIRED
  -> ChatGPT visual inspection
  -> guarded RETRY
  -> RETRY_REQUIRED
```

The next real acceptance test is:

```text
manual new Job 005 MP4
  -> ingest_review_candidate
  -> REVIEW_REQUIRED attempt 7
  -> ChatGPT visual inspection
  -> guarded PASS or RETRY
  -> if PASS: COMPLETE + Job 006 source becomes ready
```

## Integration warning

The user's primary checkout currently has local, uncommitted provider/Groq/Fiscal work that is not represented by this feature branch.

Do not merge or hard-reset the primary checkout until those local changes are reconciled.

The separate worktree `~/Construction-AI-Studio-V4-MCP` remains the safe runtime location for the bridge until final reconciliation.
