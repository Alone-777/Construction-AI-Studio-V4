import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createBridgeExecutor,
  safeRequestSummary,
  validateToken,
} from './core.mjs';

class MemoryAudit {
  constructor() {
    this.entries = [];
  }

  async write(entry) {
    this.entries.push(entry);
  }
}

async function withProject(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'construction-local-bridge-'));
  try {
    await mkdir(path.join(root, 'src'), { recursive: true });
    await mkdir(path.join(root, '.firefly'), { recursive: true });
    await writeFile(path.join(root, 'src', 'example.txt'), 'hello world\n', 'utf8');
    await writeFile(path.join(root, '.env'), 'SECRET=do-not-read\n', 'utf8');
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('validateToken accepts only strong URL-safe tokens', () => {
  assert.equal(validateToken('a'.repeat(24)), true);
  assert.equal(validateToken('abc'), false);
  assert.equal(validateToken('a'.repeat(23) + '!'), false);
});

test('safeRequestSummary never includes secrets or file contents', () => {
  const summary = safeRequestSummary({
    id: '1',
    op: 'write_file',
    path: 'src/example.txt',
    content: 'TOP-SECRET-CONTENT',
    token: 'TOP-SECRET-TOKEN',
    search: 'secret search',
    replace: 'secret replacement',
  });

  assert.equal(summary.id, '1');
  assert.equal(summary.op, 'write_file');
  assert.equal(summary.path, 'src/example.txt');
  assert.equal(summary.contentBytes, Buffer.byteLength('TOP-SECRET-CONTENT'));
  assert.equal(summary.searchLength, 'secret search'.length);
  assert.equal(summary.replaceLength, 'secret replacement'.length);
  assert.equal('content' in summary, false);
  assert.equal('token' in summary, false);
  assert.equal('search' in summary, false);
  assert.equal('replace' in summary, false);
});

test('read-only executor blocks secrets, arbitrary operations and writes', async () => {
  await withProject(async (root) => {
    const audit = new MemoryAudit();
    const executor = createBridgeExecutor({
      projectRoot: root,
      policy: { writeMode: 'readonly', allowPush: false },
      audit,
    });

    const read = await executor.execute({ id: 'r1', op: 'read_file', path: 'src/example.txt' });
    assert.equal(read.ok, true);
    assert.equal(read.result.content, 'hello world\n');

    const secret = await executor.execute({ id: 'r2', op: 'read_file', path: '.env' });
    assert.equal(secret.ok, false);
    assert.match(secret.error, /blocked/i);

    const shell = await executor.execute({ id: 'r3', op: 'shell', command: 'rm -rf /' });
    assert.equal(shell.ok, false);
    assert.match(shell.error, /Unsupported operation/);

    const write = await executor.execute({
      id: 'r4',
      op: 'write_file',
      path: 'src/new.txt',
      content: 'new',
    });
    assert.equal(write.ok, false);
    assert.match(write.error, /read-only/i);

    const firefly = await executor.execute({
      id: 'r5',
      op: 'write_file',
      path: '.firefly/state.json',
      content: '{}',
    });
    assert.equal(firefly.ok, false);

    assert.equal(audit.entries.length, 5);
  });
});

test('write mode requires stale-write protection for existing files', async () => {
  await withProject(async (root) => {
    const audit = new MemoryAudit();
    const executor = createBridgeExecutor({
      projectRoot: root,
      policy: { writeMode: 'allow', allowPush: false },
      audit,
    });

    const read = await executor.execute({ id: 'w1', op: 'read_file', path: 'src/example.txt' });
    assert.equal(read.ok, true);

    const stale = await executor.execute({
      id: 'w2',
      op: 'write_file',
      path: 'src/example.txt',
      content: 'changed\n',
      expectedSha256: '0'.repeat(64),
    });
    assert.equal(stale.ok, false);
    assert.match(stale.error, /changed since it was read/i);

    const write = await executor.execute({
      id: 'w3',
      op: 'write_file',
      path: 'src/example.txt',
      content: 'changed\n',
      expectedSha256: read.result.sha256,
    });
    assert.equal(write.ok, true);

    assert.equal(await readFile(path.join(root, 'src', 'example.txt'), 'utf8'), 'changed\n');
  });
});

test('supervisor snapshot bundles project state without enabling writes', async () => {
  await withProject(async (root) => {
    const executor = createBridgeExecutor({
      projectRoot: root,
      policy: { writeMode: 'readonly', allowPush: false },
      audit: new MemoryAudit(),
    });

    const snapshot = await executor.execute({
      id: 's1',
      op: 'supervisor_snapshot',
    });

    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.result.policy.writeMode, 'readonly');
    assert.deepEqual(snapshot.result.fireflyWorkspaces, []);
    assert.equal(snapshot.result.selectedWorkspace, null);
    assert.equal(snapshot.result.fireflyStatus, null);

    const unknown = await executor.execute({
      id: 's2',
      op: 'supervisor_snapshot',
      workspace: 'missing-workspace',
    });

    assert.equal(unknown.ok, false);
    assert.match(unknown.error, /Unknown Firefly workspace/i);
  });
});

test('git push remains separately disabled even in write mode', async () => {
  await withProject(async (root) => {
    const executor = createBridgeExecutor({
      projectRoot: root,
      policy: { writeMode: 'allow', allowPush: false },
      audit: new MemoryAudit(),
    });

    const response = await executor.execute({
      id: 'p1',
      op: 'run_action',
      action: 'git_push',
    });

    assert.equal(response.ok, false);
    assert.match(response.error, /git push is disabled/i);
  });
});
