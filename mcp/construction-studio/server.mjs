import { createServer as createHttpServer } from 'node:http';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import {
  MAX_IMAGE_BYTES,
  MAX_TEXT_BYTES,
  assertWritablePath,
  buildNamedAction,
  fileMeta,
  normalizeRelativePath,
  resolveExistingPath,
  resolveWritePath,
  runProcess,
  sha256,
} from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(process.env.CONSTRUCTION_STUDIO_ROOT || path.join(HERE, '..', '..'));
const HOST = process.env.CONSTRUCTION_MCP_HOST || '127.0.0.1';
const PORT = Number(process.env.CONSTRUCTION_MCP_PORT || 8790);
const TOKEN = process.env.CONSTRUCTION_MCP_TOKEN || '';
const INSECURE_LOCAL = process.env.CONSTRUCTION_MCP_INSECURE_LOCAL === 'true';

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('CONSTRUCTION_MCP_PORT must be a valid TCP port.');
}

if (!TOKEN && !INSECURE_LOCAL) {
  throw new Error(
    'Set CONSTRUCTION_MCP_TOKEN to a random 24+ character value. ' +
    'For loopback-only development, CONSTRUCTION_MCP_INSECURE_LOCAL=true may be used explicitly.'
  );
}

if (TOKEN && !/^[A-Za-z0-9_-]{24,128}$/.test(TOKEN)) {
  throw new Error('CONSTRUCTION_MCP_TOKEN must be 24-128 characters using only letters, numbers, _ or -.');
}

const MCP_PATH = TOKEN ? `/mcp/${TOKEN}` : '/mcp';
const HEALTH_PATH = TOKEN ? `/health/${TOKEN}` : '/health';

function textResult(value, { isError = false } = {}) {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

async function safeTool(handler) {
  try {
    return await handler();
  } catch (error) {
    return textResult({ error: error instanceof Error ? error.message : String(error) }, { isError: true });
  }
}

async function listWorkspaces() {
  const firefly = path.join(PROJECT_ROOT, '.firefly');
  try {
    const entries = await readdir(firefly, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function buildMcpServer() {
  const server = new McpServer({
    name: 'construction-ai-studio-control',
    version: '0.1.0',
  });

  server.registerTool(
    'studio_overview',
    {
      title: 'Construction AI Studio overview',
      description: 'Read current project status, branch, latest commit and available Firefly workspaces. Does not modify files.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => safeTool(async () => {
      const [gitStatus, latestCommit, workspaces] = await Promise.all([
        runProcess(PROJECT_ROOT, 'git', ['status', '--short', '--branch'], { timeoutMs: 30_000 }),
        runProcess(PROJECT_ROOT, 'git', ['log', '-1', '--oneline'], { timeoutMs: 30_000 }),
        listWorkspaces(),
      ]);

      return textResult({
        projectRoot: PROJECT_ROOT,
        gitStatus,
        latestCommit,
        fireflyWorkspaces: workspaces,
      });
    })
  );

  server.registerTool(
    'studio_list_directory',
    {
      title: 'List project directory',
      description: 'List one directory inside Construction AI Studio. Secret/internal paths are blocked.',
      inputSchema: z.object({ path: z.string().default('.') }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ path: requestedPath }) => safeTool(async () => {
      const { rel, absolute } = await resolveExistingPath(PROJECT_ROOT, requestedPath);
      const info = await stat(absolute);
      if (!info.isDirectory()) throw new Error('Requested path is not a directory.');

      const entries = (await readdir(absolute, { withFileTypes: true }))
        .slice(0, 500)
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        }));

      return textResult({ path: rel, entries });
    })
  );

  server.registerTool(
    'studio_read_file',
    {
      title: 'Read project text file',
      description: 'Read a UTF-8 project file and return its SHA-256 for safe subsequent edits. Secrets such as .env are blocked.',
      inputSchema: z.object({ path: z.string().min(1) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ path: requestedPath }) => safeTool(async () => {
      const { rel, absolute } = await resolveExistingPath(PROJECT_ROOT, requestedPath);
      const meta = await fileMeta(absolute);
      if (!meta.isFile) throw new Error('Requested path is not a file.');
      if (meta.size > MAX_TEXT_BYTES) throw new Error(`Text file is too large (${meta.size} bytes).`);

      const buffer = await readFile(absolute);
      return textResult({
        path: rel,
        sha256: sha256(buffer),
        size: meta.size,
        modifiedAt: meta.modifiedAt,
        content: buffer.toString('utf8'),
      });
    })
  );

  server.registerTool(
    'studio_read_image',
    {
      title: 'Read project image',
      description: 'Return a PNG/JPEG/WebP image from the project, including Firefly review contact sheets, so ChatGPT can inspect it visually.',
      inputSchema: z.object({ path: z.string().min(1) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ path: requestedPath }) => safeTool(async () => {
      const { rel, absolute } = await resolveExistingPath(PROJECT_ROOT, requestedPath);
      const ext = path.extname(rel).toLowerCase();
      const mimeType = ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.webp'
            ? 'image/webp'
            : null;

      if (!mimeType) throw new Error('Only PNG, JPEG and WebP images are allowed.');
      const meta = await fileMeta(absolute);
      if (!meta.isFile) throw new Error('Requested path is not a file.');
      if (meta.size > MAX_IMAGE_BYTES) throw new Error(`Image is too large (${meta.size} bytes).`);

      const buffer = await readFile(absolute);
      return {
        content: [
          { type: 'text', text: JSON.stringify({ path: rel, size: meta.size, sha256: sha256(buffer) }, null, 2) },
          { type: 'image', data: buffer.toString('base64'), mimeType },
        ],
      };
    })
  );

  server.registerTool(
    'studio_write_file',
    {
      title: 'Write project text file',
      description: 'Create or replace a project text file. Overwrites require the SHA-256 returned by studio_read_file. Secret files and .firefly state are blocked.',
      inputSchema: z.object({
        path: z.string().min(1),
        content: z.string(),
        expectedSha256: z.string().length(64).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ path: requestedPath, content, expectedSha256 }) => safeTool(async () => {
      if (Buffer.byteLength(content, 'utf8') > MAX_TEXT_BYTES) {
        throw new Error('Content exceeds the maximum text write size.');
      }

      const { rel, absolute } = await resolveWritePath(PROJECT_ROOT, requestedPath);
      let existed = false;

      try {
        const current = await readFile(absolute);
        existed = true;
        if (!expectedSha256) throw new Error('expectedSha256 is required when overwriting an existing file.');
        if (sha256(current) !== expectedSha256) throw new Error('File changed since it was read; SHA-256 does not match.');
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }

      await writeFile(absolute, content, 'utf8');
      const written = await readFile(absolute);
      return textResult({ path: rel, created: !existed, sha256: sha256(written), bytes: written.length });
    })
  );

  server.registerTool(
    'studio_replace_text',
    {
      title: 'Replace exact text in project file',
      description: 'Replace exact text in one project file. Optional SHA-256 prevents stale edits. Secret files and .firefly state are blocked.',
      inputSchema: z.object({
        path: z.string().min(1),
        search: z.string().min(1),
        replace: z.string(),
        expectedOccurrences: z.number().int().min(1).max(100).default(1),
        expectedSha256: z.string().length(64).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ path: requestedPath, search, replace, expectedOccurrences, expectedSha256 }) => safeTool(async () => {
      const { rel, absolute } = await resolveWritePath(PROJECT_ROOT, requestedPath);
      const current = await readFile(absolute);
      if (current.length > MAX_TEXT_BYTES) throw new Error('File exceeds the maximum text edit size.');
      if (expectedSha256 && sha256(current) !== expectedSha256) {
        throw new Error('File changed since it was read; SHA-256 does not match.');
      }

      const text = current.toString('utf8');
      const occurrences = text.split(search).length - 1;
      if (occurrences !== expectedOccurrences) {
        throw new Error(`Expected ${expectedOccurrences} occurrence(s), found ${occurrences}.`);
      }

      const updated = text.split(search).join(replace);
      await writeFile(absolute, updated, 'utf8');
      const written = Buffer.from(updated, 'utf8');
      return textResult({ path: rel, replacedOccurrences: occurrences, sha256: sha256(written), bytes: written.length });
    })
  );

  server.registerTool(
    'studio_run_action',
    {
      title: 'Run approved Construction AI Studio action',
      description: 'Run a deterministic allowlisted action. Arbitrary shell commands and external visual-AI review actions are intentionally not exposed.',
      inputSchema: z.object({
        action: z.enum([
          'test',
          'build',
          'git_status',
          'git_diff_check',
          'git_diff',
          'git_log',
          'git_pull',
          'git_push',
          'firefly_status',
          'firefly_prompt',
          'firefly_complete',
        ]),
        workspace: z.string().optional(),
        jobId: z.string().optional(),
        paths: z.array(z.string()).max(50).optional(),
        count: z.number().int().min(1).max(50).optional(),
        remote: z.string().regex(/^[A-Za-z0-9._-]+$/).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async (args) => safeTool(async () => {
      if (args.paths) args.paths = args.paths.map((item) => normalizeRelativePath(item));
      const spec = buildNamedAction(args.action, args);
      const result = await runProcess(PROJECT_ROOT, spec.command, spec.argv, { timeoutMs: spec.timeoutMs });
      return textResult({ action: args.action, command: [spec.command, ...spec.argv], result });
    })
  );

  server.registerTool(
    'studio_git_stage',
    {
      title: 'Stage selected Git files',
      description: 'Stage only explicitly named project paths. Secret/internal paths and .firefly state are blocked.',
      inputSchema: z.object({ paths: z.array(z.string().min(1)).min(1).max(100) }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ paths }) => safeTool(async () => {
      const safePaths = paths.map((item) => assertWritablePath(item));
      const result = await runProcess(PROJECT_ROOT, 'git', ['add', '--', ...safePaths], { timeoutMs: 60_000 });
      return textResult({ stagedPaths: safePaths, result });
    })
  );

  server.registerTool(
    'studio_git_commit',
    {
      title: 'Commit staged Git changes',
      description: 'Create a Git commit from already staged files. This tool never stages files automatically.',
      inputSchema: z.object({ message: z.string().min(1).max(200) }),
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ message }) => safeTool(async () => {
      const result = await runProcess(PROJECT_ROOT, 'git', ['commit', '-m', message], { timeoutMs: 60_000 });
      return textResult({ message, result });
    })
  );

  return server;
}

const handler = createMcpHandler(buildMcpServer);
const nodeHandler = toNodeHandler(handler);

function rejectBrowserOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return false;

  try {
    const parsed = new URL(origin);
    const allowed = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1';
    if (allowed) return false;
  } catch {
    // Fall through to rejection.
  }

  res.writeHead(403, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ error: 'forbidden_origin' }));
  return true;
}

const httpServer = createHttpServer((req, res) => {
  if (rejectBrowserOrigin(req, res)) return;

  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

  if (req.method === 'GET' && url.pathname === HEALTH_PATH) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({
      ok: true,
      service: 'construction-ai-studio-control',
      version: '0.1.0',
      mcpPathProtected: Boolean(TOKEN),
    }));
    return;
  }

  if (url.pathname !== MCP_PATH) {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  void nodeHandler(req, res);
});

httpServer.listen(PORT, HOST, () => {
  console.error(`[construction-mcp] listening on http://${HOST}:${PORT}`);
  console.error(`[construction-mcp] project root: ${PROJECT_ROOT}`);
  console.error(`[construction-mcp] MCP endpoint: ${TOKEN ? '/mcp/<token>' : '/mcp'}`);
});

async function shutdown(signal) {
  console.error(`[construction-mcp] shutting down on ${signal}`);
  httpServer.close();
  await handler.close();
}

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
