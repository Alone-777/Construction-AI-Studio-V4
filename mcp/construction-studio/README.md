# Construction AI Studio MCP

Self-hosted MCP control surface for **Construction AI Studio V4**.

The goal is to let ChatGPT control the project directly without making Gemini, Groq, OpenAI API, or any other model part of the Construction Brain decision path.

## Architecture

```text
ChatGPT
   |
   | MCP
   v
Construction AI Studio MCP
   |
   +-- project files
   +-- Git
   +-- npm test / build
   +-- Firefly runner status/prompt/complete
   +-- contact-sheet images for ChatGPT visual inspection
   |
Construction AI Studio V4
```

This MCP server contains **no model**. It is only a restricted bridge between ChatGPT and the local project.

## Safety model

The MCP intentionally does **not** expose arbitrary shell execution.

Available capabilities are allowlisted:

- inspect Git/project status
- list directories
- read one or several text files
- search Git-tracked code
- read PNG/JPEG/WebP images, including Firefly contact sheets
- create/replace project text files
- exact text replacement with optional SHA-256 stale-write protection
- run `npm test`
- run `npm run build`
- Git status/diff/log/pull/push
- stage explicitly selected files
- commit already staged files
- Firefly status/prompt/complete

Explicitly blocked:

- reading `.env`
- reading `.git/`
- reading `node_modules/`
- private key / credential-style files
- direct writes to `.firefly/`
- arbitrary shell commands
- automatic Gemini/Groq/OpenAI visual review calls

The HTTP server binds to `127.0.0.1` by default.

For normal use, a random token is also embedded in the private MCP path.

## Install

This MCP is an isolated Node package, so it does not modify the main Studio dependency tree.

```bash
cd ~/Construction-AI-Studio-V4/mcp/construction-studio
npm install
```

Generate a private token:

```bash
npm run token
```

Do **not** paste that token into chat or commit it.

Export it only in the shell that runs the MCP:

```bash
export CONSTRUCTION_MCP_TOKEN='PASTE_TOKEN_HERE'
```

Optional configuration:

```bash
export CONSTRUCTION_STUDIO_ROOT="$HOME/Construction-AI-Studio-V4"
export CONSTRUCTION_MCP_HOST=127.0.0.1
export CONSTRUCTION_MCP_PORT=8790
```

Start:

```bash
npm start
```

The MCP endpoint is then:

```text
http://127.0.0.1:8790/mcp/<TOKEN>
```

The protected health endpoint is:

```text
http://127.0.0.1:8790/health/<TOKEN>
```

## Local tests

Pure safety tests:

```bash
npm test
```

Real local MCP protocol handshake:

```bash
npm run smoke
```

The smoke test starts a temporary loopback server in explicit insecure-local test mode, connects with the official MCP client SDK, discovers the tools, and calls `studio_overview`.

No external AI provider is contacted.

## Connect ChatGPT

ChatGPT cannot directly dial `localhost`, so a transport from ChatGPT to this loopback MCP is still required.

Two useful approaches are:

### A. Private OpenAI Secure MCP Tunnel

Keep the MCP local and use the OpenAI tunnel client to forward MCP traffic privately. This avoids exposing the MCP server publicly.

### B. HTTPS tunnel

For a development test, a tunnel such as Cloudflare Tunnel can expose the local HTTP listener as HTTPS.

When using a public HTTPS tunnel, keep `CONSTRUCTION_MCP_TOKEN` enabled and configure the ChatGPT MCP URL with the token path:

```text
https://YOUR-TUNNEL-HOST/mcp/<TOKEN>
```

The server itself remains bound to loopback.

## First ChatGPT validation

After connecting the MCP to ChatGPT, the first safe command should be:

```text
Use the Construction AI Studio MCP.
Call studio_overview and studio_run_action(action="git_status").
Do not modify anything.
```

Then test a real project read:

```text
Read package.json and list the current .firefly workspaces.
Do not modify anything.
```

Only after read-only validation should write permissions be exercised.

## Why this exists

The MCP makes ChatGPT the supervisory intelligence while the Studio remains deterministic software:

```text
planning / visual judgment / correction
              = ChatGPT

files / jobs / state / tests / Git / FFmpeg
              = Construction AI Studio
```

External visual AI providers can remain experimental and outside the critical production path.
