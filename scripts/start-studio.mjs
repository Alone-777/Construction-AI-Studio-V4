import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const initialImagePath = resolve(root, 'Imagem Inicial');

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
console.log('Painel Vite: o endereço será mostrado abaixo.');
if (!existsSync(resolve(root, '.env'))) {
  console.log('AVISO: .env não encontrado. O Studio inicia, mas providers externos podem ficar indisponíveis.');
}
console.log('');

const children = new Set();

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

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 50);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

launch(['run', 'server'], 'Backend');
launch(['run', 'dev'], 'Painel');
