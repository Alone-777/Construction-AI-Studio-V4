import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const root = process.cwd();

if (!process.env.WSL_INTEROP && !process.env.WSL_DISTRO_NAME) {
  console.error('Este instalador deve ser executado dentro do Ubuntu/WSL.');
  process.exit(1);
}

if (!existsSync(resolve(root, 'package.json'))) {
  console.error('Execute este comando na raiz do Construction AI Studio.');
  process.exit(1);
}

const relayInstaller = resolve(homedir(), 'Construction-AI-Relay', 'scripts', 'install-operator-mode.sh');

if (!existsSync(relayInstaller)) {
  console.error('Não encontrei o Construction AI Relay em ~/Construction-AI-Relay.');
  console.error('Atualize ou clone o Relay antes de instalar o botão operacional.');
  process.exit(1);
}

const result = spawnSync('bash', [relayInstaller], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  console.error('');
  console.error('NÃO FOI POSSÍVEL INSTALAR O MODO OPERADOR.');
  console.error('');
  process.exit(result.status || 1);
}

console.log('');
console.log('BOTÃO OPERACIONAL INSTALADO');
console.log('O atalho "Construction AI Studio" agora abre somente o Operator Panel:');
console.log('http://127.0.0.1:8793');
console.log('');
console.log('Bridge + Relay + Panel ficam ligados como infraestrutura persistente.');
console.log('As portas 5173 e 8787 ficam reservadas para desenvolvimento/diagnóstico.');
console.log('');
