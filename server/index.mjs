import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeminiVisualProvider } from './providers/gemini-visual-provider.mjs';
import { OpenAIVisualProvider } from './providers/openai-visual-provider.mjs';
import { CustomVisualProvider } from './providers/custom-visual-provider.mjs';
import {
  ProviderResponseError,
  ProviderUnavailableError,
} from './providers/provider-utils.mjs';
import { VisualSchemaValidationError } from '../shared/visual-schema.mjs';
import { recordSafeVisualDiagnostic } from './visual-diagnostics.mjs';

const PORT = Number(process.env.CONSTRUCTION_AI_PORT || 8787);
const HOST = process.env.CONSTRUCTION_AI_HOST || '127.0.0.1';
const MAX_JSON_BYTES = 11 * 1024 * 1024;
const distRoot = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const providers = [
  new GeminiVisualProvider(),
  new OpenAIVisualProvider(),
  new CustomVisualProvider(),
];

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_JSON_BYTES) throw new Error('Upload excede o limite permitido.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Corpo JSON inválido.');
  }
}

function providerDescriptors() {
  return providers.map(provider => ({
    id: provider.id,
    name: provider.name,
    kind: provider.kind,
    configured: provider.configured,
    model: provider.model,
  }));
}

function providerErrorResponse(error) {
  if (error instanceof ProviderUnavailableError) {
    return { status: 503, body: { error: error.message, code: error.code } };
  }
  if (error instanceof VisualSchemaValidationError) {
    return {
      status: 422,
      body: {
        error: 'O provider retornou dados incompatíveis com o schema visual.',
        code: 'SCHEMA_INCOMPATIBLE',
        issues: error.issues,
      },
    };
  }
  if (error instanceof ProviderResponseError) {
    return { status: error.httpStatus || 502, body: { error: error.message, code: error.code } };
  }
  return {
    status: 400,
    body: {
      error: error instanceof Error ? error.message : 'Requisição visual inválida.',
      code: 'INVALID_REQUEST',
    },
  };
}

async function handleApi(request, response, pathname) {
  if (request.method === 'GET' && pathname === '/api/visual/providers') {
    json(response, 200, { providers: providerDescriptors() });
    return true;
  }
  if (request.method === 'POST' && pathname === '/api/visual/analyze') {
    const startedAt = Date.now();
    let provider;
    try {
      const body = await readJsonBody(request);
      provider = providers.find(candidate => candidate.id === body.providerId);
      if (!provider) throw new ProviderUnavailableError(String(body.providerId || 'desconhecido'));
      const analysis = await provider.analyze(body);
      recordSafeVisualDiagnostic({
        provider: provider.id,
        model: provider.model,
        durationMs: Date.now() - startedAt,
        internalHttpStatus: 200,
        analysis,
      });
      json(response, 200, { analysis });
    } catch (error) {
      const result = providerErrorResponse(error);
      recordSafeVisualDiagnostic({
        provider: provider?.id ?? 'unknown',
        model: provider?.model,
        durationMs: Date.now() - startedAt,
        internalHttpStatus: result.status,
        schemaValidation: error instanceof VisualSchemaValidationError ? 'invalid' : 'not-run',
        errorCode: result.body.code,
      });
      json(response, result.status, result.body);
    }
    return true;
  }
  return pathname.startsWith('/api/');
}

async function serveStatic(response, pathname) {
  let requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = resolve(join(distRoot, requested));
  if (!filePath.startsWith(`${distRoot}${sep}`) && filePath !== distRoot) {
    json(response, 403, { error: 'Caminho inválido.' });
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not-file');
  } catch {
    filePath = join(distRoot, 'index.html');
  }
  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      'content-type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
    });
    response.end(data);
  } catch {
    json(response, 404, { error: 'Aplicação não construída. Execute npm run build.' });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || `${HOST}:${PORT}`}`);
  if (await handleApi(request, response, url.pathname)) {
    if (!response.writableEnded) json(response, 404, { error: 'Endpoint não encontrado.' });
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    json(response, 405, { error: 'Método não permitido.' });
    return;
  }
  await serveStatic(response, url.pathname);
});

server.listen(PORT, HOST, () => {
  const configured = providerDescriptors().filter(provider => provider.configured).map(provider => provider.id);
  console.log(`[construction-ai] http://${HOST}:${PORT} | providers: ${configured.join(', ') || 'nenhum configurado'}`);
});
