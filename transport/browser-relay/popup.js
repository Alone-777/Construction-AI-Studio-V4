const endpointEl = document.getElementById('endpoint');
const tokenEl = document.getElementById('token');
const requestEl = document.getElementById('request');
const outputEl = document.getElementById('output');
const statusEl = document.getElementById('status');

function setStatus(message, ok = null) {
  statusEl.textContent = message;
  statusEl.className = 'status';
  if (ok === true) statusEl.classList.add('ok');
  if (ok === false) statusEl.classList.add('err');
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

async function loadSettings() {
  const saved = await chrome.storage.local.get(['constructionBridgeEndpoint', 'constructionBridgeToken']);
  if (saved.constructionBridgeEndpoint) endpointEl.value = saved.constructionBridgeEndpoint;
  if (saved.constructionBridgeToken) tokenEl.value = saved.constructionBridgeToken;
}

async function saveSettings() {
  const endpoint = endpointEl.value.trim();
  const token = tokenEl.value.trim();

  if (!/^ws:\/\/127\.0\.0\.1:\d+\/bridge$/.test(endpoint)) {
    throw new Error('Use apenas o bridge local ws://127.0.0.1:PORTA/bridge.');
  }

  if (!/^[A-Za-z0-9_-]{24,128}$/.test(token)) {
    throw new Error('Token inválido.');
  }

  await chrome.storage.local.set({
    constructionBridgeEndpoint: endpoint,
    constructionBridgeToken: token,
  });
}

function openBridge(endpoint, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint);
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error('Tempo esgotado ao conectar ao bridge.'));
    }, 5000);

    const fail = (error) => {
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error('Falha no WebSocket.'));
    };

    ws.addEventListener('error', fail, { once: true });

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token }));
    }, { once: true });

    const onMessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message?.type !== 'auth_ok') return;
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      resolve(ws);
    };

    ws.addEventListener('message', onMessage);
  });
}

function sendAndWait(ws, request) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Tempo esgotado esperando resposta.'));
    }, 30000);

    const onMessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message?.id !== request.id) return;
      clearTimeout(timeout);
      ws.removeEventListener('message', onMessage);
      resolve(message);
    };

    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify(request));
  });
}

async function runRequest(request) {
  setStatus('Conectando...');
  outputEl.textContent = '{}';

  await saveSettings();

  const endpoint = endpointEl.value.trim();
  const token = tokenEl.value.trim();
  const ws = await openBridge(endpoint, token);

  try {
    setStatus('Autenticado. Enviando requisição...');
    const response = await sendAndWait(ws, request);
    outputEl.textContent = pretty(response);
    setStatus(response.ok ? 'Resposta recebida.' : 'Bridge recusou a operação.', response.ok);
  } finally {
    ws.close();
  }
}

document.getElementById('save').addEventListener('click', async () => {
  try {
    await saveSettings();
    setStatus('Configuração salva localmente.', true);
  } catch (error) {
    setStatus(error.message, false);
  }
});

document.getElementById('overview').addEventListener('click', async () => {
  try {
    await runRequest({
      id: `overview-${Date.now()}`,
      op: 'overview',
    });
  } catch (error) {
    outputEl.textContent = pretty({ ok: false, error: error.message });
    setStatus(error.message, false);
  }
});

document.getElementById('send').addEventListener('click', async () => {
  try {
    const request = JSON.parse(requestEl.value);
    if (!request.id) request.id = `manual-${Date.now()}`;
    await runRequest(request);
  } catch (error) {
    outputEl.textContent = pretty({ ok: false, error: error.message });
    setStatus(error.message, false);
  }
});

loadSettings().catch((error) => setStatus(error.message, false));
