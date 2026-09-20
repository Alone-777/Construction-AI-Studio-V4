import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AuditLog, createBridgeExecutor, validateToken } from './core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(
  process.env.CONSTRUCTION_STUDIO_ROOT || path.join(HERE, '..', '..')
);
const HOST = process.env.CONSTRUCTION_SHARE_HOST || '127.0.0.1';
const PORT = Number(process.env.CONSTRUCTION_SHARE_PORT || 8792);
const TOKEN = process.env.CONSTRUCTION_SHARE_TOKEN || '';
const DEFAULT_WORKSPACE = process.env.CONSTRUCTION_SHARE_WORKSPACE || '';
const TTL_MINUTES = Number(process.env.CONSTRUCTION_SHARE_TTL_MINUTES || 30);
const MAX_REQUESTS = Number(process.env.CONSTRUCTION_SHARE_MAX_REQUESTS || 50);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('CONSTRUCTION_SHARE_PORT must be a valid TCP port.');
}
if (!validateToken(TOKEN)) {
  throw new Error('CONSTRUCTION_SHARE_TOKEN must be a random 24-128 character URL-safe token.');
}
if (!Number.isFinite(TTL_MINUTES) || TTL_MINUTES < 1 || TTL_MINUTES > 240) {
  throw new Error('CONSTRUCTION_SHARE_TTL_MINUTES must be between 1 and 240.');
}
if (!Number.isInteger(MAX_REQUESTS) || MAX_REQUESTS < 1 || MAX_REQUESTS > 500) {
  throw new Error('CONSTRUCTION_SHARE_MAX_REQUESTS must be between 1 and 500.');
}

const audit = new AuditLog();
const executor = createBridgeExecutor({
  projectRoot: PROJECT_ROOT,
  policy: { writeMode: 'readonly', allowPush: false },
  audit,
});

const startedAt = Date.now();
const expiresAt = startedAt + TTL_MINUTES * 60_000;
let requestCount = 0;

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(value, null, 2));
}

function sendImage(res, image) {
  const bytes = Buffer.from(image.dataBase64, 'base64');
  res.writeHead(200, {
    'content-type': image.mimeType,
    'content-length': String(bytes.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(bytes);
}

function parseSharePath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length !== 3 || parts[0] !== 's') return null;
  return { token: parts[1], resource: parts[2] };
}

function currentWorkspace(url) {
  return url.searchParams.get('workspace') || DEFAULT_WORKSPACE || undefined;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || HOST}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'construction-ai-read-share',
        version: '0.1.0',
        readOnly: true,
        expiresAt: new Date(expiresAt).toISOString(),
        remainingRequests: Math.max(0, MAX_REQUESTS - requestCount),
      });
      return;
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
      return;
    }

    const share = parseSharePath(url.pathname);
    if (!share || share.token !== TOKEN) {
      sendJson(res, 404, { ok: false, error: 'not_found' });
      return;
    }

    if (Date.now() >= expiresAt) {
      sendJson(res, 410, { ok: false, error: 'share_expired' });
      return;
    }

    if (requestCount >= MAX_REQUESTS) {
      sendJson(res, 429, { ok: false, error: 'share_request_limit_reached' });
      return;
    }

    requestCount += 1;
    const workspace = currentWorkspace(url);
    await audit.write({
      event: 'share_request',
      resource: share.resource,
      workspace: workspace ?? null,
      requestCount,
      remoteAddress: req.socket.remoteAddress ?? null,
    });

    if (share.resource === 'supervisor') {
      const response = await executor.execute({
        id: `share-supervisor-${requestCount}`,
        op: 'supervisor_bundle',
        workspace,
      });
      sendJson(res, response.ok ? 200 : 400, response);
      return;
    }

    if (share.resource === 'review') {
      const response = await executor.execute({
        id: `share-review-${requestCount}`,
        op: 'review_bundle',
        workspace,
        includeImages: false,
      });
      sendJson(res, response.ok ? 200 : 400, response);
      return;
    }

    if (share.resource === 'source' || share.resource === 'contact') {
      const response = await executor.execute({
        id: `share-image-${requestCount}`,
        op: 'review_bundle',
        workspace,
        includeImages: true,
      });

      if (!response.ok) {
        sendJson(res, 400, response);
        return;
      }

      const image = share.resource === 'source'
        ? response.result?.images?.sourceFrame
        : response.result?.images?.contactSheet;

      if (!image?.dataBase64 || !image?.mimeType) {
        sendJson(res, 404, { ok: false, error: `${share.resource}_image_unavailable` });
        return;
      }

      sendImage(res, image);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'resource_not_found' });
  } catch (error) {
    await audit.write({
      event: 'share_error',
      error: error instanceof Error ? error.message : String(error),
    });
    sendJson(res, 500, { ok: false, error: 'internal_error' });
  }
});

server.listen(PORT, HOST, async () => {
  await audit.write({
    event: 'share_server_started',
    host: HOST,
    port: PORT,
    projectRoot: PROJECT_ROOT,
    expiresAt: new Date(expiresAt).toISOString(),
    maxRequests: MAX_REQUESTS,
  });

  console.error(`[construction-share] listening on http://${HOST}:${PORT}`);
  console.error('[construction-share] mode: READ ONLY');
  console.error(`[construction-share] expires: ${new Date(expiresAt).toISOString()}`);
  console.error(`[construction-share] max requests: ${MAX_REQUESTS}`);
});

async function shutdown(signal) {
  await audit.write({ event: 'share_server_stopping', signal });
  server.close();
}

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
