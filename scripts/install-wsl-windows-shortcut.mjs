import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const distro = process.env.WSL_DISTRO_NAME;

if (!distro) {
  console.error('Este instalador deve ser executado dentro do WSL.');
  process.exit(1);
}
if (!existsSync(resolve(root, 'package.json'))) {
  console.error('Execute este comando na raiz do Construction AI Studio.');
  process.exit(1);
}

function psLiteral(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}

const linuxRoot = root.replaceAll("'", "'\\''");
const launchArgs = `/k wsl.exe -d "${distro}" bash -ic "cd '${linuxRoot}' && npm run ligar"`;
const shortcutName = 'Construction AI Studio.lnk';
const description = 'Ligar Construction AI Studio (WSL + backend + painel)';

const ps = [
  `$desktop = [Environment]::GetFolderPath('Desktop')`,
  `$shortcutPath = Join-Path $desktop ${psLiteral(shortcutName)}`,
  `$shell = New-Object -ComObject WScript.Shell`,
  `$shortcut = $shell.CreateShortcut($shortcutPath)`,
  `$shortcut.TargetPath = "$env:SystemRoot\\System32\\cmd.exe"`,
  `$shortcut.Arguments = ${psLiteral(launchArgs)}`,
  `$shortcut.WorkingDirectory = $desktop`,
  `$shortcut.Description = ${psLiteral(description)}`,
  `$shortcut.IconLocation = "$env:SystemRoot\\System32\\wsl.exe,0"`,
  `$shortcut.Save()`,
  `Write-Output $shortcutPath`,
].join('; ');

const result = spawnSync('powershell.exe', [
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-Command', ps,
], {
  cwd: root,
  encoding: 'utf8',
});

if (result.status !== 0) {
  console.error('Não foi possível criar o botão no Windows.');
  console.error((result.stderr || result.stdout || '').trim());
  process.exit(result.status || 1);
}

console.log('');
console.log('BOTÃO INSTALADO COM SUCESSO');
console.log('Atalho:', result.stdout.trim());
console.log('');
console.log('O botão abre um terminal visível do Windows e inicia o WSL em modo interativo.');
console.log('Se houver algum erro, a janela permanece aberta para diagnóstico.');
console.log('Quando o painel estiver pronto, o navegador do Windows será aberto automaticamente.');
console.log('');
