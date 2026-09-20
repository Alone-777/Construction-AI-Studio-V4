import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const initialImagePath = resolve(root, 'Imagem Inicial');
const imageExtensions = /\.(jpe?g|png|webp)$/i;

console.log('');
console.log('=== CONSTRUCTION AI · VERIFICAÇÃO ===');
console.log('Raiz do Studio:', root);
console.log('Imagem Inicial:', initialImagePath);
console.log('');

let problems = 0;

function check(label, ok, hint = '') {
  console.log(`${ok ? 'OK' : 'FALTA'}  ${label}${hint ? ` — ${hint}` : ''}`);
  if (!ok) problems += 1;
}

check('package.json', existsSync(resolve(root, 'package.json')), 'execute na raiz do repo');
check('node_modules', existsSync(resolve(root, 'node_modules')), 'se faltar: npm install');
check('.env', existsSync(resolve(root, '.env')), 'opcional para o painel; necessário para providers externos');
check('pasta Imagem Inicial', existsSync(initialImagePath));

if (existsSync(initialImagePath)) {
  const images = readdirSync(initialImagePath).filter(name => imageExtensions.test(name)).sort();
  if (images.length === 0) {
    console.log('INFO  Imagem Inicial: nenhuma imagem colocada ainda.');
  } else if (images.length === 1) {
    console.log(`OK    Imagem Inicial encontrada: ${images[0]}`);
  } else {
    console.log(`AVISO ${images.length} imagens encontradas; o sistema usará primeiro: ${images[0]}`);
  }
}

const git = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' });
if (git.status === 0) {
  console.log('INFO  Branch Git:', git.stdout.trim() || '(detached)');
}

console.log('');
console.log(problems === 0
  ? 'Sistema local pronto. Para ligar: npm run ligar'
  : 'Há itens para revisar acima. Depois execute: npm run ligar');
console.log('');
