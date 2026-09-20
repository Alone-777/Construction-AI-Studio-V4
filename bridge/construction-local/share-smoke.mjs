import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..', '..');
const PORT = 18792;
const TOKEN = 'share_smoke_token_1234567890abcdef';

const child = spawn(process.execPath, ['share-server.mjs'], {
  cwd: HERE,
  env: {
    ...process.env,
    CONSTRUCTION_STUDIO_ROOT: PROJECT_ROOT,
    CONSTRUCTION_SHARE_HOST: '127.0.0.1',
    CONSTRUCTION_SHARE_PORT: String(PORT),
    CONSTRUCTION_SHARE_TOKEN: TOKEN,
    CONSTRUCTION_SHARE_TTL_MINUTES: '5',
    CONSTRUCTION_SHARE_MAX_REQUESTS: '10',
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
      throw new Error(`Share server exited early with code ${child.exitCode}. stderr: ${stderr}`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (response.ok) return await response.json();
    } catch {
      // Not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Share server did not become healthy. stderr: ${stderr}`);
}

try {
  const health = await waitForHealth();
  assert.equal(health.ok, true);
  assert.equal(health.readOnly, true);

  const wrong = await fetch(`http://127.0.0.1:${PORT}/s/wrong-token/supervisor`);
  assert.equal(wrong.status, 404);

  const supervisor = await fetch(`http://127.0.0.1:${PORT}/s/${TOKEN}/supervisor`);
  assert.equal(supervisor.status, 200);
  const supervisorJson = await supervisor.json();
  assert.equal(supervisorJson.ok, true);
  assert.equal(supervisorJson.result.policy.writeMode, 'readonly');

  const review = await fetch(`http://127.0.0.1:${PORT}/s/${TOKEN}/review`);
  assert.equal(review.status, 200);
  const reviewJson = await review.json();
  assert.equal(reviewJson.ok, true);
  assert.equal(reviewJson.result.reviewReady, false);

  const post = await fetch(`http://127.0.0.1:${PORT}/s/${TOKEN}/supervisor`, { method: 'POST' });
  assert.equal(post.status, 405);

  console.log('SHARE_SMOKE_PASS auth=ok readonly=ok supervisor=ok review=ok post_blocked=ok');
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
