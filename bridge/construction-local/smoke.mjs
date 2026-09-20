import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import WebSocket from 'ws';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..', '..');
const PORT = 18791;
const TOKEN = 'smoke_test_token_1234567890abcdef';

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: HERE,
  env: {
    ...process.env,
    CONSTRUCTION_STUDIO_ROOT: PROJECT_ROOT,
    CONSTRUCTION_BRIDGE_HOST: '127.0.0.1',
    CONSTRUCTION_BRIDGE_PORT: String(PORT),
    CONSTRUCTION_BRIDGE_TOKEN: TOKEN,
    CONSTRUCTION_BRIDGE_WRITE_MODE: 'readonly',
    CONSTRUCTION_BRIDGE_ALLOW_PUSH: 'false',
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString('utf8');
});

async function waitForHealth() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Bridge exited early with code ${child.exitCode}. stderr: ${stderr}`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (response.ok) return await response.json();
    } catch {
      // Not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Bridge did not become healthy. stderr: ${stderr}`);
}

function waitForMessage(ws, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WebSocket message.'));
    }, timeoutMs);

    const onMessage = (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString('utf8'));
      } catch {
        return;
      }

      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
    };

    ws.on('message', onMessage);
    ws.on('error', onError);
  });
}

let ws;
try {
  const health = await waitForHealth();
  assert.equal(health.ok, true);
  assert.equal(health.writeMode, 'readonly');

  ws = new WebSocket(`ws://127.0.0.1:${PORT}/bridge`);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  ws.send(JSON.stringify({ type: 'auth', token: TOKEN }));
  const auth = await waitForMessage(ws, (message) => message.type === 'auth_ok');
  assert.equal(auth.protocol, 'construction-local-bridge/0.1');
  assert.equal(auth.capabilities.writeMode, 'readonly');

  ws.send(JSON.stringify({ id: 'overview-1', op: 'overview' }));
  const overview = await waitForMessage(ws, (message) => message.id === 'overview-1');
  assert.equal(overview.ok, true);
  assert.ok(overview.result.projectRoot.endsWith('Construction-AI-Studio-V4') || overview.result.projectRoot.includes('Construction-AI-Studio'));
  assert.equal(overview.result.policy.writeMode, 'readonly');

  ws.send(JSON.stringify({
    id: 'blocked-write',
    op: 'write_file',
    path: 'bridge-smoke-should-not-exist.txt',
    content: 'blocked',
  }));
  const blocked = await waitForMessage(ws, (message) => message.id === 'blocked-write');
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /read-only/i);

  console.log('BRIDGE_SMOKE_PASS auth=ok overview=ok readonly_gate=ok');
} finally {
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
