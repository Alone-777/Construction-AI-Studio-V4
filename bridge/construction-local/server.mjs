import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocketServer } from 'ws';

import { AuditLog, createBridgeExecutor, validateToken } from './core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(
  process.env.CONSTRUCTION_STUDIO_ROOT || path.join(HERE, '..', '..')
);
const HOST = process.env.CONSTRUCTION_BRIDGE_HOST || '127.0.0.1';
const PORT = Number(process.env.CONSTRUCTION_BRIDGE_PORT || 8791);
const TOKEN = process.env.CONSTRUCTION_BRIDGE_TOKEN || '';
const WRITE_MODE = process.env.CONSTRUCTION_BRIDGE_WRITE_MODE === 'allow' ? 'allow' : 'readonly';
const ALLOW_PUSH = process.env.CONSTRUCTION_BRIDGE_ALLOW_PUSH === 'true';

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('CONSTRUCTION_BRIDGE_PORT must be a valid TCP port.');
}

if (!validateToken(TOKEN)) {
  throw new Error('CONSTRUCTION_BRIDGE_TOKEN must be a random 24-128 character URL-safe token.');
}

const audit = new AuditLog();
const executor = createBridgeExecutor({
  projectRoot: PROJECT_ROOT,
  policy: { writeMode: WRITE_MODE, allowPush: ALLOW_PUSH },
  audit,
});

const httpServer = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || HOST}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify({
      ok: true,
      service: 'construction-ai-local-bridge',
      version: '0.1.0',
      projectRoot: PROJECT_ROOT,
      writeMode: WRITE_MODE,
      allowPush: ALLOW_PUSH,
    }));
    return;
  }

  res.writeHead(404, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify({ error: 'not_found' }));
});

const wss = new WebSocketServer({
  server: httpServer,
  path: '/bridge',
  maxPayload: 4 * 1024 * 1024,
});

wss.on('connection', (socket, request) => {
  let authenticated = false;
  let requestCount = 0;
  const openedAt = Date.now();

  const closeUnauthorized = async (reason) => {
    await audit.write({
      event: 'connection_rejected',
      reason,
      remoteAddress: request.socket.remoteAddress ?? null,
    });
    socket.close(1008, 'unauthorized');
  };

  const authTimer = setTimeout(() => {
    if (!authenticated) void closeUnauthorized('auth_timeout');
  }, 5000);

  socket.on('message', async (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString('utf8'));
    } catch {
      socket.send(JSON.stringify({ id: null, ok: false, error: 'invalid_json' }));
      return;
    }

    if (!authenticated) {
      if (message?.type !== 'auth' || message?.token !== TOKEN) {
        clearTimeout(authTimer);
        await closeUnauthorized('invalid_token');
        return;
      }

      authenticated = true;
      clearTimeout(authTimer);
      await audit.write({
        event: 'connection_authenticated',
        remoteAddress: request.socket.remoteAddress ?? null,
      });
      socket.send(JSON.stringify({
        type: 'auth_ok',
        protocol: 'construction-local-bridge/0.1',
        capabilities: {
          writeMode: WRITE_MODE,
          allowPush: ALLOW_PUSH,
        },
      }));
      return;
    }

    requestCount += 1;
    if (requestCount > 500) {
      socket.send(JSON.stringify({ id: message?.id ?? null, ok: false, error: 'session_request_limit' }));
      socket.close(1008, 'session_request_limit');
      return;
    }

    const response = await executor.execute(message);
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(response));
    }
  });

  socket.on('close', async () => {
    clearTimeout(authTimer);
    await audit.write({
      event: 'connection_closed',
      authenticated,
      requestCount,
      durationMs: Date.now() - openedAt,
      remoteAddress: request.socket.remoteAddress ?? null,
    });
  });
});

httpServer.listen(PORT, HOST, async () => {
  await audit.write({
    event: 'server_started',
    host: HOST,
    port: PORT,
    projectRoot: PROJECT_ROOT,
    writeMode: WRITE_MODE,
    allowPush: ALLOW_PUSH,
  });

  console.error(`[construction-bridge] listening on http://${HOST}:${PORT}`);
  console.error(`[construction-bridge] websocket: ws://${HOST}:${PORT}/bridge`);
  console.error(`[construction-bridge] project root: ${PROJECT_ROOT}`);
  console.error(`[construction-bridge] write mode: ${WRITE_MODE}`);
  console.error(`[construction-bridge] git push: ${ALLOW_PUSH ? 'enabled' : 'disabled'}`);
});

async function shutdown(signal) {
  await audit.write({ event: 'server_stopping', signal });
  for (const client of wss.clients) client.close(1001, 'server_shutdown');
  wss.close();
  httpServer.close();
}

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
