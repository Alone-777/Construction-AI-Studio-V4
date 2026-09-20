import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { get } from 'node:http';
import { resolve } from 'node:path';

const root = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const initialImagePath = resolve(root, 'Imagem Inicial');
const panelUrl = 'http://127.0.0.1:5173';

if (!existsSync(resolve(root, 'package.json'))) {
  console.error('ERRO: execute este comando na raiz do Construction AI Studio.');
  process.exit(1);
}

if (!existsSync(resolve(root, 'node_modules'))) {
  console.error('ERRO: dependências ausentes. Execute primeiro: npm install');
  process.exit(1);
}

console.log('');
console.log('CONSTRUCTION AI STUDIO');
console.log('Raiz:', root);
console.log('Imagem Inicial:', initialImagePath);
console.log('Backend: http://127.0.0.1:8787');
console.log('Painel:', panelUrl);
if (!existsSync(resolve(root, '.env'))) {
  console.log('AVISO: .env não encontrado. O Studio inicia, mas providers externos podem ficar indisponíveis.');
}
console.log('');

const children = new Set();
let browserOpened = false;

function launch(args, label) {
  const child = spawn(npmCommand, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (signal) return;
    if (code && code !== 0) {
      console.error(`${label} encerrou com código ${code}.`);
      shutdown(code);
    }
  });
  return child;
}

function openBrowser() {
  if (browserOpened) return;
  browserOpened = true;

  if (process.env.WSL_DISTRO_NAME) {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Start-Process '${panelUrl}'`,
    ], {
      cwd: root,
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
    return;
  }

  if (process.platform === 'win32') {
    const child = spawn('cmd.exe', ['/c', 'start', '', panelUrl], {
      cwd: root,
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
    return;
  }

  const child = spawn('xdg-open', [panelUrl], {
    cwd: root,
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
}

function waitForPanel(attempt = 0) {
  const request = get(panelUrl, response => {
    response.resume();
    if ((response.statusCode ?? 500) < 500) {
      console.log('Painel pronto. Abrindo navegador...');
      openBrowser();
      return;
    }
    retry(attempt);
  });
  request.setTimeout(1000, () => request.destroy());
  request.on('error', () => retry(attempt));
}

function retry(attempt) {
  if (attempt >= 60) {
    console.error('AVISO: o painel não respondeu em 60 segundos. Abra manualmente:', panelUrl);
    return;
  }
  setTimeout(() => waitForPanel(attempt + 1), 1000);
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 50);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

launch(['run', 'server'], 'Backend');
launch(['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], 'Painel');
waitForPanel();
