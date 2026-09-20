# Construction AI Local Bridge

A local, authenticated and sandboxed control bridge for **Construction AI Studio V4**.

This is the safe local execution layer for a future ChatGPT-to-project connection. It contains **no AI model** and does not call Gemini, Groq, OpenAI API, Codex, Firefly, or any browser UI.

## Purpose

```text
ChatGPT / approved transport
          |
          v
Construction Local Bridge
          |
          v
~/Construction-AI-Studio-V4
```

The bridge owns the risky local capabilities. The transport can change later without changing the project-control rules.

## Security defaults

By default the bridge is:

- bound to `127.0.0.1`
- authenticated with a random local token
- read-only
- unable to run arbitrary shell commands
- unable to read `.env`, `.git/`, `node_modules/`, private keys or credential files
- unable to write directly to `.firefly/`
- unable to run `git push`
- limited to the Construction AI Studio project root
- protected against path traversal and symlink escapes
- audited to `~/.local/state/construction-ai-bridge/audit.log`

The audit log stores operation metadata only. File contents, tokens, prompts, image Base64, search text and replacement text are not written to the audit log.

## Install

Use this package from a branch/worktree that contains both:

```text
bridge/construction-local/
mcp/construction-studio/lib.mjs
```

Install its isolated dependency:

```bash
cd ~/Construction-AI-Studio-V4-MCP/bridge/construction-local
npm install
```

Generate a random token:

```bash
npm run token
```

Do not paste the token into chat or commit it.

Configure the shell:

```bash
export CONSTRUCTION_BRIDGE_TOKEN='YOUR_RANDOM_TOKEN'
export CONSTRUCTION_STUDIO_ROOT="$HOME/Construction-AI-Studio-V4"
export CONSTRUCTION_BRIDGE_HOST=127.0.0.1
export CONSTRUCTION_BRIDGE_PORT=8791
```

Start in the safe default read-only mode:

```bash
npm start
```

Health check:

```bash
curl http://127.0.0.1:8791/health
```

Expected shape:

```json
{
  "ok": true,
  "service": "construction-ai-local-bridge",
  "version": "0.1.0",
  "projectRoot": "/home/.../Construction-AI-Studio-V4",
  "writeMode": "readonly",
  "allowPush": false
}
```

## Tests

```bash
npm test
npm run smoke
```

The smoke test starts a temporary bridge, authenticates over WebSocket, calls `overview`, and verifies that writes are rejected in read-only mode.

Expected final line:

```text
BRIDGE_SMOKE_PASS auth=ok overview=ok readonly_gate=ok
```

## Protocol

Connect to:

```text
ws://127.0.0.1:8791/bridge
```

The first message must be authentication:

```json
{
  "type": "auth",
  "token": "..."
}
```

The bridge then returns:

```json
{
  "type": "auth_ok",
  "protocol": "construction-local-bridge/0.1",
  "capabilities": {
    "writeMode": "readonly",
    "allowPush": false
  }
}
```

Every operation after authentication uses a request id:

```json
{
  "id": "request-1",
  "op": "overview"
}
```

Response:

```json
{
  "id": "request-1",
  "ok": true,
  "result": {}
}
```

## Operations

Read operations:

- `overview`
- `supervisor_snapshot` — bundles Git status, diff check, recent log, workspace list and optional Firefly workspace status in one request
- `supervisor_bundle` — returns the selected workspace's current job, state, effective prompt, source descriptor, checklist, negative constraints, latest contact-sheet path, downstream blocked jobs, queue summary and next suggested system action, plus Git context
- `list_directory`
- `read_file`
- `read_files`
- `read_image`
- `search_code`
- `run_action` for allowlisted read-safe actions

Safe write operations, disabled by default:

- `write_file`
- `replace_text`
- `git_stage`
- `git_commit`
- selected mutating `run_action` commands

There is deliberately no `shell`, `exec`, `bash`, or arbitrary command operation.

## Read-safe named actions

`run_action` can call:

- `test`
- `build`
- `git_status`
- `git_diff_check`
- `git_diff`
- `git_log`
- `firefly_status`
- `firefly_prompt`

## Mutating named actions

These require explicit write mode:

- `git_pull`
- `firefly_complete`

`git_push` requires both write mode and a second explicit opt-in.

Enable safe writes only when intentionally needed:

```bash
export CONSTRUCTION_BRIDGE_WRITE_MODE=allow
npm start
```

Git push remains disabled.

To additionally permit Git push:

```bash
export CONSTRUCTION_BRIDGE_ALLOW_PUSH=true
npm start
```

Do not make push permission the default.

## Stale-write protection

Overwriting an existing text file requires its SHA-256 from a prior `read_file` or `read_files` call.

This prevents a tool from overwriting a file that changed after it was inspected.

## Transport boundary

This package intentionally does **not** automate or scrape the ChatGPT web interface.

It is the local control layer only.

A supported transport can sit above it later:

```text
ChatGPT
   |
MCP / approved transport
   |
Construction Local Bridge
   |
Construction AI Studio
```

This keeps the local security model independent of whichever transport is used.
