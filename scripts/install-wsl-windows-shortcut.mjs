import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

if (!process.env.WSL_INTEROP && !process.env.WSL_DISTRO_NAME) {
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

const preferredDistro = process.env.WSL_DISTRO_NAME || '';
const shortcutName = 'Construction AI Studio.lnk';
const description = 'Ligar Construction AI Studio (WSL + backend + painel)';

const ps = [
  `$ErrorActionPreference = 'Stop'`,
  `$preferred = ${psLiteral(preferredDistro)}`,
  `$projectPath = ${psLiteral(root)}`,
  `$rawDistros = @(wsl.exe --list --quiet)`,
  `$distros = @($rawDistros | ForEach-Object { ($_ -replace [char]0, '').Trim() } | Where-Object { $_ })`,
  `if ($distros.Count -eq 0) { throw 'Nenhuma distribuição WSL registrada foi encontrada.' }`,
  `$selected = $null`,
  `foreach ($name in $distros) { & wsl.exe -d $name -- bash -lc "test -f '$projectPath/package.json'" 2>$null; if ($LASTEXITCODE -eq 0) { $selected = $name; break } }`,
  `if (-not $selected -and $preferred) { $selected = $distros | Where-Object { $_ -ieq $preferred } | Select-Object -First 1 }`,
  `if (-not $selected) { $selected = $distros | Where-Object { $_ -match 'Ubuntu' } | Select-Object -First 1 }`,
  `if (-not $selected) { $selected = $distros | Select-Object -First 1 }`,
  `& wsl.exe -d $selected -- bash -lc "test -f '$projectPath/package.json'" 2>$null`,
  `if ($LASTEXITCODE -ne 0) { throw "A distribuição WSL '$selected' foi encontrada, mas o projeto não existe em $projectPath." }`,
  `$desktop = [Environment]::GetFolderPath('Desktop')`,
  `$shortcutPath = Join-Path $desktop ${psLiteral(shortcutName)}`,
  `$shell = New-Object -ComObject WScript.Shell`,
  `$shortcut = $shell.CreateShortcut($shortcutPath)`,
  `$shortcut.TargetPath = "$env:SystemRoot\\System32\\cmd.exe"`,
  `$linuxCmd = "cd '$projectPath' && npm run ligar"`,
  `$shortcut.Arguments = '/k wsl.exe -d "' + $selected + '" -- bash -lic "' + $linuxCmd + '"'`,
  `$shortcut.WorkingDirectory = $desktop`,
  `$shortcut.Description = ${psLiteral(description)}`,
  `$shortcut.IconLocation = "$env:SystemRoot\\System32\\wsl.exe,0"`,
  `$shortcut.Save()`,
  `Write-Output ("DISTRO=" + $selected)`,
  `Write-Output ("ATALHO=" + $shortcutPath)`,
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
console.log(result.stdout.trim());
console.log('');
console.log('O instalador consultou as distribuições registradas no Windows e escolheu a que contém este projeto.');
console.log('O botão abre um terminal visível, liga o Construction AI e abre o navegador quando o painel estiver pronto.');
console.log('');
