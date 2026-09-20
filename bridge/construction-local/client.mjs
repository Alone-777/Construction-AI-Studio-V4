import WebSocket from 'ws';

const HOST = process.env.CONSTRUCTION_BRIDGE_HOST || '127.0.0.1';
const PORT = Number(process.env.CONSTRUCTION_BRIDGE_PORT || 8791);
const TOKEN = process.env.CONSTRUCTION_BRIDGE_TOKEN || '';

if (!TOKEN) {
  throw new Error('CONSTRUCTION_BRIDGE_TOKEN is required.');
}

const [command = 'overview', ...args] = process.argv.slice(2);

function buildRequest() {
  if (command === 'overview') {
    return { id: 'cli-overview', op: 'overview' };
  }

  if (command === 'request') {
    const raw = args.join(' ').trim();
    if (!raw) throw new Error('Usage: npm run client -- request \'{"id":"1","op":"overview"}\'');
    const request = JSON.parse(raw);
    if (!request.id) request.id = `cli-${Date.now()}`;
    return request;
  }

  throw new Error('Supported commands: overview, request');
}

const request = buildRequest();
const ws = new WebSocket(`ws://${HOST}:${PORT}/bridge`);

function waitFor(predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for bridge response.'));
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

try {
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  ws.send(JSON.stringify({ type: 'auth', token: TOKEN }));
  await waitFor((message) => message.type === 'auth_ok');

  ws.send(JSON.stringify(request));
  const response = await waitFor((message) => message.id === request.id, 30_000);
  process.stdout.write(JSON.stringify(response, null, 2) + '\n');

  if (!response.ok) process.exitCode = 1;
} finally {
  ws.close();
}
