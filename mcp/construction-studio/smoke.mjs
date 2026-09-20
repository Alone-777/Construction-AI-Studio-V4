import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..', '..');
const PORT = 18790;
const BASE = `http://127.0.0.1:${PORT}`;

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: HERE,
  env: {
    ...process.env,
    CONSTRUCTION_STUDIO_ROOT: PROJECT_ROOT,
    CONSTRUCTION_MCP_HOST: '127.0.0.1',
    CONSTRUCTION_MCP_PORT: String(PORT),
    CONSTRUCTION_MCP_INSECURE_LOCAL: 'true',
    CONSTRUCTION_MCP_TOKEN: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString('utf8');
});

async function waitForHealth() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) return;
    } catch {
      // Server is not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`MCP server did not become healthy. stderr: ${stderr}`);
}

let client;
try {
  await waitForHealth();

  client = new Client(
    { name: 'construction-mcp-smoke', version: '0.1.0' },
    { versionNegotiation: { mode: 'auto' } }
  );

  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`));
  await client.connect(transport);

  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name);

  for (const expected of [
    'studio_overview',
    'studio_list_directory',
    'studio_read_file',
    'studio_read_image',
    'studio_write_file',
    'studio_replace_text',
    'studio_run_action',
    'studio_git_stage',
    'studio_git_commit',
  ]) {
    assert.ok(names.includes(expected), `Missing MCP tool: ${expected}`);
  }

  const overview = await client.callTool({ name: 'studio_overview', arguments: {} });
  assert.notEqual(overview.isError, true, JSON.stringify(overview.content));
  assert.ok(Array.isArray(overview.content) && overview.content.length > 0);

  console.log(`SMOKE_PASS tools=${tools.length} protocol=${client.getNegotiatedProtocolVersion?.() ?? client.getProtocolEra?.() ?? 'connected'}`);
} finally {
  if (client) await client.close().catch(() => {});
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
