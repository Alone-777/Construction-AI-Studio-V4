import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const SENSITIVE_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /^\.git(?:\/|$)/i,
  /^node_modules(?:\/|$)/i,
  /(?:^|\/)\.ssh(?:\/|$)/i,
  /(?:^|\/)(?:id_rsa|id_ed25519)(?:\.|$)/i,
  /\.(?:pem|key|p12|pfx)$/i,
  /(?:^|\/)\.npmrc$/i,
];

export function normalizeRelativePath(input = '.') {
  if (typeof input !== 'string' || input.includes('\0')) {
    throw new Error('Invalid path.');
  }
  const normalized = input.replaceAll('\\', '/').replace(/^\.\//, '');
  if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) {
    throw new Error('Path must stay inside the Construction AI Studio root.');
  }
  return normalized || '.';
}

export function isSensitivePath(input) {
  const rel = normalizeRelativePath(input);
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(rel));
}

export function assertReadablePath(input) {
  const rel = normalizeRelativePath(input);
  if (isSensitivePath(rel)) {
    throw new Error('Access to secret or internal paths is blocked.');
  }
  return rel;
}

export function assertWritablePath(input) {
  const rel = assertReadablePath(input);
  if (rel === '.firefly' || rel.startsWith('.firefly/')) {
    throw new Error('Direct writes to .firefly runtime state are blocked. Use deterministic project commands instead.');
  }
  return rel;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function resolveExistingPath(root, input, { allowSensitive = false } = {}) {
  const rel = allowSensitive ? normalizeRelativePath(input) : assertReadablePath(input);
  const absoluteRoot = await realpath(root);
  const candidate = path.resolve(absoluteRoot, rel);
  const resolved = await realpath(candidate);
  if (!isWithin(absoluteRoot, resolved)) {
    throw new Error('Resolved path escapes the Construction AI Studio root.');
  }
  return { root: absoluteRoot, rel, absolute: resolved };
}

export async function resolveWritePath(root, input) {
  const rel = assertWritablePath(input);
  const absoluteRoot = await realpath(root);
  const candidate = path.resolve(absoluteRoot, rel);
  if (!isWithin(absoluteRoot, candidate)) {
    throw new Error('Write path escapes the Construction AI Studio root.');
  }

  const parent = path.dirname(candidate);
  const resolvedParent = await realpath(parent);
  if (!isWithin(absoluteRoot, resolvedParent)) {
    throw new Error('Write parent escapes the Construction AI Studio root.');
  }

  try {
    const info = await lstat(candidate);
    if (info.isSymbolicLink()) {
      throw new Error('Writing through symlinks is blocked.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  return { root: absoluteRoot, rel, absolute: candidate };
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function secretValuesFromEnv(env = process.env) {
  return Object.entries(env)
    .filter(([name, value]) => /(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)/i.test(name) && typeof value === 'string' && value.length >= 8)
    .map(([, value]) => value)
    .sort((a, b) => b.length - a.length);
}

export function redactSecrets(text, env = process.env) {
  let output = String(text ?? '');
  for (const secret of secretValuesFromEnv(env)) {
    output = output.split(secret).join('[REDACTED]');
  }
  output = output.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]{8,}/gi, '$1[REDACTED]');
  return output;
}

export async function fileMeta(absolute) {
  const info = await stat(absolute);
  return {
    size: info.size,
    modifiedAt: info.mtime.toISOString(),
    isFile: info.isFile(),
    isDirectory: info.isDirectory(),
  };
}

export function buildNamedAction(action, args = {}) {
  switch (action) {
    case 'test':
      return { command: 'npm', argv: ['test'], timeoutMs: 240_000 };
    case 'build':
      return { command: 'npm', argv: ['run', 'build'], timeoutMs: 240_000 };
    case 'git_status':
      return { command: 'git', argv: ['status', '--short', '--branch'], timeoutMs: 30_000 };
    case 'git_diff_check':
      return { command: 'git', argv: ['diff', '--check'], timeoutMs: 30_000 };
    case 'git_diff': {
      const paths = (args.paths ?? []).map((item) => assertReadablePath(item));
      return { command: 'git', argv: ['diff', '--', ...paths], timeoutMs: 30_000 };
    }
    case 'git_log':
      return { command: 'git', argv: ['log', '--oneline', '-n', String(Math.min(Math.max(args.count ?? 10, 1), 50))], timeoutMs: 30_000 };
    case 'git_pull':
      return { command: 'git', argv: ['pull', '--ff-only'], timeoutMs: 120_000 };
    case 'git_push':
      return { command: 'git', argv: ['push', args.remote || 'origin', 'HEAD'], timeoutMs: 120_000 };
    case 'firefly_status':
      if (!args.workspace) throw new Error('workspace is required for firefly_status.');
      return { command: 'npm', argv: ['run', 'firefly:status', '--', args.workspace], timeoutMs: 60_000 };
    case 'firefly_prompt':
      if (!args.workspace || !args.jobId) throw new Error('workspace and jobId are required for firefly_prompt.');
      return { command: 'npm', argv: ['run', 'firefly:prompt', '--', args.workspace, args.jobId], timeoutMs: 60_000 };
    case 'firefly_complete':
      if (!args.workspace || !args.jobId) throw new Error('workspace and jobId are required for firefly_complete.');
      return { command: 'npm', argv: ['run', 'firefly:complete', '--', args.workspace, args.jobId], timeoutMs: 60_000 };
    default:
      throw new Error(`Unsupported named action: ${action}`);
  }
}

export async function runProcess(root, command, argv, { timeoutMs = 60_000, env = process.env } = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, argv, {
      cwd: root,
      env,
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;
    const MAX_CAPTURE = 2 * 1024 * 1024;

    const append = (current, chunk) => {
      if (current.length >= MAX_CAPTURE) return current;
      return (current + chunk.toString('utf8')).slice(0, MAX_CAPTURE);
    };

    child.stdout?.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk); });

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        timedOut: false,
        stdout: redactSecrets(stdout, env),
        stderr: redactSecrets(`${stderr}\n${error.message}`, env).trim(),
      });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !killedByTimeout,
        exitCode: code,
        signal,
        timedOut: killedByTimeout,
        stdout: redactSecrets(stdout, env),
        stderr: redactSecrets(stderr, env),
      });
    });
  });
}
