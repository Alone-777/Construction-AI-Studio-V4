import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const home = homedir();
const packagePath = resolve(root, 'package.json');

if (process.platform !== 'linux') {
  console.error('Este instalador é destinado ao Ubuntu/Linux.');
  process.exit(1);
}
if (!existsSync(packagePath)) {
  console.error('Execute este comando na raiz do Construction AI Studio.');
  process.exit(1);
}

function shellQuote(value) {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

function desktopEscape(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

async function resolveDesktopDir() {
  const configPath = resolve(home, '.config/user-dirs.dirs');
  try {
    const content = await readFile(configPath, 'utf8');
    const line = content.split('\n').find(item => item.startsWith('XDG_DESKTOP_DIR='));
    if (line) {
      const raw = line.slice('XDG_DESKTOP_DIR='.length).trim().replace(/^"|"$/g, '');
      const expanded = raw.replace('$HOME', home);
      if (expanded) return expanded;
    }
  } catch {
    // Fall back to common Ubuntu locations.
  }
  for (const candidate of [resolve(home, 'Desktop'), resolve(home, 'Área de Trabalho')]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const binDir = resolve(home, '.local/bin');
const applicationsDir = resolve(home, '.local/share/applications');
await mkdir(binDir, { recursive: true });
await mkdir(applicationsDir, { recursive: true });

const launcherPath = resolve(binDir, 'construction-ai');
const launcher = `#!/usr/bin/env bash
set -e
cd ${shellQuote(root)}
exec npm run ligar
`;
await writeFile(launcherPath, launcher, 'utf8');
await chmod(launcherPath, 0o755);

const desktopEntry = `[Desktop Entry]
Type=Application
Name=Construction AI Studio
Comment=Ligar Construction AI Studio
Exec=bash -lc "cd ${desktopEscape(shellQuote(root))} && npm run ligar"
Terminal=true
Icon=utilities-terminal
Categories=Development;
StartupNotify=true
`;

const appDesktopPath = resolve(applicationsDir, 'construction-ai-studio.desktop');
await writeFile(appDesktopPath, desktopEntry, 'utf8');
await chmod(appDesktopPath, 0o755);

const desktopDir = await resolveDesktopDir();
let desktopShortcut;
if (desktopDir && existsSync(desktopDir)) {
  desktopShortcut = resolve(desktopDir, 'Construction AI Studio.desktop');
  await writeFile(desktopShortcut, desktopEntry, 'utf8');
  await chmod(desktopShortcut, 0o755);
}

console.log('');
console.log('ATALHO DO CONSTRUCTION AI INSTALADO');
console.log('Menu de aplicativos: Construction AI Studio');
console.log('Comando de terminal:', launcherPath);
if (desktopShortcut) console.log('Área de Trabalho:', desktopShortcut);
console.log('');
console.log('Daqui em diante:');
console.log('  1) Clique em Construction AI Studio; ou');
console.log('  2) No terminal, digite: construction-ai');
console.log('');
