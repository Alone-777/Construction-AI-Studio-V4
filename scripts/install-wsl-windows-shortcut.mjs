import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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

function psLiteral(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}

const shortcutName = 'Construction AI Studio.lnk';
const description = 'Ligar Construction AI Studio pelo perfil Ubuntu do Windows Terminal';

const ps = [
  `$ErrorActionPreference = 'Stop'`,
  `$projectPath = ${psLiteral(root)}`,
  `$settingsCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Packages\\Microsoft.WindowsTerminal_8wekyb3d8bbwe\\LocalState\\settings.json'),
    (Join-Path $env:LOCALAPPDATA 'Packages\\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\\LocalState\\settings.json'),
    (Join-Path $env:LOCALAPPDATA 'Microsoft\\Windows Terminal\\settings.json')
  )`,
  `$settingsPath = $settingsCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1`,
  `if (-not $settingsPath) { throw 'Não encontrei o settings.json do Windows Terminal.' }`,
  `$settingsText = Get-Content -Raw -LiteralPath $settingsPath`,
  `try { $settings = $settingsText | ConvertFrom-Json } catch { throw "Não consegui ler as configurações do Windows Terminal: $($_.Exception.Message)" }`,
  `$profiles = @($settings.profiles.list)`,
  `if ($profiles.Count -eq 0) { throw 'Nenhum perfil foi encontrado no Windows Terminal.' }`,
  `$profile = $null`,
  `if ($profiles.Count -ge 4) {
      $candidate = $profiles[3]
      if ($candidate.name -match 'Ubuntu|WSL|Linux' -or $candidate.source -eq 'Windows.Terminal.Wsl') {
        $profile = $candidate
      }
    }`,
  `if (-not $profile) {
      $profile = $profiles | Where-Object {
        $_.name -match 'Ubuntu' -or $_.source -eq 'Windows.Terminal.Wsl'
      } | Select-Object -First 1
    }`,
  `if (-not $profile) { throw 'Não encontrei o perfil Ubuntu/WSL do Windows Terminal.' }`,
  `$profileName = [string]$profile.name`,
  `$wt = (Get-Command wt.exe -ErrorAction Stop).Source`,
  `$desktop = [Environment]::GetFolderPath('Desktop')`,
  `$shortcutPath = Join-Path $desktop ${psLiteral(shortcutName)}`,
  `$shell = New-Object -ComObject WScript.Shell`,
  `$shortcut = $shell.CreateShortcut($shortcutPath)`,
  `$shortcut.TargetPath = $wt`,
  `$linuxCommand = "cd '$projectPath' && npm run ligar"`,
  `$shortcut.Arguments = '-w new new-tab -p "' + $profileName + '" --appendCommandLine run bash -lic "' + $linuxCommand + '"'`,
  `$shortcut.WorkingDirectory = $desktop`,
  `$shortcut.Description = ${psLiteral(description)}`,
  `$shortcut.IconLocation = "$env:SystemRoot\\System32\\wsl.exe,0"`,
  `$shortcut.Save()`,
  `Write-Output ("PERFIL_WINDOWS_TERMINAL=" + $profileName)`,
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
  console.error('');
  console.error('NÃO FOI POSSÍVEL CRIAR O BOTÃO.');
  console.error((result.stderr || result.stdout || '').trim());
  console.error('');
  process.exit(result.status || 1);
}

console.log('');
console.log('BOTÃO INSTALADO COM SUCESSO');
console.log(result.stdout.trim());
console.log('');
console.log('O botão usa o perfil Ubuntu/WSL do Windows Terminal, a mesma rota usada pelo Ctrl+Shift+4.');
console.log('Para launchers Ubuntu legados, o comando é enviado no formato suportado: run <comando>.');
console.log('Ao abrir, ele entra no projeto, executa npm run ligar e o navegador é aberto quando o painel estiver pronto.');
console.log('');
