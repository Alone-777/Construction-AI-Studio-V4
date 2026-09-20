import { spawnSync } from 'node:child_process';

const script = process.env.WSL_DISTRO_NAME
  ? 'scripts/install-wsl-windows-shortcut.mjs'
  : 'scripts/install-ubuntu-launcher.mjs';

const result = spawnSync(process.execPath, [script], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
