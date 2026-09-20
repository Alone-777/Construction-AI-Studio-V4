# Construction AI Browser Relay

This Chrome/Edge extension is a **local transport test** for the Construction AI Local Bridge.

It does not scrape ChatGPT, inject scripts into ChatGPT, read conversation content, or automate the ChatGPT interface.

Its purpose is to prove this path independently:

```text
Browser extension
      |
      v
ws://127.0.0.1:8791/bridge
      |
      v
Construction Local Bridge
      |
      v
Construction-AI-Studio-V4
```

## Install

1. Start the local bridge first.
2. Open `edge://extensions` or `chrome://extensions`.
3. Enable Developer mode.
4. Choose **Load unpacked**.
5. Select this directory:
   `transport/browser-relay`
6. Open the extension popup.
7. Enter the same local bridge token.
8. Click **Testar overview**.

The token is stored only in the browser extension local storage.

## Expected result

The output should contain:

```json
{
  "ok": true,
  "result": {
    "projectRoot": "...Construction-AI-Studio-V4",
    "policy": {
      "writeMode": "readonly",
      "allowPush": false
    }
  }
}
```

## Security boundary

The extension accepts only a loopback endpoint matching:

```text
ws://127.0.0.1:PORT/bridge
```

It has no content script and no permission to inspect webpages.

This is intentional. The browser-to-bridge layer is tested separately from any future ChatGPT transport.


## Supervisor bundle

The popup exposes **Supervisor bundle**. Enter a Firefly workspace name and the bridge returns a single read-only context package containing:

- Git status, diff check and recent commits
- queue totals and current job id
- current job definition and runtime state
- effective prompt, including retry prompt when applicable
- source descriptor, checklist and negative constraints
- source/video/last-frame paths
- latest available contact-sheet path
- downstream blocked jobs
- a deterministic next-action label

Use **Copiar resultado** to copy the JSON response without giving the extension permission to inspect any webpage.

The older `supervisor_snapshot` operation remains available through manual JSON requests for lightweight diagnostics.
